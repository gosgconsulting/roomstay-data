import { useCallback } from "react";
import type { Dimension } from "@/lib/dimensionLoader";
import {
  saveDimensionsForReport,
  removeDimensionFromList,
  addDimensionToList,
} from "@/lib/dimensionOperations";

interface UseDimensionOperationsOptions {
  selectedDimensions: string[];
  onDimensionsChange: (dimensions: string[]) => void;
  reportId?: string;
}

/**
 * Hook for handling dimension add/remove operations
 */
export function useDimensionOperations({
  selectedDimensions,
  onDimensionsChange,
  reportId,
}: UseDimensionOperationsOptions) {
  // Handle removing a dimension
  const handleRemoveDimension = useCallback(async (dimensionId: string) => {
    const updated = removeDimensionFromList(dimensionId, selectedDimensions);
    onDimensionsChange(updated);
    
    // Save dimension changes per report
    if (reportId) {
      await saveDimensionsForReport(reportId, updated);
    }
  }, [selectedDimensions, onDimensionsChange, reportId]);

  // Handle adding a dimension
  const handleAddDimension = useCallback(async (dimensionId: string) => {
    const updated = addDimensionToList(dimensionId, selectedDimensions);
    if (updated !== selectedDimensions) {
      onDimensionsChange(updated);
      
      // Save dimension changes per report
      if (reportId) {
        await saveDimensionsForReport(reportId, updated);
      }
    }
  }, [selectedDimensions, onDimensionsChange, reportId]);

  return {
    handleRemoveDimension,
    handleAddDimension,
  };
}

