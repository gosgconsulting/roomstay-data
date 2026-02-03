/**
 * Fetches channel data from slide_report_channel_month_data and slide_report_channel_year_data,
 * merges slices per channel, and returns the same shape as pivot_data.channels.
 * Use this so the UI can display data from the monthly/year tables (e.g. after incremental refresh)
 * without relying only on slide_reports.pivot_data.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SlideReportPivotData, SlideReportDateRange } from '@/types/slideReports';
import { mergeChannelSlices, type ChannelDataSlice } from '@/lib/slideReportChannelDataMerge';

const queryKeys = {
  all: ['slide_report_channel_data'] as const,
  byReport: (slideReportId: string) => [...queryKeys.all, slideReportId] as const,
};

/**
 * Fetches slide_report_channel_month_data and slide_report_channel_year_data for a slide report,
 * merges per-channel slices using the report's date range, and returns merged channels.
 * Returns null when disabled or when no date range / no data.
 */
export function useSlideReportChannelData(
  slideReportId: string | null,
  dateRange: SlideReportDateRange | null
) {
  return useQuery({
    queryKey: [...queryKeys.byReport(slideReportId || ''), dateRange?.from, dateRange?.to],
    queryFn: async (): Promise<SlideReportPivotData['channels'] | null> => {
      if (!slideReportId || !dateRange?.from || !dateRange?.to) return null;

      const range = { from: dateRange.from, to: dateRange.to };

      const [monthRes, yearRes] = await Promise.all([
        supabase
          .from('slide_report_channel_month_data')
          .select('channel, year, month, data')
          .eq('slide_report_id', slideReportId),
        supabase
          .from('slide_report_channel_year_data')
          .select('channel, year, data')
          .eq('slide_report_id', slideReportId),
      ]);

      if (monthRes.error && yearRes.error) {
        return null;
      }

      const slicesByChannel: Record<string, ChannelDataSlice[]> = {};

      for (const row of monthRes.data || []) {
        const ch = row.channel as string;
        if (!slicesByChannel[ch]) slicesByChannel[ch] = [];
        const slice = row.data as ChannelDataSlice;
        if (slice && (slice.monthly || slice.yearly || slice.breakdowns)) {
          slicesByChannel[ch].push(slice);
        }
      }
      for (const row of yearRes.data || []) {
        const ch = row.channel as string;
        if (!slicesByChannel[ch]) slicesByChannel[ch] = [];
        const slice = row.data as ChannelDataSlice;
        if (slice && (slice.monthly || slice.yearly || slice.breakdowns)) {
          slicesByChannel[ch].push(slice);
        }
      }

      const channels: SlideReportPivotData['channels'] = {};
      for (const [channel, slices] of Object.entries(slicesByChannel)) {
        if (slices.length > 0) {
          channels[channel] = mergeChannelSlices(slices, range);
        }
      }

      return Object.keys(channels).length > 0 ? channels : null;
    },
    enabled: !!slideReportId && !!dateRange?.from && !!dateRange?.to,
  });
}
