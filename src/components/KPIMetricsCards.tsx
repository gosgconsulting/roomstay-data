import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Eye, MousePointer, ShoppingCart, DollarSign, Percent, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { FilterState } from "@/components/FiltersBar";
import type { Dimension } from "@/hooks/performanceTable/usePerformanceTableDimensions";
import { autoFixDimensionSync } from "@/lib/dimension-sync-auto-fix";
import { useUser } from "@/lib/auth";

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
}

export const KPIMetricsCards = ({ 
  reportId, 
  filters, 
  onLoadingComplete,
  accountId,
  visibilityRefreshTrigger,
  dimensions = []
}: KPIMetricsCardsProps) => {
  const { data: userData } = useUser();
  const user = userData?.user || null;
  const [metrics, setMetrics] = useState<KPIMetric[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Create a stable reference for filters to prevent unnecessary re-renders
  const stableFilters = useMemo(() => {
    return {
      dimensionFilters: filters.dimensionFilters || {},
      dateRange: filters.dateRange,
      compareEnabled: filters.compareEnabled,
      compareType: filters.compareType,
      compareDateRange: filters.compareDateRange,
    };
  }, [
    JSON.stringify(filters.dimensionFilters),
    filters.dateRange?.from?.toISOString(),
    filters.dateRange?.to?.toISOString(),
    filters.compareEnabled,
    filters.compareType,
    filters.compareDateRange?.from?.toISOString(),
    filters.compareDateRange?.to?.toISOString(),
  ]);

  useEffect(() => {
    console.log('[KPIMetricsCards] Effect triggered:', {
      reportId,
      dimensionsLength: dimensions.length,
      dimensionsAvailable: dimensions.length > 0,
      filters: stableFilters
    });
    
    if (reportId) {
      if (dimensions.length > 0) {
        console.log('[KPIMetricsCards] Loading metrics with dimensions:', dimensions.map(d => d.name));
        loadMetrics();
      } else {
        console.log('[KPIMetricsCards] No dimensions available yet, waiting...');
        setIsLoading(true);
      }
    } else {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, stableFilters, dimensions.length]);

  // Refresh metrics when dimension visibility changes
  useEffect(() => {
    if (reportId && dimensions.length > 0 && visibilityRefreshTrigger && visibilityRefreshTrigger > 0) {
      console.log('[KPIMetricsCards] Visibility refresh triggered');
      loadMetrics();
    }
  }, [visibilityRefreshTrigger, reportId, dimensions.length]);

  const loadMetrics = async () => {
    setIsLoading(true);
    try {
      console.log('[KPI-METRICS-FIXED] Starting to load metrics with auto-fix...');
      
      if (!reportId || dimensions.length === 0) {
        console.log('[KPI-METRICS-FIXED] Missing reportId or dimensions, skipping');
        setMetrics([]);
        return;
      }

      // Load KPI settings if available
      let visibleKPIs: string[] | null = null;
      let kpiOrder: string[] | null = null;

      if (user?.id) {
        const { data: viewSettings } = await supabase
          .from("report_views")
          .select("visible_kpis, kpi_order")
          .eq("report_id", reportId)
          .eq("user_id", user.id)
          .eq("is_default", true)
          .maybeSingle();

        if (viewSettings) {
          visibleKPIs = (viewSettings as any).visible_kpis || null;
          kpiOrder = (viewSettings as any).kpi_order || null;
        }
      }

      // Fetch raw dimension_data rows
      console.log('[KPI-METRICS-FIXED] Fetching dimension_data for reportId:', reportId);
      let query = supabase
        .from('dimension_data')
        .select('dimension_values, row_number, data_source_id')
        .eq('report_id', reportId)
        .order('row_number', { ascending: true });

      const { data: rawRows, error } = await query;
      if (error) {
        console.error('[KPI-METRICS-FIXED] Error fetching dimension_data:', error);
        throw new Error((error as any)?.message ?? 'Failed to fetch dimension_data');
      }
      
      console.log('[KPI-METRICS-FIXED] Raw rows fetched:', rawRows?.length || 0);
      
      if (!rawRows || rawRows.length === 0) {
        console.log('[KPI-METRICS-FIXED] No raw rows found');
        setMetrics([]);
        return;
      }

      // APPLY AUTO-FIX: Fix dimension ID mismatches
      const fixedRows = await autoFixDimensionSync(rawRows, dimensions);
      console.log('[KPI-METRICS-FIXED] Applied auto-fix to', fixedRows.length, 'rows');

      // Apply date filter (same logic as Performance Table)
      const dateFromFormatted = stableFilters.dateRange?.from ? format(stableFilters.dateRange.from, 'yyyy-MM-dd') : undefined;
      const dateToFormatted = stableFilters.dateRange?.to ? format(stableFilters.dateRange.to, 'yyyy-MM-dd') : undefined;

      // Detect date dimension present in data
      const dateDims = dimensions.filter(d => d.type === 'date');
      let dateDimInUse: { id: string; name: string } | null = null;
      for (const d of dateDims) {
        const found = fixedRows.some((r: any) => {
          const dv = r.dimension_values || {};
          return dv[d.id] !== undefined && dv[d.id] !== null && dv[d.id] !== '';
        });
        if (found) {
          dateDimInUse = { id: d.id, name: d.name };
          break;
        }
      }

      console.log('[KPI-METRICS-FIXED] Date dimension in use:', dateDimInUse?.name);

      let filteredRows = fixedRows;
      if (dateDimInUse && (dateFromFormatted || dateToFormatted)) {
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

      console.log('[KPI-METRICS-FIXED] Rows after date filter:', filteredRows.length);

      // Apply dimension filters (same logic as Performance Table)
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

      console.log('[KPI-METRICS-FIXED] Rows after dimension filters:', filteredRows.length);

      // Calculate current period metrics
      const currentMetrics: Record<string, number> = {};
      filteredRows.forEach((row: any) => {
        const dv = row.dimension_values || {};
        dimensions.forEach(dim => {
          if (dv[dim.id] !== undefined && (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage')) {
            const value = parseFloat(String(dv[dim.id]));
            if (!isNaN(value)) {
              currentMetrics[dim.name] = (currentMetrics[dim.name] || 0) + value;
            }
          }
        });
      });

      console.log('[KPI-METRICS-FIXED] Current metrics calculated:', Object.keys(currentMetrics));

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

      // Load comparison period data if comparison is enabled
      let comparisonMetrics: Record<string, number> = {};
      if (stableFilters.compareEnabled && stableFilters.dateRange?.from && stableFilters.dateRange?.to) {
        console.log('[KPIMetricsCards] Loading comparison data...');
        const currentPeriod = stableFilters.dateRange;
        const daysDiff = Math.ceil((currentPeriod.to.getTime() - currentPeriod.from.getTime()) / (1000 * 60 * 60 * 24));
        const previousPeriodEnd = new Date(currentPeriod.from);
        previousPeriodEnd.setDate(previousPeriodEnd.getDate() - 1);
        const previousPeriodStart = new Date(previousPeriodEnd);
        previousPeriodStart.setDate(previousPeriodStart.getDate() - daysDiff + 1);

        const prevFromFormatted = format(previousPeriodStart, 'yyyy-MM-dd');
        const prevToFormatted = format(previousPeriodEnd, 'yyyy-MM-dd');

        // Fetch comparison data
        const { data: prevRawRows } = await supabase
          .from('dimension_data')
          .select('dimension_values, row_number, data_source_id')
          .eq('report_id', reportId)
          .order('row_number', { ascending: true });

        if (prevRawRows) {
          let prevFilteredRows = prevRawRows;
          
          // Apply date filter for comparison period
          if (dateDimInUse) {
            const prevFromDate = new Date(prevFromFormatted);
            const prevToDate = new Date(prevToFormatted);
            const prevAdjustedToDate = new Date(prevToDate.getFullYear(), prevToDate.getMonth(), prevToDate.getDate() + 1);

            prevFilteredRows = prevFilteredRows.filter((row: any) => {
              const dv = row.dimension_values || {};
              const val = dv[dateDimInUse!.id];
              if (!val) return true;
              const rowDate = new Date(String(val));
              if (rowDate < prevFromDate) return false;
              if (rowDate >= prevAdjustedToDate) return false;
              return true;
            });
          }

          // Apply same dimension filters
          if (Object.keys(normalizedFilters).length > 0) {
            prevFilteredRows = prevFilteredRows.filter((row: any) => {
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

          // Calculate comparison metrics
          prevFilteredRows.forEach((row: any) => {
            const dv = row.dimension_values || {};
            dimensions.forEach(dim => {
              if (dv[dim.id] !== undefined && (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage')) {
                const value = parseFloat(String(dv[dim.id]));
                if (!isNaN(value)) {
                  comparisonMetrics[dim.name] = (comparisonMetrics[dim.name] || 0) + value;
                }
              }
            });
          });

          // Calculate derived comparison metrics
          if (comparisonMetrics['Clicks'] && comparisonMetrics['Impressions']) {
            comparisonMetrics['CTR'] = (comparisonMetrics['Clicks'] / comparisonMetrics['Impressions']) * 100;
          }
          if (comparisonMetrics['Conversions'] && comparisonMetrics['Clicks']) {
            comparisonMetrics['Conversion Rate'] = (comparisonMetrics['Conversions'] / comparisonMetrics['Clicks']) * 100;
          }
          if (comparisonMetrics['Cost'] && comparisonMetrics['Clicks']) {
            comparisonMetrics['CPC'] = comparisonMetrics['Cost'] / comparisonMetrics['Clicks'];
          }
          if (comparisonMetrics['Revenue'] && comparisonMetrics['Cost']) {
            comparisonMetrics['ROAS'] = comparisonMetrics['Revenue'] / comparisonMetrics['Cost'];
          }
          if (comparisonMetrics['Cost'] && comparisonMetrics['Revenue']) {
            comparisonMetrics['Cost of sale'] = (comparisonMetrics['Cost'] / comparisonMetrics['Revenue']) * 100;
          }
        }
      }

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

        let formattedCompareValue: string | number | undefined;
        let change: number | undefined;

        if (stableFilters.compareEnabled && comparisonMetrics[kpiName] !== undefined && comparisonMetrics[kpiName] !== null) {
          const prev = comparisonMetrics[kpiName];
          if (prev !== 0) {
            change = ((value - prev) / prev) * 100;
          } else if (value !== 0) {
            change = 100;
          }
          formattedCompareValue = formatDisplay(kpiName, prev);
        }

        displayMetrics.push({
          label: kpiName,
          value: formatDisplay(kpiName, value),
          change,
          compareValue: formattedCompareValue,
          icon: iconMap[kpiName] || Target,
          color: colorMap[kpiName] || colorMap["Default"]
        });
      });

      console.log('[KPIMetricsCards] Display metrics created:', displayMetrics.length);
      setMetrics(displayMetrics);
    } catch (error) {
      console.error('[KPIMetricsCards] Error loading metrics:', error);
      setMetrics([]);
    } finally {
      setIsLoading(false);
      onLoadingComplete?.();
    }
  };

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

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        {Array.from({ length: 10 }).map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                <div className="h-4 bg-gray-200 rounded w-20"></div>
              </CardTitle>
              <div className="h-4 w-4 bg-gray-200 rounded"></div>
            </CardHeader>
            <CardContent>
              <div className="h-8 bg-gray-200 rounded w-16 mb-1"></div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (metrics.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No data available for the selected filters
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
      {metrics.map((metric, index) => {
        const IconComponent = metric.icon;
        return (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{metric.label}</CardTitle>
              <IconComponent className={`h-4 w-4 ${metric.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metric.value}</div>
              {metric.change !== undefined && metric.compareValue !== undefined && (
                <p className={cn(
                  "text-xs flex items-center gap-1",
                  metric.change >= 0 ? 'text-green-600' : 'text-red-600'
                )}>
                  {metric.change >= 0 ? (
                    <TrendingUp className="h-3 w-3" />
                  ) : (
                    <TrendingDown className="h-3 w-3" />
                  )}
                  {metric.change >= 0 ? '+' : ''}{metric.change.toFixed(1)}% vs {metric.compareValue}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}