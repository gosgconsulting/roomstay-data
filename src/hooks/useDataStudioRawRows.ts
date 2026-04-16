/**
 * Hook to fetch rows for Data Studio from a server-side cached edge function.
 * Keeps the canonical read path on dimension_data while allowing shared cache
 * across users.
 */

import { useMemo, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getUser } from '@/lib/auth';
import type { CachedDataRow } from '@/hooks/dataSources/useCachedSourceData';
import type { SlideReport } from '@/types/slideReports';

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

interface CachedEdgeResponse {
  success?: boolean;
  error?: string;
  rows?: Record<string, any>[];
  dimMap?: Record<string, string>;
  cache?: {
    hit?: boolean;
  };
}

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

function findDateDimensionId(rows: Record<string, any>[]): string | null {
  if (rows.length === 0) return null;
  const sample = rows.slice(0, 20);
  for (const row of sample) {
    for (const [key, val] of Object.entries(row)) {
      if (key === '_row_number') continue;
      if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
        return key;
      }
    }
  }
  return null;
}

async function fetchByDateRpc(
  reportId: string,
  dateDimId: string,
  year: number,
  month: number | null
): Promise<Record<string, any>[]> {
  const { data, error } = await supabase.rpc('get_dimension_data_by_report_and_date', {
    p_report_id: reportId,
    p_date_dim_id: dateDimId,
    p_year: year,
    p_month: month,
    p_max_rows: 500000,
  });
  if (error) throw error;

  if (data && data.length >= 500000) {
    console.warn(
      `[fetchByDateRpc] Warning: Returned row count (${data.length}) hit hard cap of 500,000 for report ${reportId}.`
    );
  }

  return (data || []).map((dv: Record<string, any>) => ({ ...dv }));
}

async function fetchAllRowsParallel(reportId: string): Promise<CachedDataRow[]> {
  const batchSize = 5000;

  const { count, error: countError } = await supabase
    .from('dimension_data')
    .select('id', { count: 'exact', head: true })
    .eq('report_id', reportId);

  if (countError) throw countError;
  const total = count ?? 0;
  if (total === 0) return [];

  const batchCount = Math.ceil(total / batchSize);
  const batchPromises = Array.from({ length: batchCount }, (_, i) => {
    const offset = i * batchSize;
    return supabase
      .from('dimension_data')
      .select('id, dimension_values, data_source_id, row_number')
      .eq('report_id', reportId)
      .order('row_number', { ascending: true })
      .range(offset, offset + batchSize - 1);
  });

  const results = await Promise.all(batchPromises);
  const allRows: CachedDataRow[] = [];
  for (const { data, error } of results) {
    if (error) throw error;
    if (data) allRows.push(...(data as CachedDataRow[]));
  }
  return allRows;
}

async function fetchChannelRowsDirect(
  channelReportId: string,
  selectedYear: string
): Promise<{ rows: Record<string, any>[]; dimMap: Record<string, string> }> {
  const isAllTime = !selectedYear || selectedYear === 'all';

  if (!isAllTime) {
    const { data: sampleData, error: sampleError } = await supabase
      .from('dimension_data')
      .select('dimension_values')
      .eq('report_id', channelReportId)
      .limit(20);

    if (sampleError) throw sampleError;

    const sampleRows = (sampleData || []).map((r) => ({ ...(typeof r.dimension_values === 'object' && r.dimension_values !== null ? r.dimension_values as Record<string, unknown> : {}) }));
    const dateDimId = findDateDimensionId(sampleRows);

    if (dateDimId) {
      const yearNum = parseInt(selectedYear, 10);
      const rows = await fetchByDateRpc(channelReportId, dateDimId, yearNum, null);

      const allDimIds = new Set<string>();
      for (const row of rows) {
        for (const id of Object.keys(row)) {
          if (id === '_row_number') continue;
          allDimIds.add(id);
        }
      }
      const dimMap = await buildDimensionNameMap(Array.from(allDimIds));
      return {
        rows: rows.map((r, i) => ({ ...r, _row_number: i + 1 })),
        dimMap,
      };
    }
  }

  const cachedRows = await fetchAllRowsParallel(channelReportId);
  const allRawRows = cachedRows.map((row) => ({
    ...(row.dimension_values || {}),
    _row_number: row.row_number,
  }));

  const allDimIds = new Set<string>();
  for (const row of cachedRows) {
    const dv = (row.dimension_values || {}) as Record<string, unknown>;
    for (const id of Object.keys(dv)) allDimIds.add(id);
  }
  const dimMap = await buildDimensionNameMap(Array.from(allDimIds));

  return { rows: allRawRows, dimMap };
}

async function fetchChannelRows(
  channelReportId: string,
  selectedYear: string,
  dimensionFilters?: Record<string, string[]>
): Promise<{ rows: Record<string, any>[]; dimMap: Record<string, string> }> {
  try {
    const body: Record<string, unknown> = {
      reportId: channelReportId,
      selectedYear,
      selectedMonth: 'all',
    };
    // Pass dimension filters to edge function for server-side row filtering.
    // Only sent for shared links; authenticated owners don't send this.
    if (dimensionFilters && Object.keys(dimensionFilters).length > 0) {
      body.dimensionFilters = dimensionFilters;
    }
    const { data, error } = await supabase.functions.invoke('get-cached-report-data', {
      body,
    });

    if (error) throw error;
    const response = (data || {}) as CachedEdgeResponse;
    if (!response.success) {
      throw new Error(response.error || 'Failed to fetch cached report data');
    }

    const rows = Array.isArray(response.rows) ? response.rows : [];
    const dimMap =
      response.dimMap && typeof response.dimMap === 'object' ? response.dimMap : {};

    // Safety net: if cache was a cold miss and returned no rows, verify directly from DB.
    if (!response.cache?.hit && rows.length === 0) {
      console.warn(
        `[DataStudio] cache miss returned 0 rows for report ${channelReportId}, falling back to direct DB fetch`
      );
      return await fetchChannelRowsDirect(channelReportId, selectedYear);
    }

    return { rows, dimMap };
  } catch (error) {
    console.warn(
      `[DataStudio] cached edge fetch failed for report ${channelReportId}, using direct DB path`,
      error
    );
    return await fetchChannelRowsDirect(channelReportId, selectedYear);
  }
}

/**
 * Hook to fetch raw rows from dimension_data for each channel.
 * Returns rows grouped by channel name (metasearch, sem, social) with dimension_values as top-level keys.
 *
 * Uses server-side date filtering (RPC) when a year is selected to avoid fetching all rows.
 * When reportIdsOverride is provided, it is used instead of slide_report.report_ids so that
 * all account channels (e.g. metasearch) are fetched even if the slide report's report_ids
 * omit them — same logic as getReportIdForChannel (prefer stored, fallback to account).
 */
export function useDataStudioRawRows(
  slideReport: SlideReport | null | undefined,
  enabled: boolean = false,
  selectedYear: string = 'all',
  reportIdsOverride?: Record<string, string> | null,
  /** Per-channel dimension filters enforced server-side. Only used by shared links. */
  channelDimensionFilters?: Record<string, Record<string, string[]>> | null,
) {
  const queryClient = useQueryClient();

  const reportIds = useMemo((): Record<string, string> => {
    const base = (reportIdsOverride != null && Object.keys(reportIdsOverride).length > 0)
      ? reportIdsOverride
      : (slideReport?.report_ids || {}) as Record<string, string>;
    return Object.fromEntries(
      Object.entries(base).filter(([, id]) => id != null && String(id).trim() !== '')
    ) as Record<string, string>;
  }, [slideReport?.report_ids, reportIdsOverride]);

  const hasReportIds = Object.keys(reportIds).length > 0;

  // For shared/anon views, slideReport may be null (RLS blocks), but reportIdsOverride
  // from sessionStorage provides valid channel IDs. Build a stable cache key that
  // works with or without the slideReport.
  const stableCacheId = slideReport?.id ?? (hasReportIds ? 'shared-' + Object.values(reportIds).sort().join(',') : '');

  // Detect if we are in a shared/anon context (no authenticated user).
  // Shared views must NOT cache aggressively — stale empty results cause 0-KPI bugs.
  const isAnon = !slideReport?.user_id;

  // Stable fingerprint of dimension filters so query key changes when filters change.
  const dimFilterFingerprint = useMemo(() => {
    if (!channelDimensionFilters) return '';
    return JSON.stringify(channelDimensionFilters);
  }, [channelDimensionFilters]);

  const queryResult = useQuery({
    queryKey: ['data-studio-raw-rows', stableCacheId, selectedYear, Object.keys(reportIds).sort().join(','), dimFilterFingerprint],
    queryFn: async (): Promise<DataStudioSourceResult> => {
      const { user } = await getUser();
      if (!user) {
        console.warn('[DataStudio] No user session, attempting anonymous fetch');
      }

      const result: ChannelRawRows = {};
      const dimensionMaps: ChannelDimensionMaps = {};

      const channels = Object.keys(reportIds);
      const promises = channels.map(async (channel) => {
        const channelReportId = reportIds[channel];
        if (!channelReportId) return { channel, rows: [] as any[], dimMap: {} };

        const channelFilters = channelDimensionFilters?.[channel] ?? undefined;
        const { rows, dimMap } = await fetchChannelRows(channelReportId, selectedYear, channelFilters);

        return { channel, rows, dimMap };
      });

      const results = await Promise.all(promises);
      for (const { channel, rows, dimMap } of results) {
        result[channel] = rows ?? [];
        dimensionMaps[channel] = dimMap ?? {};
      }

      return { rawRows: result, dimensionMaps };
    },
    enabled: enabled && hasReportIds,
    // For authenticated users: cache 5 min. For anon/shared: no caching to avoid stale 0-data.
    staleTime: isAnon ? 0 : 5 * 60 * 1000,
    gcTime: isAnon ? 0 : 10 * 60 * 1000,
    refetchOnMount: isAnon ? 'always' : false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 2, // Retry transient edge-function failures
  });

  // Cache verification guard: if the query is enabled with real IDs but the cached result
  // has zero rows across all channels, the previous query likely ran before IDs were ready
  // and cached an empty response. Invalidate once to force a fresh fetch.
  const { data, isLoading, isFetching } = queryResult;
  const allChannelsEmpty = data != null &&
    Object.values(data.rawRows).every((rows) => rows.length === 0);

  // Use a ref to prevent infinite invalidation loops:
  // only invalidate ONCE per cache-key combination.
  const invalidatedRef = useRef<string | null>(null);
  const cacheFingerprint = `${stableCacheId}:${selectedYear}`;

  useEffect(() => {
    if (
      enabled && hasReportIds && !isLoading && !isFetching &&
      allChannelsEmpty &&
      invalidatedRef.current !== cacheFingerprint
    ) {
      console.warn('[DataStudio] Cached result has 0 rows — invalidating cache once');
      invalidatedRef.current = cacheFingerprint;
      queryClient.invalidateQueries({
        queryKey: ['data-studio-raw-rows', stableCacheId, selectedYear],
      });
    }
    // Reset the guard when cache key changes
    if (!allChannelsEmpty) {
      invalidatedRef.current = null;
    }
  }, [enabled, hasReportIds, stableCacheId, isLoading, isFetching, allChannelsEmpty, queryClient, selectedYear, cacheFingerprint]);

  return queryResult;
}
