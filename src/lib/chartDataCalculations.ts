/**
 * Utility functions for calculating and processing chart data
 */

import { MONTH_NAMES } from '@/constants/slideViewConstants';
import {
  filterRawDataRows,
  buildMetricNameToIdsMap,
  getMetricKeys,
  ensureMinimumChartData,
} from './slideViewHelpers';
import { parseNumericValue } from '@/lib/parseNumericValue';
import type { SlideReportPivotData } from '@/types/slideReports';
import type { ChartMetric, MonthlyDataPoint } from '@/types/slideView';

export type ChartTimeRange =
  | 'this_month'
  | 'this_year'
  | 'last_12_months'
  | 'last_6_months'
  | 'last_3_months';

/**
 * Generate all months in a time range, anchored to a specific date (defaults to now)
 */
export function generateMonthsInTimeRange(
  timeRange: ChartTimeRange,
  anchorDate?: Date
): { year: number; month: string }[] {
  const now = anchorDate ?? new Date();
  const months: { year: number; month: string }[] = [];

  let startDate: Date;
  const endDate = new Date(now.getFullYear(), now.getMonth(), 1);

  if (timeRange === 'this_month') {
    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  } else if (timeRange === 'this_year') {
    startDate = new Date(now.getFullYear(), 0, 1);
  } else if (timeRange === 'last_12_months') {
    startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  } else if (timeRange === 'last_6_months') {
    startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  } else if (timeRange === 'last_3_months') {
    startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  } else {
    return [];
  }

  // Generate all months from startDate to endDate (inclusive)
  const current = new Date(startDate);
  while (current <= endDate) {
    months.push({
      year: current.getFullYear(),
      month: MONTH_NAMES[current.getMonth()],
    });
    current.setMonth(current.getMonth() + 1);
  }

  return months;
}

/**
 * Apply chart time range filter to data, anchored to a specific date (defaults to now)
 */
export function applyChartTimeRangeFilter<T extends { year: number; month: string }>(
  data: T[],
  timeRange: ChartTimeRange,
  anchorDate?: Date
): T[] {
  const now = anchorDate ?? new Date();

  if (timeRange === 'this_month') {
    return data.filter(
      (m) => m.year === now.getFullYear() && m.month === MONTH_NAMES[now.getMonth()]
    );
  } else if (timeRange === 'this_year') {
    return data.filter((m) => m.year === now.getFullYear());
  } else if (timeRange === 'last_12_months') {
    const cutoffDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    return data.filter((m) => {
      const monthDate = new Date(m.year, MONTH_NAMES.indexOf(m.month), 1);
      return monthDate >= cutoffDate && monthDate <= now;
    });
  } else if (timeRange === 'last_6_months') {
    const cutoffDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    return data.filter((m) => {
      const monthDate = new Date(m.year, MONTH_NAMES.indexOf(m.month), 1);
      return monthDate >= cutoffDate && monthDate <= now;
    });
  } else if (timeRange === 'last_3_months') {
    const cutoffDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return data.filter((m) => {
      const monthDate = new Date(m.year, MONTH_NAMES.indexOf(m.month), 1);
      return monthDate >= cutoffDate && monthDate <= now;
    });
  }

  return data;
}

function aggregateMonthlyRevenueFromRows(
  rows: Array<{ dimension_values?: Record<string, unknown> } | Record<string, unknown>>,
  dimensionMap: Record<string, string>,
  monthStart: Date,
  monthEnd: Date,
  channelFilterValues: Record<string, string[]>,
  configuredDimensionNames?: Record<string, string>
): number {
  if (!rows.length) return 0;

  const combinedDimNames = configuredDimensionNames
    ? { ...dimensionMap, ...configuredDimensionNames }
    : dimensionMap;
  const monthFilteredRows = filterRawDataRows(
    rows,
    channelFilterValues,
    { start: monthStart, end: monthEnd },
    combinedDimNames
  );
  if (!monthFilteredRows.length) return 0;

  const nameToIdsMap = buildMetricNameToIdsMap(dimensionMap);
  const revenueKeys = getMetricKeys('revenue', nameToIdsMap);

  let monthRevenue = 0;
  monthFilteredRows.forEach((row) => {
    const rowData = row.dimension_values || row;
    for (const key of revenueKeys) {
      const value = rowData[key];
      if (value !== undefined && value !== null) {
        monthRevenue += parseNumericValue(value);
        break;
      }
    }
  });

  return monthRevenue;
}

/**
 * Process overview chart data (combined revenue from all channels)
 */
export function processOverviewChartData(
  pivotData: SlideReportPivotData | null,
  filterValues: Record<string, Record<string, string[]>>,
  channelsWithFilters: Set<string>,
  chartTimeRange: ChartTimeRange,
  anchorDate?: Date,
  configuredDimensionNames?: Record<string, string>
): Array<{ label: string; month: string; year: number; total: number }> {
  if (!pivotData?.channels) {
    return [];
  }

  const hasFilters = channelsWithFilters.size > 0;
  let allMonthlyData: Array<{
    year: number;
    month: string;
    metasearch: number;
    sem: number;
    social: number;
  }> = [];

  // Generate all months in the chartTimeRange and aggregate from canonical raw rows.
  // This avoids relying on legacy channelData.monthly blobs that may be empty post-refactor.
  const monthsInRange = generateMonthsInTimeRange(chartTimeRange, anchorDate);
  const monthlyMap = new Map<
    string,
    { year: number; month: string; metasearch: number; sem: number; social: number }
  >();

  monthsInRange.forEach(({ year, month }) => {
    const key = `${year}-${month}`;
    monthlyMap.set(key, { year, month, metasearch: 0, sem: 0, social: 0 });

    const monthIndex = MONTH_NAMES.indexOf(month);
    const monthStart = new Date(year, monthIndex, 1);
    const monthEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59);

    Object.entries(pivotData.channels).forEach(([channel, channelData]) => {
      const rawDataRows = (channelData as any).rawDataRows || [];
      const dimensionMap = (channelData as any).dimensionMap || {};
      const channelFilterValues =
        hasFilters && channelsWithFilters.has(channel) ? (filterValues[channel] || {}) : {};
      const monthRevenue = aggregateMonthlyRevenueFromRows(
        rawDataRows,
        dimensionMap,
        monthStart,
        monthEnd,
        channelFilterValues,
        configuredDimensionNames
      );
      monthlyMap.get(key)![channel as 'metasearch' | 'sem' | 'social'] = monthRevenue;
    });
  });

  allMonthlyData = Array.from(monthlyMap.values()).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return MONTH_NAMES.indexOf(a.month) - MONTH_NAMES.indexOf(b.month);
  });

  // Apply chartTimeRange filter
  let filtered = applyChartTimeRangeFilter(allMonthlyData, chartTimeRange, anchorDate);

  // Ensure at least 6 months of data for meaningful chart display
  filtered = ensureMinimumChartData(filtered, allMonthlyData, 6);

  // Format for chart
  return filtered.map((m) => ({
    label: `${m.month.slice(0, 3)} ${m.year.toString().slice(-2)}`,
    month: m.month,
    year: m.year,
    total: m.metasearch + m.social + m.sem,
  }));
}

/**
 * Process channel-specific chart data
 */
export function processChannelChartData(
  channel: 'metasearch' | 'sem' | 'social',
  pivotData: SlideReportPivotData | null,
  filterValues: Record<string, Record<string, string[]>>,
  channelsWithFilters: Set<string>,
  chartTimeRange: ChartTimeRange,
  anchorDate?: Date,
  configuredDimensionNames?: Record<string, string>
): Array<{ month: string; revenue: number }> {
  if (!pivotData?.channels?.[channel]) {
    return [];
  }

  const hasFilters = channelsWithFilters.size > 0;
  let allMonthlyData: Array<{ year: number; month: string; revenue: number }> =
    [];

  const channelData = pivotData.channels[channel];

  const monthsInRange = generateMonthsInTimeRange(chartTimeRange, anchorDate);
  const monthlyMap = new Map<
    string,
    { year: number; month: string; revenue: number }
  >();
  const channelFilterValues =
    hasFilters && channelsWithFilters.has(channel) ? (filterValues[channel] || {}) : {};
  const rawDataRows = (channelData as any).rawDataRows || [];
  const dimensionMap = (channelData as any).dimensionMap || {};

  monthsInRange.forEach(({ year, month }) => {
    const key = `${year}-${month}`;
    const monthIndex = MONTH_NAMES.indexOf(month);
    const monthStart = new Date(year, monthIndex, 1);
    const monthEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59);
    monthlyMap.set(key, {
      year,
      month,
      revenue: aggregateMonthlyRevenueFromRows(
        rawDataRows,
        dimensionMap,
        monthStart,
        monthEnd,
        channelFilterValues,
        configuredDimensionNames
      ),
    });
  });

  allMonthlyData = Array.from(monthlyMap.values()).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return MONTH_NAMES.indexOf(a.month) - MONTH_NAMES.indexOf(b.month);
  });

  // Apply chartTimeRange filter
  let filtered = applyChartTimeRangeFilter(allMonthlyData, chartTimeRange, anchorDate);

  // Apply ensureMinimumChartData
  filtered = ensureMinimumChartData(filtered, allMonthlyData, 6);

  // Format for chart
  return filtered.map((m) => ({
    month: `${m.month.slice(0, 3)} ${m.year.toString().slice(-2)}`,
    revenue: m.revenue,
  }));
}

/**
 * Build overview chart data from API monthly_data (e.g. when display data is from API and a view is selected).
 * Always outputs the full chart time range (e.g. 6 months for "last_6_months") with zeros for months without data,
 * so the chart never shows only 1 month when year/month filters are applied.
 */
export function buildOverviewChartDataFromMonthlyData(
  monthlyData: MonthlyDataPoint[],
  chartTimeRange: ChartTimeRange,
  metric: ChartMetric = 'revenue',
  anchorDate?: Date
): Array<{ label: string; value: number }> {
  const getOverviewMetricValue = (point: MonthlyDataPoint, selectedMetric: ChartMetric): number => {
    const revenue = (point.metasearch ?? 0) + (point.sem ?? 0) + (point.social ?? 0);
    if (selectedMetric === 'revenue') return revenue;

    // MonthlyDataPoint currently stores per-channel revenue totals only.
    // Keep fallback safe for other metrics by reading optional aggregate fields
    // if present (future-compatible), otherwise return 0.
    const baseImpressions = Number((point as any).impressions ?? 0);
    const baseClicks = Number((point as any).clicks ?? 0);
    const baseCost = Number((point as any).cost ?? 0);
    const baseBookings = Number((point as any).bookings ?? 0);

    switch (selectedMetric) {
      case 'impressions':
        return baseImpressions;
      case 'clicks':
        return baseClicks;
      case 'cost':
        return baseCost;
      case 'bookings':
        return baseBookings;
      case 'ctr':
        return baseImpressions > 0 ? (baseClicks / baseImpressions) * 100 : 0;
      case 'conversionRate':
        return baseClicks > 0 ? (baseBookings / baseClicks) * 100 : 0;
      case 'cpc':
        return baseClicks > 0 ? baseCost / baseClicks : 0;
      case 'aov':
        return baseBookings > 0 ? revenue / baseBookings : 0;
      case 'roas':
        return baseCost > 0 ? revenue / baseCost : 0;
      case 'costOfSale':
        return revenue > 0 ? (baseCost / revenue) * 100 : 0;
      default:
        return 0;
    }
  };

  const monthsInRange = generateMonthsInTimeRange(chartTimeRange, anchorDate);
  if (!monthsInRange.length) return [];

  const dataByKey = new Map<string, { metasearch: number; sem: number; social: number }>();
  for (const m of monthlyData ?? []) {
    const key = `${m.year}-${m.month}`;
    dataByKey.set(key, {
      metasearch: m.metasearch ?? 0,
      sem: m.sem ?? 0,
      social: m.social ?? 0,
    });
  }

  return monthsInRange.map(({ year, month }) => {
    const key = `${year}-${month}`;
    const data = dataByKey.get(key) ?? { metasearch: 0, sem: 0, social: 0 };
    const monthlyPoint = {
      year,
      month,
      metasearch: data.metasearch,
      sem: data.sem,
      social: data.social,
    } as MonthlyDataPoint;
    return {
      label: `${month.slice(0, 3)} ${year.toString().slice(-2)}`,
      value: getOverviewMetricValue(monthlyPoint, metric),
    };
  });
}

/**
 * Build per-channel chart data from API monthly_data.
 * Always outputs the full chart time range (e.g. 6 months) with zeros for months without data.
 */
export function buildChannelChartDataFromMonthlyData(
  monthlyData: MonthlyDataPoint[],
  chartTimeRange: ChartTimeRange,
  metric: ChartMetric = 'revenue',
  anchorDate?: Date
): Record<'metasearch' | 'sem' | 'social', Array<{ label: string; value: number }>> {
  const channels: ('metasearch' | 'sem' | 'social')[] = ['metasearch', 'sem', 'social'];
  const result = {
    metasearch: [] as Array<{ label: string; value: number }>,
    sem: [] as Array<{ label: string; value: number }>,
    social: [] as Array<{ label: string; value: number }>,
  };

  const monthsInRange = generateMonthsInTimeRange(chartTimeRange, anchorDate);
  if (!monthsInRange.length) return result;

  const dataByChannelAndKey = new Map<string, number>();
  for (const m of monthlyData ?? []) {
    const key = `${m.year}-${m.month}`;
    for (const ch of channels) {
      const rev = (m as unknown as Record<string, number>)[ch] ?? 0;
      dataByChannelAndKey.set(`${ch}-${key}`, rev);
    }
  }

  for (const ch of channels) {
    result[ch] = monthsInRange.map(({ year, month }) => ({
      label: `${month.slice(0, 3)} ${year.toString().slice(-2)}`,
      value: metric === 'revenue' ? (dataByChannelAndKey.get(`${ch}-${year}-${month}`) ?? 0) : 0,
    }));
  }
  return result;
}

/**
 * Build overview chart data (single revenue series) from per-channel chart data.
 * Used so the Overview tab Revenue chart can use slide_report_channel_month_data
 * with the same filterValues as the View (dimension filters).
 *
 * @param channelChartData - Per-channel arrays of { label, value } (same length and order)
 * @returns Array of { label, value } for AreaChart
 */
export function buildOverviewChartDataFromChannelChartData(
  channelChartData: Record<'metasearch' | 'sem' | 'social', Array<{ label: string; value: number }>> | null
): Array<{ label: string; value: number }> {
  if (!channelChartData) return [];
  const metasearch = channelChartData.metasearch ?? [];
  const sem = channelChartData.sem ?? [];
  const social = channelChartData.social ?? [];
  const len = Math.max(metasearch.length, sem.length, social.length);
  if (len === 0) return [];
  const result: Array<{ label: string; value: number }> = [];
  for (let i = 0; i < len; i++) {
    const label = metasearch[i]?.label ?? sem[i]?.label ?? social[i]?.label ?? '';
    const value = (metasearch[i]?.value ?? 0) + (sem[i]?.value ?? 0) + (social[i]?.value ?? 0);
    result.push({ label, value });
  }
  return result;
}
