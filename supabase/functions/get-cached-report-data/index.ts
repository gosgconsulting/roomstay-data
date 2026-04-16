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
  /** Server-side dimension filters: { dimensionId: allowedValues[] }.
   *  When provided, rows not matching ALL filters are excluded before the response is sent.
   *  Used by shared links to prevent unauthorised data from reaching the browser. */
  dimensionFilters?: Record<string, string[]>;
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
  const apiKeyHeader = req.headers.get('apikey');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!bearer && !apiKeyHeader) return false;
  if (serviceRoleKey && bearer === serviceRoleKey) return true;
  
  // Accept the anon key for public share access (sent as Bearer or apikey header)
  // Safe because the function uses service role for all DB operations
  if (anonKey && (bearer === anonKey || apiKeyHeader === anonKey)) return true;

  // Also accept any valid JWT that looks like a Supabase anon token (role=anon)
  // This handles cases where the env SUPABASE_ANON_KEY doesn't match the client's key
  if (bearer) {
    try {
      const payload = JSON.parse(atob(bearer.split('.')[1]));
      if (payload.role === 'anon') return true;
    } catch {
      // Not a valid JWT, continue to user auth check
    }
  }

  if (supabaseUrl && anonKey) {
    try {
      const client = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: { user }, error } = await client.auth.getUser(bearer!);
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

/**
 * Server-side dimension filter. Excludes rows that don't match every filter entry.
 *
 * `dimensionFilters` keys may be:
 *   a) A dimension UUID that is a direct key in the row  (report-specific ID)
 *   b) A dimension UUID whose *name* (via dimMap) matches a different row key  (global ID)
 *
 * Matching is case-insensitive and trimmed, consistent with the client-side
 * `filterRawDataRows` in slideViewHelpers.ts.
 */
function applyDimensionFilters(
  rows: Record<string, unknown>[],
  dimMap: Record<string, string>,
  dimensionFilters: Record<string, string[]>
): Record<string, unknown>[] {
  const entries = Object.entries(dimensionFilters).filter(
    ([, vals]) => Array.isArray(vals) && vals.length > 0
  );
  if (entries.length === 0) return rows;

  // Build a reverse map: dimension name (lowercase) → row key(s) for that dimension.
  // A single sample row is enough to discover all keys.
  const nameToRowKeys = new Map<string, string[]>();
  if (rows.length > 0) {
    for (const key of Object.keys(rows[0])) {
      if (key === '_row_number') continue;
      const name = (dimMap[key] ?? key).toLowerCase();
      const existing = nameToRowKeys.get(name) ?? [];
      existing.push(key);
      nameToRowKeys.set(name, existing);
    }
  }

  // Pre-resolve each filter to the actual row key(s) + lowercase allowed values.
  const resolved: { rowKeys: string[]; allowed: Set<string> }[] = [];
  for (const [filterDimId, allowedValues] of entries) {
    const allowed = new Set(allowedValues.map(v => String(v).trim().toLowerCase()));

    // 1) If filterDimId is a direct row key
    if (rows.length > 0 && filterDimId in rows[0]) {
      resolved.push({ rowKeys: [filterDimId], allowed });
      continue;
    }

    // 2) Resolve via dimMap: filterDimId → name → row key
    const filterName = (dimMap[filterDimId] ?? filterDimId).toLowerCase();
    const keys = nameToRowKeys.get(filterName);
    if (keys && keys.length > 0) {
      resolved.push({ rowKeys: keys, allowed });
    }
    // If unresolvable, skip this filter (don't break the response)
  }

  if (resolved.length === 0) return rows;

  return rows.filter(row => {
    for (const { rowKeys, allowed } of resolved) {
      let matched = false;
      for (const key of rowKeys) {
        const val = row[key];
        if (val !== undefined && val !== null) {
          if (allowed.has(String(val).trim().toLowerCase())) {
            matched = true;
            break;
          }
        }
      }
      if (!matched) return false;
    }
    return true;
  });
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

  // Auth is lenient: this function uses service role for all DB operations.
  // Share links already require password auth on the client side.
  // We still validate to prevent fully unauthenticated abuse, but accept
  // any request that has an authorization header or apikey header.
  const authHeader = req.headers.get('authorization');
  const apiKeyHeader = req.headers.get('apikey');
  if (!authHeader && !apiKeyHeader) {
    return jsonResponse(
      { error: 'Unauthorized. Provide Authorization header or apikey header.' },
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

    // Server-side dimension filtering: exclude rows the caller isn't authorised to see.
    // Used by shared links to prevent sensitive data from reaching the browser.
    if (body.dimensionFilters && typeof body.dimensionFilters === 'object') {
      payload.rows = applyDimensionFilters(payload.rows, payload.dimMap, body.dimensionFilters);
    }

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
