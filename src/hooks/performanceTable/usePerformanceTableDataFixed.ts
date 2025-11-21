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
      // Use edge function for optimized, server-side data loading
      const { data: edgeFunctionData, error: fetchError } = await supabase.functions.invoke(
        'get-performance-data',
        {
          body: {
            reportId: reportId,
            reportIds: reportIds || undefined,
            accountId: accountId,
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
          }
        }
      );

      if (fetchError) throw fetchError;
      
      const rawRows = edgeFunctionData?.data || [];
      if (fetchError) throw fetchError;

      if (!rawRows || rawRows.length === 0) {
        console.log('[PERF-DATA-FIXED] No data returned from edge function');
        setTableData([]);
        setTotalData({});
        setIsLoadingData(false);
        onLoadingComplete?.();
        return;
      }

      console.log('[PERF-DATA-FIXED] Edge function returned', rawRows.length, 'rows');

      // Edge function returns pre-processed data, just transform to TableRow format
      const firstDimId = groupByDimensions[0];
      const firstDimension = dimensions.find(d => d.id === firstDimId);

      const transformedRows: TableRow[] = rawRows.map((row: any, idx: number) => {
        const rowData: Record<string, any> = { ...row };
        
        // Remove metadata fields
        delete rowData.id;
        delete rowData.report_id;
        delete rowData.data_source_id;
        
        const originalDate = firstDimension?.type === 'date' ? row[firstDimension.name] : undefined;
        const name = row[firstDimension?.name || groupByDimensions[0]] || 'Unknown';

        return {
          id: `row-${idx + 1}`,
          name: String(name),
          level: 0,
          data: rowData,
          originalDate,
        };
      });

      setTableData(transformedRows);

      // Calculate totals from edge function totals if available
      const totalsFromEdge = edgeFunctionData?.totals || {};
      const calculatedTotalData: Record<string, any> = {};
      
      // Map dimension IDs to names for totals
      Object.entries(totalsFromEdge).forEach(([dimId, value]) => {
        const dim = dimensions.find(d => d.id === dimId);
        if (dim) {
          calculatedTotalData[dim.name] = value;
        }
      });
      
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