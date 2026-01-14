/**
 * Custom hook for filtering and processing monthly data in SlideViewPage
 */

import { useMemo } from 'react';
import { MONTH_NAMES } from '@/constants/slideViewConstants';
import { filterRawDataRows, hasActiveFilters } from '@/lib/slideViewHelpers';
import type { SlideReportPivotData } from '@/types/slideReports';
import type { MonthlyDataPoint } from '@/types/slideView';

interface UseMonthlyDataFilteringOptions {
  pivotData: SlideReportPivotData | null | undefined;
  slideType: 'master-report' | 'brady' | 'default';
  dynamicMonthlyData: MonthlyDataPoint[];
  selectedYear: string;
  filterValues: Record<string, Record<string, string[]>>;
  filterDimensionValues: Record<string, Record<string, string[]>>;
}

/**
 * Hook for filtering monthly data based on selected filters and year
 */
export function useMonthlyDataFiltering({
  pivotData,
  slideType,
  dynamicMonthlyData,
  selectedYear,
  filterValues,
  filterDimensionValues,
}: UseMonthlyDataFilteringOptions) {
  const filteredMonthlyData = useMemo(() => {
    // Check if any filters are actually applied (not "All" selected)
    const hasFilters = Object.entries(filterValues).some(
      ([channel, channelFilters]) => {
        return Object.entries(channelFilters).some(
          ([dimensionId, selectedValues]) => {
            if (!selectedValues || selectedValues.length === 0) {
              return false; // Empty = "All" selected = no filter
            }
            // Check if all available values are selected (also means "All" = no filter)
            const availableValues =
              filterDimensionValues[channel]?.[dimensionId] || [];
            if (
              availableValues.length > 0 &&
              selectedValues.length === availableValues.length
            ) {
              // Check if they're the same set
              const selectedSet = new Set(selectedValues);
              const availableSet = new Set(availableValues);
              if (
                selectedSet.size === availableSet.size &&
                [...selectedSet].every((v) => availableSet.has(v))
              ) {
                return false; // All values selected = "All" = no filter
              }
            }
            return true; // Subset selected = filter is applied
          }
        );
      }
    );

    // If filters are applied, filter rawDataRows and aggregate by month
    if (hasFilters && pivotData?.channels) {
      const monthlyMap = new Map<
        string,
        { year: number; month: string; metasearch: number; sem: number; social: number }
      >();

      // Aggregate from filtered rawDataRows for each channel
      for (const [channel, channelData] of Object.entries(pivotData.channels)) {
        const channelFilterValues = filterValues[channel] || {};
        const rawDataRows = (channelData as any).rawDataRows || [];

        // Filter rows based on filterValues (no date filter here - we want all months)
        const filteredRows = filterRawDataRows(
          rawDataRows,
          channelFilterValues
        );

        // Group by month and aggregate revenue
        filteredRows.forEach((row) => {
          const rowData = row.dimension_values || row;

          // Find date value
          let dateValue: unknown =
            (rowData as Record<string, unknown>).Date ||
            (rowData as Record<string, unknown>).date ||
            (rowData as Record<string, unknown>).Day ||
            (rowData as Record<string, unknown>).day;

          if (!dateValue) {
            for (const [key, val] of Object.entries(rowData)) {
              if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) {
                dateValue = val;
                break;
              }
            }
          }

          if (dateValue) {
            const rowDate = new Date(dateValue as string);
            if (!isNaN(rowDate.getTime())) {
              const year = rowDate.getFullYear();
              const month = MONTH_NAMES[rowDate.getMonth()];
              const key = `${year}-${month}`;

              if (!monthlyMap.has(key)) {
                monthlyMap.set(key, {
                  year,
                  month,
                  metasearch: 0,
                  sem: 0,
                  social: 0,
                });
              }

              const entry = monthlyMap.get(key)!;
              const revenue = parseFloat(
                String(
                  (rowData as Record<string, unknown>).Revenue ||
                    (rowData as Record<string, unknown>).revenue ||
                    0
                ).replace(/[^0-9.-]/g, '')
              );
              if (!isNaN(revenue)) {
                entry[channel as 'metasearch' | 'sem' | 'social'] += revenue;
              }
            }
          }
        });
      }

      const result = Array.from(monthlyMap.values()).sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return MONTH_NAMES.indexOf(a.month) - MONTH_NAMES.indexOf(b.month);
      });

      // Filter by selectedYear if needed
      if (selectedYear !== 'all') {
        return result.filter((m) => m.year === parseInt(selectedYear));
      }
      return result;
    }

    // No filters applied - use pre-computed monthly data
    // Build from pivot_data if available
    if (pivotData?.channels) {
      const monthlyMap = new Map<
        string,
        { year: number; month: string; metasearch: number; sem: number; social: number }
      >();

      // Collect all months from all channels
      Object.entries(pivotData.channels).forEach(([channel, channelData]) => {
        if (channelData.monthly) {
          Object.entries(channelData.monthly).forEach(([monthKey, metrics]) => {
            const [year, monthNum] = monthKey.split('-').map(Number);
            const month = MONTH_NAMES[monthNum - 1];
            const key = `${year}-${month}`;

            if (!monthlyMap.has(key)) {
              monthlyMap.set(key, {
                year,
                month,
                metasearch: 0,
                sem: 0,
                social: 0,
              });
            }

            const entry = monthlyMap.get(key)!;
            entry[channel as 'metasearch' | 'sem' | 'social'] =
              metrics.revenue || 0;
          });
        }
      });

      const result = Array.from(monthlyMap.values()).sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return MONTH_NAMES.indexOf(a.month) - MONTH_NAMES.indexOf(b.month);
      });

      // Filter by selectedYear if needed
      if (selectedYear !== 'all') {
        return result.filter((m) => m.year === parseInt(selectedYear));
      }
      return result;
    }

    // Fallback to dynamicMonthlyData or empty array
    const sourceData =
      slideType === 'master-report' && dynamicMonthlyData.length > 0
        ? dynamicMonthlyData
        : [];

    if (selectedYear === 'all') {
      return sourceData;
    }
    return sourceData.filter((m) => m.year === parseInt(selectedYear));
  }, [
    pivotData,
    slideType,
    dynamicMonthlyData,
    selectedYear,
    filterValues,
    filterDimensionValues,
  ]);

  return {
    filteredMonthlyData,
  };
}
