/**
 * Hook for managing channel metrics calculations in SlideViewPage
 * 
 * This hook handles the complex logic for calculating current and comparison channel metrics
 * based on selected filters, date ranges, and comparison types. It optimizes performance by
 * prioritizing pre-computed data from pivot_data when available, falling back to raw data
 * processing only when filters are applied.
 * 
 * @module useChannelMetrics
 */

import { useMemo } from 'react';
import { buildMultiMonthDateRange, buildComparisonDateRange, buildComparisonDateRangeFromExact, exactDateRangeFromDayPicker } from '@/lib/monthUtils';
import {
  filterRawDataRows,
  aggregateRowsToMetrics,
  hasAnyActiveFilters,
  hasAnyPositiveFilters,
  getChannelsWithFilters,
} from '@/lib/slideViewHelpers';
import type { SlideReportPivotData } from '@/types/slideReports';
import type { MetricData } from '@/types/slideView';
import type { DateRange } from 'react-day-picker';

/**
 * Channel metrics structure containing totals for each channel
 */
export interface ChannelMetrics {
  /** Metasearch channel metrics */
  metasearch: MetricData;
  /** SEM channel metrics */
  sem: MetricData;
  /** Social channel metrics */
  social: MetricData;
}

/**
 * Parameters for useChannelMetrics hook
 */
interface UseChannelMetricsParams {
  /** Pre-computed pivot data containing aggregated metrics */
  pivotData: SlideReportPivotData | null;
  /** Selected year filter ('all' or specific year) */
  selectedYear: string;
  /** Selected month filter ('all' or specific month name) */
  selectedMonth: string;
  /** Active filter values by channel and dimension */
  filterValues: Record<string, Record<string, string[]>>;
  /** Available filter dimension values for dropdowns */
  filterDimensionValues: Record<string, Record<string, string[]>>;
  /** Type of slide report ('master-report', 'brady', etc.) */
  slideType: string;
  /** Comparison type for metrics comparison */
  comparisonType: 'none' | 'previous_period' | 'previous_year';
  /** Exact custom date range from top date filter (if selected). */
  customDateRange?: DateRange;
}

/**
 * Calculate current channel totals based on selected filters and date range
 * 
 * This hook provides optimized metric calculations by:
 * 1. Using pre-computed data from pivot_data when no filters are applied (fast path)
 * 2. Filtering and re-aggregating raw data rows when filters are active
 * 3. Supporting date range filtering (year/month selection)
 * 4. Providing comparison metrics for previous period/year analysis
 * 
 * @param params - Configuration parameters for metrics calculation
 * @returns Object containing currentTotals and comparisonTotals
 * 
 * @example
 * ```tsx
 * const { currentTotals, comparisonTotals } = useChannelMetrics({
 *   pivotData: slideReport?.pivot_data,
 *   selectedYear: '2024',
 *   selectedMonth: 'January',
 *   filterValues: { metasearch: { hotel: ['Hotel A'] } },
 *   filterDimensionValues: {},
 *   slideType: 'master-report',
 *   comparisonType: 'previous_period'
 * });
 * ```
 */
export function useChannelMetrics({
  pivotData,
  selectedYear,
  selectedMonth,
  filterValues,
  filterDimensionValues,
  slideType,
  comparisonType,
  customDateRange,
}: UseChannelMetricsParams) {
  const ZERO_METRICS: MetricData = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };

  /**
   * Unified helper: aggregate raw rows for a channel with optional date + dimension filters.
   * Always uses aggregateRowsToMetrics (canonical, case-insensitive) so all channels behave identically.
   */
  function aggregateChannelRows(
    channelData: any,
    channelFilterValues: Record<string, string[]>,
    dateRange: { start: Date; end: Date } | undefined
  ): MetricData {
    const rawDataRows: any[] = channelData.rawDataRows || [];
    const dimensionMap: Record<string, string> = channelData.dimensionMap || {};

    if (rawDataRows.length > 0) {
      const filtered = filterRawDataRows(rawDataRows, channelFilterValues, dateRange, dimensionMap);
      return aggregateRowsToMetrics(filtered, dimensionMap);
    }

    // No raw rows — fall back to pre-computed blobs (legacy pivot_data path)
    if (dateRange) {
      const monthly: Record<string, MetricData> = channelData.monthly || {};
      const agg = { ...ZERO_METRICS };
      let found = false;
      for (const [monthKey, m] of Object.entries(monthly)) {
        const [y, mo] = monthKey.split('-').map(Number);
        const monthStart = new Date(y, mo - 1, 1);
        const monthEnd = new Date(y, mo, 0, 23, 59, 59);
        if (monthStart >= dateRange.start && monthEnd <= dateRange.end) {
          agg.impressions += (m as MetricData).impressions ?? 0;
          agg.clicks += (m as MetricData).clicks ?? 0;
          agg.cost += (m as MetricData).cost ?? 0;
          agg.revenue += (m as MetricData).revenue ?? 0;
          agg.bookings += (m as MetricData).bookings ?? 0;
          found = true;
        }
      }
      if (found) return agg;
    }

    return (channelData.current as MetricData) || { ...ZERO_METRICS };
  }

  // Compute current channel totals from rawDataRows (primary path) with date + filter support.
  const currentTotals = useMemo((): ChannelMetrics => {
    if (!pivotData?.channels) {
      return {
        metasearch: { ...ZERO_METRICS },
        sem: { ...ZERO_METRICS },
        social: { ...ZERO_METRICS },
      };
    }

    const dateRange = buildMultiMonthDateRange(selectedYear, selectedMonth);
    const hasFilters = hasAnyActiveFilters(filterValues);
    const hasPositiveGlobalFilters = hasAnyPositiveFilters(filterValues);
    const channelsWithFilters = hasFilters
      ? getChannelsWithFilters(filterValues)
      : new Set<string>();

    const channelTotals: Record<string, MetricData> = {};
    for (const [channel, channelData] of Object.entries(pivotData.channels)) {
      if (hasPositiveGlobalFilters && !channelsWithFilters.has(channel)) {
        channelTotals[channel] = { ...ZERO_METRICS };
      } else {
        const channelFilterValues =
          hasFilters && channelsWithFilters.has(channel)
            ? filterValues[channel] || {}
            : {};
        channelTotals[channel] = aggregateChannelRows(
          channelData as any,
          channelFilterValues,
          dateRange
        );
      }
    }
    return channelTotals as unknown as ChannelMetrics;
  }, [
    pivotData,
    selectedYear,
    selectedMonth,
    filterValues,
    filterDimensionValues,
    slideType,
  ]);

  // Get comparison totals based on comparison type
  // IMPORTANT: When filters are applied, we need to filter comparison data the same way as current data
  // Otherwise, comparison values will be incorrect (unfiltered vs filtered)
  const comparisonTotals = useMemo((): ChannelMetrics | null => {
    if (comparisonType === 'none') return null;
    if (!pivotData?.channels) return null;

    // Check if any filters are applied - if so, we need to filter comparison data too
    const hasFilters = hasAnyActiveFilters(filterValues);
    const hasPositiveGlobalFilters = hasAnyPositiveFilters(filterValues);
    const channelsWithFilters = getChannelsWithFilters(filterValues);

    // Build comparison period date range.
    // Prefer exact DateRange (custom / preset exact windows), then fall back to year/month model.
    const exactCurrentRange = exactDateRangeFromDayPicker(customDateRange);
    const comparisonDateRange = exactCurrentRange
      ? buildComparisonDateRangeFromExact(exactCurrentRange, comparisonType)
      : buildComparisonDateRange(selectedYear, selectedMonth, comparisonType);

    // Compute comparison totals using the same unified aggregateChannelRows helper.
    const channelTotals: Record<string, MetricData> = {};

    if (comparisonDateRange) {
      for (const [channel, channelData] of Object.entries(pivotData.channels)) {
        if (hasPositiveGlobalFilters && !channelsWithFilters.has(channel)) {
          channelTotals[channel] = { ...ZERO_METRICS };
        } else {
          const channelFilterValues =
            hasFilters && channelsWithFilters.has(channel)
              ? filterValues[channel] || {}
              : {};
          channelTotals[channel] = aggregateChannelRows(
            channelData as any,
            channelFilterValues,
            comparisonDateRange
          );
        }
      }
      return channelTotals as unknown as ChannelMetrics;
    }

    // No comparison date range (e.g. selectedYear === 'all') — return zeros
    for (const channel of Object.keys(pivotData.channels)) {
      channelTotals[channel] = { ...ZERO_METRICS };
    }
    return channelTotals as unknown as ChannelMetrics;
  }, [comparisonType, pivotData, filterValues, filterDimensionValues, selectedYear, selectedMonth, customDateRange]);

  return {
    currentTotals,
    comparisonTotals,
  };
}
