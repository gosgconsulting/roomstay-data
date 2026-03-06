/**
 * Unified filtered data hook for SlideViewPage
 * Provides a single source of truth for all filtered data
 * 
 * This hook centralizes all filter logic and data processing to ensure
 * consistency across all components that need filtered data.
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

export interface UseFilteredSlideDataParams {
  pivotData: SlideReportPivotData | null;
  filterValues: Record<string, Record<string, string[]>>;
  filterDimensionValues: Record<string, Record<string, string[]>>;
  selectedYear: string;
  selectedMonth: string;
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
  groupByDimensionId,
}: UseFilteredSlideDataParams): FilteredSlideData {
  // Build date range based on selected year/month (supports multi-month)
  const dateRange = useMemo<{ start: Date; end: Date } | undefined>(() => {
    return buildMultiMonthDateRange(selectedYear, selectedMonth);
  }, [selectedYear, selectedMonth]);

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
      const dimensionMap = (channelData as any).dimensionMap || {};



      // If this channel has filters, filter rawDataRows and re-aggregate
      if (hasChannelFilters && rawDataRows.length > 0) {
        // Filter rows based on filterValues and date range
        // Pass dimensionMap so name-keyed data (e.g. "Hotel") is matched by UUID filter keys
        const filteredRows = filterRawDataRows(rawDataRows, channelFilterValues, dateRange, dimensionMap);
        filteredRawRows[channel] = filteredRows;

        if (filteredRows.length > 0) {
          // Build dynamic metric mapping from dimensionMap (already extracted above)
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
                const value = (rowData as any)[key];
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

            // Use robust, variation-aware metric extraction (e.g. "Cost (USD)")
            const impressionsValue = getMetricValue(getMetricKeys('impressions', nameToIdsMap));
            const clicksValue = getMetricValue(getMetricKeys('clicks', nameToIdsMap));
            const costValue = getMetricValue(getMetricKeys('cost', nameToIdsMap));
            const revenueValue = getMetricValue(getMetricKeys('revenue', nameToIdsMap));
            const bookingsValue = getMetricValue(getMetricKeys('bookings', nameToIdsMap));
            
            metrics.impressions += impressionsValue;
            metrics.clicks += clicksValue;
            metrics.cost += costValue;
            metrics.revenue += revenueValue;
            metrics.bookings += bookingsValue;

            // Also aggregate for monthly data
            let dateValue: any = (rowData as any).Date || (rowData as any).date || (rowData as any).Day || (rowData as any).day;
            if (!dateValue) {
              for (const [key, val] of Object.entries(rowData as any)) {
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
                console.log(`Invalid date value for row in channel ${channel}:`, dateValue);
              }
            } else {
              if (filteredRows.length <= 5) {
                console.log(`No date value found for row in channel ${channel}, rowData keys:`, Object.keys(rowData), 'sample rowData:', rowData);
              }
            }
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
      } else if (hasChannelFilters && rawDataRows.length === 0) {
        // No raw rows (e.g. data from table merge) — derive totals from breakdowns so View filter still applies.
        // Prefer groupBy dimension so KPI matches breakdown table (SEM/Social).
        const totalsFromBreakdowns = aggregateChannelTotalsFromBreakdowns(channelData as any, channelFilterValues, monthKeyForBreakdowns, groupByDimensionId);
        if (totalsFromBreakdowns) {
          channelTotals[channel] = totalsFromBreakdowns;
        } else {
          channelTotals[channel] = {
            impressions: 0,
            clicks: 0,
            cost: 0,
            revenue: 0,
            bookings: 0,
          };
        }
        filteredRawRows[channel] = [];
      } else {
        // This channel has no filters - use pre-computed data (fast path)
        filteredRawRows[channel] = rawDataRows; // Store all rows for consistency

        if (selectedMonth && selectedMonth !== 'all') {
          const months = parseSelectedMonths(selectedMonth);
          if (months && months.length > 0 && selectedYear !== 'all') {
            // Multi-month: aggregate across all selected months
            const agg: MetricData = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
            let foundPreComputed = false;
            for (const m of months) {
              const mk = `${selectedYear}-${m.toString().padStart(2, '0')}`;
              const md = (channelData as any).monthly?.[mk];
              if (md) {
                agg.impressions += md.impressions || 0;
                agg.clicks += md.clicks || 0;
                agg.cost += md.cost || 0;
                agg.revenue += md.revenue || 0;
                agg.bookings += md.bookings || 0;
                foundPreComputed = true;
              } else {
                // Fallback 1: aggregate from monthlyBreakdowns for this month key
                const monthlyBreakdowns = (channelData as any).monthlyBreakdowns as Record<string, Record<string, any[]>> | undefined;
                if (monthlyBreakdowns?.[mk]) {
                  const bdForMonth = monthlyBreakdowns[mk];
                  for (const dimRows of Object.values(bdForMonth)) {
                    if (Array.isArray(dimRows) && dimRows.length > 0) {
                      const summed = sumBreakdownRows(dimRows as BreakdownRowLike[]);
                      agg.impressions += summed.impressions;
                      agg.clicks += summed.clicks;
                      agg.cost += summed.cost;
                      agg.revenue += summed.revenue;
                      agg.bookings += summed.bookings;
                      foundPreComputed = true;
                      break; // Only use one dimension to avoid double-counting
                    }
                  }
                }
              }
            }

            // If pre-computed data yielded results, use them
            if (foundPreComputed && (agg.impressions > 0 || agg.clicks > 0 || agg.cost > 0 || agg.revenue > 0 || agg.bookings > 0)) {
              channelTotals[channel] = agg;
            } else if (rawDataRows.length > 0) {
              // Fallback 2: Aggregate directly from rawDataRows with date filtering
              // This matches BreakdownTableSection behavior and handles cases where
              // pre-computed monthly data hasn't been synced yet (e.g. 2026 data)
              const minMonth = Math.min(...months);
              const maxMonth = Math.max(...months);
              const yearNum = parseInt(selectedYear);
              const rawDateRange = {
                start: new Date(yearNum, minMonth - 1, 1),
                end: new Date(yearNum, maxMonth, 0, 23, 59, 59),
              };
              const dateFilteredRows = filterRawDataRows(rawDataRows, {}, rawDateRange);
              if (dateFilteredRows.length > 0) {
                const dimensionMap = (channelData as any).dimensionMap || {};
                const nameToIdsMap = buildMetricNameToIdsMap(dimensionMap);
                const rawAgg: MetricData = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
                dateFilteredRows.forEach((row) => {
                  const rowData = row.dimension_values || row;
                  const getVal = (keys: string[]): number => {
                    for (const key of keys) {
                      const v = (rowData as any)[key];
                      if (v !== undefined && v !== null) {
                        const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.-]/g, ''));
                        if (!isNaN(n)) return n;
                      }
                    }
                    return 0;
                  };
                  rawAgg.impressions += getVal(getMetricKeys('impressions', nameToIdsMap));
                  rawAgg.clicks += getVal(getMetricKeys('clicks', nameToIdsMap));
                  rawAgg.cost += getVal(getMetricKeys('cost', nameToIdsMap));
                  rawAgg.revenue += getVal(getMetricKeys('revenue', nameToIdsMap));
                  rawAgg.bookings += getVal(getMetricKeys('bookings', nameToIdsMap));
                });
                channelTotals[channel] = rawAgg;
              } else {
                channelTotals[channel] = agg;
              }
            } else {
              // Fallback 3: aggregate from breakdowns (matches BreakdownTableSection for table-merge channels)
              const monthlyBreakdowns = (channelData as any).monthlyBreakdowns as Record<string, Record<string, any[]>> | undefined;
              const allTimeBreakdowns = (channelData as any).breakdowns as Record<string, BreakdownRowLike[]> | undefined;
              let foundFromBreakdowns = false;
              
              // Try month-specific breakdowns first
              for (const m of months) {
                const mk = `${selectedYear}-${m.toString().padStart(2, '0')}`;
                if (monthlyBreakdowns?.[mk]) {
                  const bdForMonth = monthlyBreakdowns[mk];
                  for (const dimRows of Object.values(bdForMonth)) {
                    if (Array.isArray(dimRows) && dimRows.length > 0) {
                      const summed = sumBreakdownRows(dimRows as BreakdownRowLike[]);
                      if (summed.impressions > 0 || summed.clicks > 0 || summed.cost > 0 || summed.revenue > 0 || summed.bookings > 0) {
                        agg.impressions += summed.impressions;
                        agg.clicks += summed.clicks;
                        agg.cost += summed.cost;
                        agg.revenue += summed.revenue;
                        agg.bookings += summed.bookings;
                        foundFromBreakdowns = true;
                        break;
                      }
                    }
                  }
                }
              }
              
              if (foundFromBreakdowns) {
                channelTotals[channel] = agg;
              } else if (allTimeBreakdowns) {
                // Try all-time breakdowns
                for (const dimRows of Object.values(allTimeBreakdowns)) {
                  if (Array.isArray(dimRows) && dimRows.length > 0) {
                    const summed = sumBreakdownRows(dimRows);
                    if (summed.impressions > 0 || summed.clicks > 0 || summed.cost > 0 || summed.revenue > 0 || summed.bookings > 0) {
                      channelTotals[channel] = summed;
                      foundFromBreakdowns = true;
                      break;
                    }
                  }
                }
                if (!foundFromBreakdowns) {
                  const yearlyData = (channelData as any).yearly?.[selectedYear];
                  channelTotals[channel] = yearlyData || (channelData as any).current || agg;
                }
              } else {
                const yearlyData = (channelData as any).yearly?.[selectedYear];
                channelTotals[channel] = yearlyData || (channelData as any).current || agg;
              }
            }
          } else {
            const currentData = (channelData as any).current || {
              impressions: 0,
              clicks: 0,
              cost: 0,
              revenue: 0,
              bookings: 0,
            };
            channelTotals[channel] = currentData;
          }
        } else if (selectedYear !== 'all') {
          const yearNum = parseInt(selectedYear);
          const yearlyData = (channelData as any).yearly?.[String(yearNum)];
          if (yearlyData && (yearlyData.impressions > 0 || yearlyData.clicks > 0 || yearlyData.cost > 0 || yearlyData.revenue > 0 || yearlyData.bookings > 0)) {
            channelTotals[channel] = yearlyData;
          } else if (rawDataRows.length > 0) {
            // Fallback: Aggregate from rawDataRows with year-only date filtering
            const rawDateRange = {
              start: new Date(yearNum, 0, 1),
              end: new Date(yearNum, 11, 31, 23, 59, 59),
            };
            const dateFilteredRows = filterRawDataRows(rawDataRows, {}, rawDateRange);
            if (dateFilteredRows.length > 0) {
              const dimensionMap = (channelData as any).dimensionMap || {};
              const nameToIdsMap = buildMetricNameToIdsMap(dimensionMap);
              const rawAgg: MetricData = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
              dateFilteredRows.forEach((row) => {
                const rowData = row.dimension_values || row;
                const getVal = (keys: string[]): number => {
                  for (const key of keys) {
                    const v = (rowData as any)[key];
                    if (v !== undefined && v !== null) {
                      const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.-]/g, ''));
                      if (!isNaN(n)) return n;
                    }
                  }
                  return 0;
                };
                rawAgg.impressions += getVal(getMetricKeys('impressions', nameToIdsMap));
                rawAgg.clicks += getVal(getMetricKeys('clicks', nameToIdsMap));
                rawAgg.cost += getVal(getMetricKeys('cost', nameToIdsMap));
                rawAgg.revenue += getVal(getMetricKeys('revenue', nameToIdsMap));
                rawAgg.bookings += getVal(getMetricKeys('bookings', nameToIdsMap));
              });
              channelTotals[channel] = rawAgg;
            } else {
              channelTotals[channel] = (channelData as any).current || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
            }
          } else {
            // Fallback: try breakdowns (for table-merge channels without rawDataRows)
            const allTimeBreakdowns = (channelData as any).breakdowns as Record<string, BreakdownRowLike[]> | undefined;
            let foundFromBreakdowns = false;
            if (allTimeBreakdowns) {
              for (const dimRows of Object.values(allTimeBreakdowns)) {
                if (Array.isArray(dimRows) && dimRows.length > 0) {
                  const summed = sumBreakdownRows(dimRows);
                  if (summed.impressions > 0 || summed.clicks > 0 || summed.cost > 0 || summed.revenue > 0 || summed.bookings > 0) {
                    channelTotals[channel] = summed;
                    foundFromBreakdowns = true;
                    break;
                  }
                }
              }
            }
            if (!foundFromBreakdowns) {
              channelTotals[channel] = (channelData as any).current || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
            }
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
    monthKeyForBreakdowns,
    groupByDimensionId,
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