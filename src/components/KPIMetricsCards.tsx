import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings, TrendingDown, Minus, Calculator, PieChart } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { loadDimensionsForUser } from "@/lib/dimensionLoader";
import type { FilterState } from "@/components/FiltersBar";

// Import icons
import {
  MousePointerClick,
  ShoppingCart,
  DollarSign,
  BarChart3,
  Percent,
  Eye,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  TrendingUp,
} from "lucide-react";

// Add missing debug functions
const retryWithBackoff = async (fn: () => Promise<any>, maxAttempts: number = 3, delay: number = 1000) => {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * attempt));
    }
  }
};

const filterDimensionsByVisibility = async (dimensions: Dimension[], reportId: string, userId: string, supabase: any) => {
  // Simple implementation - return all dimensions for now
  return dimensions;
};

interface Dimension {
  id: string;
  name: string;
  type: string;
  user_id?: string;
  formula?: string | null;
  is_system?: boolean;
  scope?: 'global' | 'custom' | 'account';
}

interface KPIMetric {
  label: string;
  value: string;
  icon: any;
  color: string;
  change?: number;
  compareValue?: string;
}

interface KPIMetricsCardsProps {
  reportId: string | null;
  filters: FilterState;
  onLoadingComplete?: () => void;
  accountId?: string;
  visibilityRefreshTrigger?: number;
}

export const KPIMetricsCards = ({ reportId, filters, onLoadingComplete, accountId, visibilityRefreshTrigger }: KPIMetricsCardsProps) => {
  const [metrics, setMetrics] = useState<KPIMetric[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Create a stable reference for filters to prevent unnecessary re-renders
  const stableFilters = useMemo(() => {
    return {
      dimensionFilters: filters.dimensionFilters || {},
      dateRange: filters.dateRange,
      datePreset: filters.datePreset,
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
    if (reportId) {
      loadMetrics();
    } else {
      setIsLoading(false);
    }
  }, [reportId, stableFilters]);

  // Refresh metrics when dimension visibility changes
  useEffect(() => {
    if (reportId && visibilityRefreshTrigger && visibilityRefreshTrigger > 0) {
      loadMetrics();
    }
  }, [visibilityRefreshTrigger, reportId]);

  const loadMetrics = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Load KPI visibility and order settings from report_views
      let visibleKPIs: string[] | null = null;
      let kpiOrder: string[] | null = null;

      if (user && reportId) {
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

              if (error) throw new Error((error as any)?.message ?? 'Failed to load KPI view settings');
              return data;
            },
            3,
            500
          );

          if (viewSettings) {
            visibleKPIs = viewSettings.visible_kpis as string[] | null;
            kpiOrder = viewSettings.kpi_order as string[] | null;
          }
        } catch (error) {
          console.error('[testing] Failed to load KPI view settings:', error);
        }
      }
      
      let dimensions: Dimension[] | null = null;
      
      // Load dimensions
      if (user) {
        try {
          // Load global dimensions
          const { data: globalData, error: globalError } = await supabase
            .from("dimensions")
            .select("*")
            .eq("scope", "global")
            .order("created_at", { ascending: false });

          if (globalError) throw new Error((globalError as any)?.message ?? 'Failed to load global dimensions');

          // Load account-specific dimensions if accountId is provided
          let accountData: Dimension[] = [];
          if (accountId) {
            const { data, error: accountError } = await supabase
              .from("dimensions")
              .select("*")
              .eq("scope", "account")
              .eq("account_id", accountId)
              .order("created_at", { ascending: false });

            if (accountError) throw new Error((accountError as any)?.message ?? 'Failed to load account dimensions');
            accountData = (data || []);
          }

          // Load custom dimensions for this user
          let customData: Dimension[] = [];
          const { data, error: customError } = await supabase
            .from("dimensions")
            .select("*")
            .eq("user_id", user.id)
            .eq("scope", "custom")
            .or(`report_id.is.null,report_id.eq.${reportId}`)
            .order("created_at", { ascending: false });

          if (customError) throw new Error((customError as any)?.message ?? 'Failed to load custom dimensions');

          // Combine all dimensions - prioritize account-scoped over global
          const allDimensions = [
            ...accountData,
            ...customData,
            ...(globalData || [])
          ];

          // Deduplicate dimensions by name
          const seenNames = new Set<string>();
          const uniqueDimensions = allDimensions.filter(dim => {
            if (seenNames.has(dim.name)) {
              return false;
            }
            seenNames.add(dim.name);
            return true;
          });

          dimensions = uniqueDimensions;
        } catch (error) {
          console.error('[testing] Error loading dimensions:', error);
          dimensions = [];
        }
      } else {
        dimensions = [];
      }

      // Filter dimensions by visibility settings
      if (user && reportId && dimensions && dimensions.length > 0) {
        dimensions = await filterDimensionsByVisibility(dimensions, reportId, user.id, supabase);
      }

      // Fetch dimension_data
      let allDimensionData: any[] = [];
      const CHUNK_SIZE = 3000;
      let offset = 0;
      let hasMore = true;
      
      try {
        while (hasMore) {
          const chunkData = await retryWithBackoff(
            async () => {
              const { data, error } = await supabase
                .from("dimension_data")
                .select("id, row_number, dimension_values")
                .eq("report_id", reportId)
                .order('row_number', { ascending: false })
                .range(offset, offset + CHUNK_SIZE - 1);

              if (error) throw new Error((error as any)?.message ?? 'Failed to load dimension_data chunk');
              return data;
            },
            3,
            1000
          );

          if (chunkData && chunkData.length > 0) {
            allDimensionData = [...allDimensionData, ...chunkData];
            offset += CHUNK_SIZE;
            hasMore = chunkData.length === CHUNK_SIZE;
          } else {
            hasMore = false;
          }
        }
      } catch (error) {
        console.error('[METRICS] Error fetching dimension_data:', error);
        allDimensionData = [];
      }

      if (!dimensions || dimensions.length === 0) {
        setMetrics([]);
        return;
      }

      if (!allDimensionData || allDimensionData.length === 0) {
        setMetrics([]);
        return;
      }

      // Helper to filter and aggregate data for a date range
      const aggregateForPeriod = (fromDate?: Date, toDate?: Date) => {
        const filteredData = allDimensionData.filter((row) => {
          const dimensionValues = row.dimension_values as Record<string, any>;
          
          // Apply dimension filters (case-insensitive)
          for (const [dimId, filterValues] of Object.entries(stableFilters.dimensionFilters)) {
            if (filterValues && Array.isArray(filterValues) && filterValues.length > 0) {
              const rowValue = dimensionValues[dimId];

              // If dimension missing in row, exclude
              if (rowValue === undefined || rowValue === null) {
                return false;
              }

              const rowStr = String(rowValue).trim().toLowerCase();
              const filterValuesLower = (filterValues as string[]).map(v => String(v).trim().toLowerCase());

              if (!filterValuesLower.some(v => v === rowStr)) {
                return false;
              }
            }
          }
          
          // Apply date range filter if there's a Date dimension
          if (fromDate || toDate) {
            const dateDimension = dimensions.find(d => d.type === 'date');
            if (dateDimension && dimensionValues[dateDimension.id]) {
              const rowDateStr = dimensionValues[dateDimension.id];
              const rowDate = new Date(rowDateStr);
              
              if (fromDate && rowDate < fromDate) {
                return false;
              }
              if (toDate) {
                const adjustedToDate = new Date(toDate);
                adjustedToDate.setDate(adjustedToDate.getDate() + 1);
                if (rowDate >= adjustedToDate) {
                  return false;
                }
              }
            }
          }
          
          return true;
        });

        // Calculate aggregated values for each dimension
        const aggregatedValues: Record<string, number> = {};

        filteredData.forEach((row) => {
          const dimensionValues = row.dimension_values as Record<string, any>;
          
          dimensions.forEach((dimension) => {
            // Skip formula dimensions for now
            if (dimension.formula) return;
            
            const value = dimensionValues[dimension.id];
            if (value !== null && value !== undefined) {
              if (dimension.type === 'number' || dimension.type === 'currency') {
                const numValue = parseFloat(value) || 0;
                aggregatedValues[dimension.name] = (aggregatedValues[dimension.name] || 0) + numValue;
              }
            }
          });
        });

        // Calculate formula dimensions
        dimensions.forEach((dimension) => {
          if (dimension.formula) {
            const calculatedValue = calculateFormula(dimension.formula, aggregatedValues, dimensions);
            if (calculatedValue !== null) {
              aggregatedValues[dimension.name] = calculatedValue;
            }
          }
        });

        return aggregatedValues;
      };

      // Get current period data
      const aggregatedValues = aggregateForPeriod(stableFilters.dateRange?.from, stableFilters.dateRange?.to);

      // Get comparison period data if comparison is enabled
      let compareValues: Record<string, number> | null = null;
      if (stableFilters.compareEnabled && stableFilters.compareDateRange?.from && stableFilters.compareDateRange?.to) {
        compareValues = aggregateForPeriod(stableFilters.compareDateRange.from, stableFilters.compareDateRange.to);
      }

      // Map to display metrics with icons and colors
      const displayMetrics: KPIMetric[] = [];
      
      // Define metric configurations with icons and colors for all KPIs
      const metricConfigs: Record<string, { icon: any; color: string }> = {
        'Impressions': { icon: Eye, color: 'bg-pink-500' },
        'Clicks': { icon: MousePointerClick, color: 'bg-purple-500' },
        'Cost': { icon: DollarSign, color: 'bg-blue-500' },
        'Revenue': { icon: DollarSign, color: 'bg-cyan-500' },
        'Conversions': { icon: ShoppingCart, color: 'bg-orange-500' },
        'Bookings': { icon: BarChart3, color: 'bg-green-500' },
        'Leads': { icon: Target, color: 'bg-indigo-500' },
        'CTR': { icon: TrendingUp, color: 'bg-emerald-500' },
        'ROAS': { icon: Target, color: 'bg-rose-500' },
        'Conversion Rate': { icon: Percent, color: 'bg-violet-500' },
        'CPC': { icon: DollarSign, color: 'bg-amber-500' },
        'CPM': { icon: DollarSign, color: 'bg-teal-500' },
        'Cost of sale': { icon: Calculator, color: 'bg-yellow-500' },
        'Impression Share': { icon: PieChart, color: 'bg-slate-500' },
        'Conversion rate': { icon: Percent, color: 'bg-violet-500' },
        'Purchases': { icon: ShoppingCart, color: 'bg-green-500' },
      };

      // Get all available metric names from dimensions
      const allAvailableMetrics = dimensions
        .filter(d => d.type === 'number' || d.type === 'currency' || d.type === 'percentage')
        .map(d => d.name);

      // Use custom order if available, otherwise use all available metrics
      const orderedMetrics = kpiOrder && kpiOrder.length > 0 
        ? kpiOrder 
        : allAvailableMetrics;
      
      // Get visible KPIs set - default to all if not specified
      const visibleKPIsSet = visibleKPIs && visibleKPIs.length > 0
        ? new Set(visibleKPIs) 
        : new Set(allAvailableMetrics);

      orderedMetrics.forEach((metricName) => {
        // Skip if not visible
        if (!visibleKPIsSet.has(metricName)) {
          return;
        }
        
        if (aggregatedValues[metricName] !== undefined) {
          const dimension = dimensions.find(d => d.name === metricName);
          if (dimension) {
            const config = metricConfigs[metricName] || { icon: Calculator, color: 'bg-slate-500' };
            const currentValue = aggregatedValues[metricName];
            
            let change: number | undefined;
            let compareValue: string | undefined;
            
            if (compareValues && compareValues[metricName] !== undefined) {
              const prevValue = compareValues[metricName];
              compareValue = formatValue(prevValue, dimension);
              
              // Calculate percentage change
              if (prevValue !== 0) {
                change = ((currentValue - prevValue) / prevValue) * 100;
              } else if (currentValue !== 0) {
                change = 100;
              }
            }
            
            displayMetrics.push({
              label: metricName,
              value: formatValue(currentValue, dimension),
              icon: config?.icon || DollarSign,
              color: config?.color || 'bg-gray-500',
              change,
              compareValue,
            });
          }
        }
      });
      
      setMetrics(displayMetrics);
    } catch (error) {
      console.error("[testing] Error loading metrics:", error);
    } finally {
      setIsLoading(false);
      onLoadingComplete?.();
    }
  };

  const calculateFormula = (
    formula: string, 
    data: Record<string, number>,
    dimensions: any[]
  ): number | null => {
    if (!formula) return null;
    
    try {
      let expression = formula;
      const dimensionNames = dimensions.map(d => d.name);
      const sortedNames = [...dimensionNames].sort((a, b) => b.length - a.length);
      
      for (const dimName of sortedNames) {
        if (expression.includes(dimName)) {
          const value = data[dimName] || 0;
          expression = expression.replace(
            new RegExp(`\\b${dimName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), 
            String(value)
          );
        }
      }
      
      // Handle percentage notation
      expression = expression.replace(/(\d+(?:\.\d+)?)\s*%/g, (match, num) => {
        return `(${parseFloat(num) / 100})`;
      });
      
      const result = eval(expression);
      
      if (!isFinite(result)) return null;
      
      return result;
    } catch (error) {
      return null;
    }
  };

  const formatValue = (value: number, dimension: any): string => {
    if (value === null || value === undefined) return "-";
    
    const dimName = dimension.name.toLowerCase();
    
    // CTR, Conversion rate, Cost of sale - show as percentage
    if (dimName === 'ctr' || dimName === 'conversion rate' || dimName === 'cost of sale') {
      return `${value.toFixed(2)}%`;
    }
    
    // CPC - 2 decimals with $
    if (dimName === 'cpc') {
      return `$${value.toFixed(2)}`;
    }
    
    // ROAS - show as multiplier
    if (dimName === 'roas') {
      return `${value.toFixed(2)}x`;
    }
    
    // Cost and Revenue - rounded with $ and commas
    if (dimName === 'cost' || dimName === 'revenue') {
      return `$${Math.round(value).toLocaleString('en-US')}`;
    }
    
    // Currency type
    if (dimension.type === 'currency') {
      return `$${value.toFixed(2)}`;
    }
    
    // Regular numbers
    if (Number.isInteger(value)) {
      return value.toLocaleString('en-US');
    }
    
    return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  if (isLoading) {
    return (
      <div>
        <h2 className="text-lg font-semibold mb-4">Analytics & Insights</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-8 w-24" />
                </div>
                <Skeleton className="h-11 w-11 rounded-full" />
              </div>
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
        <div className="text-center py-8 text-muted-foreground">
          <p>No KPIs configured. Add dimensions to see metrics here.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Analytics & Insights</h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {metrics.map((metric, index) => {
          const IconComponent = metric.icon;
          const hasComparison = metric.change !== undefined;
          const isPositive = metric.change && metric.change > 0;
          const isNegative = metric.change && metric.change < 0;
          
          return (
            <Card key={index} className="p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-1">{metric.label}</p>
                  <p className="text-2xl font-bold">{metric.value}</p>
                  {hasComparison && (
                    <div className="mt-2 space-y-1">
                      <div className={cn(
                        "flex items-center gap-1 text-xs font-medium",
                        isPositive && "text-emerald-600 dark:text-emerald-400",
                        isNegative && "text-red-600 dark:text-red-400",
                        !isPositive && !isNegative && "text-muted-foreground"
                      )}>
                        {isPositive && <span>↑</span>}
                        {isNegative && <span>↓</span>}
                        <span>
                          {Math.abs(metric.change || 0).toFixed(1)}%
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        vs {metric.compareValue}
                      </p>
                    </div>
                  )}
                </div>
                <div className={`${metric.color} rounded-full p-2.5 flex items-center justify-center`}>
                  <IconComponent className="h-5 w-5 text-white" />
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};