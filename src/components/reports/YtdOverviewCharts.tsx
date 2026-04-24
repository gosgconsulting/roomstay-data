/**
 * YTD Overview: grid of monthly charts (Clicks, Bookings, Cost, Revenue, CPC)
 * with optional prior-year overlay. When 2025 comparison data is available the
 * chart shows a dashed line for YoY, including months that haven't happened yet
 * in 2026 — useful as a forecast / goal reference.
 * Rendered at the top of a Custom Report, above the channel tabs.
 */

import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import { cn } from "@/lib/utils";
import { filterRawDataRows, aggregateRowsToMetrics } from "@/lib/slideViewHelpers";

type ChannelBucket = { rows: Record<string, any>[]; dimMap: Record<string, string> };

interface Props {
  channelData: Record<string, ChannelBucket>;
  filterValues: Record<string, Record<string, string[]>>;
  /** Prior-year dataset, same shape as channelData. When provided the charts overlay YoY. */
  comparisonChannelData?: Record<string, ChannelBucket>;
  /** Channels to aggregate (defaults to metasearch + sem + social). */
  channels?: string[];
  /** Friendly label describing the scope, shown as subtitle. */
  scopeLabel?: string;
  /** ISO year, e.g. "2026". */
  year?: string;
  /** Prior-year ISO year, e.g. "2025". */
  comparisonYear?: string;
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatCompact(value: number): string {
  if (!isFinite(value)) return "0";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toFixed(0);
}

function formatValue(key: string, value: number): string {
  if (key === "cost" || key === "revenue") return `$${formatCompact(value)}`;
  if (key === "cpc") return `$${value.toFixed(2)}`;
  return formatCompact(value);
}

type MonthlyBucket = {
  month: string;
  monthNum: number;
  clicks: number;
  bookings: number;
  cost: number;
  revenue: number;
  cpc: number;
  clicksPrev: number;
  bookingsPrev: number;
  costPrev: number;
  revenuePrev: number;
  cpcPrev: number;
};

function aggregateMonthly(
  channelData: Record<string, ChannelBucket>,
  filterValues: Record<string, Record<string, string[]>>,
  channels: string[],
  year: string,
): Array<{ clicks: number; bookings: number; cost: number; revenue: number; cpc: number }> {
  const buckets = MONTH_LABELS.map(() => ({ clicks: 0, bookings: 0, cost: 0, revenue: 0, cpc: 0 }));
  const yearNum = parseInt(year);

  for (const ch of channels) {
    const bucket = channelData[ch];
    if (!bucket) continue;
    for (let i = 0; i < 12; i++) {
      const mm = String(i + 1).padStart(2, "0");
      const from = new Date(`${year}-${mm}-01`);
      const nextMonth = new Date(Date.UTC(yearNum, i + 1, 1));
      const to = new Date(nextMonth.getTime() - 1);
      const filtered = filterRawDataRows(
        bucket.rows,
        filterValues[ch] || {},
        { start: from, end: to },
        bucket.dimMap,
      );
      const m = aggregateRowsToMetrics(filtered, bucket.dimMap);
      buckets[i].clicks += m.clicks || 0;
      buckets[i].bookings += m.bookings || 0;
      buckets[i].cost += m.cost || 0;
      buckets[i].revenue += m.revenue || 0;
    }
  }
  // Derive CPC per month after channel aggregation
  for (const b of buckets) {
    b.cpc = b.clicks > 0 ? b.cost / b.clicks : 0;
  }
  return buckets;
}

export function YtdOverviewCharts({
  channelData,
  filterValues,
  comparisonChannelData,
  channels = ["metasearch", "sem", "social"],
  scopeLabel,
  year = "2026",
  comparisonYear = "2025",
}: Props) {
  const resolvedScope =
    scopeLabel ??
    (channels.length === 3
      ? "SEM · Metasearch · Social"
      : channels.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(" · "));

  const monthly: MonthlyBucket[] = useMemo(() => {
    const current = aggregateMonthly(channelData, filterValues, channels, year);
    const prior = comparisonChannelData
      ? aggregateMonthly(comparisonChannelData, filterValues, channels, comparisonYear)
      : MONTH_LABELS.map(() => ({ clicks: 0, bookings: 0, cost: 0, revenue: 0, cpc: 0 }));
    return MONTH_LABELS.map((label, i) => ({
      month: label,
      monthNum: i + 1,
      clicks: current[i].clicks,
      bookings: current[i].bookings,
      cost: current[i].cost,
      revenue: current[i].revenue,
      cpc: current[i].cpc,
      clicksPrev: prior[i].clicks,
      bookingsPrev: prior[i].bookings,
      costPrev: prior[i].cost,
      revenuePrev: prior[i].revenue,
      cpcPrev: prior[i].cpc,
    }));
  }, [channelData, comparisonChannelData, filterValues, channels, year, comparisonYear]);

  const hasCurrent = monthly.some((m) => m.clicks + m.bookings + m.cost + m.revenue > 0);
  const hasPrior = !!comparisonChannelData && monthly.some(
    (m) => m.clicksPrev + m.bookingsPrev + m.costPrev + m.revenuePrev > 0,
  );

  const totals = useMemo(() => {
    const t = {
      clicks: monthly.reduce((s, m) => s + m.clicks, 0),
      bookings: monthly.reduce((s, m) => s + m.bookings, 0),
      cost: monthly.reduce((s, m) => s + m.cost, 0),
      revenue: monthly.reduce((s, m) => s + m.revenue, 0),
      cpc: 0,
      clicksPrev: monthly.reduce((s, m) => s + m.clicksPrev, 0),
      bookingsPrev: monthly.reduce((s, m) => s + m.bookingsPrev, 0),
      costPrev: monthly.reduce((s, m) => s + m.costPrev, 0),
      revenuePrev: monthly.reduce((s, m) => s + m.revenuePrev, 0),
      cpcPrev: 0,
    };
    t.cpc = t.clicks > 0 ? t.cost / t.clicks : 0;
    t.cpcPrev = t.clicksPrev > 0 ? t.costPrev / t.clicksPrev : 0;
    return t;
  }, [monthly]);

  type MetricSpec = {
    key: "clicks" | "bookings" | "cost" | "revenue" | "cpc";
    label: string;
    color: string;
    span2?: boolean;
    hint?: string;
  };

  const metrics: MetricSpec[] = [
    { key: "clicks",   label: "Clicks",   color: "hsl(210 90% 55%)" },
    { key: "bookings", label: "Bookings", color: "hsl(142 71% 45%)" },
    { key: "cost",     label: "Cost",     color: "hsl(24 90% 55%)"  },
    { key: "revenue",  label: "Revenue",  color: "hsl(280 70% 55%)" },
    { key: "cpc",      label: "CPC",      color: "hsl(340 80% 55%)", span2: true,
      hint: "Cost ÷ Clicks — rising CPC means higher spend converts less efficiently." },
  ];

  return (
    <section className="mb-8">
      <div className="mb-4 flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight">Year to Date Overview</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Monthly performance {year} · {resolvedScope}
          </p>
        </div>
        {hasPrior && (
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4 bg-foreground/80 rounded" />
              {year}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-4 rounded"
                style={{ background: "repeating-linear-gradient(90deg, currentColor 0 3px, transparent 3px 6px)" }}
              />
              {comparisonYear} (YoY)
            </span>
          </div>
        )}
      </div>

      {!hasCurrent && !hasPrior ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          No YTD data available yet.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {metrics.map((m) => {
            const currTotal = totals[m.key];
            const prevTotal = totals[`${m.key}Prev` as keyof typeof totals] as number;
            const prevKey = `${m.key}Prev`;
            return (
              <div key={m.key} className={cn("rounded-lg border p-4 bg-card", m.span2 && "col-span-2")}>
                <div className="flex items-baseline justify-between mb-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">{m.label}</p>
                    <div className="flex items-baseline gap-2">
                      <p className="text-lg font-semibold tabular-nums">{formatValue(m.key, currTotal)}</p>
                      {hasPrior && prevTotal > 0 && (
                        <p className="text-[11px] text-muted-foreground tabular-nums">
                          vs {formatValue(m.key, prevTotal)} {comparisonYear}
                        </p>
                      )}
                    </div>
                    {m.hint && <p className="mt-0.5 text-[10px] text-muted-foreground">{m.hint}</p>}
                  </div>
                  <p className="text-[10px] text-muted-foreground">YTD {year}</p>
                </div>
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={monthly} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id={`grad-${m.key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={m.color} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={m.color} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v) => (m.key === "cpc" ? `$${v.toFixed(2)}` : formatCompact(v))}
                        width={m.key === "cpc" ? 44 : 40}
                      />
                      <Tooltip
                        formatter={(value: number, name: string) => {
                          const isPrev = name === `${comparisonYear}`;
                          return [formatValue(m.key, value), isPrev ? `${comparisonYear} (YoY)` : year];
                        }}
                        contentStyle={{
                          fontSize: 11,
                          borderRadius: 6,
                          border: "1px solid hsl(var(--border))",
                          background: "hsl(var(--popover))",
                        }}
                      />
                      {hasPrior && (
                        <Line
                          type="monotone"
                          dataKey={prevKey}
                          name={comparisonYear}
                          stroke={m.color}
                          strokeWidth={1.5}
                          strokeDasharray="4 3"
                          strokeOpacity={0.55}
                          dot={false}
                          isAnimationActive={false}
                        />
                      )}
                      <Area
                        type="monotone"
                        dataKey={m.key}
                        name={year}
                        stroke={m.color}
                        strokeWidth={2}
                        fill={`url(#grad-${m.key})`}
                        isAnimationActive={false}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
