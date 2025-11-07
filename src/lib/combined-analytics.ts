import { supabase } from "@/integrations/supabase/client";

export interface MasterFilterState {
  mode: 'individual' | 'combined';
  dimension: string | null;
  values: string[];
  dateRange?: { from: Date; to: Date };
  datePreset?: string;
  aggregationMethod: 'sum' | 'average' | 'weighted';
}

export interface CombinedMetrics {
  impressions: number;
  clicks: number;
  conversions: number;
  cost: number;
  revenue: number;
  ctr: number;
  conversionRate: number;
  cpc: number;
  roas: number;
  costOfSale: number;
  budget?: number;
}

export interface CombinedAnalyticsData {
  metrics: CombinedMetrics;
  timeSeriesData: Array<{
    date: string;
    metrics: CombinedMetrics;
    reportCount: number;
  }>;
  tableData: Array<{
    date: string;
    metrics: CombinedMetrics;
    reportSources: string[];
  }>;
}

/**
 * Get combined analytics data across multiple reports
 */
export async function getCombinedAnalytics(
  reportIds: string[],
  masterFilter: MasterFilterState,
  dateGranularity: 'day' | 'week' | 'month' | 'year' = 'day'
): Promise<CombinedAnalyticsData> {
  console.log('[COMBINED-ANALYTICS] Fetching data for reports:', reportIds);
  
  if (reportIds.length === 0) {
    return {
      metrics: getEmptyMetrics(),
      timeSeriesData: [],
      tableData: []
    };
  }

  try {
    // Build query to get dimension data for all reports
    let query = supabase
      .from('dimension_data')
      .select('dimension_values, report_id')
      .in('report_id', reportIds);

    // Apply master filter if present
    if (masterFilter.dimension && masterFilter.values.length > 0) {
      // We need to filter by checking if the dimension value is in the selected values
      // This is tricky with JSONB, so we'll do it client-side after fetching
    }

    const { data, error } = await query.limit(50000);

    if (error) {
      console.error('[COMBINED-ANALYTICS] Error fetching data:', error);
      throw error;
    }

    console.log('[COMBINED-ANALYTICS] Fetched rows:', data?.length || 0);

    // Filter data based on master filter (client-side)
    let filteredData = data || [];
    if (masterFilter.dimension && masterFilter.values.length > 0) {
      filteredData = filteredData.filter(row => {
        const value = row.dimension_values[masterFilter.dimension!];
        return masterFilter.values.includes(value);
      });
    }

    // Get report names for report sources
    const { data: reportsData } = await supabase
      .from('reports')
      .select('id, name')
      .in('id', reportIds);

    const reportNamesMap = new Map(
      (reportsData || []).map(r => [r.id, r.name])
    );

    // Load dimensions to find metric dimension IDs
    const { data: dimensions } = await supabase
      .from('dimensions')
      .select('id, name, type, report_id')
      .in('report_id', reportIds)
      .in('name', [
        'Impressions', 'Clicks', 'Conversions', 'Cost', 'Revenue',
        'Date', 'Week', 'Month', 'Year'
      ]);

    // Create dimension maps by report
    const dimensionMaps = new Map<string, Map<string, string>>();
    (dimensions || []).forEach(dim => {
      if (!dim.report_id) return;
      if (!dimensionMaps.has(dim.report_id)) {
        dimensionMaps.set(dim.report_id, new Map());
      }
      dimensionMaps.get(dim.report_id)!.set(dim.name, dim.id);
    });

    // Aggregate data
    const aggregatedMetrics = aggregateMetrics(
      filteredData,
      dimensionMaps,
      masterFilter.aggregationMethod
    );

    // Group by date for time series
    const timeSeriesData = aggregateByDate(
      filteredData,
      dimensionMaps,
      dateGranularity,
      masterFilter.aggregationMethod
    );

    // Create table data
    const tableData = timeSeriesData.map(ts => ({
      date: ts.date,
      metrics: ts.metrics,
      reportSources: Array.from(new Set(
        filteredData
          .filter(row => getDateValue(row, dimensionMaps.get(row.report_id), dateGranularity) === ts.date)
          .map(row => reportNamesMap.get(row.report_id) || 'Unknown')
      ))
    }));

    return {
      metrics: aggregatedMetrics,
      timeSeriesData,
      tableData
    };

  } catch (error) {
    console.error('[COMBINED-ANALYTICS] Error in getCombinedAnalytics:', error);
    throw error;
  }
}

/**
 * Aggregate metrics across all data rows
 */
function aggregateMetrics(
  data: any[],
  dimensionMaps: Map<string, Map<string, string>>,
  method: 'sum' | 'average' | 'weighted'
): CombinedMetrics {
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalConversions = 0;
  let totalCost = 0;
  let totalRevenue = 0;
  let rowCount = 0;

  data.forEach(row => {
    const dimMap = dimensionMaps.get(row.report_id);
    if (!dimMap) return;

    const impressions = parseFloat(row.dimension_values[dimMap.get('Impressions')] || 0);
    const clicks = parseFloat(row.dimension_values[dimMap.get('Clicks')] || 0);
    const conversions = parseFloat(row.dimension_values[dimMap.get('Conversions')] || 0);
    const cost = parseFloat(row.dimension_values[dimMap.get('Cost')] || 0);
    const revenue = parseFloat(row.dimension_values[dimMap.get('Revenue')] || 0);

    totalImpressions += impressions;
    totalClicks += clicks;
    totalConversions += conversions;
    totalCost += cost;
    totalRevenue += revenue;
    rowCount++;
  });

  // For average method, divide by row count
  if (method === 'average' && rowCount > 0) {
    totalImpressions /= rowCount;
    totalClicks /= rowCount;
    totalConversions /= rowCount;
    totalCost /= rowCount;
    totalRevenue /= rowCount;
  }

  return calculateDerivedMetrics({
    impressions: totalImpressions,
    clicks: totalClicks,
    conversions: totalConversions,
    cost: totalCost,
    revenue: totalRevenue
  });
}

/**
 * Aggregate data by date
 */
function aggregateByDate(
  data: any[],
  dimensionMaps: Map<string, Map<string, string>>,
  granularity: 'day' | 'week' | 'month' | 'year',
  method: 'sum' | 'average' | 'weighted'
): Array<{ date: string; metrics: CombinedMetrics; reportCount: number }> {
  const dateGroups = new Map<string, any[]>();

  data.forEach(row => {
    const dimMap = dimensionMaps.get(row.report_id);
    if (!dimMap) return;

    const dateValue = getDateValue(row, dimMap, granularity);
    if (!dateValue) return;

    if (!dateGroups.has(dateValue)) {
      dateGroups.set(dateValue, []);
    }
    dateGroups.get(dateValue)!.push(row);
  });

  const result: Array<{ date: string; metrics: CombinedMetrics; reportCount: number }> = [];

  dateGroups.forEach((rows, date) => {
    const metrics = aggregateMetrics(rows, dimensionMaps, method);
    const uniqueReports = new Set(rows.map(r => r.report_id));
    
    result.push({
      date,
      metrics,
      reportCount: uniqueReports.size
    });
  });

  return result.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get date value from row based on granularity
 */
function getDateValue(
  row: any,
  dimMap: Map<string, string> | undefined,
  granularity: 'day' | 'week' | 'month' | 'year'
): string | null {
  if (!dimMap) return null;

  const dateId = dimMap.get('Date');
  if (!dateId) return null;

  const dateStr = row.dimension_values[dateId];
  if (!dateStr) return null;

  try {
    const date = new Date(dateStr);
    
    switch (granularity) {
      case 'day':
        return dateStr;
      case 'week':
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        return weekStart.toISOString().split('T')[0];
      case 'month':
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      case 'year':
        return String(date.getFullYear());
      default:
        return dateStr;
    }
  } catch {
    return null;
  }
}

/**
 * Calculate derived metrics from base metrics
 */
function calculateDerivedMetrics(base: {
  impressions: number;
  clicks: number;
  conversions: number;
  cost: number;
  revenue: number;
}): CombinedMetrics {
  const ctr = base.impressions > 0 ? (base.clicks / base.impressions) * 100 : 0;
  const conversionRate = base.clicks > 0 ? (base.conversions / base.clicks) * 100 : 0;
  const cpc = base.clicks > 0 ? base.cost / base.clicks : 0;
  const roas = base.cost > 0 ? base.revenue / base.cost : 0;
  const costOfSale = base.revenue > 0 ? (base.cost / base.revenue) * 100 : 0;

  return {
    impressions: base.impressions,
    clicks: base.clicks,
    conversions: base.conversions,
    cost: base.cost,
    revenue: base.revenue,
    ctr,
    conversionRate,
    cpc,
    roas,
    costOfSale
  };
}

/**
 * Get empty metrics object
 */
function getEmptyMetrics(): CombinedMetrics {
  return {
    impressions: 0,
    clicks: 0,
    conversions: 0,
    cost: 0,
    revenue: 0,
    ctr: 0,
    conversionRate: 0,
    cpc: 0,
    roas: 0,
    costOfSale: 0
  };
}
