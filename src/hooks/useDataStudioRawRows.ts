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

      // Add _row_number placeholder (not needed for aggregation but keeps type compat)
      return { rows: rows.map((r, i) => ({ ...r, _row_number: i + 1 })), dimMap };
    }

    // No date dimension found — fall through to full fetch
  }

  // All-time or no date dim: fetch all rows in parallel
  const cachedRows = await fetchAllRowsParallel(channelReportId);
  const allRawRows = cachedRows.map((row) => ({
    ...(row.dimension_values || {}),
    _row_number: row.row_number,
  }));

  // Build dimension map from sample
  const sampleSize = 200;
  const sampled = cachedRows.slice(0, sampleSize);
  const dimIds = new Set<string>();
  for (const row of sampled) {
    const dv = (row.dimension_values || {}) as Record<string, unknown>;
    for (const id of Object.keys(dv)) dimIds.add(id);
  }
  const dimMap = await buildDimensionNameMap(Array.from(dimIds));

  return { rows: allRawRows, dimMap };
}

/**
 * Hook to fetch raw rows from dimension_data for each channel.
 * Returns rows grouped by channel name (metasearch, sem, social) with dimension_values as top-level keys.
 *
 * Uses server-side date filtering (RPC) when a year is selected to avoid fetching all rows.
 */
export function useDataStudioRawRows(
  slideReport: SlideReport | null | undefined,
  enabled: boolean = false,
  selectedYear: string = 'all',
) {
  const reportIds = (slideReport?.report_ids || {}) as Record<string, string>;

  return useQuery({
    // Key includes selectedYear so switching years refetches the correct data.
    // Month is NOT in the key — we always fetch the full year and let the
    // client-side useFilteredSlideData narrow to the selected month for KPI totals.
    queryKey: ['data-studio-raw-rows', slideReport?.id, selectedYear],
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
        const { rows, dimMap } = await fetchChannelRows(channelReportId, selectedYear, selectedMonth);
        const duration = Math.round(performance.now() - startTime);
        console.log(`[DataStudio] ${channel}: ${rows.length} rows in ${duration}ms (year=${selectedYear}, month=${selectedMonth})`);

        return { channel, rows, dimMap };
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
    staleTime: 0, // Always refetch when invalidated — data changes after sync
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
}
