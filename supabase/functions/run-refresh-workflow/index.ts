/**
 * Run Refresh Workflow Edge Function
 *
 * Orchestrates: optional clear (dimension_data) → resync each data source via resync-data-source (with retries).
 * Single entry point for frontend and MCP. Legacy refresh-slide-report branch removed (NS-1); Data Studio
 * reads from dimension_data only; no slide_report_* cache refresh.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const getCorsHeaders = (req?: Request) => {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
  };
  const requested = req?.headers.get('Access-Control-Request-Headers');
  headers['Access-Control-Allow-Headers'] = requested || 'authorization, x-client-info, apikey, content-type';
  return headers;
};

async function validateAuth(req: Request): Promise<boolean> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authHeader = req.headers.get('authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!bearer) return false;
  if (serviceRoleKey && bearer === serviceRoleKey) return true;

  if (supabaseUrl && anonKey) {
    try {
      const client = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: { user }, error } = await client.auth.getUser(bearer);
      if (!error && user) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

function jsonResponse(data: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

async function invokeEdgeFunction(
  supabaseUrl: string,
  serviceRoleKey: string,
  name: string,
  body: Record<string, unknown>,
  retries: number = 3
): Promise<{ data: unknown; ok: boolean; status: number }> {
  const url = `${supabaseUrl}/functions/v1/${name}`;
  let lastError: Error | null = null;
  let lastStatus = 0;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) return { data, ok: true, status: res.status };
      lastStatus = res.status;
      lastError = new Error((data?.error as string) || res.statusText);
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }
  return { data: null, ok: false, status: lastStatus };
}

const RESYNC_RETRIES = 3;
const CONCURRENCY = 3;

async function runInBatches<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: getCorsHeaders(req) });
  }

  if (!(await validateAuth(req))) {
    return jsonResponse({ error: 'Unauthorized. Provide Authorization: Bearer <jwt> or service role key.' }, 401, cors);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500, cors);
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, cors);
  }

  const accountId = body.accountId as string | undefined;
  const reportId = body.reportId as string | undefined;
  const slideReportId = body.slideReportId as string | undefined;
  const clearFirst = body.clearFirst === true;
  const skipResync = body.skipResync === true;
  const skipRefresh = body.skipRefresh === true;
  const refreshMode = (body.refreshMode === 'recent' ? 'recent' : 'full') as 'full' | 'recent';

  if (!accountId) {
    return jsonResponse({ error: 'accountId is required' }, 400, cors);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  let cleared = false;
  const resyncErrors: Array<{ dataSourceId: string; error: string }> = [];
  let resyncedCount = 0;
  let totalRowsProcessed = 0;

  try {
    let reportIds: string[] = [];
    if (slideReportId) {
      const { data: slideReport, error: slideErr } = await supabase
        .from('slide_reports')
        .select('report_ids')
        .eq('id', slideReportId)
        .single();
      if (slideErr || !slideReport?.report_ids) {
        return jsonResponse({
          success: false,
          error: slideErr ? slideErr.message : 'Slide report not found or missing report_ids',
          cleared,
          resynced: 0,
          resyncErrors: [],
        }, slideErr ? 500 : 404, cors);
      }
      const ids = slideReport.report_ids as Record<string, string>;
      reportIds = Object.values(ids).filter(Boolean);
    } else if (reportId) {
      reportIds = [reportId];
    } else {
      const { data: reports, error: reportsErr } = await supabase
        .from('reports')
        .select('id')
        .eq('account_id', accountId);
      if (reportsErr) {
        return jsonResponse({
          success: false,
          error: 'Failed to list reports: ' + reportsErr.message,
          cleared,
          resynced: 0,
          resyncErrors: [],
        }, 500, cors);
      }
      reportIds = (reports || []).map((r: { id: string }) => r.id);
    }

    if (reportIds.length === 0 && !slideReportId) {
      return jsonResponse({
        success: true,
        cleared,
        resynced: 0,
        resyncErrors: [],
        message: 'No reports found for account',
      }, 200, cors);
    }

    // Canonical "clearFirst": clear only the canonical table (dimension_data) for the target report(s).
    // This replaces legacy clear-and-resync (which also touched sheet_data + slide_report_* caches).
    if (clearFirst && reportIds.length > 0) {
      const { error: clearErr } = await supabase
        .from('dimension_data')
        .delete()
        .in('report_id', reportIds);

      if (clearErr) {
        return jsonResponse({
          success: false,
          error: 'Failed to clear dimension_data: ' + clearErr.message,
          cleared: false,
          resynced: 0,
          resyncErrors: [],
        }, 500, cors);
      }

      cleared = true;
    }

    let dataSources: Array<{ id: string }> = [];
    if (reportIds.length > 0) {
      const { data: dsList, error: dsErr } = await supabase
        .from('data_sources')
        .select('id')
        .in('report_id', reportIds);
      if (dsErr) {
        return jsonResponse({
          success: false,
          error: 'Failed to list data sources: ' + dsErr.message,
          cleared,
          resynced: 0,
          resyncErrors: [],
        }, 500, cors);
      }
      dataSources = dsList || [];
    }

    if (!skipResync && dataSources.length > 0) {
      const results = await runInBatches(dataSources, CONCURRENCY, async (ds) => {
        const { data, ok } = await invokeEdgeFunction(
          supabaseUrl,
          serviceRoleKey,
          'resync-data-source',
          { dataSourceId: ds.id, refreshMode },
          RESYNC_RETRIES
        );
        const resyncData = data as { success?: boolean; error?: string; rowsProcessed?: number } | null;
        if (ok && resyncData?.success !== false) {
          return { id: ds.id, success: true as const, rowsProcessed: resyncData?.rowsProcessed ?? 0 };
        }
        return {
          id: ds.id,
          success: false as const,
          rowsProcessed: 0,
          error: resyncData?.error || 'resync failed',
        };
      });

      for (const r of results) {
        if (r.success) {
          resyncedCount++;
          totalRowsProcessed += r.rowsProcessed;
        } else {
          resyncErrors.push({ dataSourceId: r.id, error: r.error });
        }
      }
    }

    return jsonResponse({
      success: true,
      cleared,
      resynced: resyncedCount,
      rowsProcessed: totalRowsProcessed,
      resyncErrors: resyncErrors.length > 0 ? resyncErrors : undefined,
    }, 200, cors);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return jsonResponse({
      success: false,
      error: message,
      cleared,
      resynced: resyncedCount,
      rowsProcessed: totalRowsProcessed,
      resyncErrors,
    }, 500, cors);
  }
});
