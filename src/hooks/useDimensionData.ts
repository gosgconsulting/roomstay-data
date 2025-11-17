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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("User not authenticated");
        return;
      }

      // Use centralized dimension loader (includes vlookup dimensions)
      const loadedDimensions = await loadDimensionsForUser(user.id, reportId);
      
      // Filter dimensions by filter_dimensions from report_views if reportId is provided
      let filteredDimensions = loadedDimensions;
      if (reportId) {
        console.log('[useDimensionData] Loading view settings for report:', reportId);
        const { data: viewSettings } = await supabase
          .from("report_views")
          .select("filter_dimensions")
          .eq("report_id", reportId)
          .eq("user_id", user.id)
          .eq("is_default", true)
          .maybeSingle();

        console.log('[useDimensionData] View filter_dimensions:', viewSettings?.filter_dimensions);

        if (viewSettings?.filter_dimensions && Array.isArray(viewSettings.filter_dimensions)) {
          const filterDimensionIds = new Set(viewSettings.filter_dimensions);
          filteredDimensions = loadedDimensions.filter(d => filterDimensionIds.has(d.id));
          console.log('[useDimensionData] Filtered dimensions:', filteredDimensions.length, 'of', loadedDimensions.length);
        }
      }
      
      setDimensions(filteredDimensions);

      // Check data availability if reportId is provided
      if (reportId && filteredDimensions.length > 0) {
        const dimensionIds = filteredDimensions.map(d => d.id);
        await checkDataAvailability(dimensionIds, reportId);
      }
    } catch (error) {
      console.error("[useDimensionData] Error loading dimensions:", error);
      setError(error instanceof Error ? error.message : "Failed to load dimensions");
      // Set empty dimensions to prevent UI errors
      setDimensions([]);
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