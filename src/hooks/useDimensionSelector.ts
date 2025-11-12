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
    await baseHandleAddDimension(dimensionId);
    // Reload dimensions to ensure newly created custom dimensions are available
    await loadDimensions();
  };

  // Enhanced remove handler that also removes granularity
  const handleRemoveDimension = async (dimensionId: string) => {
    removeGranularity(dimensionId);
    await baseHandleRemoveDimension(dimensionId);
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
    dimensionHasData,
    dimensionGranularities,
    availableDimensions,
    loadDimensions,
    handleRemoveDimension,
    handleAddDimension,
    handleGranularityChange,
  };
}

