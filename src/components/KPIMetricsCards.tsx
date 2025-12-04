import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Eye, MousePointer, ShoppingCart, DollarSign, Percent, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { FilterState } from "@/components/FiltersBar";
import type { Dimension } from "@/hooks/performanceTable/usePerformanceTableDimensions";
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
      accountId,
      hasFilters: Object.keys(stableFilters.dimensionFilters).length > 0,
      dateRange: stableFilters.dateRange
    });
    
    if (reportId && accountId) {
      console.log('[KPIMetricsCards] Loading metrics using edge function...');
      loadMetrics();
    } else {
      console.log('[KPIMetricsCards] Missing reportId or accountId, skipping load');
      setIsLoading(false);
      setMetrics([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, accountId, stableFilters]);

  // Refresh metrics when dimension visibility changes
  useEffect(() => {
    if (reportId && accountId && visibilityRefreshTrigger && visibilityRefreshTrigger > 0) {
      console.log('[KPIMetricsCards] Visibility refresh triggered');
      loadMetrics();
    }
  }, [visibilityRefreshTrigger, reportId, accountId]);

  const loadMetrics = async () => {
    setIsLoading(true);
    try {
      console.log('[KPI-METRICS] Starting to load metrics using edge function...');
      
      if (!reportId || !accountId) {
        console.log('[KPI-METRICS] Missing reportId or accountId, skipping');
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

      // Use the same edge function as PerformanceTable for consistency
      const dateFromFormatted = stableFilters.dateRange?.from ? format(stableFilters.dateRange.from, 'yyyy-MM-dd') : undefined;
      const dateToFormatted = stableFilters.dateRange?.to ? format(stableFilters.dateRange.to, 'yyyy-MM-dd') : undefined;

      console.log('[KPI-METRICS] Calling edge function with params:', {
        reportId,
        accountId,
        userId: user?.id,
        dateFrom: dateFromFormatted,
        dateTo: dateToFormatted,
        dimensionFilters: stableFilters.dimensionFilters
      });

      const { data: edgeData, error: edgeError } = await supabase.functions.invoke('get-performance-data', {
        body: {
          reportId,
          accountId,
          userId: user?.id,
          dateFrom: dateFromFormatted,
          dateTo: dateToFormatted,
          dimensionFilters: stableFilters.dimensionFilters || {},
          limit: 50000,
          offset: 0,
        }
      });

      if (edgeError) {
        console.error('[KPI-METRICS] Edge function error:', edgeError);
        throw new Error(`Edge function error: ${edgeError.message || 'Unknown error'}`);
      }

      if (!edgeData || !edgeData.data) {
        console.log('[KPI-METRICS] No data returned from edge function');
        setMetrics([]);
        return;
      }

      const rawRows = edgeData.data;
      console.log('[KPI-METRICS] Raw rows from edge function:', rawRows.length);

      if (rawRows.length === 0) {
        console.log('[KPI-METRICS] No rows found');
        setMetrics([]);
        return;
      }

      // Calculate current period metrics from dimension_values
      const currentMetrics: Record<string, number> = {};
      rawRows.forEach((row: any) => {
        const dv = row.dimension_values || {};
        
        // Sum up all numeric values by dimension ID
        Object.entries(dv).forEach(([dimId, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            const numValue = parseFloat(String(value));
            if (!isNaN(numValue)) {
              // Map common dimension IDs to metric names
              let metricName = dimId;
              
              // Try to find dimension name from dimensions array if available
              if (dimensions.length > 0) {
                const dim = dimensions.find(d => d.id === dimId);
                if (dim) {
                  metricName = dim.name;
                }
              } else {
                // Fallback mapping for common dimension IDs
                const commonMappings: Record<string, string> = {
                  'impressions': 'Impressions',
                  'clicks': 'Clicks',
                  'conversions': 'Conversions',
                  'bookings': 'Bookings',
                  'cost': 'Cost',
                  'revenue': 'Revenue',
                  'cpc': 'CPC',
                  'ctr': 'CTR',
                  'conversion_rate': 'Conversion Rate',
                  'roas': 'ROAS',
                  'cost_of_sale': 'Cost of sale'
                };
                
                const lowerDimId = dimId.toLowerCase();
                metricName = commonMappings[lowerDimId] || dimId;
              }
              
              currentMetrics[metricName] = (currentMetrics[metricName] || 0) + numValue;
            }
          }
        });
      });

      console.log('[KPI-METRICS] Current metrics calculated:', Object.keys(currentMetrics));

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

        // Fetch comparison data using edge function
        const { data: prevEdgeData } = await supabase.functions.invoke('get-performance-data', {
          body: {
            reportId,
            accountId,
            userId: user?.id,
            dateFrom: prevFromFormatted,
            dateTo: prevToFormatted,
            dimensionFilters: stableFilters.dimensionFilters || {},
            limit: 50000,
            offset: 0,
          }
        });

        if (prevEdgeData && prevEdgeData.data) {
          const prevRawRows = prevEdgeData.data;
          
          // Calculate comparison metrics
          prevRawRows.forEach((row: any) => {
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
                  } else {
                    const commonMappings: Record<string, string> = {
                      'impressions': 'Impressions',
                      'clicks': 'Clicks',
                      'conversions': 'Conversions',
                      'bookings': 'Bookings',
                      'cost': 'Cost',
                      'revenue': 'Revenue',
                      'cpc': 'CPC',
                      'ctr': 'CTR',
                      'conversion_rate': 'Conversion Rate',
                      'roas': 'ROAS',
                      'cost_of_sale': 'Cost of sale'
                    };
                    
                    const lowerDimId = dimId.toLowerCase();
                    metricName = commonMappings[lowerDimId] || dimId;
                  }
                  
                  comparisonMetrics[metricName] = (comparisonMetrics[metricName] || 0) + numValue;
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
                <div className="h-8 bg-muted/50 rounded w-16 mb-1" />
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
    </div>
  );
}