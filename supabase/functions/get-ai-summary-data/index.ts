// @ts-ignore - Deno resolves remote module imports at runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Formula metrics that should be calculated, not summed
const FORMULA_METRICS = ['CTR', 'ROAS', 'Conversion rate', 'CPC', 'Cost of sale', 'COS'];
const BASE_METRICS = ['Impressions', 'Clicks', 'Cost', 'Revenue', 'Conversions', 'Bookings'];

const calculateFormulaMetrics = (baseValues: Record<string, number>): Record<string, number> => {
  const result: Record<string, number> = {};
  const impressions = baseValues['Impressions'] || 0;
  const clicks = baseValues['Clicks'] || 0;
  const cost = baseValues['Cost'] || 0;
  const revenue = baseValues['Revenue'] || 0;
  const conversions = baseValues['Conversions'] || baseValues['Bookings'] || 0;

  result['CTR'] = impressions > 0 ? (clicks / impressions) * 100 : 0;
  result['ROAS'] = cost > 0 ? revenue / cost : 0;
  result['Conversion rate'] = clicks > 0 ? (conversions / clicks) * 100 : 0;
  result['CPC'] = clicks > 0 ? cost / clicks : 0;
  result['Cost of sale'] = revenue > 0 ? (cost / revenue) * 100 : 0;
  result['COS'] = result['Cost of sale'];

  return result;
};

const parseDate = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  const dateStr = String(value).trim();
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
};

const isWithinDateRange = (date: Date, start: Date, end: Date): boolean => {
  return date >= start && date <= end;
};

const getDateRange = (tab: string, sinceDate?: string): { start: Date; end: Date } => {
  const now = new Date();
  
  // Handle specific month keys like "2025-11"
  if (tab.match(/^\d{4}-\d{2}$/)) {
    const [year, month] = tab.split('-').map(Number);
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59, 999);
    return { start, end };
  }

  // For "all" - use since_date to current date
  if (tab === "all" || !tab) {
    const start = sinceDate ? new Date(sinceDate) : new Date(now.getFullYear(), 0, 1);
    return { start, end: now };
  }
  
  switch (tab) {
    case "mtd":
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: now,
      };
    case "ytd":
      return {
        start: new Date(now.getFullYear(), 0, 1),
        end: now,
      };
    default:
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        end: now,
      };
  }
};

interface ColumnMapping {
  column: string;
  dimensionId: string;
  dimensionName: string;
  visible: boolean;
}

// @ts-ignore - Deno global is available in Edge Functions runtime
Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get cardId from query parameters
    const url = new URL(req.url);
    const cardId = url.searchParams.get('cardId');

    if (!cardId) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'cardId query parameter is required',
          count: 0,
          data: []
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(cardId)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invalid card ID format. Expected UUID.',
          count: 0,
          data: []
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client with service role key
    // @ts-ignore - Deno env is available in Edge Functions runtime
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    // @ts-ignore - Deno env is available in Edge Functions runtime
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`[GET-AI-SUMMARY-DATA] Fetching data for card: ${cardId}`);

    // Fetch AI Summary card
    const { data: card, error: cardError } = await supabase
      .from('ai_summary_cards')
      .select('id, report_ids, report_configs, selected_metrics, since_date')
      .eq('id', cardId)
      .maybeSingle();

    if (cardError) {
      console.error('[GET-AI-SUMMARY-DATA] Error fetching card:', cardError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: cardError.message,
          count: 0,
          data: []
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!card) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Card not found',
          count: 0,
          data: []
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const reportIds = card.report_ids || [];
    const selectedMetrics = card.selected_metrics || [];
    const sinceDate = card.since_date;

    // Calculate toDate
    const now = new Date();
    const toDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    if (reportIds.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          count: 0,
          since: sinceDate,
          to: toDate,
          data: { mtd: [], ytd: [] },
          reports: [],
          dimensions: []
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch reports with their names
    const { data: reports } = await supabase
      .from('reports')
      .select('id, name')
      .in('id', reportIds);

    const reportNameMap: Record<string, string> = {};
    (reports || []).forEach((r: any) => {
      reportNameMap[r.id] = r.name;
    });

    // Fetch data sources with column mappings for each report
    const { data: dataSources } = await supabase
      .from('data_sources')
      .select('id, report_id, column_mappings')
      .in('report_id', reportIds);

    // Build dimension name → ID mapping per report
    const reportDimensionMaps: Record<string, Record<string, string>> = {};
    const reportDateDimIds: Record<string, string> = {};

    (dataSources || []).forEach((ds: any) => {
      if (!ds.column_mappings) return;
      
      const mappings = ds.column_mappings as ColumnMapping[];
      const dimMap: Record<string, string> = {};
      
      mappings.forEach((m: ColumnMapping) => {
        if (m.visible && m.dimensionId && m.dimensionName) {
          // Map dimension name to ID
          dimMap[m.dimensionName] = m.dimensionId;
          
          // Also track Date dimension
          if (m.dimensionName.toLowerCase() === 'date' || m.column.toLowerCase() === 'date') {
            reportDateDimIds[ds.report_id] = m.dimensionId;
          }
        }
      });
      
      reportDimensionMaps[ds.report_id] = dimMap;
    });

    console.log(`[GET-AI-SUMMARY-DATA] Built dimension maps for ${Object.keys(reportDimensionMaps).length} reports`);

    // Get date ranges - use "all" to get all data since sinceDate
    const allDataRange = getDateRange('all', sinceDate);
    const mtdRange = getDateRange('mtd');
    const ytdRange = getDateRange('ytd');

    console.log(`[GET-AI-SUMMARY-DATA] Date ranges - All: ${allDataRange.start.toISOString()} to ${allDataRange.end.toISOString()}, MTD: ${mtdRange.start.toISOString()} to ${mtdRange.end.toISOString()}, YTD: ${ytdRange.start.toISOString()} to ${ytdRange.end.toISOString()}`);

    // Aggregate metrics for each report
    const allResults: any[] = [];
    const mtdResults: any[] = [];
    const ytdResults: any[] = [];

    for (const reportId of reportIds) {
      const dimMap = reportDimensionMaps[reportId] || {};
      const dateDimId = reportDateDimIds[reportId];
      
      if (!dateDimId) {
        console.log(`[GET-AI-SUMMARY-DATA] No date dimension found for report ${reportId}, dimension map keys: ${Object.keys(dimMap).join(', ')}`);
        // Still add empty metrics for this report
        allResults.push({
          reportId,
          reportName: reportNameMap[reportId] || 'Unknown',
          metrics: {}
        });
        mtdResults.push({
          reportId,
          reportName: reportNameMap[reportId] || 'Unknown',
          metrics: {}
        });
        ytdResults.push({
          reportId,
          reportName: reportNameMap[reportId] || 'Unknown',
          metrics: {}
        });
        continue;
      }

      // Fetch dimension_data for this report
      const { data: dimensionData, error: dimError } = await supabase
        .from('dimension_data')
        .select('dimension_values')
        .eq('report_id', reportId);

      if (dimError) {
        console.error(`[GET-AI-SUMMARY-DATA] Error fetching dimension_data for report ${reportId}:`, dimError);
        continue;
      }

      console.log(`[GET-AI-SUMMARY-DATA] Fetched ${dimensionData?.length || 0} rows for report ${reportId}`);

      // Sample the first row to debug date dimension
      if (dimensionData && dimensionData.length > 0) {
        const sampleRow = dimensionData[0].dimension_values || {};
        const sampleDateValue = sampleRow[dateDimId];
        console.log(`[GET-AI-SUMMARY-DATA] Sample date value for ${reportId}: "${sampleDateValue}" (dim ID: ${dateDimId})`);
      }

      // Aggregate for ALL data (since sinceDate)
      const allMetrics = aggregateMetricsFromData(
        dimensionData || [],
        selectedMetrics,
        dimMap,
        dateDimId,
        allDataRange
      );

      // Aggregate for MTD
      const mtdMetrics = aggregateMetricsFromData(
        dimensionData || [],
        selectedMetrics,
        dimMap,
        dateDimId,
        mtdRange
      );

      // Aggregate for YTD
      const ytdMetrics = aggregateMetricsFromData(
        dimensionData || [],
        selectedMetrics,
        dimMap,
        dateDimId,
        ytdRange
      );

      allResults.push({
        reportId,
        reportName: reportNameMap[reportId] || 'Unknown',
        metrics: allMetrics
      });

      mtdResults.push({
        reportId,
        reportName: reportNameMap[reportId] || 'Unknown',
        metrics: mtdMetrics
      });

      ytdResults.push({
        reportId,
        reportName: reportNameMap[reportId] || 'Unknown',
        metrics: ytdMetrics
      });
    }

    // Count total data points from all results
    let totalCount = 0;
    allResults.forEach(r => {
      Object.values(r.metrics).forEach((v: any) => {
        if (typeof v === 'number' && v > 0) totalCount++;
      });
    });

    const responseData = {
      success: true,
      count: totalCount,
      since: sinceDate,
      to: toDate,
      cached: false,
      data: {
        all: allResults,
        mtd: mtdResults,
        ytd: ytdResults
      },
      reports: reportIds.map((id: string) => ({
        report_id: id,
        report_name: reportNameMap[id] || 'Unknown',
        count: allResults.find(r => r.reportId === id)?.metrics ? Object.keys(allResults.find(r => r.reportId === id)?.metrics || {}).length : 0
      })),
      dimensions: []
    };

    console.log(`[GET-AI-SUMMARY-DATA] Returning computed data for ${reportIds.length} reports`);

    return new Response(
      JSON.stringify(responseData),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[GET-AI-SUMMARY-DATA] Fatal error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        count: 0,
        data: []
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Helper function to aggregate metrics from dimension_data
function aggregateMetricsFromData(
  dimensionData: any[],
  selectedMetrics: string[],
  dimMap: Record<string, string>,
  dateDimId: string,
  dateRange: { start: Date; end: Date }
): Record<string, number> {
  const result: Record<string, number> = {};
  
  // Initialize all metrics including base metrics
  const allMetrics = new Set([...selectedMetrics, ...BASE_METRICS]);
  allMetrics.forEach(m => {
    result[m] = 0;
  });

  // Filter and aggregate
  let rowsInRange = 0;
  dimensionData.forEach((row: any) => {
    const dimValues = row.dimension_values || {};
    
    // Get date value
    const dateValue = dimValues[dateDimId];
    const rowDate = parseDate(dateValue);
    
    if (!rowDate || !isWithinDateRange(rowDate, dateRange.start, dateRange.end)) {
      return;
    }
    
    rowsInRange++;

    // Sum up base metrics
    allMetrics.forEach(metricName => {
      if (FORMULA_METRICS.includes(metricName)) return;
      
      // Get dimension ID for this metric
      const dimId = dimMap[metricName];
      if (!dimId) return;
      
      const value = dimValues[dimId];
      if (value !== undefined && value !== null) {
        const numValue = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
        if (!isNaN(numValue)) {
          result[metricName] += numValue;
        }
      }
    });
  });

  console.log(`[GET-AI-SUMMARY-DATA] Aggregated ${rowsInRange} rows in date range`);

  // Calculate formula metrics
  const formulaValues = calculateFormulaMetrics(result);
  FORMULA_METRICS.forEach(metric => {
    if (selectedMetrics.includes(metric)) {
      result[metric] = formulaValues[metric] || 0;
    }
  });

  // Return only selected metrics
  const finalResult: Record<string, number> = {};
  selectedMetrics.forEach(m => {
    finalResult[m] = result[m] || 0;
  });

  return finalResult;
}