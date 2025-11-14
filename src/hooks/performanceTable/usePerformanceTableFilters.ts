import { useMemo } from "react";
import type { FilterState } from "@/components/FiltersBar";
import type { Dimension } from "./usePerformanceTableDimensions";
import type { TableRow } from "./usePerformanceTableData";
import { calculateTotals, calculateComparisonTotalsAndChanges } from "@/lib/performanceTable/calculators";
import { useVlookupMappings } from "@/hooks/useVlookupMappings";

interface UsePerformanceTableFiltersOptions {
  tableData: TableRow[];
  filters: FilterState;
  dimensions: Dimension[];
  groupByDimensions: string[];
  totalData: Record<string, any>;
  reportId?: string;
  accountId?: string;
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
  reportId,
  accountId,
}: UsePerformanceTableFiltersOptions) {
  // Load vlookup mappings
  const { data: vlookupMappings = [] } = useVlookupMappings(reportId, accountId);
  
  // First, filter the data based on dimension filters
  const filteredData = useMemo(() => {
    if (!filters.dimensionFilters || Object.keys(filters.dimensionFilters).length === 0) {
      return tableData;
    }

    console.log('[PERF-FILTERS] Applying filters:', filters.dimensionFilters);

    return tableData.filter((row) => {
      // Check each dimension filter
      for (const [dimId, filterValues] of Object.entries(filters.dimensionFilters)) {
        if (!filterValues || filterValues.length === 0) continue;

        const dimension = dimensions.find(d => d.id === dimId);
        if (!dimension) {
          console.log('[PERF-FILTERS] Dimension not found for filter:', dimId);
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
              
              // Direct match
              if (dimValueStr.includes(filterLower)) {
                matchesAnyValue = true;
                break;
              }
              
              // Check if dimValue maps TO the filterValue via vlookup
              const sourceMappings = vlookupMappings.filter(
                m => m.targetDimensionId === dimId && 
                     m.targetValue.toLowerCase() === filterLower
              );
              
              for (const mapping of sourceMappings) {
                if (dimValueStr.includes(mapping.sourceValue.toLowerCase())) {
                  matchesAnyValue = true;
                  break;
                }
              }
              
              if (matchesAnyValue) break;
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
  }, [tableData, filters.dimensionFilters, dimensions, groupByDimensions, vlookupMappings]);

  // Then, transform the filtered data into a hierarchical structure for the pivot table
  const filteredTableData = useMemo(() => {
    if (!filteredData.length || !groupByDimensions.length) {
      return [];
    }

    console.log('[PERF-FILTERS] Creating hierarchical data with dimensions:', groupByDimensions);

    // Get dimension objects for the group by dimensions
    const groupDimensions = groupByDimensions
      .map(id => dimensions.find(d => d.id === id))
      .filter(Boolean) as Dimension[];

    if (groupDimensions.length === 0) {
      console.warn('[PERF-FILTERS] No valid group dimensions found');
      return filteredData;
    }

    // Create a hierarchical structure based on the group by dimensions
    const hierarchicalData: TableRow[] = [];
    const groupMap: Record<string, TableRow> = {};
    const level1Map: Record<string, TableRow> = {};
    const level2Map: Record<string, TableRow> = {};

    // First level grouping
    const firstDimension = groupDimensions[0];
    
    filteredData.forEach(row => {
      const firstLevelValue = row.data[firstDimension.name];
      if (firstLevelValue === undefined || firstLevelValue === null) return; // Skip rows without the first dimension value
      
      const firstLevelKey = `${firstDimension.id}-${firstLevelValue}`;
      
      // Create or update first level group
      if (!groupMap[firstLevelKey]) {
        const newGroup: TableRow = {
          id: firstLevelKey,
          name: String(firstLevelValue),
          level: 0,
          data: { ...row.data },
          children: [],
        };
        groupMap[firstLevelKey] = newGroup;
        hierarchicalData.push(newGroup);
      } else {
        // Aggregate numeric values
        Object.keys(row.data).forEach(key => {
          const dim = dimensions.find(d => d.name === key);
          if (dim && (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage')) {
            const existingValue = parseFloat(String(groupMap[firstLevelKey].data[key] || '0'));
            const newValue = parseFloat(String(row.data[key] || '0'));
            if (!isNaN(newValue)) {
              groupMap[firstLevelKey].data[key] = existingValue + newValue;
            }
          }
        });
      }
      
      // Second level grouping (if available)
      if (groupDimensions.length > 1) {
        const secondDimension = groupDimensions[1];
        const secondLevelValue = row.data[secondDimension.name];
        
        if (secondLevelValue !== undefined && secondLevelValue !== null) {
          const secondLevelKey = `${firstLevelKey}-${secondDimension.id}-${secondLevelValue}`;
          
          if (!level1Map[secondLevelKey]) {
            const newSubGroup: TableRow = {
              id: secondLevelKey,
              name: String(secondLevelValue),
              level: 1,
              parentId: firstLevelKey,
              data: { ...row.data },
              children: [],
            };
            level1Map[secondLevelKey] = newSubGroup;
            groupMap[firstLevelKey].children = groupMap[firstLevelKey].children || [];
            groupMap[firstLevelKey].children.push(newSubGroup);
          } else {
            // Aggregate numeric values
            Object.keys(row.data).forEach(key => {
              const dim = dimensions.find(d => d.name === key);
              if (dim && (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage')) {
                const existingValue = parseFloat(String(level1Map[secondLevelKey].data[key] || '0'));
                const newValue = parseFloat(String(row.data[key] || '0'));
                if (!isNaN(newValue)) {
                  level1Map[secondLevelKey].data[key] = existingValue + newValue;
                }
              }
            });
          }
          
          // Third level grouping (if available)
          if (groupDimensions.length > 2) {
            const thirdDimension = groupDimensions[2];
            const thirdLevelValue = row.data[thirdDimension.name];
            
            if (thirdLevelValue !== undefined && thirdLevelValue !== null) {
              const thirdLevelKey = `${secondLevelKey}-${thirdDimension.id}-${thirdLevelValue}`;
              
              if (!level2Map[thirdLevelKey]) {
                const newSubSubGroup: TableRow = {
                  id: thirdLevelKey,
                  name: String(thirdLevelValue),
                  level: 2,
                  parentId: secondLevelKey,
                  data: { ...row.data },
                };
                level2Map[thirdLevelKey] = newSubSubGroup;
                level1Map[secondLevelKey].children = level1Map[secondLevelKey].children || [];
                level1Map[secondLevelKey].children.push(newSubSubGroup);
              } else {
                // Aggregate numeric values
                Object.keys(row.data).forEach(key => {
                  const dim = dimensions.find(d => d.name === key);
                  if (dim && (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage')) {
                    const existingValue = parseFloat(String(level2Map[thirdLevelKey].data[key] || '0'));
                    const newValue = parseFloat(String(row.data[key] || '0'));
                    if (!isNaN(newValue)) {
                      level2Map[thirdLevelKey].data[key] = existingValue + newValue;
                    }
                  }
                });
              }
            }
          }
        }
      }
    });

    console.log('[PERF-FILTERS] Created hierarchical data with', hierarchicalData.length, 'top-level groups');
    return hierarchicalData;
  }, [filteredData, groupByDimensions, dimensions]);

  // Calculate totals from filtered data
  const totals = useMemo(() => {
    return calculateTotals(filteredTableData, dimensions, totalData);
  }, [filteredTableData, dimensions, totalData]);

  // Calculate comparison totals and change percentages
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