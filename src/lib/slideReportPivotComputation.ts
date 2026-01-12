/**
 * Service for computing pivot tables for slide reports
 * Aggregates data from dimension_data to create fast-loading pivot tables
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
import { format, startOfMonth, endOfMonth, eachMonthOfInterval, startOfYear } from "date-fns";

const BASE_METRICS = ["Impressions", "Clicks", "Cost", "Revenue", "Bookings"];

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
 * Fetch dimension data for a report
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
 * Aggregate metrics from rows for a date range
 */
function aggregateMetricsForDateRange(
  rows: any[],
  dateRange: { start: Date; end: Date },
  dimensionFilter?: { dimensionId: string; dimensionName?: string; values: string[] }
): { impressions: number; clicks: number; cost: number; revenue: number; bookings: number } {
  // Use the aggregateMetrics function from AISummaryPivotTable
  const metrics = aggregateMetrics(
    rows,
    BASE_METRICS,
    dateRange,
    dimensionFilter
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
  dimensionFilter?: { dimensionId: string; dimensionName?: string; values: string[] }
): BreakdownRow[] {
  const filteredRows = rows.filter((row) => {
    const rowData = row.dimension_values || row;
    
    // Date filter
    let dateValue: any = rowData.Date || rowData.date || rowData.Day || rowData.day;
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
    if (rowDate < dateRange.start || rowDate > dateRange.end) return false;
    
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
    const metrics = aggregateMetricsForDateRange(groupRows, dateRange);
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
    
    const metrics = aggregateMetricsForDateRange(rows, { start: monthStart, end: monthEnd }, dimensionFilter);
    monthlyData[monthKey] = calculateDerivedMetrics(metrics);
  });

  return monthlyData;
}

/**
 * Compute pivot data for a slide report
 */
export async function computeSlideReportPivotData(
  reportIds: Record<string, string>, // channel -> report_id
  configuration: SlideReportConfiguration,
  dateRange: { year: number; month: string; from: string; to: string }
): Promise<SlideReportPivotData> {
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
  };

  const currentDateRange = {
    start: new Date(dateRange.from),
    end: new Date(dateRange.to),
  };

  // Compute data for each channel
  for (const channel of configuration.selectedChannels) {
    const reportId = reportIds[channel];
    if (!reportId) continue;

    const channelConfig = configuration.channelConfigs[channel];
    const dimensionFilter = channelConfig?.dimensionId && channelConfig.selectedValues.length > 0
      ? {
          dimensionId: channelConfig.dimensionId,
          values: channelConfig.selectedValues,
        }
      : undefined;

    // Fetch dimension data
    const rows = await fetchDimensionDataForReport(reportId);

    // Compute current period metrics
    const currentMetrics = aggregateMetricsForDateRange(rows, currentDateRange, dimensionFilter);
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
      dimensionFilter
    );
    const prevYearChannelMetrics = calculateDerivedMetrics(prevYearMetrics);

    // Compute monthly metrics
    const monthly = computeMonthlyMetrics(rows, dateRange.year, dimensionFilter);

    // Compute breakdowns
    const breakdowns: Record<string, BreakdownRow[]> = {};
    const breakdownConfig = configuration.breakdownConfigs[channel];
    if (breakdownConfig?.breakdownDimensionIds) {
      // TODO: Fetch dimension names from database
      // For now, use dimension IDs as names
      for (const breakdownDimId of breakdownConfig.breakdownDimensionIds) {
        const breakdownDimName = breakdownDimId; // Should fetch actual name
        breakdowns[breakdownDimName] = computeBreakdown(
          rows,
          currentDateRange,
          breakdownDimId,
          breakdownDimName,
          dimensionFilter
        );
      }
    }

    pivotData.channels[channel] = {
      current: currentChannelMetrics,
      previous_period: prevPeriodChannelMetrics,
      previous_year: prevYearChannelMetrics,
      monthly,
      breakdowns,
    };

    // Add to overview totals
    pivotData.overview.current.impressions += currentChannelMetrics.impressions;
    pivotData.overview.current.clicks += currentChannelMetrics.clicks;
    pivotData.overview.current.cost += currentChannelMetrics.cost;
    pivotData.overview.current.revenue += currentChannelMetrics.revenue;
    pivotData.overview.current.bookings += currentChannelMetrics.bookings;
  }

  // Recalculate overview derived metrics
  pivotData.overview.current = calculateDerivedMetrics({
    impressions: pivotData.overview.current.impressions,
    clicks: pivotData.overview.current.clicks,
    cost: pivotData.overview.current.cost,
    revenue: pivotData.overview.current.revenue,
    bookings: pivotData.overview.current.bookings,
  });

  // Compute previous period and previous year for overview
  // (aggregate from all channels)
  const overviewPrevPeriod: ChannelMetrics = {
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
  };

  const overviewPrevYear: ChannelMetrics = {
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
  };

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

  pivotData.overview.previous_period = calculateDerivedMetrics({
    impressions: overviewPrevPeriod.impressions,
    clicks: overviewPrevPeriod.clicks,
    cost: overviewPrevPeriod.cost,
    revenue: overviewPrevPeriod.revenue,
    bookings: overviewPrevPeriod.bookings,
  });

  pivotData.overview.previous_year = calculateDerivedMetrics({
    impressions: overviewPrevYear.impressions,
    clicks: overviewPrevYear.clicks,
    cost: overviewPrevYear.cost,
    revenue: overviewPrevYear.revenue,
    bookings: overviewPrevYear.bookings,
  });

  // TODO: Compute budget data
  // For now, return empty budget structure
  pivotData.budget = {
    monthly: [],
    totals: {
      totalBudget: 0,
      totalActual: 0,
      variance: 0,
    },
  };

  return pivotData;
}
