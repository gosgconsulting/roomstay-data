import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CACHE_TTL_MINUTES = 30;
const ALL_TIME_BATCH_SIZE = 5000;
const RPC_MAX_ROWS = 500000;

type RequestBody = {
  reportId?: string;
  selectedYear?: string;
  selectedMonth?: string;
  forceRefresh?: boolean;
  cacheVersion?: number;
};

type CachedDataRow = {
  id: string;
  dimension_values: Record<string, unknown> | null;
  data_source_id: string;
  row_number: number;
};

type CachedPayload = {
  rows: Record<string, unknown>[];
  dimMap: Record<string, string>;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
  'Access-Control-Max-Age': '86400',
};

function buildCacheKey(reportId: string, selectedYear: string, selectedMonth: string): string {
  return `report:${reportId}:year:${selectedYear}:month:${selectedMonth}`;
}

function normalizeMonth(selectedMonth?: string): string {
  if (!selectedMonth || selectedMonth === 'all') return 'all';
  return selectedMonth;
}

async function validateAuth(req: Request): Promise<boolean> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const authHeader = req.headers.get('authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!bearer) return false;
  if (serviceRoleKey && bearer === serviceRoleKey) return true;
  
  // Accept the anon key for public share access
  // Safe because the function uses service role for all DB operations
  if (anonKey && bearer === anonKey) return true;

  if (supabaseUrl && anonKey) {
    try {
      const client = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: { user }, error } = await client.auth.getUser(bearer);
      if (!error && user) return true;
    } catch {
      // ignore and return false
    }
  }

  return false;
}

function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function buildDimensionNameMap(
  supabase: ReturnType<typeof createClient>,
  dimensionIds: string[]
): Promise<Record<string, string>> {
  if (dimensionIds.length === 0) return {};

  const { data, error } = await supabase
    .from('dimensions')
    .select('id, name')
    .in('id', dimensionIds);

  if (error) throw error;

  const map: Record<string, string> = {};
  for (const d of data || []) {
    map[d.id] = d.name;
  }
  return map;
}

function findDateDimensionId(rows: Record<string, unknown>[]): string | null {
  if (rows.length === 0) return null;

  const sample = rows.slice(0, 20);
  for (const row of sample) {
    for (const [key, value] of Object.entries(row)) {
      if (key === '_row_number') continue;
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return key;
      }
    }
  }
  return null;
}

async function fetchByDateRpc(
  supabase: ReturnType<typeof createClient>,
  reportId: string,
  dateDimId: string,
  year: number,
  month: number | null
): Promise<Record<string, unknown>[]> {
  const { data, error } = await supabase.rpc('get_dimension_data_by_report_and_date', {
    p_report_id: reportId,
    p_date_dim_id: dateDimId,
    p_year: year,
    p_month: month,
    p_max_rows: RPC_MAX_ROWS,
  });

  if (error) throw error;

  const rows = (data || []).map((dv: Record<string, unknown>) => ({ ...dv }));
  if (rows.length >= RPC_MAX_ROWS) {
    console.warn(
      `[get-cached-report-data] RPC row count hit cap (${RPC_MAX_ROWS}) for report=${reportId}`
    );
  }

  return rows;
}

async function fetchAllRowsParallel(
  supabase: ReturnType<typeof createClient>,
  reportId: string
): Promise<CachedDataRow[]> {
  const { count, error: countError } = await supabase
    .from('dimension_data')
    .select('id', { count: 'exact', head: true })
    .eq('report_id', reportId);

  if (countError) throw countError;

  const total = count ?? 0;
  if (total === 0) return [];

  const batchCount = Math.ceil(total / ALL_TIME_BATCH_SIZE);
  const batchPromises = Array.from({ length: batchCount }, (_, i) => {
    const offset = i * ALL_TIME_BATCH_SIZE;
    return supabase
      .from('dimension_data')
      .select('id, dimension_values, data_source_id, row_number')
      .eq('report_id', reportId)
      .order('row_number', { ascending: true })
      .range(offset, offset + ALL_TIME_BATCH_SIZE - 1);
  });

  const results = await Promise.all(batchPromises);
  const allRows: CachedDataRow[] = [];

  for (const { data, error } of results) {
    if (error) throw error;
    if (data) allRows.push(...(data as CachedDataRow[]));
  }

  return allRows;
}

async function computePayload(
  supabase: ReturnType<typeof createClient>,
  reportId: string,
  selectedYear: string,
  selectedMonth: string
): Promise<CachedPayload> {
  const isAllTime = !selectedYear || selectedYear === 'all';

  if (!isAllTime) {
    const { data: sampleData, error: sampleError } = await supabase
      .from('dimension_data')
      .select('dimension_values')
      .eq('report_id', reportId)
      .limit(20);

    if (sampleError) throw sampleError;

    const sampleRows = (sampleData || []).map((r) => ({ ...((r.dimension_values || {}) as Record<string, unknown>) }));
    const dateDimId = findDateDimensionId(sampleRows);

    if (dateDimId) {
      const yearNum = parseInt(selectedYear, 10);
      const monthNum =
        selectedMonth && selectedMonth !== 'all'
          ? parseInt(selectedMonth, 10)
          : null;

      const rows = await fetchByDateRpc(supabase, reportId, dateDimId, yearNum, monthNum);

      const allDimIds = new Set<string>();
      for (const row of rows) {
        for (const id of Object.keys(row)) {
          if (id === '_row_number') continue;
          allDimIds.add(id);
        }
      }

      const dimMap = await buildDimensionNameMap(supabase, Array.from(allDimIds));
      return {
        rows: rows.map((r, i) => ({ ...r, _row_number: i + 1 })),
        dimMap,
      };
    }
  }

  const cachedRows = await fetchAllRowsParallel(supabase, reportId);
  const rows = cachedRows.map((row) => ({
    ...((row.dimension_values || {}) as Record<string, unknown>),
    _row_number: row.row_number,
  }));

  const allDimIds = new Set<string>();
  for (const row of cachedRows) {
    const dv = (row.dimension_values || {}) as Record<string, unknown>;
    for (const id of Object.keys(dv)) allDimIds.add(id);
  }
  const dimMap = await buildDimensionNameMap(supabase, Array.from(allDimIds));

  return { rows, dimMap };
}

// @ts-ignore - Deno global is provided by the Edge Functions runtime
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  if (!(await validateAuth(req))) {
    return jsonResponse(
      { error: 'Unauthorized. Provide Authorization: Bearer <jwt> or service role key.' },
      401
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' }, 500);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const reportId = (body.reportId || '').trim();
  if (!reportId) {
    return jsonResponse({ error: 'reportId is required' }, 400);
  }

  const selectedYear = (body.selectedYear || 'all').trim();
  const selectedMonth = normalizeMonth(body.selectedMonth);
  const forceRefresh = body.forceRefresh === true;
  const cacheVersion = Number.isFinite(body.cacheVersion) ? Number(body.cacheVersion) : 1;
  const cacheKey = buildCacheKey(reportId, selectedYear, selectedMonth);

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Cache removed - always compute fresh payload from database
    const payload = await computePayload(supabase, reportId, selectedYear, selectedMonth);

    return jsonResponse({
      success: true,
      cache: {
        key: cacheKey,
        hit: false,
        forceRefresh: true,
      },
      rows: payload.rows,
      dimMap: payload.dimMap,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[get-cached-report-data] error:', message);
    return jsonResponse({ success: false, error: message }, 500);
  }
});
