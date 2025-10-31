import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { FilterState } from "./FiltersBar";

interface ChartData {
  date: string;
  value: number;
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
      // Get all dimensions for this report
      const { data: dimensions, error: dimError } = await supabase
        .from("dimensions")
        .select("*")
        .eq("report_id", reportId);

      if (dimError) throw dimError;
      if (!dimensions || dimensions.length === 0) {
        setChartData([]);
        setIsLoading(false);
        return;
      }

      // Find the date dimension
      const dateDimension = dimensions.find((d: any) => d.type === 'date');
      
      if (!dateDimension) {
        setChartData([]);
        setIsLoading(false);
        return;
      }

      // Call edge function to get performance data grouped by date
      const { data: response, error: perfError } = await supabase.functions.invoke('get-performance-data', {
        body: {
          reportId,
          groupByDims: [dateDimension.id],
          dimensionFilters: filters.dimensionFilters || {},
          dateFrom: filters.dateRange?.from?.toISOString(),
          dateTo: filters.dateRange?.to?.toISOString(),
          visibleDimensionIds: dimensions.map((d: any) => d.id),
          limit: 10000,
          offset: 0,
          dateGranularity: 'day',
          dateOrder: 'asc',
          compareEnabled: false,
        },
      });

      if (perfError) throw perfError;

      const rows = response?.rows || [];
      
      // Transform data for chart
      const chartPoints: ChartData[] = rows
        .map((row: any) => {
          const dateValue = row.name;
          const data = row.data || row;
          
          // Get the metric value
          let value = 0;
          if (data[selectedKPI] !== null && data[selectedKPI] !== undefined) {
            value = parseFloat(data[selectedKPI]) || 0;
          }

          try {
            const dateObj = parseISO(dateValue);
            return {
              date: format(dateObj, 'MMM dd'),
              value: value,
            };
          } catch (e) {
            return null;
          }
        })
        .filter((item): item is ChartData => item !== null);

      setChartData(chartPoints);
    } catch (error) {
      console.error("Error loading chart data:", error);
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
          <div className="h-[300px] flex items-center justify-center">
            <Skeleton className="h-full w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-semibold">Performance Chart</CardTitle>
        <Select value={selectedKPI} onValueChange={setSelectedKPI}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Select metric" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border z-50">
            {kpiOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="h-[300px] flex items-center justify-center text-muted-foreground text-sm">
            No chart data for selected date range
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
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
                tickFormatter={(value) => {
                  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
                  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
                  return value.toFixed(0);
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  color: "hsl(var(--foreground))",
                }}
                formatter={(value: number) => [value.toLocaleString(), selectedKPI]}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#chartGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};
