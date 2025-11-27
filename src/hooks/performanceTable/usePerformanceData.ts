import { useQuery, type UseQueryResult, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Query keys for performance data
 */
export const performanceDataKeys = {
  all: ["performance-data"] as const,
  report: (reportId: string | null | undefined, accountId: string, params?: {
    reportIds?: string[];
    userId?: string;
    dateFrom?: string;
    dateTo?: string;
    dimensionFilters?: Record<string, string | string[]>;
    visibleDimensionIds?: string[];
    groupByDims?: string[];
    breakdownDims?: string[];
    thenByDims?: string[];
    dateGranularity?: 'day' | 'week' | 'month' | 'year';
    dateOrder?: 'asc' | 'desc';
  }) => [
    ...performanceDataKeys.all,
    "report",
    reportId || "null",
    accountId,
    params ? JSON.stringify(params) : "default",
  ] as const,
};

/**
 * Edge function response type
 */
export interface EdgeFunctionResponse {
  data: any[];
  totalCount: number;
  totalRows: number;
  hasMore: boolean;
}

/**
 * Parameters for the edge function call
 */
export interface PerformanceDataParams {
  reportId?: string | null;
  reportIds?: string[];
  accountId: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  dimensionFilters?: Record<string, string | string[]>;
  visibleDimensionIds?: string[];
  groupByDims?: string[];
  breakdownDims?: string[];
  thenByDims?: string[];
  dateGranularity?: 'day' | 'week' | 'month' | 'year';
  dateOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * Internal query function to fetch performance data from edge function
 * This is used by React Query as the queryFn
 */
async function fetchPerformanceDataQueryFn(params: PerformanceDataParams): Promise<EdgeFunctionResponse> {
  const { data: edgeData, error: edgeError } = await supabase.functions.invoke('get-performance-data', {
    body: {
      reportId: params.reportId || undefined,
      reportIds: params.reportIds || undefined,
      accountId: params.accountId,
      userId: params.userId,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      dimensionFilters: params.dimensionFilters || {},
      groupByDims: params.groupByDims || [],
      breakdownDims: params.breakdownDims || [],
      thenByDims: params.thenByDims || [],
      visibleDimensionIds: params.visibleDimensionIds || [],
      dateGranularity: params.dateGranularity,
      dateOrder: params.dateOrder,
      limit: params.limit || 50000,
      offset: params.offset || 0,
    }
  });

  if (edgeError) {
    console.error('[PERFORMANCE-DATA] Edge function error:', edgeError);
    throw edgeError;
  }

  if (!edgeData) {
    throw new Error('No data returned from edge function');
  }

  return edgeData as EdgeFunctionResponse;
}

/**
 * Fetch performance data with React Query caching support
 * 
 * When queryClient is provided, uses React Query's cache (checks cache first, fetches if stale/missing)
 * When queryClient is not provided, fetches directly (for backward compatibility)
 * 
 * @param params - Parameters for the edge function call
 * @param queryClient - Optional React Query client for caching. When provided, uses cache.
 * @returns Promise with edge function data
 */
export async function fetchPerformanceData(
  params: PerformanceDataParams,
  queryClient?: QueryClient
): Promise<EdgeFunctionResponse> {
  // If queryClient is provided, use React Query's fetchQuery for caching
  if (queryClient) {
    const queryKey = performanceDataKeys.report(params.reportId, params.accountId, {
      reportIds: params.reportIds,
      userId: params.userId,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      dimensionFilters: params.dimensionFilters,
      visibleDimensionIds: params.visibleDimensionIds,
      groupByDims: params.groupByDims,
      breakdownDims: params.breakdownDims,
      thenByDims: params.thenByDims,
      dateGranularity: params.dateGranularity,
      dateOrder: params.dateOrder,
    });

    return queryClient.fetchQuery({
      queryKey,
      queryFn: () => fetchPerformanceDataQueryFn(params),
      staleTime: 2 * 60 * 1000, // 2 minutes
      gcTime: 5 * 60 * 1000, // 5 minutes
    });
  }

  // Fallback: fetch directly without caching (for backward compatibility)
  return fetchPerformanceDataQueryFn(params);
}

/**
 * React Query hook to fetch performance data with caching
 * 
 * @param params - Parameters for the edge function call
 * @param enabled - Whether the query should be enabled (default: true)
 * @returns React Query result with edge function data
 */
export function usePerformanceData(
  params: PerformanceDataParams | null,
  enabled: boolean = true
): UseQueryResult<EdgeFunctionResponse, Error> {
  return useQuery({
    queryKey: params
      ? performanceDataKeys.report(params.reportId, params.accountId, {
          reportIds: params.reportIds,
          userId: params.userId,
          dateFrom: params.dateFrom,
          dateTo: params.dateTo,
          dimensionFilters: params.dimensionFilters,
          visibleDimensionIds: params.visibleDimensionIds,
          groupByDims: params.groupByDims,
          breakdownDims: params.breakdownDims,
          thenByDims: params.thenByDims,
          dateGranularity: params.dateGranularity,
          dateOrder: params.dateOrder,
        })
      : ["performance-data", "disabled"],
    queryFn: () => {
      if (!params) {
        throw new Error("Performance data params are required");
      }
      return fetchPerformanceDataQueryFn(params);
    },
    enabled: enabled && !!params && !!params.accountId && (!!params.reportId || (params.reportIds && params.reportIds.length > 0)),
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes (formerly cacheTime)
    retry: 2,
  });
}

