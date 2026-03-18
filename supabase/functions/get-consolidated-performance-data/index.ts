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

  // DEPRECATED: get-consolidated-performance-data has no frontend callers.
  // Functionality is covered by get-performance-data. Remove after Phase 9.
  console.warn('[GET-CONSOLIDATED-PERFORMANCE-DATA] DEPRECATED: no frontend callers. Use get-performance-data instead.');
  return new Response(
    JSON.stringify({ success: false, error: 'DEPRECATED: get-consolidated-performance-data is retired. Use get-performance-data.' }),
    { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );

  try {
    const body = await req.json();
    const {
      reportIds,
      accountId,
      userId,
      groupByDims = [],
      breakdownDims = [],
      thenByDims = [],
      dimensionFilters = {},
      dateFrom,
      dateTo,
      compareDateFrom,
      compareDateTo,
      compareEnabled = false,
      dateGranularity = 'day',
      dateOrder = 'desc',
      visibleDimensionIds = [],
      limit = 50000,
      offset = 0,
      masterDimensionId,
      masterDimensionValues,
    } = body || {};

    // Validate required parameters
    if (!reportIds || !Array.isArray(reportIds) || reportIds.length === 0) {
      return new Response(
        JSON.stringify({ 
          error: 'reportIds is required and must be a non-empty array',
          data: [],
          totals: {},
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
          console.error('[GET-CONSOLIDATED-PERFORMANCE-DATA] Error loading account dimensions:', accountError);
        } else {
          allDimensions = [...allDimensions, ...(accountDimensions || [])];
          console.log(`[GET-CONSOLIDATED-PERFORMANCE-DATA] Loaded ${accountDimensions?.length || 0} account dimensions`);
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
          console.error('[GET-CONSOLIDATED-PERFORMANCE-DATA] Error loading custom dimensions:', customError);
        } else {
          allDimensions = [...allDimensions, ...(customDimensions || [])];
          console.log(`[GET-CONSOLIDATED-PERFORMANCE-DATA] Loaded ${customDimensions?.length || 0} custom dimensions`);
        }
      }
      
      // 3. Load global dimensions (always)
      const { data: globalDimensions, error: globalError } = await supabase
        .from('dimensions')
        .select('id, name, type, scope, account_id, report_id')
        .eq('scope', 'global');
      
      if (globalError) {
        console.error('[GET-CONSOLIDATED-PERFORMANCE-DATA] Error loading global dimensions:', globalError);
      } else {
        allDimensions = [...allDimensions, ...(globalDimensions || [])];
        console.log(`[GET-CONSOLIDATED-PERFORMANCE-DATA] Loaded ${globalDimensions?.length || 0} global dimensions`);
      }
      
      // 4. Load report-specific dimensions for all reportIds
      if (reportIds && reportIds.length > 0) {
        const { data: reportDimensions, error: reportError } = await supabase
          .from('dimensions')
          .select('id, name, type, scope, account_id, report_id')
          .in('report_id', reportIds);
        
        if (reportError) {
          console.error('[GET-CONSOLIDATED-PERFORMANCE-DATA] Error loading report dimensions:', reportError);
        } else {
          // Add any report dimensions that aren't already in the list
          const existingIds = new Set(allDimensions.map(d => d.id));
          const newReportDimensions = (reportDimensions || []).filter(d => !existingIds.has(d.id));
          
          allDimensions = [...allDimensions, ...newReportDimensions];
          console.log(`[GET-CONSOLIDATED-PERFORMANCE-DATA] Loaded ${newReportDimensions.length} additional report dimensions`);
        }
      }
      
      console.log(`[GET-CONSOLIDATED-PERFORMANCE-DATA] Total dimensions loaded: ${allDimensions.length}`);
      
      if (allDimensions.length === 0) {
        console.error('[GET-CONSOLIDATED-PERFORMANCE-DATA] No dimensions found for the given parameters');
        return new Response(
          JSON.stringify({ 
            error: 'No dimensions found for the given parameters',
            data: [],
            totals: {},
            hasMore: false
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    } catch (dimError) {
      console.error('[GET-CONSOLIDATED-PERFORMANCE-DATA] Error in dimension loading process:', dimError);
      return new Response(
        JSON.stringify({ 
          error: 'Error loading dimensions',
          details: dimError instanceof Error ? dimError.message : String(dimError),
          data: [],
          totals: {},
          hasMore: false
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create dimension ID to name mapping
    const dimensionIdToName = new Map<string, string>();
    const dimensionIdToType = new Map<string, string>();
    allDimensions.forEach(dim => {
      dimensionIdToName.set(dim.id, dim.name);
      dimensionIdToType.set(dim.id, dim.type);
    });

    // Find date dimensions
    const dateDimensions = allDimensions.filter(d => d.type === 'date');

    // Fetch report names
    const { data: reports, error: reportsError } = await supabase
      .from('reports')
      .select('id, name')
      .in('id', reportIds);

    if (reportsError) {
      console.error('[GET-CONSOLIDATED-PERFORMANCE-DATA] Error fetching report names:', reportsError);
      return new Response(
        JSON.stringify({ 
          error: 'Error fetching report names',
          details: reportsError.message,
          data: [],
          totals: {},
          hasMore: false
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const reportMap = new Map(reports?.map(r => [r.id, r.name]) || []);

    // Create a special "Report" dimension ID
    const REPORT_DIMENSION_ID = '__report_dimension__';

    // Load data from all reports - use API data when available for instant loading
    let allData: any[] = [];
    
    try {
      // Check API data for all reports in parallel for faster loading
      const apiDataChecks = await Promise.all(
        reportIds.map(async (reportId) => {
          if (!dateFrom || !dateTo) return { reportId, apiData: null };
          
          try {
            const { data: apiData, error: apiError } = await supabase
              .from('report_api_data')
              .select('period_type, date_from, date_to, data')
              .eq('report_id', reportId)
              .eq('period_type', 'current')
              .maybeSingle();

            if (!apiError && apiData) {
              const apiFrom = apiData.date_from;
              const apiTo = apiData.date_to;
              if (dateFrom >= apiFrom && dateTo <= apiTo) {
                return { reportId, apiData };
              }
            }
          } catch (error) {
            console.error(`[GET-CONSOLIDATED-PERFORMANCE-DATA] Error checking API data for report ${reportId}:`, error);
          }
          return { reportId, apiData: null };
        })
      );

      const apiDataMap = new Map(apiDataChecks.map(check => [check.reportId, check.apiData]));

      for (const reportId of reportIds) {
        const reportName = reportMap.get(reportId) || reportId;
        let reportData: any[] = [];
        const cachedApiData = apiDataMap.get(reportId);
        
        // Use pre-computed API data if available
        if (cachedApiData && dateFrom && dateTo) {
          console.log(`[GET-CONSOLIDATED-PERFORMANCE-DATA] ✓ Using API cache for report ${reportId} - INSTANT LOAD`);
          
          // Find Date dimension for filtering
          const dateDimension = dateDimensions.find(d => d.name === 'Date');
          
          // Filter the pre-computed data by the requested date range
          let filteredApiData = cachedApiData.data || [];
          
          if (dateDimension) {
            filteredApiData = filteredApiData.filter((row: any) => {
              const dv = row.dimension_values || {};
              const rowDate = dv[dateDimension.id];
              if (!rowDate) return false;
              const rowDateStr = String(rowDate);
              return rowDateStr >= dateFrom && rowDateStr <= dateTo;
            });
          }
          
          reportData = filteredApiData;
        } else {
          // Fallback to dimension_data if API data not available
          // Build query
          let query = supabase
            .from('dimension_data')
            .select('dimension_values, report_id')
            .eq('report_id', reportId);

          // Apply date filters if provided
          if (dateFrom && dateTo) {
            // Find Date dimension
            const dateDimension = dateDimensions.find(d => d.name === 'Date');
            
            if (dateDimension) {
              // PostgreSQL JSONB filtering for date range
              query = query
                .gte(`dimension_values->>${dateDimension.id}`, dateFrom)
                .lte(`dimension_values->>${dateDimension.id}`, dateTo);
            }
          }

          const { data: dimensionData, error: dataError } = await query.limit(10000);

          if (dataError) {
            console.error(`[GET-CONSOLIDATED-PERFORMANCE-DATA] Error fetching data for report ${reportId}:`, dataError);
            continue;
          }

          reportData = dimensionData || [];
        }

        // Add report name to each row's dimension values
        if (reportData.length > 0) {
          reportData.forEach(row => {
            allData.push({
              dimension_values: {
                ...row.dimension_values,
                [REPORT_DIMENSION_ID]: reportName
              },
              report_id: reportId
            });
          });
        }
      }

      console.log(`[GET-CONSOLIDATED-PERFORMANCE-DATA] Loaded ${allData.length} total rows from ${reportIds.length} reports`);
    } catch (dataError) {
      console.error('[GET-CONSOLIDATED-PERFORMANCE-DATA] Error loading data from reports:', dataError);
      return new Response(
        JSON.stringify({ 
          error: 'Error loading data from reports',
          details: dataError instanceof Error ? dataError.message : String(dataError),
          data: [],
          totals: {},
          hasMore: false
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Apply dimension filters
    if (Object.keys(dimensionFilters).length > 0) {
      allData = allData.filter(row => {
        const dv = row.dimension_values || {};
        for (const [dimId, values] of Object.entries(dimensionFilters)) {
          if (!values || !Array.isArray(values) || values.length === 0) continue;
          
          const rowVal = dv[dimId];
          if (rowVal === undefined || rowVal === null) return false;
          
          const rowStr = String(rowVal);
          if (!values.some(v => rowStr === String(v))) return false;
        }
        return true;
      });
      
      console.log(`[GET-CONSOLIDATED-PERFORMANCE-DATA] After dimension filters: ${allData.length} rows`);
    }

    // Apply master dimension filter if provided
    if (masterDimensionId && masterDimensionValues && masterDimensionValues.length > 0) {
      allData = allData.filter(row => {
        const dv = row.dimension_values || {};
        const rowVal = dv[masterDimensionId];
        if (rowVal === undefined || rowVal === null) return false;
        
        const rowStr = String(rowVal);
        return masterDimensionValues.some((v: any) => rowStr === String(v));
      });
      
      console.log(`[GET-CONSOLIDATED-PERFORMANCE-DATA] After master dimension filter: ${allData.length} rows`);
    }

    // Group and aggregate data
    const groupedData = new Map<string, any>();
    const allDimIds = [...groupByDims, ...breakdownDims, ...thenByDims];
    
    // Add Report dimension to grouping if not already included
    if (!allDimIds.includes(REPORT_DIMENSION_ID)) {
      allDimIds.unshift(REPORT_DIMENSION_ID);
    }

    // Helper function to aggregate dates by granularity
    const aggregateDateByGranularity = (dateStr: string, granularity: string): string => {
      if (!dateStr || dateStr === '') return dateStr;
      
      try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return dateStr;
        
        switch (granularity) {
          case 'year':
            return `${date.getFullYear()}-01-01`;
          case 'month':
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
          case 'week': {
            // Get ISO week start (Monday)
            const day = date.getDay();
            const diff = date.getDate() - day + (day === 0 ? -6 : 1);
            const weekStart = new Date(date);
            weekStart.setDate(diff);
            return `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
          }
          case 'day':
          default:
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        }
      } catch (e) {
        console.error('[DATE-AGGREGATION] Error aggregating date:', e);
        return dateStr;
      }
    };

    allData.forEach(row => {
      const dimValues = row.dimension_values;
      
      // Process dimension values and aggregate dates if needed
      const processedDimValues: Record<string, any> = { ...dimValues };
      
      allDimIds.forEach(dimId => {
        const dimType = dimensionIdToType.get(dimId);
        if (dimType === 'date' && processedDimValues[dimId]) {
          processedDimValues[dimId] = aggregateDateByGranularity(processedDimValues[dimId], dateGranularity);
        }
      });
      
      // Create group key using processed values
      const groupKey = allDimIds.map(dimId => processedDimValues[dimId] || '').join('|');
      
      if (!groupedData.has(groupKey)) {
        groupedData.set(groupKey, {
          dimension_values: {},
          metrics: {}
        });
      }

      const group = groupedData.get(groupKey)!;
      
      // Store dimension values (use processed values for dates)
      allDimIds.forEach(dimId => {
        if (!group.dimension_values[dimId]) {
          group.dimension_values[dimId] = processedDimValues[dimId] || '';
        }
      });

      // Aggregate metrics (numerical and currency dimensions)
      visibleDimensionIds.forEach((dimId: string) => {
        if (allDimIds.includes(dimId)) return; // Skip grouping dimensions
        
        const value = dimValues[dimId];
        if (value !== null && value !== undefined && value !== '') {
          const numValue = typeof value === 'number' ? value : parseFloat(value);
          if (!isNaN(numValue)) {
            if (!group.metrics[dimId]) {
              group.metrics[dimId] = 0;
            }
            group.metrics[dimId] += numValue;
          }
        }
      });
    });

    // Convert to array format
    const result = Array.from(groupedData.values()).map(group => ({
      ...group.dimension_values,
      ...group.metrics
    }));

    // Calculate totals
    const totals: Record<string, number> = {};
    visibleDimensionIds.forEach((dimId: string) => {
      if (allDimIds.includes(dimId)) return;
      
      let total = 0;
      result.forEach(row => {
        const value = row[dimId];
        if (value !== null && value !== undefined && value !== '') {
          const numValue = typeof value === 'number' ? value : parseFloat(value);
          if (!isNaN(numValue)) {
            total += numValue;
          }
        }
      });
      totals[dimId] = total;
    });

    console.log(`[GET-CONSOLIDATED-PERFORMANCE-DATA] Returning ${result.length} grouped rows with ${Object.keys(totals).length} totals`);

    return new Response(
      JSON.stringify({ 
        data: result,
        totals,
        reportDimensionId: REPORT_DIMENSION_ID,
        dimensionsCount: allDimensions.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[GET-CONSOLIDATED-PERFORMANCE-DATA] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : 'No details available',
        data: [],
        totals: {},
        hasMore: false
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});