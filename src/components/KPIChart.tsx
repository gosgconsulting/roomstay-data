import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { loadDimensionsForUser } from "@/lib/dimensionLoader";
import type { FilterState } from "@/components/FiltersBar";

interface ChartData {
  date: string;
  value: number;
  formattedDate: string;
  compareValue?: number;
}

interface KPIChartProps {
  reportId: string | null;
  filters: FilterState;
  accountId?: string;
  visibilityRefreshTrigger?: number;
  onLoadingComplete?: () => void;
}

export function KPIChart({ reportId, filters, accountId, visibilityRefreshTrigger, onLoadingComplete }: KPIChartProps) {
  const [dimensions, setDimensions] = useState<any[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<string>("");
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [isLoadingDimensions, setIsLoadingDimensions] = useState(true);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Get available KPIs from dimensions
  const availableKPIs = useMemo(() => {
    return dimensions
      .filter(d => d.type === 'number' || d.type === 'currency' || d.type === 'percentage')
      .map(d => ({ value: d.name, label: d.name }));
  }, [dimensions]);

  // Auto-select first KPI if none selected
  useEffect(() => {
    if (!selectedMetric && availableKPIs.length > 0) {
      setSelectedMetric(availableKPIs[0].value);
    }
  }, [selectedMetric, availableKPIs]);

  // Debug logging
  useEffect(() => {
    console.log('[CHART-DEBUG] =======================================');
    console.log('[CHART-DEBUG] reportId:', reportId);
    console.log('[CHART-DEBUG] selectedMetric:', selectedMetric);
    console.log('[CHART-DEBUG] stableFilters:', JSON.stringify(stableFilters, null, 2));
    console.log('[CHART-DEBUG] =======================================');
  }, [reportId, selectedMetric, stableFilters, visibilityRefreshTrigger]);

  // Refresh chart when visibility changes
  useEffect(() => {
    if (reportId && visibilityRefreshTrigger && visibilityRefreshTrigger > 0) {
      console.log('[testing] Refreshing KPI chart due to dimension visibility change');
      loadDimensions();
    }
  }, [visibilityRefreshTrigger, reportId]);

  const loadDimensions = async () => {
    if (!reportId) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      console.log('[testing] KPIChart - Loading dimensions for user:', user.id);

      // Load all dimensions including vlookup dimensions
      const dims = await loadDimensionsForUser(user.id, reportId);
      console.log('[testing] KPIChart - Loaded dimensions:', dims.length);
      setDimensions(dims);
    } catch (error) {
      console.error("Error loading dimensions:", error);
    } finally {
      setIsLoadingDimensions(false);
    }
  };

  // Load chart data with vlookup mappings applied
  const loadChartData = useCallback(async () => {
    if (!reportId || !selectedMetric || isLoadingDimensions) {
      setChartData([]);
      setIsLoadingData(false);
      return;
    }

    try {
      setIsLoadingData(true);
      console.log('[testing] Loading chart data for metric:', selectedMetric);

      // Get date range
      const dateFrom = filters.dateRange?.from ? format(filters.dateRange.from, 'yyyy-MM-dd') : undefined;
      const dateTo = filters.dateRange?.to ? format(filters.dateRange.to, 'yyyy-MM-dd') : undefined;

      // Load raw data
      let query = supabase
        .from('dimension_data')
        .select('dimension_values, row_number')
        .eq('report_id', reportId)
        .order('row_number', { ascending: true });

      const { data: rawData, error } = await query;
      if (error) throw error;

      if (!rawData || rawData.length === 0) {
        setChartData([]);
        return;
      }

      // Find date dimension
      const dateDimension = dimensions.find(d => d.type === 'date');
      if (!dateDimension) {
        console.warn('[testing] No date dimension found for chart');
        setChartData([]);
        return;
      }

      // Find metric dimension
      const metricDimension = dimensions.find(d => d.name === selectedMetric);
      if (!metricDimension) {
        console.warn('[testing] Metric dimension not found:', selectedMetric);
        setChartData([]);
        return;
      }

      // Apply date filtering
      let filteredData = rawData;
      if (dateFrom || dateTo) {
        const fromDate = dateFrom ? new Date(dateFrom) : null;
        const toDate = dateTo ? new Date(dateTo) : null;
        const adjustedToDate = toDate ? new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1) : null;

        filteredData = rawData.filter((row: any) => {
          const dv = row.dimension_values || {};
          const dateValue = dv[dateDimension.id];
          if (!dateValue) return true;
          
          const rowDate = new Date(String(dateValue));
          if (fromDate && rowDate < fromDate) return false;
          if (adjustedToDate && rowDate >= adjustedToDate) return false;
          return true;
        });
      }

      // Apply dimension filters with vlookup mappings
      if (filters.dimensionFilters && Object.keys(filters.dimensionFilters).length > 0) {
        filteredData = filteredData.filter((row: any) => {
          const dv = row.dimension_values || {};
          
          for (const [dimId, filterValues] of Object.entries(filters.dimensionFilters || {})) {
            if (!filterValues || filterValues.length === 0) continue;
            
            let rowValue = dv[dimId];
            if (rowValue === undefined || rowValue === null) return false;
            
            // Apply vlookup mapping if this is a vlookup dimension
            const dimension = dimensions.find(d => d.id === dimId);
            if (dimension && dimension.type === 'text' && dimension.scope === 'custom') {
              // This might be a vlookup dimension - check for mappings
              // Note: We would need vlookup mappings here, but for now we'll use the raw value
            }
            
            const rowStr = String(rowValue);
            if (!filterValues.some((v: string) => rowStr === v)) return false;
          }
          return true;
        });
      }

      // Transform data for chart
      const chartPoints: ChartData[] = [];
      const dateValueMap = new Map<string, number>();

      filteredData.forEach((row: any) => {
        const dv = row.dimension_values || {};
        const dateValue = dv[dateDimension.id];
        const metricValue = dv[metricDimension.id];

        if (dateValue && metricValue !== undefined && metricValue !== null) {
          const dateStr = String(dateValue);
          const numValue = parseFloat(String(metricValue));
          
          if (!isNaN(numValue)) {
            const existing = dateValueMap.get(dateStr) || 0;
            dateValueMap.set(dateStr, existing + numValue);
          }
        }
      });

      // Convert to chart format and sort by date
      const sortedData = Array.from(dateValueMap.entries())
        .map(([date, value]) => ({
          date,
          value,
          formattedDate: format(new Date(date), 'MMM dd')
        }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      console.log('[testing] Chart data loaded:', sortedData.length, 'points');
      setChartData(sortedData);
    } catch (error) {
      console.error('[testing] Error loading chart data:', error);
      setChartData([]);
    } finally {
      setIsLoadingData(false);
    }
  }, [reportId, selectedMetric, filters, dimensions, isLoadingDimensions]);

  // Set selectedKPI function
  const setSelectedKPI = (value: string) => {
    setSelectedMetric(value);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-lg font-semibold">Performance Chart</CardTitle>
          <Skeleton className="h-10 w-[180px]" />
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center">
            <Skeleton className="h-full w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-lg font-semibold">Performance Chart</CardTitle>
        <Select value={selectedMetric} onValueChange={setSelectedKPI}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select metric" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border z-50">
            {availableKPIs.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="h-[300px] flex flex-col items-center justify-center text-destructive text-sm space-y-2">
            <div className="font-medium">Failed to load chart data</div>
            <div className="text-xs text-center max-w-md">
              {error.includes('timeout') ? (
                <>
                  The request timed out. This usually happens with large datasets.
                  <br />Try applying filters to reduce the data size.
                </>
              ) : (
                error
              )}
            </div>
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
            No data available for the selected metric and filters
          </div>
        ) : (
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="formattedDate" 
                  className="text-xs fill-muted-foreground"
                />
                <YAxis className="text-xs fill-muted-foreground" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '6px',
                  }}
                  formatter={(value: any, name: string) => {
                    const label = name === 'value' ? 'Current' : 'Previous';
                    return [value.toLocaleString(), `${label} ${selectedMetric}`];
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2, r: 4 }}
                />
                {stableFilters.compareEnabled && chartData.some(d => d.compareValue !== undefined) && (
                  <Line
                    type="monotone"
                    dataKey="compareValue"
                    stroke="hsl(var(--muted-foreground))"
                    strokeWidth={2}
                    strokeDasharray="5 5"
                    dot={{ fill: 'hsl(var(--muted-foreground))', strokeWidth: 2, r: 4 }}
                  />
                )}
                {stableFilters.compareEnabled && (
                  <Legend
                    content={({ payload }) => (
                      <div className="flex justify-center gap-4 text-sm">
                        {payload?.map((entry, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <div 
                              className="w-3 h-0.5" 
                              style={{ backgroundColor: entry.color }}
                            />
                            <span>{entry.value === 'value' ? 'Current' : 'Previous'}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}