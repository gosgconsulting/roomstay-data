import { useState, useCallback } from "react";
import { useDimensionData } from "./useDimensionData";

interface UseDimensionSelectorProps {
  reportId?: string;
  accountId?: string;
}

export function useDimensionSelector({ reportId, accountId }: UseDimensionSelectorProps = {}) {
  const [selectedDimensions, setSelectedDimensions] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const {
    dimensions,
    isLoading: isDimensionsLoading,
    error,
    dimensionHasData,
    loadDimensions,
  } = useDimensionData({ reportId });

  const handleDimensionToggle = useCallback((dimensionId: string) => {
    setSelectedDimensions(prev => 
      prev.includes(dimensionId)
        ? prev.filter(id => id !== dimensionId)
        : [...prev, dimensionId]
    );
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedDimensions(dimensions.map(d => d.id));
  }, [dimensions]);

  const handleDeselectAll = useCallback(() => {
    setSelectedDimensions([]);
  }, []);

  return {
    dimensions,
    selectedDimensions,
    isLoading: isDimensionsLoading || isLoading,
    error,
    dimensionHasData,
    loadDimensions,
    handleDimensionToggle,
    handleSelectAll,
    handleDeselectAll,
    setSelectedDimensions,
  };
}