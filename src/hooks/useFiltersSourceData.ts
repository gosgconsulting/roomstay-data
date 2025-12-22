/**
 * Hook to fetch source data specifically for filters
 * This ensures filters can access source data without duplicating fetches
 */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { dataSourceKeys } from "./dataSources/queryKeys";
import { fetchSourceData, type SourceDataResult } from "./dataSources/useSourceData";
import { getUser } from "@/lib/auth";
import type { DataSource } from "@/lib/data-sources/types";

export interface UseFiltersSourceDataOptions {
  enabled?: boolean;
}

/**
 * Hook to fetch source data for filter components
 * Uses the same query key as useSourceData for caching efficiency
 */
export function useFiltersSourceData(
  reportId: string | null,
  accountId?: string | null,
  options: UseFiltersSourceDataOptions = {}
) {
  const { enabled = true } = options;

  // First, fetch the data source for this report
  const dataSourceQuery = useQuery({
    queryKey: ["dataSource", "forReport", reportId],
    queryFn: async () => {
      if (!reportId) return null;
      
      const { data, error } = await supabase
        .from("data_sources")
        .select("*")
        .eq("report_id", reportId)
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("[useFiltersSourceData] Error fetching data source:", error);
        return null;
      }

      // Cast to DataSource type (column_mappings type mismatch between DB Json and typed ColumnMapping[])
      return data as unknown as DataSource | null;
    },
    enabled: enabled && !!reportId,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours - keep data fresh until manual sync
  });

  const dataSource = dataSourceQuery.data;

  // Then fetch the source data using the same query key structure
  const sourceDataQuery = useQuery({
    queryKey: dataSourceKeys.sourceData(
      dataSource?.id || '',
      dataSource?.report_id || '',
      dataSource?.updated_at || undefined
    ),
    queryFn: async () => {
      if (!dataSource) {
        throw new Error("Data source is required");
      }

      const { user } = await getUser();
      if (!user) {
        throw new Error("User must be authenticated");
      }

      return fetchSourceData(dataSource, user.id, accountId);
    },
    enabled: enabled && !!dataSource && !!dataSource.id,
    staleTime: 24 * 60 * 60 * 1000, // 24 hours - keep data fresh until manual sync
    gcTime: 7 * 24 * 60 * 60 * 1000, // 7 days - keep in memory for a week
    retry: 2,
  });

  return {
    dataSource,
    sourceData: sourceDataQuery.data,
    isLoading: dataSourceQuery.isLoading || sourceDataQuery.isLoading,
    isError: dataSourceQuery.isError || sourceDataQuery.isError,
    error: dataSourceQuery.error || sourceDataQuery.error,
    transformedRows: sourceDataQuery.data?.transformedRows || [],
    dimensionIdMap: sourceDataQuery.data?.dimensionIdMap || {},
  };
}
