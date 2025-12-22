import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useMemo } from 'react';

interface PerformanceTableDataProps {
  reportId: string;
  groupByDimensions?: string[];
  breakdownByDimensions?: string[];
  thenByDimensions?: string[];
  dimensionFilters?: Record<string, string>;
  dateFrom?: string;
  dateTo?: string;
  visibleDimensionIds?: string[];
  limit?: number;
  offset?: number;
}

export const usePerformanceTableData = ({
  reportId,
  groupByDimensions = [],
  breakdownByDimensions = [],
  thenByDimensions = [],
  dimensionFilters = {},
  dateFrom,
  dateTo,
  visibleDimensionIds = [],
  limit = 1000,
  offset = 0,
}: PerformanceTableDataProps) => {
  const { user } = useAuth();

  // Create stable query key using JSON.stringify for objects and arrays
  const queryKey = useMemo(() => [
    'performance-table-data',
    reportId,
    JSON.stringify(groupByDimensions.sort()),
    JSON.stringify(breakdownByDimensions.sort()),
    JSON.stringify(thenByDimensions.sort()),
    JSON.stringify(dimensionFilters),
    dateFrom,
    dateTo,
    JSON.stringify(visibleDimensionIds.sort()),
    limit,
    offset,
  ], [
    reportId,
    groupByDimensions,
    breakdownByDimensions,
    thenByDimensions,
    dimensionFilters,
    dateFrom,
    dateTo,
    visibleDimensionIds,
    limit,
    offset,
  ]);

  return useQuery({
    queryKey,
    queryFn: async () => {
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase.rpc('get_aggregated_performance_data', {
        p_report_id: reportId,
        p_group_by_dims: groupByDimensions,
        p_breakdown_dims: breakdownByDimensions,
        p_then_by_dims: thenByDimensions,
        p_dimension_filters: dimensionFilters,
        p_date_from: dateFrom,
        p_date_to: dateTo,
        p_visible_dimension_ids: visibleDimensionIds,
        p_limit: limit,
        p_offset: offset,
      });

      if (error) {
        console.error('Error fetching performance data:', error);
        throw error;
      }

      return data || [];
    },
    enabled: !!user && !!reportId,
    // Increase cache time to 10 minutes to prevent unnecessary refetches
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes (formerly cacheTime)
    // Don't refetch on window focus to prevent unnecessary requests
    refetchOnWindowFocus: false,
    // Don't refetch on reconnect unless data is stale
    refetchOnReconnect: 'always',
    // Retry failed requests with exponential backoff
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
};