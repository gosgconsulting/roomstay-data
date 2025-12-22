import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

interface UsePerformanceTableFiltersProps {
  reportId: string;
}

export const usePerformanceTableFilters = (reportId: string) => {
  const { user } = useAuth();

  // Create stable query key for master filter settings
  const queryKey = useMemo(() => [
    'master-filter-settings',
    reportId,
    user?.id,
  ], [reportId, user?.id]);

  const { data: masterFilterSettings } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('master_filter_settings')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching master filter settings:', error);
        throw error;
      }

      return data;
    },
    enabled: !!user,
    // Cache filter settings for longer since they don't change frequently
    staleTime: 15 * 60 * 1000, // 15 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: 'always',
  });

  // Memoize filters and date range to prevent unnecessary re-renders
  const filters = useMemo(() => {
    const dimensionFilters: Record<string, string> = {};
    
    if (masterFilterSettings?.selected_dimension_id && masterFilterSettings?.selected_dimension_values?.length > 0) {
      dimensionFilters[masterFilterSettings.selected_dimension_id] = masterFilterSettings.selected_dimension_values[0];
    }
    
    return dimensionFilters;
  }, [masterFilterSettings?.selected_dimension_id, masterFilterSettings?.selected_dimension_values]);

  const dateRange = useMemo(() => {
    if (!masterFilterSettings) return undefined;

    return {
      from: masterFilterSettings.date_range_from,
      to: masterFilterSettings.date_range_to,
    };
  }, [masterFilterSettings?.date_range_from, masterFilterSettings?.date_range_to]);

  return {
    filters,
    dateRange,
    masterFilterSettings,
  };
};