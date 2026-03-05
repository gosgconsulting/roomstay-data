/**
 * Hook to fetch ALL raw rows from dimension_data for Data Studio.
 * Groups rows by channel based on the slide report's report_ids mapping.
 * These raw rows enable client-side filtering (e.g., Brady view) to work correctly.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SlideReport } from '@/types/slideReports';
import type { RawDataRow } from '@/types/slideView';

interface ChannelRawRows {
  [channel: string]: RawDataRow[];
}

/**
 * Fetch all dimension_data rows for the given report IDs, batched to handle >1000 rows.
 */
async function fetchAllDimensionData(reportId: string): Promise<RawDataRow[]> {
  const allRows: RawDataRow[] = [];
  const batchSize = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('dimension_data')
      .select('id, dimension_values, data_source_id, row_number')
      .eq('report_id', reportId)
      .order('row_number', { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (error) throw error;

    if (data && data.length > 0) {
      for (const row of data) {
        // Convert to RawDataRow format: merge dimension_values as top-level keys
        allRows.push({
          ...((row.dimension_values as Record<string, any>) || {}),
          _id: row.id,
          _row_number: row.row_number,
          _data_source_id: row.data_source_id,
        } as any);
      }
      offset += batchSize;
      hasMore = data.length === batchSize;
    } else {
      hasMore = false;
    }
  }

  return allRows;
}

/**
 * Hook to fetch raw rows from dimension_data for each channel in the slide report.
 * Returns rows grouped by channel name (metasearch, sem, social).
 */
export function useDataStudioRawRows(
  slideReport: SlideReport | null | undefined,
  enabled: boolean = false,
) {
  const reportIds = (slideReport?.report_ids || {}) as Record<string, string>;

  return useQuery({
    queryKey: ['data-studio-raw-rows', slideReport?.id, reportIds],
    queryFn: async (): Promise<ChannelRawRows> => {
      const result: ChannelRawRows = {};

      // Fetch all channels in parallel
      const channels = ['metasearch', 'sem', 'social'] as const;
      const promises = channels.map(async (channel) => {
        const channelReportId = reportIds[channel];
        if (!channelReportId) return { channel, rows: [] };

        const startTime = performance.now();
        const rows = await fetchAllDimensionData(channelReportId);
        const duration = Math.round(performance.now() - startTime);
        console.log(`[DataStudioRawRows] ${channel}: ${rows.length} rows in ${duration}ms`);

        return { channel, rows };
      });

      const results = await Promise.all(promises);
      for (const { channel, rows } of results) {
        if (rows.length > 0) {
          result[channel] = rows;
        }
      }

      return result;
    },
    enabled: enabled && !!slideReport?.id && Object.keys(reportIds).length > 0,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}
