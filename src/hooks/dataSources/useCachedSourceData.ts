/**
 * Optimized hook for instant data loading using database-cached dimension_data
 * This provides instant loading instead of fetching from Google Sheets/CSV each time
 * 
 * Features:
 * - Long staleTime (10 min) to prevent re-fetches
 * - placeholderData to show previous data instantly while loading new
 * - Shared query key so all components share the same cache
 */

import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CachedDataRow {
  id: string;
  dimension_values: Record<string, any>;
  data_source_id: string;
  row_number: number;
}

export interface CachedSourceDataResult {
  rows: CachedDataRow[];
  transformedRows: any[];
  fromCache: boolean;
  rowCount: number;
}

/**
 * Fetch all dimension_data from Supabase in batches (handles >1000 row limit)
 */
async function fetchDimensionDataBatched(
  reportId: string
): Promise<CachedDataRow[]> {
  const allRows: CachedDataRow[] = [];
  const batchSize = 1000;
  let offset = 0;
  let hasMore = true;

  console.log('[CACHED-DATA] Starting batched fetch for report:', reportId);
  const startTime = performance.now();

  while (hasMore) {
    const { data, error } = await supabase
      .from('dimension_data')
      .select('id, dimension_values, data_source_id, row_number')
      .eq('report_id', reportId)
      .order('row_number', { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.error('[CACHED-DATA] Error fetching batch:', error);
      throw error;
    }

    if (data && data.length > 0) {
      allRows.push(...(data as CachedDataRow[]));
      offset += batchSize;
      hasMore = data.length === batchSize;
    } else {
      hasMore = false;
    }
  }

  const duration = Math.round(performance.now() - startTime);
  console.log('[CACHED-DATA] Fetch completed:', {
    reportId,
    rowCount: allRows.length,
    duration: `${duration}ms`
  });

  return allRows;
}

/**
 * Transform cached dimension_data to the format expected by components
 */
function transformCachedRows(rows: CachedDataRow[]): any[] {
  return rows.map(row => ({
    id: row.id,
    row_number: row.row_number,
    data_source_id: row.data_source_id,
    dimension_values: row.dimension_values,
  }));
}

/**
 * Hook to fetch data from Supabase dimension_data table (cached/synced data)
 * This is MUCH faster than fetching from Google Sheets/CSV each time
 * 
 * Uses placeholderData to show previous data instantly while loading new data
 */
export function useCachedSourceData(
  reportId: string | null,
  options: { enabled?: boolean; forceRefresh?: boolean } = {}
) {
  const { enabled = true, forceRefresh = false } = options;

  return useQuery({
    queryKey: ['cached-dimension-data', reportId],
    queryFn: async (): Promise<CachedSourceDataResult> => {
      if (!reportId) {
        return { rows: [], transformedRows: [], fromCache: true, rowCount: 0 };
      }

      const rows = await fetchDimensionDataBatched(reportId);
      const transformedRows = transformCachedRows(rows);

      return {
        rows,
        transformedRows,
        fromCache: true,
        rowCount: rows.length,
      };
    },
    enabled: enabled && !!reportId,
    staleTime: forceRefresh ? 0 : 10 * 60 * 1000, // 10 minutes (increased from 5)
    gcTime: 60 * 60 * 1000, // 1 hour in garbage collection
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Don't refetch when component mounts (use cached data)
    refetchOnReconnect: false,
    placeholderData: keepPreviousData, // Show previous data instantly while loading
  });
}

/**
 * Hook to invalidate cached source data
 */
export function useInvalidateCachedData() {
  const queryClient = useQueryClient();

  return {
    invalidate: (reportId: string) => {
      console.log('[CACHED-DATA] Invalidating cache for report:', reportId);
      queryClient.invalidateQueries({
        queryKey: ['cached-dimension-data', reportId]
      });
    },
    invalidateAll: () => {
      console.log('[CACHED-DATA] Invalidating all cached data');
      queryClient.invalidateQueries({
        queryKey: ['cached-dimension-data']
      });
    },
  };
}
