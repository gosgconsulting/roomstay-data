import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadDimensionsForUser, type Dimension } from "@/lib/dimensionLoader";
import { checkDimensionsHaveData } from "@/lib/dimensionUtils";
import { useUser } from "@/lib/auth";
import { useSourceData } from "@/hooks/dataSources";
import type { DataSource } from "@/lib/data-sources/types";

/**
 * Hook for loading dimensions and checking their data availability
 */
export function useDimensionData(reportId?: string, accountId?: string) {
  const { data: userData } = useUser();
  const user = userData?.user || null;
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dimensionHasData, setDimensionHasData] = useState<Record<string, boolean>>({});
  const [dataSource, setDataSource] = useState<DataSource | null>(null);

  // Fetch data source for the report
  useEffect(() => {
    const fetchDataSource = async () => {
      if (!reportId) {
        setDataSource(null);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('data_sources')
          .select('*')
          .eq('report_id', reportId)
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error('[useDimensionData] Error fetching data source:', error);
          return;
        }

        if (data) {
          setDataSource({
            ...data,
            column_mappings: (data.column_mappings as any) || null,
          } as DataSource);
        }
      } catch (error) {
        console.error('[useDimensionData] Error fetching data source:', error);
      }
    };

    fetchDataSource();
  }, [reportId]);

  // Use source data hook to get actual source data
  const { data: sourceData } = useSourceData(
    dataSource,
    accountId,
    { enabled: !!dataSource && !!reportId }
  );

  // Check data availability for dimensions using source data
  const checkDataAvailability = useCallback(async (dimensionIds: string[], reportId: string) => {
    try {
      // Pass source data if available, otherwise it will fetch from source
      const hasDataMap = await checkDimensionsHaveData(
        dimensionIds, 
        reportId,
        sourceData ? { transformedRows: sourceData.transformedRows } : undefined
      );
      setDimensionHasData(hasDataMap);
    } catch (error) {
      console.error('[useDimensionData] Error checking dimension data availability:', error);
      // Don't set error state here as this is not critical functionality
    }
  }, [sourceData]);

  // Load dimensions using centralized loader
  const loadDimensions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!user) {
        setError("User not authenticated");
        return;
      }

      // Load ALL dimensions without filtering by data availability
      // Per user memory: all text and date dimensions should be displayed
      // regardless of whether they currently contain data
      const loadedDimensions = await loadDimensionsForUser(
        user.id, 
        reportId,
        {
          filterByDataAvailability: false,  // Don't filter - show ALL dimensions
          alwaysIncludeDate: true,          // Always include date dimensions
          alwaysIncludeCalculated: true,    // Always include calculated/formula dimensions
          fallbackOnError: true             // Return all dimensions if filtering fails
        }
      );
      
      console.log('[useDimensionData] Loaded dimensions:', loadedDimensions.length, loadedDimensions.map(d => d.name));

      setDimensions(loadedDimensions);

      // Check data availability if reportId is provided (for UI hints, not filtering)
      if (reportId && loadedDimensions.length > 0) {
        const dimensionIds = loadedDimensions.map(d => d.id);
        await checkDataAvailability(dimensionIds, reportId);
      }
    } catch (error) {
      console.error("[useDimensionData] Error loading dimensions:", error);
      setError(error instanceof Error ? error.message : "Failed to load dimensions");
      setDimensions([]);
    } finally {
      setIsLoading(false);
    }
  }, [reportId, checkDataAvailability, user]);

  // Re-check data availability when reportId, dimensions, or sourceData change
  useEffect(() => {
    if (reportId && dimensions.length > 0 && sourceData) {
      const dimensionIds = dimensions.map(d => d.id);
      checkDataAvailability(dimensionIds, reportId);
    }
  }, [reportId, dimensions.length, sourceData, checkDataAvailability]);

  // Initial load
  useEffect(() => {
    loadDimensions();
  }, [loadDimensions]);

  return {
    dimensions,
    isLoading,
    error,
    dimensionHasData,
    loadDimensions,
  };
}