import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { FilterState } from "./FiltersBar";
import { cn } from "@/lib/utils";
import { debugLog, retryWithBackoff } from "@/lib/debug";
import {
  Eye,
  MousePointerClick,
  TrendingUp,
  ShoppingCart,
  Percent,
  DollarSign,
  Target,
  Calculator
} from "lucide-react";

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
}

export const KPIMetricsCards = ({ reportId, filters, onLoadingComplete }: KPIMetricsCardsProps) => {
  const [metrics, setMetrics] = useState<KPIMetric[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    console.log('[testing] KPIMetricsCards - reportId:', reportId);
    console.log('[testing] KPIMetricsCards - filters:', filters);
    if (reportId) {
      loadMetrics();
    } else {
      console.log('[testing] KPIMetricsCards - No reportId, skipping loadMetrics');
      setIsLoading(false);
    }
  }, [reportId, filters]);

  const loadMetrics = async () => {
    console.log('[testing] loadMetrics - Starting data fetch for reportId:', reportId);
    setIsLoading(true);
    try {
      // Get the current user to load all their dimensions
      const { data: { user } } = await supabase.auth.getUser();
      console.log('[testing] loadMetrics - User:', user?.id);
      
      // Load KPI visibility and order settings from report_views
      let visibleKPIs: string[] | null = null;
      let kpiOrder: string[] | null = null;
      
      if (user && reportId) {
        const { data: viewSettings } = await supabase
          .from("report_views")
          .select("visible_kpis, kpi_order")
          .eq("report_id", reportId)
          .eq("user_id", user.id)
          .eq("is_default", true)
          .maybeSingle();
        
        if (viewSettings) {
          visibleKPIs = viewSettings.visible_kpis as string[] | null;
          kpiOrder = viewSettings.kpi_order as string[] | null;
        }
      }
      
      let dimensions = null;
      
      // Fetch dimensions accessible to the user
      // RLS policies will filter global and custom dimensions automatically
      if (user) {
        try {
          const allDims = await retryWithBackoff(
            async () => {
              const { data, error } = await supabase
                .from("dimensions")
                .select("*");

              if (error) {
                const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
                throw new Error(`Failed to load dimensions: ${errorMsg}`);
              }

              return data || [];
            },
            3, // max attempts
            500 // initial delay in ms
          );

          // Filter to global dimensions and custom dimensions for this report if reportId provided
          if (reportId) {
            dimensions = (allDims || []).filter((d: any) =>
              d.scope === 'global' ||
              (d.scope === 'custom' && d.report_id === reportId)
            );
          } else {
            dimensions = allDims || [];
          }

          console.log('[testing] loadMetrics - Dimensions loaded:', dimensions?.length);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
          console.error('[testing] Error loading metrics:', errorMsg);
          dimensions = [];
        }
      }

      // If no dimensions found, try falling back to loading from dimension_data
      if (!dimensions || dimensions.length === 0) {
        const { data: dimensionData, error: dimDataError } = await supabase
          .from("dimension_data")
          .select("dimension_values")
          .limit(1)
          .maybeSingle();

        if (dimDataError) throw dimDataError;

        if (dimensionData?.dimension_values) {
          const dimensionIds = Object.keys(dimensionData.dimension_values as Record<string, any>);

          if (dimensionIds.length > 0) {
            const { data: dimensionsById, error: dimError2 } = await supabase
              .from("dimensions")
              .select("*")
              .in("id", dimensionIds);

            if (dimError2) throw dimError2;
            dimensions = dimensionsById;
          }
        }
      }

      // Fetch dimension_data in chunks (5000 rows at a time)
      const CHUNK_SIZE = 5000;
      let allDimensionData: any[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data: chunkData, error } = await supabase
          .from("dimension_data")
          .select("*")
          .eq("report_id", reportId)
          .order('row_number', { ascending: true })
          .range(offset, offset + CHUNK_SIZE - 1);

        if (error) throw error;

        if (chunkData && chunkData.length > 0) {
          allDimensionData = [...allDimensionData, ...chunkData];
          offset += CHUNK_SIZE;
          hasMore = chunkData.length === CHUNK_SIZE;
        } else {
          hasMore = false;
        }
      }

      console.log('[testing] loadMetrics - Total dimension_data rows loaded:', allDimensionData.length);

      if (!dimensions || !allDimensionData) {
        console.log('[testing] loadMetrics - No dimensions or data, setting empty metrics');
        console.log('[testing] loadMetrics - dimensions:', dimensions?.length, 'allDimensionData:', allDimensionData?.length);
        setMetrics([]);
        return;
      }

      // Helper to filter and aggregate data for a date range
      const aggregateForPeriod = (fromDate?: Date, toDate?: Date) => {
        const filteredData = allDimensionData.filter((row) => {
          const dimensionValues = row.dimension_values as Record<string, any>;
          
          // Apply dimension filters
          for (const [dimId, filterValue] of Object.entries(filters.dimensionFilters)) {
            if (dimensionValues[dimId] !== filterValue) {
              return false;
            }
          }
          
          // Apply date range filter if there's a Date dimension
          if (fromDate || toDate) {
            const dateDimension = dimensions.find(d => d.type === 'date');
            if (dateDimension && dimensionValues[dateDimension.id]) {
              const rowDate = new Date(dimensionValues[dateDimension.id]);
              if (fromDate && rowDate < fromDate) {
                return false;
              }
              if (toDate && rowDate > toDate) {
                return false;
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
      const aggregatedValues = aggregateForPeriod(filters.dateRange?.from, filters.dateRange?.to);

      // Get comparison period data if comparison is enabled
      let compareValues: Record<string, number> | null = null;
      if (filters.compareEnabled && filters.compareDateRange?.from && filters.compareDateRange?.to) {
        compareValues = aggregateForPeriod(filters.compareDateRange.from, filters.compareDateRange.to);
      }

      // Map to display metrics with icons and colors
      const displayMetrics: KPIMetric[] = [];
      
      // Define metric configurations with icons and colors
      const metricConfigs: Record<string, { icon: any; color: string }> = {
        'Impressions': { icon: Eye, color: 'bg-pink-500' },
        'Clicks': { icon: MousePointerClick, color: 'bg-purple-500' },
        'CTR': { icon: TrendingUp, color: 'bg-emerald-500' },
        'Conversions': { icon: ShoppingCart, color: 'bg-orange-500' },
        'Conversion rate': { icon: Percent, color: 'bg-pink-500' },
        'CPC': { icon: DollarSign, color: 'bg-purple-500' },
        'ROAS': { icon: Target, color: 'bg-pink-500' },
        'Cost of sale': { icon: Calculator, color: 'bg-yellow-500' },
        'Cost': { icon: DollarSign, color: 'bg-blue-500' },
        'Revenue': { icon: DollarSign, color: 'bg-cyan-500' },
        'Purchases': { icon: ShoppingCart, color: 'bg-green-500' },
        'Leads': { icon: Target, color: 'bg-indigo-500' },
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
        if (!visibleKPIsSet.has(metricName)) return;
        
        if (aggregatedValues[metricName] !== undefined) {
          const dimension = dimensions.find(d => d.name === metricName);
          if (dimension) {
            const config = metricConfigs[metricName] || { icon: Calculator, color: 'bg-slate-500' }; // Default fallback
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
                change = 100; // If previous was 0 and current is not, it's 100% increase
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

      console.log('[testing] loadMetrics - Display metrics created:', displayMetrics.length);
      console.log('[testing] loadMetrics - Metrics:', displayMetrics.map(m => ({ label: m.label, value: m.value })));
      
      setMetrics(displayMetrics);
    } catch (error) {
      console.error("[testing] Error loading metrics:", error);
    } finally {
      console.log('[testing] loadMetrics - Setting isLoading to false');
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
      
      // eslint-disable-next-line no-eval
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

  console.log('[testing] KPIMetricsCards render - isLoading:', isLoading, 'metrics.length:', metrics.length);

  if (isLoading) {
    console.log('[testing] KPIMetricsCards - Rendering loading state');
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

  // Don't hide if no metrics - show empty state only if explicitly no dimensions
  if (metrics.length === 0) {
    console.log('[testing] KPIMetricsCards - Rendering empty state (no metrics)');
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

  console.log('[testing] KPIMetricsCards - Rendering metrics cards:', metrics.length);
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
