import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PerformanceDataRequest {
  reportId: string;
  groupByDims: string[];
  breakdownDims?: string[];
  thenByDims?: string[];
  dimensionFilters?: Record<string, string>;
  dateFrom?: string;
  dateTo?: string;
  visibleDimensionIds?: string[];
  limit?: number;
  offset?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const {
      reportId,
      groupByDims = [],
      breakdownDims = [],
      thenByDims = [],
      dimensionFilters = {},
      dateFrom,
      dateTo,
      visibleDimensionIds = [],
      limit = 1000,
      offset = 0,
    }: PerformanceDataRequest = await req.json();

    console.log('get-performance-data: Starting request', {
      reportId,
      groupByDims,
      limit,
      offset,
    });

    // Fetch all dimensions for this report to build formulas
    const { data: dimensions, error: dimError } = await supabase
      .from('dimensions')
      .select('id, name, type, formula')
      .eq('report_id', reportId);

    if (dimError) {
      console.error('Error fetching dimensions:', dimError);
      throw dimError;
    }

    console.log(`Loaded ${dimensions?.length || 0} dimensions`);

    // Build filter for the main query
    let query = supabase
      .from('dimension_data')
      .select('dimension_values, row_number')
      .eq('report_id', reportId)
      .order('row_number', { ascending: true });

    // Apply date filters if provided
    if (dateFrom || dateTo) {
      const dateDim = dimensions?.find(d => d.type === 'date');
      if (dateDim) {
        // We'll filter client-side since JSONB queries are complex
      }
    }

    // Fetch data with limit and offset
    query = query.range(offset, offset + limit - 1);

    const { data: rawData, error: dataError } = await query;

    if (dataError) {
      console.error('Error fetching dimension data:', dataError);
      throw dataError;
    }

    console.log(`Fetched ${rawData?.length || 0} raw rows`);

    // Apply filters and build hierarchical structure
    let filteredData = rawData || [];

    // Filter by dimension filters
    if (Object.keys(dimensionFilters).length > 0) {
      filteredData = filteredData.filter((row) => {
        const dimValues = row.dimension_values as Record<string, any>;
        for (const [dimId, filterValue] of Object.entries(dimensionFilters)) {
          if (dimValues[dimId] !== filterValue) {
            return false;
          }
        }
        return true;
      });
    }

    // Filter by date range
    if ((dateFrom || dateTo) && dimensions) {
      const dateDim = dimensions.find(d => d.type === 'date');
      if (dateDim) {
        filteredData = filteredData.filter((row) => {
          const dimValues = row.dimension_values as Record<string, any>;
          const dateValue = dimValues[dateDim.id];
          if (!dateValue) return true;

          const rowDate = new Date(dateValue);
          if (dateFrom && rowDate < new Date(dateFrom)) return false;
          if (dateTo && rowDate > new Date(dateTo)) return false;
          return true;
        });
      }
    }

    console.log(`After filtering: ${filteredData.length} rows`);

    // Group data by the first group dimension
    const groupDimId = groupByDims[0];
    if (!groupDimId) {
      return new Response(
        JSON.stringify({
          rows: [],
          totalCount: 0,
          hasMore: false,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const grouped = new Map<string, any>();

    for (const row of filteredData) {
      const dimValues = row.dimension_values as Record<string, any>;
      const groupKey = dimValues[groupDimId] || 'Unknown';

      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, {
          id: `${groupKey}`.toLowerCase().replace(/\s+/g, '-'),
          name: groupKey,
          level: 0,
          data: {},
          rawRows: [],
        });
      }

      const groupItem = grouped.get(groupKey);
      groupItem.rawRows.push(row);

      // Aggregate base metrics (non-formula dimensions)
      for (const dim of dimensions || []) {
        if (dim.formula) continue;

        const value = dimValues[dim.id];
        if (value !== undefined && value !== null) {
          if (dim.type === 'number' || dim.type === 'currency') {
            const numValue = parseFloat(value) || 0;
            groupItem.data[dim.name] = (groupItem.data[dim.name] || 0) + numValue;
          } else if (dim.type === 'date') {
            if (!groupItem.data[dim.name]) {
              groupItem.data[dim.name] = value;
            }
          } else {
            groupItem.data[dim.name] = value;
          }
        }
      }
    }

    // Calculate formulas for each group
    const calculateFormula = (formula: string, data: Record<string, any>): number => {
      try {
        let expression = formula;
        for (const [key, value] of Object.entries(data)) {
          const numValue = typeof value === 'number' ? value : parseFloat(value) || 0;
          expression = expression.replace(new RegExp(`\\{${key}\\}`, 'g'), numValue.toString());
        }
        const result = eval(expression);
        return typeof result === 'number' && !isNaN(result) ? result : 0;
      } catch (error) {
        console.error('Error calculating formula:', error);
        return 0;
      }
    };

    const groupedArray = Array.from(grouped.values());

    for (const group of groupedArray) {
      // Calculate formula fields
      for (const dim of dimensions || []) {
        if (dim.formula) {
          const calculatedValue = calculateFormula(dim.formula, group.data);
          group.data[dim.name] = calculatedValue;
        }
      }

      // Build children if breakdown dimension exists
      if (breakdownDims[0] && group.rawRows.length > 0) {
        const breakdownDimId = breakdownDims[0];
        const breakdownGrouped = new Map<string, any>();

        for (const row of group.rawRows) {
          const dimValues = row.dimension_values as Record<string, any>;
          const breakdownKey = dimValues[breakdownDimId] || 'Unknown';

          if (!breakdownGrouped.has(breakdownKey)) {
            breakdownGrouped.set(breakdownKey, {
              id: `${group.id}-${breakdownKey}`.toLowerCase().replace(/\s+/g, '-'),
              name: breakdownKey,
              level: 1,
              data: {},
            });
          }

          const breakdownItem = breakdownGrouped.get(breakdownKey);

          // Aggregate for breakdown
          for (const dim of dimensions || []) {
            if (dim.formula) continue;

            const value = dimValues[dim.id];
            if (value !== undefined && value !== null) {
              if (dim.type === 'number' || dim.type === 'currency') {
                const numValue = parseFloat(value) || 0;
                breakdownItem.data[dim.name] = (breakdownItem.data[dim.name] || 0) + numValue;
              } else {
                breakdownItem.data[dim.name] = value;
              }
            }
          }
        }

        const breakdownArray = Array.from(breakdownGrouped.values());

        // Calculate formulas for breakdowns
        for (const breakdownItem of breakdownArray) {
          for (const dim of dimensions || []) {
            if (dim.formula) {
              const calculatedValue = calculateFormula(dim.formula, breakdownItem.data);
              breakdownItem.data[dim.name] = calculatedValue;
            }
          }
        }

        group.children = breakdownArray;
      }

      delete group.rawRows;
    }

    console.log(`Built ${groupedArray.length} grouped rows`);

    // Calculate total for all visible metric columns
    const totalData: Record<string, any> = {};
    for (const dim of dimensions || []) {
      if (dim.formula) continue;
      if (dim.type === 'number' || dim.type === 'currency') {
        let sum = 0;
        for (const row of filteredData) {
          const dimValues = row.dimension_values as Record<string, any>;
          const value = dimValues[dim.id];
          if (value !== undefined && value !== null) {
            sum += parseFloat(value) || 0;
          }
        }
        totalData[dim.name] = sum;
      }
    }

    // Calculate formula totals
    for (const dim of dimensions || []) {
      if (dim.formula) {
        totalData[dim.name] = calculateFormula(dim.formula, totalData);
      }
    }

    const response = {
      rows: groupedArray,
      totalData,
      totalCount: filteredData.length,
      hasMore: offset + limit < filteredData.length,
    };

    console.log('get-performance-data: Response prepared', {
      rowCount: groupedArray.length,
      totalCount: filteredData.length,
      hasMore: response.hasMore,
    });

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in get-performance-data:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
