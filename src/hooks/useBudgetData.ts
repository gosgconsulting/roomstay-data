/**
 * Hook for calculating budget data
 */

import { useMemo } from 'react';
import {
  calculateBudgetData,
  calculateBudgetMonthlyData,
  type ViewBudget,
} from '@/lib/budgetCalculations';
import type { SlideReportPivotData } from '@/types/slideReports';
import type { RawDataRow } from '@/types/slideView';

/**
 * Hook for budget data (simple format: month, budget, actual)
 */
export function useBudgetData(
  pivotData: SlideReportPivotData | null,
  selectedViewId: string | null,
  viewBudgets: ViewBudget[],
  selectedYear: string
) {
  return useMemo(() => {
    return calculateBudgetData(pivotData, selectedViewId, viewBudgets, selectedYear);
  }, [pivotData, selectedViewId, viewBudgets, selectedYear]);
}

/**
 * Hook for budget monthly data (full structure with all fields)
 */
export function useBudgetMonthlyData(
  pivotData: SlideReportPivotData | null,
  selectedViewId: string | null,
  viewBudgets: ViewBudget[],
  selectedYear: string,
  hasFilters: boolean,
  getFilteredRowsForChannel: (channel: string) => RawDataRow[],
  filterValues?: Record<string, Record<string, string[]>>
) {
  return useMemo(() => {
    return calculateBudgetMonthlyData(
      pivotData,
      selectedViewId,
      viewBudgets,
      selectedYear,
      hasFilters,
      getFilteredRowsForChannel,
      filterValues
    );
  }, [
    pivotData,
    selectedViewId,
    viewBudgets,
    selectedYear,
    hasFilters,
    getFilteredRowsForChannel,
    filterValues,
  ]);
}
