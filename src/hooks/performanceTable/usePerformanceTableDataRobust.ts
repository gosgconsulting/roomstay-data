import { useState, useCallback, useEffect } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { autoFixDimensionSync } from "@/lib/dimension-sync-auto-fix";
import { logReportDiagnostics } from "@/lib/debug-report-issues";
import type { Dimension } from "./usePerformanceTableDimensions";
import type { FilterState } from "@/components/FiltersBar";

export interface TableRow {
  id: string;
  name: string;
  level: number;
  data: Record<string, any>;
  children?: TableRow[];
  parentId?: string;
  originalDate?: string | number | Date;
}

interface UsePerformanceTableDataRobustOptions {
  reportId: string | null;
  reportIds?: string[] | null;
  accountId?: string;
  groupByDimensions: string[];
  breakdownByDimensions: string[];
  thenByDimensions: string[];
  visibleColumns: Set<string>;
  filters: FilterState;
  dimensions: Dimension[];
  vlookupMappings: any[];
  activeDateTab: 'day' | 'week' | 'month' | 'year';
  dateOrder: 'asc' | 'desc';
  onLoadingComplete?: () => void;
}

export function usePerformanceTableDataRobust({
  reportId,
  reportIds,
  accountId,
  groupByDimensions,
  breakdownByDimensions,
  thenByDimensions,
  visibleColumns,
  filters,
  dimensions,
  vlookupMappings,
  activeDateTab,
  dateOrder,
  onLoadingComplete,
}: UsePerformanceTableDataRobustOptions) {
  const [tableData, setTableData] = useState<TableRow[]>([]);
  const [totalData, setTotalData] = useState<Record<string, any>>({});
  const [totalCompareData, setTotalCompareData] = useState<Record<string, any>>({});
  const [totalChangeData, setTotalChangeData] = useState<Record<string, any>>({});
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Validate prerequisites before loading data
  const validatePrerequisites = useCallback((): { isValid: boolean; reason?: string } => {
    if (!reportId && (!reportIds || reportIds.length === 0)) {
      return { isValid: false, reason: 'No report ID provided' };
    }
    
    if (groupByDimensions.length === 0) {
      return { isValid: false, reason: 'No group by dimensions selected' };
    }
    
    if (dimensions.length === 0) {
      return { isValid: false, reason: 'No dimensions loaded' };
    }
    
    return { isValid: true };
  }, [reportId, reportIds, groupByDimensions, dimensions]);

  // Check if data sources exist for the report
  const checkDataSources = useCallback(async (reportId: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('data_sources')
        .select('id')
        .eq('report_id', reportId)
        .limit(1);
      
      if (error) {
        console.warn('[ROBUST-DATA] Error checking data sources:', error);
        return false;
      }
      
      return (data && data.length > 0);
    } catch (error) {
      console.warn('[ROBUST-DATA] Exception checking data sources:', error);
      return false;
    }
  }, []);

  // Robust data fetching with multiple fallback strategies
  const fetchDataWithFallbacks = useCallback(async (targetReportId: string): Promise<any[]> => {
    const strategies = [
      // Strategy 1: Use edge function (preferred)
      async () => {
        console.log('[ROBUST-DATA] Trying edge function strategy');
        const response = await supabase.functions.invoke('get-performance-data', {
          body: {
            reportId: targetReportId,
            accountId,
            userId: (await supabase.auth.getUser()).data.user?.id,
            dateFrom: filters.dateRange?.from ? format(filters.dateRange.from, 'yyyy-MM-dd') : undefined,
            dateTo: filters.dateRange?.to ? format(filters.dateRange.to, 'yyyy-MM-dd') : undefined,
            dimensionFilters: filters.dimensionFilters || {},
            limit: 50000,
            offset: 0,
          },
        });
        
        if (response.error) throw new Error(response.error.message);
        return response.data?.data || [];
      },
      
      // Strategy 2: Direct database query
      async () => {
        console.log('[ROBUST-DATA] Trying direct database strategy');
        let query = supabase
          .from('dimension_data')
          .select('dimension_values, row_number, data_source_id')
          .eq('report_id', targetReportId)
          .order('row_number', { ascending: true })
          .limit(10000);
        
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
      },
      
      // Strategy 3: Minimal data fetch
      async () => {
        console.log('[ROBUST-DATA] Trying minimal data strategy');
        const { data, error } = await supabase
          .from('dimension_data')
          .select('dimension_values')
          .eq('report_id', targetReportId)
          .limit(100);
        
        if (error) throw error;
        return (data || []).map((row, index) => ({
          ...row,
          row_number: index + 1,
          data_source_id: null
        }));
      }
    ];

    let lastError: Error | null = null;
    
    for (let i = 0; i < strategies.length; i++) {
      try {
        const result = await strategies[i]();
        console.log(`[ROBUST-DATA] Strategy ${i + 1} succeeded with ${result.length} rows`);
        return result;
      } catch (error) {
        console.warn(`[ROBUST-DATA] Strategy ${i + 1} failed:`, error);
        lastError = error as Error;
        
        // Add delay between strategies
        if (i < strategies.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }
    
    throw lastError || new Error('All data fetching strategies failed');
  }, [accountId, filters]);

  // Transform raw data to table format with comprehensive error handling
  const transformDataToTable = useCallback((rawData: any[], dimensions: Dimension[]): TableRow[] => {
    if (!rawData || rawData.length === 0) return [];
    
    const transformedRows: TableRow[] = [];
    const firstDimId = groupByDimensions[0];
    const firstDimension = dimensions.find(d => d.id === firstDimId);
    
    for (let idx = 0; idx < rawData.length; idx++) {
      try {
        const row = rawData[idx];
        const dv: Record<string, any> = row.dimension_values || {};
        const rowData: Record<string, any> = {};

        // Map dimension IDs to names with error handling
        dimensions.forEach(dim => {
          try {
            if (dv[dim.id] !== undefined) {
              let value = dv[dim.id];
              
              // Apply vlookup mappings if available
              if (vlookupMappings.length > 0) {
                const mapping = vlookupMappings.find(m => 
                  m.targetDimensionId === dim.id && 
                  m.sourceValue.toLowerCase() === String(value).toLowerCase()
                );
                if (mapping) {
                  value = mapping.targetValue;
                }
              }
              
              // Convert numeric values
              if (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage') {
                const numValue = parseFloat(String(value));
                rowData[dim.name] = !isNaN(numValue) ? numValue : 0;
              } else {
                rowData[dim.name] = value;
              }
            } else {
              // Set default values for missing dimensions
              if (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage') {
                rowData[dim.name] = 0;
              } else {
                rowData[dim.name] = '';
              }
            }
          } catch (dimensionError) {
            console.warn(`[ROBUST-DATA] Error processing dimension ${dim.name}:`, dimensionError);
            // Set safe default
            rowData[dim.name] = dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage' ? 0 : '';
          }
        });

        const originalDate = firstDimension?.type === 'date' ? dv[firstDimId] : undefined;

        transformedRows.push({
          id: `row-${row.row_number ?? idx + 1}`,
          name: String(dv[firstDimId] || 'Unknown'),
          level: 0,
          data: rowData,
          originalDate,
        });
      } catch (rowError) {
        console.warn(`[ROBUST-DATA] Error transforming row ${idx}:`, rowError);
        // Continue with other rows
      }
    }
    
    return transformedRows;
  }, [groupByDimensions, vlookupMappings]);

  // Calculate totals with error handling
  const calculateTotals = useCallback((tableData: TableRow[], dimensions: Dimension[]): Record<string, any> => {
    const totals: Record<string, any> = {};
    
    try {
      tableData.forEach(row => {
        try {
          if (row.data) {
            Object.keys(row.data).forEach(dimName => {
              try {
                const dim = dimensions.find(d => d.name === dimName);
                if (dim && (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage')) {
                  const value = parseFloat(String(row.data[dimName] || '0'));
                  if (!isNaN(value)) {
                    totals[dimName] = (totals[dimName] || 0) + value;
                  }
                }
              } catch (dimTotalError) {
                console.warn(`[ROBUST-DATA] Error calculating total for ${dimName}:`, dimTotalError);
              }
            });
          }
        } catch (rowTotalError) {
          console.warn(`[ROBUST-DATA] Error calculating totals for row ${row.id}:`, rowTotalError);
        }
      });
    } catch (totalError) {
      console.error('[ROBUST-DATA] Error in total calculation:', totalError);
    }
    
    return totals;
  }, []);

  // Main data loading function with comprehensive error handling and retry logic
  const loadPerformanceData = useCallback(async () => {
    const validation = validatePrerequisites();
    if (!validation.isValid) {
      console.log(`[ROBUST-DATA] Skipping load: ${validation.reason}`);
      setTableData([]);
      setTotalData({});
      setTotalCompareData({});
      setTotalChangeData({});
      setLoadError(null);
      onLoadingComplete?.();
      return;
    }

    setIsLoadingData(true);
    setLoadError(null);
    
    const targetReportId = reportId || (reportIds && reportIds[0]) || '';
    
    try {
      console.log(`[ROBUST-DATA] Starting robust data load for report: ${targetReportId}`);
      
      // Run diagnostics for debugging (non-blocking)
      try {
        await logReportDiagnostics(targetReportId);
      } catch (diagnosticError) {
        console.warn('[ROBUST-DATA] Diagnostic logging failed:', diagnosticError);
      }
      
      // Check if data sources exist
      const hasDataSources = await checkDataSources(targetReportId);
      if (!hasDataSources) {
        console.warn('[ROBUST-DATA] No data sources found for report');
        setTableData([]);
        setTotalData({});
        setTotalCompareData({});
        setTotalChangeData({});
        setLoadError('No data sources configured for this report');
        return;
      }
      
      // Fetch data with fallback strategies
      const rawData = await fetchDataWithFallbacks(targetReportId);
      console.log(`[ROBUST-DATA] Fetched ${rawData.length} raw rows`);
      
      if (rawData.length === 0) {
        console.log('[ROBUST-DATA] No data found');
        setTableData([]);
        setTotalData({});
        setTotalCompareData({});
        setTotalChangeData({});
        setLoadError('No data found for the selected criteria');
        return;
      }
      
      // Apply dimension sync auto-fix
      let fixedData: any[];
      try {
        fixedData = await autoFixDimensionSync(rawData, dimensions);
        console.log(`[ROBUST-DATA] Applied auto-fix to ${fixedData.length} rows`);
      } catch (autoFixError) {
        console.warn('[ROBUST-DATA] Auto-fix failed, using original data:', autoFixError);
        fixedData = rawData;
      }
      
      // Transform data to table format
      const transformedData = transformDataToTable(fixedData, dimensions);
      console.log(`[ROBUST-DATA] Transformed to ${transformedData.length} table rows`);
      
      // Calculate totals
      const calculatedTotals = calculateTotals(transformedData, dimensions);
      
      // Set final data
      setTableData(transformedData);
      setTotalData(calculatedTotals);
      setTotalCompareData({});
      setTotalChangeData({});
      setRetryCount(0); // Reset retry count on success
      
      console.log(`[ROBUST-DATA] Successfully loaded ${transformedData.length} rows`);
      
    } catch (error) {
      console.error('[ROBUST-DATA] Error loading performance data:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      // Implement retry logic for transient errors
      if (retryCount < 2 && (
        errorMessage.includes('network') || 
        errorMessage.includes('timeout') || 
        errorMessage.includes('fetch')
      )) {
        console.log(`[ROBUST-DATA] Retrying... (attempt ${retryCount + 1})`);
        setRetryCount(prev => prev + 1);
        setTimeout(() => loadPerformanceData(), 2000 * (retryCount + 1)); // Exponential backoff
        return;
      }
      
      setLoadError(errorMessage);
      setTableData([]);
      setTotalData({});
      setTotalCompareData({});
      setTotalChangeData({});
      
      toast({
        title: "Data Loading Error",
        description: `Failed to load data: ${errorMessage}. ${retryCount >= 2 ? 'Please refresh the page or contact support.' : 'Retrying...'}`,
        variant: "destructive",
      });
    } finally {
      setIsLoadingData(false);
      onLoadingComplete?.();
    }
  }, [
    validatePrerequisites,
    reportId,
    reportIds,
    checkDataSources,
    fetchDataWithFallbacks,
    transformDataToTable,
    calculateTotals,
    dimensions,
    retryCount,
    onLoadingComplete,
  ]);

  // Auto-load data when dependencies change
  useEffect(() => {
    if (reportId || (reportIds && reportIds.length > 0)) {
      loadPerformanceData();
    }
  }, [
    reportId,
    JSON.stringify(reportIds),
    JSON.stringify(groupByDimensions),
    JSON.stringify(breakdownByDimensions),
    JSON.stringify(thenByDimensions),
    JSON.stringify(Array.from(visibleColumns)),
    JSON.stringify(filters.dimensionFilters),
    filters.dateRange?.from?.toISOString(),
    filters.dateRange?.to?.toISOString(),
    dimensions.length,
    vlookupMappings.length,
    activeDateTab,
    dateOrder,
  ]);

  return {
    tableData,
    totalData,
    totalCompareData,
    totalChangeData,
    isLoadingData,
    loadError,
    retryCount,
    loadPerformanceData,
  };
}