import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Eye, MousePointer, ShoppingCart, DollarSign, Percent, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useUser } from "@/lib/auth";
import { useSourceData } from "@/hooks/dataSources";
import { usePerformanceTableDimensions } from "@/hooks/performanceTable/usePerformanceTableDimensions";
import type { DataSource } from "@/lib/data-sources/types";

interface KPIMetric {
  label: string;
  value: string | number;
  change?: number;
  compareValue?: string | number;
  icon: React.ComponentType<any>;
  color: string;
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
}

export function KPIMetricsCards({ 
  reportId, 
  accountId, 
  filters, 
  onLoadingComplete,
  visibilityRefreshTrigger,
  headerAction
}: KPIMetricsCardsProps) {
  const { data: userData } = useUser();
  const user = userData?.user || null;
  const [metrics, setMetrics] = useState<KPIMetric[]>([]);
  const [dataSource, setDataSource] = useState<DataSource | null>(null);
  const [visibleKPIs, setVisibleKPIs] = useState<string[] | null>(null);
  const [kpiOrder, setKpiOrder] = useState<string[] | null>(null);

  // Load dimensions using the same hook as PerformanceTable
  const { dimensions, isLoadingDimensions, loadDimensions } = usePerformanceTableDimensions({
    reportId,
    accountId: accountId || undefined,
  });

  // Trigger dimension loading when reportId or accountId changes
  useEffect(() => {
    if (reportId || accountId) {
      loadDimensions();
    }
  }, [reportId, accountId, loadDimensions]);

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
          console.error('[KPI-CARDS] Error fetching data source:', error);
          return;
        }

        if (data) {
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
  }, [reportId]);

  // Load KPI visibility settings
  useEffect(() => {
    const loadKPISettings = async () => {
      if (!user?.id || !reportId) return;

      const { data: viewSettings } = await supabase
        .from("report_views")
        .select("visible_kpis, kpi_order")
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

  // Use source data hook - fetch directly from Google Sheets/CSV (same as performance table)
  const { data: sourceData, isLoading: isLoadingSource, error: sourceError } = useSourceData({
    dataSourceId: dataSource?.id || '',
    enabled: !!dataSource
  });

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

    console.log('[KPI-CARDS] Processing source data:', sourceData?.length, 'rows');
    console.log('[KPI-CARDS] Dimensions available:', dimensions.length, dimensions.map(d => ({ id: d.id, name: d.name })));

    try {
      let allRows = sourceData || [];

      if (allRows.length === 0) {
        console.log('[KPI-CARDS] No rows in source data');
        setMetrics([]);
        onLoadingComplete?.();
        return;
      }

      // Transform raw sheet data to match expected format
      const transformedRows = allRows.map((row: any) => ({
        dimension_values: row.row_data || {},
        row_number: row.row_number,
        id: row.id
      }));

      // Detect date dimension
      const dateDims = dimensions.filter(d => d.type === 'date');
      let dateDimInUse: { id: string; name: string } | null = null;
      for (const d of dateDims) {
        const found = transformedRows.some((r: any) => {
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
      let filteredRows = transformedRows;
      if (shouldFilterByDate) {
        filteredRows = filterRowsByDateRange(filteredRows, stableFilters.dateRange);
      }
      filteredRows = applyDimensionFilters(filteredRows);

      // Get comparison rows if enabled
      let compareRows: any[] = [];
      const compareEnabled = stableFilters.compareEnabled && stableFilters.compareDateRange;
      if (compareEnabled) {
        compareRows = filterRowsByDateRange(transformedRows, stableFilters.compareDateRange);
        compareRows = applyDimensionFilters(compareRows);
      }

      console.log('[KPI-CARDS] After filtering:', filteredRows.length, 'rows', compareEnabled ? `(compare: ${compareRows.length} rows)` : '');

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

      console.log('[KPI-CARDS] Calculated metrics:', Object.keys(currentMetrics));

      // Build display metrics
      const defaultKPIs = [
        "Impressions", "Clicks", "CTR", "Conversions", "Conversion Rate", 
        "CPC", "Cost", "Revenue", "ROAS", "Cost of sale"
      ];

      const iconMap: Record<string, React.ComponentType<any>> = {
        "Impressions": Eye,
        "Clicks": MousePointer,
        "Conversions": ShoppingCart,
        "Bookings": ShoppingCart,
        "CTR": Percent,
        "Conversion Rate": Percent,
        "Cost of sale": Percent,
        "Impression Share": Percent,
        "Cost": DollarSign,
        "CPC": DollarSign,
        "CPM": DollarSign,
        "Revenue": DollarSign,
        "Budget": DollarSign,
        "ROAS": TrendingUp,
      };

      const colorMap: Record<string, string> = {
        "Impressions": "text-pink-600",
        "Clicks": "text-purple-600",
        "Conversions": "text-orange-600",
        "Bookings": "text-orange-600",
        "CTR": "text-purple-600",
        "Conversion Rate": "text-purple-600",
        "Cost of sale": "text-purple-600",
        "Impression Share": "text-purple-600",
        "Cost": "text-blue-600",
        "CPC": "text-blue-600",
        "CPM": "text-blue-600",
        "Revenue": "text-cyan-600",
        "Budget": "text-green-600",
        "ROAS": "text-green-600",
        "Default": "text-blue-600"
      };

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
          icon: iconMap[kpiName] || Target,
          color: colorMap[kpiName] || colorMap["Default"]
        });
      });

      console.log('[KPI-CARDS] Display metrics created:', displayMetrics.length);
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

  if (isLoadingSource || isLoadingDimensions) {
    return (
      <div>
        <div className="flex items-center justify-end mb-4">
          {headerAction}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 mb-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="animate-pulse shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-medium uppercase text-muted-foreground">
                  <div className="h-3 bg-muted rounded w-20"></div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-10 bg-muted rounded w-24 mb-1"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (metrics.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-end mb-4">
          {headerAction}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 mb-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="h-3 bg-muted/50 rounded w-20" />
              </CardHeader>
              <CardContent>
                <div className="h-10 bg-muted/50 rounded w-24 mb-1" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-end mb-4">
        {headerAction}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2 mb-2">
        {metrics.map((metric, index) => {
          const IconComponent = metric.icon;
          return (
            <Card key={index} className="shadow-sm border-border bg-card">
              <CardHeader className="space-y-0 pb-2">
                <CardTitle className="text-xs font-medium uppercase text-muted-foreground tracking-wide">{metric.label}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-2xl font-bold text-foreground mb-1">{metric.value}</div>
                {metric.change !== undefined && metric.compareValue !== undefined && (
                  <p className={cn(
                    "text-xs flex items-center gap-1 font-medium",
                    metric.change >= 0 ? 'text-success' : 'text-destructive'
                  )}>
                    {metric.change >= 0 ? (
                      <TrendingUp className="h-3 w-3" />
                    ) : (
                      <TrendingDown className="h-3 w-3" />
                    )}
                    {metric.change >= 0 ? '+' : ''}{metric.change.toFixed(1)}%
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}