import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadDimensionsForUser, type Dimension } from "@/lib/dimensionLoader";
import { checkDimensionsHaveData } from "@/lib/dimensionUtils";

/**
 * Hook for loading dimensions and checking their data availability
 */
export function useDimensionData(reportId?: string) {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dimensionHasData, setDimensionHasData] = useState<Record<string, boolean>>({});

  // Check data availability for dimensions
  const checkDataAvailability = useCallback(async (dimensionIds: string[], reportId: string) => {
    try {
      const hasDataMap = await checkDimensionsHaveData(dimensionIds, reportId);
      setDimensionHasData(hasDataMap);
    } catch (error) {
      console.error('[testing] Error checking dimension data availability:', error);
    }
  }, []);

  // Load dimensions using centralized loader
  const loadDimensions = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Use centralized dimension loader (includes vlookup dimensions)
      const loadedDimensions = await loadDimensionsForUser(user.id, reportId);
      setDimensions(loadedDimensions);

      // Check data availability if reportId is provided
      if (reportId && loadedDimensions.length > 0) {
        const dimensionIds = loadedDimensions.map(d => d.id);
        await checkDataAvailability(dimensionIds, reportId);
      }
    } catch (error) {
      console.error("Error loading dimensions:", error);
    } finally {
      setIsLoading(false);
    }
  }, [reportId, checkDataAvailability]);

  // Re-check data availability when reportId or dimensions change
  useEffect(() => {
    if (reportId && dimensions.length > 0) {
      const dimensionIds = dimensions.map(d => d.id);
      checkDataAvailability(dimensionIds, reportId);
    }
  }, [reportId, dimensions.length, checkDataAvailability]);

  return {
    dimensions,
    isLoading,
    dimensionHasData,
    loadDimensions,
  };
}