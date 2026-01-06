import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfYear,
  endOfDay,
  format,
} from "date-fns";
import type { ChannelConfig } from "@/components/MasterReportSettingsModal";

type DateTab = "this_month" | "last_month" | "ytd";

interface AggregatedRow {
  groupValue: string;
  metrics: Record<string, number>;
}

interface UseMasterReportAggregatesOptions {
  reportId: string;
  config: ChannelConfig;
  dateTab: DateTab;
  enabled?: boolean;
}

/**
 * Hook to fetch pre-aggregated master report data
 * Uses master_report_daily_aggregates and master_report_monthly_aggregates tables
 * for fast loading instead of aggregating raw dimension_data
 */
export function useMasterReportAggregates({
  reportId,
  config,
  dateTab,
  enabled = true,
}: UseMasterReportAggregatesOptions) {
  return useQuery<AggregatedRow[]>({
    queryKey: ["masterReportAggregates", reportId, config.groupByDimensionId, dateTab, config.selectedValues, config.selectedMetrics],
    queryFn: async () => {
      if (!config.groupByDimensionId) {
        // If no group by, return totals
        return await fetchTotals(reportId, config, dateTab);
      }

      // Fetch aggregated data based on date tab
      const now = new Date();
      let startDate: Date;
      let endDate: Date;
      let useMonthly = false;

      switch (dateTab) {
        case "this_month":
          startDate = startOfMonth(now);
          endDate = endOfDay(now);
          useMonthly = false;
          break;
        case "last_month":
          const lastMonth = subMonths(now, 1);
          startDate = startOfMonth(lastMonth);
          endDate = endOfMonth(lastMonth);
          useMonthly = true; // Use monthly for last month
          break;
        case "ytd":
          startDate = startOfYear(now);
          endDate = endOfDay(now);
          useMonthly = true; // Use monthly for YTD
          break;
      }

      if (useMonthly) {
        return await fetchMonthlyAggregates(reportId, config, startDate, endDate);
      } else {
        return await fetchDailyAggregates(reportId, config, startDate, endDate);
      }
    },
    enabled: enabled && !!reportId && !!config.groupByDimensionId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

/**
 * Fetch daily aggregates for a date range
 */
async function fetchDailyAggregates(
  reportId: string,
  config: ChannelConfig,
  startDate: Date,
  endDate: Date
): Promise<AggregatedRow[]> {
  const startDateStr = format(startDate, "yyyy-MM-dd");
  const endDateStr = format(endDate, "yyyy-MM-dd");

  let query = supabase
    .from("master_report_daily_aggregates")
    .select("*")
    .eq("report_id", reportId)
    .eq("group_by_dimension_id", config.groupByDimensionId!)
    .gte("date", startDateStr)
    .lte("date", endDateStr);

  // Filter by selected values if specified
  if (config.selectedValues && config.selectedValues.length > 0) {
    query = query.in("group_by_value", config.selectedValues);
  }

  const { data, error } = await query.order("date", { ascending: true });

  if (error) {
    console.error("[AGGREGATES] Error fetching daily aggregates:", error);
    throw error;
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Group by group_by_value and sum metrics
  const grouped: Record<string, {
    cost: number;
    revenue: number;
    clicks: number;
    impressions: number;
    conversions: number;
    bookings: number;
  }> = {};

  for (const row of data) {
    const groupValue = row.group_by_value;
    if (!grouped[groupValue]) {
      grouped[groupValue] = {
        cost: 0,
        revenue: 0,
        clicks: 0,
        impressions: 0,
        conversions: 0,
        bookings: 0,
      };
    }

    grouped[groupValue].cost += Number(row.cost ?? 0);
    grouped[groupValue].revenue += Number(row.revenue ?? 0);
    grouped[groupValue].clicks += Number(row.clicks ?? 0);
    grouped[groupValue].impressions += Number(row.impressions ?? 0);
    grouped[groupValue].conversions += Number(row.conversions ?? 0);
    grouped[groupValue].bookings += Number(row.bookings ?? 0);
  }

  // Convert to AggregatedRow format with calculated metrics
  const result: AggregatedRow[] = Object.entries(grouped).map(([groupValue, base]) => {
    const metrics: Record<string, number> = {};

    // Add base metrics
    if (config.selectedMetrics.includes("Cost")) {
      metrics.Cost = base.cost;
    }
    if (config.selectedMetrics.includes("Revenue")) {
      metrics.Revenue = base.revenue;
    }
    if (config.selectedMetrics.includes("Clicks")) {
      metrics.Clicks = base.clicks;
    }
    if (config.selectedMetrics.includes("Impressions")) {
      metrics.Impressions = base.impressions;
    }
    if (config.selectedMetrics.includes("Conversions")) {
      metrics.Conversions = base.conversions;
    }

    // Calculate derived metrics
    if (config.selectedMetrics.includes("ROAS")) {
      metrics.ROAS = base.cost > 0 ? base.revenue / base.cost : 0;
    }
    if (config.selectedMetrics.includes("CPC")) {
      metrics.CPC = base.clicks > 0 ? base.cost / base.clicks : 0;
    }
    if (config.selectedMetrics.includes("CTR")) {
      metrics.CTR = base.impressions > 0 ? (base.clicks / base.impressions) * 100 : 0;
    }
    if (config.selectedMetrics.includes("Conversion Rate")) {
      metrics["Conversion Rate"] = base.clicks > 0 ? (base.conversions / base.clicks) * 100 : 0;
    }

    return { groupValue, metrics };
  });

  // Sort by first metric descending
  const firstMetric = config.selectedMetrics[0];
  result.sort((a, b) => (b.metrics[firstMetric] || 0) - (a.metrics[firstMetric] || 0));

  return result;
}

/**
 * Fetch monthly aggregates for a date range
 */
async function fetchMonthlyAggregates(
  reportId: string,
  config: ChannelConfig,
  startDate: Date,
  endDate: Date
): Promise<AggregatedRow[]> {
  const startYearMonth = format(startDate, "yyyy-MM");
  const endYearMonth = format(endDate, "yyyy-MM");

  let query = supabase
    .from("master_report_monthly_aggregates")
    .select("*")
    .eq("report_id", reportId)
    .eq("group_by_dimension_id", config.groupByDimensionId!)
    .gte("year_month", startYearMonth)
    .lte("year_month", endYearMonth);

  // Filter by selected values if specified
  if (config.selectedValues && config.selectedValues.length > 0) {
    query = query.in("group_by_value", config.selectedValues);
  }

  const { data, error } = await query.order("year_month", { ascending: true });

  if (error) {
    console.error("[AGGREGATES] Error fetching monthly aggregates:", error);
    throw error;
  }

  if (!data || data.length === 0) {
    return [];
  }

  // Group by group_by_value and sum metrics
  const grouped: Record<string, {
    cost: number;
    revenue: number;
    clicks: number;
    impressions: number;
    conversions: number;
    bookings: number;
  }> = {};

  for (const row of data) {
    const groupValue = row.group_by_value;
    if (!grouped[groupValue]) {
      grouped[groupValue] = {
        cost: 0,
        revenue: 0,
        clicks: 0,
        impressions: 0,
        conversions: 0,
        bookings: 0,
      };
    }

    grouped[groupValue].cost += Number(row.cost ?? 0);
    grouped[groupValue].revenue += Number(row.revenue ?? 0);
    grouped[groupValue].clicks += Number(row.clicks ?? 0);
    grouped[groupValue].impressions += Number(row.impressions ?? 0);
    grouped[groupValue].conversions += Number(row.conversions ?? 0);
    grouped[groupValue].bookings += Number(row.bookings ?? 0);
  }

  // Convert to AggregatedRow format with calculated metrics
  const result: AggregatedRow[] = Object.entries(grouped).map(([groupValue, base]) => {
    const metrics: Record<string, number> = {};

    // Add base metrics
    if (config.selectedMetrics.includes("Cost")) {
      metrics.Cost = base.cost;
    }
    if (config.selectedMetrics.includes("Revenue")) {
      metrics.Revenue = base.revenue;
    }
    if (config.selectedMetrics.includes("Clicks")) {
      metrics.Clicks = base.clicks;
    }
    if (config.selectedMetrics.includes("Impressions")) {
      metrics.Impressions = base.impressions;
    }
    if (config.selectedMetrics.includes("Conversions")) {
      metrics.Conversions = base.conversions;
    }

    // Calculate derived metrics
    if (config.selectedMetrics.includes("ROAS")) {
      metrics.ROAS = base.cost > 0 ? base.revenue / base.cost : 0;
    }
    if (config.selectedMetrics.includes("CPC")) {
      metrics.CPC = base.clicks > 0 ? base.cost / base.clicks : 0;
    }
    if (config.selectedMetrics.includes("CTR")) {
      metrics.CTR = base.impressions > 0 ? (base.clicks / base.impressions) * 100 : 0;
    }
    if (config.selectedMetrics.includes("Conversion Rate")) {
      metrics["Conversion Rate"] = base.clicks > 0 ? (base.conversions / base.clicks) * 100 : 0;
    }

    return { groupValue, metrics };
  });

  // Sort by first metric descending
  const firstMetric = config.selectedMetrics[0];
  result.sort((a, b) => (b.metrics[firstMetric] || 0) - (a.metrics[firstMetric] || 0));

  return result;
}

/**
 * Fetch totals when no group by is specified
 */
async function fetchTotals(
  reportId: string,
  config: ChannelConfig,
  dateTab: DateTab
): Promise<AggregatedRow[]> {
  const now = new Date();
  let startDate: Date;
  let endDate: Date;
  let useMonthly = false;

  switch (dateTab) {
    case "this_month":
      startDate = startOfMonth(now);
      endDate = endOfDay(now);
      useMonthly = false;
      break;
    case "last_month":
      const lastMonth = subMonths(now, 1);
      startDate = startOfMonth(lastMonth);
      endDate = endOfMonth(lastMonth);
      useMonthly = true;
      break;
    case "ytd":
      startDate = startOfYear(now);
      endDate = endOfDay(now);
      useMonthly = true;
      break;
  }

  // For totals, we need to query all group_by_dimension_ids for this report
  // First, get the master_report_config to find group_by_dimension_id
  const { data: configData } = await supabase
    .from("master_report_configs")
    .select("group_by_dimension_id")
    .eq("report_id", reportId)
    .maybeSingle();

  if (!configData?.group_by_dimension_id) {
    return [{ groupValue: "Total", metrics: {} }];
  }

  // Fetch aggregates and sum all groups
  const aggregates = useMonthly
    ? await fetchMonthlyAggregates(reportId, { ...config, groupByDimensionId: configData.group_by_dimension_id }, startDate, endDate)
    : await fetchDailyAggregates(reportId, { ...config, groupByDimensionId: configData.group_by_dimension_id }, startDate, endDate);

  // Sum all metrics
  const totals: Record<string, number> = {};
  config.selectedMetrics.forEach((metric) => {
    totals[metric] = 0;
  });

  aggregates.forEach((row) => {
    config.selectedMetrics.forEach((metric) => {
      totals[metric] = (totals[metric] || 0) + (row.metrics[metric] || 0);
    });
  });

  return [{ groupValue: "Total", metrics: totals }];
}