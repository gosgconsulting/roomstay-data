/**
 * Hook to fetch ALL rows for Data Studio from Supabase-cached dimension_data.
 * This keeps Data Studio on the single canonical row store (dimension_data).
 * Groups rows by channel based on the slide report's report_ids mapping.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getUser } from '@/lib/auth';
import type { SlideReport } from '@/types/slideReports';
import type { CachedDataRow } from '@/hooks/dataSources/useCachedSourceData';

interface ChannelRawRows {
  [channel: string]: Record<string, any>[];
}

interface ChannelDimensionMaps {
  [channel: string]: Record<string, string>; // dimensionId -> dimensionName
}

export interface DataStudioSourceResult {
  rawRows: ChannelRawRows;
  dimensionMaps: ChannelDimensionMaps;
}

/**
 * Build dimensionId -> dimensionName map for a set of dimension IDs
 */
async function buildDimensionNameMap(dimensionIds: string[]): Promise<Record<string, string>> {
  if (dimensionIds.length === 0) return {};
  const { data } = await supabase
    .from('dimensions')
    .select('id, name')
    .in('id', dimensionIds);
  const map: Record<string, string> = {};
  if (data) {
    for (const d of data) {
      map[d.id] = d.name;
    }
  }
  return map;
}

async function fetchDimensionDataBatched(reportId: string): Promise<CachedDataRow[]> {
  const allRows: CachedDataRow[] = [];
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
      allRows.push(...(data as CachedDataRow[]));
      offset += batchSize;
      hasMore = data.length === batchSize;
    } else {
      hasMore = false;
    }
  }

  return allRows;
}

/**
 * Hook to fetch raw rows from dimension_data for each channel.
 * Returns rows grouped by channel name (metasearch, sem, social) with dimension_values as top-level keys.
 */
export function useDataStudioRawRows(
  slideReport: SlideReport | null | undefined,
  enabled: boolean = false,
) {
  const reportIds = (slideReport?.report_ids || {}) as Record<string, string>;

  return useQuery({
    queryKey: ['data-studio-raw-rows', slideReport?.id, reportIds],
    queryFn: async (): Promise<DataStudioSourceResult> => {
      const { user } = await getUser();
      if (!user) throw new Error('User must be authenticated');

      const result: ChannelRawRows = {};
      const dimensionMaps: ChannelDimensionMaps = {};

      const channels = Object.keys(reportIds);
      const promises = channels.map(async (channel) => {
        const channelReportId = reportIds[channel];
        if (!channelReportId) return { channel, rows: [] as any[], dimMap: {} };

        const startTime = performance.now();

        // 1) Fetch cached rows from dimension_data
        const cachedRows = await fetchDimensionDataBatched(channelReportId);

        // 2) Convert to raw row shape used by the Data Studio UI
        const allRawRows = cachedRows.map((row) => ({
          ...(row.dimension_values || {}),
          _row_number: row.row_number,
        }));

        // 3) Build a dimensionId -> dimensionName map (sample keys to avoid huge IN clauses)
        const sampleSize = 200;
        const sampled = cachedRows.slice(0, sampleSize);
        const dimIds = new Set<string>();
        for (const row of sampled) {
          const dv = (row.dimension_values || {}) as Record<string, unknown>;
          for (const id of Object.keys(dv)) dimIds.add(id);
        }
        const mergedDimNameMap = await buildDimensionNameMap(Array.from(dimIds));

        const duration = Math.round(performance.now() - startTime);
        console.log(`[DataStudio] ${channel}: ${allRawRows.length} cached rows in ${duration}ms`);

        return { channel, rows: allRawRows, dimMap: mergedDimNameMap };
      });

      const results = await Promise.all(promises);
      for (const { channel, rows, dimMap } of results) {
        if (rows.length > 0) {
          result[channel] = rows;
        }
        if (Object.keys(dimMap).length > 0) {
          dimensionMaps[channel] = dimMap;
        }
      }

      return { rawRows: result, dimensionMaps };
    },
    enabled: enabled && !!slideReport?.id && Object.keys(reportIds).length > 0,
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}
