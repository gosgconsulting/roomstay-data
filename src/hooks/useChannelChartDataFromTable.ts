/**
 * Fetches channel revenue chart data from slide_report_channel_month_data
 * (no edge function). Use this so the Revenue chart uses table data instead of
 * get-slide-report-display-data.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MONTH_NAMES } from '@/constants/slideViewConstants';
import { buildChannelChartDataFromMonthlyData } from '@/lib/chartDataCalculations';
import type { MonthlyDataPoint } from '@/types/slideView';
import type { ChartTimeRange } from '@/lib/chartDataCalculations';

const queryKeys = {
  all: ['channel_chart_data_from_table'] as const,
  byReport: (slideReportId: string, chartTimeRange: string) =>
    [...queryKeys.all, slideReportId, chartTimeRange] as const,
};

type ChannelMetrics = { revenue?: number; impressions?: number; clicks?: number; cost?: number; bookings?: number };
type SliceData = { monthly?: Record<string, ChannelMetrics> };

function buildMonthlyDataFromRows(
  rows: Array<{ channel: string; year: number; month: number; data: unknown }>
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
    const revenue = data?.monthly?.[monthKey]?.revenue ?? 0;

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

/**
 * Fetches slide_report_channel_month_data for the slide report and returns
 * channel chart data (revenue per month per channel) for the given time range.
 * Does not use the get-slide-report-display-data edge function.
 */
export function useChannelChartDataFromTable(
  slideReportId: string | null,
  chartTimeRange: ChartTimeRange
): {
  data: ChannelChartDataFromTable | null;
  isLoading: boolean;
  isSuccess: boolean;
} {
  const query = useQuery({
    queryKey: queryKeys.byReport(slideReportId || '', chartTimeRange ?? ''),
    queryFn: async (): Promise<ChannelChartDataFromTable> => {
      if (!slideReportId) {
        return {
          metasearch: [],
          sem: [],
          social: [],
        };
      }

      const { data: rows, error } = await supabase
        .from('slide_report_channel_month_data')
        .select('channel, year, month, data')
        .eq('slide_report_id', slideReportId);

      if (error) throw error;
      const list = (rows || []) as Array<{ channel: string; year: number; month: number; data: unknown }>;
      const monthlyData = buildMonthlyDataFromRows(list);
      return buildChannelChartDataFromMonthlyData(monthlyData, chartTimeRange);
    },
    enabled: !!slideReportId && !!chartTimeRange,
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    isSuccess: query.isSuccess,
  };
}
