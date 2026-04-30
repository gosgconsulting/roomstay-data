import { useMemo } from "react";
import { Globe, Smartphone, Users, Filter, Layers, Layout } from "lucide-react";
import { BreakdownByDimensionCard } from "./BreakdownByDimensionCard";
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
  /** Metric to summarize across all cards. Defaults to bookings, falls back to clicks. */
  metric?: InsightMetricKey;
}

/**
 * Candidate dimension names per insight (case-insensitive). The first match in the
 * channel's dimensionMap wins. Including common Windsor.ai / Google Ads / Meta Ads
 * variants so the row lights up as soon as the new sync populates these dimensions.
 */
const FUNNEL_NAMES = [
  "Funnel",
  "Funnel Stage",
  "Funnel Step",
  "Objective",
  "Campaign Objective",
  "Campaign Type",
  "Stage",
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

  // Determine which channels feed each scope.
  const channels: Channel[] = scope === "overview" ? ["metasearch", "sem", "social"] : [scope];

  function bucketsFor(candidates: string[]) {
    if (scope === "overview") {
      return getOverviewInsightBuckets(
        pivotData as any,
        channels,
        candidates,
        metric,
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
      metric,
      filterValues,
      dateRange,
      configuredDimensionNames,
    );
  }

  // The fourth card differs per scope: SEM = Top Market, Social = Placements,
  // Metasearch = Top Market, Overview = Top Market.
  const showPlacements = scope === "social";

  const funnel = useMemo(() => bucketsFor(FUNNEL_NAMES), [scope, pivotData, dateRange, filterValues, metric]);
  const audience = useMemo(() => bucketsFor(AUDIENCE_NAMES), [scope, pivotData, dateRange, filterValues, metric]);
  const device = useMemo(() => bucketsFor(DEVICE_NAMES), [scope, pivotData, dateRange, filterValues, metric]);
  const fourth = useMemo(
    () => bucketsFor(showPlacements ? PLACEMENT_NAMES : MARKET_NAMES),
    [scope, pivotData, dateRange, filterValues, metric, showPlacements],
  );

  const heading = scope === "overview"
    ? "Performance breakdowns"
    : scope === "sem"
      ? "SEM breakdowns"
      : scope === "social"
        ? "Social breakdowns"
        : "Metasearch breakdowns";

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-foreground">{heading}</h3>
        <span className="text-[11px] text-muted-foreground">
          By {(funnel.dimensionLabel || "Funnel").toLowerCase()} · {(audience.dimensionLabel || "Audience").toLowerCase()} · {(device.dimensionLabel || "Device").toLowerCase()} · {(fourth.dimensionLabel || (showPlacements ? "Placement" : "Market")).toLowerCase()}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-4 gap-4">
        <BreakdownByDimensionCard
          title={`By ${(funnel.dimensionLabel || "funnel").toLowerCase()}`}
          icon={<Filter className="h-3.5 w-3.5 text-muted-foreground" />}
          buckets={funnel.buckets}
          metric={metric}
          barColor="hsl(255 70% 65%)"
        />
        <BreakdownByDimensionCard
          title={`By ${(audience.dimensionLabel || "audience").toLowerCase()}`}
          icon={<Users className="h-3.5 w-3.5 text-muted-foreground" />}
          buckets={audience.buckets}
          metric={metric}
          barColor="hsl(178 50% 45%)"
        />
        <DonutBreakdownCard
          title={`By ${(device.dimensionLabel || "device").toLowerCase()}`}
          icon={<Smartphone className="h-3.5 w-3.5 text-muted-foreground" />}
          buckets={device.buckets}
          metric={metric}
        />
        {showPlacements ? (
          <BreakdownByDimensionCard
            title={`By ${(fourth.dimensionLabel || "placement").toLowerCase()}`}
            icon={<Layout className="h-3.5 w-3.5 text-muted-foreground" />}
            buckets={fourth.buckets}
            metric={metric}
            barColor="hsl(38 90% 55%)"
          />
        ) : (
          <BreakdownByDimensionCard
            title={`By ${(fourth.dimensionLabel || "country").toLowerCase()}`}
            icon={<Globe className="h-3.5 w-3.5 text-muted-foreground" />}
            buckets={fourth.buckets}
            metric={metric}
            showCountryBadge
            barColor="hsl(178 50% 45%)"
          />
        )}
      </div>
    </section>
  );
}
