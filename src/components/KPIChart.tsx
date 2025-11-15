import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { FilterState } from "@/components/FiltersBar";
import type { Dimension } from "@/hooks/performanceTable/usePerformanceTableDimensions";

interface KPIChartProps {
  reportId: string | null;
  filters: FilterState;
  accountId?: string | null;
  visibilityRefreshTrigger?: number;
  onLoadingComplete?: () => void;
  dimensions?: Dimension[];
}

export function KPIChart({ reportId, filters, accountId, visibilityRefreshTrigger, onLoadingComplete, dimensions = [] }: KPIChartProps) {
  const [chartData, setChartData] = useState<any[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<string>("Revenue");
  const [isLoading, setIsLoading] = useState(true);
  const [availableMetrics, setAvailableMetrics] = useState<string[]>([]);

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
    JSON.stringify(filters.dimensionFilters || {}),
    filters.dateRange?.from ? (filters.dateRange.from as Date).toISOString() : undefined,
    filters.dateRange?.to ? (filters.dateRange.to as Date).toISOString() : undefined,
    filters.compareEnabled,
    filters.compareType,
    filters.compareDateRange?.from ? (filters.compareDateRange.from as Date).toISOString() : undefined,
    filters.compareDateRange?.to ? (filters.compareDateRange.to as Date).toISOString() : undefined,
  ]);

  // Reload on visibility changes
  useEffect(() => {
    if (reportId && dimensions.length > 0 && visibilityRefreshTrigger && visibilityRefreshTrigger > 0) {
      loadChartData();
    }
  }, [visibilityRefreshTrigger, reportId, dimensions.length]);

  useEffect(() => {
    if (reportId && dimensions.length > 0) {
      loadChartData();
    } else {
      setIsLoading(false);
      onLoadingComplete?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, stableFilters, selectedMetric, dimensions.length]);

  const loadChartData = async () => {
    setIsLoading(true);
    try {
      if (!reportId || dimensions.length === 0) {
        setChartData([]);
        return;
      }

      const metrics = dimensions
        .filter((d: Dimension) => d.type === 'number' || d.type === 'currency' || d.type === 'percentage')
        .map((d: Dimension) => d.name);

      setAvailableMetrics(metrics);

      // Auto-select metric if current is not available
      if (!metrics.includes(selectedMetric) && metrics.length > 0) {
        setSelectedMetric(metrics[0]);
        return;
      }

      const dateDimension = dimensions.find((d: Dimension) => d.type === 'date');
      const metricDimension = dimensions.find((d: Dimension) => d.name === selectedMetric);

      if (!dateDimension || !metricDimension) {
        setChartData([]);
        return;
      }

      // Fetch raw dimension_data rows (same as Performance Table)
      let query = supabase
        .from('dimension_data')
        .select('dimension_values, row_number, data_source_id')
        .eq('report_id', reportId)
        .order('row_number', { ascending: true });

      const { data: rawRows, error } = await query;
      if (error) throw new Error((error as any)?.message ?? 'Failed to fetch dimension_data');
      
      if (!rawRows || rawRows.length === 0) {
        setChartData([]);
        return;
      }

      // Apply date filter (same logic as Performance Table)
      const dateFromFormatted = stableFilters.dateRange?.from ? format(stableFilters.dateRange.from, 'yyyy-MM-dd') : undefined;
      const dateToFormatted = stableFilters.dateRange?.to ? format(stableFilters.dateRange.to, 'yyyy-MM-dd') : undefined;

      let filteredRows = rawRows;
      if (dateFromFormatted || dateToFormatted) {
        const fromDate = dateFromFormatted ? new Date(dateFromFormatted) : null;
        const toDate = dateToFormatted ? new Date(dateToFormatted) : null;
        const adjustedToDate = toDate
          ? new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1)
          : null;

        filteredRows = filteredRows.filter((row: any) => {
          const dv = row.dimension_values || {};
          const val = dv[dateDimension.id];
          if (!val) return true;
          const rowDate = new Date(String(val));
          if (fromDate && rowDate < fromDate) return false;
          if (adjustedToDate && rowDate >= adjustedToDate) return false;
          return true;
        });
      }

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

      // Group current period data by date
      const currentDateGroups = new Map<string, number>();
      filteredRows.forEach((row: any) => {
        const dv = row.dimension_values;
        const dateStr = dv[dateDimension.id];
        const metricValue = dv[metricDimension.id];
        if (dateStr && metricValue !== undefined && metricValue !== null) {
          const numericValue = typeof metricValue === 'number' ? metricValue : parseFloat(String(metricValue)) || 0;
          const currentTotal = currentDateGroups.get(dateStr) || 0;
          currentDateGroups.set(dateStr, currentTotal + numericValue);
        }
      });

      // Previous period data if enabled
      const previousDateGroups = new Map<string, number>();
      if (stableFilters.compareEnabled && stableFilters.dateRange?.from && stableFilters.dateRange?.to) {
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
          const prevFromDate = new Date(prevFromFormatted);
          const prevToDate = new Date(prevToFormatted);
          const prevAdjustedToDate = new Date(prevToDate.getFullYear(), prevToDate.getMonth(), prevToDate.getDate() + 1);

          prevFilteredRows = prevFilteredRows.filter((row: any) => {
            const dv = row.dimension_values || {};
            const val = dv[dateDimension.id];
            if (!val) return true;
            const rowDate = new Date(String(val));
            if (rowDate < prevFromDate) return false;
            if (rowDate >= prevAdjustedToDate) return false;
            return true;
          });

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

          prevFilteredRows.forEach((row: any) => {
            const dv = row.dimension_values;
            const dateStr = dv[dateDimension.id];
            const metricValue = dv[metricDimension.id];
            if (dateStr && metricValue !== undefined && metricValue !== null) {
              const numericValue = typeof metricValue === 'number' ? metricValue : parseFloat(String(metricValue)) || 0;
              const originalDate = parseISO(String(dateStr));
              const offsetDate = new Date(originalDate);
              offsetDate.setDate(offsetDate.getDate() + daysDiff + 1);
              const offsetDateStr = offsetDate.toISOString().split('T')[0];
              const currentTotal = previousDateGroups.get(offsetDateStr) || 0;
              previousDateGroups.set(offsetDateStr, currentTotal + numericValue);
            }
          });
        }
      }

      // Build chart data array
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

      setChartData(chartDataArray);
    } catch (error) {
      console.error('[KPIChart] Error loading chart data:', error);
      setChartData([]);
    } finally {
      setIsLoading(false);
      onLoadingComplete?.();
    }
  };

  const formatTooltipValue = (value: number, name: string) => {
    const cleanName = name.replace('_previous', '');
    const n = Number(value);
    if (Number.isNaN(n)) return String(value);
    if (cleanName.includes('Rate') || cleanName.includes('CTR') || cleanName.includes('Cost of sale')) {
      return `${n.toFixed(2)}%`;
    } else if (cleanName.includes('Cost') || cleanName.includes('Revenue') || cleanName.includes('CPC') || cleanName.includes('CPM')) {
      return `$${n.toLocaleString()}`;
    } else {
      return n.toLocaleString();
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Performance Chart</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80 flex items-center justify-center">
            <div className="animate-pulse text-gray-500">Loading chart data...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Performance Chart</CardTitle>
          {availableMetrics.length > 0 && (
            <Select value={selectedMetric} onValueChange={setSelectedMetric}>
              <SelectTrigger className="w-48">
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
          )}
        </CardHeader>
        <CardContent>
          <div className="h-80 flex items-center justify-center text-gray-500">
            No chart data for selected date range
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Performance Chart</CardTitle>
        <Select value={selectedMetric} onValueChange={setSelectedMetric}>
          <SelectTrigger className="w-48">
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
      </CardHeader>
      <CardContent>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="formattedDate" 
                tick={{ fontSize: 12 }}
                angle={-45}
                textAnchor="end"
                height={60}
              />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip 
                formatter={(value: number, name: string) => [
                  formatTooltipValue(value, name),
                  name
                ]}
                labelFormatter={(label) => `Date: ${label}`}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey={selectedMetric} 
                stroke="#e91e63" 
                strokeWidth={3}
                dot={{ fill: '#e91e63', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6 }}
                name="Current Period"
              />
              {stableFilters.compareEnabled && (
                <Line 
                  type="monotone" 
                  dataKey={`${selectedMetric}_previous`} 
                  stroke="#eab308" 
                  strokeWidth={3}
                  dot={{ fill: '#eab308', strokeWidth: 2, r: 4 }}
                  activeDot={{ r: 6 }}
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