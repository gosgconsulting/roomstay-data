import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { loadReportData, getCurrentMonthDateRange, Dimension } from "@/lib/data-loading-fix";
import { getAccountIdFromReport } from "@/lib/dimensionLoader";
import type { FilterState } from "@/components/FiltersBar";

interface KPIChartProps {
  reportId: string | null;
  filters: FilterState;
  accountId?: string | null;
  visibilityRefreshTrigger?: number;
  onLoadingComplete?: () => void;
}

export function KPIChart({ reportId, filters, accountId, visibilityRefreshTrigger, onLoadingComplete }: KPIChartProps) {
  const [chartData, setChartData] = useState<any[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<string>("Revenue");
  const [isLoading, setIsLoading] = useState(true);
  const [availableMetrics, setAvailableMetrics] = useState<string[]>([]);
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
    JSON.stringify(filters.dimensionFilters || {}),
    filters.dateRange?.from ? (filters.dateRange.from as Date).toISOString() : undefined,
    filters.dateRange?.to ? (filters.dateRange.to as Date).toISOString() : undefined,
    filters.compareEnabled,
    filters.compareType,
    filters.compareDateRange?.from ? (filters.compareDateRange.from as Date).toISOString() : undefined,
    filters.compareDateRange?.to ? (filters.compareDateRange.to as Date).toISOString() : undefined,
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

  // Reload on visibility changes
  useEffect(() => {
    if (reportId && resolvedAccountId && visibilityRefreshTrigger && visibilityRefreshTrigger > 0) {
      loadChartData();
    }
  }, [visibilityRefreshTrigger, reportId, resolvedAccountId]);

  useEffect(() => {
    if (reportId && resolvedAccountId) {
      loadChartData();
    } else {
      setIsLoading(false);
      onLoadingComplete?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, resolvedAccountId, stableFilters, selectedMetric]);

  const loadChartData = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (!reportId || !resolvedAccountId) {
        setChartData([]);
        return;
      }

      const currentMonthRange = getCurrentMonthDateRange();

      const dataFilters = {
        dateRange: stableFilters.dateRange || currentMonthRange,
        dimensionFilters: stableFilters.dimensionFilters
      };

      const result = await loadReportData(reportId, resolvedAccountId, user?.id, dataFilters);

      if (!result.success) {
        console.error('[KPIChart] Failed to load report data:', result.error);
        setChartData([]);
        return;
      }

      const { data: filteredData, dimensions } = result;

      if (!dimensions || dimensions.length === 0 || filteredData.length === 0) {
        setChartData([]);
        setAvailableMetrics([]);
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

      // Group current period data by date
      const currentDateGroups = new Map<string, number>();
      filteredData.forEach((row: any) => {
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
      if (stableFilters.compareEnabled && dataFilters.dateRange?.from && dataFilters.dateRange?.to) {
        const currentPeriod = dataFilters.dateRange;
        const daysDiff = Math.ceil((currentPeriod.to.getTime() - currentPeriod.from.getTime()) / (1000 * 60 * 60 * 24));
        const previousPeriodEnd = new Date(currentPeriod.from);
        previousPeriodEnd.setDate(previousPeriodEnd.getDate() - 1);
        const previousPeriodStart = new Date(previousPeriodEnd);
        previousPeriodStart.setDate(previousPeriodStart.getDate() - daysDiff + 1);

        const previousFilters = {
          dateRange: { from: previousPeriodStart, to: previousPeriodEnd },
          dimensionFilters: dataFilters.dimensionFilters
        };

        const previousResult = await loadReportData(reportId, resolvedAccountId, user?.id, previousFilters);
        const previousData = previousResult.success ? previousResult.data : [];

        previousData.forEach((row: any) => {
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