import { useState, useCallback } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
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
 * Hook for loading performance table data
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
      compareDateTo: filters.compareDateRange?.to ? format(filters.compareDateRange.to, 'yyyy-MM-dd') : undefined
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
      
      // Use consolidated endpoint if multiple reports
      if (useConsolidatedView) {
        const requestBody = {
          reportIds,
          groupByDims: groupByDimensions,
          breakdownDims: breakdownByDimensions,
          thenByDims: thenByDimensions,
          dimensionFilters: filters.dimensionFilters,
          dateFrom: dateFromFormatted,
          dateTo: dateToFormatted,
          accountId,
          userId: user?.id,
          visibleDimensionIds: Array.from(visibleColumns),
          limit: 50000,
          offset: 0,
          compareEnabled: filters.compareEnabled || false,
          compareDateFrom: filters.compareDateRange?.from ? format(filters.compareDateRange.from, 'yyyy-MM-dd') : undefined,
          compareDateTo: filters.compareDateRange?.to ? format(filters.compareDateRange.to, 'yyyy-MM-dd') : undefined,
          dateGranularity: activeDateTab,
          dateOrder: dateOrder,
        };
        
        console.log('[PERF-TABLE] Calling consolidated endpoint with:', requestBody);

        try {
          const { data, error } = await supabase.functions.invoke('get-consolidated-performance-data', {
            body: requestBody,
          });

          if (error) {
            console.error('[PERF-TABLE] Edge function error:', error);
            throw error;
          }

          if (data?.error) {
            console.error('[PERF-TABLE] Data contains error:', data.error);
            throw new Error(data.error);
          }

          console.log('[PERF-TABLE] Consolidated data response:', data);

          // Process consolidated response
          setTableData(data.data || []);
          setTotalData(data.totals || {});
          setTotalCompareData({});
          setTotalChangeData({});
        } catch (error) {
          console.error('[PERF-TABLE] Error in consolidated data:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
          setLoadError(errorMessage);
          toast({
            title: "Error loading data",
            description: `Failed to load consolidated data: ${errorMessage}`,
            variant: "destructive",
          });
          setTableData([]);
          setTotalData({});
          setTotalCompareData({});
          setTotalChangeData({});
        }
        
        setIsLoadingData(false);
        onLoadingComplete?.();
        return;
      }
      
      const requestBody = {
        reportId,
        groupByDims: groupByDimensions,
        breakdownDims: breakdownByDimensions,
        thenByDims: thenByDimensions,
        dimensionFilters: filters.dimensionFilters,
        dateFrom: dateFromFormatted,
        dateTo: dateToFormatted,
        accountId, // Pass accountId to edge function
        userId: user?.id, // Pass userId for custom dimensions
        visibleDimensionIds: Array.from(visibleColumns),
        limit: 50000, // Increased to get more data for pagination
        offset: 0,
        compareEnabled: filters.compareEnabled || false,
        compareDateFrom: filters.compareDateRange?.from ? format(filters.compareDateRange.from, 'yyyy-MM-dd') : undefined,
        compareDateTo: filters.compareDateRange?.to ? format(filters.compareDateRange.to, 'yyyy-MM-dd') : undefined,
        dateGranularity: activeDateTab,
        dateOrder: dateOrder,
      };
      
      console.log('[testing] Calling get-performance-data with request body:', requestBody);
      console.log('[testing] Date filter details being sent:', {
        dateFrom: requestBody.dateFrom,
        dateTo: requestBody.dateTo,
        hasDateFrom: !!requestBody.dateFrom,
        hasDateTo: !!requestBody.dateTo,
        originalDateRange: filters.dateRange,
        originalFrom: filters.dateRange?.from?.toISOString(),
        originalTo: filters.dateRange?.to?.toISOString(),
        timestamp: new Date().toISOString()
      });

      try {
        const { data, error } = await supabase.functions.invoke('get-performance-data', {
          body: requestBody,
        });

        if (error) {
          console.error('[testing] Edge function invocation error:', error);
          throw error;
        }

        // Check if the response contains an error field
        if (data?.error) {
          console.error('[testing] Data contains error:', data.error);
          throw new Error(data.error);
        }

        console.log('[testing] Performance data response:', {
          hasData: !!data,
          rowsCount: data?.data?.length || 0,
          total: data?.total || 0,
          hasMore: data?.hasMore,
        });

        // The edge function returns { data: [...], total: ..., totalData: {...}, hasMore: ... }
        const rows = data?.data || [];
        setTableData(rows);
        
        // Use totalData from edge function if available (more efficient than recalculating)
        const finalTotalData = data?.totalData || (() => {
          // Fallback: Calculate total data from all rows if edge function doesn't provide it
          const calculatedTotalData: Record<string, any> = {};
          if (rows.length > 0 && dimensions.length > 0) {
            rows.forEach((row: any) => {
              if (row.data) {
                Object.keys(row.data).forEach((dimName: string) => {
                  const dim = dimensions.find(d => d.name === dimName);
                  if (dim && (dim.type === 'number' || dim.type === 'currency')) {
                    calculatedTotalData[dimName] = (calculatedTotalData[dimName] || 0) + (parseFloat(row.data[dimName]) || 0);
                  }
                });
              }
            });
          }
          return calculatedTotalData;
        })();
        setTotalData(finalTotalData);
        
        // Use totalCompareData from edge function if available
        const finalCompareData = data?.totalCompareData || (() => {
          // Fallback: Calculate comparison totals from rows if not provided
          const calculatedCompareData: Record<string, any> = {};
          if (rows.length > 0 && dimensions.length > 0) {
            rows.forEach((row: any) => {
              if (row.compareData) {
                Object.keys(row.compareData).forEach((dimName: string) => {
                  const dim = dimensions.find(d => d.name === dimName);
                  if (dim && (dim.type === 'number' || dim.type === 'currency')) {
                    calculatedCompareData[dimName] = (calculatedCompareData[dimName] || 0) + (parseFloat(row.compareData[dimName]) || 0);
                  }
                });
              }
            });
          }
          return calculatedCompareData;
        })();
        setTotalCompareData(finalCompareData);
        
        // Use totalChangeData from edge function if available
        const finalChangeData = data?.totalChangeData || (() => {
          // Fallback: Calculate change data from totals
          const calculatedChangeData: Record<string, any> = {};
          
          // Use all dimensions to ensure we calculate change for all metrics
          const allDimNames = new Set<string>();
          Object.keys(finalTotalData).forEach(k => allDimNames.add(k));
          Object.keys(finalCompareData).forEach(k => allDimNames.add(k));
          
          allDimNames.forEach((dimName: string) => {
            const current = finalTotalData[dimName] || 0;
            const previous = finalCompareData[dimName] || 0;
            if (previous !== 0) {
              calculatedChangeData[dimName] = ((current - previous) / previous) * 100;
            } else if (current !== 0) {
              calculatedChangeData[dimName] = current > 0 ? 100 : -100;
            } else {
              calculatedChangeData[dimName] = 0;
            }
          });
          return calculatedChangeData;
        })();
        setTotalChangeData(finalChangeData);
      } catch (error) {
        console.error('[testing] Error processing performance data:', error);
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
      }
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