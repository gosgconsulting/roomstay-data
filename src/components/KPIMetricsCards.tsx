import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { FilterState } from "./FiltersBar";
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
}

interface KPIMetricsCardsProps {
  reportId: string | null;
  filters: FilterState;
}

export const KPIMetricsCards = ({ reportId, filters }: KPIMetricsCardsProps) => {
  const [metrics, setMetrics] = useState<KPIMetric[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (reportId) {
      loadMetrics();
    }
  }, [reportId, filters]);

  const loadMetrics = async () => {
    setIsLoading(true);
    try {
      // Get the current user to load all their dimensions
      const { data: { user } } = await supabase.auth.getUser();
      
      let dimensions = null;
      
      // First, try to fetch dimensions by user_id (all user's dimensions across all reports)
      if (user) {
        const { data: userDimensions, error: userError } = await supabase
          .from("dimensions")
          .select("*")
          .eq("user_id", user.id);

        if (userError) throw userError;
        dimensions = userDimensions;
      }
      
      // If no user or no dimensions found by user_id, fall back to loading from any dimension_data
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

      if (!dimensions || !allDimensionData) {
        setMetrics([]);
        return;
      }

      // Filter data based on applied filters
      const filteredData = allDimensionData.filter((row) => {
        const dimensionValues = row.dimension_values as Record<string, any>;
        
        // Apply dimension filters
        for (const [dimId, filterValue] of Object.entries(filters.dimensionFilters)) {
          if (dimensionValues[dimId] !== filterValue) {
            return false;
          }
        }
        
        // Apply date range filter if there's a Date dimension
        if (filters.dateRange?.from || filters.dateRange?.to) {
          const dateDimension = dimensions.find(d => d.type === 'date');
          if (dateDimension && dimensionValues[dateDimension.id]) {
            const rowDate = new Date(dimensionValues[dateDimension.id]);
            if (filters.dateRange.from && rowDate < filters.dateRange.from) {
              return false;
            }
            if (filters.dateRange.to && rowDate > filters.dateRange.to) {
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
      };

      // Build metrics in specific order
      const orderedMetrics = [
        'Impressions', 'Clicks', 'CTR', 'Conversions',
        'Conversion rate', 'CPC', 'ROAS', 'Cost of sale',
        'Cost', 'Revenue'
      ];

      orderedMetrics.forEach((metricName) => {
        if (aggregatedValues[metricName] !== undefined) {
          const dimension = dimensions.find(d => d.name === metricName);
          if (dimension) {
            const config = metricConfigs[metricName];
            displayMetrics.push({
              label: metricName,
              value: formatValue(aggregatedValues[metricName], dimension),
              icon: config?.icon || DollarSign,
              color: config?.color || 'bg-gray-500',
            });
          }
        }
      });

      setMetrics(displayMetrics);
    } catch (error) {
      console.error("Error loading metrics:", error);
    } finally {
      setIsLoading(false);
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
    return null;
  }

  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Analytics & Insights</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {metrics.map((metric, index) => {
          const IconComponent = metric.icon;
          return (
            <Card key={index} className="p-4 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground mb-1">{metric.label}</p>
                  <p className="text-2xl font-bold">{metric.value}</p>
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