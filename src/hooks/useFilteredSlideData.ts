/**
 * Unified filtered data hook for SlideViewPage
 * Provides a single source of truth for all filtered data
 * 
 * This hook centralizes all filter logic and data processing to ensure
 * consistency across all components that need filtered data.
 */

import { useMemo } from 'react';
import { MONTH_NAMES } from '@/constants/slideViewConstants';
import {
  filterRawDataRows,
  hasAnyActiveFilters,
  getChannelsWithFilters,
  buildMetricNameToIdsMap,
  getMetricKeys,
} from '@/lib/slideViewHelpers';
import type { SlideReportPivotData } from '@/types/slideReports';
import type { MetricData, MonthlyDataPoint, RawDataRow } from '@/types/slideView';

export interface UseFilteredSlideDataParams {
  pivotData: SlideReportPivotData | null;
  filterValues: Record<string, Record<string, string[]>>;
  filterDimensionValues: Record<string, Record<string, string[]>>;
  selectedYear: string;
  selectedMonth: string;
  selectedTab?: string;
  slideType?: string;
  dynamicChannelTotals?: Record<string, MetricData>;
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
 * Unified hook that provides all filtered data as a single source of truth
 * 
 * @param params - Configuration parameters
 * @returns FilteredSlideData object with all filtered data and helper methods
 */
export function useFilteredSlideData({
  pivotData,
  filterValues,
  filterDimensionValues,
  selectedYear,
  selectedMonth,
  selectedTab,
  slideType,
  dynamicChannelTotals,
}: UseFilteredSlideDataParams): FilteredSlideData {
  // Build date range based on selected year/month
  const dateRange = useMemo<{ start: Date; end: Date } | undefined>(() => {
    if (selectedMonth !== 'all' && selectedYear !== 'all') {
      const monthNum = MONTH_NAMES.indexOf(selectedMonth);
      const yearNum = parseInt(selectedYear);
      return {
        start: new Date(yearNum, monthNum, 1),
        end: new Date(yearNum, monthNum + 1, 0, 23, 59, 59),
      };
    } else if (selectedYear !== 'all') {
      const yearNum = parseInt(selectedYear);
      return {
        start: new Date(yearNum, 0, 1),
        end: new Date(yearNum, 11, 31, 23, 59, 59),
      };
    }
    return undefined;
  }, [selectedYear, selectedMonth]);

  // Check if any filters are active using centralized function
  const hasFilters = useMemo(() => {
    return hasAnyActiveFilters(filterValues, filterDimensionValues);
  }, [filterValues, filterDimensionValues]);

  // Get channels with active filters
  const channelsWithFilters = useMemo(() => {
    return getChannelsWithFilters(filterValues, filterDimensionValues);
  }, [filterValues, filterDimensionValues]);

  // Calculate all filtered data in a single memoized computation
  const filteredData = useMemo(() => {
    console.log('[testing] useFilteredSlideData recalculating with filterValues:', filterValues, 'selectedYear:', selectedYear, 'selectedMonth:', selectedMonth);
    
    // Early return if no pivot data
    if (!pivotData?.channels) {
      const emptyMetrics: MetricData = {
        impressions: 0,
        clicks: 0,
        cost: 0,
        revenue: 0,
        bookings: 0,
      };
      return {
        channelTotals: {
          metasearch: emptyMetrics,
          sem: emptyMetrics,
          social: emptyMetrics,
        },
        monthlyData: [],
        filteredRawRows: {},
      };
    }

    const channelTotals: Record<string, MetricData> = {};
    const filteredRawRows: Record<string, RawDataRow[]> = {};
    const monthlyDataMap = new Map<string, { year: number; month: string; metasearch: number; sem: number; social: number }>();

    // Process each channel
    for (const [channel, channelData] of Object.entries(pivotData.channels)) {
      const channelFilterValues = filterValues[channel] || {};
      const hasChannelFilters = channelsWithFilters.has(channel);
      const rawDataRows = (channelData as any).rawDataRows || [];

      // If this channel has filters, filter rawDataRows and re-aggregate
      if (hasChannelFilters && rawDataRows.length > 0) {
        // Filter rows based on filterValues and date range
        const filteredRows = filterRawDataRows(rawDataRows, channelFilterValues, dateRange);
        filteredRawRows[channel] = filteredRows;

        console.log(`[testing] Channel ${channel}: ${rawDataRows.length} raw rows, ${filteredRows.length} filtered rows`);

        if (filteredRows.length > 0) {
          // Build dynamic metric mapping from dimensionMap
          const dimensionMap = (channelData as any).dimensionMap || {};
          const nameToIdsMap = buildMetricNameToIdsMap(dimensionMap);

          // Manually aggregate metrics from filtered rows
          const metrics: MetricData = {
            impressions: 0,
            clicks: 0,
            cost: 0,
            revenue: 0,
            bookings: 0,
          };

          let rowsWithDates = 0;
          let rowsWithRevenue = 0;
          let totalRevenue = 0;

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

            // Dynamically resolve metric keys using dimensionMap
            metrics.impressions += getMetricValue(getMetricKeys('impressions', nameToIdsMap));
            metrics.clicks += getMetricValue(getMetricKeys('clicks', nameToIdsMap));
            metrics.cost += getMetricValue(getMetricKeys('cost', nameToIdsMap));
            metrics.revenue += getMetricValue(getMetricKeys('revenue', nameToIdsMap));
            metrics.bookings += getMetricValue(getMetricKeys('bookings', nameToIdsMap));

            // Also aggregate for monthly data
            let dateValue: any = rowData.Date || rowData.date || rowData.Day || rowData.day;
            if (!dateValue) {
              for (const [key, val] of Object.entries(rowData)) {
                if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) {
                  dateValue = val;
                  break;
                }
              }
            }

            if (dateValue) {
              const rowDate = new Date(dateValue);
              if (!isNaN(rowDate.getTime())) {
                rowsWithDates++;
                const year = rowDate.getFullYear();
                const month = MONTH_NAMES[rowDate.getMonth()];
                const key = `${year}-${month}`;

                if (!monthlyDataMap.has(key)) {
                  monthlyDataMap.set(key, { year, month, metasearch: 0, sem: 0, social: 0 });
                }

                const entry = monthlyDataMap.get(key)!;
                // Use the same dynamic metric extraction as channel totals
                const revenue = getMetricValue(getMetricKeys('revenue', nameToIdsMap));
                if (revenue > 0) {
                  rowsWithRevenue++;
                  totalRevenue += revenue;
                }
                entry[channel as 'metasearch' | 'sem' | 'social'] += revenue;
              } else {
                console.log(`[testing] Invalid date value for row in channel ${channel}:`, dateValue);
              }
            } else {
              if (filteredRows.length <= 5) {
                console.log(`[testing] No date value found for row in channel ${channel}, rowData keys:`, Object.keys(rowData), 'sample rowData:', rowData);
              }
            }
          });

          console.log(`[testing] Channel ${channel} monthly aggregation: ${rowsWithDates} rows with dates, ${rowsWithRevenue} rows with revenue, total revenue: ${totalRevenue}, monthlyDataMap size: ${monthlyDataMap.size}`);

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
        // This channel has no filters
        filteredRawRows[channel] = rawDataRows; // Store all rows for consistency

        // IMPORTANT: If ANY channel has filters, channels WITHOUT filters should show zeros
        // This ensures that when filtering to only one channel (e.g., metasearch),
        // the other channels (sem, social) show zeros instead of their full unfiltered data
        if (hasFilters) {
          // Other channels have filters, so this channel should be zeroed out
          console.log(`[testing] Channel ${channel} has no filters but other channels do - zeroing out`);
          channelTotals[channel] = {
            impressions: 0,
            clicks: 0,
            cost: 0,
            revenue: 0,
            bookings: 0,
          };
          // Don't add to monthlyDataMap when zeroed out
        } else {
          // No filters on any channel - use pre-computed data (fast path)
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

          // Build monthly data from pre-computed data
          if (channelData.monthly) {
            Object.entries(channelData.monthly).forEach(([monthKey, metrics]) => {
              const [year, monthNum] = monthKey.split('-').map(Number);
              const month = MONTH_NAMES[monthNum - 1];
              const key = `${year}-${month}`;

              if (!monthlyDataMap.has(key)) {
                monthlyDataMap.set(key, { year, month, metasearch: 0, sem: 0, social: 0 });
              }

              const entry = monthlyDataMap.get(key)!;
              entry[channel as 'metasearch' | 'sem' | 'social'] = metrics.revenue || 0;
            });
          }
        }
      }
    }

    // Convert monthly data map to array and sort
    const monthlyData = Array.from(monthlyDataMap.values()).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return MONTH_NAMES.indexOf(a.month) - MONTH_NAMES.indexOf(b.month);
    });

    // Filter monthly data by selectedYear if needed
    const filteredMonthlyData =
      selectedYear !== 'all'
        ? monthlyData.filter((m) => m.year === parseInt(selectedYear))
        : monthlyData;

    console.log('[testing] Final monthlyData from useFilteredSlideData:', filteredMonthlyData);
    console.log('[testing] Final channelTotals from useFilteredSlideData:', channelTotals);

    // Ensure all channels have totals (default to zeros if missing)
    const defaultMetrics: MetricData = {
      impressions: 0,
      clicks: 0,
      cost: 0,
      revenue: 0,
      bookings: 0,
    };

    const finalChannelTotals = {
      metasearch: channelTotals.metasearch || defaultMetrics,
      sem: channelTotals.sem || defaultMetrics,
      social: channelTotals.social || defaultMetrics,
    };

    console.log('[testing] Final channelTotals (with defaults):', finalChannelTotals);

    return {
      channelTotals: finalChannelTotals,
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
  ]);

  // Helper method to get filtered rows for a channel
  const getFilteredRowsForChannel = useMemo(
    () => (channel: string): RawDataRow[] => {
      return filteredData.filteredRawRows[channel] || [];
    },
    [filteredData.filteredRawRows]
  );

  // Helper method to get channel totals
  const getChannelTotals = useMemo(
    () => (channel: string): MetricData => {
      const defaultMetrics: MetricData = {
        impressions: 0,
        clicks: 0,
        cost: 0,
        revenue: 0,
        bookings: 0,
      };
      return filteredData.channelTotals[channel as keyof typeof filteredData.channelTotals] || defaultMetrics;
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
