/**
 * Fetches channel revenue chart data from slide_report_channel_month_data
 * (no edge function). Use this so the Revenue chart uses table data instead of
 * get-slide-report-display-data. Applies filterValues using monthlyBreakdowns
 * when the user has selected dimension values (e.g. Hotel, Link Type).
 */

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { MONTH_NAMES } from '@/constants/slideViewConstants';
import { buildChannelChartDataFromMonthlyData } from '@/lib/chartDataCalculations';
import type { MonthlyDataPoint } from '@/types/slideView';
import type { ChartTimeRange } from '@/lib/chartDataCalculations';

const queryKeys = {
  all: ['channel_chart_data_from_table'] as const,
  byReport: (slideReportId: string) => [...queryKeys.all, slideReportId] as const,
};

type ChannelMetrics = { revenue?: number; impressions?: number; clicks?: number; cost?: number; bookings?: number };
type BreakdownRowLike = { name?: string; revenue?: number; [k: string]: unknown };
type SliceData = {
  monthly?: Record<string, ChannelMetrics>;
  monthlyBreakdowns?: Record<string, Record<string, BreakdownRowLike[]>>;
  dimensionMap?: Record<string, string>;
};

/**
 * Get revenue for (channel, year, month) from row data. When filterValues[channel]
 * has selected dimension values, sum revenue from monthlyBreakdowns for that
 * dimension; otherwise use monthly total.
 */
function getRevenueForMonth(
  data: SliceData | null,
  monthKey: string,
  channel: string,
  filterValues: Record<string, Record<string, string[]>> | null
): number {
  if (!data) return 0;

  const channelFilters = filterValues?.[channel];
  if (channelFilters && Object.keys(channelFilters).length > 0) {
    const dimensionMap = data.dimensionMap ?? {};
    const monthlyBreakdowns = data.monthlyBreakdowns?.[monthKey];
    if (!monthlyBreakdowns) return data?.monthly?.[monthKey]?.revenue ?? 0;

    for (const [dimensionId, selectedValues] of Object.entries(channelFilters)) {
      if (!selectedValues?.length) continue;
      const dimensionName = dimensionMap[dimensionId];
      if (!dimensionName) continue;
      const rows = monthlyBreakdowns[dimensionName];
      if (!rows?.length) continue;

      const allowed = new Set(selectedValues.map((v) => String(v).trim()));
      const sum = rows
        .filter((r) => r.name != null && allowed.has(String(r.name).trim()))
        .reduce((acc, r) => acc + (Number(r.revenue) || 0), 0);
      return sum;
    }
  }

  return data?.monthly?.[monthKey]?.revenue ?? 0;
}

function buildMonthlyDataFromRows(
  rows: Array<{ channel: string; year: number; month: number; data: unknown }>,
  filterValues: Record<string, Record<string, string[]>> | null
): MonthlyDataPoint[] {
  const map = new Map<string, { year: number; month: string; metasearch: number; sem: number; social: number }>();

  for (const row of rows) {
    const channel = row.channel as 'metasearch' | 'sem' | 'social';
    if (channel !== 'metasearch' && channel !== 'sem' && channel !== 'social') continue;

    const year = Number(row.year);
    const monthNum = Number(row.month);
    if (!year || monthNum < 1 || monthNum > 12) continue;

    const monthName = MONTH_NAMES[monthNum - 1];
    const monthKey = `${year}-${String(monthNum).padStart(2, '0')}`;
    const data = row.data as SliceData | null;
    const revenue = getRevenueForMonth(data, monthKey, channel, filterValues);

    const key = `${year}-${monthName}`;
    if (!map.has(key)) {
      map.set(key, { year, month: monthName, metasearch: 0, sem: 0, social: 0 });
    }
    const entry = map.get(key)!;
    entry[channel] = revenue;
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return MONTH_NAMES.indexOf(a.month) - MONTH_NAMES.indexOf(b.month);
  });
}

export type ChannelChartDataFromTable = Record<
  'metasearch' | 'sem' | 'social',
  Array<{ month: string; revenue: number }>
>;

type Row = { channel: string; year: number; month: number; data: unknown };

/**
 * Fetches slide_report_channel_month_data for the slide report and returns
 * channel chart data (revenue per month per channel) for the given time range.
 * Applies filterValues using monthlyBreakdowns when set (e.g. Hotel or Link Type filter).
 * Does not use the get-slide-report-display-data edge function.
 */
export function useChannelChartDataFromTable(
  slideReportId: string | null,
  chartTimeRange: ChartTimeRange,
  filterValues: Record<string, Record<string, string[]>> | null = null,
  anchorDate?: Date
): {
  data: ChannelChartDataFromTable | null;
  isLoading: boolean;
  isSuccess: boolean;
} {
  // Single query: fetch month data first, fall back to year data if empty
  const query = useQuery({
    queryKey: queryKeys.byReport(slideReportId || ''),
    queryFn: async (): Promise<Row[]> => {
      if (!slideReportId) return [];

      // Try month-level data first
      const { data: monthRows, error: monthError } = await supabase
        .from('slide_report_channel_month_data')
        .select('channel, year, month, data')
        .eq('slide_report_id', slideReportId);

      if (!monthError && monthRows && monthRows.length > 0) {
        return monthRows as Row[];
      }

      // Fallback: expand year-level data into per-month rows
      const { data: yearRows, error: yearError } = await supabase
        .from('slide_report_channel_year_data')
        .select('channel, year, data')
        .eq('slide_report_id', slideReportId);

      if (yearError || !yearRows?.length) return [];

      const expandedRows: Row[] = [];
      for (const row of yearRows) {
        const sliceData = row.data as SliceData | null;
        if (!sliceData?.monthly) continue;
        for (const [monthKey] of Object.entries(sliceData.monthly)) {
          const [y, m] = monthKey.split('-').map(Number);
          if (!y || !m) continue;
          expandedRows.push({ channel: row.channel, year: y, month: m, data: sliceData });
        }
      }
      return expandedRows;
    },
    enabled: !!slideReportId && !!chartTimeRange,
  });

  const data = useMemo(() => {
    const rows = query.data;
    if (!rows?.length || !chartTimeRange) return null;
    const monthlyData = buildMonthlyDataFromRows(rows, filterValues ?? null);
    return buildChannelChartDataFromMonthlyData(monthlyData, chartTimeRange, anchorDate);
  }, [query.data, chartTimeRange, filterValues, anchorDate]);

  return {
    data,
    isLoading: query.isLoading,
    isSuccess: query.isSuccess,
  };
}
