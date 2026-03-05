/**
 * Hook to fetch ALL raw rows directly from Google Sheets/CSV sources for Data Studio.
 * This bypasses Supabase caching entirely - always fetches fresh from source.
 * Groups rows by channel based on the slide report's report_ids mapping.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchSourceData } from '@/hooks/dataSources/useSourceData';
import { getUser } from '@/lib/auth';
import type { SlideReport } from '@/types/slideReports';
import type { DataSource } from '@/lib/data-sources/types';

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
 * Fetch data source config for a given report ID
 */
async function getDataSourceForReport(reportId: string): Promise<DataSource | null> {
  const { data, error } = await supabase
    .from('data_sources')
    .select('*')
    .eq('report_id', reportId)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return {
    ...data,
    column_mappings: data.column_mappings as any,
  } as DataSource;
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

/**
 * Hook to fetch raw rows directly from Google Sheets/CSV for each channel.
 * Returns rows grouped by channel name (metasearch, sem, social) with dimension_values as top-level keys.
 */
export function useDataStudioRawRows(
  slideReport: SlideReport | null | undefined,
  enabled: boolean = false,
) {
  const reportIds = (slideReport?.report_ids || {}) as Record<string, string>;
  const accountId = slideReport?.account_id;

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

        // 1. Get data source config
        const dataSource = await getDataSourceForReport(channelReportId);
        if (!dataSource) {
          console.warn(`[DataStudio] No data source found for ${channel} (report ${channelReportId})`);
          return { channel, rows: [] as any[], dimMap: {} };
        }

        // 2. Fetch directly from Google Sheets/CSV and transform
        const sourceResult = await fetchSourceData(dataSource, user.id, accountId || undefined);

        // 3. Build dimension name map from the dimensionIdMap
        const dimensionIds = Object.values(sourceResult.dimensionIdMap);
        const dimNameMap = await buildDimensionNameMap(dimensionIds);

        // 4. Convert transformedRows to rawDataRows format
        // transformedRows have { dimension_values: { [uuid]: value }, row_number }
        const rawRows = sourceResult.transformedRows.map((row: any) => ({
          ...(row.dimension_values || {}),
          _row_number: row.row_number,
        }));

        const duration = Math.round(performance.now() - startTime);
        console.log(`[DataStudio] ${channel}: ${rawRows.length} rows fetched from source in ${duration}ms`);

        return { channel, rows: rawRows, dimMap: dimNameMap };
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
