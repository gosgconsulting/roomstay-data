import { useMemo } from 'react';
import {
  addDays,
  addMonths,
  addWeeks,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from 'date-fns';
import {
  buildMetricNameToIdsMap,
  filterRawDataRows,
  getMetricKeys,
  hasAnyActiveFilters,
  hasAnyPositiveFilters,
  getChannelsWithFilters,
} from '@/lib/slideViewHelpers';
import { parseNumericValue } from '@/lib/parseNumericValue';
import type { ChartGranularity, ChartMetric, RawDataRow } from '@/types/slideView';

type Channel = 'metasearch' | 'sem' | 'social';

interface BaseMetricTotals {
  impressions: number;
  clicks: number;
  cost: number;
  revenue: number;
  bookings: number;
}

interface ChartPoint {
  label: string;
  value: number;
}

export type ChannelChartDataFromRawRows = Record<Channel, ChartPoint[]>;

interface RawRowsChartResult {
  channelData: ChannelChartDataFromRawRows;
  overviewData: Array<{ label: string; value: number }>;
}

function getMetricValue(totals: BaseMetricTotals, metric: ChartMetric): number {
  const { impressions, clicks, cost, revenue, bookings } = totals;
  switch (metric) {
    case 'impressions':
      return impressions;
    case 'clicks':
      return clicks;
    case 'cost':
      return cost;
    case 'revenue':
      return revenue;
    case 'bookings':
      return bookings;
    case 'ctr':
      return impressions > 0 ? (clicks / impressions) * 100 : 0;
    case 'conversionRate':
      return clicks > 0 ? (bookings / clicks) * 100 : 0;
    case 'cpc':
      return clicks > 0 ? cost / clicks : 0;
    case 'aov':
      return bookings > 0 ? revenue / bookings : 0;
    case 'roas':
      return cost > 0 ? revenue / cost : 0;
    case 'costOfSale':
      return revenue > 0 ? (cost / revenue) * 100 : 0;
    default:
      return revenue;
  }
}

function getBucketStart(date: Date, granularity: ChartGranularity): Date {
  if (granularity === 'day') return startOfDay(date);
  if (granularity === 'week') return startOfWeek(date, { weekStartsOn: 1 });
  return startOfMonth(date);
}

function getBucketEnd(date: Date, granularity: ChartGranularity): Date {
  if (granularity === 'day') return endOfDay(date);
  if (granularity === 'week') return endOfWeek(date, { weekStartsOn: 1 });
  return endOfMonth(date);
}

function getNextBucket(date: Date, granularity: ChartGranularity): Date {
  if (granularity === 'day') return addDays(date, 1);
  if (granularity === 'week') return addWeeks(date, 1);
  return addMonths(date, 1);
}

function buildTimeBuckets(start: Date, end: Date, granularity: ChartGranularity): Date[] {
  const buckets: Date[] = [];
  let current = getBucketStart(start, granularity);
  const finalBoundary = getBucketStart(end, granularity);

  while (current <= finalBoundary) {
    buckets.push(current);
    current = getNextBucket(current, granularity);
  }

  return buckets;
}

function getBucketKey(date: Date, granularity: ChartGranularity): string {
  if (granularity === 'day') return format(date, 'yyyy-MM-dd');
  if (granularity === 'week') return format(date, 'yyyy-MM-dd');
  return format(date, 'yyyy-MM');
}

function getBucketLabel(date: Date, granularity: ChartGranularity): string {
  if (granularity === 'day') return format(date, 'MMM d');
  if (granularity === 'week') return format(date, 'MMM d');
  return format(date, 'MMM yy');
}

function readRowDate(rowData: Record<string, unknown>): Date | null {
  let dateValue = rowData.Date || rowData.date || rowData.Day || rowData.day;
  if (!dateValue) {
    for (const value of Object.values(rowData)) {
      if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        dateValue = value;
        break;
      }
    }
  }

  if (!dateValue) return null;
  const parsed = new Date(String(dateValue));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getRowMetricTotals(
  rowData: Record<string, unknown>,
  nameToIdsMap: Record<string, string[]>
): BaseMetricTotals {
  const pick = (metric: 'impressions' | 'clicks' | 'cost' | 'revenue' | 'bookings'): number => {
    const keys = getMetricKeys(metric, nameToIdsMap);
    for (const key of keys) {
      const value = rowData[key];
      if (value !== undefined && value !== null) {
        return parseNumericValue(value);
      }
    }
    return 0;
  };

  return {
    impressions: pick('impressions'),
    clicks: pick('clicks'),
    cost: pick('cost'),
    revenue: pick('revenue'),
    bookings: pick('bookings'),
  };
}

function buildChartDataFromRawRows(
  rawRows: Record<string, RawDataRow[]>,
  dimensionMaps: Record<string, Record<string, string>>,
  dateRange: { start: Date; end: Date } | undefined,
  granularity: ChartGranularity,
  metric: ChartMetric,
  filterValues: Record<string, Record<string, string[]>> | null,
  configuredDimensionNames?: Record<string, string>
): RawRowsChartResult | null {
  const channels: Channel[] = ['metasearch', 'sem', 'social'];
  const filteredRowsByChannel: Record<Channel, RawDataRow[]> = {
    metasearch: [],
    sem: [],
    social: [],
  };
  let inferredStart: Date | null = dateRange?.start ?? null;
  let inferredEnd: Date | null = dateRange?.end ?? null;

  const hasFilters = filterValues ? hasAnyActiveFilters(filterValues) : false;
  const hasPositiveGlobalFilters = filterValues ? hasAnyPositiveFilters(filterValues) : false;
  const channelsWithFilters = filterValues ? getChannelsWithFilters(filterValues) : new Set<string>();

  for (const channel of channels) {
    if (hasPositiveGlobalFilters && !channelsWithFilters.has(channel)) {
      filteredRowsByChannel[channel] = [];
      continue;
    }
    const rows = rawRows[channel] || [];
    if (rows.length === 0) continue;
    const dimensionMap = dimensionMaps[channel] || {};
    const combinedDimNames = configuredDimensionNames
      ? { ...dimensionMap, ...configuredDimensionNames }
      : dimensionMap;
    const channelFilterValues = filterValues?.[channel] || {};
    const filteredRows = filterRawDataRows(rows, channelFilterValues, dateRange, combinedDimNames);
    filteredRowsByChannel[channel] = filteredRows;

    if (!dateRange) {
      for (const row of filteredRows) {
        const rowData = ((row as any).dimension_values || row) as Record<string, unknown>;
        const rowDate = readRowDate(rowData);
        if (!rowDate) continue;
        inferredStart = inferredStart ? new Date(Math.min(inferredStart.getTime(), rowDate.getTime())) : rowDate;
        inferredEnd = inferredEnd ? new Date(Math.max(inferredEnd.getTime(), rowDate.getTime())) : rowDate;
      }
    }
  }

  if (!inferredStart || !inferredEnd) return null;

  const bucketDates = buildTimeBuckets(inferredStart, inferredEnd, granularity);
  const bucketMap = new Map<
    string,
    Record<Channel, BaseMetricTotals>
  >();

  for (const bucketDate of bucketDates) {
    const key = getBucketKey(bucketDate, granularity);
    bucketMap.set(key, {
      metasearch: { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 },
      sem: { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 },
      social: { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 },
    });
  }

  let hasRowsInRange = false;
  for (const channel of channels) {
    const filteredRows = filteredRowsByChannel[channel];
    if (filteredRows.length === 0) continue;
    const dimensionMap = dimensionMaps[channel] || {};
    const nameToIdsMap = buildMetricNameToIdsMap(dimensionMap);

    for (const row of filteredRows) {
      const rowData = ((row as any).dimension_values || row) as Record<string, unknown>;
      const rowDate = readRowDate(rowData);
      if (!rowDate) continue;

      const bucketStart = getBucketStart(rowDate, granularity);
      const key = getBucketKey(bucketStart, granularity);
      const channelBuckets = bucketMap.get(key);
      if (!channelBuckets) continue;

      const rowTotals = getRowMetricTotals(rowData, nameToIdsMap);
      channelBuckets[channel].impressions += rowTotals.impressions;
      channelBuckets[channel].clicks += rowTotals.clicks;
      channelBuckets[channel].cost += rowTotals.cost;
      channelBuckets[channel].revenue += rowTotals.revenue;
      channelBuckets[channel].bookings += rowTotals.bookings;
      hasRowsInRange = true;
    }
  }

  if (!hasRowsInRange) return null;

  const channelData: ChannelChartDataFromRawRows = { metasearch: [], sem: [], social: [] };
  const overviewData: Array<{ label: string; value: number }> = [];

  for (const bucketDate of bucketDates) {
    const key = getBucketKey(bucketDate, granularity);
    const label = getBucketLabel(bucketDate, granularity);
    const bucketTotals = bucketMap.get(key);
    if (!bucketTotals) continue;

    const combined: BaseMetricTotals = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };

    for (const channel of channels) {
      const channelTotals = bucketTotals[channel];
      channelData[channel].push({
        label,
        value: getMetricValue(channelTotals, metric),
      });
      combined.impressions += channelTotals.impressions;
      combined.clicks += channelTotals.clicks;
      combined.cost += channelTotals.cost;
      combined.revenue += channelTotals.revenue;
      combined.bookings += channelTotals.bookings;
    }

    overviewData.push({
      label,
      value: getMetricValue(combined, metric),
    });
  }

  return { channelData, overviewData };
}

/**
 * Pure hook: computes channel chart data from rawDataRows already in memory.
 * No DB queries. Returns the same shape as the old useChannelChartDataFromTable.
 */
export function useChannelChartDataFromRawRows(
  rawRows: Record<string, RawDataRow[]> | undefined,
  dimensionMaps: Record<string, Record<string, string>> | undefined,
  dateRange: { start: Date; end: Date } | undefined,
  granularity: ChartGranularity,
  metric: ChartMetric = 'revenue',
  filterValues: Record<string, Record<string, string[]>> | null = null,
  configuredDimensionNames?: Record<string, string>
): {
  data: ChannelChartDataFromRawRows | null;
  overviewData: Array<{ label: string; value: number }> | null;
  isLoading: boolean;
  isSuccess: boolean;
} {
  const computed = useMemo(() => {
    if (!rawRows) return null;
    return buildChartDataFromRawRows(
      rawRows,
      dimensionMaps || {},
      dateRange,
      granularity,
      metric,
      filterValues,
      configuredDimensionNames
    );
  }, [rawRows, dimensionMaps, dateRange, granularity, metric, filterValues, configuredDimensionNames]);

  const data = useMemo(() => {
    return computed?.channelData ?? null;
  }, [computed]);

  return {
    data,
    overviewData: computed?.overviewData ?? null,
    isLoading: false,
    isSuccess: data !== null,
  };
}
