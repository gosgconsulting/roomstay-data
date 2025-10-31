import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Legend } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import { FilterState } from "./FiltersBar";

interface ChartData {
  date: string;
  value: number;
  compareValue?: number;
}

interface KPIChartsGridProps {
  reportId: string | null;
  filters: FilterState;
}

const kpis = [
  { title: "Clicks", color: "hsl(var(--primary))" },
  { title: "Cost", color: "hsl(var(--primary))" },
  { title: "Conversions", color: "hsl(var(--primary))" },
  { title: "Revenue", color: "hsl(var(--primary))" },
];

export const KPIChartsGrid = ({ reportId, filters }: KPIChartsGridProps) => {
  const [chartData, setChartData] = useState<Record<string, ChartData[]>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (reportId) {
      loadChartData();
    }
  }, [reportId, filters]);

  const loadChartData = async () => {
    setIsLoading(true);
    try {
      // Load dimensions to find Date dimension
      const { data: dimensionData, error: dimDataError } = await supabase
        .from("dimension_data")
        .select("dimension_values")
        .eq("report_id", reportId)
        .limit(1)
        .maybeSingle();

      if (dimDataError) throw dimDataError;

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
      
      if (!dateDimension || !dimensions) {
        // No date dimension - skip charts
        const emptyData: Record<string, ChartData[]> = {};
        kpis.forEach(kpi => {
          emptyData[kpi.title] = [];
        });
        setChartData(emptyData);
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
        },
      });

      if (perfError) {
        console.error('Error fetching chart data:', perfError);
        throw perfError;
      }

      const allDimensionData = performanceData?.rows || [];

      // Process the aggregated data from edge function
      const chartDataByKPI: Record<string, Array<{ date: string; value: number }>> = {};
      kpis.forEach(kpi => {
        chartDataByKPI[kpi.title] = [];
      });

      // The data from edge function is already grouped by date
      allDimensionData.forEach((row: any) => {
        const rowData = row.data || row;
        const dateValue = row.name; // The grouped dimension value (date)
        
        if (!dateValue) return;

        kpis.forEach(kpi => {
          // Data from edge function is keyed by dimension name, not ID
          const value = rowData[kpi.title];
          if (value !== null && value !== undefined) {
            const numValue = parseFloat(value) || 0;
            chartDataByKPI[kpi.title].push({
              date: format(new Date(dateValue), 'MMM dd'),
              value: numValue
            });
          }
        });
      });

      // Get comparison data if enabled
      let compareChartData: Record<string, Array<{ date: string; value: number }>> = {};
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
          },
        });

        if (!comparePerfError && comparePerformanceData?.rows) {
          kpis.forEach(kpi => {
            compareChartData[kpi.title] = [];
          });

          comparePerformanceData.rows.forEach((row: any) => {
            const rowData = row.data || row;
            const dateValue = row.name;
            
            if (!dateValue) return;

            kpis.forEach(kpi => {
              // Data from edge function is keyed by dimension name, not ID
              const value = rowData[kpi.title];
              if (value !== null && value !== undefined) {
                const numValue = parseFloat(value) || 0;
                compareChartData[kpi.title].push({
                  date: format(new Date(dateValue), 'MMM dd'),
                  value: numValue
                });
              }
            });
          });
        }
      }

      // Merge current and comparison data
      const finalChartData: Record<string, ChartData[]> = {};
      kpis.forEach(kpi => {
        const currentPoints = chartDataByKPI[kpi.title] || [];
        const comparePoints = compareChartData[kpi.title] || [];
        
        const chartPoints: ChartData[] = currentPoints.map((point, index) => ({
          date: point.date,
          value: point.value,
          compareValue: comparePoints[index]?.value,
        }));
        
        finalChartData[kpi.title] = chartPoints;
      });

      setChartData(finalChartData);
    } catch (error) {
      console.error("Error loading chart data:", error);
      const emptyData: Record<string, ChartData[]> = {};
      kpis.forEach(kpi => {
        emptyData[kpi.title] = [];
      });
      setChartData(emptyData);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-foreground">KPI Charts Grid</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {kpis.map((kpi) => (
            <Card key={kpi.title}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{kpi.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[150px] space-y-3 pt-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">KPI Charts Grid</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {kpis.map((kpi) => {
          const data = chartData[kpi.title] || [];
          const hasData = data.length > 0;

          return (
            <Card key={kpi.title}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{kpi.title}</CardTitle>
              </CardHeader>
              <CardContent>
                {!hasData ? (
                  <div className="h-[150px] flex items-center justify-center text-muted-foreground text-sm">
                    No data available. Connect a data source to view charts.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={150}>
                    <AreaChart data={data}>
                      <defs>
                        <linearGradient id={`gradient-${kpi.title}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={kpi.color} stopOpacity={0.4} />
                          <stop offset="100%" stopColor={kpi.color} stopOpacity={0.1} />
                        </linearGradient>
                        <linearGradient id={`gradient-compare-${kpi.title}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.3} />
                          <stop offset="100%" stopColor="hsl(var(--muted-foreground))" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
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
                      {data[0]?.compareValue !== undefined && (
                        <>
                          <Legend 
                            wrapperStyle={{ fontSize: '12px' }}
                            iconType="line"
                          />
                          <Area
                            type="monotone"
                            dataKey="compareValue"
                            name="Previous"
                            stroke="hsl(var(--muted-foreground))"
                            strokeWidth={1.5}
                            strokeDasharray="5 5"
                            fill={`url(#gradient-compare-${kpi.title})`}
                          />
                        </>
                      )}
                      <Area
                        type="monotone"
                        dataKey="value"
                        name="Current"
                        stroke={kpi.color}
                        strokeWidth={2}
                        fill={`url(#gradient-${kpi.title})`}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
};
