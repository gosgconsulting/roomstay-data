import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { resyncQueryKeys } from "./queryKeys";
import {
  fetchAccountDimensions,
  fetchReportDimensions,
  fetchOldDimensions,
  fetchDimensionDataBatch,
} from "./queryFunctions";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hook to fetch account-scoped dimensions with caching
 */
export function useAccountDimensions(accountId: string, enabled = true) {
  return useQuery({
    queryKey: resyncQueryKeys.dimensions.account(accountId),
    queryFn: fetchAccountDimensions,
    enabled: enabled && !!accountId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
  });
}

/**
 * Hook to fetch report-specific dimensions with caching
 */
export function useReportDimensions(reportId: string, enabled = true) {
  return useQuery({
    queryKey: resyncQueryKeys.dimensions.report(reportId),
    queryFn: fetchReportDimensions,
    enabled: enabled && !!reportId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Hook to fetch old dimensions by IDs with caching
 */
export function useOldDimensions(dimensionIds: string[], enabled = true) {
  const uniqueIds = Array.from(new Set(dimensionIds)).sort();
  const cacheKey = uniqueIds.join(',');

  return useQuery({
    queryKey: resyncQueryKeys.dimensions.oldDimensions(uniqueIds),
    queryFn: fetchOldDimensions,
    enabled: enabled && uniqueIds.length > 0,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  });
}

/**
 * Hook to fetch dimension_data batch with caching
 */
export function useDimensionDataBatch(reportId: string, offset: number, enabled = true) {
  return useQuery({
    queryKey: resyncQueryKeys.dimensionData.batch(reportId, offset),
    queryFn: fetchDimensionDataBatch,
    enabled: enabled && !!reportId,
    staleTime: 2 * 60 * 1000, // 2 minutes (shorter for data that changes more frequently)
    gcTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Hook to update dimension_data rows
 */
export function useUpdateDimensionData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      dimension_values,
    }: {
      id: string;
      dimension_values: Record<string, any>;
    }) => {
      const { error } = await supabase
        .from("dimension_data")
        .update({ dimension_values })
        .eq("id", id);

      if (error) throw error;
      return { id, dimension_values };
    },
    onSuccess: (_, variables) => {
      // Invalidate related queries to refresh cache
      queryClient.invalidateQueries({
        queryKey: resyncQueryKeys.dimensionData.all,
      });
    },
  });
}

/**
 * Hook to prefetch dimensions using queryClient
 * Useful for background fetching during resync
 */
export function usePrefetchDimensions() {
  const queryClient = useQueryClient();

  return {
    prefetchAccountDimensions: async (accountId: string) => {
      await queryClient.prefetchQuery({
        queryKey: resyncQueryKeys.dimensions.account(accountId),
        queryFn: fetchAccountDimensions,
        staleTime: 5 * 60 * 1000,
      });
    },
    prefetchReportDimensions: async (reportId: string) => {
      await queryClient.prefetchQuery({
        queryKey: resyncQueryKeys.dimensions.report(reportId),
        queryFn: fetchReportDimensions,
        staleTime: 5 * 60 * 1000,
      });
    },
    prefetchOldDimensions: async (dimensionIds: string[]) => {
      const uniqueIds = Array.from(new Set(dimensionIds)).sort();
      await queryClient.prefetchQuery({
        queryKey: resyncQueryKeys.dimensions.oldDimensions(uniqueIds),
        queryFn: fetchOldDimensions,
        staleTime: 5 * 60 * 1000,
      });
    },
  };
}

/**
 * Hook to resync all dimensions using react-query mutation
 * Automatically provides QueryClient and handles cache invalidation
 */
export function useResyncAllDimensions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      reportId,
      accountId,
    }: {
      reportId: string;
      accountId: string;
    }) => {
      // Dynamic import to avoid circular dependencies
      const { resyncAllDimensions } = await import("../resync-all-dimensions");
      return await resyncAllDimensions(queryClient, reportId, accountId);
    },
    onSuccess: (_, variables) => {
      // Invalidate all related queries after successful resync
      queryClient.invalidateQueries({
        queryKey: resyncQueryKeys.all,
      });
      console.log(`[RESYNC] Cache invalidated for report: ${variables.reportId}`);
    },
    onError: (error) => {
      console.error("[RESYNC] Error during resync:", error);
    },
  });
}

