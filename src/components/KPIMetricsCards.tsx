import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, TrendingDown, Eye, MousePointer, ShoppingCart, DollarSign, Percent, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { loadReportData, calculateKPIMetrics, getCurrentMonthDateRange, Dimension } from "@/lib/data-loading-fix";
import { getAccountIdFromReport } from "@/lib/dimensionLoader";
import { cn } from "@/lib/utils";
import type { FilterState } from "@/components/FiltersBar";

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
}

export const KPIMetricsCards = ({ 
  reportId, 
  filters, 
  onLoadingComplete,
  accountId,
  visibilityRefreshTrigger
}: KPIMetricsCardsProps) => {
  const [metrics, setMetrics] = useState<KPIMetric[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [resolvedAccountId, setResolvedAccountId] = useState<string | null>(accountId ?? null);

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

  // Resolve accountId if not passed
  useEffect(() => {
    let cancelled = false;
    const resolveAccount = async () => {
      if (!reportId) return;
      if (accountId) {
        setResolvedAccountId(accountId);
        return;
      }
      const accId = await getAccountIdFromReport(reportId);
      if (!cancelled) setResolvedAccountId(accId);
    };
    resolveAccount();
    return () => { cancelled = true; };
  }, [reportId, accountId]);

  useEffect(() => {
    if (reportId && resolvedAccountId) {
      loadMetrics();
    } else {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, resolvedAccountId, stableFilters]);

  // Refresh metrics when dimension visibility changes
  useEffect(() => {
    if (reportId && resolvedAccountId && visibilityRefreshTrigger && visibilityRefreshTrigger > 0) {
      loadMetrics();
    }
  }, [visibilityRefreshTrigger, reportId, resolvedAccountId]);

  const loadMetrics = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!reportId || !resolvedAccountId) {
        setMetrics([]);
        return;
      }

      const currentMonthRange = getCurrentMonthDateRange();

      const dataFilters = {
        dateRange: stableFilters.dateRange || currentMonthRange,
        dimensionFilters: stableFilters.dimensionFilters
      };

      const result = await loadReportData(reportId, resolvedAccountId, user?.id, dataFilters);

      if (!result.success) {
        console.error('[KPIMetricsCards] Failed to load report data:', result.error);
        setMetrics([]);
        return;
      }

      const { data: filteredData, dimensions } = result;

      if (!dimensions || dimensions.length === 0 || filteredData.length === 0) {
        setMetrics([]);
        return;
      }

      // Calculate current period metrics
      const currentMetrics = await calculateKPIMetrics(filteredData, dimensions, reportId, resolvedAccountId);

      // Load comparison period data if comparison is enabled
      let comparisonMetrics: Record<string, number> = {};
      if (stableFilters.compareEnabled) {
        const currentPeriod = dataFilters.dateRange!;
        const daysDiff = Math.ceil((currentPeriod.to!.getTime() - currentPeriod.from.getTime()) / (1000 * 60 * 60 * 24));
        const previousPeriodEnd = new Date(currentPeriod.from);
        previousPeriodEnd.setDate(previousPeriodEnd.getDate() - 1);
        const previousPeriodStart = new Date(previousPeriodEnd);
        previousPeriodStart.setDate(previousPeriodStart.getDate() - daysDiff + 1);

        const comparisonFilters = {
          dateRange: { from: previousPeriodStart, to: previousPeriodEnd },
          dimensionFilters: stableFilters.dimensionFilters
        };

        const comparisonResult = await loadReportData(reportId, resolvedAccountId, user?.id, comparisonFilters);
        if (comparisonResult.success) {
          comparisonMetrics = await calculateKPIMetrics(comparisonResult.data, dimensions, reportId, resolvedAccountId);
        }
      }

      const defaultKPIs = [
        "Impressions", "Clicks", "CTR", "Conversions", "Conversion Rate", 
        "CPC", "Cost", "Revenue", "ROAS", "Cost of sale"
      ];

      // Build display metrics from calculated metrics
      const displayMetrics: KPIMetric[] = [];
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

      const kpisToShow = defaultKPIs;
      const orderedKPIs = kpisToShow;

      orderedKPIs.forEach(kpiName => {
        const value = currentMetrics[kpiName];
        if (value === undefined || value === null) return;

        let formattedValue: string | number = value;
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

  if (metrics.length === 0) {
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