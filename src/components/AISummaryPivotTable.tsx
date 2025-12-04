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

interface BreakdownRow {
  groupValue: string;
  metrics: Record<string, number>;
}

export type DateTab = "last_month" | "mtd" | "ytd";

export interface CachedPivotData {
  last_month: ReportMetrics[];
  mtd: ReportMetrics[];
  ytd: ReportMetrics[];
  breakdown_data?: Record<string, Record<DateTab, BreakdownRow[]>>;
}

interface AISummaryPivotTableProps {
  reportIds: string[];
  selectedMetrics: string[];
  accountId?: string;
  cachedPivotData?: CachedPivotData | null;
  reportConfigs?: Record<string, any>;
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
  dimensionFilter?: { dimensionId: string; dimensionName?: string; values: string[] },
  metricNameToIdMap?: Record<string, string>
): Record<string, number> => {
  const result: Record<string, number> = {};
  metrics.forEach((m) => (result[m] = 0));
  
  // Try to find Date dimension ID from metricNameToIdMap
  const dateDimId = metricNameToIdMap?.['Date'] || metricNameToIdMap?.['date'] || metricNameToIdMap?.['Day'];

  const filteredRows = rows.filter((row) => {
    // Handle both flat row format and transformed row format (with dimension_values)
    const rowData = row.dimension_values || row;
    
    // Date filter - try multiple approaches to find the date value
    let dateValue: any = null;
    
    // First, try by name
    dateValue = rowData.Date || rowData.date || rowData.Day || rowData.day;
    
    // Then try by dimension ID if we have it
    if (!dateValue && dateDimId) {
      dateValue = rowData[dateDimId];
    }
    
    // Finally, search all values for a date pattern
    if (!dateValue) {
      for (const [key, val] of Object.entries(rowData)) {
        if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) {
          dateValue = val;
          break;
        }
      }
    }
    
    const rowDate = parseDate(dateValue);
    if (!rowDate) return false;
    if (!isWithinInterval(rowDate, { start: dateRange.start, end: dateRange.end })) {
      return false;
    }
    
    // Dimension filter
    if (dimensionFilter && dimensionFilter.values.length > 0) {
      // Try to find the dimension value by ID first, then by name
      const dimValue = rowData[dimensionFilter.dimensionId] || 
                       (dimensionFilter.dimensionName ? rowData[dimensionFilter.dimensionName] : undefined);
      if (dimValue === undefined || !dimensionFilter.values.includes(String(dimValue))) {
        return false;
      }
    }
    
    return true;
  });

  filteredRows.forEach((row) => {
    const rowData = row.dimension_values || row;
    
    metrics.forEach((metric) => {
      // Try to get value by metric name directly
      let value = rowData[metric];
      
      // If not found and we have a mapping, try by dimension ID
      if ((value === undefined || value === null) && metricNameToIdMap && metricNameToIdMap[metric]) {
        value = rowData[metricNameToIdMap[metric]];
      }
      
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
  reportConfigs,
}) => {
  const [activeTab, setActiveTab] = useState<DateTab>("mtd");
  const [isLoading, setIsLoading] = useState(!cachedPivotData);
  const [data, setData] = useState<CachedPivotData>(
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
  
  // Get breakdown data and report names
  const breakdownData = data.breakdown_data || {};
  const mainTabData = data[activeTab] || [];
  
  // Helper to get report name from reportId
  const getReportName = (reportId: string): string => {
    const report = mainTabData.find(r => r.reportId === reportId);
    return report?.reportName || reportId;
  };
  
  // Calculate breakdown totals
  const calculateBreakdownTotals = (rows: BreakdownRow[]): Record<string, number> => {
    const totals: Record<string, number> = {};
    safeMetrics.forEach(m => totals[m] = 0);
    rows.forEach(row => {
      safeMetrics.forEach(metric => {
        totals[metric] += row.metrics[metric] || 0;
      });
    });
    return totals;
  };

  return (
    <div className="w-full space-y-6">
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
            <TabsContent key={tab} value={tab} className="mt-0 space-y-6">
              {/* Main Summary Table */}
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
              
              {/* Breakdown Tables */}
              {Object.keys(breakdownData).length > 0 && (
                <div className="space-y-4">
                  {Object.entries(breakdownData).map(([reportId, reportBreakdown]) => {
                    const breakdownRows = reportBreakdown[tab] || [];
                    if (breakdownRows.length === 0) return null;
                    
                    const breakdownTotals = calculateBreakdownTotals(breakdownRows);
                    const reportName = getReportName(reportId);
                    
                    return (
                      <div key={reportId} className="border rounded-lg overflow-hidden">
                        <div className="bg-primary/5 px-4 py-2 border-b">
                          <h4 className="font-semibold text-sm">{reportName} - Breakdown</h4>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/30">
                              <TableHead className="font-medium w-[200px]">Group</TableHead>
                              {safeMetrics.map((metric) => (
                                <TableHead key={metric} className="font-medium text-right text-xs">
                                  {metric}
                                </TableHead>
                              ))}
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {breakdownRows.map((row, idx) => (
                              <TableRow
                                key={row.groupValue}
                                className={idx % 2 === 0 ? "bg-background" : "bg-muted/10"}
                              >
                                <TableCell className="font-medium text-sm">
                                  {row.groupValue}
                                </TableCell>
                                {safeMetrics.map((metric) => (
                                  <TableCell key={metric} className="text-right tabular-nums text-sm">
                                    {formatMetricValue(metric, row.metrics[metric] || 0)}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))}
                            {/* Breakdown Total Row */}
                            <TableRow className="bg-muted/50 font-medium border-t">
                              <TableCell className="text-sm">Total</TableCell>
                              {safeMetrics.map((metric) => (
                                <TableCell key={metric} className="text-right tabular-nums text-sm">
                                  {formatMetricValue(metric, breakdownTotals[metric] || 0)}
                                </TableCell>
                              ))}
                            </TableRow>
                          </TableBody>
                        </Table>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
};
