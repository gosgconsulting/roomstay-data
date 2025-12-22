import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { dataSourceQueryKeys } from './queryKeys';
import type { DataSource } from '@/lib/data-sources/types';

interface UseSourceDataProps {
  dataSourceId: string;
  enabled?: boolean;
  filters?: Record<string, any>;
}

export interface SourceDataResult {
  transformedRows: any[];
  dimensionIdMap: Record<string, string>;
  rawData: any[];
}

export const useSourceData = ({ 
  dataSourceId, 
  enabled = true,
  filters = {}
}: UseSourceDataProps) => {
  const { user } = useAuth();

  return useQuery({
    queryKey: dataSourceQueryKeys.sourceData(dataSourceId, filters),
    queryFn: async () => {
      if (!user) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('sheet_data')
        .select('*')
        .eq('data_source_id', dataSourceId)
        .order('row_number');

      if (error) {
        console.error('Error fetching source data:', error);
        throw error;
      }

      return data || [];
    },
    enabled: enabled && !!user && !!dataSourceId,
    // Cache source data for longer since it doesn't change frequently
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 20 * 60 * 1000, // 20 minutes
    refetchOnWindowFocus: false,
    refetchOnReconnect: 'always',
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
};

/**
 * Fetch source data function for use outside React components
 */
export async function fetchSourceData(
  dataSource: DataSource, 
  userId: string, 
  accountId?: string | null
): Promise<SourceDataResult> {
  // This is a placeholder implementation
  // The actual implementation should transform raw sheet data into the expected format
  const { data, error } = await supabase
    .from('sheet_data')
    .select('*')
    .eq('data_source_id', dataSource.id)
    .order('row_number');

  if (error) {
    throw error;
  }

  // Transform the data to match expected format
  const transformedRows = (data || []).map((row: any) => ({
    ...row.row_data,
    _row_number: row.row_number,
    _id: row.id
  }));

  return {
    transformedRows,
    dimensionIdMap: {},
    rawData: data || []
  };
}