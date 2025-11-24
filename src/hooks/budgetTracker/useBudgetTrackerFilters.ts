import { useState, useCallback, useMemo } from "react";

export interface BudgetTrackerFilterState {
  selectedYear: number;
  breakdownByDimensions: string[];
  // NEW: support a third level
  thenByDimensions: string[];
}

interface UseBudgetTrackerFiltersOptions {
  reportId?: string;
  accountId?: string;
}

/**
 * Hook for managing Budget Tracker filter state independently from PerformanceTable
 */
export function useBudgetTrackerFilters({
  reportId,
  accountId,
}: UseBudgetTrackerFiltersOptions) {
  const currentYear = new Date().getFullYear();
  
  // Filter state
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [breakdownByDimensions, setBreakdownByDimensions] = useState<string[]>([]);
  // NEW: Then-by state
  const [thenByDimensions, setThenByDimensions] = useState<string[]>([]);

  // Create filter state object
  const filterState = useMemo((): BudgetTrackerFilterState => ({
    selectedYear,
    breakdownByDimensions,
    thenByDimensions,
  }), [selectedYear, breakdownByDimensions, thenByDimensions]);

  // Year change handler
  const handleYearChange = useCallback((year: number) => {
    console.log('[BUDGET-TRACKER] Year changed to:', year);
    setSelectedYear(year);
  }, []);

  // Breakdown dimension change handler
  const handleBreakdownDimensionChange = useCallback((dimensions: string[]) => {
    console.log('[BUDGET-TRACKER] Breakdown dimensions changed to:', dimensions);
    setBreakdownByDimensions(dimensions);
  }, []);

  // NEW: Then-by handler
  const handleThenByDimensionChange = useCallback((dimensions: string[]) => {
    console.log('[BUDGET-TRACKER] Then-by dimensions changed to:', dimensions);
    setThenByDimensions(dimensions);
  }, []);

  // Reset filters to defaults
  const resetFilters = useCallback(() => {
    console.log('[BUDGET-TRACKER] Resetting filters to defaults');
    setSelectedYear(currentYear);
    setBreakdownByDimensions([]);
    setThenByDimensions([]);
  }, [currentYear]);

  // Generate date range for the selected year (Jan 1 - Dec 31)
  const yearDateRange = useMemo(() => {
    const startDate = new Date(selectedYear, 0, 1); // January 1st
    const endDate = new Date(selectedYear, 11, 31, 23, 59, 59, 999); // December 31st
    
    return {
      from: startDate,
      to: endDate,
    };
  }, [selectedYear]);

  return {
    filterState,
    selectedYear,
    breakdownByDimensions,
    thenByDimensions,
    yearDateRange,
    handleYearChange,
    handleBreakdownDimensionChange,
    handleThenByDimensionChange,
    resetFilters,
  };
}