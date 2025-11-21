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
      reportIds,
      accountId,
      userId,
      dateFrom,
      dateTo,
      dimensionFilters = {},
      visibleDimensionIds = [],
      limit = 50000,
      offset = 0,
    } = body || {};

    // Support both single reportId and multiple reportIds
    if (!reportId && (!reportIds || !reportIds.length)) {
      return new Response(
        JSON.stringify({ 
          error: 'reportId or reportIds is required',
          data: [],
          total: 0,
          totalRows: 0,
          totalCount: 0,
          hasMore: false
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    // @ts-ignore - Deno env is available in the Edge Functions runtime
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    // @ts-ignore - Deno env is available in the Edge Functions runtime
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Load dimensions (account > custom > global) using separate queries to avoid SQL injection
    let allDimensions: any[] = [];
    
    try {
      // 1. Load account-specific dimensions if accountId is provided
      if (accountId) {
        const { data: accountDimensions, error: accountError } = await supabase
          .from('dimensions')
          .select('id, name, type, scope, account_id, report_id')
          .eq('scope', 'account')
          .eq('account_id', accountId);
        
        if (accountError) {
          console.error('[GET-PERFORMANCE-DATA] Error loading account dimensions:', accountError);
        } else {
          allDimensions = [...allDimensions, ...(accountDimensions || [])];
          console.log(`[GET-PERFORMANCE-DATA] Loaded ${accountDimensions?.length || 0} account dimensions`);
        }
      }
      
      // 2. Load custom dimensions if userId is provided
      if (userId) {
        const { data: customDimensions, error: customError } = await supabase
          .from('dimensions')
          .select('id, name, type, scope, account_id, report_id')
          .eq('scope', 'custom')
          .eq('user_id', userId);
        
        if (customError) {
          console.error('[GET-PERFORMANCE-DATA] Error loading custom dimensions:', customError);
        } else {
          allDimensions = [...allDimensions, ...(customDimensions || [])];
          console.log(`[GET-PERFORMANCE-DATA] Loaded ${customDimensions?.length || 0} custom dimensions`);
        }
      }
      
      // 3. Load global dimensions (always)
      const { data: globalDimensions, error: globalError } = await supabase
        .from('dimensions')
        .select('id, name, type, scope, account_id, report_id')
        .eq('scope', 'global');
      
      if (globalError) {
        console.error('[GET-PERFORMANCE-DATA] Error loading global dimensions:', globalError);
      } else {
        allDimensions = [...allDimensions, ...(globalDimensions || [])];
        console.log(`[GET-PERFORMANCE-DATA] Loaded ${globalDimensions?.length || 0} global dimensions`);
      }
      
      // 4. Load report-specific dimensions if reportId is provided
      if (reportId) {
        const { data: reportDimensions, error: reportError } = await supabase
          .from('dimensions')
          .select('id, name, type, scope, account_id, report_id')
          .eq('report_id', reportId);
        
        if (reportError) {
          console.error('[GET-PERFORMANCE-DATA] Error loading report dimensions:', reportError);
        } else {
          // Add any report dimensions that aren't already in the list
          const existingIds = new Set(allDimensions.map(d => d.id));
          const newReportDimensions = (reportDimensions || []).filter(d => !existingIds.has(d.id));
          
          allDimensions = [...allDimensions, ...newReportDimensions];
          console.log(`[GET-PERFORMANCE-DATA] Loaded ${newReportDimensions.length} additional report dimensions`);
        }
      }
      
      // If we have multiple reportIds, load dimensions for all of them
      if (reportIds && reportIds.length > 0) {
        const { data: multiReportDimensions, error: multiReportError } = await supabase
          .from('dimensions')
          .select('id, name, type, scope, account_id, report_id')
          .in('report_id', reportIds);
        
        if (multiReportError) {
          console.error('[GET-PERFORMANCE-DATA] Error loading multi-report dimensions:', multiReportError);
        } else {
          // Add any multi-report dimensions that aren't already in the list
          const existingIds = new Set(allDimensions.map(d => d.id));
          const newMultiReportDimensions = (multiReportDimensions || []).filter(d => !existingIds.has(d.id));
          
          allDimensions = [...allDimensions, ...newMultiReportDimensions];
          console.log(`[GET-PERFORMANCE-DATA] Loaded ${newMultiReportDimensions.length} additional multi-report dimensions`);
        }
      }
      
      console.log(`[GET-PERFORMANCE-DATA] Total dimensions loaded: ${allDimensions.length}`);
      
      if (allDimensions.length === 0) {
        console.error('[GET-PERFORMANCE-DATA] No dimensions found for the given parameters');
        return new Response(
          JSON.stringify({ 
            error: 'No dimensions found for the given parameters',
            data: [],
            total: 0,
            totalRows: 0,
            totalCount: 0,
            hasMore: false
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (dimError) {
      console.error('[GET-PERFORMANCE-DATA] Error in dimension loading process:', dimError);
      return new Response(
        JSON.stringify({ 
          error: 'Error loading dimensions',
          details: dimError instanceof Error ? dimError.message : String(dimError),
          data: [],
          total: 0,
          totalRows: 0,
          totalCount: 0,
          hasMore: false
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const dateDimensions = allDimensions.filter((d: any) => d.type === 'date');

    // Fetch dimension_data
    let query = supabase
      .from('dimension_data')
      .select('dimension_values, row_number, data_source_id');
    
    // Handle single report or multiple reports
    if (reportId) {
      query = query.eq('report_id', reportId);
    } else if (reportIds && reportIds.length) {
      query = query.in('report_id', reportIds);
    }
    
    query = query.order('row_number', { ascending: true });

    // Apply range (offset/limit)
    if (typeof offset === 'number' && typeof limit === 'number') {
      query = query.range(offset, Math.max(offset, 0) + Math.max(limit, 1) - 1);
    }

    const { data: rawRows, error: rowsErr } = await query;
    if (rowsErr) {
      console.error('[GET-PERFORMANCE-DATA] Error fetching rows:', rowsErr);
      // Return empty data instead of throwing error
      return new Response(
        JSON.stringify({ 
          error: 'Error fetching data rows',
          details: rowsErr.message,
          data: [],
          total: 0,
          totalRows: 0,
          totalCount: 0,
          hasMore: false
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rows = rawRows || [];
    console.log(`[GET-PERFORMANCE-DATA] Fetched ${rows.length} rows`);

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
    console.log(`[GET-PERFORMANCE-DATA] Returning ${total} filtered rows`);

    const response = {
      data,
      total,
      totalRows: total,
      totalCount: total, // keep for compatibility
      hasMore: false,
      meta: {
        dateDimensionId: dateDimInUse?.id || null,
        dimensionsCount: allDimensions.length,
      },
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[GET-PERFORMANCE-DATA] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const details = error instanceof Error ? error.stack : undefined;

    // Return a 200 response with error information instead of 500
    return new Response(JSON.stringify({ 
      error: message, 
      details,
      data: [],
      total: 0,
      totalRows: 0,
      totalCount: 0,
      hasMore: false
    }), {
      status: 200, // Changed from 500 to 200
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});