import { useState, useCallback, useEffect, useMemo } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useVlookupMappings } from "@/hooks/useVlookupMappings";
import type { FilterState } from "@/components/FiltersBar";
import type { Dimension } from "./usePerformanceTableDimensions";
import { useSourceData } from "@/hooks/dataSources";
import type { DataSource } from "@/lib/data-sources/types";

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
 * Hook for loading performance table data from source directly
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
  const [dataSource, setDataSource] = useState<DataSource | null>(null);

  const { data: vlookupMappings = [] } = useVlookupMappings(reportId || undefined, accountId);

  // Fetch data source for the report
  useEffect(() => {
    const fetchDataSource = async () => {
      if (!reportId) {
        setDataSource(null);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('data_sources')
          .select('*')
          .eq('report_id', reportId)
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error('[PERF-TABLE] Error fetching data source:', error);
          return;
        }

        if (data) {
          setDataSource({
            ...data,
            column_mappings: (data.column_mappings as any) || null,
          } as DataSource);
        }
      } catch (error) {
        console.error('[PERF-TABLE] Error fetching data source:', error);
      }
    };

    fetchDataSource();
  }, [reportId]);

  // Use source data hook
  const { data: sourceData, isLoading: isLoadingSource, error: sourceError } = useSourceData(
    dataSource,
    accountId,
    { enabled: !!dataSource }
  );

  const loadPerformanceData = useCallback(async () => {
    setLoadError(null);
    setIsLoadingData(true);

    // Only apply date filtering if datePreset is not "all_time" and dateRange is provided
    const shouldFilterByDate = filters.datePreset !== 'all_time' && filters.dateRange;
    const dateFromFormatted = shouldFilterByDate && filters.dateRange?.from ? format(filters.dateRange.from, 'yyyy-MM-dd') : undefined;
    const dateToFormatted = shouldFilterByDate && filters.dateRange?.to ? format(filters.dateRange.to, 'yyyy-MM-dd') : undefined;

    // Comparison date range
    const compareEnabled = filters.compareEnabled && filters.compareDateRange;
    const compareDateFromFormatted = compareEnabled && filters.compareDateRange?.from ? format(filters.compareDateRange.from, 'yyyy-MM-dd') : undefined;
    const compareDateToFormatted = compareEnabled && filters.compareDateRange?.to ? format(filters.compareDateRange.to, 'yyyy-MM-dd') : undefined;

    console.log('[PERF-TABLE] Loading data:', {
      reportId,
      datePreset: filters.datePreset,
      shouldFilterByDate,
      dateFromFormatted,
      dateToFormatted,
      compareEnabled,
      compareDateFromFormatted,
      compareDateToFormatted,
      hasSourceData: !!sourceData,
      sourceDataRows: sourceData?.transformedRows?.length || 0
    });

    if ((!reportId && !reportIds) || groupByDimensions.length === 0) {
      setTableData([]);
      setTotalData({});
      setTotalCompareData({});
      setTotalChangeData({});
      setIsLoadingData(false);
      onLoadingComplete?.();
      return;
    }

    if (!sourceData) {
      console.log('[PERF-TABLE] No source data available');
      setIsLoadingData(false);
      onLoadingComplete?.();
      return;
    }

    try {
      let allRows = sourceData.transformedRows;
      console.log('[PERF-TABLE] Starting with', allRows.length, 'rows from source');

      // Apply vlookup mappings
      if (vlookupMappings.length > 0) {
        allRows = allRows.map((row: any) => {
          const dv = { ...row.dimension_values };
          for (const m of vlookupMappings) {
            const src = dv[m.sourceDimensionId];
            if (src !== undefined && src !== null) {
              if (String(src).toLowerCase() === m.sourceValue.toLowerCase()) {
                dv[m.targetDimensionId] = m.targetValue;
              }
            }
          }
          return { ...row, dimension_values: dv };
        });
      }

      // Detect date dimension
      const dateDims = dimensions.filter(d => d.type === 'date');
      let dateDimInUse: { id: string; name: string } | null = null;
      for (const d of dateDims) {
        const found = allRows.some((r: any) => {
          const dv = r.dimension_values || {};
          return dv[d.id] !== undefined && dv[d.id] !== null && dv[d.id] !== '';
        });
        if (found) {
          dateDimInUse = { id: d.id, name: d.name };
          break;
        }
      }

      console.log('[PERF-TABLE] Date dimension:', dateDimInUse ? { id: dateDimInUse.id, name: dateDimInUse.name } : 'not found');

      // Helper function to filter rows by date range
      const filterRowsByDateRange = (rows: any[], fromDate: string | undefined, toDate: string | undefined) => {
        if (!dateDimInUse || (!fromDate && !toDate)) return rows;
        
        const from = fromDate ? new Date(fromDate) : null;
        const to = toDate ? new Date(toDate) : null;
        const adjustedTo = to ? new Date(to.getFullYear(), to.getMonth(), to.getDate() + 1) : null;

        return rows.filter((row: any) => {
          const dv = row.dimension_values || {};
          const val = dv[dateDimInUse!.id];
          if (!val) return true;
          const rowDate = new Date(String(val));
          if (from && rowDate < from) return false;
          if (adjustedTo && rowDate >= adjustedTo) return false;
          return true;
        });
      };

      // Apply date filter for current period
      let filteredRows = allRows;
      if (shouldFilterByDate) {
        filteredRows = filterRowsByDateRange(filteredRows, dateFromFormatted, dateToFormatted);
      }

      // Get comparison period rows (before dimension filters)
      let compareRows: any[] = [];
      if (compareEnabled && dateDimInUse) {
        compareRows = filterRowsByDateRange(allRows, compareDateFromFormatted, compareDateToFormatted);
      }

      // Apply dimension filters to both current and compare rows
      const normalizedFilters: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(filters.dimensionFilters || {})) {
        if (Array.isArray(v)) normalizedFilters[k] = v.map((x) => String(x));
        else if (v !== undefined && v !== null) normalizedFilters[k] = [String(v)];
      }

      const applyDimensionFilters = (rows: any[]) => {
        if (Object.keys(normalizedFilters).length === 0) return rows;
        return rows.filter((row: any) => {
          const dv = row.dimension_values || {};
          for (const [dimId, values] of Object.entries(normalizedFilters)) {
            if (!values || values.length === 0) continue;
            const rowVal = dv[dimId];
            if (rowVal === undefined || rowVal === null) return false;
            const rowStr = String(rowVal).trim().toLowerCase();
            const filterValuesLower = (values as string[]).map(v => String(v).trim().toLowerCase());
            if (!filterValuesLower.some((v) => v === rowStr)) return false;
          }
          return true;
        });
      };

      filteredRows = applyDimensionFilters(filteredRows);
      if (compareEnabled) {
        compareRows = applyDimensionFilters(compareRows);
      }

      // Build comparison data map by grouping key (first dimension value)
      const firstDimId = groupByDimensions[0];
      const firstDimension = dimensions.find(d => d.id === firstDimId);
      
      const compareDataMap: Record<string, Record<string, number>> = {};
      if (compareEnabled && compareRows.length > 0) {
        compareRows.forEach((row: any) => {
          const dv: Record<string, any> = row.dimension_values || {};
          const groupKey = String(dv[firstDimId] || 'Unknown');
          
          if (!compareDataMap[groupKey]) {
            compareDataMap[groupKey] = {};
          }
          
          dimensions.forEach(dim => {
            if (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage') {
              const value = dv[dim.id];
              if (value !== undefined && value !== null) {
                const numValue = parseFloat(String(value));
                if (!isNaN(numValue)) {
                  compareDataMap[groupKey][dim.name] = (compareDataMap[groupKey][dim.name] || 0) + numValue;
                }
              }
            }
          });
        });
      }

      // Transform to TableRow format
      const transformedRows: TableRow[] = filteredRows.map((row: any, idx: number) => {
        const dv: Record<string, any> = row.dimension_values || {};
        const rowData: Record<string, any> = {};

        dimensions.forEach(dim => {
          if (dv[dim.id] !== undefined) {
            let value = dv[dim.id];

            if (vlookupMappings.length > 0) {
              const mapping = vlookupMappings.find(m =>
                m.targetDimensionId === dim.id &&
                m.sourceValue.toLowerCase() === String(value).toLowerCase()
              );
              if (mapping) {
                value = mapping.targetValue;
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
        const groupKey = String(dv[firstDimId] || 'Unknown');

        // Attach compare data if available
        const compareData = compareEnabled ? compareDataMap[groupKey] : undefined;

        return {
          id: `row-${row.row_number ?? idx + 1}`,
          name: dv[firstDimId] || 'Unknown',
          level: 0,
          data: rowData,
          compareData,
          originalDate,
        };
      });

      setTableData(transformedRows);

      // Calculate totals for current period
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

      // Calculate totals for comparison period
      const calculatedTotalCompareData: Record<string, any> = {};
      if (compareEnabled && compareRows.length > 0) {
        compareRows.forEach((row: any) => {
          const dv = row.dimension_values || {};
          dimensions.forEach(dim => {
            if (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage') {
              const value = dv[dim.id];
              if (value !== undefined && value !== null) {
                const numValue = parseFloat(String(value));
                if (!isNaN(numValue)) {
                  const dimName = dim.name;
                  calculatedTotalCompareData[dimName] = (calculatedTotalCompareData[dimName] || 0) + numValue;
                }
              }
            }
          });
        });
      }
      setTotalCompareData(calculatedTotalCompareData);

      // Calculate change percentages
      const calculatedChangeData: Record<string, number> = {};
      if (compareEnabled) {
        const allDimNames = new Set<string>();
        Object.keys(calculatedTotalData).forEach(k => allDimNames.add(k));
        Object.keys(calculatedTotalCompareData).forEach(k => allDimNames.add(k));

        allDimNames.forEach((dimName: string) => {
          const current = calculatedTotalData[dimName] || 0;
          const previous = calculatedTotalCompareData[dimName] || 0;
          if (previous !== 0) {
            calculatedChangeData[dimName] = ((current - previous) / previous) * 100;
          } else if (current !== 0) {
            calculatedChangeData[dimName] = current > 0 ? 100 : -100;
          } else {
            calculatedChangeData[dimName] = 0;
          }
        });
      }
      setTotalChangeData(calculatedChangeData);

    } catch (error) {
      console.error('[PERF-TABLE] Error in loadPerformanceData:', error);
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
    sourceData,
    groupByDimensions,
    breakdownByDimensions,
    thenByDimensions,
    visibleColumns,
    filters.dimensionFilters,
    filters.dateRange?.from?.toISOString(),
    filters.dateRange?.to?.toISOString(),
    filters.datePreset,
    filters.compareEnabled,
    filters.compareType,
    filters.compareDateRange?.from?.toISOString(),
    filters.compareDateRange?.to?.toISOString(),
    activeDateTab,
    dateOrder,
    dimensions,
    vlookupMappings.length,
    onLoadingComplete,
  ]);

  // Load data when source data changes
  useEffect(() => {
    if (sourceData && !isLoadingSource) {
      loadPerformanceData();
    }
  }, [sourceData, isLoadingSource, loadPerformanceData]);

  // Handle source error
  useEffect(() => {
    if (sourceError) {
      setLoadError(sourceError.message);
      setIsLoadingData(false);
      onLoadingComplete?.();
    }
  }, [sourceError, onLoadingComplete]);

  const isLoading = isLoadingData || isLoadingSource;

  return {
    tableData,
    totalData,
    totalCompareData,
    totalChangeData,
    isLoadingData: isLoading,
    loadPerformanceData,
    setIsLoadingData,
    loadError: loadError || (sourceError ? sourceError.message : null),
  };
}
