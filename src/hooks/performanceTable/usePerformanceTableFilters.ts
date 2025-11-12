import { useMemo } from "react";
import type { FilterState } from "@/components/FiltersBar";
import type { Dimension } from "./usePerformanceTableDimensions";
import type { TableRow } from "./usePerformanceTableData";
import { calculateTotals, calculateComparisonTotalsAndChanges } from "@/lib/performanceTable/calculators";

interface UsePerformanceTableFiltersOptions {
  tableData: TableRow[];
  filters: FilterState;
  dimensions: Dimension[];
  groupByDimensions: string[];
  totalData: Record<string, any>;
}

/**
 * Hook for filtering table data and calculating filtered totals
 */
export function usePerformanceTableFilters({
  tableData,
  filters,
  dimensions,
  groupByDimensions,
  totalData,
}: UsePerformanceTableFiltersOptions) {
  // Apply column filters (text and numeric)
  const filteredTableData = useMemo(() => {
    if (!filters.dimensionFilters || Object.keys(filters.dimensionFilters).length === 0) {
      return tableData;
    }

    console.log('[testing] Applying filters:', filters.dimensionFilters);

    return tableData.filter((row) => {
      // Check each dimension filter
      for (const [dimId, filterValues] of Object.entries(filters.dimensionFilters)) {
        if (!filterValues || filterValues.length === 0) continue;

        const dimension = dimensions.find(d => d.id === dimId);
        if (!dimension) {
          console.log('[testing] Dimension not found for filter:', dimId);
          continue;
        }

        const isNumeric = dimension.type === 'number' || dimension.type === 'currency' || dimension.type === 'percentage';
        const isGroupDimension = groupByDimensions[0] === dimId;
        
        // Check each filter value
        let matchesAnyValue = false;
        for (const filterValue of filterValues) {
          if (isNumeric && (filterValue.startsWith('>') || filterValue.startsWith('<') || filterValue.startsWith('='))) {
            // Numeric comparison filter
            const operator = filterValue[0];
            const threshold = parseFloat(filterValue.substring(1));
            if (isNaN(threshold)) continue;

            const rowValue = row.data[dimension.name];
            const numRowValue = parseFloat(rowValue) || 0;

            let matches = false;
            if (operator === '>') {
              matches = numRowValue > threshold;
            } else if (operator === '<') {
              matches = numRowValue < threshold;
            } else if (operator === '=') {
              matches = Math.abs(numRowValue - threshold) < 0.01; // Allow small floating point differences
            }

            if (matches) {
              matchesAnyValue = true;
              break; // Found a match, no need to check other values
            }
          } else {
            // Text filter - check if row name (for group dimension) or dimension value matches
            const filterLower = filterValue.toLowerCase().trim();
            if (filterLower === '') continue;
            
            // For group dimension, check row name
            if (isGroupDimension) {
              const rowNameLower = row.name.toLowerCase();
              if (rowNameLower.includes(filterLower)) {
                matchesAnyValue = true;
                break; // Found a match
              }
            }
            
            // Check dimension value in row data
            const dimValue = row.data[dimension.name];
            if (dimValue !== undefined && dimValue !== null) {
              const dimValueStr = String(dimValue).toLowerCase();
              if (dimValueStr.includes(filterLower)) {
                matchesAnyValue = true;
                break; // Found a match
              }
            }
          }
        }

        // If no filter value matched, this row doesn't pass this filter
        if (!matchesAnyValue) {
          return false;
        }
      }

      return true; // All filters passed
    });
  }, [tableData, filters.dimensionFilters, dimensions, groupByDimensions]);

  // Calculate totals from filtered data
  const totals = useMemo(() => {
    return calculateTotals(filteredTableData, dimensions, totalData);
  }, [filteredTableData, dimensions, totalData]);

  // Calculate comparison totals and change percentages from filtered data
  const { compareTotals, changeData } = useMemo(() => {
    return calculateComparisonTotalsAndChanges(
      filteredTableData,
      dimensions,
      totals,
      filters.compareEnabled || false
    );
  }, [filteredTableData, dimensions, totals, filters.compareEnabled]);

  return {
    filteredTableData,
    totals,
    compareTotals,
    changeData,
  };
}

