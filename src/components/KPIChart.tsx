import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { useUser } from "@/lib/auth";
import { useSourceData } from "@/hooks/dataSources";
import { usePerformanceTableDimensions } from "@/hooks/performanceTable/usePerformanceTableDimensions";
import type { DataSource } from "@/lib/data-sources/types";

interface KPIChartProps {
  reportId: string | null;
  accountId: string | null;
  metric?: string;
  filters: {
    dimensionFilters: Record<string, string[]>;
    dateRange?: { from: Date; to?: Date };
    datePreset?: string;
    compareEnabled?: boolean;
    compareType?: string;
    compareDateRange?: { from: Date; to?: Date };
  };
  onLoadingComplete?: () => void;
  visibilityRefreshTrigger?: number;
  isEditMode?: boolean;
  onMetricChange?: (metric: string) => void;
}

export function KPIChart({ 
  reportId, 
  accountId, 
  metric = "Clicks",
  filters, 
  onLoadingComplete,
  visibilityRefreshTrigger,
  isEditMode = false,
  onMetricChange
}: KPIChartProps) {
  const { data: userData } = useUser();
  const user = userData?.user || null;
  const [chartData, setChartData] = useState<any[]>([]);
  const [dataSource, setDataSource] = useState<DataSource | null>(null);

  // Load dimensions using the same hook as PerformanceTable
  const { dimensions, isLoadingDimensions, loadDimensions } = usePerformanceTableDimensions({
    reportId,
    accountId: accountId || undefined,
  });

  // Trigger dimension loading when reportId or accountId changes
  useEffect(() => {
    if (reportId || accountId) {
      loadDimensions();
    }
  }, [reportId, accountId, loadDimensions]);

  // Fetch data source for the report
  useEffect(() => {
    const fetchDataSource = async () => {
      if (!reportId) {
        setDataSource(null);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('data_sources')
          .select('*')
          .eq('report_id', reportId)
          .limit(1)
          .maybeSingle();

        if (error) {
          console.error('[CHART-FIXED] Error fetching data source:', error);
          return;
        }

        if (data) {
          setDataSource({
            ...data,
            column_mappings: (data.column_mappings as any) || null,
          } as DataSource);
        }
      } catch (error) {
        console.error('[CHART-FIXED] Error fetching data source:', error);
      }
    };

    fetchDataSource();
  }, [reportId]);

  // Use source data hook - fetch directly from Google Sheets/CSV (same as performance table)
  const { data: sourceData, isLoading: isLoadingSource, error: sourceError } = useSourceData({
    dataSourceId: dataSource?.id || '',
    enabled: !!dataSource && !!reportId
  });

  // Create stable filters reference
  const stableFilters = useMemo(() => ({
    dimensionFilters: filters.dimensionFilters || {},
    dateRange: filters.dateRange,
    datePreset: filters.datePreset || 'all_time',
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

  // Process source data into chart data
  useEffect(() => {
    // Wait for both source data and dimensions to be loaded
    if (!sourceData || isLoadingSource || isLoadingDimensions) return;
    
    // Must have dimensions loaded to map IDs to names
    if (!dimensions || dimensions.length === 0) {
      console.log('[CHART-FIXED] Waiting for dimensions to load...');
      return;
    }

    try {
      // Transform raw sheet data to match expected format
      const transformedRows = (sourceData || []).map((row: any) => ({
        dimension_values: row.row_data || {},
        row_number: row.row_number,
        id: row.id
      }));

      // Start with source data
      let filteredData = transformedRows.map((row: any, idx: number) => ({
        id: `row-${row.row_number ?? idx + 1}`,
        name: 'Data Point',
        level: 0,
        data: {},
        originalDate: undefined,
      }));

      console.log('[CHART-FIXED] Loaded raw data rows from source:', filteredData.length);
      console.log('[CHART-FIXED] Source data sample:', transformedRows.slice(0, 2));
      console.log('[CHART-FIXED] Dimensions loaded:', dimensions.map(d => ({ id: d.id, name: d.name, type: d.type })));

      // Find date dimension for time series
      const dateDimension = dimensions.find(d => d.type === 'date');
      const metricDimension = dimensions.find(d => d.name === metric);

      if (!dateDimension || !metricDimension) {
        console.log('[CHART-FIXED] Missing required dimensions for chart');
        setChartData([]);
        onLoadingComplete?.();
        return;
      }

      // Group data by date and calculate metric values
      const dateGroups: Record<string, number[]> = {};
      
      transformedRows.forEach((row: any) => {
        const dv = row.dimension_values || {};
        const dateValue = dv[dateDimension.id];
        const metricValue = dv[metricDimension.id];
        
        if (dateValue && metricValue !== undefined && metricValue !== null) {
          const dateStr = String(dateValue);
          const numValue = parseFloat(String(metricValue));
          
          if (!isNaN(numValue)) {
            if (!dateGroups[dateStr]) {
              dateGroups[dateStr] = [];
            }
            dateGroups[dateStr].push(numValue);
          }
        }
      });

      // Convert to chart data format
      const chartPoints = Object.entries(dateGroups)
        .map(([date, values]) => ({
          date,
          value: values.reduce((sum, val) => sum + val, 0),
          count: values.length
        }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      console.log('[CHART-FIXED] Chart data points:', chartPoints.length);
      setChartData(chartPoints);
      onLoadingComplete?.();

    } catch (error) {
      console.error('[CHART-FIXED] Error processing chart data:', error);
      setChartData([]);
      onLoadingComplete?.();
    }
  }, [sourceData, isLoadingSource, isLoadingDimensions, stableFilters, dimensions, metric, onLoadingComplete]);

  if (isLoadingSource || isLoadingDimensions) {
    return (
      <Card className="h-80">
        <CardHeader>
          <CardTitle className="text-sm font-medium">{metric}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center">
            <div className="animate-pulse text-muted-foreground">Loading chart...</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (chartData.length === 0) {
    return (
      <Card className="h-80">
        <CardHeader>
          <CardTitle className="text-sm font-medium">{metric}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center">
            <div className="text-muted-foreground">No data available</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-80">
      <CardHeader>
        <CardTitle className="text-sm font-medium">{metric}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis 
              dataKey="date" 
              tickFormatter={(value) => {
                try {
                  return format(parseISO(value), 'MMM dd');
                } catch {
                  return value;
                }
              }}
            />
            <YAxis />
            <Tooltip 
              labelFormatter={(value) => {
                try {
                  return format(parseISO(String(value)), 'MMM dd, yyyy');
                } catch {
                  return value;
                }
              }}
            />
            <Line 
              type="monotone" 
              dataKey="value" 
              stroke="#8884d8" 
              strokeWidth={2}
              dot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}