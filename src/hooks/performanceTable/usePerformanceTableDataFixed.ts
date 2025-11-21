import { useState, useCallback, useEffect } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useVlookupMappings } from "@/hooks/useVlookupMappings";
import type { FilterState } from "@/components/FiltersBar";
import type { Dimension } from "./usePerformanceTableDimensions";
import { autoFixDimensionSync } from "@/lib/dimension-sync-auto-fix";
import { logReportDiagnostics } from "@/lib/debug-report-issues";

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

interface UsePerformanceTableDataFixedOptions {
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
}: UsePerformanceTableDataFixedOptions) {
  const [tableData, setTableData] = useState<TableRow[]>([]);
  const [totalData, setTotalData] = useState<Record<string, any>>({});
  const [totalCompareData, setTotalCompareData] = useState<Record<string, any>>({});
  const [totalChangeData, setTotalChangeData] = useState<Record<string, number>>({});
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [loadingStrategy, setLoadingStrategy] = useState<string>('');

  const { data: vlookupMappings = [] } = useVlookupMappings(reportId || undefined, accountId);

  // Validate prerequisites
  const validatePrerequisites = useCallback((): { valid: boolean; reason?: string } => {
    if (!reportId && (!reportIds || reportIds.length === 0)) {
      return { valid: false, reason: 'No report ID provided' };
    }
    if (groupByDimensions.length === 0) {
      return { valid: false, reason: 'No group by dimensions selected' };
    }
    if (dimensions.length === 0) {
      return { valid: false, reason: 'Dimensions not loaded yet' };
    }
    return { valid: true };
  }, [reportId, reportIds, groupByDimensions, dimensions]);

  // Strategy 1: Use edge function (preferred)
  const loadDataViaEdgeFunction = useCallback(async (targetReportId: string): Promise<any[]> => {
    console.log('[DATA-FIXED] Strategy 1: Using edge function');
    setLoadingStrategy('Edge Function');
    
    const { data: { user } } = await supabase.auth.getUser();
    
    const response = await supabase.functions.invoke('get-performance-data', {
      body: {
        reportId: targetReportId,
        accountId,
        userId: user?.id,
        dateFrom: filters.dateRange?.from ? format(filters.dateRange.from, 'yyyy-MM-dd') : undefined,
        dateTo: filters.dateRange?.to ? format(filters.dateRange.to, 'yyyy-MM-dd') : undefined,
        dimensionFilters: filters.dimensionFilters || {},
        limit: 50000,
        offset: 0,
      },
    });

    // Enhanced error checking for edge function response
    if (response.error) {
      throw new Error(`Edge function error: ${response.error.message || response.error}`);
    }

    if (!response.data) {
      throw new Error('Edge function returned no data');
    }

    // Check if the response contains an error field (edge function returns 200 with error)
    if (response.data.error) {
      throw new Error(`Edge function reported error: ${response.data.error}`);
    }

    const data = response.data.data || [];
    console.log(`[DATA-FIXED] Edge function returned ${data.length} rows`);
    return data;
  }, [accountId, filters]);

  // Strategy 2: Direct database query
  const loadDataViaDirectQuery = useCallback(async (targetReportId: string): Promise<any[]> => {
    console.log('[DATA-FIXED] Strategy 2: Direct database query');
    setLoadingStrategy('Direct Database');
    
    let query = supabase
      .from('dimension_data')
      .select('dimension_values, row_number, data_source_id')
      .eq('report_id', targetReportId)
      .order('row_number', { ascending: true });

    // Apply date filter at database level if possible
    const dateFromFormatted = filters.dateRange?.from ? format(filters.dateRange.from, 'yyyy-MM-dd') : undefined;
    const dateToFormatted = filters.dateRange?.to ? format(filters.dateRange.to, 'yyyy-MM-dd') : undefined;
    
    if (dateFromFormatted || dateToFormatted) {
      // Find date dimension
      const dateDimension = dimensions.find(d => d.type === 'date');
      if (dateDimension) {
        if (dateFromFormatted) {
          query = query.gte(`dimension_values->>${dateDimension.id}`, dateFromFormatted);
        }
        if (dateToFormatted) {
          query = query.lte(`dimension_values->>${dateDimension.id}`, dateToFormatted);
        }
      }
    }

    const { data, error } = await query.limit(10000);
    
    if (error) {
      throw new Error(`Database query error: ${error.message}`);
    }

    console.log(`[DATA-FIXED] Direct query returned ${data?.length || 0} rows`);
    return data || [];
  }, [filters, dimensions]);

  // Strategy 3: Minimal data fetch (fallback)
  const loadDataViaMinimalQuery = useCallback(async (targetReportId: string): Promise<any[]> => {
    console.log('[DATA-FIXED] Strategy 3: Minimal query fallback');
    setLoadingStrategy('Minimal Query');
    
    const { data, error } = await supabase
      .from('dimension_data')
      .select('dimension_values')
      .eq('report_id', targetReportId)
      .limit(1000);

    if (error) {
      throw new Error(`Minimal query error: ${error.message}`);
    }

    const processedData = (data || []).map((row, index) => ({
      ...row,
      row_number: index + 1,
      data_source_id: null
    }));

    console.log(`[DATA-FIXED] Minimal query returned ${processedData.length} rows`);
    return processedData;
  }, []);

  // Main data loading with multiple strategies
  const loadPerformanceData = useCallback(async () => {
    const validation = validatePrerequisites();
    if (!validation.valid) {
      console.log(`[DATA-FIXED] Skipping load: ${validation.reason}`);
      setTableData([]);
      setTotalData({});
      setTotalCompareData({});
      setTotalChangeData({});
      setLoadError(null);
      setIsLoadingData(false);
      onLoadingComplete?.();
      return;
    }

    setIsLoadingData(true);
    setLoadError(null);
    setLoadingStrategy('');

    const targetReportId = reportId || (reportIds && reportIds[0]) || '';
    
    try {
      console.log(`[DATA-FIXED] Starting enhanced data load for report: ${targetReportId}`);
      
      // Run diagnostics (non-blocking)
      try {
        await logReportDiagnostics(targetReportId);
      } catch (diagnosticError) {
        console.warn('[DATA-FIXED] Diagnostic logging failed:', diagnosticError);
      }

      // Check if data sources exist
      const { data: dataSources, error: dsError } = await supabase
        .from('data_sources')
        .select('id')
        .eq('report_id', targetReportId)
        .limit(1);

      if (dsError) {
        throw new Error(`Data source check failed: ${dsError.message}`);
      }

      if (!dataSources || dataSources.length === 0) {
        console.warn('[DATA-FIXED] No data sources found');
        setTableData([]);
        setTotalData({});
        setTotalCompareData({});
        setTotalChangeData({});
        setLoadError('No data sources configured for this report');
        return;
      }

      // Try multiple loading strategies
      const strategies = [
        loadDataViaEdgeFunction,
        loadDataViaDirectQuery,
        loadDataViaMinimalQuery
      ];

      let rawData: any[] = [];
      let lastError: Error | null = null;

      for (let i = 0; i < strategies.length; i++) {
        try {
          rawData = await strategies[i](targetReportId);
          console.log(`[DATA-FIXED] Strategy ${i + 1} succeeded with ${rawData.length} rows`);
          break;
        } catch (error) {
          console.warn(`[DATA-FIXED] Strategy ${i + 1} failed:`, error);
          lastError = error as Error;
          
          // Add delay between strategies
          if (i < strategies.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      if (rawData.length === 0 && lastError) {
        throw lastError;
      }

      if (rawData.length === 0) {
        console.log('[DATA-FIXED] No data found');
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
        console.log(`[DATA-FIXED] Applied auto-fix to ${fixedData.length} rows`);
      } catch (autoFixError) {
        console.warn('[DATA-FIXED] Auto-fix failed, using original data:', autoFixError);
        fixedData = rawData;
      }

      // Apply vlookup mappings
      if (vlookupMappings.length > 0) {
        try {
          for (const row of fixedData) {
            const dv = (row.dimension_values || {}) as Record<string, any>;
            for (const m of vlookupMappings) {
              const src = dv[m.sourceDimensionId];
              if (src !== undefined && src !== null) {
                if (String(src).toLowerCase() === m.sourceValue.toLowerCase()) {
                  dv[m.targetDimensionId] = m.targetValue;
                }
              }
            }
            row.dimension_values = dv;
          }
          console.log(`[DATA-FIXED] Applied ${vlookupMappings.length} vlookup mappings`);
        } catch (vlookupError) {
          console.warn('[DATA-FIXED] Vlookup mapping failed:', vlookupError);
        }
      }

      // Apply client-side filtering if not already done
      let filteredData = fixedData;
      
      // Date filtering
      const dateFromFormatted = filters.dateRange?.from ? format(filters.dateRange.from, 'yyyy-MM-dd') : undefined;
      const dateToFormatted = filters.dateRange?.to ? format(filters.dateRange.to, 'yyyy-MM-dd') : undefined;
      
      if ((dateFromFormatted || dateToFormatted) && loadingStrategy !== 'Direct Database') {
        const dateDimension = dimensions.find(d => d.type === 'date');
        if (dateDimension) {
          const fromDate = dateFromFormatted ? new Date(dateFromFormatted) : null;
          const toDate = dateToFormatted ? new Date(dateToFormatted) : null;
          const adjustedToDate = toDate
            ? new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1)
            : null;

          filteredData = filteredData.filter((row: any) => {
            const dv = row.dimension_values || {};
            const val = dv[dateDimension.id];
            if (!val) return true;
            
            try {
              const rowDate = new Date(String(val));
              if (isNaN(rowDate.getTime())) return true;
              if (fromDate && rowDate < fromDate) return false;
              if (adjustedToDate && rowDate >= adjustedToDate) return false;
              return true;
            } catch {
              return true;
            }
          });
        }
      }

      // Dimension filtering
      if (filters.dimensionFilters && Object.keys(filters.dimensionFilters).length > 0) {
        const normalizedFilters: Record<string, string[]> = {};
        for (const [k, v] of Object.entries(filters.dimensionFilters)) {
          if (Array.isArray(v)) normalizedFilters[k] = v.map(x => String(x));
          else if (v !== undefined && v !== null) normalizedFilters[k] = [String(v)];
        }

        filteredData = filteredData.filter((row: any) => {
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

      // Transform to table format
      const transformedRows = filteredData.map((row: any, idx: number) => {
        const dv: Record<string, any> = row.dimension_values || {};
        const rowData: Record<string, any> = {};

        dimensions.forEach(dim => {
          if (dv[dim.id] !== undefined) {
            let value = dv[dim.id];
            
            if (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage') {
              const numValue = parseFloat(String(value));
              rowData[dim.name] = !isNaN(numValue) ? numValue : 0;
            } else {
              rowData[dim.name] = value;
            }
          } else {
            // Set default values for missing dimensions
            rowData[dim.name] = dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage' ? 0 : '';
          }
        });

        const firstDimId = groupByDimensions[0];
        const firstDimension = dimensions.find(d => d.id === firstDimId);
        const originalDate = firstDimension?.type === 'date' ? dv[firstDimId] : undefined;

        return {
          id: `row-${row.row_number ?? idx + 1}`,
          name: String(dv[firstDimId] || 'Unknown'),
          level: 0,
          data: rowData,
          originalDate,
        };
      });

      // Calculate totals
      const calculatedTotals: Record<string, any> = {};
      transformedRows.forEach(row => {
        Object.keys(row.data).forEach(dimName => {
          const dim = dimensions.find(d => d.name === dimName);
          if (dim && (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage')) {
            const value = parseFloat(String(row.data[dimName] || '0'));
            if (!isNaN(value)) {
              calculatedTotals[dimName] = (calculatedTotals[dimName] || 0) + value;
            }
          }
        });
      });

      // Set final data
      setTableData(transformedRows);
      setTotalData(calculatedTotals);
      setTotalCompareData({});
      setTotalChangeData({});
      setRetryCount(0);

      console.log(`[DATA-FIXED] Successfully loaded ${transformedRows.length} rows using ${loadingStrategy}`);

    } catch (error) {
      console.error('[DATA-FIXED] Error loading performance data:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      // Implement retry logic for transient errors
      if (retryCount < 2 && (
        errorMessage.includes('network') || 
        errorMessage.includes('timeout') || 
        errorMessage.includes('fetch') ||
        errorMessage.includes('Edge function')
      )) {
        console.log(`[DATA-FIXED] Retrying... (attempt ${retryCount + 1})`);
        setRetryCount(prev => prev + 1);
        setTimeout(() => loadPerformanceData(), 2000 * (retryCount + 1));
        return;
      }
      
      setLoadError(errorMessage);
      setTableData([]);
      setTotalData({});
      setTotalCompareData({});
      setTotalChangeData({});
      
      toast({
        title: "Data Loading Error",
        description: `Failed to load data: ${errorMessage}. ${retryCount >= 2 ? 'Please refresh the page.' : 'Retrying...'}`,
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
    loadDataViaEdgeFunction,
    loadDataViaDirectQuery,
    loadDataViaMinimalQuery,
    dimensions,
    filters,
    vlookupMappings,
    retryCount,
    onLoadingComplete,
  ]);

  // Auto-load when dependencies change
  useEffect(() => {
    const validation = validatePrerequisites();
    if (validation.valid) {
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
    loadingStrategy,
    loadPerformanceData,
    setIsLoadingData,
  };
}