import { useMemo } from "react";
import { useDimensionData } from "./useDimensionData";
import { useDimensionGranularities } from "./useDimensionGranularities";
import { useDimensionOperations } from "./useDimensionOperations";

interface UseDimensionSelectorOptions {
  selectedDimensions: string[];
  onDimensionsChange: (dimensions: string[]) => void;
  reportId?: string;
  currentDateGranularity?: string;
  onDateGranularityChange?: (granularity: string) => void;
}

/**
 * Main hook for dimension selector functionality
 * Composes smaller hooks for data loading, granularities, operations, and filtering
 */
export function useDimensionSelector({
  selectedDimensions,
  onDimensionsChange,
  reportId,
  currentDateGranularity = 'day',
  onDateGranularityChange,
}: UseDimensionSelectorOptions) {
  // Load dimensions and check data availability
  const {
    dimensions,
    isLoading,
    error,
    dimensionHasData,
    loadDimensions,
  } = useDimensionData(reportId);

  // Manage granularities for date dimensions
  const {
    dimensionGranularities,
    handleGranularityChange,
    removeGranularity,
  } = useDimensionGranularities({
    selectedDimensions,
    dimensions,
    currentDateGranularity,
    onDateGranularityChange,
  });

  // Handle add/remove operations
  const {
    handleRemoveDimension: baseHandleRemoveDimension,
    handleAddDimension: baseHandleAddDimension,
  } = useDimensionOperations({
    selectedDimensions,
    onDimensionsChange,
    reportId,
  });

  // Enhanced add handler that reloads dimensions to pick up newly created custom dimensions
  const handleAddDimension = async (dimensionId: string) => {
    try {
      await baseHandleAddDimension(dimensionId);
      // Small delay to ensure state has propagated
      await new Promise(resolve => setTimeout(resolve, 100));
      // Reload dimensions to ensure newly created custom dimensions are available
      await loadDimensions();
    } catch (error) {
      console.error('[useDimensionSelector] Error adding dimension:', error);
      throw error;
    }
  };

  // Enhanced remove handler that also removes granularity
  const handleRemoveDimension = async (dimensionId: string) => {
    try {
      removeGranularity(dimensionId);
      await baseHandleRemoveDimension(dimensionId);
      // Small delay to ensure state has propagated
      await new Promise(resolve => setTimeout(resolve, 100));
      // Reload dimensions to refresh the list
      await loadDimensions();
    } catch (error) {
      console.error('[useDimensionSelector] Error removing dimension:', error);
      throw error;
    }
  };

  // Get available dimensions (not already selected)
  const availableDimensions = useMemo(
    () => dimensions.filter(
      (d) => !selectedDimensions.includes(d.id),
    ),
    [dimensions, selectedDimensions]
  );

  return {
    dimensions,
    isLoading,
    error,
    dimensionHasData,
    dimensionGranularities,
    availableDimensions,
    loadDimensions,
    handleRemoveDimension,
    handleAddDimension,
    handleGranularityChange,
  };
}