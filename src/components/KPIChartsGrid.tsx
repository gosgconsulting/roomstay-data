import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ChartData {
  day: number;
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
      // TODO: Load real data from sheet_data table
      // For now, initialize with empty data
      const emptyData: Record<string, ChartData[]> = {};
      kpis.forEach(kpi => {
        emptyData[kpi.title] = [];
      });
      setChartData(emptyData);
    } catch (error) {
      console.error("Error loading chart data:", error);
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
                        dataKey="day"
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
