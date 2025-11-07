import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Eye, MousePointer, ShoppingCart, DollarSign, Percent, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { retryWithBackoff } from "@/lib/debug";
import { loadReportData, calculateKPIMetrics, getCurrentMonthDateRange, Dimension } from "@/lib/data-loading-fix";

interface KPIMetric {
  label: string;
  value: string | number;
  change?: number;
  icon: React.ComponentType<any>;
  color: string;
}

interface KPIMetricsCardsProps {
  reportId: string | null;
  accountId: string | null;
  filters: {
    dimensionFilters: Record<string, string[]>;
    dateRange?: { from: Date; to?: Date };
    compareEnabled?: boolean;
    compareType?: string;
    compareDateRange?: { from: Date; to?: Date };
  };
  onLoadingComplete?: () => void;
  visibilityRefreshTrigger?: number;
}

export function KPIMetricsCards({ 
  reportId, 
  accountId, 
  filters, 
  onLoadingComplete,
  visibilityRefreshTrigger 
}: KPIMetricsCardsProps) {
  const [metrics, setMetrics] = useState<KPIMetric[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  console.log('[KPI-FIXED] Component render - reportId:', reportId, 'accountId:', accountId, 'filters:', filters);

  // Create a stable reference for filters to prevent unnecessary re-renders
  const stableFilters = useMemo(() => {
    console.log('[KPI-FIXED] Creating stable filters reference:', filters);
    return {
      dimensionFilters: filters.dimensionFilters,
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
    console.log('[KPI-FIXED] ============= KPIMetricsCards useEffect =============');
    console.log('[KPI-FIXED] reportId:', reportId);
    console.log('[KPI-FIXED] accountId:', accountId);
    console.log('[KPI-FIXED] stableFilters:', JSON.stringify(stableFilters, null, 2));
    console.log('[KPI-FIXED] =====================================================');
    if (reportId && accountId) {
      console.log('[KPI-FIXED] ✓ reportId and accountId exist, calling loadMetrics...');
      loadMetrics();
    } else {
      console.log('[KPI-FIXED] ✗ Missing reportId or accountId, skipping loadMetrics');
      setIsLoading(false);
    }
  }, [reportId, accountId, stableFilters]);

  // Refresh metrics when dimension visibility changes
  useEffect(() => {
    if (reportId && accountId && visibilityRefreshTrigger && visibilityRefreshTrigger > 0) {
      console.log('[KPI-FIXED] Refreshing KPI metrics due to dimension visibility change');
      loadMetrics();
    }
  }, [visibilityRefreshTrigger, reportId, accountId]);

  const loadMetrics = async () => {
    console.log('[KPI-FIXED] loadMetrics - Starting data fetch for reportId:', reportId);
    setIsLoading(true);
    try {
      // Get the current user
      const { data: { user } } = await supabase.auth.getUser();
      console.log('[KPI-FIXED] loadMetrics - User:', user?.id);
      
      if (!user || !reportId || !accountId) {
        console.error('[KPI-FIXED] Missing required data:', { user: !!user, reportId, accountId });
        setMetrics([]);
        return;
      }

      // Load KPI visibility and order settings from report_views
      let visibleKPIs: string[] | null = null;
      let kpiOrder: string[] | null = null;

      try {
        const viewSettings = await retryWithBackoff(
          async () => {
            const { data, error } = await supabase
              .from("report_views")
              .select("visible_kpis, kpi_order")
              .eq("report_id", reportId)
              .eq("user_id", user.id)
              .eq("is_default", true)
              .maybeSingle();

            if (error) throw error;
            return data;
          },
          3,
          500
        );

        if (viewSettings) {
          visibleKPIs = viewSettings.visible_kpis as string[] | null;
          kpiOrder = viewSettings.kpi_order as string[] | null;
          console.log('[KPI-FIXED] Loaded KPI settings:', { visibleKPIs, kpiOrder });
        }
      } catch (error) {
        console.error('[KPI-FIXED] Failed to load KPI view settings:', error);
      }

      // Get current month date range for filtering if no date range provided
      const currentMonthRange = getCurrentMonthDateRange();
      
      // Apply filters from the component props
      const filters = {
        dateRange: stableFilters.dateRange || currentMonthRange,
        dimensionFilters: stableFilters.dimensionFilters
      };

      console.log('[KPI-FIXED] Loading data with filters:', filters);

      // Load data using the standardized approach
      const result = await loadReportData(reportId, accountId, user.id, filters);

      if (!result.success) {
        console.error('[KPI-FIXED] Failed to load report data:', result.error);
        setMetrics([]);
        return;
      }

      const { data: filteredData, dimensions } = result;

      console.log('[KPI-FIXED] ========== DATA LOADING SUMMARY ==========');
      console.log('[KPI-FIXED] Total dimension_data rows loaded:', result.totalRows);
      console.log('[KPI-FIXED] Filtered rows:', result.filteredRows);
      console.log('[KPI-FIXED] Total dimensions loaded:', dimensions?.length);
      console.log('[KPI-FIXED] Dimension names:', dimensions?.map(d => d.name).join(', '));
      console.log('[KPI-FIXED] Sample data row:', filteredData[0]?.dimension_values);
      console.log('[KPI-FIXED] Validation:', result.debugInfo?.validation);
      console.log('[KPI-FIXED] ========================================');

      if (!dimensions || dimensions.length === 0) {
        console.error('[KPI-FIXED] ✗ NO DIMENSIONS LOADED - Cannot calculate metrics!');
        setMetrics([]);
        return;
      }

      if (filteredData.length === 0) {
        console.error('[KPI-FIXED] ✗ NO DATA LOADED - Cannot calculate metrics!');
        setMetrics([]);
        return;
      }

      // Calculate KPI metrics using the utility function
      const calculatedMetrics = calculateKPIMetrics(filteredData, dimensions);
      console.log('[KPI-FIXED] Calculated metrics:', calculatedMetrics);

      // Create display metrics based on visibility settings
      const defaultKPIs = [
        "Impressions", "Clicks", "CTR", "Conversions", "Conversion Rate", 
        "CPC", "Cost", "Revenue", "ROAS", "Cost of sale"
      ];

      const kpisToShow = visibleKPIs || defaultKPIs;
      const orderedKPIs = kpiOrder || kpisToShow;

      const displayMetrics: KPIMetric[] = [];

      orderedKPIs.forEach(kpiName => {
        if (!kpisToShow.includes(kpiName)) return;

        const value = calculatedMetrics[kpiName];
        if (value === undefined || value === null) return;

        let formattedValue: string | number = value;
        let icon = Target;
        let color = "text-blue-600";

        // Format values and set icons based on KPI type
        switch (kpiName) {
          case "Impressions":
            formattedValue = formatNumber(value);
            icon = Eye;
            color = "text-pink-600";
            break;
          case "Clicks":
            formattedValue = formatNumber(value);
            icon = MousePointer;
            color = "text-purple-600";
            break;
          case "Conversions":
          case "Bookings":
            formattedValue = formatNumber(value);
            icon = ShoppingCart;
            color = "text-orange-600";
            break;
          case "CTR":
          case "Conversion Rate":
          case "Cost of sale":
          case "Impression Share":
            formattedValue = formatPercentage(value);
            icon = Percent;
            color = "text-purple-600";
            break;
          case "Cost":
          case "CPC":
          case "CPM":
          case "Revenue":
            formattedValue = formatCurrency(value);
            icon = DollarSign;
            color = kpiName === "Revenue" ? "text-cyan-600" : "text-blue-600";
            break;
          case "ROAS":
            formattedValue = formatDecimal(value);
            icon = TrendingUp;
            color = "text-green-600";
            break;
          default:
            formattedValue = formatDecimal(value);
        }

        displayMetrics.push({
          label: kpiName,
          value: formattedValue,
          icon,
          color
        });
      });

      console.log('[KPI-FIXED] ========== METRICS DISPLAY SUMMARY ==========');
      console.log('[KPI-FIXED] Total display metrics created:', displayMetrics.length);
      console.log('[KPI-FIXED] Metrics:', displayMetrics.map(m => ({ label: m.label, value: m.value })));
      console.log('[KPI-FIXED] ==========================================');
      
      setMetrics(displayMetrics);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
      console.error('[KPI-FIXED] Error in loadMetrics:', errorMessage);
      setMetrics([]);
    } finally {
      console.log('[KPI-FIXED] loadMetrics - Setting isLoading to false');
      setIsLoading(false);
      onLoadingComplete?.();
    }
  };

  // Formatting functions
  const formatNumber = (value: number): string => {
    if (value >= 1000000) {
      return (value / 1000000).toFixed(1) + 'M';
    } else if (value >= 1000) {
      return (value / 1000).toFixed(1) + 'K';
    }
    return Math.round(value).toLocaleString();
  };

  const formatCurrency = (value: number): string => {
    if (value === 0) return '$0';
    if (value >= 1000000) {
      return '$' + (value / 1000000).toFixed(1) + 'M';
    } else if (value >= 1000) {
      return '$' + (value / 1000).toFixed(1) + 'K';
    }
    return '$' + value.toFixed(2);
  };

  const formatPercentage = (value: number): string => {
    return value.toFixed(2) + '%';
  };

  const formatDecimal = (value: number): string => {
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  console.log('[KPI-FIXED] KPIMetricsCards render - isLoading:', isLoading, 'metrics.length:', metrics.length);

  if (isLoading) {
    console.log('[KPI-FIXED] KPIMetricsCards - Rendering loading state');
    return (
      <div>
        <h2 className="text-lg font-semibold mb-4">Analytics & Insights</h2>
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
      </div>
    );
  }

  // Don't hide if no metrics - show empty state only if explicitly no dimensions
  if (metrics.length === 0) {
    console.log('[KPI-FIXED] KPIMetricsCards - Rendering empty state (no metrics)');
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Analytics & Insights</h2>
        </div>
        <div className="text-center py-8 text-gray-500">
          No data available for the selected filters
        </div>
      </div>
    );
  }

  console.log('[KPI-FIXED] KPIMetricsCards - Rendering metrics cards:', metrics.length);
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Analytics & Insights</h2>
      </div>
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
                {metric.change !== undefined && (
                  <p className={`text-xs ${metric.change >= 0 ? 'text-green-600' : 'text-red-600'} flex items-center`}>
                    {metric.change >= 0 ? (
                      <TrendingUp className="h-3 w-3 mr-1" />
                    ) : (
                      <TrendingDown className="h-3 w-3 mr-1" />
                    )}
                    {Math.abs(metric.change)}% from last period
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
