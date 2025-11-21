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

    console.log('[GET-PERFORMANCE-DATA] Request received:', {
      reportId,
      reportIds: reportIds?.length || 0,
      accountId,
      userId,
      dateFrom,
      dateTo,
      dimensionFiltersCount: Object.keys(dimensionFilters).length,
      limit,
      offset
    });

    // Enhanced validation
    if (!reportId && (!reportIds || !reportIds.length)) {
      console.error('[GET-PERFORMANCE-DATA] Missing report ID(s)');
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

    // Initialize Supabase client with enhanced error handling
    let supabase;
    try {
      // @ts-ignore - Deno env is available in the Edge Functions runtime
      const supabaseUrl = Deno.env.get('SUPABASE_URL');
      // @ts-ignore - Deno env is available in the Edge Functions runtime
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      
      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Missing Supabase configuration');
      }
      
      supabase = createClient(supabaseUrl, supabaseKey);
    } catch (clientError) {
      console.error('[GET-PERFORMANCE-DATA] Failed to initialize Supabase client:', clientError);
      return new Response(
        JSON.stringify({ 
          error: 'Database connection failed',
          data: [],
          total: 0,
          totalRows: 0,
          totalCount: 0,
          hasMore: false
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Enhanced dimension loading with better error handling
    let allDimensions: any[] = [];
    
    try {
      console.log('[GET-PERFORMANCE-DATA] Loading dimensions...');
      
      // Load dimensions with multiple strategies
      const dimensionQueries = [];
      
      // 1. Account dimensions
      if (accountId) {
        dimensionQueries.push(
          supabase
            .from('dimensions')
            .select('id, name, type, scope, account_id, report_id')
            .eq('scope', 'account')
            .eq('account_id', accountId)
        );
      }
      
      // 2. Global dimensions
      dimensionQueries.push(
        supabase
          .from('dimensions')
          .select('id, name, type, scope, account_id, report_id')
          .eq('scope', 'global')
      );
      
      // 3. Custom dimensions
      if (userId) {
        dimensionQueries.push(
          supabase
            .from('dimensions')
            .select('id, name, type, scope, account_id, report_id')
            .eq('scope', 'custom')
            .eq('user_id', userId)
        );
      }
      
      // 4. Report-specific dimensions
      const targetReportIds = reportId ? [reportId] : (reportIds || []);
      if (targetReportIds.length > 0) {
        dimensionQueries.push(
          supabase
            .from('dimensions')
            .select('id, name, type, scope, account_id, report_id')
            .in('report_id', targetReportIds)
        );
      }

      // Execute all dimension queries
      const dimensionResults = await Promise.allSettled(dimensionQueries);
      
      dimensionResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const { data, error } = result.value;
          if (error) {
            console.warn(`[GET-PERFORMANCE-DATA] Dimension query ${index} error:`, error);
          } else if (data) {
            allDimensions = [...allDimensions, ...data];
          }
        } else {
          console.warn(`[GET-PERFORMANCE-DATA] Dimension query ${index} failed:`, result.reason);
        }
      });

      // Deduplicate dimensions by ID
      const seenIds = new Set();
      allDimensions = allDimensions.filter(dim => {
        if (seenIds.has(dim.id)) return false;
        seenIds.add(dim.id);
        return true;
      });
      
      console.log(`[GET-PERFORMANCE-DATA] Total unique dimensions loaded: ${allDimensions.length}`);
      
      if (allDimensions.length === 0) {
        console.error('[GET-PERFORMANCE-DATA] No dimensions found');
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
      console.error('[GET-PERFORMANCE-DATA] Error loading dimensions:', dimError);
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

    // Enhanced data fetching with better error handling
    try {
      console.log('[GET-PERFORMANCE-DATA] Fetching dimension data...');
      
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

      // Apply range with validation
      if (typeof offset === 'number' && typeof limit === 'number') {
        const safeOffset = Math.max(0, offset);
        const safeLimit = Math.max(1, Math.min(limit, 100000)); // Cap at 100k rows
        query = query.range(safeOffset, safeOffset + safeLimit - 1);
      }

      const { data: rawRows, error: rowsErr } = await query;
      
      if (rowsErr) {
        console.error('[GET-PERFORMANCE-DATA] Error fetching rows:', rowsErr);
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
      console.log(`[GET-PERFORMANCE-DATA] Fetched ${rows.length} raw rows`);

      if (rows.length === 0) {
        console.log('[GET-PERFORMANCE-DATA] No data rows found');
        return new Response(
          JSON.stringify({ 
            data: [],
            total: 0,
            totalRows: 0,
            totalCount: 0,
            hasMore: false,
            meta: {
              dateDimensionId: null,
              dimensionsCount: allDimensions.length,
            },
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Enhanced date dimension detection
      const dateDimensions = allDimensions.filter((d: any) => d.type === 'date');
      let dateDimInUse: { id: string; name: string } | null = null;
      
      for (const d of dateDimensions) {
        const found = rows.some((r: any) => {
          const dv = r.dimension_values || {};
          return dv[d.id] !== undefined && dv[d.id] !== null && dv[d.id] !== '';
        });
        if (found) {
          dateDimInUse = { id: d.id, name: d.name };
          console.log(`[GET-PERFORMANCE-DATA] Date dimension in use: ${d.name} (${d.id})`);
          break;
        }
      }

      // Enhanced date filtering
      let filteredData = rows;
      if (dateDimInUse && (dateFrom || dateTo)) {
        console.log(`[GET-PERFORMANCE-DATA] Applying date filter: ${dateFrom} to ${dateTo}`);
        
        const fromDate = dateFrom ? new Date(dateFrom) : null;
        const toDate = dateTo ? new Date(dateTo) : null;
        const adjustedToDate = toDate
          ? new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1)
          : null;

        filteredData = filteredData.filter((row: any) => {
          const dv = row.dimension_values || {};
          const val = dv[dateDimInUse!.id];
          if (!val) return true; // keep rows without date
          
          try {
            const rowDate = new Date(String(val));
            if (isNaN(rowDate.getTime())) return true; // keep rows with invalid dates
            if (fromDate && rowDate < fromDate) return false;
            if (adjustedToDate && rowDate >= adjustedToDate) return false;
            return true;
          } catch (dateError) {
            console.warn('[GET-PERFORMANCE-DATA] Date parsing error:', dateError);
            return true; // keep row if date parsing fails
          }
        });
        
        console.log(`[GET-PERFORMANCE-DATA] After date filter: ${filteredData.length} rows`);
      }

      // Enhanced dimension filtering
      const normalizedFilters: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(dimensionFilters || {})) {
        if (Array.isArray(v)) normalizedFilters[k] = v.map((x) => String(x));
        else if (v !== undefined && v !== null) normalizedFilters[k] = [String(v)];
      }

      if (Object.keys(normalizedFilters).length > 0) {
        console.log(`[GET-PERFORMANCE-DATA] Applying ${Object.keys(normalizedFilters).length} dimension filters`);
        
        filteredData = filteredData.filter((row: any) => {
          const dv = row.dimension_values || {};
          for (const [dimId, values] of Object.entries(normalizedFilters)) {
            if (!values || values.length === 0) continue;
            const rowVal = dv[dimId];
            if (rowVal === undefined || rowVal === null) return false;
            const rowStr = String(rowVal);
            if (!values.some((v) => rowStr === v)) return false;
          }
          return true;
        });
        
        console.log(`[GET-PERFORMANCE-DATA] After dimension filters: ${filteredData.length} rows`);
      }

      // Build enhanced response
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
        totalCount: total,
        hasMore: false,
        meta: {
          dateDimensionId: dateDimInUse?.id || null,
          dimensionsCount: allDimensions.length,
          strategy: 'edge-function',
        },
      };

      return new Response(JSON.stringify(response), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (dataError) {
      console.error('[GET-PERFORMANCE-DATA] Error fetching data:', dataError);
      return new Response(
        JSON.stringify({ 
          error: 'Error fetching performance data',
          details: dataError instanceof Error ? dataError.message : String(dataError),
          data: [],
          total: 0,
          totalRows: 0,
          totalCount: 0,
          hasMore: false
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('[GET-PERFORMANCE-DATA] Fatal error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    const details = error instanceof Error ? error.stack : undefined;

    return new Response(JSON.stringify({ 
      error: `Fatal error: ${message}`, 
      details,
      data: [],
      total: 0,
      totalRows: 0,
      totalCount: 0,
      hasMore: false
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});