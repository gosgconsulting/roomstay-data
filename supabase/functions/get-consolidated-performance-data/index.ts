import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ConsolidatedRequest {
  reportIds: string[];
  groupByDims: string[];
  breakdownDims: string[];
  thenByDims: string[];
  dimensionFilters: Record<string, string[]>;
  dateFrom?: string;
  dateTo?: string;
  accountId?: string;
  userId?: string;
  visibleDimensionIds: string[];
  limit?: number;
  offset?: number;
  compareEnabled?: boolean;
  compareDateFrom?: string;
  compareDateTo?: string;
  dateGranularity?: 'day' | 'week' | 'month' | 'year';
  dateOrder?: 'asc' | 'desc';
  masterDimensionId?: string;
  masterDimensionValues?: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const requestData: ConsolidatedRequest = await req.json();
    console.log('[CONSOLIDATED-DATA] Request:', JSON.stringify(requestData, null, 2));

    const { 
      reportIds, 
      groupByDims, 
      dimensionFilters, 
      dateFrom, 
      dateTo, 
      visibleDimensionIds,
      masterDimensionId,
      masterDimensionValues 
    } = requestData;

    if (!reportIds || reportIds.length === 0) {
      return new Response(
        JSON.stringify({ 
          data: [], 
          totals: {},
          dimensions: []
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Map dimension IDs to names for filtering
    const dimensionIdToName = new Map<string, string>();
    if (dimensionFilters && Object.keys(dimensionFilters).length > 0) {
      const dimIds = Object.keys(dimensionFilters);
      const { data: dims } = await supabase
        .from('dimensions')
        .select('id, name')
        .in('id', dimIds);
      
      dims?.forEach(dim => {
        dimensionIdToName.set(dim.id, dim.name);
      });
    }

    // Get master dimension name if provided
    let masterDimensionName: string | null = null;
    if (masterDimensionId) {
      const { data: masterDim } = await supabase
        .from('dimensions')
        .select('name')
        .eq('id', masterDimensionId)
        .maybeSingle();
      
      if (masterDim) {
        masterDimensionName = masterDim.name;
        console.log('[CONSOLIDATED-DATA] Master dimension filter:', masterDimensionName, 'values:', masterDimensionValues);
      }
    }

    // Fetch report names
    const { data: reports, error: reportsError } = await supabase
      .from('reports')
      .select('id, name')
      .in('id', reportIds);

    if (reportsError) {
      throw reportsError;
    }

    const reportMap = new Map(reports?.map(r => [r.id, r.name]) || []);

    // Create a special "Report" dimension ID
    const REPORT_DIMENSION_ID = '__report_dimension__';

    // Load data from all reports
    let allData: any[] = [];
    
    for (const reportId of reportIds) {
      const reportName = reportMap.get(reportId) || reportId;
      
      // Build query
      let query = supabase
        .from('dimension_data')
        .select('dimension_values')
        .eq('report_id', reportId);

      // Apply date filters if provided
      if (dateFrom && dateTo) {
        // Find Date dimension
        const { data: dateDimension } = await supabase
          .from('dimensions')
          .select('id')
          .eq('type', 'date')
          .eq('name', 'Date')
          .eq('scope', 'global')
          .maybeSingle();

        if (dateDimension?.id) {
          // PostgreSQL JSONB filtering for date range
          query = query
            .gte(`dimension_values->>${dateDimension.id}`, dateFrom)
            .lte(`dimension_values->>${dateDimension.id}`, dateTo);
        }
      }

      // Apply dimension filters using dimension names
      for (const [dimId, values] of Object.entries(dimensionFilters)) {
        if (values && values.length > 0) {
          const dimName = dimensionIdToName.get(dimId);
          if (dimName) {
            // For PostgreSQL JSONB, use dimension name to filter
            const conditions = values.map(v => `dimension_values->>'${dimName}' = '${v.replace(/'/g, "''")}'`).join(' OR ');
            query = query.or(conditions);
          }
        }
      }

      // Apply master dimension filter if provided
      if (masterDimensionName && masterDimensionValues && masterDimensionValues.length > 0) {
        const conditions = masterDimensionValues.map(v => `dimension_values->>'${masterDimensionName}' = '${v.replace(/'/g, "''")}'`).join(' OR ');
        query = query.or(conditions);
      }

      const { data: dimensionData, error: dataError } = await query.limit(10000);

      if (dataError) {
        console.error(`Error fetching data for report ${reportId}:`, dataError);
        continue;
      }

      // Add report name to each row's dimension values
      if (dimensionData) {
        dimensionData.forEach(row => {
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

    console.log(`[CONSOLIDATED-DATA] Loaded ${allData.length} total rows from ${reportIds.length} reports`);

    // Group and aggregate data
    const groupedData = new Map<string, any>();
    const allDimIds = [...groupByDims, ...requestData.breakdownDims, ...requestData.thenByDims];
    
    // Add Report dimension to grouping if not already included
    if (!allDimIds.includes(REPORT_DIMENSION_ID)) {
      allDimIds.unshift(REPORT_DIMENSION_ID);
    }

    allData.forEach(row => {
      const dimValues = row.dimension_values;
      
      // Create group key
      const groupKey = allDimIds.map(dimId => dimValues[dimId] || '').join('|');
      
      if (!groupedData.has(groupKey)) {
        groupedData.set(groupKey, {
          dimension_values: {},
          metrics: {}
        });
      }

      const group = groupedData.get(groupKey)!;
      
      // Store dimension values
      allDimIds.forEach(dimId => {
        if (!group.dimension_values[dimId]) {
          group.dimension_values[dimId] = dimValues[dimId] || '';
        }
      });

      // Aggregate metrics (numerical and currency dimensions)
      visibleDimensionIds.forEach(dimId => {
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
    visibleDimensionIds.forEach(dimId => {
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

    console.log(`[CONSOLIDATED-DATA] Returning ${result.length} grouped rows with ${Object.keys(totals).length} totals`);

    return new Response(
      JSON.stringify({ 
        data: result,
        totals,
        reportDimensionId: REPORT_DIMENSION_ID
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[CONSOLIDATED-DATA] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
