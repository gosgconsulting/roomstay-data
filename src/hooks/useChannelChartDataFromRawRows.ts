import { useMemo } from 'react';
import { MONTH_NAMES } from '@/constants/slideViewConstants';
import { buildMetricNameToIdsMap, getMetricKeys } from '@/lib/slideViewHelpers';
import { parseNumericValue } from '@/lib/parseNumericValue';
import type { ChartTimeRange } from '@/lib/chartDataCalculations';
import type { ChartMetric, RawDataRow } from '@/types/slideView';

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

function getRangeStart(timeRange: ChartTimeRange, now: Date): Date {
  if (timeRange === 'this_month') return new Date(now.getFullYear(), now.getMonth(), 1);
  if (timeRange === 'this_year') return new Date(now.getFullYear(), 0, 1);
  if (timeRange === 'last_12_months') return new Date(now.getFullYear(), now.getMonth() - 11, 1);
  if (timeRange === 'last_6_months') return new Date(now.getFullYear(), now.getMonth() - 5, 1);
  return new Date(now.getFullYear(), now.getMonth() - 2, 1);
}

function buildTimeBuckets(timeRange: ChartTimeRange, anchorDate: Date): Date[] {
  const buckets: Date[] = [];
  if (timeRange === 'this_month') {
    const dayCount = anchorDate.getDate();
    for (let day = 1; day <= dayCount; day += 1) {
      buckets.push(new Date(anchorDate.getFullYear(), anchorDate.getMonth(), day));
    }
    return buckets;
  }

  const start = getRangeStart(timeRange, anchorDate);
  const current = new Date(start.getFullYear(), start.getMonth(), 1);
  const end = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
  while (current <= end) {
    buckets.push(new Date(current.getFullYear(), current.getMonth(), 1));
    current.setMonth(current.getMonth() + 1);
  }
  return buckets;
}

function getBucketKey(date: Date, timeRange: ChartTimeRange): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  if (timeRange === 'this_month') {
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return `${year}-${month}`;
}

function getBucketLabel(date: Date, timeRange: ChartTimeRange): string {
  const monthName = MONTH_NAMES[date.getMonth()];
  if (timeRange === 'this_month') {
    return `${monthName.slice(0, 3)} ${date.getDate()}`;
  }
  return `${monthName.slice(0, 3)} ${date.getFullYear().toString().slice(-2)}`;
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
  chartTimeRange: ChartTimeRange,
  metric: ChartMetric,
  anchorDate: Date
): RawRowsChartResult | null {
  const channels: Channel[] = ['metasearch', 'sem', 'social'];
  const start = getRangeStart(chartTimeRange, anchorDate);
  const bucketDates = buildTimeBuckets(chartTimeRange, anchorDate);
  const bucketMap = new Map<
    string,
    Record<Channel, BaseMetricTotals>
  >();

  for (const bucketDate of bucketDates) {
    const key = getBucketKey(bucketDate, chartTimeRange);
    bucketMap.set(key, {
      metasearch: { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 },
      sem: { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 },
      social: { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 },
    });
  }

  let hasRowsInRange = false;
  for (const channel of channels) {
    const rows = rawRows[channel] || [];
    if (rows.length === 0) continue;
    const nameToIdsMap = buildMetricNameToIdsMap(dimensionMaps[channel] || {});

    for (const row of rows) {
      const rowData = ((row as any).dimension_values || row) as Record<string, unknown>;
      const rowDate = readRowDate(rowData);
      if (!rowDate) continue;
      if (rowDate < start || rowDate > anchorDate) continue;

      const key = getBucketKey(rowDate, chartTimeRange);
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
    const key = getBucketKey(bucketDate, chartTimeRange);
    const label = getBucketLabel(bucketDate, chartTimeRange);
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
  chartTimeRange: ChartTimeRange | null,
  metric: ChartMetric = 'revenue',
  _filterValues: Record<string, Record<string, string[]>> | null = null,
  anchorDate?: Date
): {
  data: ChannelChartDataFromRawRows | null;
  overviewData: Array<{ label: string; value: number }> | null;
  isLoading: boolean;
  isSuccess: boolean;
} {
  const effectiveAnchor = anchorDate ?? new Date();

  const computed = useMemo(() => {
    if (!rawRows || !chartTimeRange) return null;
    return buildChartDataFromRawRows(
      rawRows,
      dimensionMaps || {},
      chartTimeRange,
      metric,
      effectiveAnchor
    );
  }, [rawRows, dimensionMaps, chartTimeRange, metric, effectiveAnchor]);

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
