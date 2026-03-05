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
async function getDataSourcesForReport(reportId: string): Promise<DataSource[]> {
  const { data, error } = await supabase
    .from('data_sources')
    .select('*')
    .eq('report_id', reportId)
    .order('created_at', { ascending: true });

  if (error || !data || data.length === 0) return [];
  return data.map(d => ({
    ...d,
    column_mappings: d.column_mappings as any,
  } as DataSource));
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

        // 1. Get all data source configs for this report
        const dataSources = await getDataSourcesForReport(channelReportId);
        if (dataSources.length === 0) {
          console.warn(`[DataStudio] No data source found for ${channel} (report ${channelReportId})`);
          return { channel, rows: [] as any[], dimMap: {} };
        }

        // 2. Fetch from ALL data sources and merge rows
        let allRawRows: any[] = [];
        let mergedDimNameMap: Record<string, string> = {};

        for (const dataSource of dataSources) {
          try {
            const sourceResult = await fetchSourceData(dataSource, user.id, accountId || undefined);

            // Build dimension name map
            const dimensionIds = Object.values(sourceResult.dimensionIdMap);
            const dimNameMap = await buildDimensionNameMap(dimensionIds);
            Object.assign(mergedDimNameMap, dimNameMap);

            // Convert transformedRows to rawDataRows format
            const rawRows = sourceResult.transformedRows.map((row: any) => ({
              ...(row.dimension_values || {}),
              _row_number: row.row_number,
            }));
            allRawRows = allRawRows.concat(rawRows);
          } catch (err) {
            console.warn(`[DataStudio] Failed to fetch source ${dataSource.name} for ${channel}:`, err);
          }
        }

        const duration = Math.round(performance.now() - startTime);
        console.log(`[DataStudio] ${channel}: ${allRawRows.length} rows from ${dataSources.length} source(s) in ${duration}ms`);

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
