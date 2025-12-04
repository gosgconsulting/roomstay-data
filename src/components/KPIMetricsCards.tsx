import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Eye, MousePointer, ShoppingCart, DollarSign, Percent, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { FilterState } from "@/components/FiltersBar";
import type { Dimension } from "@/hooks/performanceTable/usePerformanceTableDimensions";
import { useUser } from "@/lib/auth";
import { useSourceData } from "@/hooks/dataSources";
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
  filters: FilterState;
  onLoadingComplete?: () => void;
  accountId?: string | null;
  visibilityRefreshTrigger?: number;
  dimensions?: Dimension[];
  headerAction?: React.ReactNode;
}

export const KPIMetricsCards = ({ 
  reportId, 
  filters, 
  onLoadingComplete,
  accountId,
  visibilityRefreshTrigger,
  dimensions = [],
  headerAction
}: KPIMetricsCardsProps) => {
  const { data: userData } = useUser();
  const user = userData?.user || null;
  const [metrics, setMetrics] = useState<KPIMetric[]>([]);
  const [dataSource, setDataSource] = useState<DataSource | null>(null);
  const [visibleKPIs, setVisibleKPIs] = useState<string[] | null>(null);
  const [kpiOrder, setKpiOrder] = useState<string[] | null>(null);

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
          console.error('[KPI-METRICS] Error fetching data source:', error);
          return;
        }

        if (data) {
          setDataSource({
            ...data,
            column_mappings: (data.column_mappings as any) || null,
          } as DataSource);
        }
      } catch (error) {
        console.error('[KPI-METRICS] Error fetching data source:', error);
      }
    };

    fetchDataSource();
  }, [reportId]);

  // Load KPI settings
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

  // Use source data hook - fetch directly from Google Sheets/CSV
  const { data: sourceData, isLoading: isLoadingSource, error: sourceError } = useSourceData(
    dataSource,
    accountId,
    { enabled: !!dataSource }
  );

  // Create stable filters reference
  const stableFilters = useMemo(() => ({
    dimensionFilters: filters.dimensionFilters || {},
    dateRange: filters.dateRange,
    datePreset: filters.datePreset,
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

  // Process source data into metrics
  useEffect(() => {
    if (!sourceData || isLoadingSource) return;

    console.log('[KPI-METRICS] Processing source data:', sourceData.transformedRows?.length, 'rows');

    try {
      let allRows = sourceData.transformedRows || [];

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

      // Apply date filter
      const shouldFilterByDate = stableFilters.datePreset !== 'all_time' && stableFilters.dateRange;
      const dateFromFormatted = shouldFilterByDate && stableFilters.dateRange?.from 
        ? format(stableFilters.dateRange.from, 'yyyy-MM-dd') : undefined;
      const dateToFormatted = shouldFilterByDate && stableFilters.dateRange?.to 
        ? format(stableFilters.dateRange.to, 'yyyy-MM-dd') : undefined;

      let filteredRows = allRows;
      if (shouldFilterByDate && dateDimInUse && (dateFromFormatted || dateToFormatted)) {
        const fromDate = dateFromFormatted ? new Date(dateFromFormatted) : null;
        const toDate = dateToFormatted ? new Date(dateToFormatted) : null;
        const adjustedToDate = toDate
          ? new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1)
          : null;

        filteredRows = filteredRows.filter((row: any) => {
          const dv = row.dimension_values || {};
          const val = dv[dateDimInUse!.id];
          if (!val) return true;
          const rowDate = new Date(String(val));
          if (fromDate && rowDate < fromDate) return false;
          if (adjustedToDate && rowDate >= adjustedToDate) return false;
          return true;
        });
      }

      // Apply dimension filters
      const normalizedFilters: Record<string, string[]> = {};
      for (const [k, v] of Object.entries(stableFilters.dimensionFilters || {})) {
        if (Array.isArray(v)) normalizedFilters[k] = v.map((x) => String(x));
        else if (v !== undefined && v !== null) normalizedFilters[k] = [String(v)];
      }

      if (Object.keys(normalizedFilters).length > 0) {
        filteredRows = filteredRows.filter((row: any) => {
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
      }

      console.log('[KPI-METRICS] After filtering:', filteredRows.length, 'rows');

      // Calculate current period metrics
      const currentMetrics: Record<string, number> = {};
      filteredRows.forEach((row: any) => {
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
              
              currentMetrics[metricName] = (currentMetrics[metricName] || 0) + numValue;
            }
          }
        });
      });

      // Calculate derived metrics
      if (currentMetrics['Clicks'] && currentMetrics['Impressions']) {
        currentMetrics['CTR'] = (currentMetrics['Clicks'] / currentMetrics['Impressions']) * 100;
      }
      if (currentMetrics['Conversions'] && currentMetrics['Clicks']) {
        currentMetrics['Conversion Rate'] = (currentMetrics['Conversions'] / currentMetrics['Clicks']) * 100;
      }
      if (currentMetrics['Cost'] && currentMetrics['Clicks']) {
        currentMetrics['CPC'] = currentMetrics['Cost'] / currentMetrics['Clicks'];
      }
      if (currentMetrics['Revenue'] && currentMetrics['Cost']) {
        currentMetrics['ROAS'] = currentMetrics['Revenue'] / currentMetrics['Cost'];
      }
      if (currentMetrics['Cost'] && currentMetrics['Revenue']) {
        currentMetrics['Cost of sale'] = (currentMetrics['Cost'] / currentMetrics['Revenue']) * 100;
      }

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

        displayMetrics.push({
          label: kpiName,
          value: formatDisplay(kpiName, value),
          icon: iconMap[kpiName] || Target,
          color: colorMap[kpiName] || colorMap["Default"]
        });
      });

      console.log('[KPI-METRICS] Display metrics created:', displayMetrics.length);
      setMetrics(displayMetrics);
      onLoadingComplete?.();

    } catch (error) {
      console.error('[KPI-METRICS] Error processing data:', error);
      setMetrics([]);
      onLoadingComplete?.();
    }
  }, [sourceData, isLoadingSource, stableFilters, dimensions, visibleKPIs, kpiOrder, onLoadingComplete]);

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

  if (isLoadingSource) {
    return (
      <div>
        {headerAction && (
          <div className="flex justify-between items-center mb-4">
            <div className="h-6 w-24 bg-muted rounded animate-pulse" />
            {headerAction}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {Array.from({ length: 10 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="h-4 bg-muted rounded w-20 animate-pulse" />
                <div className="h-4 w-4 bg-muted rounded animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded w-24 mb-1 animate-pulse" />
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
        {headerAction && (
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold">Key Metrics</h2>
            {headerAction}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          {Array.from({ length: 10 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div className="h-4 bg-muted/50 rounded w-20" />
                <div className="h-4 w-4 bg-muted/50 rounded" />
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted/50 rounded w-24 mb-1" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      {headerAction && (
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Key Metrics</h2>
          {headerAction}
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {metrics.map((metric, index) => {
          const Icon = metric.icon;
          return (
            <Card key={index}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {metric.label}
                </CardTitle>
                <Icon className={cn("h-4 w-4", metric.color)} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{metric.value}</div>
                {metric.change !== undefined && (
                  <div className="flex items-center text-xs mt-1">
                    {metric.change >= 0 ? (
                      <TrendingUp className="mr-1 h-3 w-3 text-green-500" />
                    ) : (
                      <TrendingDown className="mr-1 h-3 w-3 text-red-500" />
                    )}
                    <span className={metric.change >= 0 ? "text-green-500" : "text-red-500"}>
                      {metric.change >= 0 ? '+' : ''}{metric.change.toFixed(1)}%
                    </span>
                    {metric.compareValue && (
                      <span className="text-muted-foreground ml-1">
                        vs {metric.compareValue}
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
