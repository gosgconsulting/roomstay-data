import { useMemo } from "react";
import type { FilterState } from "@/components/FiltersBar";
import type { Dimension } from "./usePerformanceTableDimensions";
import type { TableRow } from "./usePerformanceTableData";
import { calculateTotals, calculateComparisonTotalsAndChanges } from "@/lib/performanceTable/calculators";
import { useVlookupMappings } from "@/hooks/useVlookupMappings";
import { format, parse, isValid } from "date-fns";

interface UsePerformanceTableFiltersOptions {
  tableData: TableRow[];
  filters: FilterState;
  dimensions: Dimension[];
  groupByDimensions: string[];
  totalData: Record<string, any>;
  reportId?: string;
  accountId?: string;
  activeDateTab?: 'day' | 'week' | 'month' | 'year';
  dateOrder?: 'asc' | 'desc';
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
  activeDateTab = 'day',
  dateOrder = 'desc',
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

    // Helper function to aggregate dates by granularity (matching edge function logic)
    const aggregateDateByGranularity = (dateStr: string | number | Date): string => {
      if (!dateStr) return String(dateStr);
      
      try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return String(dateStr);
        
        switch (activeDateTab) {
          case 'year':
            return `${date.getFullYear()}-01-01`;
          case 'month':
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
          case 'week': {
            // Get ISO week start (Monday)
            const day = date.getDay();
            const diff = date.getDate() - day + (day === 0 ? -6 : 1);
            const weekStart = new Date(date);
            weekStart.setDate(diff);
            return `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
          }
          case 'day':
          default:
            return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        }
      } catch (e) {
        console.error('[DATE-AGGREGATION] Error aggregating date:', e);
        return String(dateStr);
      }
    };

    // Pre-process data to aggregate dates if first dimension is a date
    const firstDimension = groupDimensions[0];
    const isFirstDimDate = firstDimension.type === 'date';
    
    let processedData = filteredData;
    if (isFirstDimDate && activeDateTab !== 'day') {
      // Aggregate rows with same week/month/year + same breakdown combinations
      const aggregationMap = new Map<string, TableRow>();
      
      filteredData.forEach(row => {
        const dateValue = row.data[firstDimension.name];
        const aggregatedDate = aggregateDateByGranularity(dateValue);
        
        // Create key from aggregated date + all other dimension values for grouping
        const otherDimValues = groupDimensions.slice(1).map(dim => row.data[dim.name] || '').join('|');
        const aggregationKey = `${aggregatedDate}|${otherDimValues}`;
        
        if (!aggregationMap.has(aggregationKey)) {
          // Create new aggregated row
          const newRow: TableRow = {
            ...row,
            id: `agg-${aggregationKey}`,
            name: aggregatedDate,
            data: {
              ...row.data,
              [firstDimension.name]: aggregatedDate
            },
            originalDate: aggregatedDate
          };
          aggregationMap.set(aggregationKey, newRow);
        } else {
          // Aggregate numeric values into existing row
          const existingRow = aggregationMap.get(aggregationKey)!;
          Object.keys(row.data).forEach(key => {
            const dim = dimensions.find(d => d.name === key);
            if (dim && (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage')) {
              const existingValue = parseFloat(String(existingRow.data[key] || '0'));
              const newValue = parseFloat(String(row.data[key] || '0'));
              if (!isNaN(newValue)) {
                existingRow.data[key] = existingValue + newValue;
              }
            }
          });
        }
      });
      
      processedData = Array.from(aggregationMap.values());
      console.log(`[PERF-FILTERS] Aggregated ${filteredData.length} rows into ${processedData.length} ${activeDateTab} groups`);
    }

    // Create a hierarchical structure based on the group by dimensions
    const hierarchicalData: TableRow[] = [];
    const groupMap: Record<string, TableRow> = {};
    const level1Map: Record<string, TableRow> = {};
    const level2Map: Record<string, TableRow> = {};
    
    // Process each row and group by dimensions
    processedData.forEach(row => {
      const firstLevelValue = row.data[firstDimension.name];
      if (firstLevelValue === undefined || firstLevelValue === null) return; // Skip rows without the first dimension value
      
      // Create a unique key for this group
      const firstLevelKey = `${firstDimension.id}-${firstLevelValue}`;
      
      // Create or update first level group
      if (!groupMap[firstLevelKey]) {
        const newGroup: TableRow = {
          id: firstLevelKey,
          name: String(firstLevelValue),
          level: 0,
          data: { ...row.data },
          children: [],
          // Store original date value for sorting
          originalDate: isFirstDimDate ? firstLevelValue : undefined
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
        const isSecondDimDate = secondDimension.type === 'date';
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
              // Store original date value for sorting
              originalDate: isSecondDimDate ? secondLevelValue : undefined
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
            const isThirdDimDate = thirdDimension.type === 'date';
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
                  // Store original date value for sorting
                  originalDate: isThirdDimDate ? thirdLevelValue : undefined
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

    // Sort the hierarchical data by date if the first dimension is a date
    if (isFirstDimDate) {
      // Sort top level rows
      hierarchicalData.sort((a, b) => {
        const dateA = a.originalDate ? new Date(a.originalDate) : new Date(0);
        const dateB = b.originalDate ? new Date(b.originalDate) : new Date(0);
        
        if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
          // If either date is invalid, fall back to string comparison
          return dateOrder === 'desc' 
            ? String(b.name).localeCompare(String(a.name))
            : String(a.name).localeCompare(String(b.name));
        }
        
        return dateOrder === 'desc' ? dateB.getTime() - dateA.getTime() : dateA.getTime() - dateB.getTime();
      });
      
      // Sort children at each level
      hierarchicalData.forEach(row => {
        if (row.children && row.children.length > 0) {
          const isChildDate = groupDimensions[1]?.type === 'date';
          
          if (isChildDate) {
            row.children.sort((a, b) => {
              const dateA = a.originalDate ? new Date(a.originalDate) : new Date(0);
              const dateB = b.originalDate ? new Date(b.originalDate) : new Date(0);
              
              if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
                return dateOrder === 'desc' 
                  ? String(b.name).localeCompare(String(a.name))
                  : String(a.name).localeCompare(String(b.name));
              }
              
              return dateOrder === 'desc' ? dateB.getTime() - dateA.getTime() : dateA.getTime() - dateB.getTime();
            });
          }
          
          // Sort grandchildren
          row.children.forEach(childRow => {
            if (childRow.children && childRow.children.length > 0) {
              const isGrandchildDate = groupDimensions[2]?.type === 'date';
              
              if (isGrandchildDate) {
                childRow.children.sort((a, b) => {
                  const dateA = a.originalDate ? new Date(a.originalDate) : new Date(0);
                  const dateB = b.originalDate ? new Date(b.originalDate) : new Date(0);
                  
                  if (isNaN(dateA.getTime()) || isNaN(dateB.getTime())) {
                    return dateOrder === 'desc' 
                      ? String(b.name).localeCompare(String(a.name))
                      : String(a.name).localeCompare(String(b.name));
                  }
                  
                  return dateOrder === 'desc' ? dateB.getTime() - dateA.getTime() : dateA.getTime() - dateB.getTime();
                });
              }
            }
          });
        }
      });
    }

    // NEW: Compute formula values for each row based on aggregated numeric data
    const dimensionNamesSorted = dimensions.map(d => d.name).sort((a, b) => b.length - a.length);

    const computeFormulasForRow = (row: TableRow) => {
      dimensions.forEach(dim => {
        if (dim.formula) {
          try {
            // Prepare expression
            let expression = dim.formula;

            // Convert percentage notation (e.g., "15%" to "0.15")
            expression = expression.replace(/(\d+(?:\.\d+)?)%/g, (match, num) => {
              return String(parseFloat(num) / 100);
            });

            // Replace dimension names with row values (fallback to 0)
            dimensionNamesSorted.forEach(dimName => {
              const rawValue = row.data ? row.data[dimName] : 0;
              const numValue = rawValue === undefined || rawValue === null
                ? 0
                : parseFloat(String(rawValue));
              const safeValue = isNaN(numValue) ? 0 : numValue;

              const escapedName = dimName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              const regex = new RegExp(`\\b${escapedName}\\b`, 'g');
              expression = expression.replace(regex, `(${safeValue})`);
            });

            // Evaluate formula
            // eslint-disable-next-line no-eval
            const result = eval(expression);
            row.data[dim.name] = typeof result === 'number' && isFinite(result) ? result : 0;
          } catch (error) {
            // On any error, default to 0 for display stability
            row.data[dim.name] = 0;
          }
        }
      });

      // Recurse into children
      if (row.children && row.children.length > 0) {
        row.children.forEach(child => computeFormulasForRow(child));
      }
    };

    // Apply formula computation to the full hierarchy
    hierarchicalData.forEach(r => computeFormulasForRow(r));

    console.log('[PERF-FILTERS] Created hierarchical data with', hierarchicalData.length, 'top-level groups');
    return hierarchicalData;
  }, [filteredData, groupByDimensions, dimensions, dateOrder]);

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