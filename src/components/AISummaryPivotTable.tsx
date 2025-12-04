import React, { useState, useEffect } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchSourceData } from "@/hooks/dataSources/useSourceData";
import { getUser } from "@/lib/auth";
import {
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfYear,
  isWithinInterval,
  parseISO,
  isValid,
} from "date-fns";

interface ReportMetrics {
  reportId: string;
  reportName: string;
  metrics: Record<string, number>;
}

export type DateTab = "last_month" | "mtd" | "ytd";

export interface CachedPivotData {
  last_month: ReportMetrics[];
  mtd: ReportMetrics[];
  ytd: ReportMetrics[];
}

interface AISummaryPivotTableProps {
  reportIds: string[];
  selectedMetrics: string[];
  accountId?: string;
  cachedPivotData?: CachedPivotData | null;
}

interface DataSource {
  id: string;
  report_id: string;
  name: string;
  source_type: "google_sheets" | "csv_url";
  spreadsheet_id: string | null;
  google_sheets_url: string | null;
  csv_url: string | null;
  tab_name: string | null;
  header_row: number;
  column_mappings: any[] | null;
}

interface Report {
  id: string;
  name: string;
}

const formatNumber = (value: number): string => {
  if (value === 0) return "0";
  if (Math.abs(value) >= 1000000) {
    return (value / 1000000).toFixed(1) + "M";
  }
  if (Math.abs(value) >= 1000) {
    return (value / 1000).toFixed(1) + "K";
  }
  if (value % 1 !== 0) {
    return value.toFixed(2);
  }
  return value.toLocaleString();
};

const formatMetricValue = (metric: string, value: number): string => {
  const lowerMetric = metric.toLowerCase();
  if (lowerMetric.includes("rate") || lowerMetric.includes("ctr") || lowerMetric.includes("roas") || lowerMetric.includes("cos") || lowerMetric === "cost of sale") {
    return value.toFixed(2) + "%";
  }
  if (lowerMetric.includes("cost") || lowerMetric.includes("revenue") || lowerMetric.includes("cpc") || lowerMetric.includes("spend")) {
    return "$" + formatNumber(value);
  }
  return formatNumber(value);
};

// Export these utilities for use in other files
export const getDateRange = (tab: DateTab): { start: Date; end: Date } => {
  const now = new Date();
  switch (tab) {
    case "last_month":
      const lastMonth = subMonths(now, 1);
      return {
        start: startOfMonth(lastMonth),
        end: endOfMonth(lastMonth),
      };
    case "mtd":
      return {
        start: startOfMonth(now),
        end: now,
      };
    case "ytd":
      return {
        start: startOfYear(now),
        end: now,
      };
  }
};

export const parseDate = (value: any): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return isValid(value) ? value : null;
  const isoDate = parseISO(String(value));
  if (isValid(isoDate)) return isoDate;
  const dateStr = String(value).trim();
  const dateObj = new Date(dateStr);
  if (isValid(dateObj)) return dateObj;
  return null;
};

export const aggregateMetrics = (
  rows: any[],
  metrics: string[],
  dateRange: { start: Date; end: Date },
  dimensionFilter?: { dimensionId: string; dimensionName?: string; values: string[] }
): Record<string, number> => {
  const result: Record<string, number> = {};
  metrics.forEach((m) => (result[m] = 0));

  const filteredRows = rows.filter((row) => {
    // Date filter
    const dateValue = row.Date || row.date || row.Day || row.day;
    const rowDate = parseDate(dateValue);
    if (!rowDate) return false;
    if (!isWithinInterval(rowDate, { start: dateRange.start, end: dateRange.end })) {
      return false;
    }
    
    // Dimension filter
    if (dimensionFilter && dimensionFilter.values.length > 0) {
      // Try to find the dimension value by ID or name
      const dimValue = row[dimensionFilter.dimensionId] || 
                       (dimensionFilter.dimensionName ? row[dimensionFilter.dimensionName] : undefined);
      if (dimValue === undefined || !dimensionFilter.values.includes(String(dimValue))) {
        return false;
      }
    }
    
    return true;
  });

  filteredRows.forEach((row) => {
    metrics.forEach((metric) => {
      const value = row[metric];
      if (value !== undefined && value !== null) {
        const numValue = parseFloat(String(value).replace(/[^0-9.-]/g, ""));
        if (!isNaN(numValue)) {
          result[metric] += numValue;
        }
      }
    });
  });

  return result;
};

export const AISummaryPivotTable: React.FC<AISummaryPivotTableProps> = ({
  reportIds,
  selectedMetrics,
  accountId,
  cachedPivotData,
}) => {
  const [activeTab, setActiveTab] = useState<DateTab>("mtd");
  const [isLoading, setIsLoading] = useState(!cachedPivotData);
  const [data, setData] = useState<Record<DateTab, ReportMetrics[]>>(
    cachedPivotData || { last_month: [], mtd: [], ytd: [] }
  );

  useEffect(() => {
    // If we have cached data, use it immediately
    if (cachedPivotData) {
      setData(cachedPivotData);
      setIsLoading(false);
      return;
    }

    // Otherwise, fetch fresh data
    const loadData = async () => {
      if (reportIds.length === 0) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        const { user } = await getUser();
        if (!user) return;

        const { data: reportsData } = await supabase
          .from("reports")
          .select("id, name")
          .in("id", reportIds);

        const reportsList = reportsData || [];

        const dateRanges: Record<DateTab, { start: Date; end: Date }> = {
          last_month: getDateRange("last_month"),
          mtd: getDateRange("mtd"),
          ytd: getDateRange("ytd"),
        };

        const newData: Record<DateTab, ReportMetrics[]> = {
          last_month: [],
          mtd: [],
          ytd: [],
        };

        for (const reportId of reportIds) {
          const report = reportsList.find((r: Report) => r.id === reportId);
          if (!report) continue;

          const { data: dsData } = await supabase
            .from("data_sources")
            .select("*")
            .eq("report_id", reportId)
            .limit(1)
            .maybeSingle();

          if (!dsData) continue;

          const sourceData = await fetchSourceData(
            dsData as DataSource,
            user.id,
            accountId
          );

          if (!sourceData?.transformedRows) continue;

          (["last_month", "mtd", "ytd"] as DateTab[]).forEach((tab) => {
            const metrics = aggregateMetrics(
              sourceData.transformedRows,
              selectedMetrics,
              dateRanges[tab]
            );

            newData[tab].push({
              reportId: report.id,
              reportName: report.name,
              metrics,
            });
          });
        }

        setData(newData);
      } catch (error) {
        console.error("Error loading pivot table data:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [reportIds, selectedMetrics, accountId, cachedPivotData]);

  const calculateTotals = (reportMetrics: ReportMetrics[]): Record<string, number> => {
    const totals: Record<string, number> = {};
    const metrics = selectedMetrics || [];
    metrics.forEach((m) => (totals[m] = 0));

    reportMetrics.forEach((rm) => {
      metrics.forEach((metric) => {
        totals[metric] += rm.metrics[metric] || 0;
      });
    });

    return totals;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (reportIds.length === 0 || !selectedMetrics || selectedMetrics.length === 0) {
    return null;
  }

  const safeMetrics = selectedMetrics || [];

  return (
    <div className="w-full">
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DateTab)}>
        <TabsList className="mb-4">
          <TabsTrigger value="last_month">Last Month</TabsTrigger>
          <TabsTrigger value="mtd">MTD</TabsTrigger>
          <TabsTrigger value="ytd">YTD</TabsTrigger>
        </TabsList>

        {(["last_month", "mtd", "ytd"] as DateTab[]).map((tab) => {
          const tabData = data[tab] || [];
          const totals = calculateTotals(tabData);

          return (
            <TabsContent key={tab} value={tab} className="mt-0">
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold w-[200px]">Report</TableHead>
                      {safeMetrics.map((metric) => (
                        <TableHead key={metric} className="font-semibold text-right">
                          {metric}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tabData.map((reportData, idx) => (
                      <TableRow
                        key={reportData.reportId}
                        className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}
                      >
                        <TableCell className="font-medium">
                          {reportData.reportName}
                        </TableCell>
                        {safeMetrics.map((metric) => (
                          <TableCell key={metric} className="text-right tabular-nums">
                            {formatMetricValue(metric, reportData.metrics[metric] || 0)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                    {/* Total Row */}
                    <TableRow className="bg-muted font-semibold border-t-2">
                      <TableCell>Total</TableCell>
                      {safeMetrics.map((metric) => (
                        <TableCell key={metric} className="text-right tabular-nums">
                          {formatMetricValue(metric, totals[metric] || 0)}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
};
