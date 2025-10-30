import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";

interface ChartData {
  date: string;
  value: number;
}

interface KPIChartsGridProps {
  reportId: string | null;
}

const kpis = [
  { title: "Clicks", color: "hsl(var(--primary))" },
  { title: "Cost", color: "hsl(var(--primary))" },
  { title: "Conversions", color: "hsl(var(--primary))" },
  { title: "Revenue", color: "hsl(var(--primary))" },
];

export const KPIChartsGrid = ({ reportId }: KPIChartsGridProps) => {
  const [chartData, setChartData] = useState<Record<string, ChartData[]>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (reportId) {
      loadChartData();
    }
  }, [reportId]);

  const loadChartData = async () => {
    setIsLoading(true);
    try {
      // Fetch dimensions
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: dimensions, error: dimError } = await supabase
        .from("dimensions")
        .select("*")
        .eq("user_id", user.id);

      if (dimError) throw dimError;

      // Fetch all dimension_data for this report
      const { data: dimensionData, error: dataError } = await supabase
        .from("dimension_data")
        .select("*")
        .eq("report_id", reportId);

      if (dataError) throw dataError;

      if (!dimensions || !dimensionData) {
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
        const emptyData: Record<string, ChartData[]> = {};
        kpis.forEach(kpi => {
          emptyData[kpi.title] = [];
        });
        setChartData(emptyData);
        return;
      }

      // Group data by date for each KPI
      const chartDataByKPI: Record<string, Record<string, number>> = {};
      kpis.forEach(kpi => {
        chartDataByKPI[kpi.title] = {};
      });

      dimensionData.forEach((row) => {
        const dimensionValues = row.dimension_values as Record<string, any>;
        const dateValue = dimensionValues[dateDimension.id];
        
        if (!dateValue) return;

        // Parse and format date
        let formattedDate: string;
        try {
          const date = new Date(dateValue);
          formattedDate = format(date, 'MMM dd');
        } catch {
          formattedDate = String(dateValue);
        }

        // Aggregate each KPI
        kpis.forEach(kpi => {
          const dimension = dimensions.find(d => d.name === kpi.title);
          if (!dimension) return;

          const value = dimensionValues[dimension.id];
          if (value !== null && value !== undefined) {
            const numValue = parseFloat(value) || 0;
            if (!chartDataByKPI[kpi.title][formattedDate]) {
              chartDataByKPI[kpi.title][formattedDate] = 0;
            }
            chartDataByKPI[kpi.title][formattedDate] += numValue;
          }
        });
      });

      // Convert to array format for charts
      const finalChartData: Record<string, ChartData[]> = {};
      kpis.forEach(kpi => {
        finalChartData[kpi.title] = Object.entries(chartDataByKPI[kpi.title])
          .map(([date, value]) => ({ date, value }))
          .sort((a, b) => a.date.localeCompare(b.date));
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
                <div className="h-[150px] flex items-center justify-center text-muted-foreground text-sm">
                  Loading...
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
                      <Area
                        type="monotone"
                        dataKey="value"
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
