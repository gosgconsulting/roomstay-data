import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { loadReportData, DataLoadingResult } from '@/lib/data-loading-fix';

interface UseReportDataOptions {
  reportId: string | null;
  accountId: string | null;
  filters?: {
    dateRange?: { from: Date; to?: Date };
    dimensionFilters?: Record<string, string[]>;
    compareEnabled?: boolean;
    compareType?: string;
    compareDateRange?: { from: Date; to?: Date };
  };
  onLoadingComplete?: () => void;
  enabled?: boolean;
}

interface UseReportDataReturn {
  data: any[];
  dimensions: any[];
  isLoading: boolean;
  error: string | null;
  totalRows: number;
  filteredRows: number;
  refetch: () => Promise<void>;
}

/**
 * Unified hook for loading report data across all components
 * Uses the standardized data-loading-fix approach for consistency
 */
export function useReportData({
  reportId,
  accountId,
  filters,
  onLoadingComplete,
  enabled = true
}: UseReportDataOptions): UseReportDataReturn {
  const [data, setData] = useState<any[]>([]);
  const [dimensions, setDimensions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalRows, setTotalRows] = useState(0);
  const [filteredRows, setFilteredRows] = useState(0);

  const loadData = useCallback(async () => {
    if (!enabled || !reportId || !accountId) {
      setIsLoading(false);
      return;
    }

    console.log('[USE-REPORT-DATA] Loading data for:', { reportId, accountId, filters });
    setIsLoading(true);
    setError(null);

    try {
      // Get current user with fallback
      let user = null;
      let userError = null;
      
      try {
        const { data: { user: fetchedUser }, error: fetchError } = await supabase.auth.getUser();
        user = fetchedUser;
        userError = fetchError;
      } catch (err) {
        console.log('[USE-REPORT-DATA] getUser() failed, trying session fallback:', err);
        
        // Fallback: get user from current session
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          console.log('[USE-REPORT-DATA] Using session user as fallback');
          user = session.user;
          userError = null;
        } else {
          userError = err;
        }
      }
      
      if (userError && !user) throw userError;
      if (!user) throw new Error('User not authenticated');

      // Use the standardized data loading approach
      const result: DataLoadingResult = await loadReportData(
        reportId,
        accountId,
        user.id,
        {
          dateRange: filters?.dateRange,
          dimensionFilters: filters?.dimensionFilters
        }
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to load data');
      }

      console.log('[USE-REPORT-DATA] Data loaded successfully:', {
        dataRows: result.data.length,
        dimensionsCount: result.dimensions.length,
        totalRows: result.totalRows,
        filteredRows: result.filteredRows
      });

      setData(result.data);
      setDimensions(result.dimensions);
      setTotalRows(result.totalRows);
      setFilteredRows(result.filteredRows);
      setError(null);

    } catch (err) {
      console.error('[USE-REPORT-DATA] Error loading data:', err);
      setError(err instanceof Error ? err.message : String(err));
      setData([]);
      setDimensions([]);
      setTotalRows(0);
      setFilteredRows(0);
    } finally {
      setIsLoading(false);
      onLoadingComplete?.();
    }
  }, [reportId, accountId, enabled, onLoadingComplete, filters?.dateRange?.from?.toISOString(), filters?.dateRange?.to?.toISOString(), JSON.stringify(filters?.dimensionFilters)]);

  const refetch = useCallback(async () => {
    await loadData();
  }, [loadData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    data,
    dimensions,
    isLoading,
    error,
    totalRows,
    filteredRows,
    refetch
  };
}
