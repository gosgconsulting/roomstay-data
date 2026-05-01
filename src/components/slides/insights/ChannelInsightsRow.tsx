import { useMemo, useState } from "react";
import { Globe, Smartphone, Users, Layout, Layers } from "lucide-react";
import { DonutBreakdownCard } from "./DonutBreakdownCard";
import {
  getChannelInsightBuckets,
  getOverviewInsightBuckets,
  type InsightMetricKey,
} from "@/lib/channelInsights";
import { buildMultiMonthDateRange } from "@/lib/monthUtils";
import type { SlideReportPivotData } from "@/types/slideReports";

type Channel = "metasearch" | "sem" | "social";
type Scope = Channel | "overview";

interface Props {
  /** Which scope to render. "overview" combines metasearch + sem + social. */
  scope: Scope;
  pivotData?: SlideReportPivotData | null;
  selectedYear?: string;
  selectedMonth?: string;
  customDateRange?: import("react-day-picker").DateRange | undefined;
  filterValues: Record<string, Record<string, string[]>>;
  configuredDimensionNames?: Record<string, string>;
  /** Metric used by non-metasearch cards. Defaults to bookings. */
  metric?: InsightMetricKey;
}

const CHANNEL_NAMES = [
  "Channel",
  "Source",
  "Partner",
  "Platform",
  "Network",
  "Publisher",
  "Metasearch Partner",
];
const AUDIENCE_NAMES = [
  "Audience",
  "Audience Name",
  "Audience Segment",
  "Targeting",
  "Age",
  "Gender",
];
const DEVICE_NAMES = ["Device", "Device Category", "Device Type", "Platform"];
const MARKET_NAMES = [
  "Country",
  "Market",
  "Top Market",
  "Region",
  "Geo",
  "Geo Country",
  "Location",
];
const PLACEMENT_NAMES = [
  "Placement",
  "Publisher Platform",
  "Platform Position",
  "Position",
];

const KPI_OPTIONS: { value: InsightMetricKey; label: string }[] = [
  { value: "revenue", label: "Revenue" },
  { value: "cost", label: "Cost" },
  { value: "bookings", label: "Bookings" },
  { value: "clicks", label: "Clicks" },
  { value: "impressions", label: "Impressions" },
];

function KpiSelect({
  value,
  onChange,
}: {
  value: InsightMetricKey;
  onChange: (m: InsightMetricKey) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as InsightMetricKey)}
      onClick={(e) => e.stopPropagation()}
      className="shrink-0 text-[10px] rounded border border-border bg-background text-muted-foreground px-1.5 py-0.5 cursor-pointer hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
    >
      {KPI_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function ChannelInsightsRow({
  scope,
  pivotData,
  selectedYear,
  selectedMonth,
  customDateRange,
  filterValues,
  configuredDimensionNames,
  metric = "bookings",
}: Props) {
  const dateRange = useMemo(() => {
    if (customDateRange?.from) {
      const from = customDateRange.from;
      const to = customDateRange.to ?? customDateRange.from;
      return {
        start: from,
        end: new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999),
      };
    }
    return buildMultiMonthDateRange(selectedYear || "all", selectedMonth || "all");
  }, [customDateRange, selectedYear, selectedMonth]);

  const channels: Channel[] = scope === "overview" ? ["metasearch", "sem", "social"] : [scope];

  function bucketsForWithMetric(candidates: string[], m: InsightMetricKey) {
    if (scope === "overview") {
      return getOverviewInsightBuckets(
        pivotData as any,
        channels,
        candidates,
        m,
        filterValues,
        dateRange,
        configuredDimensionNames,
      );
    }
    const channelData = pivotData?.channels?.[scope];
    return getChannelInsightBuckets(
      channelData as any,
      scope,
      candidates,
      m,
      filterValues,
      dateRange,
      configuredDimensionNames,
    );
  }

  // Per-card KPI state for metasearch (always called to satisfy Rules of Hooks).
  const [chMetric, setChMetric] = useState<InsightMetricKey>("revenue");
  const [devMetric, setDevMetric] = useState<InsightMetricKey>("revenue");
  const [mktMetric, setMktMetric] = useState<InsightMetricKey>("revenue");

  const isMetasearch = scope === "metasearch";
  const isSocial = scope === "social";

  // ── Metasearch per-card buckets ──────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const metaCh  = useMemo(() => bucketsForWithMetric(CHANNEL_NAMES, chMetric),  [scope, pivotData, dateRange, filterValues, chMetric]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const metaDev = useMemo(() => bucketsForWithMetric(DEVICE_NAMES, devMetric),  [scope, pivotData, dateRange, filterValues, devMetric]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const metaMkt = useMemo(() => bucketsForWithMetric(MARKET_NAMES, mktMetric),  [scope, pivotData, dateRange, filterValues, mktMetric]);

  // ── Shared-metric buckets (SEM / Social / Overview) ─────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const device    = useMemo(() => bucketsForWithMetric(DEVICE_NAMES, metric),     [scope, pivotData, dateRange, filterValues, metric]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const audience  = useMemo(() => bucketsForWithMetric(AUDIENCE_NAMES, metric),   [scope, pivotData, dateRange, filterValues, metric]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const market    = useMemo(() => bucketsForWithMetric(MARKET_NAMES, metric),     [scope, pivotData, dateRange, filterValues, metric]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const placement = useMemo(() => bucketsForWithMetric(PLACEMENT_NAMES, metric),  [scope, pivotData, dateRange, filterValues, metric]);

  const heading =
    scope === "overview" ? "Performance breakdowns" :
    scope === "sem"      ? "SEM breakdowns" :
    scope === "social"   ? "Social breakdowns" :
                           "Metasearch breakdowns";

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-foreground">{heading}</h3>
        {isMetasearch ? (
          <span className="text-[11px] text-muted-foreground">
            By {(metaCh.dimensionLabel || "channel").toLowerCase()} · {(metaDev.dimensionLabel || "device").toLowerCase()} · {(metaMkt.dimensionLabel || "market").toLowerCase()}
          </span>
        ) : isSocial ? (
          <span className="text-[11px] text-muted-foreground">
            By {(device.dimensionLabel || "device").toLowerCase()} · {(placement.dimensionLabel || "placement").toLowerCase()} · {(audience.dimensionLabel || "audience").toLowerCase()}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            By {(device.dimensionLabel || "device").toLowerCase()} · {(market.dimensionLabel || "market").toLowerCase()} · {(audience.dimensionLabel || "audience").toLowerCase()}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {isMetasearch ? (
          <>
            <DonutBreakdownCard
              title={`By ${(metaCh.dimensionLabel || "channel").toLowerCase()}`}
              icon={<Layers className="h-3.5 w-3.5 text-muted-foreground" />}
              buckets={metaCh.buckets}
              metric={chMetric}
              headerAction={<KpiSelect value={chMetric} onChange={setChMetric} />}
            />
            <DonutBreakdownCard
              title={`By ${(metaDev.dimensionLabel || "device").toLowerCase()}`}
              icon={<Smartphone className="h-3.5 w-3.5 text-muted-foreground" />}
              buckets={metaDev.buckets}
              metric={devMetric}
              headerAction={<KpiSelect value={devMetric} onChange={setDevMetric} />}
            />
            <DonutBreakdownCard
              title={`By ${(metaMkt.dimensionLabel || "market").toLowerCase()}`}
              icon={<Globe className="h-3.5 w-3.5 text-muted-foreground" />}
              buckets={metaMkt.buckets}
              metric={mktMetric}
              headerAction={<KpiSelect value={mktMetric} onChange={setMktMetric} />}
            />
          </>
        ) : isSocial ? (
          <>
            <DonutBreakdownCard
              title={`By ${(device.dimensionLabel || "device").toLowerCase()}`}
              icon={<Smartphone className="h-3.5 w-3.5 text-muted-foreground" />}
              buckets={device.buckets}
              metric={metric}
            />
            <DonutBreakdownCard
              title={`By ${(placement.dimensionLabel || "placement").toLowerCase()}`}
              icon={<Layout className="h-3.5 w-3.5 text-muted-foreground" />}
              buckets={placement.buckets}
              metric={metric}
            />
            <DonutBreakdownCard
              title={`By ${(audience.dimensionLabel || "audience").toLowerCase()}`}
              icon={<Users className="h-3.5 w-3.5 text-muted-foreground" />}
              buckets={audience.buckets}
              metric={metric}
            />
          </>
        ) : (
          /* SEM and Overview: Device · Market · Audience */
          <>
            <DonutBreakdownCard
              title={`By ${(device.dimensionLabel || "device").toLowerCase()}`}
              icon={<Smartphone className="h-3.5 w-3.5 text-muted-foreground" />}
              buckets={device.buckets}
              metric={metric}
            />
            <DonutBreakdownCard
              title={`By ${(market.dimensionLabel || "market").toLowerCase()}`}
              icon={<Globe className="h-3.5 w-3.5 text-muted-foreground" />}
              buckets={market.buckets}
              metric={metric}
            />
            <DonutBreakdownCard
              title={`By ${(audience.dimensionLabel || "audience").toLowerCase()}`}
              icon={<Users className="h-3.5 w-3.5 text-muted-foreground" />}
              buckets={audience.buckets}
              metric={metric}
            />
          </>
        )}
      </div>
    </section>
  );
}
