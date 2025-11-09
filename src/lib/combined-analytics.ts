import { supabase } from "@/integrations/supabase/client";
import { format, startOfWeek, startOfMonth, startOfYear, getWeek } from "date-fns";

export interface MasterFilterState {
  mode: 'individual' | 'combined';
  dimension: string | null;
  values: string[];
  dateRange?: { from: Date; to: Date };
  datePreset?: string;
  reportIds?: string[]; // Filter by specific reports
  aggregationMethod: 'sum' | 'average' | 'weighted';
  groupByDimensions?: string[];
  breakdownDimensions?: string[];
  thenByDimensions?: string[];
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
    date?: string;
    metrics: CombinedMetrics;
    reportSources: string[];
    dimensionValues?: Record<string, string>;
    groupKey?: string;
  }>;
}

/**
 * Get combined analytics data across multiple reports
 */
export async function getCombinedAnalytics(
  reportIds: string[],
  masterFilter: MasterFilterState,
  dateGranularity: 'day' | 'week' | 'month' | 'year' = 'day',
  dateOrder: 'asc' | 'desc' = 'desc'
): Promise<CombinedAnalyticsData> {
  console.log('[COMBINED-ANALYTICS] Fetching data for reports:', reportIds);
  console.log('[COMBINED-ANALYTICS] Master filter:', masterFilter);
  
  if (reportIds.length === 0) {
    console.log('[COMBINED-ANALYTICS] No report IDs provided, returning empty data');
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

    // Apply date range filter if present
    if (masterFilter.dateRange) {
      // We'll filter by date client-side after loading dimension IDs
    }

    const { data, error } = await query.limit(50000);

    if (error) {
      console.error('[COMBINED-ANALYTICS] Error fetching dimension data:', error);
      throw new Error(`Failed to fetch dimension data: ${error.message}`);
    }

    console.log('[COMBINED-ANALYTICS] Fetched rows:', data?.length || 0);

    // Filter data based on master filter (client-side)
    let filteredData = data || [];
    
    if (filteredData.length === 0) {
      console.warn('[COMBINED-ANALYTICS] No dimension data found for the selected reports');
      return {
        metrics: getEmptyMetrics(),
        timeSeriesData: [],
        tableData: []
      };
    }
    
    // Filter by dimension values
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
    // Try both account-scoped and report-specific dimensions
    const { data: dimensions } = await supabase
      .from('dimensions')
      .select('id, name, type, report_id, account_id, scope')
      .or(`report_id.in.(${reportIds.join(',')}),scope.eq.account`)
      .in('name', [
        'Impressions', 'Clicks', 'Conversions', 'Cost', 'Revenue',
        'Date', 'Week', 'Month', 'Year'
      ]);

    console.log('[COMBINED-ANALYTICS] Loaded dimensions:', dimensions?.length || 0);

    // Create dimension maps by report
    // Prioritize report-specific dimensions over account-scoped ones
    const dimensionMaps = new Map<string, Map<string, string>>();
    (dimensions || []).forEach(dim => {
      // For account-scoped dimensions, add to all reports
      if (dim.scope === 'account' || dim.scope === 'global') {
        reportIds.forEach(reportId => {
          if (!dimensionMaps.has(reportId)) {
            dimensionMaps.set(reportId, new Map());
          }
          const dimMap = dimensionMaps.get(reportId)!;
          // Only add if not already present (report-specific takes precedence)
          if (!dimMap.has(dim.name)) {
            dimMap.set(dim.name, dim.id);
          }
        });
      }
      
      // For report-specific dimensions
      if (dim.report_id) {
        if (!dimensionMaps.has(dim.report_id)) {
          dimensionMaps.set(dim.report_id, new Map());
        }
        // Report-specific dimensions override account-scoped
        dimensionMaps.get(dim.report_id)!.set(dim.name, dim.id);
      }
    });

    console.log('[COMBINED-ANALYTICS] Created dimension maps for reports:', Array.from(dimensionMaps.keys()));

    // Filter by date range if present
    if (masterFilter.dateRange) {
      const fromDate = masterFilter.dateRange.from.toISOString().split('T')[0];
      const toDate = masterFilter.dateRange.to.toISOString().split('T')[0];
      
      filteredData = filteredData.filter(row => {
        const dimMap = dimensionMaps.get(row.report_id);
        if (!dimMap) return false;
        
        const dateId = dimMap.get('Date');
        if (!dateId) return false;
        
        const dateStr = row.dimension_values[dateId];
        if (!dateStr) return false;
        
        return dateStr >= fromDate && dateStr <= toDate;
      });
    }

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
      masterFilter.aggregationMethod,
      dateOrder
    );

    // Create table data based on grouping
    let tableData: Array<{
      date?: string;
      metrics: CombinedMetrics;
      reportSources: string[];
      dimensionValues?: Record<string, string>;
      groupKey?: string;
    }>;

    const hasGrouping = (masterFilter.groupByDimensions && masterFilter.groupByDimensions.length > 0) ||
                        (masterFilter.breakdownDimensions && masterFilter.breakdownDimensions.length > 0) ||
                        (masterFilter.thenByDimensions && masterFilter.thenByDimensions.length > 0);

    if (hasGrouping) {
      // Group by dimensions
      tableData = aggregateByDimensions(
        filteredData,
        dimensionMaps,
        reportNamesMap,
        masterFilter.groupByDimensions || [],
        masterFilter.breakdownDimensions || [],
        masterFilter.thenByDimensions || [],
        dateGranularity,
        masterFilter.aggregationMethod,
        dateOrder
      );
    } else {
      // Default grouping by date
      tableData = timeSeriesData.map(ts => ({
        date: ts.date,
        metrics: ts.metrics,
        reportSources: Array.from(new Set(
          filteredData
            .filter(row => getDateValue(row, dimensionMaps.get(row.report_id), dateGranularity) === ts.date)
            .map(row => reportNamesMap.get(row.report_id) || 'Unknown')
        ))
      }));
    }

    return {
      metrics: aggregatedMetrics,
      timeSeriesData,
      tableData
    };

  } catch (error) {
    console.error('[COMBINED-ANALYTICS] Error in getCombinedAnalytics:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[COMBINED-ANALYTICS] Error details:', errorMessage);
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

  console.log('[COMBINED-ANALYTICS] Aggregating metrics from rows:', data.length);

  data.forEach((row, index) => {
    const dimMap = dimensionMaps.get(row.report_id);
    if (!dimMap) {
      if (index < 3) console.log('[COMBINED-ANALYTICS] No dimension map for report:', row.report_id);
      return;
    }

    const impressions = parseFloat(row.dimension_values[dimMap.get('Impressions')] || 0);
    const clicks = parseFloat(row.dimension_values[dimMap.get('Clicks')] || 0);
    const conversions = parseFloat(row.dimension_values[dimMap.get('Conversions')] || 0);
    const cost = parseFloat(row.dimension_values[dimMap.get('Cost')] || 0);
    const revenue = parseFloat(row.dimension_values[dimMap.get('Revenue')] || 0);

    if (index < 3) {
      console.log('[COMBINED-ANALYTICS] Row', index, ':', {
        impressions, clicks, conversions, cost, revenue,
        dimMap: Array.from(dimMap.entries())
      });
    }

    totalImpressions += impressions;
    totalClicks += clicks;
    totalConversions += conversions;
    totalCost += cost;
    totalRevenue += revenue;
    rowCount++;
  });

  console.log('[COMBINED-ANALYTICS] Totals:', {
    totalImpressions, totalClicks, totalConversions, totalCost, totalRevenue, rowCount
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
  method: 'sum' | 'average' | 'weighted',
  dateOrder: 'asc' | 'desc' = 'desc'
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

  return result.sort((a, b) => {
    const comparison = a.date.localeCompare(b.date);
    return dateOrder === 'asc' ? comparison : -comparison;
  });
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
        return format(date, 'yyyy-MM-dd');
      case 'week':
        const weekStart = startOfWeek(date, { weekStartsOn: 0 });
        return `Week ${getWeek(date)}, ${format(date, 'yyyy')}`;
      case 'month':
        return format(date, 'MMM yyyy');
      case 'year':
        return format(date, 'yyyy');
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
 * Aggregate data by dimensions with grouping and breakdown
 */
function aggregateByDimensions(
  data: any[],
  dimensionMaps: Map<string, Map<string, string>>,
  reportNamesMap: Map<string, string>,
  groupByDims: string[],
  breakdownDims: string[],
  thenByDims: string[],
  dateGranularity: 'day' | 'week' | 'month' | 'year',
  method: 'sum' | 'average' | 'weighted',
  dateOrder: 'asc' | 'desc' = 'desc'
): Array<{
  date?: string;
  metrics: CombinedMetrics;
  reportSources: string[];
  dimensionValues?: Record<string, string>;
  groupKey?: string;
}> {
  const allDimensions = [...groupByDims, ...breakdownDims, ...thenByDims];
  const groups = new Map<string, any[]>();

  // Group data by all selected dimensions
  data.forEach(row => {
    const dimMap = dimensionMaps.get(row.report_id);
    if (!dimMap) return;

    // Build group key from dimension values
    const keyParts: string[] = [];
    const dimensionValues: Record<string, string> = {};

    // Add date if no grouping dimensions
    if (allDimensions.length === 0) {
      const dateValue = getDateValue(row, dimMap, dateGranularity);
      if (dateValue) {
        keyParts.push(dateValue);
        dimensionValues['Date'] = dateValue;
      }
    } else {
      // Add all grouping dimensions to key
      allDimensions.forEach(dimId => {
        const value = row.dimension_values[dimId] || 'Unknown';
        keyParts.push(value);
        dimensionValues[dimId] = value;
      });
      
      // Also include date for time-based grouping
      const dateValue = getDateValue(row, dimMap, dateGranularity);
      if (dateValue) {
        keyParts.push(dateValue);
        dimensionValues['Date'] = dateValue;
      }
    }

    const groupKey = keyParts.join('||');
    
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)!.push(row);
  });

  // Aggregate metrics for each group
  const result: Array<{
    date?: string;
    metrics: CombinedMetrics;
    reportSources: string[];
    dimensionValues?: Record<string, string>;
    groupKey?: string;
  }> = [];

  groups.forEach((rows, groupKey) => {
    const metrics = aggregateMetrics(rows, dimensionMaps, method);
    const reportSources = Array.from(new Set(
      rows.map(r => reportNamesMap.get(r.report_id) || 'Unknown')
    ));

    // Extract dimension values from first row
    const firstRow = rows[0];
    const dimMap = dimensionMaps.get(firstRow.report_id);
    const dimensionValues: Record<string, string> = {};
    
    allDimensions.forEach(dimId => {
      dimensionValues[dimId] = firstRow.dimension_values[dimId] || 'Unknown';
    });

    const dateValue = dimMap ? getDateValue(firstRow, dimMap, dateGranularity) : undefined;

    result.push({
      date: dateValue || undefined,
      metrics,
      reportSources,
      dimensionValues,
      groupKey
    });
  });

  // Sort by date if available, otherwise by group key
  return result.sort((a, b) => {
    if (a.date && b.date) {
      const comparison = a.date.localeCompare(b.date);
      return dateOrder === 'asc' ? comparison : -comparison;
    }
    return (a.groupKey || '').localeCompare(b.groupKey || '');
  });
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
