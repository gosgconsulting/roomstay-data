import { useState, useEffect, useMemo, useTransition, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { retryWithBackoff } from "@/lib/utils/retry";
import { getCurrentMonthDateRange } from "@/lib/monthUtils";
import type { Dimension } from "@/lib/dimensionLoader";
import { format, parseISO } from "date-fns";
import { useUser } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { useCachedSourceData, useSourceData } from "@/hooks/dataSources";
import { usePerformanceTableDimensions } from "@/hooks/performanceTable/usePerformanceTableDimensions";
import type { DataSource } from "@/lib/data-sources/types";

interface KPIChartProps {
  reportId: string | null;
  accountId: string | null;
  filters: {
    dimensionFilters: Record<string, string[]>;
    dateRange?: { from: Date; to?: Date };
    datePreset?: string;
    compareEnabled?: boolean;
    compareType?: string;
    compareDateRange?: { from: Date; to?: Date };
  };
  visibilityRefreshTrigger?: number;
  onLoadingComplete?: () => void;
  initialMetric?: string;
  isEditMode?: boolean;
  onMetricChange?: (metric: string) => void;
  useCachedData?: boolean; // When false, fetch directly from Google Sheets/CSV
}

export function KPIChart({
  reportId,
  accountId,
  filters,
  visibilityRefreshTrigger,
  onLoadingComplete,
  initialMetric,
  isEditMode = false,
  onMetricChange,
  useCachedData = true,
}: KPIChartProps) {
  const queryClient = useQueryClient();
  const { data: userData } = useUser();
  const user = userData?.user || null;
  const [chartData, setChartData] = useState<any[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<string>(initialMetric || "Revenue");
  const [isLoading, setIsLoading] = useState(false);
  const [availableMetrics, setAvailableMetrics] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [dataSource, setDataSource] = useState<DataSource | null>(null);
  // Ref to track if chart data is ready to be loaded - fixes "used before declaration" error
  const [chartDataReady, setChartDataReady] = useState(false);

  // Load dimensions using the same hook as PerformanceTable for consistency
  const { dimensions, isLoadingDimensions, loadDimensions } = usePerformanceTableDimensions({
    reportId,
    accountId: accountId || undefined,
  });

  // Trigger dimension loading when reportId or accountId changes
  // Load dimensions even for anonymous users (shared reports)
  useEffect(() => {
    if (reportId || accountId) {
      loadDimensions();
    }
  }, [reportId, accountId, loadDimensions]);

  // Fetch data source config for direct source loading
  useEffect(() => {
    const fetchDataSource = async () => {
      if (!reportId || useCachedData) {
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

        if (!error && data) {
          setDataSource({
            ...data,
            column_mappings: (data.column_mappings as any) || null,
          } as DataSource);
        }
      } catch (error) {
        console.error('[CHART] Error fetching data source:', error);
      }
    };

    fetchDataSource();
  }, [reportId, useCachedData]);

  // Use cached source data hook - fetches from dimension_data table (instant loading)
  const { 
    data: cachedData, 
    isLoading: isLoadingCached,
    isFetching: isFetchingCached,
  } = useCachedSourceData(reportId, { 
    enabled: !!reportId && useCachedData 
  });

  // Use direct source data hook - fetches from Google Sheets/CSV (slower but always fresh)
  const {
    data: directData,
    isLoading: isLoadingDirect,
  } = useSourceData(dataSource, accountId, {
    enabled: !!dataSource && !useCachedData,
  });

  // Determine which data source to use
  const isLoadingSource = useCachedData ? isLoadingCached : isLoadingDirect;

  // Transform data to match expected format
  const sourceData = useMemo(() => {
    if (useCachedData) {
      if (!cachedData) return null;
      return {
        transformedRows: cachedData.transformedRows,
        rowCount: cachedData.rowCount
      };
    } else {
      if (!directData) return null;
      return {
        transformedRows: directData.transformedRows,
        rowCount: directData.transformedRows.length
      };
    }
  }, [useCachedData, cachedData, directData]);

  // Create a stable reference for filters to prevent unnecessary re-renders
  const stableFilters = useMemo(() => {
    return {
      dimensionFilters: filters.dimensionFilters,
      dateRange: filters.dateRange,
      datePreset: filters.datePreset || 'all_time',
      compareEnabled: filters.compareEnabled,
      compareType: filters.compareType,
      compareDateRange: filters.compareDateRange,
    };
  }, [
    JSON.stringify(filters.dimensionFilters),
    filters.dateRange?.from?.toISOString(),
    filters.dateRange?.to?.toISOString(),
    filters.datePreset,
    filters.compareEnabled,
    filters.compareType,
    filters.compareDateRange?.from?.toISOString(),
    filters.compareDateRange?.to?.toISOString(),
  ]);

  useEffect(() => {
    // Wait for all required data before processing
    if (!reportId || !accountId) {
      onLoadingComplete?.();
      setChartDataReady(false);
      return;
    }
    
    if (!sourceData || isLoadingSource) {
      // Still loading source data
      setChartDataReady(false);
      return;
    }
    
    if (!dimensions || dimensions.length === 0 || isLoadingDimensions) {
      // Still loading dimensions
      setChartDataReady(false);
      return;
    }
    
    // All data ready - set flag to trigger chart loading
    setChartDataReady(true);
  }, [reportId, accountId, stableFilters, selectedMetric, sourceData, isLoadingSource, dimensions, isLoadingDimensions, onLoadingComplete]);

  // Keep selectedMetric in sync if parent changes initialMetric
  useEffect(() => {
    if (initialMetric && initialMetric !== selectedMetric) {
      setSelectedMetric(initialMetric);
    }
  }, [initialMetric]);

  // Handler to update selection and notify parent (for persistence)
  const handleMetricChange = (m: string) => {
    setSelectedMetric(m);
    if (isEditMode) {
      onMetricChange?.(m);
    }
  };

  const loadChartData = useCallback(async () => {
    // Helper functions defined inside to ensure they're always in sync
    const meetsConditions = (dv: Record<string, any>, conditions?: { dimension_id: string; operator: 'equals' | 'not_equals' | 'contains' | 'not_contains'; value: string }[]) => {
      if (!conditions || conditions.length === 0) return true;
      return conditions.every(cond => {
        const raw = dv[cond.dimension_id];
        if (raw === undefined || raw === null) return false;
        const rowVal = String(raw).trim().toLowerCase();
        const target = String(cond.value).trim().toLowerCase();
        switch (cond.operator) {
          case 'equals': return rowVal === target;
          case 'not_equals': return rowVal !== target;
          case 'contains': return rowVal.includes(target);
          case 'not_contains': return !rowVal.includes(target);
          default: return false;
        }
      });
    };

    const evaluateFormulaForRow = (formula: string, dv: Record<string, any>, dimensions: Dimension[]): number | null => {
      if (!formula) return null;
      let expr = formula;
      expr = expr.replace(/(\d+(?:\.\d+)?)\s*%/g, (_, num) => `(${parseFloat(num) / 100})`);
      for (const dim of dimensions) {
        const val = dv[dim.id];
        const numeric = typeof val === 'number' ? val : (val !== undefined && val !== null ? parseFloat(String(val)) : 0);
        const re = new RegExp(`\\b${dim.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
        expr = expr.replace(re, String(isFinite(numeric) ? numeric : 0));
      }
      if (expr.includes('/ 0')) return 0;
      try {
        const result = Function(`"use strict"; return (${expr})`)();
        return isFinite(result) ? Number(result) : null;
      } catch {
        return null;
      }
    };

    const getMetricValueForRow = (
      dv: Record<string, any>,
      metricDimension: Dimension,
      dimensions: Dimension[]
    ): number | null => {
      const direct = dv[metricDimension.id];
      if (direct !== undefined && direct !== null) {
        return typeof direct === 'number' ? direct : parseFloat(String(direct)) || 0;
      }
      const pairs = (metricDimension as any).formula_condition_pairs as
        { formula: string; conditions?: { dimension_id: string; operator: any; value: string }[] }[] | undefined;
      if (pairs && pairs.length > 0) {
        const matched = pairs.find(p => meetsConditions(dv, p.conditions)) || pairs[0];
        const val = evaluateFormulaForRow(matched?.formula || '', dv, dimensions);
        return val ?? null;
      }
      const singleFormula = (metricDimension as any).formula as string | undefined;
      if (singleFormula) {
        const val = evaluateFormulaForRow(singleFormula, dv, dimensions);
        return val ?? null;
      }
      return null;
    };

    console.log('[CHART-FIXED] Loading chart data for metric:', selectedMetric);
    setIsLoading(true);
    
    try {
      if (!reportId || !accountId || !sourceData || !dimensions || dimensions.length === 0) {
        console.error('[CHART-FIXED] Missing required data:', { 
          reportId, 
          accountId, 
          hasSourceData: !!sourceData,
          dimensionsCount: dimensions.length 
        });
        setChartData([]);
        return;
      }

      // Only apply date filtering if datePreset is not "all_time" and dateRange is provided
      // If "all_time" is selected, don't filter by date at all
      const shouldFilterByDate = stableFilters.datePreset !== 'all_time' && stableFilters.dateRange;
      const dateRange = shouldFilterByDate ? stableFilters.dateRange : undefined;

      console.log('[CHART-FIXED] Loading data with filters:', { 
        dateRange, 
        datePreset: stableFilters.datePreset,
        shouldFilterByDate,
        dimensionFilters: stableFilters.dimensionFilters 
      });

      // Start with source data
      let filteredData = sourceData.transformedRows.map((row: any, idx: number) => ({
        id: `row-${row.row_number ?? idx + 1}`,
        dimension_values: row.dimension_values || {},
        row_number: row.row_number ?? idx + 1,
        data_source_id: null,
      }));

      console.log('[CHART-FIXED] Loaded raw data rows from source:', filteredData.length);
      console.log('[CHART-FIXED] Source data sample:', sourceData.transformedRows.slice(0, 2));
      console.log('[CHART-FIXED] Dimensions loaded:', dimensions.map(d => ({ id: d.id, name: d.name, type: d.type })));

      // Apply date filter only if datePreset is not "all_time"
      if (shouldFilterByDate && dateRange && (dateRange.from || dateRange.to)) {
        const fromDate = dateRange.from ? new Date(dateRange.from) : null;
        const toDate = dateRange.to ? new Date(dateRange.to) : null;
        const adjustedToDate = toDate
          ? new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1)
          : null;

        // Find date dimension
        const dateDimension = dimensions.find(d => d.type === 'date');
        
        if (dateDimension) {
          filteredData = filteredData.filter((row: any) => {
            const dv = row.dimension_values || {};
            const dateValue = dv[dateDimension.id];
            if (!dateValue) return true; // Keep rows without date

            const rowDate = new Date(String(dateValue));
            if (fromDate && rowDate < fromDate) return false;
            if (adjustedToDate && rowDate >= adjustedToDate) return false;
            return true;
          });
        }
      }

      // Apply dimension filters
      if (stableFilters.dimensionFilters && Object.keys(stableFilters.dimensionFilters).length > 0) {
        const normalizedFilters: Record<string, string[]> = {};
        for (const [k, v] of Object.entries(stableFilters.dimensionFilters)) {
          if (Array.isArray(v)) normalizedFilters[k] = v.map((x) => String(x));
          else if (v !== undefined && v !== null) normalizedFilters[k] = [String(v)];
        }

        filteredData = filteredData.filter((row: any) => {
          const dv = row.dimension_values || {};
          for (const [dimId, values] of Object.entries(normalizedFilters)) {
            // If filter is explicitly set to empty array, filter out all rows (show zero data)
            if (values && values.length === 0) {
              return false; // Explicitly empty = no matches = zero data
            }
            
            // If filter is not set (undefined/null), skip (show all)
            if (!values) continue;

            const rowVal = dv[dimId];
            if (rowVal === undefined || rowVal === null) return false;

            const rowStr = String(rowVal).trim().toLowerCase();
            const filterValuesLower = (values as string[]).map(v => String(v).trim().toLowerCase());

            if (!filterValuesLower.some((v) => v === rowStr)) return false;
          }
          return true;
        });
      }

      console.log('[CHART-FIXED] Filtered data rows:', filteredData.length);

      if (filteredData.length === 0) {
        setChartData([]);
        return;
      }

      // Set available metrics from dimensions
      const metrics = dimensions
        .filter(d => d.type === 'number' || d.type === 'currency' || d.type === 'percentage')
        .map(d => d.name);
      
      setAvailableMetrics(metrics);

      // If selected metric is not available, select the first available one
      if (!metrics.includes(selectedMetric) && metrics.length > 0) {
        setSelectedMetric(metrics[0]);
        return; // This will trigger a re-render with the new metric
      }

      // Find the date and selected metric dimensions
      const dateDimension = dimensions.find(d => d.type === 'date');
      const metricDimension = dimensions.find(d => d.name === selectedMetric);

      console.log('[CHART-FIXED] Dimension lookup:', {
        dateDimension: dateDimension ? { id: dateDimension.id, name: dateDimension.name } : null,
        metricDimension: metricDimension ? { id: metricDimension.id, name: metricDimension.name } : null,
        selectedMetric,
        allDimensionNames: dimensions.map(d => d.name),
        allMetricNames: dimensions.filter(d => d.type === 'number' || d.type === 'currency' || d.type === 'percentage').map(d => d.name)
      });

      if (!dateDimension || !metricDimension) {
        console.warn('[CHART-FIXED] Missing required dimensions:', { 
          dateDimension: !!dateDimension, 
          metricDimension: !!metricDimension,
          availableDimensions: dimensions.map(d => ({ name: d.name, type: d.type })),
          selectedMetric
        });
        setChartData([]);
        return;
      }

      // Group current period data by date (supports derived metrics via formulas)
      const currentDateGroups = new Map<string, number>();
      let rowsWithData = 0;
      let rowsWithoutDate = 0;
      let rowsWithoutMetric = 0;
      
      filteredData.forEach(row => {
        const dv = row.dimension_values;
        const dateStr = dv[dateDimension.id];
        const metricValue = getMetricValueForRow(dv, metricDimension, dimensions);

        if (!dateStr) {
          rowsWithoutDate++;
          return;
        }
        
        if (metricValue === null || metricValue === undefined) {
          rowsWithoutMetric++;
          return;
        }

        rowsWithData++;
        const numericValue = typeof metricValue === 'number' ? metricValue : parseFloat(String(metricValue)) || 0;
        const currentTotal = currentDateGroups.get(dateStr) || 0;
        currentDateGroups.set(dateStr, currentTotal + numericValue);
      });

      // console.log('[CHART-FIXED] Data grouping stats:', {
      //   totalRows: filteredData.length,
      //   rowsWithData,
      //   rowsWithoutDate,
      //   rowsWithoutMetric,
      //   uniqueDates: currentDateGroups.size,
      //   sampleDates: Array.from(currentDateGroups.keys()).slice(0, 5)
      // });

      // Only load previous period data if comparison is enabled and we have a date range
      const previousDateGroups = new Map<string, number>();
      
      if (stableFilters.compareEnabled && shouldFilterByDate && dateRange?.from && dateRange?.to) {
        console.log('[CHART-FIXED] Comparison enabled, loading previous period data');
        
        // Calculate date ranges for current and previous periods
        const currentPeriod = dateRange;
        const daysDiff = Math.ceil((currentPeriod.to!.getTime() - currentPeriod.from.getTime()) / (1000 * 60 * 60 * 24));
        
        const previousPeriodEnd = new Date(currentPeriod.from);
        previousPeriodEnd.setDate(previousPeriodEnd.getDate() - 1);
        const previousPeriodStart = new Date(previousPeriodEnd);
        previousPeriodStart.setDate(previousPeriodStart.getDate() - daysDiff + 1);

        console.log('[CHART-FIXED] Period comparison:', {
          current: { from: currentPeriod.from.toISOString(), to: currentPeriod.to?.toISOString() },
          previous: { from: previousPeriodStart.toISOString(), to: previousPeriodEnd.toISOString() },
          daysDiff
        });

        // For previous period, we need to filter the same source data with different date range
        // Since we already have sourceData, we can filter it directly
        let previousData = sourceData.transformedRows.map((row: any, idx: number) => ({
          id: `row-${row.row_number ?? idx + 1}`,
          dimension_values: row.dimension_values || {},
          row_number: row.row_number ?? idx + 1,
          data_source_id: null,
        }));

        // Apply date filter for previous period
        const prevFromDate = new Date(previousPeriodStart);
        const prevToDate = new Date(previousPeriodEnd);
        const prevAdjustedToDate = new Date(prevToDate.getFullYear(), prevToDate.getMonth(), prevToDate.getDate() + 1);

        const dateDimension = dimensions.find(d => d.type === 'date');
        if (dateDimension) {
          previousData = previousData.filter((row: any) => {
            const dv = row.dimension_values || {};
            const dateValue = dv[dateDimension.id];
            if (!dateValue) return true;

            const rowDate = new Date(String(dateValue));
            if (rowDate < prevFromDate) return false;
            if (rowDate >= prevAdjustedToDate) return false;
            return true;
          });
        }

        // Apply same dimension filters
        if (stableFilters.dimensionFilters && Object.keys(stableFilters.dimensionFilters).length > 0) {
          const normalizedFilters: Record<string, string[]> = {};
          for (const [k, v] of Object.entries(stableFilters.dimensionFilters)) {
            if (Array.isArray(v)) normalizedFilters[k] = v.map((x) => String(x));
            else if (v !== undefined && v !== null) normalizedFilters[k] = [String(v)];
          }

          previousData = previousData.filter((row: any) => {
            const dv = row.dimension_values || {};
            for (const [dimId, values] of Object.entries(normalizedFilters)) {
              // If filter is explicitly set to empty array, filter out all rows (show zero data)
              if (values && values.length === 0) {
                return false; // Explicitly empty = no matches = zero data
              }
              
              // If filter is not set (undefined/null), skip (show all)
              if (!values) continue;

              const rowVal = dv[dimId];
              if (rowVal === undefined || rowVal === null) return false;

              const rowStr = String(rowVal).trim().toLowerCase();
              const filterValuesLower = (values as string[]).map(v => String(v).trim().toLowerCase());

              if (!filterValuesLower.some((v) => v === rowStr)) return false;
            }
            return true;
          });
        }

        // Group previous period data by date (offset by the period difference)
        previousData.forEach(row => {
          const dv = row.dimension_values;
          const dateStr = dv[dateDimension.id];
          const metricValue = getMetricValueForRow(dv, metricDimension, dimensions);

          if (dateStr && metricValue !== null && metricValue !== undefined) {
            const numericValue = typeof metricValue === 'number' ? metricValue : parseFloat(String(metricValue)) || 0;
            
            const originalDate = parseISO(String(dateStr));
            const offsetDate = new Date(originalDate);
            offsetDate.setDate(offsetDate.getDate() + daysDiff + 1);
            const offsetDateStr = offsetDate.toISOString().split('T')[0];
            
            const currentTotal = previousDateGroups.get(offsetDateStr) || 0;
            previousDateGroups.set(offsetDateStr, currentTotal + numericValue);
          }
        });
      } else {
        console.log('[CHART-FIXED] Comparison disabled, skipping previous period data');
      }

      // Create chart data
      const allDates = new Set([...currentDateGroups.keys(), ...previousDateGroups.keys()]);
      
      if (allDates.size === 0) {
        console.warn('[CHART-FIXED] No dates found in grouped data. This means no rows had both date and metric values.');
        setChartData([]);
        return;
      }
      
      const chartDataArray = Array.from(allDates)
        .map(dateStr => {
          const dataPoint: any = {
            date: dateStr,
            formattedDate: format(parseISO(dateStr), 'MMM dd'),
            [selectedMetric]: currentDateGroups.get(dateStr) || 0,
          };
          
          if (stableFilters.compareEnabled && previousDateGroups.size > 0) {
            dataPoint[`${selectedMetric}_previous`] = previousDateGroups.get(dateStr) || 0;
          }
          
          return dataPoint;
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      console.log('[CHART-FIXED] Chart data prepared:', {
        dataPoints: chartDataArray.length,
        metric: selectedMetric,
        compareEnabled: stableFilters.compareEnabled,
        currentPeriodPoints: Array.from(currentDateGroups.keys()).length,
        previousPeriodPoints: Array.from(previousDateGroups.keys()).length,
        sampleData: chartDataArray.slice(0, 3)
      });

      setChartData(chartDataArray);

    } catch (error) {
      console.error('[CHART-FIXED] Error loading chart data:', error);
      setChartData([]);
    } finally {
      setIsLoading(false);
      onLoadingComplete?.();
    }
  }, [reportId, accountId, sourceData, dimensions, stableFilters, selectedMetric, onLoadingComplete]);

  // Effect to trigger loadChartData when all data is ready
  useEffect(() => {
    if (chartDataReady) {
      startTransition(() => {
        loadChartData();
      });
    }
  }, [chartDataReady, loadChartData, startTransition]);

     const formatTooltipValue = (value: number, name: string) => {
     // Clean the metric name for formatting (remove _previous suffix)
     const cleanName = name.replace('_previous', '');
     
     if (cleanName.includes('Rate') || cleanName.includes('CTR') || cleanName.includes('Cost of sale')) {
       return `${value.toFixed(2)}%`;
     } else if (cleanName.includes('Cost') || cleanName.includes('Revenue') || cleanName.includes('CPC') || cleanName.includes('CPM')) {
       return `$${value.toLocaleString()}`;
     } else {
       return value.toLocaleString();
     }
   };

  // Show skeleton only on initial load when no data is available
  // Use same pattern as PerformanceTable - show data immediately if cached
  // Include dimensions loading state to match table behavior
  const hasAnyData = chartData.length > 0 || (useCachedData && !!cachedData);
  const isStillLoading = isLoadingSource || isLoadingDimensions;
  const showSkeleton = isStillLoading && !hasAnyData;
  
  if (showSkeleton) {
    return (
      <Card className="bg-card border border-border rounded-lg">
        <CardHeader className="pb-2 pt-4 px-4">
          <Skeleton className="h-4 w-20" />
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="h-48 flex flex-col gap-4">
            <div className="flex gap-2 h-full">
              <div className="flex flex-col justify-between py-2">
                <Skeleton className="h-3 w-8" />
                <Skeleton className="h-3 w-8" />
                <Skeleton className="h-3 w-8" />
              </div>
              <div className="flex-1 flex flex-col justify-end">
                <div className="flex items-end justify-between gap-1 h-[140px] px-2">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <Skeleton
                      key={i}
                      className="flex-1 max-w-6 rounded-t"
                      style={{ height: `${30 + Math.sin(i * 0.8) * 40 + 20}%` }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (chartData.length === 0) {
    return (
      <Card className="bg-card border border-border rounded-lg">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-medium text-foreground">{selectedMetric}</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            No data available
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-card border border-border rounded-lg">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-medium text-foreground">{selectedMetric}</CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id={`colorGradient-${selectedMetric}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05}/>
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="formattedDate" 
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis 
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} 
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip 
                formatter={(value: number, name: string) => [
                  formatTooltipValue(value, name),
                  name
                ]}
                labelFormatter={(label) => `${label}`}
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                  fontSize: '12px',
                }}
              />
              <Area 
                type="monotone" 
                dataKey={selectedMetric} 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                fill={`url(#colorGradient-${selectedMetric})`}
                name="Current Period"
              />
              {stableFilters.compareEnabled && (
                <Area 
                  type="monotone" 
                  dataKey={`${selectedMetric}_previous`} 
                  stroke="hsl(var(--muted-foreground))" 
                  strokeWidth={1.5}
                  fill="transparent"
                  name="Previous Period"
                  strokeDasharray="5 5"
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}