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
  originalDate?: string | Date; // Store original date for sorting
}

interface UsePerformanceTableDataOptions {
  reportId: string | null;
  reportIds?: string[]; // For consolidated view with multiple reports
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
 * Hook for loading performance table data with vlookup mappings support
 */
export function usePerformanceTableData({
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

  const loadPerformanceData = useCallback(async () => {
    // Reset error state
    setLoadError(null);
    
    const dateFromFormatted = filters.dateRange?.from ? format(filters.dateRange.from, 'yyyy-MM-dd') : undefined;
    const dateToFormatted = filters.dateRange?.to ? format(filters.dateRange.to, 'yyyy-MM-dd') : undefined;
    
    console.log('[PERF-TABLE] loadPerformanceData called with filters:', {
      reportId,
      groupByDimensions: groupByDimensions.length,
      compareEnabled: filters.compareEnabled,
      compareType: filters.compareType,
      hasCompareDateRange: !!filters.compareDateRange,
      compareDateFrom: filters.compareDateRange?.from ? format(filters.compareDateRange.from, 'yyyy-MM-dd') : undefined,
      compareDateTo: filters.compareDateRange?.to ? format(filters.compareDateRange.to, 'yyyy-MM-dd') : undefined,
      dateOrder: dateOrder,
      vlookupMappingsCount: vlookupMappings.length
    });

    // Check conditions after setting loading state
    // For consolidated view, use reportIds
    const useConsolidatedView = reportIds && reportIds.length > 0;
    
    if ((!reportId && !useConsolidatedView) || groupByDimensions.length === 0) {
      console.log('[testing] No data loading - missing reportId/reportIds or groupByDimensions');
      setTableData([]);
      setTotalData({});
      setTotalCompareData({});
      setTotalChangeData({});
      setIsLoadingData(false);
      onLoadingComplete?.(); // Mark as complete even when skipping load
      return;
    }

    try {
      // Get current user for custom dimensions (optional for public views)
      const { data: { user } } = await supabase.auth.getUser();

      // Helper: fetch raw dimension_data rows
      const fetchRows = async (ids: string[] | null, id: string | null) => {
        let query = supabase
          .from('dimension_data')
          .select('dimension_values, row_number, data_source_id')
          .order('row_number', { ascending: true });

        if (ids && ids.length > 0) {
          query = query.in('report_id', ids);
        } else if (id) {
          query = query.eq('report_id', id);
        }

        const { data, error } = await query;
        if (error) throw error;
        return data || [];
      };

      // Fetch rows for single or consolidated view
      const rawRows = await fetchRows(useConsolidatedView ? (reportIds as string[]) : null, useConsolidatedView ? null : reportId!);

      // Detect date dimension present in data
      const dateDims = dimensions.filter(d => d.type === 'date');
      let dateDimInUse: { id: string; name: string } | null = null;
      for (const d of dateDims) {
        const found = rawRows.some((r: any) => {
          const dv = r.dimension_values || {};
          return dv[d.id] !== undefined && dv[d.id] !== null && dv[d.id] !== '';
        });
        if (found) {
          dateDimInUse = { id: d.id, name: d.name };
          break;
        }
      }

      // Apply date filter (inclusive end)
      let filteredRows = rawRows;
      if (dateDimInUse && (dateFromFormatted || dateToFormatted)) {
        const fromDate = dateFromFormatted ? new Date(dateFromFormatted) : null;
        const toDate = dateToFormatted ? new Date(dateToFormatted) : null;
        const adjustedToDate = toDate
          ? new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1)
          : null;

        filteredRows = filteredRows.filter((row: any) => {
          const dv = row.dimension_values || {};
          const val = dv[dateDimInUse!.id];
          if (!val) return true; // keep rows without date
          const rowDate = new Date(String(val));
          if (fromDate && rowDate < fromDate) return false;
          if (adjustedToDate && rowDate >= adjustedToDate) return false;
          return true;
        });
      }

      // Normalize dimensionFilters to arrays and apply filtering by dimension IDs
      const normalizedFilters: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(filters.dimensionFilters || {})) {
        if (Array.isArray(v)) normalizedFilters[k] = v.map((x) => String(x));
        else if (v !== undefined && v !== null) normalizedFilters[k] = [String(v)];
      }

      if (Object.keys(normalizedFilters).length > 0) {
        filteredRows = filteredRows.filter((row: any) => {
          const dv = row.dimension_values || {};
          for (const [dimId, values] of Object.entries(normalizedFilters)) {
            if (!values || values.length === 0) continue;
            const rowVal = dv[dimId];
            if (rowVal === undefined || rowVal === null) return false;
            const rowStr = String(rowVal);
            // Must match one of the values exactly (case-sensitive)
            if (!values.some((v) => rowStr === v)) return false;
          }
          return true;
        });
      }

      // Transform rows into TableRow format and apply vlookup mappings
      const firstDimId = groupByDimensions[0];
      const firstDimension = dimensions.find(d => d.id === firstDimId);

      const transformedRows: TableRow[] = filteredRows.map((row: any, idx: number) => {
        const dv: Record<string, any> = row.dimension_values || {};
        const rowData: Record<string, any> = {};

        // Map dimension IDs to names; convert numeric strings to numbers; apply vlookup mappings
        dimensions.forEach(dim => {
          if (dv[dim.id] !== undefined) {
            let value = dv[dim.id];
            
            // Apply vlookup mappings if this is a vlookup target dimension
            if (dim.type === 'text' && dim.scope === 'custom' && vlookupMappings.length > 0) {
              // Check if there's a mapping for this dimension and value
              const mapping = vlookupMappings.find(m => 
                m.targetDimensionId === dim.id
              );
              
              if (mapping) {
                // Look for source mappings that match this value
                const sourceMapping = vlookupMappings.find(m => 
                  m.targetDimensionId === dim.id && 
                  m.sourceValue.toLowerCase() === String(value).toLowerCase()
                );
                
                if (sourceMapping) {
                  value = sourceMapping.targetValue;
                  console.log(`[VLOOKUP] Applied mapping: ${dv[dim.id]} -> ${value} for dimension ${dim.name}`);
                }
              }
            }
            
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
          name: rowData[firstDimension?.name || ''] || dv[firstDimId] || 'Unknown',
          level: 0,
          data: rowData,
          originalDate,
        };
      });

      // Set table data
      setTableData(transformedRows);

      // Calculate totals from transformed rows (fallback similar to previous logic)
      const calculatedTotalData: Record<string, any> = {};
      if (transformedRows.length > 0 && dimensions.length > 0) {
        transformedRows.forEach((row: TableRow) => {
          if (row.data) {
            Object.keys(row.data).forEach((dimName: string) => {
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

      // Clear compare and change data (can be computed in filters hook if needed)
      setTotalCompareData({});
      setTotalChangeData({});

    } catch (error) {
      console.error('[testing] Error in loadPerformanceData:', error);
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
    vlookupMappings.length, // Include vlookup mappings in dependency array
    onLoadingComplete,
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