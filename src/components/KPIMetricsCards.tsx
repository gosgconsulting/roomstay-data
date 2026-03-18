import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { useUser } from "@/lib/auth";
import { useCachedSourceData, useSourceData } from "@/hooks/dataSources";
import { usePerformanceTableDimensions } from "@/hooks/performanceTable/usePerformanceTableDimensions";
import type { DataSource } from "@/lib/data-sources/types";
import { KPICardItem, KPICardsSkeleton } from "@/components/slides/KPICardsSection";

interface KPIMetric {
  label: string;
  value: string | number;
  change?: number;
  compareValue?: string | number;
  isCostMetric?: boolean;
}

interface KPIMetricsCardsProps {
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
  onLoadingComplete?: () => void;
  visibilityRefreshTrigger?: number;
  headerAction?: React.ReactNode;
  useCachedData?: boolean; // When false, fetch directly from Google Sheets/CSV
}

export function KPIMetricsCards({ 
  reportId, 
  accountId, 
  filters, 
  onLoadingComplete,
  visibilityRefreshTrigger,
  headerAction,
  useCachedData = true, // Default to database cache for speed
}: KPIMetricsCardsProps) {
  const { data: userData } = useUser();
  const user = userData?.user || null;
  const [metrics, setMetrics] = useState<KPIMetric[]>([]);
  const [visibleKPIs, setVisibleKPIs] = useState<string[] | null>(null);
  const [kpiOrder, setKpiOrder] = useState<string[] | null>(null);
  const [dataSource, setDataSource] = useState<DataSource | null>(null);

  // Load dimensions using the same hook as PerformanceTable
  const { dimensions, isLoadingDimensions, loadDimensions } = usePerformanceTableDimensions({
    reportId,
    accountId: accountId || undefined,
  });

  // Trigger dimension loading when reportId, accountId, or user changes
  // Important: user needs to be in deps because loadDimensions depends on it
  useEffect(() => {
    if ((reportId || accountId) && user) {
      loadDimensions();
    }
  }, [reportId, accountId, loadDimensions, user]);

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
        console.error('[KPI-CARDS] Error fetching data source:', error);
      }
    };

    fetchDataSource();
  }, [reportId, useCachedData]);

  // Load KPI visibility settings
  useEffect(() => {
    const loadKPISettings = async () => {
      if (!user?.id || !reportId) return;

      const { data: viewSettings } = await supabase
        .from("views")
        .select("visible_kpis, kpi_order")
        .eq("mode", "performance_table")
        .eq("report_id", reportId)
        .eq("user_id", user.id)
        .eq("is_default", true)
        .maybeSingle();

      if (viewSettings) {
        setVisibleKPIs((viewSettings as any).visible_kpis || null);
        setKpiOrder((viewSettings as any).kpi_order || null);
      }
    };

    loadKPISettings();
  }, [user?.id, reportId, visibilityRefreshTrigger]);

  // Use cached source data hook - fetches from dimension_data table (instant loading)
  const { 
    data: cachedData, 
    isLoading: isLoadingCached, 
    error: cachedError,
    isFetching: isFetchingCached,
  } = useCachedSourceData(reportId, { 
    enabled: !!reportId && useCachedData 
  });

  // Use direct source data hook - fetches from Google Sheets/CSV (slower but always fresh)
  const {
    data: directData,
    isLoading: isLoadingDirect,
    error: directError,
  } = useSourceData(dataSource, accountId, {
    enabled: !!dataSource && !useCachedData,
  });

  // Determine which data source to use
  const isLoadingSource = useCachedData ? isLoadingCached : isLoadingDirect;
  const sourceError = useCachedData ? cachedError : directError;

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

  // Create stable filters reference
  const stableFilters = useMemo(() => ({
    dimensionFilters: filters.dimensionFilters || {},
    dateRange: filters.dateRange,
    datePreset: filters.datePreset || 'all_time',
    compareEnabled: filters.compareEnabled,
    compareType: filters.compareType,
    compareDateRange: filters.compareDateRange,
  }), [
    JSON.stringify(filters.dimensionFilters),
    filters.dateRange?.from?.toISOString(),
    filters.dateRange?.to?.toISOString(),
    filters.datePreset,
    filters.compareEnabled,
    filters.compareType,
    filters.compareDateRange?.from?.toISOString(),
    filters.compareDateRange?.to?.toISOString(),
  ]);

  // Process source data into metrics (same approach as performance table)
  useEffect(() => {
    // Wait for both source data and dimensions to be loaded
    if (!sourceData || isLoadingSource || isLoadingDimensions) return;
    
    // Must have dimensions loaded to map IDs to names
    if (!dimensions || dimensions.length === 0) {
      console.log('[KPI-CARDS] Waiting for dimensions to load...');
      return;
    }

    // console.log('[KPI-CARDS] Processing source data:', sourceData.transformedRows?.length, 'rows');
    // console.log('[KPI-CARDS] Dimensions available:', dimensions.length, dimensions.map(d => ({ id: d.id, name: d.name })));

    try {
      let allRows = sourceData.transformedRows || [];

      if (allRows.length === 0) {
        console.log('[KPI-CARDS] No rows in source data');
        setMetrics([]);
        onLoadingComplete?.();
        return;
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

      // Helper function to filter rows by date range
      const filterRowsByDateRange = (rows: any[], dateRange: { from: Date; to?: Date } | undefined) => {
        if (!dateDimInUse || !dateRange?.from) return rows;
        
        const fromDate = new Date(format(dateRange.from, 'yyyy-MM-dd'));
        const toDate = dateRange.to ? new Date(format(dateRange.to, 'yyyy-MM-dd')) : null;
        const adjustedToDate = toDate
          ? new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1)
          : null;

        return rows.filter((row: any) => {
          const dv = row.dimension_values || {};
          const val = dv[dateDimInUse!.id];
          if (!val) return true;
          const rowDate = new Date(String(val));
          if (fromDate && rowDate < fromDate) return false;
          if (adjustedToDate && rowDate >= adjustedToDate) return false;
          return true;
        });
      };

      // Apply dimension filters
      const applyDimensionFilters = (rows: any[]) => {
        const normalizedFilters: Record<string, string[]> = {};
        for (const [k, v] of Object.entries(stableFilters.dimensionFilters || {})) {
          if (Array.isArray(v)) normalizedFilters[k] = v.map((x) => String(x));
          else if (v !== undefined && v !== null) normalizedFilters[k] = [String(v)];
        }

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

      // Apply date filter only if not "all_time"
      const shouldFilterByDate = stableFilters.datePreset !== 'all_time' && stableFilters.dateRange;
      let filteredRows = allRows;
      if (shouldFilterByDate) {
        filteredRows = filterRowsByDateRange(filteredRows, stableFilters.dateRange);
      }
      filteredRows = applyDimensionFilters(filteredRows);

      // Get comparison rows if enabled
      let compareRows: any[] = [];
      const compareEnabled = stableFilters.compareEnabled && stableFilters.compareDateRange;
      if (compareEnabled) {
        compareRows = filterRowsByDateRange(allRows, stableFilters.compareDateRange);
        compareRows = applyDimensionFilters(compareRows);
      }

      // console.log('[KPI-CARDS] After filtering:', filteredRows.length, 'rows', compareEnabled ? `(compare: ${compareRows.length} rows)` : '');

      // Helper to calculate metrics from rows
      // Formula metrics should be calculated, not summed from source data
      const FORMULA_METRICS = ['CTR', 'ROAS', 'Conversion rate', 'Conversion Rate', 'CPC', 'Cost of sale', 'COS', 'CPM'];
      
      const calculateMetricsFromRows = (rows: any[]): Record<string, number> => {
        const metrics: Record<string, number> = {};
        rows.forEach((row: any) => {
          const dv = row.dimension_values || {};
          
          Object.entries(dv).forEach(([dimId, value]) => {
            if (value !== undefined && value !== null && value !== '') {
              const numValue = parseFloat(String(value));
              if (!isNaN(numValue)) {
                let metricName = dimId;
                
                if (dimensions.length > 0) {
                  const dim = dimensions.find(d => d.id === dimId);
                  if (dim) {
                    metricName = dim.name;
                  }
                }
                
                // Skip formula metrics - they should be calculated, not summed
                if (FORMULA_METRICS.includes(metricName)) {
                  return;
                }
                
                metrics[metricName] = (metrics[metricName] || 0) + numValue;
              }
            }
          });
        });
        return metrics;
      };

      // Calculate current period metrics
      const currentMetrics = calculateMetricsFromRows(filteredRows);

      // Calculate comparison metrics
      const compareMetrics = compareEnabled ? calculateMetricsFromRows(compareRows) : {};

      // Calculate derived metrics for both periods
      const addDerivedMetrics = (metrics: Record<string, number>) => {
        if (metrics['Clicks'] && metrics['Impressions']) {
          metrics['CTR'] = (metrics['Clicks'] / metrics['Impressions']) * 100;
        }
        if (metrics['Conversions'] && metrics['Clicks']) {
          metrics['Conversion Rate'] = (metrics['Conversions'] / metrics['Clicks']) * 100;
        }
        if (metrics['Bookings'] && metrics['Clicks'] && !metrics['Conversion Rate']) {
          metrics['Conversion Rate'] = (metrics['Bookings'] / metrics['Clicks']) * 100;
        }
        if (metrics['Cost'] && metrics['Clicks']) {
          metrics['CPC'] = metrics['Cost'] / metrics['Clicks'];
        }
        if (metrics['Revenue'] && metrics['Cost']) {
          metrics['ROAS'] = metrics['Revenue'] / metrics['Cost'];
        }
        if (metrics['Cost'] && metrics['Revenue']) {
          metrics['Cost of sale'] = (metrics['Cost'] / metrics['Revenue']) * 100;
        }
      };

      addDerivedMetrics(currentMetrics);
      if (compareEnabled) {
        addDerivedMetrics(compareMetrics);
      }

      // console.log('[KPI-CARDS] Calculated metrics:', Object.keys(currentMetrics));

      // Build display metrics
      const defaultKPIs = [
        "Impressions", "Clicks", "CTR", "Conversions", "Conversion Rate", 
        "CPC", "Cost", "Revenue", "ROAS", "Cost of sale"
      ];

      const costMetrics = new Set(["Cost", "CPC", "CPM", "Cost of sale"]);

      const kpisToShow = visibleKPIs || defaultKPIs;
      const orderedKPIs = kpiOrder || kpisToShow;

      const displayMetrics: KPIMetric[] = [];

      orderedKPIs.forEach(kpiName => {
        if (!kpisToShow.includes(kpiName)) return;

        const value = currentMetrics[kpiName];
        if (value === undefined || value === null) return;

        // Calculate change if comparison is enabled
        let change: number | undefined;
        let compareValue: string | number | undefined;
        if (compareEnabled && compareMetrics[kpiName] !== undefined) {
          const prevValue = compareMetrics[kpiName];
          compareValue = formatDisplay(kpiName, prevValue);
          if (prevValue !== 0) {
            change = ((value - prevValue) / prevValue) * 100;
          } else if (value !== 0) {
            change = value > 0 ? 100 : -100;
          } else {
            change = 0;
          }
        }

        displayMetrics.push({
          label: kpiName,
          value: formatDisplay(kpiName, value),
          change,
          compareValue,
          isCostMetric: costMetrics.has(kpiName),
        });
      });

      // console.log('[KPI-CARDS] Display metrics created:', displayMetrics.length);
      setMetrics(displayMetrics);
      onLoadingComplete?.();

    } catch (error) {
      console.error('[KPI-CARDS] Error processing data:', error);
      setMetrics([]);
      onLoadingComplete?.();
    }
  }, [sourceData, isLoadingSource, isLoadingDimensions, stableFilters, dimensions, visibleKPIs, kpiOrder, onLoadingComplete]);

  const formatDisplay = (kpiName: string, value: number): string => {
    const name = kpiName.toLowerCase();
    if (name === 'ctr' || name === 'conversion rate' || name === 'cost of sale' || name === 'impression share') {
      return `${value.toFixed(2)}%`;
    }
    if (name === 'cpc' || name === 'cpm' || name === 'budget') {
      return `$${value.toFixed(2)}`;
    }
    if (name === 'roas') {
      return `${value.toFixed(2)}x`;
    }
    if (name === 'cost' || name === 'revenue') {
      return `$${Math.round(value).toLocaleString('en-US')}`;
    }
    if (Number.isInteger(value)) {
      return value.toLocaleString('en-US');
    }
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Only show skeleton on initial load when there's truly no data available
  // Use same pattern as PerformanceTable - show data immediately if cached
  const hasAnyData = metrics.length > 0 || (useCachedData && !!cachedData);
  const showSkeleton = (isLoadingSource || isLoadingDimensions) && !hasAnyData;

  if (showSkeleton || metrics.length === 0) {
    return (
      <div>
        {headerAction && <div className="flex items-center justify-end mb-4">{headerAction}</div>}
        <KPICardsSkeleton count={12} />
      </div>
    );
  }

  return (
    <div>
      {headerAction && <div className="flex items-center justify-end mb-4">{headerAction}</div>}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {metrics.map((metric, index) => (
          <KPICardItem
            key={index}
            label={metric.label}
            value={String(metric.value)}
            percentChange={metric.change}
            compareLabel={metric.change !== undefined ? "vs prev" : undefined}
            isCostMetric={metric.isCostMetric}
          />
        ))}
      </div>
    </div>
  );
}