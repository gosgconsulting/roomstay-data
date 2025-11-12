import { useMemo } from "react";
import { useDimensionData } from "./useDimensionData";
import { useDimensionGranularities } from "./useDimensionGranularities";
import { useDimensionOperations } from "./useDimensionOperations";
import { useDimensionFilters } from "./useDimensionFilters";

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
    handleAddDimension,
  } = useDimensionOperations({
    selectedDimensions,
    onDimensionsChange,
    reportId,
  });

  // Filter out date dimensions
  useDimensionFilters({
    dimensions,
    selectedDimensions,
    onDimensionsChange,
  });

  // Enhanced remove handler that also removes granularity
  const handleRemoveDimension = async (dimensionId: string) => {
    removeGranularity(dimensionId);
    await baseHandleRemoveDimension(dimensionId);
  };

  // Get available dimensions (not selected and not date type)
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

