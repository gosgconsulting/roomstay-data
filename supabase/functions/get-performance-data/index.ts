import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      status: 200,
      headers: corsHeaders
    });
  }

  try {
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
    } = await req.json();

    console.log('[GET-PERFORMANCE-DATA] Starting query:', {
      reportId,
      accountId,
      dateFrom,
      dateTo,
      filterCount: Object.keys(dimensionFilters).length,
    });

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Helper function to retry database queries
    const retryQuery = async (queryFn: () => any, maxRetries = 3) => {
      for (let i = 0; i < maxRetries; i++) {
        try {
          const result = await queryFn();
          if (result.error) {
            if (i === maxRetries - 1) throw result.error;
            console.log(`[GET-PERFORMANCE-DATA] Query error, retrying (${i + 1}/${maxRetries}):`, result.error);
            await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            continue;
          }
          return result;
        } catch (error) {
          if (i === maxRetries - 1) throw error;
          console.log(`[GET-PERFORMANCE-DATA] Exception, retrying (${i + 1}/${maxRetries}):`, error);
          await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
        }
      }
    };

    // Load dimensions to map IDs to names with retry
    const dimensionsResult = await retryQuery(async () => 
      await supabase
        .from('dimensions')
        .select('id, name, type')
        .or(`and(scope.eq.account,account_id.eq.${accountId}),and(scope.eq.custom,user_id.eq.${userId}),scope.eq.global`)
    );

    if (!dimensionsResult || dimensionsResult.error) {
      const error = dimensionsResult?.error || new Error('Failed to load dimensions');
      console.error('[GET-PERFORMANCE-DATA] Error loading dimensions:', error);
      throw error;
    }

    const dimensions = dimensionsResult.data;

    // Create dimension ID to name mapping
    const dimensionMap = new Map();
    dimensions?.forEach((dim: any) => {
      dimensionMap.set(dim.id, { name: dim.name, type: dim.type });
    });

    // Build query for dimension_data with retry
    const dimensionDataResult = await retryQuery(async () => {
      let query = supabase
        .from('dimension_data')
        .select('dimension_values, row_number, data_source_id')
        .eq('report_id', reportId);

      // Apply limit and offset
      if (limit) {
        query = query.limit(limit);
      }
      if (offset) {
        query = query.range(offset, offset + limit - 1);
      }

      return await query;
    });

    if (!dimensionDataResult || dimensionDataResult.error) {
      const error = dimensionDataResult?.error || new Error('Failed to load dimension data');
      console.error('[GET-PERFORMANCE-DATA] Error loading dimension data:', error);
      throw error;
    }

    const dimensionData = dimensionDataResult.data;

    console.log('[GET-PERFORMANCE-DATA] Fetched rows:', dimensionData?.length || 0);

    // Filter data based on date range and dimension filters
    let filteredData = dimensionData || [];

    // Apply date filter if provided
    if (dateFrom || dateTo) {
      // First, find which date dimension is actually used in the data for this report
      // Check all date dimensions and see which one has data
      const { data: allDateDimensions } = await supabase
        .from('dimensions')
        .select('id, name')
        .eq('type', 'date')
        .eq('name', 'Date')
        .or(`and(scope.eq.account,account_id.eq.${accountId}),and(scope.eq.custom,user_id.eq.${userId}),scope.eq.global`)
        .order('scope', { ascending: false }); // Prefer account > custom > global

      // Find the date dimension that's actually used in the data
      let dateDimension = null;
      if (allDateDimensions && allDateDimensions.length > 0) {
        // Check which date dimension has data in the fetched rows
        for (const dim of allDateDimensions) {
          const hasData = filteredData.some((row: any) => {
            const dateValue = row.dimension_values?.[dim.id];
            return dateValue !== undefined && dateValue !== null && dateValue !== '';
          });
          
          if (hasData) {
            dateDimension = dim;
            console.log('[GET-PERFORMANCE-DATA] Found date dimension in data:', dim.id);
            break;
          }
        }
        
        // If no date dimension found in data, use the first one (fallback)
        if (!dateDimension && allDateDimensions.length > 0) {
          dateDimension = allDateDimensions[0];
          console.log('[GET-PERFORMANCE-DATA] No date dimension found in data, using fallback:', dateDimension.id);
        }
      }

      if (dateDimension) {
        const beforeFilterCount = filteredData.length;
        filteredData = filteredData.filter((row: any) => {
          const dateValue = row.dimension_values?.[dateDimension.id];
          // Only filter out rows that have a date value but it's outside the range
          // If a row doesn't have a date value, include it (don't filter it out)
          if (!dateValue || dateValue === '') return true;

          const rowDate = new Date(dateValue);
          if (dateFrom && rowDate < new Date(dateFrom)) return false;
          if (dateTo && rowDate > new Date(dateTo)) return false;

          return true;
        });
        
        const afterFilterCount = filteredData.length;
        console.log('[GET-PERFORMANCE-DATA] Date filter applied:', {
          dateDimensionId: dateDimension.id,
          dateFrom,
          dateTo,
          beforeFilter: beforeFilterCount,
          afterFilter: afterFilterCount,
          filteredOut: beforeFilterCount - afterFilterCount
        });
        
        // If date filter resulted in 0 rows but we had data before, log a warning
        if (afterFilterCount === 0 && beforeFilterCount > 0) {
          console.warn('[GET-PERFORMANCE-DATA] Date filter excluded all data. Consider expanding date range.');
          // Check what date range the data actually covers (use original data before filtering)
          const dateValues = (dimensionData || []).map((row: any) => row.dimension_values?.[dateDimension.id]).filter(Boolean);
          if (dateValues.length > 0) {
            const minDate = new Date(Math.min(...dateValues.map((d: string) => new Date(d).getTime())));
            const maxDate = new Date(Math.max(...dateValues.map((d: string) => new Date(d).getTime())));
            console.warn('[GET-PERFORMANCE-DATA] Data date range:', {
              min: minDate.toISOString().split('T')[0],
              max: maxDate.toISOString().split('T')[0],
              requestedFrom: dateFrom,
              requestedTo: dateTo
            });
          }
        }
      }
    }

    // Apply dimension filters if provided
    if (dimensionFilters && Object.keys(dimensionFilters).length > 0) {
      filteredData = filteredData.filter((row: any) => {
        const dimValues = row.dimension_values as Record<string, any>;
        
        for (const [dimId, filterValues] of Object.entries(dimensionFilters)) {
          if (!filterValues || (Array.isArray(filterValues) && filterValues.length === 0)) {
            continue;
          }

          const rowValue = dimValues[dimId];
          
          // If the dimension filter has values, check if row value matches
          if (Array.isArray(filterValues)) {
            if (!filterValues.includes(rowValue)) {
              return false;
            }
          } else {
            if (rowValue !== filterValues) {
              return false;
            }
          }
        }

        return true;
      });
    }

    console.log('[GET-PERFORMANCE-DATA] Filtered rows:', filteredData.length);

    // Transform data from dimension IDs to dimension names
    const transformedData = filteredData.map((row: any) => {
      const dimensionValues = row.dimension_values || {};
      const transformedRow: any = {};
      
      // Map dimension IDs to names
      for (const [dimId, value] of Object.entries(dimensionValues)) {
        const dimInfo = dimensionMap.get(dimId);
        if (dimInfo) {
          transformedRow[dimInfo.name] = value;
        }
      }
      
      return {
        id: row.id || `row-${row.row_number}`,
        name: '', // Will be set by grouping logic in frontend
        level: 0,
        data: transformedRow,
        _row_number: row.row_number,
        _data_source_id: row.data_source_id,
      };
    });

    console.log('[GET-PERFORMANCE-DATA] Sample transformed row:', transformedData[0]);

    // Return the filtered data
    const response = {
      data: transformedData,
      total: filteredData.length,
      totalRows: filteredData.length, // Keep for backward compatibility
      hasMore: false,
    };

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[GET-PERFORMANCE-DATA] Error:', error);
    
    // Extract meaningful error information
    let errorMessage = 'Unknown error';
    let errorDetails = undefined;
    
    if (error instanceof Error) {
      errorMessage = error.message;
      errorDetails = error.stack;
    } else if (typeof error === 'object' && error !== null) {
      errorMessage = JSON.stringify(error);
    }
    
    return new Response(
      JSON.stringify({ 
        error: errorMessage,
        details: errorDetails,
        timestamp: new Date().toISOString()
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
