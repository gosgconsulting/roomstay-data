import { useState, useEffect, useCallback } from "react";
import type { Dimension } from "@/lib/dimensionLoader";

interface UseDimensionGranularitiesOptions {
  selectedDimensions: string[];
  dimensions: Dimension[];
  currentDateGranularity: string;
  onDateGranularityChange?: (granularity: string) => void;
}

/**
 * Hook for managing dimension granularities (for date dimensions)
 */
export function useDimensionGranularities({
  selectedDimensions,
  dimensions,
  currentDateGranularity,
  onDateGranularityChange,
}: UseDimensionGranularitiesOptions) {
  const [dimensionGranularities, setDimensionGranularities] = useState<Record<string, string>>({});

  // Initialize granularities for date dimensions
  useEffect(() => {
    const granularities: Record<string, string> = {};
    selectedDimensions.forEach(dim => {
      const dimension = dimensions.find(d => d.id === dim);
      if (dimension?.type === 'date') {
        const capitalizedGranularity = currentDateGranularity.charAt(0).toUpperCase() + currentDateGranularity.slice(1);
        granularities[dim] = capitalizedGranularity;
      }
    });
    setDimensionGranularities(granularities);
  }, [selectedDimensions, dimensions, currentDateGranularity]);

  // Handle granularity change
  const handleGranularityChange = useCallback((dimensionId: string, granularity: string) => {
    setDimensionGranularities(prev => ({
      ...prev,
      [dimensionId]: granularity
    }));
    
    // Notify parent component if this is a date dimension
    const dimension = dimensions.find(d => d.id === dimensionId);
    if (dimension?.type === 'date' && onDateGranularityChange) {
      onDateGranularityChange(granularity.toLowerCase());
    }
  }, [dimensions, onDateGranularityChange]);

  // Remove granularity for a dimension
  const removeGranularity = useCallback((dimensionId: string) => {
    setDimensionGranularities(prev => {
      const newGranularities = { ...prev };
      delete newGranularities[dimensionId];
      return newGranularities;
    });
  }, []);

  return {
    dimensionGranularities,
    handleGranularityChange,
    removeGranularity,
  };
}

