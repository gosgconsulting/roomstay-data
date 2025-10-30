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
        const emptyData: Record<string, ChartData[]> = {};
        kpis.forEach(kpi => {
          emptyData[kpi.title] = [];
        });
        setChartData(emptyData);
        return;
      }

      // Find Date dimension
      const dateDimension = dimensions.find(d => d.type === 'date');
      
      if (!dateDimension) {
        console.warn('No date dimension found for charts');
        // If no date dimension, show aggregated totals instead of time series
        const aggregatedData: Record<string, number> = {};
        
        allDimensionData.forEach((row) => {
          const dimensionValues = row.dimension_values as Record<string, any>;
          
          kpis.forEach(kpi => {
            const dimension = dimensions.find(d => d.name === kpi.title);
            if (dimension) {
              const value = dimensionValues[dimension.id];
              if (value !== null && value !== undefined) {
                const numValue = parseFloat(value) || 0;
                aggregatedData[kpi.title] = (aggregatedData[kpi.title] || 0) + numValue;
              }
            }
          });
        });
        
        // Create single data point for each KPI
        const finalChartData: Record<string, ChartData[]> = {};
        kpis.forEach(kpi => {
          finalChartData[kpi.title] = aggregatedData[kpi.title] 
            ? [{ date: 'Total', value: aggregatedData[kpi.title] }] 
            : [];
        });
        
        setChartData(finalChartData);
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
        
        // Apply date range filter
        if (filters.dateRange?.from || filters.dateRange?.to) {
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

      // Helper to group data by date for a period
      const groupByDate = (fromDate?: Date, toDate?: Date) => {
        const periodData = allDimensionData.filter((row) => {
          const dimensionValues = row.dimension_values as Record<string, any>;
          
          // Apply dimension filters
          for (const [dimId, filterValue] of Object.entries(filters.dimensionFilters)) {
            if (dimensionValues[dimId] !== filterValue) {
              return false;
            }
          }
          
          // Apply date range filter
          if (fromDate || toDate) {
            if (dateDimension && dimensionValues[dateDimension.id]) {
              const rowDate = new Date(dimensionValues[dateDimension.id]);
              if (fromDate && rowDate < fromDate) {
                return false;
              }
              if (toDate && rowDate > toDate) {
                return false;
              }
            }
          }
          
          return true;
        });

        const chartDataByKPI: Record<string, Array<{ date: Date; formattedDate: string; value: number }>> = {};
        kpis.forEach(kpi => {
          chartDataByKPI[kpi.title] = [];
        });

        // Group by actual date objects for proper sorting
        const dateGroups: Record<string, Record<string, number>> = {};
        kpis.forEach(kpi => {
          dateGroups[kpi.title] = {};
        });

        periodData.forEach((row) => {
          const dimensionValues = row.dimension_values as Record<string, any>;
          const dateValue = dimensionValues[dateDimension.id];
          
          if (!dateValue) return;

          const date = new Date(dateValue);
          const dateKey = date.toISOString().split('T')[0]; // Use ISO date as key

          // Aggregate each KPI
          kpis.forEach(kpi => {
            const dimension = dimensions.find(d => d.name === kpi.title);
            if (!dimension) return;

            const value = dimensionValues[dimension.id];
            if (value !== null && value !== undefined) {
              const numValue = parseFloat(value) || 0;
              if (!dateGroups[kpi.title][dateKey]) {
                dateGroups[kpi.title][dateKey] = 0;
              }
              dateGroups[kpi.title][dateKey] += numValue;
            }
          });
        });

        // Convert to array and sort by date
        kpis.forEach(kpi => {
          chartDataByKPI[kpi.title] = Object.entries(dateGroups[kpi.title])
            .map(([dateKey, value]) => ({
              date: new Date(dateKey),
              formattedDate: format(new Date(dateKey), 'MMM dd'),
              value
            }))
            .sort((a, b) => a.date.getTime() - b.date.getTime());
        });

        return chartDataByKPI;
      };

      // Get current period data
      const currentData = groupByDate(filters.dateRange?.from, filters.dateRange?.to);

      // Get comparison period data if enabled
      let compareData: Record<string, Array<{ date: Date; formattedDate: string; value: number }>> | null = null;
      if (filters.compareEnabled && filters.compareDateRange?.from && filters.compareDateRange?.to) {
        compareData = groupByDate(filters.compareDateRange.from, filters.compareDateRange.to);
      }

      // Merge current and comparison data by aligning by position (day 1, day 2, etc.)
      const finalChartData: Record<string, ChartData[]> = {};
      kpis.forEach(kpi => {
        const currentPoints = currentData[kpi.title] || [];
        const comparePoints = compareData ? (compareData[kpi.title] || []) : [];
        
        const chartPoints: ChartData[] = currentPoints.map((point, index) => ({
          date: point.formattedDate,
          value: point.value,
          compareValue: comparePoints[index]?.value, // Align by index position
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
