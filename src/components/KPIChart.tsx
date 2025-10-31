import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { FilterState } from "./FiltersBar";

interface ChartData {
  date: string;
  value: number;
  compareValue?: number;
}

interface KPIChartProps {
  reportId: string | null;
  filters: FilterState;
}

const kpiOptions = [
  { value: "Revenue", label: "Revenue" },
  { value: "Cost", label: "Cost" },
  { value: "Clicks", label: "Clicks" },
  { value: "Impressions", label: "Impressions" },
  { value: "Conversions", label: "Conversions" },
  { value: "CTR", label: "CTR" },
  { value: "CPC", label: "CPC" },
  { value: "ROAS", label: "ROAS" },
  { value: "Cost of sale", label: "Cost of sale" },
];

export const KPIChart = ({ reportId, filters }: KPIChartProps) => {
  const [selectedKPI, setSelectedKPI] = useState("Revenue");
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (reportId) {
      loadChartData();
    }
  }, [reportId, filters, selectedKPI]);

  const loadChartData = async () => {
    setIsLoading(true);
    try {
      console.log('KPI Chart - Starting load for reportId:', reportId);
      console.log('KPI Chart - Selected metric:', selectedKPI);
      console.log('KPI Chart - Filters received:', {
        dateRange: filters.dateRange,
        dateFrom: filters.dateRange?.from,
        dateTo: filters.dateRange?.to,
        dimensionFilters: filters.dimensionFilters
      });
      
      // Load dimensions to find Date dimension
      const { data: dimensionData, error: dimDataError } = await supabase
        .from("dimension_data")
        .select("dimension_values")
        .eq("report_id", reportId)
        .limit(1)
        .maybeSingle();

      if (dimDataError) {
        console.error('KPI Chart - Error loading dimension data:', dimDataError);
        throw dimDataError;
      }

      let dimensions = null;

      if (dimensionData?.dimension_values) {
        const dimensionIds = Object.keys(dimensionData.dimension_values as Record<string, any>);
        
        if (dimensionIds.length > 0) {
          const { data: dimensionsById, error: dimError } = await supabase
            .from("dimensions")
            .select("*")
            .in("id", dimensionIds);

          if (dimError) throw dimError;
          dimensions = dimensionsById;
        }
      }

      // Find Date dimension
      const dateDimension = dimensions?.find((d: any) => d.type === 'date');
      
      console.log('KPI Chart - Date dimension found:', dateDimension);
      
      if (!dateDimension || !dimensions) {
        console.log('KPI Chart - No date dimension found, skipping chart');
        setChartData([]);
        setIsLoading(false);
        return;
      }

      // Use edge function to get aggregated data by date
      const { data: performanceData, error: perfError } = await supabase.functions.invoke('get-performance-data', {
        body: {
          reportId,
          groupByDims: [dateDimension.id],
          breakdownDims: [],
          thenByDims: [],
          dimensionFilters: filters.dimensionFilters,
          dateFrom: filters.dateRange?.from?.toISOString(),
          dateTo: filters.dateRange?.to?.toISOString(),
          visibleDimensionIds: dimensions.map((d: any) => d.id),
          limit: 1000,
          offset: 0,
          dateGranularity: 'day',
          dateOrder: 'asc',
          compareEnabled: false,
        },
      });

      if (perfError) {
        console.error('KPI Chart - Error fetching chart data:', perfError);
        throw perfError;
      }

      console.log('KPI Chart - Performance data received:', performanceData);
      const allDimensionData = performanceData?.rows || [];
      console.log('KPI Chart - Rows count:', allDimensionData.length);

      // Process the aggregated data from edge function
      const chartDataPoints: ChartData[] = [];

      allDimensionData.forEach((row: any, index: number) => {
        const rowData = row.data || row;
        const dateValue = row.name; // The grouped dimension value (date)
        
        if (index === 0) {
          console.log('KPI Chart - First row sample:', { row, dateValue, rowData });
        }
        
        if (!dateValue) {
          console.log('KPI Chart - Skipping row with no date value');
          return;
        }

        // Parse date more robustly
        let dateObj: Date;
        try {
          dateObj = new Date(dateValue);
          if (isNaN(dateObj.getTime())) {
            console.error('KPI Chart - Invalid date:', dateValue);
            return;
          }
        } catch (e) {
          console.error('KPI Chart - Error parsing date:', dateValue, e);
          return;
        }

        // Get value for selected KPI
        const value = rowData[selectedKPI];
        if (value !== null && value !== undefined) {
          const numValue = parseFloat(value) || 0;
          chartDataPoints.push({
            date: format(dateObj, 'yyyy-MM-dd'),
            value: numValue
          });
        }
      });
      
      console.log('KPI Chart - Processed chart data:', chartDataPoints);

      // Get comparison data if enabled
      if (filters.compareEnabled && filters.compareDateRange?.from && filters.compareDateRange?.to) {
        const { data: comparePerformanceData, error: comparePerfError } = await supabase.functions.invoke('get-performance-data', {
          body: {
            reportId,
            groupByDims: [dateDimension.id],
            breakdownDims: [],
            thenByDims: [],
            dimensionFilters: filters.dimensionFilters,
            dateFrom: filters.compareDateRange.from.toISOString(),
            dateTo: filters.compareDateRange.to.toISOString(),
            visibleDimensionIds: dimensions.map((d: any) => d.id),
            limit: 1000,
            offset: 0,
            dateGranularity: 'day',
            dateOrder: 'asc',
            compareEnabled: false,
          },
        });

        if (!comparePerfError && comparePerformanceData?.rows) {
          const comparePoints: Array<{ date: string; value: number }> = [];

          comparePerformanceData.rows.forEach((row: any) => {
            const rowData = row.data || row;
            const dateValue = row.name;
            
            if (!dateValue) return;

            const value = rowData[selectedKPI];
            if (value !== null && value !== undefined) {
              const numValue = parseFloat(value) || 0;
              comparePoints.push({
                date: format(new Date(dateValue), 'yyyy-MM-dd'),
                value: numValue
              });
            }
          });

          // Merge comparison data
          chartDataPoints.forEach((point, index) => {
            if (comparePoints[index]) {
              point.compareValue = comparePoints[index].value;
            }
          });
        }
      }

      setChartData(chartDataPoints);
    } catch (error) {
      console.error("KPI Chart - Error loading chart data:", error);
      setChartData([]);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-lg font-semibold">Performance Chart</CardTitle>
          <Skeleton className="h-10 w-[180px]" />
        </CardHeader>
        <CardContent>
          <div className="h-[300px] space-y-3 pt-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasData = chartData.length > 0;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-semibold">Performance Chart</CardTitle>
        <Select value={selectedKPI} onValueChange={setSelectedKPI}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select metric" />
          </SelectTrigger>
          <SelectContent>
            {kpiOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
            No chart data for selected date range
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="gradient-primary" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="gradient-compare" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="date"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "6px",
                }}
              />
              {chartData[0]?.compareValue !== undefined && (
                <Area
                  type="monotone"
                  dataKey="compareValue"
                  name="Previous"
                  stroke="hsl(var(--muted-foreground))"
                  strokeWidth={1.5}
                  strokeDasharray="5 5"
                  fill="url(#gradient-compare)"
                />
              )}
              <Area
                type="monotone"
                dataKey="value"
                name={selectedKPI}
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#gradient-primary)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};
