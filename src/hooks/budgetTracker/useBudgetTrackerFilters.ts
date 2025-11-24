import { useState, useCallback, useMemo } from "react";

export interface BudgetTrackerFilterState {
  selectedYear: number;
  breakdownByDimensions: string[];
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

  // Create filter state object
  const filterState = useMemo((): BudgetTrackerFilterState => ({
    selectedYear,
    breakdownByDimensions,
  }), [selectedYear, breakdownByDimensions]);

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

  // Reset filters to defaults
  const resetFilters = useCallback(() => {
    console.log('[BUDGET-TRACKER] Resetting filters to defaults');
    setSelectedYear(currentYear);
    setBreakdownByDimensions([]);
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
    yearDateRange,
    handleYearChange,
    handleBreakdownDimensionChange,
    resetFilters,
  };
}
