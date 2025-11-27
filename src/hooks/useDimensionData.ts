import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadDimensionsForUser, type Dimension } from "@/lib/dimensionLoader";
import { checkDimensionsHaveData } from "@/lib/dimensionUtils";
import { useUser } from "@/lib/auth";

/**
 * Hook for loading dimensions and checking their data availability
 */
export function useDimensionData(reportId?: string) {
  const { data: userData } = useUser();
  const user = userData?.user || null;
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dimensionHasData, setDimensionHasData] = useState<Record<string, boolean>>({});

  // Check data availability for dimensions
  const checkDataAvailability = useCallback(async (dimensionIds: string[], reportId: string) => {
    try {
      const hasDataMap = await checkDimensionsHaveData(dimensionIds, reportId);
      setDimensionHasData(hasDataMap);
    } catch (error) {
      console.error('[useDimensionData] Error checking dimension data availability:', error);
      // Don't set error state here as this is not critical functionality
    }
  }, []);

  // Load dimensions using centralized loader
  const loadDimensions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      if (!user) {
        setError("User not authenticated");
        return;
      }

      // Use centralized dimension loader with data availability filtering
      const loadedDimensions = await loadDimensionsForUser(
        user.id, 
        reportId,
        {
          filterByDataAvailability: true,  // Filter to only dimensions with data
          alwaysIncludeDate: true,         // Always include date dimensions
          alwaysIncludeCalculated: true,   // Always include calculated/formula dimensions
          fallbackOnError: true            // Return all dimensions if filtering fails
        }
      );
      
      // Dimensions are now pre-filtered by data availability
      const filteredDimensions = loadedDimensions;

      setDimensions(filteredDimensions);

      // Check data availability if reportId is provided
      if (reportId && filteredDimensions.length > 0) {
        const dimensionIds = filteredDimensions.map(d => d.id);
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

  // Re-check data availability when reportId or dimensions change
  useEffect(() => {
    if (reportId && dimensions.length > 0) {
      const dimensionIds = dimensions.map(d => d.id);
      checkDataAvailability(dimensionIds, reportId);
    }
  }, [reportId, dimensions.length, checkDataAvailability]);

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