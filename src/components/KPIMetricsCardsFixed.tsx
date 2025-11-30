import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Eye, MousePointer, ShoppingCart, DollarSign, Percent, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
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
  const [isLoading, setIsLoading] = useState(true);

  console.log('[KPI-FIXED] Component render - reportId:', reportId, 'accountId:', accountId, 'filters:', filters);

  // Create a stable reference for filters to prevent unnecessary re-renders
  const stableFilters = useMemo(() => {
    console.log('[KPI-FIXED] Creating stable filters reference:', filters);
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
      setMetrics([]);
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
      if (!reportId || !accountId) {
        console.error('[KPI-FIXED] Missing required data:', { reportId, accountId });
        setMetrics([]);
        return;
      }

      // Load dimension metadata to map IDs to names
      console.log('[KPI-FIXED] Loading dimension metadata...');
      let dimensionMap: Record<string, { name: string; type: string }> = {};
      
      try {
        // Load dimensions (account > custom > global > report-specific)
        const dimensionQueries = [];
        
        if (accountId) {
          dimensionQueries.push(
            supabase.from('dimensions')
              .select('id, name, type, scope, account_id, report_id')
              .eq('scope', 'account')
              .eq('account_id', accountId)
          );
        }
        
        if (user?.id) {
          dimensionQueries.push(
            supabase.from('dimensions')
              .select('id, name, type, scope, account_id, report_id')
              .eq('scope', 'custom')
              .eq('user_id', user.id)
          );
        }
        
        dimensionQueries.push(
          supabase.from('dimensions')
            .select('id, name, type, scope, account_id, report_id')
            .eq('scope', 'global')
        );
        
        dimensionQueries.push(
          supabase.from('dimensions')
            .select('id, name, type, scope, account_id, report_id')
            .eq('report_id', reportId)
        );
        
        const dimensionResults = await Promise.all(dimensionQueries);
        
        // Combine all dimensions into a map
        dimensionResults.forEach(({ data: dimensions }) => {
          if (dimensions) {
            dimensions.forEach((dim: any) => {
              dimensionMap[dim.id] = { name: dim.name, type: dim.type };
            });
          }
        });
        
        console.log('[KPI-FIXED] Loaded dimension map:', Object.keys(dimensionMap).length, 'dimensions');
        console.log('[KPI-FIXED] Dimension names:', Object.values(dimensionMap).map(d => d.name));
      } catch (error) {
        console.error('[KPI-FIXED] Error loading dimensions:', error);
      }

      // Load KPI visibility and order settings from report_views
      let visibleKPIs: string[] | null = null;
      let kpiOrder: string[] | null = null;

      if (user?.id) {
        try {
          const { data: viewSettings, error } = await supabase
            .from("report_views")
            .select("visible_kpis, kpi_order")
            .eq("report_id", reportId)
            .eq("user_id", user.id)
            .eq("is_default", true)
            .maybeSingle();

          if (error) {
            console.warn('[KPI-FIXED] Error loading view settings:', error);
          } else if (viewSettings) {
            visibleKPIs = viewSettings.visible_kpis as string[] | null;
            kpiOrder = viewSettings.kpi_order as string[] | null;
            console.log('[KPI-FIXED] Loaded KPI settings:', { visibleKPIs, kpiOrder });
          }
        } catch (error) {
          console.error('[KPI-FIXED] Failed to load KPI view settings:', error);
        }
      }

      // Use the same edge function as PerformanceTable for consistency
      const dateFromFormatted = stableFilters.dateRange?.from ? format(stableFilters.dateRange.from, 'yyyy-MM-dd') : undefined;
      const dateToFormatted = stableFilters.dateRange?.to ? format(stableFilters.dateRange.to, 'yyyy-MM-dd') : undefined;

      console.log('[KPI-FIXED] Calling edge function with params:', {
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
        console.error('[KPI-FIXED] Edge function error:', edgeError);
        throw new Error(`Edge function error: ${edgeError.message || 'Unknown error'}`);
      }

      if (!edgeData || !edgeData.data) {
        console.log('[KPI-FIXED] No data returned from edge function');
        setMetrics([]);
        return;
      }

      const rawRows = edgeData.data;
      console.log('[KPI-FIXED] Raw rows from edge function:', rawRows.length);

      if (rawRows.length === 0) {
        console.log('[KPI-FIXED] No rows found');
        setMetrics([]);
        return;
      }

      // Calculate current period metrics from dimension_values
      const currentMetrics: Record<string, number> = {};
      rawRows.forEach((row: any) => {
        const dv = row.dimension_values || {};
        
        // Sum up all numeric values by dimension ID, mapping to actual dimension names
        Object.entries(dv).forEach(([dimId, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            const numValue = parseFloat(String(value));
            if (!isNaN(numValue)) {
              // Use the actual dimension name from the dimension map
              const dimension = dimensionMap[dimId];
              const metricName = dimension ? dimension.name : dimId;
              currentMetrics[metricName] = (currentMetrics[metricName] || 0) + numValue;
            }
          }
        });
      });

      console.log('[KPI-FIXED] Current metrics calculated:', Object.keys(currentMetrics));
      console.log('[KPI-FIXED] Current metrics values:', currentMetrics);

      // If no standard metrics found, try to find any numeric dimensions as fallback
      if (Object.keys(currentMetrics).length === 0) {
        console.log('[KPI-FIXED] No standard metrics found, trying fallback approach...');
        
        // Collect all unique dimension IDs and their sample values
        const allDimensions: Record<string, any[]> = {};
        rawRows.slice(0, 10).forEach((row: any) => {
          const dv = row.dimension_values || {};
          Object.entries(dv).forEach(([dimId, value]) => {
            if (!allDimensions[dimId]) allDimensions[dimId] = [];
            allDimensions[dimId].push(value);
          });
        });
        
        console.log('[KPI-FIXED] All dimensions found:', Object.keys(allDimensions));
        
        // Try to identify numeric dimensions
        Object.entries(allDimensions).forEach(([dimId, values]) => {
          const numericValues = values.filter(v => {
            const num = parseFloat(String(v));
            return !isNaN(num) && num > 0;
          });
          
          if (numericValues.length > 0) {
            console.log('[KPI-FIXED] Found numeric dimension:', dimId, 'sample values:', numericValues.slice(0, 3));
            
            // Sum this dimension across all rows
            let total = 0;
            rawRows.forEach((row: any) => {
              const dv = row.dimension_values || {};
              const value = dv[dimId];
              if (value !== undefined && value !== null && value !== '') {
                const numValue = parseFloat(String(value));
                if (!isNaN(numValue)) {
                  total += numValue;
                }
              }
            });
            
            if (total > 0) {
              // Use the actual dimension name if available, otherwise use dimension ID
              const dimension = dimensionMap[dimId];
              const metricName = dimension ? dimension.name : dimId;
              currentMetrics[metricName] = total;
              console.log('[KPI-FIXED] Added fallback metric:', metricName, '=', total);
            }
          }
        });
      }

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
        console.log('[KPI-FIXED] Loading comparison data...');
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
                  // Use the actual dimension name from the dimension map
                  const dimension = dimensionMap[dimId];
                  const metricName = dimension ? dimension.name : dimId;
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

        const value = currentMetrics[kpiName];
        if (value === undefined || value === null) return;

        let formattedValue: string | number = value;
        let formattedCompareValue: string | number | undefined = undefined;
        let icon = Target;
        let color = "text-blue-600";
        let change: number | undefined = undefined;

        // Calculate change percentage if comparison is enabled
        if (stableFilters.compareEnabled && comparisonMetrics[kpiName] !== undefined && comparisonMetrics[kpiName] !== null) {
          const comparisonValue = comparisonMetrics[kpiName];
          if (comparisonValue !== 0) {
            change = ((value - comparisonValue) / comparisonValue) * 100;
          } else if (value !== 0) {
            change = 100; // If previous was 0 and current is not, it's a 100% increase
          }
        }

        // Format values and set icons based on KPI type
        switch (kpiName) {
          case "Impressions":
            formattedValue = formatNumber(value);
            if (stableFilters.compareEnabled && comparisonMetrics[kpiName] !== undefined) {
              formattedCompareValue = formatNumber(comparisonMetrics[kpiName]);
            }
            icon = Eye;
            color = "text-pink-600";
            break;
          case "Clicks":
            formattedValue = formatNumber(value);
            if (stableFilters.compareEnabled && comparisonMetrics[kpiName] !== undefined) {
              formattedCompareValue = formatNumber(comparisonMetrics[kpiName]);
            }
            icon = MousePointer;
            color = "text-purple-600";
            break;
          case "Conversions":
          case "Bookings":
            formattedValue = formatNumber(value);
            if (stableFilters.compareEnabled && comparisonMetrics[kpiName] !== undefined) {
              formattedCompareValue = formatNumber(comparisonMetrics[kpiName]);
            }
            icon = ShoppingCart;
            color = "text-orange-600";
            break;
          case "CTR":
          case "Conversion Rate":
          case "Cost of sale":
          case "Impression Share":
            formattedValue = formatPercentage(value);
            if (stableFilters.compareEnabled && comparisonMetrics[kpiName] !== undefined) {
              formattedCompareValue = formatPercentage(comparisonMetrics[kpiName]);
            }
            icon = Percent;
            color = "text-purple-600";
            break;
          case "Cost":
          case "CPC":
          case "CPM":
          case "Revenue":
          case "Budget":
            formattedValue = formatCurrency(value);
            if (stableFilters.compareEnabled && comparisonMetrics[kpiName] !== undefined) {
              formattedCompareValue = formatCurrency(comparisonMetrics[kpiName]);
            }
            icon = DollarSign;
            color = kpiName === "Revenue" ? "text-cyan-600" : kpiName === "Budget" ? "text-green-600" : "text-blue-600";
            break;
          case "ROAS":
            formattedValue = formatDecimal(value);
            if (stableFilters.compareEnabled && comparisonMetrics[kpiName] !== undefined) {
              formattedCompareValue = formatDecimal(comparisonMetrics[kpiName]);
            }
            icon = TrendingUp;
            color = "text-green-600";
            break;
          default:
            formattedValue = formatDecimal(value);
            if (stableFilters.compareEnabled && comparisonMetrics[kpiName] !== undefined) {
              formattedCompareValue = formatDecimal(comparisonMetrics[kpiName]);
            }
        }

        displayMetrics.push({
          label: kpiName,
          value: formattedValue,
          change,
          compareValue: formattedCompareValue,
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

  // Helper function to map dimension IDs to standard metric names
  const getMetricNameFromDimensionId = (dimId: string): string => {
    // Common dimension ID mappings
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
    return commonMappings[lowerDimId] || dimId;
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
    console.log('[KPI-FIXED] KPIMetricsCards - Rendering empty state (no metrics)');
    return (
      <div>
        <div className="flex items-center justify-end mb-4">
          {headerAction}
        </div>
        <div className="text-center py-8 text-muted-foreground">
          No data available for the selected filters
        </div>
      </div>
    );
  }

  console.log('[KPI-FIXED] KPIMetricsCards - Rendering metrics cards:', metrics.length);
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