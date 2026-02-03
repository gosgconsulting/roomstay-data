/**
 * Helper functions for refresh-slide-report edge function
 * Ported from various source files with Deno-compatible adaptations
 */

import type {
  SlideReportPivotData,
  SlideReportConfiguration,
  SlideReportDateRange,
  ChannelMetrics,
  BreakdownRow,
  MonthlyRecord,
} from './types.ts';

// Base metrics needed for formula calculations
const BASE_METRICS = ['Impressions', 'Clicks', 'Cost', 'Revenue', 'Conversions', 'Bookings'];

// Formula metrics that should be calculated, not summed
const FORMULA_METRICS = ['CTR', 'ROAS', 'Conversion rate', 'CPC', 'Cost of sale', 'COS'];

/**
 * Date utility functions (replacing date-fns)
 */

/**
 * Check if a date is valid
 */
function isValidDate(date: Date): boolean {
  return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Parse a date value to Date object
 * Replaces date-fns parseDate
 */
export function parseDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isValidDate(value) ? value : null;
  
  // Try ISO string parsing
  const isoDate = new Date(String(value));
  if (isValidDate(isoDate)) return isoDate;
  
  // Try parsing as regular date string
  const dateStr = String(value).trim();
  const dateObj = new Date(dateStr);
  if (isValidDate(dateObj)) return dateObj;
  
  return null;
}

/**
 * Check if date is within interval
 * Replaces date-fns isWithinInterval
 */
export function isWithinInterval(
  date: Date,
  interval: { start: Date; end: Date }
): boolean {
  return date >= interval.start && date <= interval.end;
}

/**
 * Get start of month
 * Replaces date-fns startOfMonth
 */
export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

/**
 * Get end of month
 * Replaces date-fns endOfMonth
 */
export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

/**
 * Get start of year
 * Replaces date-fns startOfYear
 */
export function startOfYear(date: Date): Date {
  return new Date(date.getFullYear(), 0, 1);
}

/**
 * Format date as YYYY-MM
 * Replaces date-fns format(date, "yyyy-MM")
 */
export function formatMonthKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Get all months in an interval
 * Replaces date-fns eachMonthOfInterval
 */
export function eachMonthOfInterval(interval: { start: Date; end: Date }): Date[] {
  const months: Date[] = [];
  const current = new Date(interval.start);
  current.setDate(1); // Start of month
  
  while (current <= interval.end) {
    months.push(new Date(current));
    current.setMonth(current.getMonth() + 1);
  }
  
  return months;
}

/**
 * Calculate derived metrics from base metric data
 * Ported from src/lib/slideViewHelpers.ts
 */
export function calculateDerivedMetrics(data: {
  impressions: number;
  clicks: number;
  cost: number;
  revenue: number;
  bookings: number;
}): ChannelMetrics {
  const impressions = Number(data.impressions) || 0;
  const clicks = Number(data.clicks) || 0;
  const cost = Number(data.cost) || 0;
  const revenue = Number(data.revenue) || 0;
  const bookings = Number(data.bookings) || 0;

  const cpc = clicks > 0 ? cost / clicks : 0;
  const roas = cost > 0 ? revenue / cost : 0;
  const costOfSale = revenue > 0 ? (cost / revenue) * 100 : 0;

  return {
    impressions,
    clicks,
    cost,
    revenue,
    bookings,
    ctr: clicks > 0 && impressions > 0 ? (clicks / impressions) * 100 : 0,
    conversionRate: clicks > 0 ? (bookings / clicks) * 100 : 0,
    cpc,
    roas,
    costOfSale,
  };
}

/**
 * Calculate formula metrics from base values
 * Ported from src/components/AISummaryPivotTable.tsx
 */
function calculateFormulaMetrics(baseValues: Record<string, number>): Record<string, number> {
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
}

/**
 * Aggregate metrics from rows for a date range
 * Ported from src/components/AISummaryPivotTable.tsx
 */
export function aggregateMetrics(
  rows: any[],
  metrics: string[],
  dateRange: { start: Date; end: Date },
  dimensionFilter?: { dimensionId: string; dimensionName?: string; values: string[] },
  metricNameToIdMap?: Record<string, string>
): Record<string, number> {
  const result: Record<string, number> = {};
  
  // Initialize all requested metrics and base metrics needed for formulas
  const allMetricsToTrack = new Set([...metrics, ...BASE_METRICS]);
  allMetricsToTrack.forEach((m) => (result[m] = 0));
  
  // Try to find Date dimension ID from metricNameToIdMap
  const dateDimId = metricNameToIdMap?.['Date'] || metricNameToIdMap?.['date'] || metricNameToIdMap?.['Day'];

  const filteredRows = rows.filter((row) => {
    // Handle both flat row format and transformed row format (with dimension_values)
    // Match frontend behavior exactly - no explicit null check
    const rowData = row.dimension_values || row;
    
    // Date filter - try multiple approaches to find the date value
    let dateValue: any = null;
    
    // First, try by name
    dateValue = rowData.Date || rowData.date || rowData.Day || rowData.day;
    
    // Then try by dimension ID if we have it
    if (!dateValue && dateDimId) {
      dateValue = rowData[dateDimId];
    }
    
    // Finally, search all values for a date pattern
    if (!dateValue) {
      for (const [key, val] of Object.entries(rowData || {})) {
        if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) {
          dateValue = val;
          break;
        }
      }
    }
    
    const rowDate = parseDate(dateValue);
    if (!rowDate) return false;
    if (!isWithinInterval(rowDate, { start: dateRange.start, end: dateRange.end })) {
      return false;
    }
    
    // Dimension filter
    if (dimensionFilter && dimensionFilter.values.length > 0) {
      // Try to find the dimension value by ID first, then by name
      const dimValue = rowData[dimensionFilter.dimensionId] || 
                       (dimensionFilter.dimensionName ? rowData[dimensionFilter.dimensionName] : undefined);
      
      if (dimValue === undefined) {
        return false;
      }
      
      // Normalize both the row value and filter values for comparison (trim whitespace)
      const normalizedRowValue = String(dimValue).trim();
      const normalizedFilterValues = dimensionFilter.values.map(v => String(v).trim());
      
      if (!normalizedFilterValues.includes(normalizedRowValue)) {
        return false;
      }
    }
    
    return true;
  });

  // Sum up base metrics (non-formula metrics)
  filteredRows.forEach((row) => {
    const rowData = row.dimension_values || row;
    
    allMetricsToTrack.forEach((metric) => {
      // Skip formula metrics - they'll be calculated after summing
      if (FORMULA_METRICS.includes(metric)) return;
      
      // Try to get value by metric name directly
      let value = rowData[metric];
      
      // If not found and we have a mapping, try by dimension ID
      if ((value === undefined || value === null) && metricNameToIdMap && metricNameToIdMap[metric]) {
        value = rowData[metricNameToIdMap[metric]];
      }
      
      if (value !== undefined && value !== null) {
        const numValue = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
        if (!isNaN(numValue)) {
          result[metric] += numValue;
        }
      }
    });
  });

  // Calculate formula metrics from aggregated base values
  const formulaValues = calculateFormulaMetrics(result);
  FORMULA_METRICS.forEach(metric => {
    if (metrics.includes(metric)) {
      result[metric] = formulaValues[metric] || 0;
    }
  });

  return result;
}

/**
 * Prepare monthly data records from pivot data
 * Ported from src/lib/slideRefreshHelpers.ts
 */
export function prepareMonthlyRecords(
  pivotData: SlideReportPivotData,
  slideReportId: string,
  accountId: string | null
): MonthlyRecord[] {
  const records: MonthlyRecord[] = [];
  
  // Pre-compute timestamp once
  const computedAt = new Date().toISOString();
  
  // Process overview monthly data
  if (pivotData.overview?.monthly) {
    for (const [monthKey, metrics] of Object.entries(pivotData.overview.monthly)) {
      const [year, month] = monthKey.split('-').map(Number);
      records.push({
        slide_report_id: slideReportId,
        account_id: accountId,
        year,
        month,
        channel: 'overview',
        metrics,
        breakdowns: {},
        row_count: 1,
        computed_at: computedAt,
      });
    }
  }
  
  // Process channel-specific monthly data
  if (pivotData.channels) {
    for (const [channel, channelData] of Object.entries(pivotData.channels)) {
      if (!channelData.monthly) continue;
      
      for (const [monthKey, metrics] of Object.entries(channelData.monthly)) {
        const [year, month] = monthKey.split('-').map(Number);
        const monthlyBreakdowns = channelData.monthlyBreakdowns?.[monthKey] || {};
        
        // Calculate row count efficiently in a single pass
        let rowCount = 0;
        for (const breakdownArray of Object.values(monthlyBreakdowns)) {
          if (Array.isArray(breakdownArray)) {
            rowCount += breakdownArray.length;
          }
        }
        
        records.push({
          slide_report_id: slideReportId,
          account_id: accountId,
          year,
          month,
          channel,
          metrics,
          breakdowns: monthlyBreakdowns,
          row_count: rowCount,
          computed_at: computedAt,
        });
      }
    }
  }
  
  return records;
}

/**
 * Extract filter dimension values from pivot data
 * Ported from src/lib/slideRefreshHelpers.ts
 */
export function extractFilterDimensionValues(
  pivotData: SlideReportPivotData,
  config: SlideReportConfiguration,
  validChannels: string[]
): {
  values: Record<string, Record<string, string[]>>;
  names: Record<string, Record<string, string>>;
} {
  const values: Record<string, Record<string, string[]>> = {
    metasearch: {},
    sem: {},
    social: {},
  };
  const names: Record<string, Record<string, string>> = {
    metasearch: {},
    sem: {},
    social: {},
  };
  
  // Single pass through channels
  for (const channel of validChannels) {
    const channelData = pivotData.channels?.[channel];
    const channelFilterConfig = config.filterConfigs?.[channel];
    
    if (!channelData || !channelFilterConfig?.filterDimensionIds?.length) continue;
    
    const filterUniqueValues = (channelData as any).filterUniqueValues as 
      Record<string, { name: string; values: string[] }> | undefined;
    
    if (filterUniqueValues) {
      for (const filterDimId of channelFilterConfig.filterDimensionIds) {
        const filterData = filterUniqueValues[filterDimId];
        if (filterData) {
          values[channel][filterDimId] = filterData.values;
          names[channel][filterDimId] = filterData.name;
        }
      }
    }
  }
  
  return { values, names };
}

/**
 * Calculate breakdown and filter configuration counts
 * Ported from src/lib/slideRefreshHelpers.ts
 */
export function calculateConfigCounts(config: SlideReportConfiguration): {
  breakdownCount: number;
  filterCount: number;
} {
  let breakdownCount = 0;
  let filterCount = 0;
  
  const breakdownConfigs = config.breakdownConfigs || {};
  const filterConfigs = config.filterConfigs || {};
  
  // Single pass through breakdown configs
  for (const cfg of Object.values(breakdownConfigs)) {
    breakdownCount += (cfg as any)?.breakdownDimensionIds?.length || 0;
  }
  
  // Single pass through filter configs
  for (const cfg of Object.values(filterConfigs)) {
    filterCount += (cfg as any)?.filterDimensionIds?.length || 0;
  }
  
  return { breakdownCount, filterCount };
}

/**
 * Normalize error message from various error types
 * Ported from src/lib/slideRefreshHelpers.ts
 */
export function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message;
    
    // Provide helpful error messages for common issues
    if (msg.includes('timeout') || msg.includes('timed out')) {
      return "The data refresh took too long. This might be due to a large dataset. Please try reducing the date range or contact support.";
    }
    if (msg.includes('Pivot data computation')) {
      return `Data computation failed: ${msg.replace('Pivot data computation failed: ', '')}`;
    }
    if (msg.includes('No valid channels')) {
      return "No valid channels found. Please configure at least one channel with a report in Edit Source.";
    }
    if (msg.includes('No report found') || msg.includes('Configuration') || msg.includes('date range')) {
      return msg;
    }
    return msg;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  if (error && typeof error === 'object') {
    const errorObj = error as any;
    return errorObj.message || errorObj.error_description || errorObj.details || JSON.stringify(error);
  }
  
  return "Failed to refresh data. Please try again.";
}

/** Per-year channel slice from refresh-slide-report-channel (when year is set). */
export interface ChannelDataSlice {
  monthly: Record<string, ChannelMetrics>;
  yearly: Record<string, ChannelMetrics>;
  breakdowns: Record<string, BreakdownRow[]>;
  monthlyBreakdowns: Record<string, Record<string, BreakdownRow[]>>;
  filterUniqueValues?: Record<string, { name: string; values: string[] }>;
  dimensionMap?: Record<string, string>;
}

/**
 * Merge breakdown rows by name (sum metrics). Used when merging per-year slices.
 */
function mergeBreakdownRows(rows: BreakdownRow[]): BreakdownRow[] {
  const byName: Record<string, BreakdownRow> = {};
  for (const row of rows) {
    const name = row.name != null ? String(row.name).trim() : '';
    if (!name) continue;
    if (!byName[name]) {
      byName[name] = { ...row, impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
    }
    byName[name].impressions += row.impressions ?? 0;
    byName[name].clicks += row.clicks ?? 0;
    byName[name].cost += row.cost ?? 0;
    byName[name].revenue += row.revenue ?? 0;
    byName[name].bookings += row.bookings ?? 0;
  }
  return Object.values(byName).sort((a, b) => (b.revenue ?? 0) - (a.revenue ?? 0));
}

/**
 * Merge per-year channel slices into full channel data and compute current/previous from merged monthly.
 */
export function mergeChannelYearSlices(
  slices: ChannelDataSlice[],
  dateRange: { from: string; to: string }
): SlideReportPivotData['channels'][string] {
  if (slices.length === 0) {
    return {
      current: calculateDerivedMetrics({ impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 }),
      monthly: {},
      yearly: {},
      breakdowns: {},
      monthlyBreakdowns: {},
      rawDataRows: [],
      dimensionMap: {},
    };
  }
  const first = slices[0];
  const monthly: Record<string, ChannelMetrics> = {};
  const yearly: Record<string, ChannelMetrics> = {};
  for (const s of slices) {
    Object.assign(monthly, s.monthly);
    Object.assign(yearly, s.yearly);
  }
  const breakdowns: Record<string, BreakdownRow[]> = {};
  for (const dimName of Object.keys(first.breakdowns || {})) {
    const allRows = slices.flatMap((s) => (s.breakdowns && s.breakdowns[dimName]) || []);
    breakdowns[dimName] = mergeBreakdownRows(allRows);
  }
  const monthlyBreakdowns: Record<string, Record<string, BreakdownRow[]>> = {};
  const allMonthKeys = new Set(slices.flatMap((s) => Object.keys(s.monthlyBreakdowns || {})));
  for (const monthKey of allMonthKeys) {
    monthlyBreakdowns[monthKey] = {};
    const dimNames = new Set(slices.flatMap((s) => Object.keys((s.monthlyBreakdowns && s.monthlyBreakdowns[monthKey]) || {})));
    for (const dimName of dimNames) {
      const allRows = slices.flatMap(
        (s) => ((s.monthlyBreakdowns && s.monthlyBreakdowns[monthKey] && s.monthlyBreakdowns[monthKey][dimName]) || [])
      );
      monthlyBreakdowns[monthKey][dimName] = mergeBreakdownRows(allRows);
    }
  }
  const fromDate = new Date(dateRange.from);
  const toDate = new Date(dateRange.to);
  const currentBase = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
  let prevPeriodBase = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
  let prevYearBase = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
  const prevMonthStart = new Date(fromDate);
  prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);
  const prevMonthEnd = new Date(prevMonthStart);
  prevMonthEnd.setMonth(prevMonthEnd.getMonth() + 1);
  prevMonthEnd.setDate(0);
  const prevYearStart = new Date(fromDate);
  prevYearStart.setFullYear(prevYearStart.getFullYear() - 1);
  const prevYearEnd = new Date(toDate);
  prevYearEnd.setFullYear(prevYearEnd.getFullYear() - 1);
  for (const [monthKey, m] of Object.entries(monthly)) {
    const [y, mo] = monthKey.split('-').map(Number);
    const monthStart = new Date(y, mo - 1, 1);
    const monthEnd = new Date(y, mo, 0, 23, 59, 59);
    const base = { impressions: m.impressions, clicks: m.clicks, cost: m.cost, revenue: m.revenue, bookings: m.bookings };
    if (monthStart >= fromDate && monthEnd <= toDate) {
      currentBase.impressions += base.impressions;
      currentBase.clicks += base.clicks;
      currentBase.cost += base.cost;
      currentBase.revenue += base.revenue;
      currentBase.bookings += base.bookings;
    }
    if (monthStart >= prevMonthStart && monthEnd <= prevMonthEnd) {
      prevPeriodBase.impressions += base.impressions;
      prevPeriodBase.clicks += base.clicks;
      prevPeriodBase.cost += base.cost;
      prevPeriodBase.revenue += base.revenue;
      prevPeriodBase.bookings += base.bookings;
    }
    if (monthStart >= prevYearStart && monthEnd <= prevYearEnd) {
      prevYearBase.impressions += base.impressions;
      prevYearBase.clicks += base.clicks;
      prevYearBase.cost += base.cost;
      prevYearBase.revenue += base.revenue;
      prevYearBase.bookings += base.bookings;
    }
  }
  return {
    current: calculateDerivedMetrics(currentBase),
    previous_period: calculateDerivedMetrics(prevPeriodBase),
    previous_year: calculateDerivedMetrics(prevYearBase),
    monthly,
    yearly,
    breakdowns,
    monthlyBreakdowns,
    filterUniqueValues: first.filterUniqueValues,
    dimensionMap: first.dimensionMap,
    rawDataRows: [],
  };
}

/**
 * Get distinct years to refresh from slide report date range (from/to) plus one year back for comparison.
 */
export function getYearsFromDateRange(dateRange: SlideReportDateRange): number[] {
  const from = new Date(dateRange.from);
  const to = new Date(dateRange.to);
  const rangeStart = new Date(from);
  rangeStart.setFullYear(rangeStart.getFullYear() - 1);
  rangeStart.setDate(1);
  const years = new Set<number>();
  for (let y = rangeStart.getFullYear(); y <= to.getFullYear(); y++) {
    years.add(y);
  }
  return [...years].sort((a, b) => a - b);
}
