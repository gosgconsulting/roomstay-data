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

    // Try to use pre-computed API data for fast loading (single report only, with date range)
    if (reportId && dateFrom && dateTo && !reportIds) {
      try {
        console.log('[GET-PERFORMANCE-DATA] Checking for pre-computed API data...');
        const { data: apiData, error: apiError } = await supabase
          .from('report_api_data')
          .select('period_type, date_from, date_to, data')
          .eq('report_id', reportId)
          .eq('period_type', 'current')
          .maybeSingle();

        if (!apiError && apiData) {
          // Check if requested date range is within or matches API data range
          const apiFrom = apiData.date_from;
          const apiTo = apiData.date_to;
          
          // Check if requested range is within API data range
          if (dateFrom >= apiFrom && dateTo <= apiTo) {
            console.log(`[GET-PERFORMANCE-DATA] Using pre-computed API data (${apiFrom} to ${apiTo})`);
            
            // Filter the pre-computed data by the requested date range
            let filteredApiData = apiData.data || [];
            
            // Find date dimension for filtering
            let dateDimIdForFilter: string | null = null;
            if (dateDimensions.length > 0) {
              const reportDateDim = dateDimensions.find((d: any) => d.report_id === reportId);
              dateDimIdForFilter = reportDateDim?.id || 
                dateDimensions.find((d: any) => d.account_id === accountId)?.id ||
                dateDimensions.find((d: any) => d.scope === 'global')?.id ||
                dateDimensions[0]?.id || null;
            }
            
            // Filter by date range if we have a date dimension
            if (dateDimIdForFilter) {
              filteredApiData = filteredApiData.filter((row: any) => {
                const dv = row.dimension_values || {};
                const rowDate = dv[dateDimIdForFilter!];
                if (!rowDate) return false;
                const rowDateStr = String(rowDate);
                return rowDateStr >= dateFrom && rowDateStr <= dateTo;
              });
            }
            
            // Apply dimension filters if provided
            const normalizedFilters: Record<string, string[]> = {};
            for (const [k, v] of Object.entries(dimensionFilters || {})) {
              if (Array.isArray(v)) normalizedFilters[k] = v.map((x) => String(x));
              else if (v !== undefined && v !== null) normalizedFilters[k] = [String(v)];
            }
            
            if (Object.keys(normalizedFilters).length > 0) {
              const dimIdToName: Record<string, string> = {};
              const dimNameToIds: Record<string, string[]> = {};
              allDimensions.forEach((dim: any) => {
                dimIdToName[dim.id] = dim.name;
                if (!dimNameToIds[dim.name]) dimNameToIds[dim.name] = [];
                if (!dimNameToIds[dim.name].includes(dim.id)) {
                  dimNameToIds[dim.name].push(dim.id);
                }
              });
              
              filteredApiData = filteredApiData.filter((row: any) => {
                const dv = row.dimension_values || {};
                for (const [filterDimId, values] of Object.entries(normalizedFilters)) {
                  if (!values || values.length === 0) continue;
                  const dimName = dimIdToName[filterDimId];
                  const allIdsForName = dimName ? (dimNameToIds[dimName] || [filterDimId]) : [filterDimId];
                  let foundMatch = false;
                  for (const id of allIdsForName) {
                    const rowVal = dv[id];
                    if (rowVal !== undefined && rowVal !== null) {
                      const rowStr = String(rowVal);
                      if (values.some((v) => rowStr === v)) {
                        foundMatch = true;
                        break;
                      }
                    }
                  }
                  if (!foundMatch) return false;
                }
                return true;
              });
            }
            
            // Apply pagination
            const startIndex = offset || 0;
            const endIndex = startIndex + (limit || 50000);
            const paginatedData = filteredApiData.slice(startIndex, endIndex);
            
            // Build response in the same format as regular query
            const data = paginatedData.map((row: any, i: number) => ({
              id: `row-${row.row_number ?? i + 1}`,
              dimension_values: row.dimension_values || {},
              row_number: row.row_number ?? i + 1,
              data_source_id: row.data_source_id || null,
            }));
            
            const total = filteredApiData.length;
            console.log(`[GET-PERFORMANCE-DATA] Returning ${paginatedData.length} rows from API data (total: ${total})`);
            
            return new Response(JSON.stringify({
              data,
              total,
              totalRows: total,
              totalCount: total,
              hasMore: endIndex < total,
              meta: {
                dateDimensionId: dateDimIdForFilter,
                dimensionsCount: allDimensions.length,
                source: 'api_cache'
              },
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          } else {
            console.log(`[GET-PERFORMANCE-DATA] Date range mismatch - API: ${apiFrom} to ${apiTo}, Requested: ${dateFrom} to ${dateTo}`);
          }
        } else {
          console.log('[GET-PERFORMANCE-DATA] No pre-computed API data available, using dimension_data');
        }
      } catch (apiCheckError) {
        console.error('[GET-PERFORMANCE-DATA] Error checking API data, falling back to dimension_data:', apiCheckError);
        // Continue with normal flow
      }
    }

    // Determine which date dimension to use for filtering (before fetching data)
    let dateDimIdToUse: string | null = null;
    
    // Priority 1: report-specific date dimension
    if (reportId) {
      const reportDateDim = dateDimensions.find((d: any) => d.report_id === reportId);
      if (reportDateDim) {
        dateDimIdToUse = reportDateDim.id;
        console.log(`[GET-PERFORMANCE-DATA] Using report-specific date dimension: ${reportDateDim.name} (${dateDimIdToUse})`);
      }
    }
    
    // Priority 2: account-specific date dimension
    if (!dateDimIdToUse && accountId) {
      const accountDateDim = dateDimensions.find((d: any) => d.account_id === accountId);
      if (accountDateDim) {
        dateDimIdToUse = accountDateDim.id;
        console.log(`[GET-PERFORMANCE-DATA] Using account-specific date dimension: ${accountDateDim.name} (${dateDimIdToUse})`);
      }
    }
    
    // Priority 3: global date dimension
    if (!dateDimIdToUse && dateDimensions.length > 0) {
      const globalDateDim = dateDimensions.find((d: any) => d.scope === 'global');
      if (globalDateDim) {
        dateDimIdToUse = globalDateDim.id;
        console.log(`[GET-PERFORMANCE-DATA] Using global date dimension: ${globalDateDim.name} (${dateDimIdToUse})`);
      } else {
        // Fallback to first date dimension
        dateDimIdToUse = dateDimensions[0].id;
        console.log(`[GET-PERFORMANCE-DATA] Using first available date dimension: ${dateDimensions[0].name} (${dateDimIdToUse})`);
      }
    }

    // Build query with SQL-level date filtering BEFORE pagination
    let query = supabase
      .from('dimension_data')
      .select('dimension_values, row_number, data_source_id');
    
    // Handle single report or multiple reports
    if (reportId) {
      query = query.eq('report_id', reportId);
    } else if (reportIds && reportIds.length) {
      query = query.in('report_id', reportIds);
    }
    
    // Apply date filters at SQL level if we have a date dimension
    if (dateDimIdToUse && (dateFrom || dateTo)) {
      console.log(`[GET-PERFORMANCE-DATA] Applying SQL date filter on dimension ${dateDimIdToUse}: ${dateFrom} to ${dateTo}`);
      
      if (dateFrom) {
        query = query.gte(`dimension_values->>${dateDimIdToUse}`, dateFrom);
      }
      
      if (dateTo) {
        // Make dateTo inclusive by adding one day
        const toDate = new Date(dateTo);
        const adjustedToDate = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1);
        const adjustedToDateStr = adjustedToDate.toISOString().split('T')[0];
        query = query.lt(`dimension_values->>${dateDimIdToUse}`, adjustedToDateStr);
      }
    }
    
    query = query.order('row_number', { ascending: true });

    // Apply range (offset/limit) AFTER date filtering
    if (typeof offset === 'number' && typeof limit === 'number') {
      query = query.range(offset, Math.max(offset, 0) + Math.max(limit, 1) - 1);
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
    console.log(`[GET-PERFORMANCE-DATA] Fetched ${rows.length} rows after SQL-level filtering`);

    // No need for additional JavaScript date filtering since it's done in SQL
    let filteredData = rows;

    // Normalize dimensionFilters to arrays and apply filtering by dimension IDs
    const normalizedFilters: Record<string, string[]> = {};
    for (const [k, v] of Object.entries(dimensionFilters || {})) {
      if (Array.isArray(v)) normalizedFilters[k] = v.map((x) => String(x));
      else if (v !== undefined && v !== null) normalizedFilters[k] = [String(v)];
    }

    // Log dimension filters for debugging
    if (Object.keys(normalizedFilters).length > 0) {
      console.log(`[GET-PERFORMANCE-DATA] Applying dimension filters:`, JSON.stringify(normalizedFilters));
    }

    // Build a map of dimension ID -> dimension name for flexible filtering
    const dimIdToName: Record<string, string> = {};
    const dimNameToIds: Record<string, string[]> = {};
    allDimensions.forEach((dim: any) => {
      dimIdToName[dim.id] = dim.name;
      if (!dimNameToIds[dim.name]) dimNameToIds[dim.name] = [];
      if (!dimNameToIds[dim.name].includes(dim.id)) {
        dimNameToIds[dim.name].push(dim.id);
      }
    });

    // Expand filters to include all dimension IDs with the same name
    // This ensures filtering works even if the same dimension has multiple IDs
    const expandedFilters: Record<string, string[]> = {};
    for (const [dimId, values] of Object.entries(normalizedFilters)) {
      const dimName = dimIdToName[dimId];
      if (dimName) {
        // Get all dimension IDs with this name
        const allIdsForName = dimNameToIds[dimName] || [dimId];
        allIdsForName.forEach(id => {
          expandedFilters[id] = values;
        });
        console.log(`[GET-PERFORMANCE-DATA] Filter dimension "${dimName}" expanded to IDs:`, allIdsForName);
      } else {
        // Fallback: just use the provided ID
        expandedFilters[dimId] = values;
      }
    }

    if (Object.keys(normalizedFilters).length > 0) {
      console.log(`[GET-PERFORMANCE-DATA] Original filters:`, JSON.stringify(normalizedFilters));
      console.log(`[GET-PERFORMANCE-DATA] Expanded filters:`, JSON.stringify(expandedFilters));
      
      filteredData = filteredData.filter((row: any) => {
        const dv = row.dimension_values || {};
        
        // Group filters by dimension name and check if ANY matching dimension ID passes
        for (const [filterDimId, values] of Object.entries(normalizedFilters)) {
          if (!values || values.length === 0) continue;
          
          const dimName = dimIdToName[filterDimId];
          const allIdsForName = dimName ? (dimNameToIds[dimName] || [filterDimId]) : [filterDimId];
          
          // Check if ANY of the dimension IDs with this name has a matching value
          let foundMatch = false;
          for (const id of allIdsForName) {
            const rowVal = dv[id];
            if (rowVal !== undefined && rowVal !== null) {
              const rowStr = String(rowVal);
              if (values.some((v) => rowStr === v)) {
                foundMatch = true;
                break;
              }
            }
          }
          
          if (!foundMatch) return false;
        }
        return true;
      });
      
      console.log(`[GET-PERFORMANCE-DATA] Rows after dimension filtering: ${filteredData.length}`);
    }

    // Build response: keep dimension_values keyed by IDs to match frontend expectations
    const data = filteredData.map((row: any, i: number) => ({
      id: `row-${row.row_number ?? i + 1}`,
      dimension_values: row.dimension_values || {},
      row_number: row.row_number ?? i + 1,
      data_source_id: row.data_source_id || null,
    }));

    const total = filteredData.length;
    console.log(`[GET-PERFORMANCE-DATA] Returning ${total} rows after all filters (SQL date + dimension filters)`);

    const response = {
      data,
      total,
      totalRows: total,
      totalCount: total, // keep for compatibility
      hasMore: false,
      meta: {
        dateDimensionId: dateDimIdToUse || null,
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