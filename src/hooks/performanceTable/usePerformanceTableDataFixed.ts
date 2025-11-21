import { useState, useCallback } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useVlookupMappings } from "@/hooks/useVlookupMappings";
import type { FilterState } from "@/components/FiltersBar";
import type { Dimension } from "./usePerformanceTableDimensions";

export interface TableRow {
  id: string;
  name: string;
  level: number;
  parentId?: string;
  data: Record<string, any>;
  children?: TableRow[];
  compareData?: Record<string, any>;
  changeData?: Record<string, number>;
  originalDate?: string | Date;
}

interface UsePerformanceTableDataOptions {
  reportId: string | null;
  reportIds?: string[];
  accountId?: string;
  groupByDimensions: string[];
  breakdownByDimensions: string[];
  thenByDimensions: string[];
  visibleColumns: Set<string>;
  filters: FilterState;
  activeDateTab: 'day' | 'week' | 'month' | 'year';
  dateOrder: 'asc' | 'desc';
  dimensions: Dimension[];
  onLoadingComplete?: () => void;
}

/**
 * Enhanced hook for loading performance table data with automatic dimension sync fixing
 */
export function usePerformanceTableDataFixed({
  reportId,
  reportIds,
  accountId,
  groupByDimensions,
  breakdownByDimensions,
  thenByDimensions,
  visibleColumns,
  filters,
  activeDateTab,
  dateOrder,
  dimensions,
  onLoadingComplete,
}: UsePerformanceTableDataOptions) {
  const [tableData, setTableData] = useState<TableRow[]>([]);
  const [totalData, setTotalData] = useState<Record<string, any>>({});
  const [totalCompareData, setTotalCompareData] = useState<Record<string, any>>({});
  const [totalChangeData, setTotalChangeData] = useState<Record<string, number>>({});
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load vlookup mappings for applying to data
  const { data: vlookupMappings = [] } = useVlookupMappings(reportId || undefined, accountId);

  /**
   * Create dimension ID mapping from old IDs to current dimension IDs
   */
  const createDimensionMapping = useCallback(async (
    usedDimensionIds: string[],
    currentDimensions: Dimension[]
  ): Promise<Map<string, { id: string; name: string; type: string }>> => {
    const mapping = new Map<string, { id: string; name: string; type: string }>();
    const currentDimensionIds = new Set(currentDimensions.map(d => d.id));
    
    // First, add all current dimensions that are already valid
    currentDimensions.forEach(dim => {
      if (usedDimensionIds.includes(dim.id)) {
        mapping.set(dim.id, { id: dim.id, name: dim.name, type: dim.type });
      }
    });

    // Find missing dimension IDs and try to map them
    const missingIds = usedDimensionIds.filter(id => !currentDimensionIds.has(id));
    
    if (missingIds.length > 0) {
      console.log('[PERF-DATA-FIXED] Found missing dimension IDs:', missingIds);
      
      // Try to find old dimensions by ID and map to current dimensions by name
      const { data: oldDimensions } = await supabase
        .from('dimensions')
        .select('id, name, type')
        .in('id', missingIds);

      if (oldDimensions) {
        oldDimensions.forEach(oldDim => {
          // Find current dimension with same name
          const currentDim = currentDimensions.find(d => d.name === oldDim.name);
          if (currentDim) {
            mapping.set(oldDim.id, { 
              id: currentDim.id, 
              name: currentDim.name, 
              type: currentDim.type 
            });
            console.log('[PERF-DATA-FIXED] Mapped dimension:', oldDim.name, oldDim.id, '->', currentDim.id);
          }
        });
      }
    }

    return mapping;
  }, []);

  const loadPerformanceData = useCallback(async () => {
    setLoadError(null);
    setIsLoadingData(true);
    
    const dateFromFormatted = filters.dateRange?.from ? format(filters.dateRange.from, 'yyyy-MM-dd') : undefined;
    const dateToFormatted = filters.dateRange?.to ? format(filters.dateRange.to, 'yyyy-MM-dd') : undefined;
    
    console.log('[PERF-DATA-FIXED] Loading performance data with automatic dimension sync');

    const useConsolidatedView = reportIds && reportIds.length > 0;
    
    if ((!reportId && !useConsolidatedView) || groupByDimensions.length === 0) {
      console.log('[PERF-DATA-FIXED] No data loading - missing reportId/reportIds or groupByDimensions');
      setTableData([]);
      setTotalData({});
      setTotalCompareData({});
      setTotalChangeData({});
      setIsLoadingData(false);
      onLoadingComplete?.();
      return;
    }

    try {
      // Step 1: Fetch raw dimension_data rows
      let query = supabase
        .from('dimension_data')
        .select('dimension_values, row_number, data_source_id')
        .order('row_number', { ascending: true });

      if (useConsolidatedView && reportIds) {
        query = query.in('report_id', reportIds);
      } else if (reportId) {
        query = query.eq('report_id', reportId);
      }

      const { data: rawRows, error: fetchError } = await query;
      if (fetchError) throw fetchError;

      if (!rawRows || rawRows.length === 0) {
        console.log('[PERF-DATA-FIXED] No raw data found');
        setTableData([]);
        setTotalData({});
        setIsLoadingData(false);
        onLoadingComplete?.();
        return;
      }

      console.log('[PERF-DATA-FIXED] Fetched', rawRows.length, 'raw rows');

      // Step 2: Analyze dimension IDs used in the data
      const usedDimensionIds = new Set<string>();
      rawRows.forEach(row => {
        if (row.dimension_values) {
          Object.keys(row.dimension_values).forEach(dimId => {
            usedDimensionIds.add(dimId);
          });
        }
      });

      const usedDimensionIdsArray = Array.from(usedDimensionIds);
      console.log('[PERF-DATA-FIXED] Found dimension IDs in data:', usedDimensionIdsArray.length);

      // Step 3: Create dimension mapping
      const dimensionMapping = await createDimensionMapping(usedDimensionIdsArray, dimensions);
      console.log('[PERF-DATA-FIXED] Created dimension mapping with', dimensionMapping.size, 'entries');

      // Step 4: Transform and fix dimension values in each row
      const processedRows = rawRows.map(row => {
        if (!row.dimension_values) return row;

        const fixedDimensionValues: Record<string, any> = {};
        
        Object.entries(row.dimension_values).forEach(([oldId, value]) => {
          const mapping = dimensionMapping.get(oldId);
          if (mapping) {
            // Use the correct dimension ID
            fixedDimensionValues[mapping.id] = value;
          } else {
            // Keep original if no mapping found
            fixedDimensionValues[oldId] = value;
          }
        });

        return {
          ...row,
          dimension_values: fixedDimensionValues
        };
      });

      // Step 5: Apply vlookup mappings
      if (vlookupMappings.length > 0) {
        processedRows.forEach(row => {
          const dv = row.dimension_values || {};
          vlookupMappings.forEach(mapping => {
            const sourceValue = dv[mapping.sourceDimensionId];
            if (sourceValue !== undefined && sourceValue !== null) {
              if (String(sourceValue).toLowerCase() === mapping.sourceValue.toLowerCase()) {
                dv[mapping.targetDimensionId] = mapping.targetValue;
              }
            }
          });
          row.dimension_values = dv;
        });
      }

      // Step 6: Apply date and dimension filters
      let filteredRows = processedRows;

      // Date filtering
      const dateDimensions = dimensions.filter(d => d.type === 'date');
      let dateDimInUse: { id: string; name: string } | null = null;
      
      for (const d of dateDimensions) {
        const found = filteredRows.some(r => {
          const dv = r.dimension_values || {};
          return dv[d.id] !== undefined && dv[d.id] !== null && dv[d.id] !== '';
        });
        if (found) {
          dateDimInUse = { id: d.id, name: d.name };
          break;
        }
      }

      if (dateDimInUse && (dateFromFormatted || dateToFormatted)) {
        const fromDate = dateFromFormatted ? new Date(dateFromFormatted) : null;
        const toDate = dateToFormatted ? new Date(dateToFormatted) : null;
        const adjustedToDate = toDate
          ? new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1)
          : null;

        filteredRows = filteredRows.filter(row => {
          const dv = row.dimension_values || {};
          const val = dv[dateDimInUse!.id];
          if (!val) return true;
          const rowDate = new Date(String(val));
          if (fromDate && rowDate < fromDate) return false;
          if (adjustedToDate && rowDate >= adjustedToDate) return false;
          return true;
        });
      }

      // Dimension filtering
      const normalizedFilters: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(filters.dimensionFilters || {})) {
        if (Array.isArray(v)) normalizedFilters[k] = v.map(x => String(x));
        else if (v !== undefined && v !== null) normalizedFilters[k] = [String(v)];
      }

      if (Object.keys(normalizedFilters).length > 0) {
        filteredRows = filteredRows.filter(row => {
          const dv = row.dimension_values || {};
          for (const [dimId, values] of Object.entries(normalizedFilters)) {
            if (!values || values.length === 0) continue;
            const rowVal = dv[dimId];
            if (rowVal === undefined || rowVal === null) return false;
            const rowStr = String(rowVal).trim().toLowerCase();
            const filterValuesLower = values.map(v => String(v).trim().toLowerCase());
            if (!filterValuesLower.some(v => v === rowStr)) return false;
          }
          return true;
        });
      }

      // Step 7: Transform to TableRow format
      const firstDimId = groupByDimensions[0];
      const firstDimension = dimensions.find(d => d.id === firstDimId);

      const transformedRows: TableRow[] = filteredRows.map((row, idx) => {
        const dv: Record<string, any> = (row.dimension_values as Record<string, any>) || {};
        const rowData: Record<string, any> = {};

        // Map dimension IDs to names and convert values
        dimensions.forEach(dim => {
          if (dv[dim.id] !== undefined) {
            let value = dv[dim.id];
            
            if (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage') {
              const numValue = parseFloat(String(value));
              rowData[dim.name] = !isNaN(numValue) ? numValue : value;
            } else {
              rowData[dim.name] = value;
            }
          }
        });

        const originalDate = firstDimension?.type === 'date' ? dv[firstDimId] : undefined;

        return {
          id: `row-${row.row_number ?? idx + 1}`,
          name: dv[firstDimId] || 'Unknown',
          level: 0,
          data: rowData,
          originalDate,
        };
      });

      setTableData(transformedRows);

      // Step 8: Calculate totals
      const calculatedTotalData: Record<string, any> = {};
      if (transformedRows.length > 0) {
        transformedRows.forEach(row => {
          if (row.data) {
            Object.keys(row.data).forEach(dimName => {
              const dim = dimensions.find(d => d.name === dimName);
              if (dim && (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage')) {
                const value = parseFloat(String(row.data[dimName] || '0'));
                if (!isNaN(value)) {
                  calculatedTotalData[dimName] = (calculatedTotalData[dimName] || 0) + value;
                }
              }
            });
          }
        });
      }
      setTotalData(calculatedTotalData);

      setTotalCompareData({});
      setTotalChangeData({});

      console.log('[PERF-DATA-FIXED] Successfully loaded and processed', transformedRows.length, 'rows');

    } catch (error) {
      console.error('[PERF-DATA-FIXED] Error loading data:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setLoadError(errorMessage);
      toast({
        title: "Error loading data",
        description: `Failed to load performance table data: ${errorMessage}`,
        variant: "destructive",
      });
      setTableData([]);
      setTotalData({});
      setTotalCompareData({});
      setTotalChangeData({});
    } finally {
      setIsLoadingData(false);
      onLoadingComplete?.();
    }
  }, [
    reportId,
    reportIds,
    accountId,
    JSON.stringify(groupByDimensions),
    JSON.stringify(breakdownByDimensions),
    JSON.stringify(thenByDimensions),
    JSON.stringify(Array.from(visibleColumns)),
    JSON.stringify(filters.dimensionFilters),
    filters.dateRange?.from?.toISOString(),
    filters.dateRange?.to?.toISOString(),
    filters.datePreset,
    filters.compareEnabled,
    filters.compareType,
    filters.compareDateRange?.from?.toISOString(),
    filters.compareDateRange?.to?.toISOString(),
    activeDateTab,
    dateOrder,
    dimensions.length,
    vlookupMappings.length,
    onLoadingComplete,
    createDimensionMapping,
  ]);

  return {
    tableData,
    totalData,
    totalCompareData,
    totalChangeData,
    isLoadingData,
    loadPerformanceData,
    setIsLoadingData,
    loadError,
  };
}