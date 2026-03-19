/**
 * Hook to fetch rows for Data Studio from Supabase-cached dimension_data.
 * This keeps Data Studio on the single canonical row store (dimension_data).
 * Groups rows by channel based on the slide report's report_ids mapping.
 *
 * Performance strategy:
 * - When selectedYear is provided (not 'all'), uses the server-side RPC
 *   `get_dimension_data_by_report_and_date` to fetch only rows for the
 *   selected year/month. This reduces payload from 50k+ rows to ~5k.
 * - When selectedYear is 'all', fetches all rows in parallel batches.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getUser } from '@/lib/auth';
import { parseSelectedMonths } from '@/lib/monthUtils';
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

/**
 * Find the date dimension ID from a sample of rows.
 * Returns the UUID key whose value is an ISO date string (YYYY-MM-DD).
 */
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

/**
 * Fetch rows using the server-side RPC (date-filtered, efficient).
 * Returns flat objects with UUID keys (dimension_values spread to top level).
 */
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
    p_max_rows: 200000,
  });
  if (error) throw error;
  // RPC returns SETOF jsonb — each element is a dimension_values object
  return (data || []).map((dv: Record<string, any>) => ({ ...dv }));
}

/**
 * Fetch all rows in parallel batches (used for "All Time" view).
 * Splits into parallel requests of batchSize each.
 */
async function fetchAllRowsParallel(reportId: string): Promise<CachedDataRow[]> {
  const batchSize = 1000;

  // First, get the total count
  const { count, error: countError } = await supabase
    .from('dimension_data')
    .select('id', { count: 'exact', head: true })
    .eq('report_id', reportId);

  if (countError) throw countError;
  const total = count ?? 0;
  if (total === 0) return [];

  // Build parallel batch requests
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

/**
 * Fetch rows for a channel, using RPC when possible (year selected) or
 * parallel batch fetch for all-time.
 */
async function fetchChannelRows(
  channelReportId: string,
  selectedYear: string,
  selectedMonth: string
): Promise<{ rows: Record<string, any>[]; dimMap: Record<string, string> }> {
  const isAllTime = !selectedYear || selectedYear === 'all';

  if (!isAllTime) {
    // Step 1: Fetch a small sample to discover the date dimension ID
    const { data: sampleData, error: sampleError } = await supabase
      .from('dimension_data')
      .select('dimension_values')
      .eq('report_id', channelReportId)
      .limit(20);

    if (sampleError) throw sampleError;

    const sampleRows = (sampleData || []).map((r) => ({ ...(r.dimension_values || {}) }));

    // Collect all dimension IDs from sample for the name map
    const dimIds = new Set<string>();
    for (const row of sampleRows) {
      for (const id of Object.keys(row)) dimIds.add(id);
    }
    const dimMap = await buildDimensionNameMap(Array.from(dimIds));

    // Find the date dimension ID
    const dateDimId = findDateDimensionId(sampleRows);

    if (dateDimId) {
      // Use server-side RPC for date-filtered fetch.
      // Always fetch the full selected year (not just the selected month) so that
      // the monthly revenue chart has data for all months in the year.
      // The client-side useFilteredSlideData hook then narrows to the selected month
      // for KPI totals.
      const yearNum = parseInt(selectedYear);
      const rows = await fetchByDateRpc(channelReportId, dateDimId, yearNum, null);

      // Rebuild dimension map from ALL fetched rows so we include every dimension ID
      // from every data source. The initial 20-row sample can miss Cost/other dimensions
      // that only appear in later rows (e.g. second data source), causing under-counted KPIs.
      const allDimIds = new Set<string>();
      for (const r of rows) {
        for (const id of Object.keys(r)) {
          if (id === '_row_number') continue;
          allDimIds.add(id);
        }
      }
      const fullDimMap = await buildDimensionNameMap(Array.from(allDimIds));

      return { rows: rows.map((r, i) => ({ ...r, _row_number: i + 1 })), dimMap: fullDimMap };
    }

    // No date dimension found — fall through to full fetch
  }

  // All-time or no date dim: fetch all rows in parallel
  const cachedRows = await fetchAllRowsParallel(channelReportId);
  const allRawRows = cachedRows.map((row) => ({
    ...(row.dimension_values || {}),
    _row_number: row.row_number,
  }));

  // Build dimension map from ALL rows so every data source's dimension IDs are included
  const allDimIds = new Set<string>();
  for (const row of cachedRows) {
    const dv = (row.dimension_values || {}) as Record<string, unknown>;
    for (const id of Object.keys(dv)) allDimIds.add(id);
  }
  const dimMap = await buildDimensionNameMap(Array.from(allDimIds));

  return { rows: allRawRows, dimMap };
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
) {
  const reportIds = useMemo((): Record<string, string> => {
    const base = (reportIdsOverride != null && Object.keys(reportIdsOverride).length > 0)
      ? reportIdsOverride
      : (slideReport?.report_ids || {}) as Record<string, string>;
    return Object.fromEntries(
      Object.entries(base).filter(([, id]) => id != null && String(id).trim() !== '')
    ) as Record<string, string>;
  }, [slideReport?.report_ids, reportIdsOverride]);

  return useQuery({
    // Key includes selectedYear so switching years refetches the correct data.
    // Month is NOT in the key — we always fetch the full year and let the
    // client-side useFilteredSlideData narrow to the selected month for KPI totals.
    queryKey: ['data-studio-raw-rows', slideReport?.id, selectedYear, Object.keys(reportIds).sort().join(',')],
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
        const { rows, dimMap } = await fetchChannelRows(channelReportId, selectedYear, undefined);
        const duration = Math.round(performance.now() - startTime);
        console.log(`[DataStudio] ${channel}: ${rows.length} rows in ${duration}ms (year=${selectedYear})`);

        return { channel, rows, dimMap };
      });

      const results = await Promise.all(promises);
      for (const { channel, rows, dimMap } of results) {
        // Always include every channel so the report shows all three (metasearch, sem, social).
        // Empty rows when no data so cost/revenue etc. show as 0 instead of only metasearch showing.
        result[channel] = rows ?? [];
        dimensionMaps[channel] = dimMap ?? {};
      }

      return { rawRows: result, dimensionMaps };
    },
    enabled: enabled && !!slideReport?.id && Object.keys(reportIds).length > 0,
    staleTime: 0,
    gcTime: 0, // Do not retain stale raw rows — avoids wrong KPIs (e.g. metasearch cost) from old cache
    refetchOnMount: true, // Always fetch fresh data when Data Studio mounts
    refetchOnWindowFocus: true, // Refetch when user returns to tab so totals stay correct
    refetchOnReconnect: true,
  });
}
