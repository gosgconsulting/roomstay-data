import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  AreaChart,
  Area,
} from "recharts";
import { SlideComponent } from "@/types/slides";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface SlideRendererProps {
  components: SlideComponent[];
  cachedData: Record<string, any>;
}

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export function SlideRenderer({ components, cachedData }: SlideRendererProps) {
  const processedData = useMemo(() => {
    if (!cachedData?.rows) return [];
    return cachedData.rows;
  }, [cachedData]);

  if (components.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-muted-foreground mb-2">No components added yet</p>
        <p className="text-sm text-muted-foreground">
          Edit this slide to add charts, tables, and metrics
        </p>
      </div>
    );
  }

  const renderComponent = (component: SlideComponent) => {
    const { type, config } = component;

    switch (type) {
      case "chart":
        return renderChart(component, processedData);
      case "table":
        return renderTable(component, processedData);
      case "metric":
        return renderMetric(component, processedData);
      case "text":
        return renderText(component);
      default:
        return null;
    }
  };

  const renderChart = (component: SlideComponent, data: any[]) => {
    const { config } = component;
    const chartData = aggregateData(data, config.dimensions, config.metrics);

    const ChartComponent = {
      bar: BarChart,
      line: LineChart,
      area: AreaChart,
      pie: PieChart,
    }[config.chartType || "bar"];

    if (config.chartType === "pie") {
      return (
        <ResponsiveContainer width="100%" height={300}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey={config.metrics[0] || "value"}
              nameKey={config.dimensions[0] || "name"}
              cx="50%"
              cy="50%"
              outerRadius={100}
              label
            >
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      );
    }

    return (
      <ResponsiveContainer width="100%" height={300}>
        <ChartComponent data={chartData}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey={config.dimensions[0] || "name"} className="text-xs" />
          <YAxis className="text-xs" />
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
            }}
          />
          <Legend />
          {config.metrics.map((metric, index) => {
            if (config.chartType === "line") {
              return (
                <Line
                  key={metric}
                  type="monotone"
                  dataKey={metric}
                  stroke={CHART_COLORS[index % CHART_COLORS.length]}
                  strokeWidth={2}
                />
              );
            }
            if (config.chartType === "area") {
              return (
                <Area
                  key={metric}
                  type="monotone"
                  dataKey={metric}
                  fill={CHART_COLORS[index % CHART_COLORS.length]}
                  stroke={CHART_COLORS[index % CHART_COLORS.length]}
                  fillOpacity={0.3}
                />
              );
            }
            return (
              <Bar
                key={metric}
                dataKey={metric}
                fill={CHART_COLORS[index % CHART_COLORS.length]}
              />
            );
          })}
        </ChartComponent>
      </ResponsiveContainer>
    );
  };

  const renderTable = (component: SlideComponent, data: any[]) => {
    const { config } = component;
    const columns = [...config.dimensions, ...config.metrics];
    const tableData = data.slice(0, 20); // Limit to 20 rows for display

    return (
      <div className="overflow-auto max-h-[400px]">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col}>{col}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {tableData.map((row, idx) => (
              <TableRow key={idx}>
                {columns.map((col) => (
                  <TableCell key={col}>
                    {formatValue(row[col])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  const renderMetric = (component: SlideComponent, data: any[]) => {
    const { config } = component;
    const metric = config.metrics[0];
    
    const total = data.reduce((sum, row) => {
      const value = parseFloat(row[metric]) || 0;
      return sum + value;
    }, 0);

    return (
      <div className="text-center py-4">
        <p className="text-4xl font-bold">{formatValue(total)}</p>
        <p className="text-sm text-muted-foreground mt-1">{config.title || metric}</p>
      </div>
    );
  };

  const renderText = (component: SlideComponent) => {
    const { config } = component;
    return (
      <div className="py-4">
        {config.title && <h3 className="text-lg font-semibold mb-2">{config.title}</h3>}
        {config.description && <p className="text-muted-foreground">{config.description}</p>}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {components.map((component) => (
        <Card key={component.id} className="overflow-hidden">
          {component.config.title && (
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{component.config.title}</CardTitle>
            </CardHeader>
          )}
          <CardContent className={component.config.title ? "pt-0" : ""}>
            {renderComponent(component)}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function aggregateData(
  data: any[],
  dimensions: string[],
  metrics: string[]
): any[] {
  if (!data.length || !dimensions.length) return [];

  const grouped = new Map<string, Record<string, number>>();

  data.forEach((row) => {
    const key = dimensions.map((d) => row[d] || "Unknown").join("|");
    
    if (!grouped.has(key)) {
      grouped.set(key, { [dimensions[0]]: row[dimensions[0]] || "Unknown" });
    }
    
    const group = grouped.get(key)!;
    metrics.forEach((metric) => {
      const value = parseFloat(row[metric]) || 0;
      group[metric] = (group[metric] || 0) + value;
    });
  });

  return Array.from(grouped.values());
}

function formatValue(value: any): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "number") {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return String(value);
}
