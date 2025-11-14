// @ts-ignore - Deno resolves remote module imports at runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

// @ts-ignore - Deno global is provided by the Edge Functions runtime
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      status: 200,
      headers: corsHeaders
    });
  }

  try {
    const body = await req.json();
    const {
      reportId,
      accountId,
      userId,
      dateFrom,
      dateTo,
      dimensionFilters = {},
      visibleDimensionIds = [],
      limit = 50000,
      offset = 0,
    } = body || {};

    if (!reportId) {
      return new Response(
        JSON.stringify({ error: 'reportId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    // @ts-ignore - Deno env is available in the Edge Functions runtime
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    // @ts-ignore - Deno env is available in the Edge Functions runtime
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Load dimensions (account > custom > global)
    const { data: dimensions, error: dimErr } = await supabase
      .from('dimensions')
      .select('id, name, type, scope, account_id, report_id')
      .or(
        `and(scope.eq.account,account_id.eq.${accountId}),
         and(scope.eq.custom,user_id.eq.${userId}),
         scope.eq.global`
      );

    if (dimErr) {
      throw dimErr;
    }

    const dateDimensions = (dimensions || []).filter((d: any) => d.type === 'date');

    // Fetch dimension_data
    let query = supabase
      .from('dimension_data')
      .select('dimension_values, row_number, data_source_id')
      .eq('report_id', reportId)
      .order('row_number', { ascending: true });

    // Apply range (offset/limit)
    if (typeof offset === 'number' && typeof limit === 'number') {
      query = query.range(offset, Math.max(offset, 0) + Math.max(limit, 1) - 1);
    }

    const { data: rawRows, error: rowsErr } = await query;
    if (rowsErr) {
      throw rowsErr;
    }

    const rows = rawRows || [];

    // Detect which date dimension actually appears in data
    let dateDimInUse: { id: string; name: string } | null = null;
    for (const d of dateDimensions) {
      const found = rows.some((r: any) => {
        const dv = r.dimension_values || {};
        return dv[d.id] !== undefined && dv[d.id] !== null && dv[d.id] !== '';
      });
      if (found) {
        dateDimInUse = { id: d.id, name: d.name };
        break;
      }
    }

    // Apply date filter (inclusive end)
    let filteredData = rows;
    if (dateDimInUse && (dateFrom || dateTo)) {
      const fromDate = dateFrom ? new Date(dateFrom) : null;
      const toDate = dateTo ? new Date(dateTo) : null;
      const adjustedToDate = toDate
        ? new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1)
        : null;

      filteredData = filteredData.filter((row: any) => {
        const dv = row.dimension_values || {};
        const val = dv[dateDimInUse!.id];
        if (!val) return true; // keep rows without date
        const rowDate = new Date(String(val));
        if (fromDate && rowDate < fromDate) return false;
        if (adjustedToDate && rowDate >= adjustedToDate) return false;
        return true;
      });
    }

    // Normalize dimensionFilters to arrays and apply filtering by dimension IDs
    const normalizedFilters: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(dimensionFilters || {})) {
      if (Array.isArray(v)) normalizedFilters[k] = v.map((x) => String(x));
      else if (v !== undefined && v !== null) normalizedFilters[k] = [String(v)];
    }

    if (Object.keys(normalizedFilters).length > 0) {
      filteredData = filteredData.filter((row: any) => {
        const dv = row.dimension_values || {};
        for (const [dimId, values] of Object.entries(normalizedFilters)) {
          if (!values || values.length === 0) continue;
          const rowVal = dv[dimId];
          if (rowVal === undefined || rowVal === null) return false;
          const rowStr = String(rowVal);
          // Must match one of the values exactly (case-sensitive)
          if (!values.some((v) => rowStr === v)) return false;
        }
        return true;
      });
    }

    // Build response: keep dimension_values keyed by IDs to match frontend expectations
    const data = filteredData.map((row: any, i: number) => ({
      id: `row-${row.row_number ?? i + 1}`,
      dimension_values: row.dimension_values || {},
      row_number: row.row_number ?? i + 1,
      data_source_id: row.data_source_id || null,
    }));

    const total = filteredData.length;

    const response = {
      data,
      total,
      totalRows: total,
      totalCount: total, // keep for compatibility
      hasMore: false,
      meta: {
        dateDimensionId: dateDimInUse?.id || null,
      },
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[GET-PERFORMANCE-DATA] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const details = error instanceof Error ? error.stack : undefined;

    return new Response(JSON.stringify({ error: message, details }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});