import { useState, useCallback } from "react";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { useVlookupMappings } from "@/hooks/useVlookupMappings";
import type { FilterState } from "@/components/FiltersBar";
import type { Dimension } from "./usePerformanceTableDimensions";
import { usePerformanceData } from "./usePerformanceData";
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
 * Fetch performance data function for use in the hook
 */
async function fetchPerformanceData(params: any, queryClient: any): Promise<any> {
  // This is a placeholder - implement actual data fetching logic
  return { data: [], totalCount: 0, hasMore: false };
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
    console.log('[PERF-DATA-FIXED] ============= STARTING DATA LOAD =============');
    console.log('[PERF-DATA-FIXED] Parameters:', {
      reportId,
      reportIds,
      accountId,
      groupByDimensions,
      breakdownByDimensions,
      thenByDimensions,
      visibleColumns: Array.from(visibleColumns),
      filters: {
        dimensionFilters: filters.dimensionFilters,
        dateRange: filters.dateRange,
        datePreset: filters.datePreset,
        compareEnabled: filters.compareEnabled
      },
      activeDateTab,
      dateOrder,
      dimensionsCount: dimensions.length
    });
    
    setLoadError(null);
    setIsLoadingData(true);
    
    const dateFromFormatted = filters.dateRange?.from ? format(filters.dateRange.from, 'yyyy-MM-dd') : undefined;
    const dateToFormatted = filters.dateRange?.to ? format(filters.dateRange.to, 'yyyy-MM-dd') : undefined;
    
    console.log('[PERF-DATA-FIXED] Date processing:', {
      hasDateRange: !!filters.dateRange,
      dateFromFormatted,
      dateToFormatted,
      isAllTime: !dateFromFormatted && !dateToFormatted,
      datePreset: filters.datePreset
    });

    const useConsolidatedView = reportIds && reportIds.length > 0;
    
    if ((!reportId && !useConsolidatedView) || groupByDimensions.length === 0) {
      console.log('[PERF-DATA-FIXED] ❌ EARLY EXIT - Missing required parameters:', {
        hasReportId: !!reportId,
        hasReportIds: !!(reportIds && reportIds.length > 0),
        hasGroupByDimensions: groupByDimensions.length > 0
      });
      setTableData([]);
      setTotalData({});
      setTotalCompareData({});
      setTotalChangeData({});
      setIsLoadingData(false);
      onLoadingComplete?.();
      return;
    }

    try {
      console.log('[PERF-DATA-FIXED] ============= CALLING EDGE FUNCTION =============');
      
      const edgeFunctionParams = {
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
      };
      
      console.log('[PERF-DATA-FIXED] Edge function parameters:', edgeFunctionParams);

      // Use edge function for optimized, server-side data loading with React Query caching
      const edgeFunctionData = await fetchPerformanceData(edgeFunctionParams, queryClient);
      
      console.log('[PERF-DATA-FIXED] ============= EDGE FUNCTION RESPONSE =============');
      console.log('[PERF-DATA-FIXED] Response structure:', {
        hasData: !!edgeFunctionData,
        responseKeys: edgeFunctionData ? Object.keys(edgeFunctionData) : null,
        dataArray: edgeFunctionData?.data ? 'present' : 'missing',
        dataLength: edgeFunctionData?.data?.length || 0,
        totalCount: edgeFunctionData?.totalCount,
        hasMore: edgeFunctionData?.hasMore
      });
      
      const rawRows = edgeFunctionData?.data || [];

      if (!rawRows || rawRows.length === 0) {
        console.log('[PERF-DATA-FIXED] ❌ NO DATA RETURNED FROM EDGE FUNCTION');
        console.log('[PERF-DATA-FIXED] This means either:');
        console.log('[PERF-DATA-FIXED] 1. Edge function returned empty data array');
        console.log('[PERF-DATA-FIXED] 2. Edge function failed silently');
        console.log('[PERF-DATA-FIXED] 3. Date range filter is excluding all data');
        console.log('[PERF-DATA-FIXED] 4. Dimension filters are too restrictive');
        
        setTableData([]);
        setTotalData({});
        setIsLoadingData(false);
        onLoadingComplete?.();
        return;
      }

      console.log('[PERF-DATA-FIXED] ✅ Edge function returned', rawRows.length, 'rows');
      console.log('[PERF-DATA-FIXED] Sample raw rows (first 3):');
      rawRows.slice(0, 3).forEach((row, i) => {
        console.log(`[PERF-DATA-FIXED] Row ${i}:`, {
          id: row.id,
          row_number: row.row_number,
          dimension_values: row.dimension_values,
          dimension_values_keys: row.dimension_values ? Object.keys(row.dimension_values) : null
        });
      });

      // NEW: Fix dimension ID mismatches before transforming rows
      console.log('[PERF-DATA-FIXED] ============= APPLYING AUTO-FIX =============');
      const fixedRows = await autoFixDimensionSync(rawRows, dimensions);
      console.log('[PERF-DATA-FIXED] Applied auto-fix to', fixedRows.length, 'rows');

      // Transform edge function rows: dimension_values keyed by IDs -> row.data keyed by dimension names
      console.log('[PERF-DATA-FIXED] ============= TRANSFORMING ROWS =============');
      const firstDimId = groupByDimensions[0];
      const firstDimension = dimensions.find(d => d.id === firstDimId);
      
      console.log('[PERF-DATA-FIXED] First dimension details:', {
        firstDimId,
        firstDimension: firstDimension ? {
          id: firstDimension.id,
          name: firstDimension.name,
          type: firstDimension.type
        } : null
      });

      const transformedRows: TableRow[] = fixedRows.map((row: any, idx: number) => {
        const dv: Record<string, any> = row.dimension_values || {};
        
        if (idx < 3) {
          console.log(`[PERF-DATA-FIXED] Transforming row ${idx}:`, {
            original_dv: dv,
            firstDimId,
            firstDimValue: dv[firstDimId]
          });
        }
        
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

        if (idx < 3) {
          console.log(`[PERF-DATA-FIXED] Transformed row ${idx}:`, {
            name,
            rowData,
            originalDate
          });
        }

        return {
          id: `row-${idx + 1}`,
          name,
          level: 0,
          data: rowData,
          originalDate,
        };
      });

      console.log('[PERF-DATA-FIXED] ============= TRANSFORMATION COMPLETE =============');
      console.log('[PERF-DATA-FIXED] Transformed rows:', transformedRows.length);
      console.log('[PERF-DATA-FIXED] Sample transformed rows (first 3):');
      transformedRows.slice(0, 3).forEach((row, i) => {
        console.log(`[PERF-DATA-FIXED] Transformed row ${i}:`, {
          id: row.id,
          name: row.name,
          level: row.level,
          dataKeys: Object.keys(row.data),
          sampleData: Object.entries(row.data).slice(0, 5)
        });
      });

      setTableData(transformedRows);

      // Compute totals client-side from transformed rows (edge function doesn't return totals)
      console.log('[PERF-DATA-FIXED] ============= CALCULATING TOTALS =============');
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
      
      console.log('[PERF-DATA-FIXED] Calculated totals:', {
        totalDataKeys: Object.keys(calculatedTotalData),
        sampleTotals: Object.entries(calculatedTotalData).slice(0, 5)
      });
      
      setTotalData(calculatedTotalData);
      setTotalCompareData({});
      setTotalChangeData({});

      console.log('[PERF-DATA-FIXED] ✅ Successfully processed', transformedRows.length, 'rows from edge function');

    } catch (error) {
      console.error('[PERF-DATA-FIXED] ❌ ERROR LOADING DATA:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error('[PERF-DATA-FIXED] Error details:', {
        message: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        error: error
      });
      
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
      console.log('[PERF-DATA-FIXED] ============= DATA LOAD COMPLETE =============');
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