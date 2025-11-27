import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { retryWithBackoff } from "@/lib/debug";
import { loadReportData, getCurrentMonthDateRange, Dimension } from "@/lib/data-loading-fix";
import { format, parseISO } from "date-fns";
import { useUser } from "@/lib/auth";

interface KPIChartProps {
  reportId: string | null;
  accountId: string | null;
  filters: {
    dimensionFilters: Record<string, string[]>;
    dateRange?: { from: Date; to?: Date };
    compareEnabled?: boolean;
    compareType?: string;
    compareDateRange?: { from: Date; to?: Date };
  };
  visibilityRefreshTrigger?: number;
  onLoadingComplete?: () => void;
  initialMetric?: string;
  isEditMode?: boolean;
  onMetricChange?: (metric: string) => void;
}

export function KPIChart({
  reportId,
  accountId,
  filters,
  visibilityRefreshTrigger,
  onLoadingComplete,
  initialMetric,
  isEditMode = false,
  onMetricChange,
}: KPIChartProps) {
  const { data: userData } = useUser();
  const user = userData?.user || null;
  const [chartData, setChartData] = useState<any[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<string>(initialMetric || "Revenue");
  const [isLoading, setIsLoading] = useState(true);
  const [availableMetrics, setAvailableMetrics] = useState<string[]>([]);

  console.log('[CHART-FIXED] Component render - reportId:', reportId, 'accountId:', accountId);

  // Create a stable reference for filters to prevent unnecessary re-renders
  const stableFilters = useMemo(() => {
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
    if (reportId && accountId) {
      loadChartData();
    } else {
      setIsLoading(false);
      onLoadingComplete?.();
    }
  }, [reportId, accountId, stableFilters, selectedMetric]);

  // Keep selectedMetric in sync if parent changes initialMetric
  useEffect(() => {
    if (initialMetric && initialMetric !== selectedMetric) {
      setSelectedMetric(initialMetric);
    }
  }, [initialMetric]);

  // Handler to update selection and notify parent (for persistence)
  const handleMetricChange = (m: string) => {
    setSelectedMetric(m);
    if (isEditMode) {
      onMetricChange?.(m);
    }
  };

  // Helper: evaluate conditions for a formula-condition pair against a row
  const meetsConditions = (dv: Record<string, any>, conditions?: { dimension_id: string; operator: 'equals' | 'not_equals' | 'contains' | 'not_contains'; value: string }[]) => {
    if (!conditions || conditions.length === 0) return true;
    return conditions.every(cond => {
      const raw = dv[cond.dimension_id];
      if (raw === undefined || raw === null) return false;
      const rowVal = String(raw).trim().toLowerCase();
      const target = String(cond.value).trim().toLowerCase();
      switch (cond.operator) {
        case 'equals': return rowVal === target;
        case 'not_equals': return rowVal !== target;
        case 'contains': return rowVal.includes(target);
        case 'not_contains': return !rowVal.includes(target);
        default: return false;
      }
    });
  };

  // Helper: evaluate a formula string for a row using dimension names
  const evaluateFormulaForRow = (formula: string, dv: Record<string, any>, dimensions: Dimension[]): number | null => {
    if (!formula) return null;

    // Map dimension names to numeric values from the row
    let expr = formula;

    // Replace percentage literals like "15%" with "(0.15)"
    expr = expr.replace(/(\d+(?:\.\d+)?)\s*%/g, (_, num) => `(${parseFloat(num) / 100})`);

    // Replace dimension names with values
    for (const dim of dimensions) {
      const val = dv[dim.id];
      const numeric = typeof val === 'number' ? val : (val !== undefined && val !== null ? parseFloat(String(val)) : 0);
      // word-boundary replacement to avoid partial name matches
      const re = new RegExp(`\\b${dim.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      expr = expr.replace(re, String(isFinite(numeric) ? numeric : 0));
    }

    // Avoid / 0
    if (expr.includes('/ 0')) return 0;

    try {
      const result = Function(`"use strict"; return (${expr})`)();
      return isFinite(result) ? Number(result) : null;
    } catch {
      return null;
    }
  };

  // Helper: compute metric value for a row (direct value or derived via formula)
  const getMetricValueForRow = (
    dv: Record<string, any>,
    metricDimension: Dimension,
    dimensions: Dimension[]
  ): number | null => {
    // Use direct value if present
    const direct = dv[metricDimension.id];
    if (direct !== undefined && direct !== null) {
      return typeof direct === 'number' ? direct : parseFloat(String(direct)) || 0;
    }

    // Try multiple formula-condition pairs first
    const pairs = (metricDimension as any).formula_condition_pairs as
      { formula: string; conditions?: { dimension_id: string; operator: any; value: string }[] }[] | undefined;

    if (pairs && pairs.length > 0) {
      // Prefer a pair whose conditions match; otherwise fallback to first pair
      const matched = pairs.find(p => meetsConditions(dv, p.conditions)) || pairs[0];
      const val = evaluateFormulaForRow(matched?.formula || '', dv, dimensions);
      return val ?? null;
    }

    // Fallback to single formula
    const singleFormula = (metricDimension as any).formula as string | undefined;
    if (singleFormula) {
      const val = evaluateFormulaForRow(singleFormula, dv, dimensions);
      return val ?? null;
    }

    // No data or formula
    return null;
  };

  const loadChartData = async () => {
    console.log('[CHART-FIXED] Loading chart data for metric:', selectedMetric);
    setIsLoading(true);
    
    try {
      if (!reportId || !accountId) {
        console.error('[CHART-FIXED] Missing required data:', { reportId, accountId });
        setChartData([]);
        return;
      }

      // Get current month date range for filtering if no date range provided
      const currentMonthRange = getCurrentMonthDateRange();
      
      // Apply filters from the component props
      const dataFilters = {
        dateRange: stableFilters.dateRange || currentMonthRange,
        dimensionFilters: stableFilters.dimensionFilters
      };

      console.log('[CHART-FIXED] Loading data with filters:', dataFilters);

      // Load data using the standardized approach
      const result = await loadReportData(reportId, accountId, user?.id, dataFilters);

      if (!result.success) {
        console.error('[CHART-FIXED] Failed to load report data:', result.error);
        setChartData([]);
        return;
      }

      const { data: filteredData, dimensions } = result;

      console.log('[CHART-FIXED] Loaded data:', {
        totalRows: result.totalRows,
        filteredRows: result.filteredRows,
        dimensions: dimensions.length
      });

      if (!dimensions || dimensions.length === 0 || filteredData.length === 0) {
        setChartData([]);
        return;
      }

      // Set available metrics from dimensions
      const metrics = dimensions
        .filter(d => d.type === 'number' || d.type === 'currency' || d.type === 'percentage')
        .map(d => d.name);
      
      setAvailableMetrics(metrics);

      // If selected metric is not available, select the first available one
      if (!metrics.includes(selectedMetric) && metrics.length > 0) {
        setSelectedMetric(metrics[0]);
        return; // This will trigger a re-render with the new metric
      }

      // Find the date and selected metric dimensions
      const dateDimension = dimensions.find(d => d.type === 'date');
      const metricDimension = dimensions.find(d => d.name === selectedMetric);

      if (!dateDimension || !metricDimension) {
        console.warn('[CHART-FIXED] Missing required dimensions:', { 
          dateDimension: !!dateDimension, 
          metricDimension: !!metricDimension 
        });
        setChartData([]);
        return;
      }

      // Group current period data by date (supports derived metrics via formulas)
      const currentDateGroups = new Map<string, number>();
      filteredData.forEach(row => {
        const dv = row.dimension_values;
        const dateStr = dv[dateDimension.id];
        const metricValue = getMetricValueForRow(dv, metricDimension, dimensions);

        if (dateStr && metricValue !== null && metricValue !== undefined) {
          const numericValue = typeof metricValue === 'number' ? metricValue : parseFloat(String(metricValue)) || 0;
          const currentTotal = currentDateGroups.get(dateStr) || 0;
          currentDateGroups.set(dateStr, currentTotal + numericValue);
        }
      });

      // Only load previous period data if comparison is enabled
      const previousDateGroups = new Map<string, number>();
      
      if (stableFilters.compareEnabled) {
        console.log('[CHART-FIXED] Comparison enabled, loading previous period data');
        
        // Calculate date ranges for current and previous periods
        const currentPeriod = dataFilters.dateRange!;
        const daysDiff = Math.ceil((currentPeriod.to!.getTime() - currentPeriod.from.getTime()) / (1000 * 60 * 60 * 24));
        
        const previousPeriodEnd = new Date(currentPeriod.from);
        previousPeriodEnd.setDate(previousPeriodEnd.getDate() - 1);
        const previousPeriodStart = new Date(previousPeriodEnd);
        previousPeriodStart.setDate(previousPeriodStart.getDate() - daysDiff + 1);

        console.log('[CHART-FIXED] Period comparison:', {
          current: { from: currentPeriod.from.toISOString(), to: currentPeriod.to?.toISOString() },
          previous: { from: previousPeriodStart.toISOString(), to: previousPeriodEnd.toISOString() },
          daysDiff
        });

        // Load previous period data
        const previousPeriodFilters = {
          dateRange: { from: previousPeriodStart, to: previousPeriodEnd },
          dimensionFilters: dataFilters.dimensionFilters
        };

        const previousResult = await loadReportData(reportId, accountId, user?.id, previousPeriodFilters);
        const previousData = previousResult.success ? previousResult.data : [];

        // Group previous period data by date (offset by the period difference)
        previousData.forEach(row => {
          const dv = row.dimension_values;
          const dateStr = dv[dateDimension.id];
          const metricValue = getMetricValueForRow(dv, metricDimension, dimensions);

          if (dateStr && metricValue !== null && metricValue !== undefined) {
            const numericValue = typeof metricValue === 'number' ? metricValue : parseFloat(String(metricValue)) || 0;
            
            const originalDate = parseISO(String(dateStr));
            const offsetDate = new Date(originalDate);
            offsetDate.setDate(offsetDate.getDate() + daysDiff + 1);
            const offsetDateStr = offsetDate.toISOString().split('T')[0];
            
            const currentTotal = previousDateGroups.get(offsetDateStr) || 0;
            previousDateGroups.set(offsetDateStr, currentTotal + numericValue);
          }
        });
      } else {
        console.log('[CHART-FIXED] Comparison disabled, skipping previous period data');
      }

      // Create chart data
      const allDates = new Set([...currentDateGroups.keys(), ...previousDateGroups.keys()]);
      const chartDataArray = Array.from(allDates)
        .map(dateStr => {
          const dataPoint: any = {
            date: dateStr,
            formattedDate: format(parseISO(dateStr), 'MMM dd'),
            [selectedMetric]: currentDateGroups.get(dateStr) || 0,
          };
          
          if (stableFilters.compareEnabled) {
            dataPoint[`${selectedMetric}_previous`] = previousDateGroups.get(dateStr) || 0;
          }
          
          return dataPoint;
        })
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      console.log('[CHART-FIXED] Chart data prepared:', {
        dataPoints: chartDataArray.length,
        metric: selectedMetric,
        compareEnabled: stableFilters.compareEnabled,
        currentPeriodPoints: Array.from(currentDateGroups.keys()).length,
        previousPeriodPoints: Array.from(previousDateGroups.keys()).length,
        sampleData: chartDataArray.slice(0, 3)
      });

      setChartData(chartDataArray);

    } catch (error) {
      console.error('[CHART-FIXED] Error loading chart data:', error);
      setChartData([]);
    } finally {
      setIsLoading(false);
      onLoadingComplete?.();
    }
  };

     const formatTooltipValue = (value: number, name: string) => {
     // Clean the metric name for formatting (remove _previous suffix)
     const cleanName = name.replace('_previous', '');
     
     if (cleanName.includes('Rate') || cleanName.includes('CTR') || cleanName.includes('Cost of sale')) {
       return `${value.toFixed(2)}%`;
     } else if (cleanName.includes('Cost') || cleanName.includes('Revenue') || cleanName.includes('CPC') || cleanName.includes('CPM')) {
       return `$${value.toLocaleString()}`;
     } else {
       return value.toLocaleString();
     }
   };

  if (isLoading) {
    return (
      <Card className="shadow-sm">
        <CardHeader className="flex flex-col items-end">
          <div className="flex items-center gap-2">
            <Select value={selectedMetric} onValueChange={handleMetricChange}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableMetrics.map((metric) => (
                  <SelectItem key={metric} value={metric}>
                    {metric}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-56 flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground">Loading chart data...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (chartData.length === 0) {
    return (
      <Card className="shadow-sm">
        <CardHeader className="flex flex-col items-end">
          <div className="flex items-center gap-2">
            <Select value={selectedMetric} onValueChange={handleMetricChange}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableMetrics.map((metric) => (
                  <SelectItem key={metric} value={metric}>
                    {metric}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-56 flex items-center justify-center text-muted-foreground">
            No chart data for selected date range
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-sm">
      <CardHeader className="flex flex-col items-end">
        <div className="flex items-center gap-2">
          <Select value={selectedMetric} onValueChange={handleMetricChange}>
            <SelectTrigger className="w-40 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableMetrics.map((metric) => (
                <SelectItem key={metric} value={metric}>
                  {metric}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-56 md:h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <defs>
                <linearGradient id="colorPrimary" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="formattedDate" 
                tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                angle={-45}
                textAnchor="end"
                height={50}
                stroke="hsl(var(--border))"
              />
              <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} stroke="hsl(var(--border))" />
              <Tooltip 
                formatter={(value: number, name: string) => [
                  formatTooltipValue(value, name),
                  name
                ]}
                labelFormatter={(label) => `Date: ${label}`}
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '6px',
                }}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey={selectedMetric} 
                stroke="hsl(var(--primary))" 
                strokeWidth={2}
                fill="url(#colorPrimary)"
                dot={{ fill: 'hsl(var(--primary))', strokeWidth: 1.5, r: 3 }}
                activeDot={{ r: 5 }}
                name="Current Period"
              />
              {stableFilters.compareEnabled && (
                <Line 
                  type="monotone" 
                  dataKey={`${selectedMetric}_previous`} 
                  stroke="hsl(var(--muted-foreground))" 
                  strokeWidth={1.5}
                  dot={{ fill: 'hsl(var(--muted-foreground))', strokeWidth: 1.5, r: 3 }}
                  activeDot={{ r: 5 }}
                  name="Previous Period"
                  strokeDasharray="5 5"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}