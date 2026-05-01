import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  formatInsightValue,
  type InsightBucket,
  type InsightMetricKey,
} from "@/lib/channelInsights";

interface Props {
  title: string;
  icon?: React.ReactNode;
  buckets: InsightBucket[];
  metric: InsightMetricKey;
  emptyHint?: string;
  headerAction?: React.ReactNode;
}

const PALETTE = [
  "hsl(178 50% 35%)", // teal
  "hsl(255 70% 65%)", // violet
  "hsl(38 90% 55%)",  // amber
  "hsl(210 80% 55%)", // blue
  "hsl(340 75% 60%)", // pink
  "hsl(142 60% 45%)", // green
  "hsl(280 60% 55%)", // purple
  "hsl(20 80% 55%)",  // orange
];

export function DonutBreakdownCard({
  title,
  icon,
  buckets,
  metric,
  emptyHint = "Not available yet — data will populate once the new sync runs.",
  headerAction,
}: Props) {
  const data = buckets.map((b, i) => ({
    name: b.label,
    value: b.value,
    share: b.share,
    color: PALETTE[i % PALETTE.length],
  }));

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-sm font-medium text-foreground">
          <span className="flex items-center gap-2 min-w-0">
            {icon}
            <span className="truncate">{title}</span>
          </span>
          {headerAction}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-center text-xs text-muted-foreground px-4">
            {emptyHint}
          </div>
        ) : (
          <div className="grid grid-cols-2 items-center gap-4">
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    innerRadius={36}
                    outerRadius={62}
                    paddingAngle={2}
                    isAnimationActive={false}
                    stroke="none"
                  >
                    {data.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => formatInsightValue(metric, value)}
                    contentStyle={{
                      fontSize: 11,
                      borderRadius: 6,
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--popover))",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {data.map((d) => (
                <div key={d.name} className="flex items-center gap-2 text-xs">
                  <span
                    className="inline-block h-2 w-2 rounded-full shrink-0"
                    style={{ background: d.color }}
                  />
                  <span className="truncate flex-1" title={d.name}>
                    {d.name}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {(d.share * 100).toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
