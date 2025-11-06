import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { retryWithBackoff } from "@/lib/debug";
import { loadReportData, getCurrentMonthDateRange, Dimension } from "@/lib/data-loading-fix";
import { format, parseISO } from "date-fns";

interface KPIChartProps {
  reportId: string | null;
  accountId: string | null;
  filters: {
    dimensionFilters: Record<string, string[]>;
    dateRange?: { from: Date; to: Date };
  };
}

export function KPIChart({ reportId, accountId, filters }: KPIChartProps) {
  const [chartData, setChartData] = useState<any[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<string>("Revenue");
  const [isLoading, setIsLoading] = useState(true);
  const [availableMetrics, setAvailableMetrics] = useState<string[]>([]);

  console.log('[CHART-FIXED] Component render - reportId:', reportId, 'accountId:', accountId);

  // Create a stable reference for filters to prevent unnecessary re-renders
  const stableFilters = useMemo(() => {
    return {
      dimensionFilters: filters.dimensionFilters,
      dateRange: filters.dateRange,
    };
  }, [
    JSON.stringify(filters.dimensionFilters),
    filters.dateRange?.from?.toISOString(),
    filters.dateRange?.to?.toISOString(),
  ]);

  useEffect(() => {
    if (reportId && accountId) {
      loadChartData();
    } else {
      setIsLoading(false);
    }
  }, [reportId, accountId, stableFilters, selectedMetric]);

  const loadChartData = async () => {
    console.log('[CHART-FIXED] Loading chart data for metric:', selectedMetric);
    setIsLoading(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user || !reportId || !accountId) {
        console.error('[CHART-FIXED] Missing required data:', { user: !!user, reportId, accountId });
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
      const result = await loadReportData(reportId, accountId, user.id, dataFilters);

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

      // Group data by date and aggregate the selected metric
      const dateGroups = new Map<string, number>();

      filteredData.forEach(row => {
        const dimensionValues = row.dimension_values;
        const dateStr = dimensionValues[dateDimension.id];
        const metricValue = dimensionValues[metricDimension.id];

        if (dateStr && metricValue !== undefined && metricValue !== null) {
          const numericValue = typeof metricValue === 'number' ? metricValue : parseFloat(metricValue) || 0;
          const currentTotal = dateGroups.get(dateStr) || 0;
          dateGroups.set(dateStr, currentTotal + numericValue);
        }
      });

      // Convert to chart data format and sort by date
      const chartDataArray = Array.from(dateGroups.entries())
        .map(([dateStr, value]) => ({
          date: dateStr,
          formattedDate: format(parseISO(dateStr), 'MMM dd'),
          [selectedMetric]: value
        }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      console.log('[CHART-FIXED] Chart data prepared:', {
        dataPoints: chartDataArray.length,
        metric: selectedMetric,
        sampleData: chartDataArray.slice(0, 3)
      });

      setChartData(chartDataArray);

    } catch (error) {
      console.error('[CHART-FIXED] Error loading chart data:', error);
      setChartData([]);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTooltipValue = (value: number, name: string) => {
    if (name.includes('Rate') || name.includes('CTR') || name.includes('Cost of sale')) {
      return `${value.toFixed(2)}%`;
    } else if (name.includes('Cost') || name.includes('Revenue') || name.includes('CPC') || name.includes('CPM')) {
      return `$${value.toLocaleString()}`;
    } else {
      return value.toLocaleString();
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
                stroke="#8884d8" 
                strokeWidth={2}
                dot={{ fill: '#8884d8', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
