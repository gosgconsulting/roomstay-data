/**
 * Channel insights aggregation: group filtered raw rows by a named dimension
 * (e.g. "Device", "Audience", "Country", "Placement", "Funnel") and roll up
 * the chosen metric. Used by ChannelInsightsRow on SEM / Social / Overview tabs.
 */

import { parseNumericValue } from "@/lib/parseNumericValue";
import {
  getFilteredPivotRowsForChannel,
  type PivotChannelBundle,
} from "@/lib/slideViewHelpers";
import type { RawDataRow } from "@/types/slideReports";

export type InsightMetricKey =
  | "bookings"
  | "revenue"
  | "cost"
  | "clicks"
  | "impressions"
  | "leads";

/** Display label for each metric key. */
export const INSIGHT_METRIC_LABEL: Record<InsightMetricKey, string> = {
  bookings: "Bookings",
  revenue: "Revenue",
  cost: "Cost",
  clicks: "Clicks",
  impressions: "Impressions",
  leads: "Leads",
};

const METRIC_NAME_MATCHERS: Record<InsightMetricKey, RegExp[]> = {
  bookings: [/^bookings?$/i, /^conversions?$/i],
  revenue: [/^revenue$/i, /^conv\.?\s*value$/i, /^conversion\s*value$/i],
  cost: [/^cost$/i, /^spend$/i, /^amount\s*spent$/i],
  clicks: [/^clicks?$/i, /^link\s*clicks?$/i],
  impressions: [/^impressions?$/i, /^impr\.?$/i],
  leads: [/^leads?$/i, /^results?$/i],
};

/** Find the dimension id whose display name matches one of the candidate names (case-insensitive). */
export function findDimensionIdByName(
  dimensionMap: Record<string, string> | undefined,
  candidates: string[],
): { id: string; name: string } | null {
  if (!dimensionMap) return null;
  const lowered = candidates.map((c) => c.toLowerCase());
  for (const [id, name] of Object.entries(dimensionMap)) {
    if (!name) continue;
    if (lowered.includes(name.trim().toLowerCase())) {
      return { id, name };
    }
  }
  return null;
}

/** Find a metric dimension id given the metric key (cost, revenue, etc.). */
function findMetricDimensionId(
  dimensionMap: Record<string, string> | undefined,
  metric: InsightMetricKey,
): string | null {
  if (!dimensionMap) return null;
  const matchers = METRIC_NAME_MATCHERS[metric];
  for (const [id, name] of Object.entries(dimensionMap)) {
    if (!name) continue;
    const trimmed = name.trim();
    if (matchers.some((re) => re.test(trimmed))) return id;
  }
  return null;
}

export interface InsightBucket {
  /** Raw label for the dimension value (e.g. "Mobile", "Singapore"). */
  label: string;
  /** Aggregated metric value. */
  value: number;
  /** Share of total (0..1). */
  share: number;
}

/**
 * Group filtered rows by a named dimension and aggregate the selected metric.
 * Returns top `topN` buckets (default 8) sorted desc by value, with everything
 * else lumped into a single "Other" bucket if it would render below the cut.
 */
export function buildInsightBuckets(
  rows: RawDataRow[],
  dimensionMap: Record<string, string> | undefined,
  dimensionCandidates: string[],
  metric: InsightMetricKey,
  topN: number = 8,
  groupOther: boolean = true,
): { dimensionLabel: string | null; buckets: InsightBucket[]; total: number } {
  const dim = findDimensionIdByName(dimensionMap, dimensionCandidates);
  if (!dim) return { dimensionLabel: null, buckets: [], total: 0 };

  const metricId = findMetricDimensionId(dimensionMap, metric);
  // The metric column might also live under its plain name (e.g. row['Cost'])
  const metricNames = METRIC_NAME_MATCHERS[metric];

  const sums = new Map<string, number>();
  for (const row of rows) {
    const rowData = ((row as any).dimension_values || row) as Record<string, unknown>;
    const labelRaw = rowData[dim.id];
    if (labelRaw == null || labelRaw === "") continue;
    const label = String(labelRaw).trim();
    if (!label) continue;

    let metricVal: unknown = undefined;
    if (metricId && rowData[metricId] !== undefined) metricVal = rowData[metricId];
    if (metricVal === undefined) {
      // Fall back to a key whose name matches the metric (legacy rows storing by name)
      for (const [key, v] of Object.entries(rowData)) {
        if (typeof key !== "string") continue;
        if (metricNames.some((re) => re.test(key))) {
          metricVal = v;
          break;
        }
      }
    }
    const num = metricVal == null ? 0 : parseNumericValue(metricVal);
    if (!isFinite(num)) continue;
    sums.set(label, (sums.get(label) ?? 0) + num);
  }

  const sorted = [...sums.entries()].sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, v]) => s + v, 0);

  let head = sorted.slice(0, topN);
  const tail = sorted.slice(topN);
  if (groupOther && tail.length > 0) {
    const otherSum = tail.reduce((s, [, v]) => s + v, 0);
    if (otherSum > 0) head = [...head, ["Other", otherSum]];
  }

  const buckets: InsightBucket[] = head
    .filter(([, v]) => v > 0)
    .map(([label, v]) => ({
      label,
      value: v,
      share: total > 0 ? v / total : 0,
    }));

  return { dimensionLabel: dim.name, buckets, total };
}

/**
 * Pull filtered raw rows for one channel using the standard slide filter pipeline,
 * then build buckets. Convenience wrapper used by ChannelInsightsRow.
 */
export function getChannelInsightBuckets(
  channelData: PivotChannelBundle | null | undefined,
  channel: string,
  dimensionCandidates: string[],
  metric: InsightMetricKey,
  filterValues: Record<string, Record<string, string[]>>,
  dateRange: { start: Date; end: Date } | undefined,
  configuredDimensionNames?: Record<string, string>,
  topN?: number,
) {
  const filteredRows = getFilteredPivotRowsForChannel(
    channelData,
    channel,
    filterValues,
    dateRange,
    configuredDimensionNames,
  );
  const dimensionMap = channelData?.dimensionMap ?? {};
  const merged = configuredDimensionNames
    ? { ...dimensionMap, ...configuredDimensionNames }
    : dimensionMap;
  return buildInsightBuckets(
    filteredRows,
    merged,
    dimensionCandidates,
    metric,
    topN,
  );
}

/**
 * Combine multiple channels' rows for an Overview-level breakdown.
 * Each channel may use a different metric column id, so we aggregate independently
 * per channel and then merge the bucket totals.
 */
export function getOverviewInsightBuckets(
  pivotData: { channels: Record<string, PivotChannelBundle> } | null | undefined,
  channels: string[],
  dimensionCandidates: string[],
  metric: InsightMetricKey,
  filterValues: Record<string, Record<string, string[]>>,
  dateRange: { start: Date; end: Date } | undefined,
  configuredDimensionNames?: Record<string, string>,
  topN: number = 8,
): { dimensionLabel: string | null; buckets: InsightBucket[]; total: number } {
  const merged = new Map<string, number>();
  let dimensionLabel: string | null = null;

  for (const ch of channels) {
    const channelData = pivotData?.channels?.[ch];
    if (!channelData) continue;
    const result = getChannelInsightBuckets(
      channelData,
      ch,
      dimensionCandidates,
      metric,
      filterValues,
      dateRange,
      configuredDimensionNames,
      999, // collect all, we'll re-rank after merge
    );
    if (result.dimensionLabel && !dimensionLabel) dimensionLabel = result.dimensionLabel;
    for (const b of result.buckets) {
      if (b.label === "Other") continue; // re-bucket after merge
      merged.set(b.label, (merged.get(b.label) ?? 0) + b.value);
    }
  }

  const sorted = [...merged.entries()].sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((s, [, v]) => s + v, 0);
  let head = sorted.slice(0, topN);
  const tail = sorted.slice(topN);
  if (tail.length > 0) {
    const otherSum = tail.reduce((s, [, v]) => s + v, 0);
    if (otherSum > 0) head = [...head, ["Other", otherSum]];
  }
  const buckets: InsightBucket[] = head
    .filter(([, v]) => v > 0)
    .map(([label, v]) => ({ label, value: v, share: total > 0 ? v / total : 0 }));

  return { dimensionLabel, buckets, total };
}

/** ISO 3166-1 alpha-2 helper for "By country" badges. Returns null if not a recognized country. */
export function countryToFlagCode(label: string): string | null {
  const map: Record<string, string> = {
    singapore: "SG",
    malaysia: "MY",
    indonesia: "ID",
    "united states": "US",
    usa: "US",
    "u.s.a": "US",
    france: "FR",
    "united kingdom": "GB",
    uk: "GB",
    australia: "AU",
    india: "IN",
    philippines: "PH",
    thailand: "TH",
    vietnam: "VN",
    japan: "JP",
    "south korea": "KR",
    "hong kong": "HK",
    taiwan: "TW",
    china: "CN",
    germany: "DE",
    italy: "IT",
    spain: "ES",
    netherlands: "NL",
    canada: "CA",
    "new zealand": "NZ",
    brazil: "BR",
    mexico: "MX",
  };
  return map[label.trim().toLowerCase()] ?? null;
}

/** Format an insight value for display, choosing currency for monetary metrics. */
export function formatInsightValue(metric: InsightMetricKey, value: number): string {
  if (!isFinite(value)) return "—";
  const abs = Math.abs(value);
  const compact =
    abs >= 1_000_000
      ? `${(value / 1_000_000).toFixed(1)}M`
      : abs >= 1_000
        ? `${(value / 1_000).toFixed(1)}k`
        : value.toLocaleString("en-US", { maximumFractionDigits: 0 });

  if (metric === "cost" || metric === "revenue") return `$${compact}`;
  return compact;
}
