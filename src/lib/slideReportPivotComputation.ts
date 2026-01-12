/**
 * Service for computing pivot tables for slide reports
 * Aggregates data from dimension_data to create fast-loading pivot tables
 * 
 * OPTIMIZED STRUCTURE:
 * - Data for 3 years (2024, 2025, 2026) is pre-computed and stored as JSON
 * - Monthly and yearly aggregations allow instant filtering without re-computation
 * - Channel-specific breakdowns enable fast tab switching
 */

import { supabase } from "@/integrations/supabase/client";
import { 
  SlideReportPivotData, 
  ChannelMetrics, 
  BreakdownRow, 
  MonthlyBudgetRow,
  SlideReportConfiguration 
} from "@/types/slideReports";
import { aggregateMetrics, parseDate } from "@/components/AISummaryPivotTable";
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, startOfYear, isWithinInterval } from "date-fns";

const BASE_METRICS = ["Impressions", "Clicks", "Cost", "Revenue", "Bookings"];

// Progress callback type for UI updates
export type ProgressCallback = (step: number, message: string) => void;

/**
 * Calculate derived metrics from base metrics
 */
function calculateDerivedMetrics(data: {
  impressions: number;
  clicks: number;
  cost: number;
  revenue: number;
  bookings: number;
}): ChannelMetrics {
  return {
    impressions: data.impressions,
    clicks: data.clicks,
    cost: data.cost,
    revenue: data.revenue,
    bookings: data.bookings,
    ctr: data.clicks > 0 && data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0,
    conversionRate: data.clicks > 0 ? (data.bookings / data.clicks) * 100 : 0,
    cpc: data.clicks > 0 ? data.cost / data.clicks : 0,
    roas: data.cost > 0 ? data.revenue / data.cost : 0,
    costOfSale: data.revenue > 0 ? (data.cost / data.revenue) * 100 : 0,
  };
}

/**
 * Build metric name to dimension ID mapping for a report
 * This is crucial for aggregateMetrics to work with UUID-keyed dimension_data
 */
async function buildMetricNameToIdMap(reportId: string): Promise<Record<string, string>> {
  // Get a sample row to find the dimension IDs used
  const { data: sampleRows } = await supabase
    .from('dimension_data')
    .select('dimension_values')
    .eq('report_id', reportId)
    .limit(1);

  if (!sampleRows || sampleRows.length === 0) {
    console.warn(`No data found for report ${reportId}`);
    return {};
  }

  const sampleRow = sampleRows[0].dimension_values as Record<string, any>;
  const dimensionIds = Object.keys(sampleRow);

  // Fetch dimension names for these IDs
  const { data: dimensions } = await supabase
    .from('dimensions')
    .select('id, name, type')
    .in('id', dimensionIds);

  if (!dimensions) {
    console.warn(`No dimensions found for report ${reportId}`);
    return {};
  }

  // Build name -> id mapping
  const nameToIdMap: Record<string, string> = {};
  dimensions.forEach(dim => {
    nameToIdMap[dim.name] = dim.id;
  });

  console.log(`Built metric map for report ${reportId}:`, Object.keys(nameToIdMap).join(', '));
  return nameToIdMap;
}

/**
 * Fetch dimension data for a report - optimized for large datasets
 */
async function fetchDimensionDataForReport(reportId: string): Promise<any[]> {
  const allRows: any[] = [];
  const batchSize = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('dimension_data')
      .select('dimension_values')
      .eq('report_id', reportId)
      .order('row_number', { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (error) throw error;

    if (data && data.length > 0) {
      allRows.push(...data.map(row => row.dimension_values));
      offset += batchSize;
      hasMore = data.length === batchSize;
    } else {
      hasMore = false;
    }
  }

  return allRows;
}

/**
 * Aggregate metrics from rows for a date range using the proper name-to-ID mapping
 */
function aggregateMetricsForDateRange(
  rows: any[],
  dateRange: { start: Date; end: Date },
  metricNameToIdMap: Record<string, string>,
  dimensionFilter?: { dimensionId: string; dimensionName?: string; values: string[] }
): { impressions: number; clicks: number; cost: number; revenue: number; bookings: number } {
  // Use the aggregateMetrics function with the proper mapping
  const metrics = aggregateMetrics(
    rows,
    BASE_METRICS,
    dateRange,
    dimensionFilter,
    metricNameToIdMap
  );

  return {
    impressions: metrics['Impressions'] || 0,
    clicks: metrics['Clicks'] || 0,
    cost: metrics['Cost'] || 0,
    revenue: metrics['Revenue'] || 0,
    bookings: metrics['Bookings'] || 0,
  };
}

/**
 * Compute breakdown data for a dimension
 */
function computeBreakdown(
  rows: any[],
  dateRange: { start: Date; end: Date },
  breakdownDimensionId: string,
  breakdownDimensionName: string,
  metricNameToIdMap: Record<string, string>,
  dimensionFilter?: { dimensionId: string; dimensionName?: string; values: string[] }
): BreakdownRow[] {
  const dateDimId = metricNameToIdMap['Date'];
  
  const filteredRows = rows.filter((row) => {
    const rowData = row.dimension_values || row;
    
    // Date filter using the mapped Date dimension ID
    let dateValue: any = dateDimId ? rowData[dateDimId] : null;
    if (!dateValue) {
      dateValue = rowData.Date || rowData.date || rowData.Day || rowData.day;
    }
    if (!dateValue) {
      for (const [key, val] of Object.entries(rowData)) {
        if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) {
          dateValue = val;
          break;
        }
      }
    }
    
    const rowDate = parseDate(dateValue);
    if (!rowDate) return false;
    if (!isWithinInterval(rowDate, { start: dateRange.start, end: dateRange.end })) return false;
    
    // Dimension filter
    if (dimensionFilter && dimensionFilter.values.length > 0) {
      const dimValue = rowData[dimensionFilter.dimensionId] || 
                     (dimensionFilter.dimensionName ? rowData[dimensionFilter.dimensionName] : undefined);
      if (dimValue === undefined) return false;
      const normalizedRowValue = String(dimValue).trim();
      const normalizedFilterValues = dimensionFilter.values.map(v => String(v).trim());
      if (!normalizedFilterValues.includes(normalizedRowValue)) return false;
    }
    
    return true;
  });

  // Group by breakdown dimension
  const groupedRows: Record<string, any[]> = {};
  filteredRows.forEach((row) => {
    const rowData = row.dimension_values || row;
    const breakdownValue = rowData[breakdownDimensionId] || 
                          (breakdownDimensionName ? rowData[breakdownDimensionName] : undefined);
    const groupKey = breakdownValue !== undefined && breakdownValue !== null && breakdownValue !== '' 
      ? String(breakdownValue).trim() 
      : 'Uncategorized';
    
    if (!groupedRows[groupKey]) {
      groupedRows[groupKey] = [];
    }
    groupedRows[groupKey].push(row);
  });

  // Compute metrics for each group
  const breakdownRows: BreakdownRow[] = [];
  Object.entries(groupedRows).forEach(([groupValue, groupRows]) => {
    const metrics = aggregateMetricsForDateRange(groupRows, dateRange, metricNameToIdMap);
    breakdownRows.push({
      [breakdownDimensionName.toLowerCase()]: groupValue,
      ...metrics,
    });
  });

  return breakdownRows;
}

/**
 * Compute monthly metrics for a year
 */
function computeMonthlyMetrics(
  rows: any[],
  year: number,
  metricNameToIdMap: Record<string, string>,
  dimensionFilter?: { dimensionId: string; dimensionName?: string; values: string[] }
): Record<string, ChannelMetrics> {
  const monthlyData: Record<string, ChannelMetrics> = {};
  const startOfYearDate = startOfYear(new Date(year, 0, 1));
  const now = new Date();
  const endDate = year === now.getFullYear() ? now : new Date(year, 11, 31);
  
  const months = eachMonthOfInterval({ start: startOfYearDate, end: endDate });
  
  months.forEach((month) => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    const monthKey = format(month, "yyyy-MM");
    
    const metrics = aggregateMetricsForDateRange(rows, { start: monthStart, end: monthEnd }, metricNameToIdMap, dimensionFilter);
    monthlyData[monthKey] = calculateDerivedMetrics(metrics);
  });

  return monthlyData;
}

/**
 * Compute monthly metrics for multiple years
 */
function computeAllMonthlyMetrics(
  rows: any[],
  years: number[],
  metricNameToIdMap: Record<string, string>,
  dimensionFilter?: { dimensionId: string; dimensionName?: string; values: string[] }
): Record<string, ChannelMetrics> {
  const allMonthlyData: Record<string, ChannelMetrics> = {};
  
  for (const year of years) {
    const yearlyMonthly = computeMonthlyMetrics(rows, year, metricNameToIdMap, dimensionFilter);
    Object.assign(allMonthlyData, yearlyMonthly);
  }

  return allMonthlyData;
}

/**
 * Compute yearly totals
 */
function computeYearlyMetrics(
  rows: any[],
  years: number[],
  metricNameToIdMap: Record<string, string>,
  dimensionFilter?: { dimensionId: string; dimensionName?: string; values: string[] }
): Record<string, ChannelMetrics> {
  const yearlyData: Record<string, ChannelMetrics> = {};
  
  for (const year of years) {
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);
    
    const metrics = aggregateMetricsForDateRange(rows, { start: yearStart, end: yearEnd }, metricNameToIdMap, dimensionFilter);
    yearlyData[String(year)] = calculateDerivedMetrics(metrics);
  }

  return yearlyData;
}

/**
 * Compute pivot data for a slide report
 * Computes data for all years (2024, 2025, 2026) and stores it for fast filtering
 * 
 * OPTIMIZATION NOTES:
 * - All 3 years of data are pre-computed once and stored as JSON
 * - Monthly data allows instant filtering by year/month without DB queries
 * - Yearly totals provide fast year-over-year comparisons
 * - Total JSON size is typically 10-50KB, loads instantly vs querying 60K+ rows
 */
export async function computeSlideReportPivotData(
  reportIds: Record<string, string>, // channel -> report_id
  configuration: SlideReportConfiguration,
  dateRange: { year: number; month: string; from: string; to: string },
  onProgress?: ProgressCallback
): Promise<SlideReportPivotData> {
  // Years to compute data for - covers past 3 years for historical comparison
  const YEARS_TO_COMPUTE = [2024, 2025, 2026];
  
  const pivotData: SlideReportPivotData = {
    overview: {
      current: {
        impressions: 0,
        clicks: 0,
        cost: 0,
        revenue: 0,
        bookings: 0,
        ctr: 0,
        conversionRate: 0,
        cpc: 0,
        roas: 0,
        costOfSale: 0,
      },
      monthly: {},
      yearly: {},
    },
    channels: {},
    budget: {
      monthly: [],
      totals: {
        totalBudget: 0,
        totalActual: 0,
        variance: 0,
      },
    },
    computedAt: new Date().toISOString(),
  };

  const currentDateRange = {
    start: new Date(dateRange.from),
    end: new Date(dateRange.to),
  };

  // Initialize overview aggregation structures
  const overviewMonthly: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }> = {};
  const overviewYearly: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }> = {};

  // Compute data for each channel
  let channelIndex = 0;
  for (const channel of configuration.selectedChannels) {
    const reportId = reportIds[channel];
    if (!reportId) continue;

    onProgress?.(3, `Processing ${channel} data...`);

    const channelConfig = configuration.channelConfigs[channel];
    const dimensionFilter = channelConfig?.dimensionId && channelConfig.selectedValues.length > 0
      ? {
          dimensionId: channelConfig.dimensionId,
          values: channelConfig.selectedValues,
        }
      : undefined;

    // Build metric name to ID mapping for this report
    const metricNameToIdMap = await buildMetricNameToIdMap(reportId);
    
    // Fetch dimension data
    const rows = await fetchDimensionDataForReport(reportId);
    console.log(`Fetched ${rows.length} rows for ${channel}, metric map keys: ${Object.keys(metricNameToIdMap).join(', ')}`);

    // Compute current period metrics
    const currentMetrics = aggregateMetricsForDateRange(rows, currentDateRange, metricNameToIdMap, dimensionFilter);
    const currentChannelMetrics = calculateDerivedMetrics(currentMetrics);

    // Compute previous period (previous month)
    const prevMonthStart = new Date(currentDateRange.start);
    prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);
    const prevMonthEnd = new Date(prevMonthStart);
    prevMonthEnd.setMonth(prevMonthEnd.getMonth() + 1);
    prevMonthEnd.setDate(0); // Last day of previous month
    
    const prevPeriodMetrics = aggregateMetricsForDateRange(
      rows, 
      { start: prevMonthStart, end: prevMonthEnd },
      metricNameToIdMap,
      dimensionFilter
    );
    const prevPeriodChannelMetrics = calculateDerivedMetrics(prevPeriodMetrics);

    // Compute previous year (same month last year)
    const prevYearStart = new Date(currentDateRange.start);
    prevYearStart.setFullYear(prevYearStart.getFullYear() - 1);
    const prevYearEnd = new Date(currentDateRange.end);
    prevYearEnd.setFullYear(prevYearEnd.getFullYear() - 1);
    
    const prevYearMetrics = aggregateMetricsForDateRange(
      rows, 
      { start: prevYearStart, end: prevYearEnd },
      metricNameToIdMap,
      dimensionFilter
    );
    const prevYearChannelMetrics = calculateDerivedMetrics(prevYearMetrics);

    // Compute monthly metrics for ALL years
    const allMonthly = computeAllMonthlyMetrics(rows, YEARS_TO_COMPUTE, metricNameToIdMap, dimensionFilter);
    
    // Compute yearly totals
    const yearly = computeYearlyMetrics(rows, YEARS_TO_COMPUTE, metricNameToIdMap, dimensionFilter);

    // Compute breakdowns for each breakdown dimension
    const breakdowns: Record<string, BreakdownRow[]> = {};
    const breakdownConfig = configuration.breakdownConfigs[channel];
    if (breakdownConfig?.breakdownDimensionIds) {
      for (const breakdownDimId of breakdownConfig.breakdownDimensionIds) {
        const breakdownDimName = breakdownDimId; // Using dimension ID as name for now
        breakdowns[breakdownDimName] = computeBreakdown(
          rows,
          currentDateRange,
          breakdownDimId,
          breakdownDimName,
          metricNameToIdMap,
          dimensionFilter
        );
      }
    }

    pivotData.channels[channel] = {
      current: currentChannelMetrics,
      previous_period: prevPeriodChannelMetrics,
      previous_year: prevYearChannelMetrics,
      monthly: allMonthly,
      yearly,
      breakdowns,
    };

    // Aggregate monthly data for overview
    for (const [monthKey, metrics] of Object.entries(allMonthly)) {
      if (!overviewMonthly[monthKey]) {
        overviewMonthly[monthKey] = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
      }
      overviewMonthly[monthKey].impressions += metrics.impressions;
      overviewMonthly[monthKey].clicks += metrics.clicks;
      overviewMonthly[monthKey].cost += metrics.cost;
      overviewMonthly[monthKey].revenue += metrics.revenue;
      overviewMonthly[monthKey].bookings += metrics.bookings;
    }

    // Aggregate yearly data for overview
    for (const [yearKey, metrics] of Object.entries(yearly)) {
      if (!overviewYearly[yearKey]) {
        overviewYearly[yearKey] = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
      }
      overviewYearly[yearKey].impressions += metrics.impressions;
      overviewYearly[yearKey].clicks += metrics.clicks;
      overviewYearly[yearKey].cost += metrics.cost;
      overviewYearly[yearKey].revenue += metrics.revenue;
      overviewYearly[yearKey].bookings += metrics.bookings;
    }

    // Add to overview current totals
    pivotData.overview.current.impressions += currentChannelMetrics.impressions;
    pivotData.overview.current.clicks += currentChannelMetrics.clicks;
    pivotData.overview.current.cost += currentChannelMetrics.cost;
    pivotData.overview.current.revenue += currentChannelMetrics.revenue;
    pivotData.overview.current.bookings += currentChannelMetrics.bookings;
    
    channelIndex++;
  }

  // Finalize overview monthly data (calculate derived metrics)
  pivotData.overview.monthly = {};
  for (const [monthKey, baseMetrics] of Object.entries(overviewMonthly)) {
    pivotData.overview.monthly[monthKey] = calculateDerivedMetrics(baseMetrics);
  }

  // Finalize overview yearly data (calculate derived metrics)
  pivotData.overview.yearly = {};
  for (const [yearKey, baseMetrics] of Object.entries(overviewYearly)) {
    pivotData.overview.yearly[yearKey] = calculateDerivedMetrics(baseMetrics);
  }

  // Recalculate overview current derived metrics
  pivotData.overview.current = calculateDerivedMetrics({
    impressions: pivotData.overview.current.impressions,
    clicks: pivotData.overview.current.clicks,
    cost: pivotData.overview.current.cost,
    revenue: pivotData.overview.current.revenue,
    bookings: pivotData.overview.current.bookings,
  });

  // Compute previous period and previous year for overview (aggregate from all channels)
  const overviewPrevPeriod = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
  const overviewPrevYear = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };

  for (const channel of configuration.selectedChannels) {
    const channelData = pivotData.channels[channel];
    if (channelData?.previous_period) {
      overviewPrevPeriod.impressions += channelData.previous_period.impressions;
      overviewPrevPeriod.clicks += channelData.previous_period.clicks;
      overviewPrevPeriod.cost += channelData.previous_period.cost;
      overviewPrevPeriod.revenue += channelData.previous_period.revenue;
      overviewPrevPeriod.bookings += channelData.previous_period.bookings;
    }
    if (channelData?.previous_year) {
      overviewPrevYear.impressions += channelData.previous_year.impressions;
      overviewPrevYear.clicks += channelData.previous_year.clicks;
      overviewPrevYear.cost += channelData.previous_year.cost;
      overviewPrevYear.revenue += channelData.previous_year.revenue;
      overviewPrevYear.bookings += channelData.previous_year.bookings;
    }
  }

  pivotData.overview.previous_period = calculateDerivedMetrics(overviewPrevPeriod);
  pivotData.overview.previous_year = calculateDerivedMetrics(overviewPrevYear);

  // TODO: Compute budget data from budget tables
  pivotData.budget = {
    monthly: [],
    totals: {
      totalBudget: 0,
      totalActual: 0,
      variance: 0,
    },
  };

  // Log summary of computed data
  const totalMonths = Object.keys(pivotData.overview.monthly || {}).length;
  const totalYears = Object.keys(pivotData.overview.yearly || {}).length;
  const sampleMonth = Object.entries(pivotData.overview.monthly || {})[0];
  
  console.log('Computed pivot data summary:', {
    channels: Object.keys(pivotData.channels),
    totalMonths,
    totalYears,
    sampleMonthData: sampleMonth ? { month: sampleMonth[0], revenue: sampleMonth[1].revenue } : null,
    overviewYearlyRevenue: Object.entries(pivotData.overview.yearly || {}).map(([year, m]) => ({ year, revenue: m.revenue })),
  });

  return pivotData;
}
