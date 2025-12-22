import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useMemo } from 'react';

interface UsePerformanceDataProps {
  reportId: string;
  filters?: Record<string, any>;
  dateRange?: {
    from?: string;
    to?: string;
  };
  enabled?: boolean;
}

export const usePerformanceData = ({
  reportId,
  filters = {},
  dateRange = {},
  enabled = true,
}: UsePerformanceDataProps) => {
  const { user } = useAuth();

  // Create stable query key
  const queryKey = useMemo(() => [
    'performance-data',
    reportId,
    JSON.stringify(filters),
    JSON.stringify(dateRange),
  ], [reportId, filters, dateRange]);

  return useQuery({
    queryKey,
    queryFn: async () => {
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('dimension_data')
        .select('*')
        .eq('report_id', reportId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching performance data:', error);
        throw error;
      }

      return data || [];
    },
    enabled: enabled && !!user && !!reportId,
    // Increase cache time to prevent unnecessary refetches
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
    // Don't refetch on window focus
    refetchOnWindowFocus: false,
    // Don't refetch on reconnect unless stale
    refetchOnReconnect: 'always',
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
};

/**
 * Fetch performance data function for use outside React components
 */
export async function fetchPerformanceData(params: any, queryClient: any): Promise<any> {
  // This is a placeholder implementation
  // The actual implementation should call the appropriate edge function
  return { data: [], totalCount: 0, hasMore: false };
}