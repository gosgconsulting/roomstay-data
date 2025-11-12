import { useEffect } from "react";
import type { Dimension } from "@/lib/dimensionLoader";
import { filterOutDateDimensions } from "@/lib/dimensionOperations";

interface UseDimensionFiltersOptions {
  dimensions: Dimension[];
  selectedDimensions: string[];
  onDimensionsChange: (dimensions: string[]) => void;
}

/**
 * Hook for filtering dimensions (e.g., removing date dimensions)
 */
export function useDimensionFilters({
  dimensions,
  selectedDimensions,
  onDimensionsChange,
}: UseDimensionFiltersOptions) {
  // Remove date dimensions from selected dimensions (handled by date range picker)
  useEffect(() => {
    if (dimensions.length > 0 && selectedDimensions.length > 0) {
      const dateDimensions = dimensions.filter(d => d.type === 'date').map(d => d.id);
      const hasDateDimensions = selectedDimensions.some(id => dateDimensions.includes(id));
      
      if (hasDateDimensions) {
        const filteredDimensions = filterOutDateDimensions(selectedDimensions, dateDimensions);
        console.log('[DIMENSION-SELECTOR] Removing date dimensions from filter dimensions:', dateDimensions);
        onDimensionsChange(filteredDimensions);
      }
    }
  }, [dimensions, selectedDimensions, onDimensionsChange]);
}

