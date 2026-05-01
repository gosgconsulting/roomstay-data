import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  countryToFlagCode,
  formatInsightValue,
  type InsightBucket,
  type InsightMetricKey,
} from "@/lib/channelInsights";

interface Props {
  /** Card heading, e.g. "By country", "By audience", "By placement". */
  title: string;
  /** Optional small icon shown before the title (lucide). */
  icon?: React.ReactNode;
  buckets: InsightBucket[];
  metric: InsightMetricKey;
  /** When true, prefix each row with the 2-letter country code badge. */
  showCountryBadge?: boolean;
  /** Hint shown when there is no data for the dimension. */
  emptyHint?: string;
  /** Bar tint color (CSS color). Defaults to teal. */
  barColor?: string;
  /** Optional element rendered at the trailing end of the card header (e.g. a KPI selector). */
  headerAction?: React.ReactNode;
}

export function BreakdownByDimensionCard({
  title,
  icon,
  buckets,
  metric,
  showCountryBadge,
  emptyHint = "Not available yet — data will populate once the new sync runs.",
  barColor = "hsl(178 50% 45%)",
  headerAction,
}: Props) {
  const max = buckets.reduce((m, b) => Math.max(m, b.value), 0);

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
        {buckets.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-center text-xs text-muted-foreground px-4">
            {emptyHint}
          </div>
        ) : (
          <div className="space-y-2.5">
            {buckets.map((b) => {
              const widthPct = max > 0 ? Math.max(2, (b.value / max) * 100) : 0;
              const code = showCountryBadge ? countryToFlagCode(b.label) : null;
              return (
                <div key={b.label} className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-2">
                  {showCountryBadge && (
                    <span
                      className={cn(
                        "inline-flex h-5 w-7 items-center justify-center rounded text-[9px] font-semibold tracking-wider",
                        code
                          ? "bg-muted text-muted-foreground"
                          : "bg-muted/30 text-muted-foreground/60",
                      )}
                    >
                      {code ?? "•"}
                    </span>
                  )}
                  {!showCountryBadge && <span className="w-0" />}
                  <span className="truncate text-sm text-foreground" title={b.label}>
                    {b.label}
                  </span>
                  <span className="tabular-nums text-sm font-medium text-foreground">
                    {formatInsightValue(metric, b.value)}
                  </span>
                  <div className="flex items-center gap-2 min-w-[120px]">
                    <div className="relative h-1.5 w-20 rounded-full bg-muted overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{ width: `${widthPct}%`, background: barColor }}
                      />
                    </div>
                    <span className="text-[11px] tabular-nums text-muted-foreground w-10 text-right">
                      {(b.share * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
