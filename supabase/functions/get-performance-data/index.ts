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

    // Build query for dimension_data
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

    const { data: dimensionData, error: queryError } = await query;

    if (queryError) {
      console.error('[GET-PERFORMANCE-DATA] Query error:', queryError);
      throw queryError;
    }

    console.log('[GET-PERFORMANCE-DATA] Fetched rows:', dimensionData?.length || 0);

    // Filter data based on date range and dimension filters
    let filteredData = dimensionData || [];

    // Apply date filter if provided
    if (dateFrom || dateTo) {
      // Get Date dimension to know which field to filter on
      const { data: dateDimension } = await supabase
        .from('dimensions')
        .select('id, name')
        .eq('type', 'date')
        .eq('name', 'Date')
        .or(`and(scope.eq.account,account_id.eq.${accountId}),and(scope.eq.custom,user_id.eq.${userId}),scope.eq.global`)
        .order('scope', { ascending: false }) // Prefer account > custom > global
        .limit(1)
        .maybeSingle();

      if (dateDimension) {
        filteredData = filteredData.filter((row: any) => {
          const dateValue = row.dimension_values?.[dateDimension.id];
          if (!dateValue) return false;

          const rowDate = new Date(dateValue);
          if (dateFrom && rowDate < new Date(dateFrom)) return false;
          if (dateTo && rowDate > new Date(dateTo)) return false;

          return true;
        });
      }
    }

    // Apply dimension filters
    if (Object.keys(dimensionFilters).length > 0) {
      filteredData = filteredData.filter((row: any) => {
        const dimensionValues = row.dimension_values || {};

        for (const [dimId, filterValues] of Object.entries(dimensionFilters)) {
          if (!filterValues || (filterValues as string[]).length === 0) continue;

          const rowValue = dimensionValues[dimId];
          if (rowValue === undefined || rowValue === null) return false;

          const rowValueStr = String(rowValue).toLowerCase();
          const hasMatch = (filterValues as string[]).some((filterValue: string) => {
            const filterLower = filterValue.toLowerCase();
            return rowValueStr.includes(filterLower);
          });

          if (!hasMatch) return false;
        }

        return true;
      });
    }

    console.log('[GET-PERFORMANCE-DATA] Filtered rows:', filteredData.length);

    // Return the filtered data
    const response = {
      data: filteredData.map((row: any) => ({
        ...row.dimension_values,
        _row_number: row.row_number,
        _data_source_id: row.data_source_id,
      })),
      totalRows: filteredData.length,
      hasMore: false,
    };

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[GET-PERFORMANCE-DATA] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : undefined
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
