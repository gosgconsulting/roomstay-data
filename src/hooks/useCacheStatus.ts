import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { dataSourceKeys } from "@/hooks/dataSources/queryKeys";

interface CacheStatus {
  isDataCached: boolean;
  lastSyncTime?: string;
  cacheAge?: number; // in minutes
  dataSourceCount: number;
  cachedSourceCount: number;
}

/**
 * Hook to check cache status for a report
 */
export function useCacheStatus(reportId: string | null): CacheStatus {
  const queryClient = useQueryClient();

  // Get data sources for this report
  const { data: dataSources = [] } = useQuery({
    queryKey: ["dataSources", reportId],
    queryFn: async () => {
      if (!reportId) return [];
      
      const { data, error } = await supabase
        .from("data_sources")
        .select("id, report_id, last_synced_at, updated_at")
        .eq("report_id", reportId);

      if (error) {
        console.error("Error fetching data sources for cache status:", error);
        return [];
      }

      return data || [];
    },
    enabled: !!reportId,
    staleTime: 30 * 1000, // 30 seconds
  });

  // Check cache status
  const cacheStatus = useMemo((): CacheStatus => {
    if (!reportId || dataSources.length === 0) {
      return {
        isDataCached: false,
        dataSourceCount: 0,
        cachedSourceCount: 0,
      };
    }

    let cachedSourceCount = 0;
    let oldestCacheTime: Date | null = null;

    // Check each data source for cached data
    dataSources.forEach((dataSource) => {
      const queryKey = dataSourceKeys.sourceData(
        dataSource.id,
        dataSource.report_id,
        dataSource.updated_at
      );
      
      const cachedData = queryClient.getQueryData(queryKey);
      const queryState = queryClient.getQueryState(queryKey);
      
      if (cachedData && queryState && !queryState.isStale) {
        cachedSourceCount++;
        
        // Track oldest cache time
        if (queryState.dataUpdatedAt) {
          const cacheTime = new Date(queryState.dataUpdatedAt);
          if (!oldestCacheTime || cacheTime < oldestCacheTime) {
            oldestCacheTime = cacheTime;
          }
        }
      }
    });

    // Find the most recent sync time
    const lastSyncTime = dataSources
      .map(ds => ds.last_synced_at)
      .filter(Boolean)
      .sort()
      .pop();

    // Calculate cache age
    let cacheAge: number | undefined;
    if (oldestCacheTime) {
      cacheAge = Math.floor((Date.now() - oldestCacheTime.getTime()) / (1000 * 60));
    }

    return {
      isDataCached: cachedSourceCount > 0,
      lastSyncTime,
      cacheAge,
      dataSourceCount: dataSources.length,
      cachedSourceCount,
    };
  }, [reportId, dataSources, queryClient]);

  return cacheStatus;
}

/**
 * Hook to get cache actions
 */
export function useCacheActions() {
  const queryClient = useQueryClient();

  const clearCache = useCallback(() => {
    console.log('[CACHE] Manually clearing all cache');
    
    // Remove all cached source data
    queryClient.removeQueries({
      queryKey: dataSourceKeys.all
    });
    
    // Remove all data source queries
    queryClient.removeQueries({
      queryKey: ["dataSource"]
    });
    
    // Also clear AI Summary cache
    queryClient.removeQueries({
      queryKey: ["ai-summary"]
    });
    
    console.log('[CACHE] Manual cache clear completed');
  }, [queryClient]);

  const refreshCache = useCallback(() => {
    console.log('[CACHE] Manually refreshing all cache');
    
    // Invalidate all queries to force refresh
    queryClient.invalidateQueries({
      queryKey: dataSourceKeys.all
    });
    
    queryClient.invalidateQueries({
      queryKey: ["dataSource"]
    });
    
    // Also invalidate AI Summary cache to ensure Last 7 Days table updates
    queryClient.invalidateQueries({
      queryKey: ["ai-summary"]
    });
    
    console.log('[CACHE] Manual cache refresh completed');
  }, [queryClient]);

  return {
    clearCache,
    refreshCache,
  };
}
