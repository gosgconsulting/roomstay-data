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
  hasAnyActiveFilters,
  getChannelsWithFilters,
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

    // Check if any filters are actually applied using centralized function
    const hasFilters = hasAnyActiveFilters(filterValues, filterDimensionValues);

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

      // Determine which channels have active filters using centralized function
      const channelsWithFilters = getChannelsWithFilters(filterValues, filterDimensionValues);

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
            
            // Build metricNameToIdMap (same as breakdown table) - reverse mapping: name -> id
            // This ensures we use "Cost" with capital C as the source of truth
            const metricNameToIdMap: Record<string, string> = {};
            Object.entries(dimensionMap as Record<string, string>).forEach(([dimensionId, dimensionName]) => {
              if (dimensionName && typeof dimensionName === 'string') {
                metricNameToIdMap[dimensionName] = dimensionId;
              }
            });

            const metrics: MetricData = {
              impressions: 0,
              clicks: 0,
              cost: 0,
              revenue: 0,
              bookings: 0,
            };

            filteredRows.forEach((row) => {
              const rowData = row.dimension_values || row;

              // Use EXACT same extraction logic as UnifiedBreakdownTable for consistency
              // This ensures we get the same values as the breakdown table
              const impressionsValue = parseFloat(rowData[metricNameToIdMap['Impressions']] || rowData['Impressions'] || 0) || 0;
              const clicksValue = parseFloat(rowData[metricNameToIdMap['Clicks']] || rowData['Clicks'] || 0) || 0;
              const costValue = parseFloat(rowData[metricNameToIdMap['Cost']] || rowData['Cost'] || 0) || 0;
              const revenueValue = parseFloat(rowData[metricNameToIdMap['Revenue']] || rowData['Revenue'] || 0) || 0;
              const bookingsValue = parseFloat(rowData[metricNameToIdMap['Bookings']] || rowData['Bookings'] || 0) || 0;
              
              metrics.impressions += impressionsValue;
              metrics.clicks += clicksValue;
              metrics.cost += costValue;
              metrics.revenue += revenueValue;
              metrics.bookings += bookingsValue;
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
  // IMPORTANT: When filters are applied, we need to filter comparison data the same way as current data
  // Otherwise, comparison values will be incorrect (unfiltered vs filtered)
  const comparisonTotals = useMemo((): ChannelMetrics | null => {
    if (comparisonType === 'none') return null;
    if (!pivotData?.channels) return null;

    // Check if any filters are applied - if so, we need to filter comparison data too
    const hasFilters = hasAnyActiveFilters(filterValues, filterDimensionValues);
    const channelsWithFilters = getChannelsWithFilters(filterValues, filterDimensionValues);

    // Build comparison period date range
    let comparisonDateRange: { start: Date; end: Date } | undefined;
    if (selectedMonth !== 'all' && selectedYear !== 'all') {
      const monthNum = MONTH_NAMES.indexOf(selectedMonth);
      const yearNum = parseInt(selectedYear);
      const currentDate = new Date(yearNum, monthNum, 1);
      
      if (comparisonType === 'previous_period') {
        // Previous period: previous month
        const prevDate = new Date(yearNum, monthNum - 1, 1);
        comparisonDateRange = {
          start: prevDate,
          end: new Date(yearNum, monthNum, 0, 23, 59, 59), // Last day of previous month
        };
      } else if (comparisonType === 'previous_year') {
        // Previous year: same month last year
        comparisonDateRange = {
          start: new Date(yearNum - 1, monthNum, 1),
          end: new Date(yearNum - 1, monthNum + 1, 0, 23, 59, 59),
        };
      }
    } else if (selectedYear !== 'all') {
      const yearNum = parseInt(selectedYear);
      if (comparisonType === 'previous_period') {
        // Previous period: previous year (when all months selected)
        comparisonDateRange = {
          start: new Date(yearNum - 1, 0, 1),
          end: new Date(yearNum - 1, 11, 31, 23, 59, 59),
        };
      } else if (comparisonType === 'previous_year') {
        // Previous year: same year range last year
        comparisonDateRange = {
          start: new Date(yearNum - 1, 0, 1),
          end: new Date(yearNum - 1, 11, 31, 23, 59, 59),
        };
      }
    }

    // If filters are applied, filter comparison period raw data
    if (hasFilters && comparisonDateRange) {
      const channelTotals: Record<string, MetricData> = {};
      
      for (const [channel, channelData] of Object.entries(pivotData.channels)) {
        const channelFilterValues = filterValues[channel] || {};
        const hasChannelFilters = channelsWithFilters.has(channel);
        
        if (hasChannelFilters) {
          // Filter raw data for comparison period
          const rawDataRows = (channelData as any).rawDataRows || [];
          
          if (rawDataRows.length > 0) {
            const dimensionMap = (channelData as any).dimensionMap || {};
            const filteredRows = filterRawDataRows(rawDataRows, channelFilterValues, comparisonDateRange, dimensionMap);
            
            if (filteredRows.length > 0) {
              // Build metric mapping and aggregate
              const dimensionMap = (channelData as any).dimensionMap || {};
              const nameToIdsMap = buildMetricNameToIdsMap(dimensionMap);
              
              // Build metricNameToIdMap (same as breakdown table) - reverse mapping: name -> id
              // This ensures we use "Cost" with capital C as the source of truth
              const metricNameToIdMap: Record<string, string> = {};
              Object.entries(dimensionMap as Record<string, string>).forEach(([dimensionId, dimensionName]) => {
                if (dimensionName && typeof dimensionName === 'string') {
                  metricNameToIdMap[dimensionName] = dimensionId;
                }
              });
              
              const metrics: MetricData = {
                impressions: 0,
                clicks: 0,
                cost: 0,
                revenue: 0,
                bookings: 0,
              };
              
              filteredRows.forEach((row) => {
                const rowData = row.dimension_values || row;
                
                // Use EXACT same extraction logic as UnifiedBreakdownTable for consistency
                // This ensures we get the same values as the breakdown table
                const impressionsValue = parseFloat(rowData[metricNameToIdMap['Impressions']] || rowData['Impressions'] || 0) || 0;
                const clicksValue = parseFloat(rowData[metricNameToIdMap['Clicks']] || rowData['Clicks'] || 0) || 0;
                const costValue = parseFloat(rowData[metricNameToIdMap['Cost']] || rowData['Cost'] || 0) || 0;
                const revenueValue = parseFloat(rowData[metricNameToIdMap['Revenue']] || rowData['Revenue'] || 0) || 0;
                const bookingsValue = parseFloat(rowData[metricNameToIdMap['Bookings']] || rowData['Bookings'] || 0) || 0;
                
                metrics.impressions += impressionsValue;
                metrics.clicks += clicksValue;
                metrics.cost += costValue;
                metrics.revenue += revenueValue;
                metrics.bookings += bookingsValue;
              });
              
              channelTotals[channel] = metrics;
            } else {
              // No filtered rows - set to zeros
              channelTotals[channel] = {
                impressions: 0,
                clicks: 0,
                cost: 0,
                revenue: 0,
                bookings: 0,
              };
            }
          } else {
            // No raw data - fall back to pre-computed (unfiltered)
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
        } else {
          // No filters for this channel - use pre-computed data
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
      }
      
      return channelTotals as ChannelMetrics;
    }

    // No filters but we have a comparison date range (selected year/month) - compute from monthly data
    // so comparison period matches the user's selection (e.g. Previous Period = previous month)
    if (comparisonDateRange) {
      const channelTotals: Record<string, MetricData> = {};
      for (const [channel, channelData] of Object.entries(pivotData.channels)) {
        const monthly = (channelData as any).monthly || {};
        const base: MetricData = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
        for (const [monthKey, m] of Object.entries(monthly)) {
          const [y, mo] = monthKey.split('-').map(Number);
          const monthStart = new Date(y, mo - 1, 1);
          const monthEnd = new Date(y, mo, 0, 23, 59, 59);
          if (monthStart >= comparisonDateRange.start && monthEnd <= comparisonDateRange.end) {
            const metrics = m as MetricData;
            base.impressions += metrics.impressions ?? 0;
            base.clicks += metrics.clicks ?? 0;
            base.cost += metrics.cost ?? 0;
            base.revenue += metrics.revenue ?? 0;
            base.bookings += metrics.bookings ?? 0;
          }
        }
        channelTotals[channel] = base;
      }
      return channelTotals as ChannelMetrics;
    }

    // Fallback: use pre-computed previous_period/previous_year from channel data (e.g. when selectedYear is 'all')
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
  }, [comparisonType, pivotData, filterValues, filterDimensionValues, selectedYear, selectedMonth]);

  return {
    currentTotals,
    comparisonTotals,
  };
}
