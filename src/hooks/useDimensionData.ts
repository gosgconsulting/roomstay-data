import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useMemo } from 'react';

interface UseDimensionDataProps {
  reportId?: string;
  enabled?: boolean;
}

export const useDimensionData = ({ reportId, enabled = true }: UseDimensionDataProps = {}) => {
  const { user } = useAuth();

  // Create stable query key
  const queryKey = useMemo(() => [
    'dimension-data',
    reportId,
  ], [reportId]);

  const query = useQuery({
    queryKey,
    queryFn: async () => {
      if (!user) throw new Error('User not authenticated');

      let query = supabase
        .from('dimensions')
        .select('*')
        .order('name');

      if (reportId) {
        query = query.or(`report_id.eq.${reportId},scope.eq.global,scope.eq.account`);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching dimensions:', error);
        throw error;
      }

      return data || [];
    },
    enabled: enabled && !!user,
    // Increase cache time significantly for dimensions as they don't change often
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    // Don't refetch on window focus
    refetchOnWindowFocus: false,
    // Don't refetch on reconnect unless stale
    refetchOnReconnect: 'always',
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });

  return {
    ...query,
    dimensions: query.data || [],
    dimensionHasData: {},
    loadDimensions: query.refetch,
  };
};