/**
 * Unified filtered data hook for SlideViewPage
 * Provides a single source of truth for all filtered data
 *
 * All KPI totals and monthly chart data are computed directly from rawDataRows
 * (fetched fresh from dimension_data). Pre-computed pivot_data blobs are only
 * used as a last-resort fallback when rawDataRows is empty.
 */

import { useMemo } from 'react';
import { MONTH_NAMES } from '@/constants/slideViewConstants';
import { buildMultiMonthDateRange, parseSelectedMonths } from '@/lib/monthUtils';
import {
  filterRawDataRows,
  hasAnyActiveFilters,
  getChannelsWithFilters,
  buildMetricNameToIdsMap,
  getMetricKeys,
} from '@/lib/slideViewHelpers';
import { parseNumericValue } from '@/lib/parseNumericValue';
import type { SlideReportPivotData } from '@/types/slideReports';
import type { MetricData, MonthlyDataPoint, RawDataRow } from '@/types/slideView';

type BreakdownRowLike = { name?: string; [k: string]: any; impressions: number; clicks: number; cost: number; revenue: number; bookings: number };

function sumBreakdownRows(rows: BreakdownRowLike[]): MetricData {
  const base: MetricData = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
  rows.forEach((row) => {
    base.impressions += Number(row.impressions) || 0;
    base.clicks += Number(row.clicks) || 0;
    base.cost += Number(row.cost) || 0;
    base.revenue += Number(row.revenue) || 0;
    base.bookings += Number(row.bookings) || 0;
  });
  return base;
}

const EMPTY_METRICS: MetricData = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };

/**
 * Aggregate metrics from an array of raw rows using the dimension map for metric key resolution.
 * Also populates monthlyDataMap with per-month revenue for the given channel.
 */
function aggregateFromRawRows(
  rows: RawDataRow[],
  dimensionMap: Record<string, string>,
  channel: string,
  monthlyDataMap: Map<string, { year: number; month: string; metasearch: number; sem: number; social: number }>
): MetricData {
  if (rows.length === 0) return { ...EMPTY_METRICS };

  const nameToIdsMap = buildMetricNameToIdsMap(dimensionMap);
  const metrics: MetricData = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };

  const getMetricValue = (rowData: any, keys: string[]): number => {
    for (const key of keys) {
      const value = rowData[key];
      if (value !== undefined && value !== null) return parseNumericValue(value);
    }
    return 0;
  };

  for (const row of rows) {
    const rowData = (row as any).dimension_values || row;

    metrics.impressions += getMetricValue(rowData, getMetricKeys('impressions', nameToIdsMap));
    metrics.clicks += getMetricValue(rowData, getMetricKeys('clicks', nameToIdsMap));
    metrics.cost += getMetricValue(rowData, getMetricKeys('cost', nameToIdsMap));
    metrics.revenue += getMetricValue(rowData, getMetricKeys('revenue', nameToIdsMap));
    metrics.bookings += getMetricValue(rowData, getMetricKeys('bookings', nameToIdsMap));

    // Bucket revenue into monthly chart data
    let dateValue: any =
      rowData.Date || rowData.date || rowData.Day || rowData.day;
    if (!dateValue) {
      for (const [, val] of Object.entries(rowData as Record<string, unknown>)) {
        if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) {
          dateValue = val;
          break;
        }
      }
    }
    if (dateValue) {
      const rowDate = new Date(dateValue);
      if (!isNaN(rowDate.getTime())) {
        const year = rowDate.getFullYear();
        const month = MONTH_NAMES[rowDate.getMonth()];
        const key = `${year}-${month}`;
        if (!monthlyDataMap.has(key)) {
          monthlyDataMap.set(key, { year, month, metasearch: 0, sem: 0, social: 0 });
        }
        const revenue = getMetricValue(rowData, getMetricKeys('revenue', nameToIdsMap));
        monthlyDataMap.get(key)![channel as 'metasearch' | 'sem' | 'social'] += revenue;
      }
    }
  }

  return metrics;
}

/**
 * When rawDataRows is empty but the channel has active filters (e.g. View filter),
 * derive channel totals from breakdown rows so the view still filters data.
 * Prefers the groupBy dimension when provided so KPI matches the breakdown table (SEM/Social).
 * Respects selected month when monthlyBreakdowns exist.
 */
function aggregateChannelTotalsFromBreakdowns(
  channelData: SlideReportPivotData['channels'][string],
  channelFilterValues: Record<string, string[]>,
  monthKey: string | null,
  preferDimensionId?: string | null
): MetricData | null {
  const dimensionMap = (channelData as any).dimensionMap as Record<string, string> | undefined;
  if (!dimensionMap || !channelFilterValues || Object.keys(channelFilterValues).length === 0) return null;

  const monthlyBreakdowns = (channelData as any).monthlyBreakdowns as Record<string, Record<string, BreakdownRowLike[]>> | undefined;
  const allTimeBreakdowns = (channelData as any).breakdowns as Record<string, BreakdownRowLike[]> | undefined;
  const breakdowns = (monthKey && monthlyBreakdowns?.[monthKey]) ? monthlyBreakdowns[monthKey] : allTimeBreakdowns;
  if (!breakdowns) return null;

  const tryDimension = (dimensionId: string, selectedValues: string[]): MetricData | null => {
    if (!selectedValues?.length) return null;
    const dimensionName = dimensionMap[dimensionId];
    if (!dimensionName || !breakdowns[dimensionName]) return null;
    const rows = breakdowns[dimensionName];
    const selectedSet = new Set(selectedValues.map((v) => String(v).trim()));
    const matching = rows.filter((row) => {
      const value = row.name ?? row[dimensionName] ?? row[dimensionName.toLowerCase().replace(/\s+/g, '_')];
      return value != null && selectedSet.has(String(value).trim());
    });
    return matching.length > 0 ? sumBreakdownRows(matching) : null;
  };

  if (preferDimensionId && channelFilterValues[preferDimensionId]) {
    const preferred = tryDimension(preferDimensionId, channelFilterValues[preferDimensionId]);
    if (preferred) return preferred;
  }

  for (const [dimensionId, selectedValues] of Object.entries(channelFilterValues)) {
    if (dimensionId === preferDimensionId) continue;
    const result = tryDimension(dimensionId, selectedValues);
    if (result) return result;
  }
  return null;
}

/**
 * Fallback: populate monthlyDataMap from pre-computed channelData.monthly blob.
 * Only called when rawDataRows is empty (no data synced yet).
 */
function populateMonthlyFromPrecomputed(
  channelData: any,
  channel: string,
  monthlyDataMap: Map<string, { year: number; month: string; metasearch: number; sem: number; social: number }>
): void {
  if (!channelData.monthly) return;
  for (const [monthKey, metrics] of Object.entries(channelData.monthly as Record<string, any>)) {
    const [year, monthNum] = monthKey.split('-').map(Number);
    if (!year || !monthNum) continue;
    const month = MONTH_NAMES[monthNum - 1];
    const key = `${year}-${month}`;
    if (!monthlyDataMap.has(key)) {
      monthlyDataMap.set(key, { year, month, metasearch: 0, sem: 0, social: 0 });
    }
    monthlyDataMap.get(key)![channel as 'metasearch' | 'sem' | 'social'] = (metrics as any).revenue || 0;
  }
}

export interface UseFilteredSlideDataParams {
  pivotData: SlideReportPivotData | null;
  filterValues: Record<string, Record<string, string[]>>;
  filterDimensionValues: Record<string, Record<string, string[]>>;
  selectedYear: string;
  selectedMonth: string;
  /** Exact date range override — when set, filtering uses precise from/to dates instead of month boundaries. */
  customDateRange?: import("react-day-picker").DateRange | undefined;
  selectedTab?: string;
  slideType?: string;
  dynamicChannelTotals?: Record<string, MetricData>;
  /** When set, KPI totals from breakdowns use this dimension first so KPI matches the table (SEM/Social). */
  groupByDimensionId?: string | null;
}

export interface FilteredSlideData {
  // Filter state
  hasFilters: boolean;
  channelsWithFilters: Set<string>;

  // Filtered data
  channelTotals: {
    metasearch: MetricData;
    sem: MetricData;
    social: MetricData;
  };
  monthlyData: MonthlyDataPoint[];
  filteredRawRows: Record<string, RawDataRow[]>;

  // Date range for filtering
  dateRange?: { start: Date; end: Date };

  // Helper methods
  getFilteredRowsForChannel: (channel: string) => RawDataRow[];
  getChannelTotals: (channel: string) => MetricData;
}

/**
 * Unified hook that provides all filtered data as a single source of truth.
 *
 * Data priority (per channel):
 * 1. Fresh rawDataRows from dimension_data (always preferred when available)
 * 2. Pre-computed pivot_data blobs (fallback when rawDataRows is empty)
 */
export function useFilteredSlideData({
  pivotData,
  filterValues,
  filterDimensionValues,
  selectedYear,
  selectedMonth,
  customDateRange,
  selectedTab,
  slideType,
  dynamicChannelTotals,
  groupByDimensionId,
}: UseFilteredSlideDataParams): FilteredSlideData {
  // Build date range for filtering.
  // When customDateRange is set, use exact from/to dates (supports sub-month ranges like 1-5 days).
  // Otherwise fall back to month-boundary range from selectedYear/selectedMonth.
  const dateRange = useMemo<{ start: Date; end: Date } | undefined>(() => {
    if (customDateRange?.from) {
      const from = customDateRange.from;
      const to = customDateRange.to ?? customDateRange.from;
      return {
        start: from,
        end: new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999),
      };
    }
    return buildMultiMonthDateRange(selectedYear, selectedMonth);
  }, [customDateRange, selectedYear, selectedMonth]);

  // Check if any filters are active using centralized function
  const hasFilters = useMemo(() => {
    return hasAnyActiveFilters(filterValues, filterDimensionValues);
  }, [filterValues, filterDimensionValues]);

  // Get channels with active filters
  // IMPORTANT: Do NOT pass filterDimensionValues here. When available values are
  // lazily loaded and happen to match the selected values exactly (e.g. an Account
  // dimension with only 2 values that are both selected), the filter gets treated
  // as "select all = no filter" and unfiltered totals are shown.
  // By omitting filterDimensionValues, any explicitly set filter values are always
  // treated as active, preventing data from jumping when switching tabs.
  const channelsWithFilters = useMemo(() => {
    return getChannelsWithFilters(filterValues);
  }, [filterValues]);

  // Month key for breakdown fallback when a single month is selected (e.g. "2025-02")
  const monthKeyForBreakdowns = useMemo(() => {
    const months = parseSelectedMonths(selectedMonth);
    if (!months || months.length !== 1 || selectedYear === 'all') return null;
    return `${selectedYear}-${String(months[0]).padStart(2, '0')}`;
  }, [selectedYear, selectedMonth]);

  // Calculate all filtered data in a single memoized computation
  const filteredData = useMemo(() => {
    // Early return if no pivot data
    if (!pivotData?.channels) {
      return {
        channelTotals: {
          metasearch: { ...EMPTY_METRICS },
          sem: { ...EMPTY_METRICS },
          social: { ...EMPTY_METRICS },
        },
        monthlyData: [] as MonthlyDataPoint[],
        filteredRawRows: {} as Record<string, RawDataRow[]>,
      };
    }

    const channelTotals: Record<string, MetricData> = {};
    const filteredRawRows: Record<string, RawDataRow[]> = {};
    // Shared monthly data map — all channels write into the same map so monthly points
    // accumulate revenue across channels correctly.
    const monthlyDataMap = new Map<string, { year: number; month: string; metasearch: number; sem: number; social: number }>();

    for (const [channel, channelData] of Object.entries(pivotData.channels)) {
      const channelFilterValues = filterValues[channel] || {};
      const hasChannelFilters = channelsWithFilters.has(channel);
      const rawDataRows: RawDataRow[] = (channelData as any).rawDataRows || [];
      const dimensionMap: Record<string, string> = (channelData as any).dimensionMap || {};

      if (hasChannelFilters) {
        // ── FILTERED PATH ──────────────────────────────────────────────────────
        if (rawDataRows.length > 0) {
          // Filter rows by dimension values + date range, then aggregate
          const filteredRows = filterRawDataRows(rawDataRows, channelFilterValues, dateRange, dimensionMap);
          filteredRawRows[channel] = filteredRows;
          channelTotals[channel] = aggregateFromRawRows(filteredRows, dimensionMap, channel, monthlyDataMap);
        } else {
          // No raw rows — derive totals from pre-computed breakdown blobs (legacy fallback)
          const totalsFromBreakdowns = aggregateChannelTotalsFromBreakdowns(
            channelData as any,
            channelFilterValues,
            monthKeyForBreakdowns,
            groupByDimensionId
          );
          channelTotals[channel] = totalsFromBreakdowns ?? { ...EMPTY_METRICS };
          filteredRawRows[channel] = [];
        }
      } else {
        // ── NO-FILTER PATH ─────────────────────────────────────────────────────
        // Always prefer rawDataRows when available — they are fresh from dimension_data.
        // Pre-computed blobs (monthly/yearly/current) are only used as a last resort.
        filteredRawRows[channel] = rawDataRows;

        if (rawDataRows.length > 0) {
          // Build the date range for the selected year/month scope
          const dateFilterRange = buildDateFilterRange(selectedYear, selectedMonth, dateRange);
          const rowsInRange = dateFilterRange
            ? filterRawDataRows(rawDataRows, {}, dateFilterRange)
            : rawDataRows;

          channelTotals[channel] = aggregateFromRawRows(rowsInRange, dimensionMap, channel, monthlyDataMap);
        } else {
          // No raw rows yet (data not synced) — fall back to pre-computed blobs
          channelTotals[channel] = getPrecomputedTotals(channelData as any, selectedYear, selectedMonth);
          populateMonthlyFromPrecomputed(channelData as any, channel, monthlyDataMap);
        }
      }
    }

    // Convert monthly data map to sorted array
    const monthlyData = Array.from(monthlyDataMap.values()).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return MONTH_NAMES.indexOf(a.month) - MONTH_NAMES.indexOf(b.month);
    });

    // Filter monthly data by selectedYear if needed
    const filteredMonthlyData =
      selectedYear !== 'all'
        ? monthlyData.filter((m) => m.year === parseInt(selectedYear))
        : monthlyData;

    return {
      channelTotals: {
        metasearch: channelTotals.metasearch ?? { ...EMPTY_METRICS },
        sem: channelTotals.sem ?? { ...EMPTY_METRICS },
        social: channelTotals.social ?? { ...EMPTY_METRICS },
      },
      monthlyData: filteredMonthlyData,
      filteredRawRows,
    };
  }, [
    pivotData,
    filterValues,
    filterDimensionValues,
    selectedYear,
    selectedMonth,
    dateRange,
    channelsWithFilters,
    monthKeyForBreakdowns,
    groupByDimensionId,
  ]);

  // Helper method to get filtered rows for a channel
  const getFilteredRowsForChannel = useMemo(
    () => (channel: string): RawDataRow[] => filteredData.filteredRawRows[channel] || [],
    [filteredData.filteredRawRows]
  );

  // Helper method to get channel totals
  const getChannelTotals = useMemo(
    () => (channel: string): MetricData => {
      return filteredData.channelTotals[channel as keyof typeof filteredData.channelTotals] ?? { ...EMPTY_METRICS };
    },
    [filteredData.channelTotals]
  );

  // Fallback to dynamic data if available and no pivot data
  const finalChannelTotals = useMemo(() => {
    if (
      !pivotData?.channels &&
      slideType === 'master-report' &&
      dynamicChannelTotals &&
      Object.keys(dynamicChannelTotals).length > 0
    ) {
      return dynamicChannelTotals as {
        metasearch: MetricData;
        sem: MetricData;
        social: MetricData;
      };
    }
    return filteredData.channelTotals;
  }, [pivotData, slideType, dynamicChannelTotals, filteredData.channelTotals]);

  return {
    hasFilters,
    channelsWithFilters,
    channelTotals: finalChannelTotals,
    monthlyData: filteredData.monthlyData,
    filteredRawRows: filteredData.filteredRawRows,
    dateRange,
    getFilteredRowsForChannel,
    getChannelTotals,
  };
}

// ─── Private helpers ──────────────────────────────────────────────────────────

/**
 * Build a date filter range for the no-filter path based on selectedYear/selectedMonth.
 * Returns null when "all" is selected (no date filtering needed).
 */
function buildDateFilterRange(
  selectedYear: string,
  selectedMonth: string,
  customDateRange?: { start: Date; end: Date }
): { start: Date; end: Date } | null {
  // If a custom date range is already set, use it
  if (customDateRange) return customDateRange;

  if (selectedYear === 'all') return null;

  const yearNum = parseInt(selectedYear);
  if (isNaN(yearNum)) return null;

  if (!selectedMonth || selectedMonth === 'all') {
    // Full year
    return {
      start: new Date(yearNum, 0, 1),
      end: new Date(yearNum, 11, 31, 23, 59, 59),
    };
  }

  const months = parseSelectedMonths(selectedMonth);
  if (!months || months.length === 0) {
    return {
      start: new Date(yearNum, 0, 1),
      end: new Date(yearNum, 11, 31, 23, 59, 59),
    };
  }

  const minMonth = Math.min(...months);
  const maxMonth = Math.max(...months);
  return {
    start: new Date(yearNum, minMonth - 1, 1),
    end: new Date(yearNum, maxMonth, 0, 23, 59, 59),
  };
}

/**
 * Last-resort fallback: read KPI totals from pre-computed pivot_data blobs.
 * Only used when rawDataRows is empty (channel not yet synced).
 */
function getPrecomputedTotals(
  channelData: any,
  selectedYear: string,
  selectedMonth: string
): MetricData {
  if (selectedMonth && selectedMonth !== 'all' && selectedYear !== 'all') {
    const months = parseSelectedMonths(selectedMonth);
    if (months && months.length > 0) {
      const agg: MetricData = { ...EMPTY_METRICS };
      let found = false;
      for (const m of months) {
        const mk = `${selectedYear}-${m.toString().padStart(2, '0')}`;
        const md = channelData.monthly?.[mk];
        if (md) {
          agg.impressions += md.impressions || 0;
          agg.clicks += md.clicks || 0;
          agg.cost += md.cost || 0;
          agg.revenue += md.revenue || 0;
          agg.bookings += md.bookings || 0;
          found = true;
        }
      }
      if (found) return agg;
    }
  }

  if (selectedYear !== 'all') {
    const yearlyData = channelData.yearly?.[selectedYear];
    if (yearlyData && (yearlyData.impressions > 0 || yearlyData.clicks > 0 || yearlyData.cost > 0 || yearlyData.revenue > 0 || yearlyData.bookings > 0)) {
      return yearlyData;
    }
  }

  return channelData.current ?? { ...EMPTY_METRICS };
}
