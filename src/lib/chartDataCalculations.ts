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
import type { SlideReportPivotData } from '@/types/slideReports';
import type { RawDataRow, MonthlyDataPoint } from '@/types/slideView';

export type ChartTimeRange =
  | 'this_year'
  | 'last_12_months'
  | 'last_6_months'
  | 'last_3_months';

/**
 * Generate all months in a time range
 */
export function generateMonthsInTimeRange(
  timeRange: ChartTimeRange
): { year: number; month: string }[] {
  const now = new Date();
  const months: { year: number; month: string }[] = [];

  let startDate: Date;
  const endDate = new Date(now.getFullYear(), now.getMonth(), 1);

  if (timeRange === 'this_year') {
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
    // Move to next month
    current.setMonth(current.getMonth() + 1);
  }

  return months;
}

/**
 * Apply chart time range filter to data
 */
export function applyChartTimeRangeFilter<T extends { year: number; month: string }>(
  data: T[],
  timeRange: ChartTimeRange
): T[] {
  const now = new Date();

  if (timeRange === 'this_year') {
    return data.filter((m) => m.year === now.getFullYear());
  } else if (timeRange === 'last_12_months') {
    const cutoffDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    return data.filter((m) => {
      const monthDate = new Date(m.year, MONTH_NAMES.indexOf(m.month), 1);
      return monthDate >= cutoffDate;
    });
  } else if (timeRange === 'last_6_months') {
    const cutoffDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    return data.filter((m) => {
      const monthDate = new Date(m.year, MONTH_NAMES.indexOf(m.month), 1);
      return monthDate >= cutoffDate;
    });
  } else if (timeRange === 'last_3_months') {
    const cutoffDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return data.filter((m) => {
      const monthDate = new Date(m.year, MONTH_NAMES.indexOf(m.month), 1);
      return monthDate >= cutoffDate;
    });
  }

  return data;
}

/**
 * Process overview chart data (combined revenue from all channels)
 */
export function processOverviewChartData(
  pivotData: SlideReportPivotData | null,
  filterValues: Record<string, Record<string, string[]>>,
  channelsWithFilters: Set<string>,
  chartTimeRange: ChartTimeRange
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

  if (hasFilters) {
    // Generate all months in the chartTimeRange
    const monthsInRange = generateMonthsInTimeRange(chartTimeRange);

    // Build a monthly map initialized with zeros for all months in the time range
    const monthlyMap = new Map<
      string,
      { year: number; month: string; metasearch: number; sem: number; social: number }
    >();

    // For each month in the range, filter and aggregate data for that specific month
    monthsInRange.forEach(({ year, month }) => {
      const key = `${year}-${month}`;
      monthlyMap.set(key, { year, month, metasearch: 0, sem: 0, social: 0 });

      // Get month date range
      const monthIndex = MONTH_NAMES.indexOf(month);
      const monthStart = new Date(year, monthIndex, 1);
      const monthEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59);

      // Process each channel
      Object.entries(pivotData.channels).forEach(([channel, channelData]) => {
        const channelFilterValues = filterValues[channel] || {};
        const hasChannelFilters = channelsWithFilters.has(channel);
        const rawDataRows = (channelData as any).rawDataRows || [];

        if (hasChannelFilters && rawDataRows.length > 0) {
          // Filter rows for this specific month and channel filters
          const monthFilteredRows = filterRawDataRows(
            rawDataRows,
            channelFilterValues,
            { start: monthStart, end: monthEnd }
          );

          if (monthFilteredRows.length > 0) {
            // Build dynamic metric mapping
            const dimensionMap = (channelData as any).dimensionMap || {};
            const nameToIdsMap = buildMetricNameToIdsMap(dimensionMap);
            const revenueKeys = getMetricKeys('revenue', nameToIdsMap);

            // Aggregate revenue for this month
            let monthRevenue = 0;
            monthFilteredRows.forEach((row) => {
              const rowData = row.dimension_values || row;
              for (const key of revenueKeys) {
                const value = rowData[key];
                if (value !== undefined && value !== null) {
                  if (typeof value === 'number') {
                    monthRevenue += isNaN(value) ? 0 : value;
                    break;
                  }
                  const parsed = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
                  if (!isNaN(parsed)) {
                    monthRevenue += parsed;
                    break;
                  }
                }
              }
            });

            const entry = monthlyMap.get(key)!;
            entry[channel as 'metasearch' | 'sem' | 'social'] = monthRevenue;
          }
        } else if (!hasChannelFilters && rawDataRows.length > 0) {
          // No filters for this channel - use pre-computed monthly data if available
          const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
          const monthlyData = (channelData as any).monthly?.[monthKey];
          if (monthlyData) {
            const entry = monthlyMap.get(key)!;
            entry[channel as 'metasearch' | 'sem' | 'social'] =
              monthlyData.revenue || 0;
          }
        }
      });
    });

    allMonthlyData = Array.from(monthlyMap.values()).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return MONTH_NAMES.indexOf(a.month) - MONTH_NAMES.indexOf(b.month);
    });
  } else {
    // No filters - use pre-computed data (fast path)
    const monthlyMap = new Map<
      string,
      { year: number; month: string; metasearch: number; sem: number; social: number }
    >();

    Object.entries(pivotData.channels).forEach(([channel, channelData]) => {
      if (channelData.monthly) {
        Object.entries(channelData.monthly).forEach(([monthKey, metrics]) => {
          const [year, monthNum] = monthKey.split('-').map(Number);
          const month = MONTH_NAMES[monthNum - 1];
          const key = `${year}-${month}`;

          if (!monthlyMap.has(key)) {
            monthlyMap.set(key, { year, month, metasearch: 0, sem: 0, social: 0 });
          }

          const entry = monthlyMap.get(key)!;
          entry[channel as 'metasearch' | 'sem' | 'social'] = metrics.revenue || 0;
        });
      }
    });

    allMonthlyData = Array.from(monthlyMap.values()).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return MONTH_NAMES.indexOf(a.month) - MONTH_NAMES.indexOf(b.month);
    });
  }

  // Apply chartTimeRange filter
  let filtered = applyChartTimeRangeFilter(allMonthlyData, chartTimeRange);

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
  chartTimeRange: ChartTimeRange
): Array<{ month: string; revenue: number }> {
  if (!pivotData?.channels?.[channel]) {
    return [];
  }

  const hasFilters = channelsWithFilters.size > 0;
  let allMonthlyData: Array<{ year: number; month: string; revenue: number }> =
    [];

  const channelData = pivotData.channels[channel];

  if (hasFilters) {
    // Generate all months in the chartTimeRange
    const monthsInRange = generateMonthsInTimeRange(chartTimeRange);

    // Build a monthly map initialized with zeros for all months in the time range
    const monthlyMap = new Map<
      string,
      { year: number; month: string; revenue: number }
    >();

    const channelFilterValues = filterValues[channel] || {};
    const hasChannelFilters = channelsWithFilters.has(channel);
    const rawDataRows = (channelData as any).rawDataRows || [];

    monthsInRange.forEach(({ year, month }) => {
      const key = `${year}-${month}`;
      monthlyMap.set(key, { year, month, revenue: 0 });

      // Get month date range
      const monthIndex = MONTH_NAMES.indexOf(month);
      const monthStart = new Date(year, monthIndex, 1);
      const monthEnd = new Date(year, monthIndex + 1, 0, 23, 59, 59);

      if (hasChannelFilters && rawDataRows.length > 0) {
        // Filter rows for this specific month and channel filters
        const monthFilteredRows = filterRawDataRows(
          rawDataRows,
          channelFilterValues,
          { start: monthStart, end: monthEnd }
        );

        if (monthFilteredRows.length > 0) {
          // Build dynamic metric mapping
          const dimensionMap = (channelData as any).dimensionMap || {};
          const nameToIdsMap = buildMetricNameToIdsMap(dimensionMap);
          const revenueKeys = getMetricKeys('revenue', nameToIdsMap);

          // Aggregate revenue for this month
          let monthRevenue = 0;
          monthFilteredRows.forEach((row) => {
            const rowData = row.dimension_values || row;
            for (const key of revenueKeys) {
              const value = rowData[key];
              if (value !== undefined && value !== null) {
                if (typeof value === 'number') {
                  monthRevenue += isNaN(value) ? 0 : value;
                  break;
                }
                const parsed = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
                if (!isNaN(parsed)) {
                  monthRevenue += parsed;
                  break;
                }
              }
            }
          });

          const entry = monthlyMap.get(key)!;
          entry.revenue = monthRevenue;
        }
      } else if (!hasChannelFilters && rawDataRows.length > 0) {
        // No filters for this channel - use pre-computed monthly data if available
        const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
        const monthlyData = (channelData as any).monthly?.[monthKey];
        if (monthlyData) {
          const entry = monthlyMap.get(key)!;
          entry.revenue = monthlyData.revenue || 0;
        }
      }
    });

    allMonthlyData = Array.from(monthlyMap.values()).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return MONTH_NAMES.indexOf(a.month) - MONTH_NAMES.indexOf(b.month);
    });
  } else if (channelData.monthly) {
    // No filters - use pre-computed data (fast path)
    Object.entries(channelData.monthly).forEach(([monthKey, metrics]) => {
      const [year, monthNum] = monthKey.split('-').map(Number);
      const month = MONTH_NAMES[monthNum - 1];
      allMonthlyData.push({ year, month, revenue: metrics.revenue || 0 });
    });
    allMonthlyData.sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return MONTH_NAMES.indexOf(a.month) - MONTH_NAMES.indexOf(b.month);
    });
  }

  // Apply chartTimeRange filter
  let filtered = applyChartTimeRangeFilter(allMonthlyData, chartTimeRange);

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
  chartTimeRange: ChartTimeRange
): Array<{ label: string; month: string; year: number; total: number }> {
  const monthsInRange = generateMonthsInTimeRange(chartTimeRange);
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
    const total = data.metasearch + data.sem + data.social;
    return {
      label: `${month.slice(0, 3)} ${year.toString().slice(-2)}`,
      month,
      year,
      total,
    };
  });
}

/**
 * Build per-channel chart data from API monthly_data.
 * Always outputs the full chart time range (e.g. 6 months) with zeros for months without data.
 */
export function buildChannelChartDataFromMonthlyData(
  monthlyData: MonthlyDataPoint[],
  chartTimeRange: ChartTimeRange
): Record<'metasearch' | 'sem' | 'social', Array<{ month: string; revenue: number }>> {
  const channels: ('metasearch' | 'sem' | 'social')[] = ['metasearch', 'sem', 'social'];
  const result = { metasearch: [] as Array<{ month: string; revenue: number }>, sem: [], social: [] };

  const monthsInRange = generateMonthsInTimeRange(chartTimeRange);
  if (!monthsInRange.length) return result;

  const dataByChannelAndKey = new Map<string, number>();
  for (const m of monthlyData ?? []) {
    const key = `${m.year}-${m.month}`;
    for (const ch of channels) {
      const rev = (m as Record<string, number>)[ch] ?? 0;
      dataByChannelAndKey.set(`${ch}-${key}`, rev);
    }
  }

  for (const ch of channels) {
    result[ch] = monthsInRange.map(({ year, month }) => ({
      month: `${month.slice(0, 3)} ${year.toString().slice(-2)}`,
      revenue: dataByChannelAndKey.get(`${ch}-${year}-${month}`) ?? 0,
    }));
  }
  return result;
}
