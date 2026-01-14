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
import { MONTH_NAMES } from '@/constants/slideViewConstants';
import {
  filterRawDataRows,
  buildMetricNameToIdsMap,
  getMetricKeys,
} from '@/lib/slideViewHelpers';
import type { SlideReportPivotData } from '@/types/slideReports';
import type { MetricData } from '@/types/slideView';

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
  /** Dynamic channel totals for fallback scenarios */
  dynamicChannelTotals: Record<string, any>;
  /** Comparison type for metrics comparison */
  comparisonType: 'none' | 'previous_period' | 'previous_year';
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
 *   dynamicChannelTotals: {},
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
  dynamicChannelTotals,
  comparisonType,
}: UseChannelMetricsParams) {
  // Get current totals based on selected year/month from pivot_data
  // Applies filterValues if they are set (but not when "All" is selected)
  const currentTotals = useMemo((): ChannelMetrics => {
    // Early return if no pivot data available yet
    if (!pivotData?.channels) {
      return {
        metasearch: { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 },
        sem: { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 },
        social: { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 },
      };
    }

    // Check if any filters are actually applied (not "All" selected)
    const hasFilters = Object.entries(filterValues).some(([channel, channelFilters]) => {
      return Object.entries(channelFilters).some(([dimensionId, selectedValues]) => {
        // If filter is explicitly set to empty array, it's an active filter that excludes everything
        if (selectedValues && selectedValues.length === 0) {
          return true; // Explicitly empty = active filter = filter out everything
        }
        
        // If filter is not set (undefined/null), skip (no filter)
        if (!selectedValues) {
          return false; // No filter = show all
        }
        
        // Check if all available values are selected (also means "All" = no filter)
        const availableValues = filterDimensionValues[channel]?.[dimensionId] || [];
        if (availableValues.length > 0 && selectedValues.length === availableValues.length) {
          // Check if they're the same set
          const selectedSet = new Set(selectedValues);
          const availableSet = new Set(availableValues);
          if (
            selectedSet.size === availableSet.size &&
            [...selectedSet].every((v) => availableSet.has(v))
          ) {
            return false; // All values selected = "All" = no filter
          }
        }
        return true; // Subset selected = filter is applied
      });
    });

    // If filters are applied, we need to filter rawDataRows and re-aggregate
    if (hasFilters && pivotData?.channels) {
      // Build date range based on selected year/month
      let dateRange: { start: Date; end: Date } | undefined;
      if (selectedMonth !== 'all' && selectedYear !== 'all') {
        const monthNum = MONTH_NAMES.indexOf(selectedMonth);
        const yearNum = parseInt(selectedYear);
        dateRange = {
          start: new Date(yearNum, monthNum, 1),
          end: new Date(yearNum, monthNum + 1, 0, 23, 59, 59),
        };
      } else if (selectedYear !== 'all') {
        const yearNum = parseInt(selectedYear);
        dateRange = {
          start: new Date(yearNum, 0, 1),
          end: new Date(yearNum, 11, 31, 23, 59, 59),
        };
      }

      const channelTotals: Record<string, MetricData> = {};

      // Determine which channels have active filters
      const channelsWithFilters = new Set<string>();
      Object.entries(filterValues).forEach(([channel, channelFilters]) => {
        const hasChannelFilters = Object.entries(channelFilters).some(
          ([dimensionId, selectedValues]) => {
            // If filter is explicitly set to empty array, it's an active filter that excludes everything
            if (selectedValues && selectedValues.length === 0) {
              return true; // Explicitly empty = active filter = filter out everything
            }
            
            // If filter is not set (undefined/null), skip (no filter)
            if (!selectedValues) {
              return false; // No filter = show all
            }
            
            const availableValues = filterDimensionValues[channel]?.[dimensionId] || [];
            if (availableValues.length > 0 && selectedValues.length === availableValues.length) {
              const selectedSet = new Set(selectedValues);
              const availableSet = new Set(availableValues);
              if (
                selectedSet.size === availableSet.size &&
                [...selectedSet].every((v) => availableSet.has(v))
              ) {
                return false;
              }
            }
            return true;
          }
        );
        if (hasChannelFilters) {
          channelsWithFilters.add(channel);
        }
      });

      for (const [channel, channelData] of Object.entries(pivotData.channels)) {
        const channelFilterValues = filterValues[channel] || {};
        const hasChannelFilters = channelsWithFilters.has(channel);

        // If this channel has filters, filter rawDataRows and re-aggregate
        if (hasChannelFilters) {
          const rawDataRows = (channelData as any).rawDataRows || [];
          const filteredRows = filterRawDataRows(rawDataRows, channelFilterValues, dateRange);

          if (filteredRows.length > 0) {
            const dimensionMap = (channelData as any).dimensionMap || {};
            const nameToIdsMap = buildMetricNameToIdsMap(dimensionMap);

            const metrics: MetricData = {
              impressions: 0,
              clicks: 0,
              cost: 0,
              revenue: 0,
              bookings: 0,
            };

            filteredRows.forEach((row) => {
              const rowData = row.dimension_values || row;

              // Helper to safely extract numeric value
              const getMetricValue = (keys: string[]): number => {
                for (const key of keys) {
                  const value = rowData[key];
                  if (value !== undefined && value !== null) {
                    if (typeof value === 'number') {
                      return isNaN(value) ? 0 : value;
                    }
                    const parsed = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
                    if (!isNaN(parsed)) {
                      return parsed;
                    }
                  }
                }
                return 0;
              };

              metrics.impressions += getMetricValue(getMetricKeys('impressions', nameToIdsMap));
              metrics.clicks += getMetricValue(getMetricKeys('clicks', nameToIdsMap));
              metrics.cost += getMetricValue(getMetricKeys('cost', nameToIdsMap));
              metrics.revenue += getMetricValue(getMetricKeys('revenue', nameToIdsMap));
              metrics.bookings += getMetricValue(getMetricKeys('bookings', nameToIdsMap));
            });

            channelTotals[channel] = metrics;
          } else {
            channelTotals[channel] = {
              impressions: 0,
              clicks: 0,
              cost: 0,
              revenue: 0,
              bookings: 0,
            };
          }
        } else {
          // This channel has no filters - use pre-computed data
          if (selectedMonth && selectedMonth !== 'all') {
            const monthNum = MONTH_NAMES.indexOf(selectedMonth) + 1;
            const monthKey =
              selectedYear !== 'all'
                ? `${selectedYear}-${monthNum.toString().padStart(2, '0')}`
                : null;

            if (monthKey) {
              const monthlyData = (channelData as any).monthly?.[monthKey];
              if (monthlyData) {
                channelTotals[channel] = monthlyData;
              } else {
                channelTotals[channel] = {
                  impressions: 0,
                  clicks: 0,
                  cost: 0,
                  revenue: 0,
                  bookings: 0,
                };
              }
            } else {
              channelTotals[channel] =
                (channelData as any).current || {
                  impressions: 0,
                  clicks: 0,
                  cost: 0,
                  revenue: 0,
                  bookings: 0,
                };
            }
          } else if (selectedYear !== 'all') {
            const yearNum = parseInt(selectedYear);
            const yearlyData = (channelData as any).yearly?.[String(yearNum)];
            if (yearlyData) {
              channelTotals[channel] = yearlyData;
            } else {
              channelTotals[channel] = {
                impressions: 0,
                clicks: 0,
                cost: 0,
                revenue: 0,
                bookings: 0,
              };
            }
          } else {
            channelTotals[channel] =
              (channelData as any).current || {
                impressions: 0,
                clicks: 0,
                cost: 0,
                revenue: 0,
                bookings: 0,
              };
          }
        }
      }

      return channelTotals as ChannelMetrics;
    }

    // No filters applied - use pre-computed aggregated data (fast path)
    if (pivotData?.channels) {
      const channelTotals: Record<string, MetricData> = {};

      // Use pre-computed data based on selected year/month
      if (selectedMonth !== 'all' && selectedYear !== 'all') {
        const monthNum = MONTH_NAMES.indexOf(selectedMonth) + 1;
        const monthKey =
          selectedYear !== 'all'
            ? `${selectedYear}-${monthNum.toString().padStart(2, '0')}`
            : null;

        if (monthKey) {
          for (const [channel, channelData] of Object.entries(pivotData.channels)) {
            const monthlyData = (channelData as any).monthly?.[monthKey];
            channelTotals[channel] = monthlyData || {
              impressions: 0,
              clicks: 0,
              cost: 0,
              revenue: 0,
              bookings: 0,
            };
          }
          return channelTotals as ChannelMetrics;
        }
      }

      if (selectedYear !== 'all') {
        const yearNum = parseInt(selectedYear);
        for (const [channel, channelData] of Object.entries(pivotData.channels)) {
          const yearlyData = (channelData as any).yearly?.[String(yearNum)];
          channelTotals[channel] = yearlyData || {
            impressions: 0,
            clicks: 0,
            cost: 0,
            revenue: 0,
            bookings: 0,
          };
        }
        return channelTotals as ChannelMetrics;
      }

      // Use current totals for all years (fastest - pre-computed)
      for (const [channel, channelData] of Object.entries(pivotData.channels)) {
        channelTotals[channel] =
          (channelData as any).current || {
            impressions: 0,
            clicks: 0,
            cost: 0,
            revenue: 0,
            bookings: 0,
          };
      }
      return channelTotals as ChannelMetrics;
    }

    // Fallback to dynamic data or zeros
    if (slideType === 'master-report' && Object.keys(dynamicChannelTotals).length > 0) {
      return dynamicChannelTotals as ChannelMetrics;
    }

    return {
      metasearch: { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 },
      sem: { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 },
      social: { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 },
    };
  }, [
    pivotData,
    selectedYear,
    selectedMonth,
    filterValues,
    filterDimensionValues,
    slideType,
    dynamicChannelTotals,
  ]);

  // Get comparison totals based on comparison type
  const comparisonTotals = useMemo((): ChannelMetrics | null => {
    if (comparisonType === 'none') return null;
    if (!pivotData?.channels) return null;

    const channelTotals: Record<string, MetricData> = {};
    for (const [channel, channelData] of Object.entries(pivotData.channels)) {
      if (comparisonType === 'previous_period' && (channelData as any).previous_period) {
        channelTotals[channel] = (channelData as any).previous_period;
      } else if (comparisonType === 'previous_year' && (channelData as any).previous_year) {
        channelTotals[channel] = (channelData as any).previous_year;
      } else {
        channelTotals[channel] = {
          impressions: 0,
          clicks: 0,
          cost: 0,
          revenue: 0,
          bookings: 0,
        };
      }
    }
    return channelTotals as ChannelMetrics;
  }, [comparisonType, pivotData]);

  return {
    currentTotals,
    comparisonTotals,
  };
}
