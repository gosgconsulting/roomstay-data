import { useState, useCallback } from "react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { useVlookupMappings } from "@/hooks/useVlookupMappings";
import type { FilterState } from "@/components/FiltersBar";
import type { Dimension } from "./usePerformanceTableDimensions";
import { fetchPerformanceData } from "./usePerformanceData";
import { useQueryClient } from "@tanstack/react-query";
import { autoFixDimensionSync } from "@/lib/dimension-sync-auto-fix";

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
  const queryClient = useQueryClient();
  const [tableData, setTableData] = useState<TableRow[]>([]);
  const [totalData, setTotalData] = useState<Record<string, any>>({});
  const [totalCompareData, setTotalCompareData] = useState<Record<string, any>>({});
  const [totalChangeData, setTotalChangeData] = useState<Record<string, number>>({});
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load vlookup mappings for applying to data (if edge function doesn't handle it)
  const { data: vlookupMappings = [] } = useVlookupMappings(reportId || undefined, accountId);

  const loadPerformanceData = useCallback(async () => {
    setLoadError(null);
    setIsLoadingData(true);
    
    const dateFromFormatted = filters.dateRange?.from ? format(filters.dateRange.from, 'yyyy-MM-dd') : undefined;
    const dateToFormatted = filters.dateRange?.to ? format(filters.dateRange.to, 'yyyy-MM-dd') : undefined;
    
    console.log('[PERF-DATA-FIXED] Loading performance data using edge function');

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
      // Use edge function for optimized, server-side data loading with React Query caching
      const edgeFunctionData = await fetchPerformanceData({
        reportId: reportId || undefined,
        reportIds: reportIds,
        accountId: accountId!,
        groupByDims: groupByDimensions,
        breakdownDims: breakdownByDimensions,
        thenByDims: thenByDimensions,
        visibleDimensionIds: Array.from(visibleColumns),
        dimensionFilters: filters.dimensionFilters,
        dateFrom: dateFromFormatted,
        dateTo: dateToFormatted,
        dateGranularity: activeDateTab,
        dateOrder: dateOrder,
        limit: 50000,
        offset: 0
      }, queryClient);
      
      const rawRows = edgeFunctionData?.data || [];

      if (!rawRows || rawRows.length === 0) {
        console.log('[PERF-DATA-FIXED] No data returned from edge function');
        setTableData([]);
        setTotalData({});
        setIsLoadingData(false);
        onLoadingComplete?.();
        return;
      }

      console.log('[PERF-DATA-FIXED] Edge function returned', rawRows.length, 'rows');

      // NEW: Fix dimension ID mismatches before transforming rows
      const fixedRows = await autoFixDimensionSync(rawRows, dimensions);
      console.log('[PERF-DATA-FIXED] Applied auto-fix to', fixedRows.length, 'rows');

      // Transform edge function rows: dimension_values keyed by IDs -> row.data keyed by dimension names
      const firstDimId = groupByDimensions[0];
      const firstDimension = dimensions.find(d => d.id === firstDimId);

      const transformedRows: TableRow[] = fixedRows.map((row: any, idx: number) => {
        const dv: Record<string, any> = row.dimension_values || {};
        
        // Apply vlookup mappings (client-side) if present
        if (vlookupMappings.length > 0) {
          for (const m of vlookupMappings) {
            const src = dv[m.sourceDimensionId];
            if (src !== undefined && src !== null) {
              if (String(src).toLowerCase() === m.sourceValue.toLowerCase()) {
                dv[m.targetDimensionId] = m.targetValue;
              }
            }
          }
        }

        // Build row.data keyed by dimension names with numeric conversion
        const rowData: Record<string, any> = {};
        dimensions.forEach(dim => {
          if (dv[dim.id] !== undefined) {
            const val = dv[dim.id];
            if (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage') {
              const numValue = parseFloat(String(val));
              rowData[dim.name] = !isNaN(numValue) ? numValue : val;
            } else {
              rowData[dim.name] = val;
            }
          }
        });

        const originalDate = firstDimension?.type === 'date' ? dv[firstDimId] : undefined;
        const nameValue = dv[firstDimId];
        const name = nameValue !== undefined && nameValue !== null && nameValue !== '' ? String(nameValue) : 'Unknown';

        return {
          id: `row-${idx + 1}`,
          name,
          level: 0,
          data: rowData,
          originalDate,
        };
      });

      setTableData(transformedRows);

      // Compute totals client-side from transformed rows (edge function doesn't return totals)
      const calculatedTotalData: Record<string, any> = {};
      if (transformedRows.length > 0 && dimensions.length > 0) {
        transformedRows.forEach((row: TableRow) => {
          if (row.data) {
            Object.keys(row.data).forEach((dimName: string) => {
              const dim = dimensions.find(d => d.name === dimName);
              if (dim && (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage')) {
                const value = parseFloat(String(row.data[dimName] ?? '0'));
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

      console.log('[PERF-DATA-FIXED] Successfully processed', transformedRows.length, 'rows from edge function');

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
    onLoadingComplete,
    vlookupMappings.length,
    queryClient
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