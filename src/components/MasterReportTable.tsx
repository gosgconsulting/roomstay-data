import { useState, useEffect, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { fetchSourceData } from "@/hooks/dataSources/useSourceData";
import { getUser } from "@/lib/auth";
import {
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfYear,
  endOfDay,
  isWithinInterval,
  parseISO,
  format,
} from "date-fns";
import type { ChannelConfig } from "./MasterReportSettingsModal";

interface MasterReportTableProps {
  reportId: string;
  reportName: string;
  config: ChannelConfig;
  accountId?: string;
}

interface AggregatedRow {
  groupValue: string;
  metrics: Record<string, number>;
}

type DateTab = "this_month" | "last_month" | "ytd";

const DATE_TAB_LABELS: Record<DateTab, string> = {
  this_month: "This Month",
  last_month: "Last Month",
  ytd: "Year to Date",
};

function getDateRange(tab: DateTab): { start: Date; end: Date } {
  const now = new Date();
  switch (tab) {
    case "this_month":
      return { start: startOfMonth(now), end: endOfDay(now) };
    case "last_month":
      const lastMonth = subMonths(now, 1);
      return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
    case "ytd":
      return { start: startOfYear(now), end: endOfDay(now) };
  }
}

function parseDate(dateValue: any): Date | null {
  if (!dateValue) return null;
  if (dateValue instanceof Date) return dateValue;
  if (typeof dateValue === "string") {
    // Try ISO format first
    if (dateValue.match(/^\d{4}-\d{2}-\d{2}/)) {
      try {
        return parseISO(dateValue);
      } catch {
        return null;
      }
    }
    // Try other formats
    try {
      return new Date(dateValue);
    } catch {
      return null;
    }
  }
  return null;
}

function formatMetricValue(metricName: string, value: number): string {
  if (value === 0 || isNaN(value)) return "-";

  switch (metricName) {
    case "Cost":
    case "Revenue":
    case "CPC":
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    case "ROAS":
      return value.toFixed(2) + "x";
    case "CTR":
    case "Conversion Rate":
      return value.toFixed(2) + "%";
    case "Clicks":
    case "Impressions":
    case "Conversions":
      return new Intl.NumberFormat("en-US").format(Math.round(value));
    default:
      return new Intl.NumberFormat("en-US").format(value);
  }
}

export function MasterReportTable({
  reportId,
  reportName,
  config,
  accountId,
}: MasterReportTableProps) {
  const [activeTab, setActiveTab] = useState<DateTab>("this_month");
  const [isLoading, setIsLoading] = useState(true);
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [dimensionIdMap, setDimensionIdMap] = useState<Record<string, string>>(
    {}
  );

  // Fetch source data
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        const { user } = await getUser();
        if (!user) {
          console.error("User not authenticated");
          setIsLoading(false);
          return;
        }

        // Get data source
        const { data: dsData } = await supabase
          .from("data_sources")
          .select("*")
          .eq("report_id", reportId)
          .limit(1)
          .maybeSingle();

        if (!dsData) {
          console.warn(`No data source found for report ${reportId}`);
          setRawRows([]);
          setIsLoading(false);
          return;
        }

        // Fetch source data
        const sourceData = await fetchSourceData(
          dsData as any,
          user.id,
          accountId
        );

        setRawRows(sourceData.transformedRows || []);
        setDimensionIdMap(sourceData.dimensionIdMap || {});
      } catch (error) {
        console.error("Error loading data for report:", reportId, error);
        setRawRows([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [reportId, accountId]);

  // Aggregate data based on config and active tab
  const aggregatedData = useMemo(() => {
    if (rawRows.length === 0) return [];

    const dateRange = getDateRange(activeTab);
    const { groupByDimensionId, selectedValues, selectedMetrics } = config;

    // Filter rows by date range
    const filteredRows = rawRows.filter((row) => {
      const rowData = row.dimension_values || row;
      const dateValue =
        rowData.Date || rowData.date || rowData.Day || rowData.day;
      const parsedDate = parseDate(dateValue);
      if (!parsedDate) return false;

      return isWithinInterval(parsedDate, {
        start: dateRange.start,
        end: dateRange.end,
      });
    });

    // If no grouping, return totals
    if (!groupByDimensionId) {
      const totals: Record<string, number> = {};
      selectedMetrics.forEach((metric) => {
        totals[metric] = 0;
      });

      filteredRows.forEach((row) => {
        const rowData = row.dimension_values || row;
        selectedMetrics.forEach((metric) => {
          const value = parseFloat(rowData[metric] || rowData[metric.toLowerCase()] || 0);
          if (!isNaN(value)) {
            totals[metric] += value;
          }
        });
      });

      // Calculate derived metrics
      if (selectedMetrics.includes("ROAS") && totals.Revenue && totals.Cost) {
        totals.ROAS = totals.Cost > 0 ? totals.Revenue / totals.Cost : 0;
      }
      if (selectedMetrics.includes("CPC") && totals.Clicks && totals.Cost) {
        totals.CPC = totals.Clicks > 0 ? totals.Cost / totals.Clicks : 0;
      }
      if (selectedMetrics.includes("CTR") && totals.Impressions && totals.Clicks) {
        totals.CTR = totals.Impressions > 0 ? (totals.Clicks / totals.Impressions) * 100 : 0;
      }
      if (selectedMetrics.includes("Conversion Rate") && totals.Clicks && totals.Conversions) {
        totals["Conversion Rate"] = totals.Clicks > 0 ? (totals.Conversions / totals.Clicks) * 100 : 0;
      }

      return [{ groupValue: "Total", metrics: totals }];
    }

    // Group by dimension
    const groups: Record<string, Record<string, number>> = {};

    filteredRows.forEach((row) => {
      const rowData = row.dimension_values || row;

      // Get group value
      let groupValue =
        rowData[groupByDimensionId] ||
        rowData[config.groupByDimensionName || ""] ||
        "Unknown";

      // Skip if not in selected values (when values are selected)
      if (selectedValues.length > 0 && !selectedValues.includes(groupValue)) {
        return;
      }

      if (!groups[groupValue]) {
        groups[groupValue] = {};
        selectedMetrics.forEach((metric) => {
          groups[groupValue][metric] = 0;
        });
        // Also track base metrics for calculations
        groups[groupValue]["_cost"] = 0;
        groups[groupValue]["_revenue"] = 0;
        groups[groupValue]["_clicks"] = 0;
        groups[groupValue]["_impressions"] = 0;
        groups[groupValue]["_conversions"] = 0;
      }

      // Sum base metrics
      const cost = parseFloat(rowData.Cost || rowData.cost || 0);
      const revenue = parseFloat(rowData.Revenue || rowData.revenue || 0);
      const clicks = parseFloat(rowData.Clicks || rowData.clicks || 0);
      const impressions = parseFloat(rowData.Impressions || rowData.impressions || 0);
      const conversions = parseFloat(rowData.Conversions || rowData.conversions || 0);

      if (!isNaN(cost)) groups[groupValue]["_cost"] += cost;
      if (!isNaN(revenue)) groups[groupValue]["_revenue"] += revenue;
      if (!isNaN(clicks)) groups[groupValue]["_clicks"] += clicks;
      if (!isNaN(impressions)) groups[groupValue]["_impressions"] += impressions;
      if (!isNaN(conversions)) groups[groupValue]["_conversions"] += conversions;
    });

    // Calculate final metrics including derived ones
    const result: AggregatedRow[] = Object.entries(groups).map(
      ([groupValue, baseMetrics]) => {
        const metrics: Record<string, number> = {};

        selectedMetrics.forEach((metric) => {
          switch (metric) {
            case "Cost":
              metrics[metric] = baseMetrics["_cost"];
              break;
            case "Revenue":
              metrics[metric] = baseMetrics["_revenue"];
              break;
            case "Clicks":
              metrics[metric] = baseMetrics["_clicks"];
              break;
            case "Impressions":
              metrics[metric] = baseMetrics["_impressions"];
              break;
            case "Conversions":
              metrics[metric] = baseMetrics["_conversions"];
              break;
            case "ROAS":
              metrics[metric] =
                baseMetrics["_cost"] > 0
                  ? baseMetrics["_revenue"] / baseMetrics["_cost"]
                  : 0;
              break;
            case "CPC":
              metrics[metric] =
                baseMetrics["_clicks"] > 0
                  ? baseMetrics["_cost"] / baseMetrics["_clicks"]
                  : 0;
              break;
            case "CTR":
              metrics[metric] =
                baseMetrics["_impressions"] > 0
                  ? (baseMetrics["_clicks"] / baseMetrics["_impressions"]) * 100
                  : 0;
              break;
            case "Conversion Rate":
              metrics[metric] =
                baseMetrics["_clicks"] > 0
                  ? (baseMetrics["_conversions"] / baseMetrics["_clicks"]) * 100
                  : 0;
              break;
          }
        });

        return { groupValue, metrics };
      }
    );

    // Sort by first metric descending
    const firstMetric = selectedMetrics[0];
    result.sort((a, b) => (b.metrics[firstMetric] || 0) - (a.metrics[firstMetric] || 0));

    return result;
  }, [rawRows, activeTab, config]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[200px] w-full" />
      </div>
    );
  }

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DateTab)}>
      <TabsList className="mb-4">
        {(Object.keys(DATE_TAB_LABELS) as DateTab[]).map((tab) => (
          <TabsTrigger key={tab} value={tab}>
            {DATE_TAB_LABELS[tab]}
          </TabsTrigger>
        ))}
      </TabsList>

      {(Object.keys(DATE_TAB_LABELS) as DateTab[]).map((tab) => (
        <TabsContent key={tab} value={tab}>
          {aggregatedData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No data available for this period
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">
                      {config.groupByDimensionName || reportName}
                    </TableHead>
                    {config.selectedMetrics.map((metric) => (
                      <TableHead key={metric} className="text-right font-semibold">
                        {metric}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aggregatedData.map((row, idx) => (
                    <TableRow key={row.groupValue + idx}>
                      <TableCell className="font-medium">
                        {row.groupValue}
                      </TableCell>
                      {config.selectedMetrics.map((metric) => (
                        <TableCell key={metric} className="text-right">
                          {formatMetricValue(metric, row.metrics[metric] || 0)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}
