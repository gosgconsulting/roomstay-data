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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchSourceData } from "@/hooks/dataSources/useSourceData";
import { getUser } from "@/lib/auth";
import FormattedAISummary from "@/components/FormattedAISummary";
import {
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfYear,
  subYears,
  isWithinInterval,
  parseISO,
  isValid,
  getWeek,
  getYear,
  getMonth,
  format,
  startOfWeek,
  endOfWeek,
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

// DateTab can be "mtd", "ytd", or a month key like "2025-11"
export type DateTab = "mtd" | "ytd" | string;
export type ComparisonType = "none" | "previous_period" | "previous_year";

export interface DateBreakdownRow {
  dateGroup: string; // e.g., "Week 45, 2024" or "January 2024"
  dateRangeStart?: string; // Actual start date from data (ISO string)
  dateRangeEnd?: string; // Actual end date from data (ISO string)
  metrics: Record<string, number>;
}

export interface TableInsights {
  summary: Record<DateTab, string>;
  date_breakdown: Record<DateTab, string>;
  breakdowns: Record<string, Record<DateTab, string>>; // reportId -> tab -> insight
}

export interface ExecutiveSummaries {
  last_month?: string;
  mtd?: string;
  ytd?: string;
}

export interface CachedPivotData {
  // Keep legacy structure for backward compatibility
  last_month?: ReportMetrics[];
  mtd: ReportMetrics[];
  ytd: ReportMetrics[];
  breakdown_data?: Record<string, Record<string, BreakdownRow[]>>;
  breakdown_dimension_names?: Record<string, string>;
  date_breakdown_data?: Record<string, Record<string, DateBreakdownRow[]>>;
  combined_date_breakdown?: Record<string, DateBreakdownRow[]>;
  table_insights?: TableInsights;
  executive_summaries?: ExecutiveSummaries;
  comparison_previous_period?: {
    last_month?: ReportMetrics[];
    mtd?: ReportMetrics[];
    ytd?: ReportMetrics[];
    breakdown_data?: Record<string, Record<string, BreakdownRow[]>>;
  };
  comparison_previous_year?: {
    last_month?: ReportMetrics[];
    mtd?: ReportMetrics[];
    ytd?: ReportMetrics[];
    breakdown_data?: Record<string, Record<string, BreakdownRow[]>>;
  };
}

interface AISummaryPivotTableProps {
  reportIds: string[];
  selectedMetrics: string[];
  accountId?: string;
  cachedPivotData?: CachedPivotData | null;
  reportConfigs?: Record<string, any>;
  selectedTab?: DateTab;
  onTabChange?: (tab: DateTab) => void;
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

// Helper to format AI Insights text into styled bullet points
const FormatAIInsights: React.FC<{ text: string }> = ({ text }) => {
  // Try multiple splitting strategies
  let lines: string[] = [];
  
  // Strategy 1: Split on " • " (inline bullet separator)
  if (text.includes(' • ')) {
    lines = text.split(' • ').map(s => s.trim()).filter(Boolean);
  }
  // Strategy 2: Split on numbered format "1. **Label**:" or "2. **Label**:"
  else if (/\d+\.\s+\*\*/.test(text)) {
    lines = text.split(/(?=\d+\.\s+\*\*)/).map(s => s.trim()).filter(Boolean);
  }
  // Strategy 3: Split on newlines
  else if (text.includes('\n')) {
    lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  }
  // Strategy 4: Split on standalone bullet points "• "
  else if (text.includes('• ')) {
    lines = text.split('• ').map(s => s.trim()).filter(Boolean);
  }
  // Fallback: single item
  else {
    lines = [text.trim()];
  }
  
  const items = lines.map(line => {
    const trimmed = line.trim();
    if (!trimmed) return null;
    
    // Match pattern: "1. **Label**: content" or "**Label**: content"
    const match = trimmed.match(/^(?:\d+\.\s*)?\*\*([^*]+)\*\*:?\s*(.+)$/);
    if (match) {
      const [, label, content] = match;
      // Strip any leading bullet characters from the label
      return { label: label.trim().replace(/^[•·\-]\s*/, ''), content: content.trim() };
    }
    
    // Try to match "Label: content" pattern
    const colonMatch = trimmed.match(/^([^:]+):\s*(.+)$/);
    if (colonMatch && colonMatch[1].length < 40) {
      const [, label, content] = colonMatch;
      // Strip any leading bullet characters from the label
      return { label: label.trim().replace(/\*\*/g, '').replace(/^[•·\-]\s*/, ''), content: content.trim().replace(/\*\*/g, '') };
    }
    
    // Fallback: just return the text cleaned up
    const cleanedText = trimmed
      .replace(/^\d+\.\s*/, '')
      .replace(/\*\*/g, '')
      .replace(/^[-•]\s*/, '');
    return cleanedText ? { label: null, content: cleanedText } : null;
  }).filter(Boolean);

  if (items.length === 0) {
    // Fallback: just render the text cleaned of markdown
    return <p className="text-sm text-muted-foreground">{text.replace(/\*\*/g, '')}</p>;
  }

  return (
    <ul className="space-y-3">
      {items.map((item, idx) => (
        <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
          <span className="text-primary mt-0.5 flex-shrink-0">•</span>
          <span className="leading-relaxed">
            {item?.label && <strong className="font-semibold text-foreground">{item.label}:</strong>}{' '}
            {item?.content}
          </span>
        </li>
      ))}
    </ul>
  );
};

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
  
  // Percentage metrics (rates, CTR, Cost of sale)
  if (lowerMetric.includes("rate") || lowerMetric === "ctr" || lowerMetric === "cost of sale" || lowerMetric === "cos") {
    return value.toFixed(2) + "%";
  }
  
  // ROAS is a multiplier - show as whole number with x
  if (lowerMetric === "roas") {
    return Math.round(value) + "x";
  }
  
  // Currency metrics (Cost, Revenue, CPC, Spend) - but NOT "cost of sale"
  if ((lowerMetric === "cost" || lowerMetric === "revenue" || lowerMetric === "cpc" || lowerMetric === "spend")) {
    return "$" + formatNumber(value);
  }
  
  // Default: raw number
  return formatNumber(value);
};

// Export these utilities for use in other files
export const getDateRange = (tab: DateTab): { start: Date; end: Date } => {
  const now = new Date();
  
  // Handle specific month keys like "2025-11"
  if (tab.match(/^\d{4}-\d{2}$/)) {
    const [year, month] = tab.split('-').map(Number);
    const monthDate = new Date(year, month - 1, 1);
    return {
      start: startOfMonth(monthDate),
      end: endOfMonth(monthDate),
    };
  }
  
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
    default:
      // Fallback to MTD
      return {
        start: startOfMonth(now),
        end: now,
      };
  }
};

// Get comparison date range based on comparison type
// Uses YTD-style comparison: same day of month/year for accurate comparison
export const getComparisonDateRange = (
  tab: DateTab, 
  comparisonType: ComparisonType
): { start: Date; end: Date } | null => {
  if (comparisonType === "none") return null;
  
  const currentRange = getDateRange(tab);
  const now = new Date();
  
  if (comparisonType === "previous_period") {
    // Previous period = same day range in the previous month/period
    switch (tab) {
      case "last_month": {
        // Compare to 2 months ago (full month)
        const twoMonthsAgo = subMonths(now, 2);
        return {
          start: startOfMonth(twoMonthsAgo),
          end: endOfMonth(twoMonthsAgo),
        };
      }
      case "mtd": {
        // Compare to same day of previous month (e.g., Dec 1-5 vs Nov 1-5)
        const prevMonth = subMonths(now, 1);
        const dayOfMonth = now.getDate();
        const prevMonthStart = startOfMonth(prevMonth);
        // Ensure we don't exceed the previous month's days
        const prevMonthEnd = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 
          Math.min(dayOfMonth, endOfMonth(prevMonth).getDate()));
        return {
          start: prevMonthStart,
          end: prevMonthEnd,
        };
      }
      case "ytd": {
        // Compare to same period last year (Jan 1 to same day/month)
        return {
          start: subYears(currentRange.start, 1),
          end: subYears(currentRange.end, 1),
        };
      }
    }
  }
  
  if (comparisonType === "previous_year") {
    // Same period but last year (YTD-style: same day of month/year)
    return {
      start: subYears(currentRange.start, 1),
      end: subYears(currentRange.end, 1),
    };
  }
  
  return null;
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

// Formula metrics that should be calculated, not summed
export const FORMULA_METRICS = ['CTR', 'ROAS', 'Conversion rate', 'CPC', 'Cost of sale', 'COS'];

// Base metrics needed for formula calculations (including alternatives like Bookings)
export const BASE_METRICS = ['Impressions', 'Clicks', 'Cost', 'Revenue', 'Conversions', 'Bookings'];

export const calculateFormulaMetrics = (baseValues: Record<string, number>): Record<string, number> => {
  const result: Record<string, number> = {};
  const impressions = baseValues['Impressions'] || 0;
  const clicks = baseValues['Clicks'] || 0;
  const cost = baseValues['Cost'] || 0;
  const revenue = baseValues['Revenue'] || 0;
  // Use Conversions, or fall back to Bookings if Conversions is 0
  const conversions = baseValues['Conversions'] || baseValues['Bookings'] || 0;

  result['CTR'] = impressions > 0 ? (clicks / impressions) * 100 : 0;
  result['ROAS'] = cost > 0 ? revenue / cost : 0; // ROAS is a multiplier, not percentage
  result['Conversion rate'] = clicks > 0 ? (conversions / clicks) * 100 : 0;
  result['CPC'] = clicks > 0 ? cost / clicks : 0;
  result['Cost of sale'] = revenue > 0 ? (cost / revenue) * 100 : 0;
  result['COS'] = result['Cost of sale'];

  return result;
};

// Month names for display
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 
                     'July', 'August', 'September', 'October', 'November', 'December'];

// Helper to format date group key based on tab (week for last_month/mtd, month for ytd)
export const getDateGroupKey = (date: Date, tab: DateTab): string => {
  if (tab === 'ytd') {
    // For YTD, group by month
    const month = getMonth(date);
    const year = getYear(date);
    return `${MONTH_NAMES[month]} ${year}`;
  }
  // For last_month and mtd, group by week
  const weekNum = getWeek(date);
  const year = getYear(date);
  return `Week ${weekNum}, ${year}`;
};

// Helper to get week date range string from a date
export const getWeekDateRange = (date: Date): string => {
  const weekStart = startOfWeek(date, { weekStartsOn: 1 }); // Monday start
  const weekEnd = endOfWeek(date, { weekStartsOn: 1 });
  return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d')}`;
};

// Helper to extract week date range from a week key like "Week 49, 2025"
export const getWeekDateRangeFromKey = (weekKey: string): string | null => {
  const match = weekKey.match(/Week (\d+), (\d+)/);
  if (!match) return null;
  
  const weekNum = parseInt(match[1], 10);
  const year = parseInt(match[2], 10);
  
  // Calculate the date for a given week number
  // Start from Jan 1 and find the first Monday
  const jan1 = new Date(year, 0, 1);
  const dayOfWeek = jan1.getDay();
  const daysToFirstMonday = dayOfWeek === 0 ? 1 : (dayOfWeek === 1 ? 0 : 8 - dayOfWeek);
  const firstMonday = new Date(year, 0, 1 + daysToFirstMonday);
  
  // Calculate the start of the target week
  const weekStart = new Date(firstMonday);
  weekStart.setDate(firstMonday.getDate() + (weekNum - 1) * 7);
  
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  
  return `${format(weekStart, 'MMM d')} - ${format(weekEnd, 'MMM d')}`;
};

export const aggregateMetrics = (
  rows: any[],
  metrics: string[],
  dateRange: { start: Date; end: Date },
  dimensionFilter?: { dimensionId: string; dimensionName?: string; values: string[] },
  metricNameToIdMap?: Record<string, string>
): Record<string, number> => {
  const result: Record<string, number> = {};
  
  // Initialize all requested metrics and base metrics needed for formulas
  const allMetricsToTrack = new Set([...metrics, ...BASE_METRICS]);
  allMetricsToTrack.forEach((m) => (result[m] = 0));
  
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

  // Sum up base metrics (non-formula metrics)
  filteredRows.forEach((row) => {
    const rowData = row.dimension_values || row;
    
    allMetricsToTrack.forEach((metric) => {
      // Skip formula metrics - they'll be calculated after summing
      if (FORMULA_METRICS.includes(metric)) return;
      
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

  // Calculate formula metrics from aggregated base values
  const formulaValues = calculateFormulaMetrics(result);
  FORMULA_METRICS.forEach(metric => {
    if (metrics.includes(metric)) {
      result[metric] = formulaValues[metric] || 0;
    }
  });

  return result;
};

export const AISummaryPivotTable: React.FC<AISummaryPivotTableProps> = ({
  reportIds,
  selectedMetrics,
  accountId,
  cachedPivotData,
  reportConfigs,
  selectedTab,
  onTabChange,
}) => {
  const [internalTab, setInternalTab] = useState<DateTab>("mtd");
  const activeTab = selectedTab || internalTab;
  const handleTabChange = (tab: DateTab) => {
    if (onTabChange) {
      onTabChange(tab);
    } else {
      setInternalTab(tab);
    }
  };
  const [comparisonType, setComparisonType] = useState<ComparisonType>("none");
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

        const dateRanges = {
          mtd: getDateRange("mtd"),
          ytd: getDateRange("ytd"),
        };

        const newData: CachedPivotData = {
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

          (["mtd", "ytd"] as const).forEach((tab) => {
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
    
    // Combine all metrics we need to track (base + selected non-formula)
    const allMetricsToSum = new Set<string>();
    BASE_METRICS.forEach(m => allMetricsToSum.add(m));
    metrics.forEach(m => {
      if (!FORMULA_METRICS.includes(m)) {
        allMetricsToSum.add(m);
      }
    });
    
    // Initialize all metrics to 0
    allMetricsToSum.forEach(m => totals[m] = 0);

    // Sum metrics from each report (only once per metric)
    reportMetrics.forEach((rm) => {
      allMetricsToSum.forEach((metric) => {
        totals[metric] += rm.metrics[metric] || 0;
      });
    });

    // Calculate formula metrics from totals
    const formulaValues = calculateFormulaMetrics(totals);
    metrics.forEach(metric => {
      if (FORMULA_METRICS.includes(metric)) {
        totals[metric] = formulaValues[metric] || 0;
      }
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

  // Preferred metric display order
  const METRIC_ORDER = [
    "Impressions",
    "Clicks", 
    "CTR",
    "Conversion rate",
    "Bookings",
    "CPC",
    "Cost",
    "Revenue",
    "ROAS",
    "Cost of sale",
  ];
  
  // Sort metrics by preferred order
  const safeMetrics = (selectedMetrics || []).slice().sort((a, b) => {
    const aIndex = METRIC_ORDER.indexOf(a);
    const bIndex = METRIC_ORDER.indexOf(b);
    // If not in order list, put at end
    const aOrder = aIndex === -1 ? 999 : aIndex;
    const bOrder = bIndex === -1 ? 999 : bIndex;
    return aOrder - bOrder;
  });
  
  // Get breakdown data and report names
  const breakdownData = data.breakdown_data || {};
  const combinedDateBreakdown = data.combined_date_breakdown || {};
  const mainTabData = data[activeTab] || [];
  
  // Helper to get report name from reportId
  const getReportName = (reportId: string): string => {
    const report = mainTabData.find(r => r.reportId === reportId);
    return report?.reportName || reportId;
  };
  
  // Calculate breakdown totals with formula metrics
  const calculateBreakdownTotals = (rows: (BreakdownRow | DateBreakdownRow)[]): Record<string, number> => {
    const totals: Record<string, number> = {};
    
    // Combine all metrics we need to track (base + selected non-formula)
    const allMetricsToSum = new Set<string>();
    BASE_METRICS.forEach(m => allMetricsToSum.add(m));
    safeMetrics.forEach(m => {
      if (!FORMULA_METRICS.includes(m)) {
        allMetricsToSum.add(m);
      }
    });
    
    // Initialize all metrics to 0
    allMetricsToSum.forEach(m => totals[m] = 0);
    
    // Sum metrics from each row (only once per metric)
    rows.forEach(row => {
      allMetricsToSum.forEach(metric => {
        totals[metric] += row.metrics[metric] || 0;
      });
    });
    
    // Calculate formula metrics
    const formulaValues = calculateFormulaMetrics(totals);
    safeMetrics.forEach(metric => {
      if (FORMULA_METRICS.includes(metric)) {
        totals[metric] = formulaValues[metric] || 0;
      }
    });
    
    return totals;
  };
  
  // Calculate percentage change between current and comparison values
  const calculatePercentChange = (current: number, comparison: number): number | null => {
    if (comparison === 0) return current > 0 ? 100 : null;
    return ((current - comparison) / Math.abs(comparison)) * 100;
  };
  
  // Get comparison data for a report
  const getComparisonMetrics = (reportId: string, tab: DateTab): Record<string, number> | null => {
    if (comparisonType === "none") return null;
    
    const comparisonData = comparisonType === "previous_period" 
      ? data.comparison_previous_period 
      : data.comparison_previous_year;
    
    if (!comparisonData) return null;
    
    const reportData = comparisonData[tab]?.find(r => r.reportId === reportId);
    return reportData?.metrics || null;
  };
  
  // Render metric cell with optional comparison
  const renderMetricCell = (
    currentValue: number, 
    metric: string, 
    comparisonMetrics: Record<string, number> | null,
    isTotal: boolean = false
  ) => {
    const formattedValue = formatMetricValue(metric, currentValue);
    
    if (comparisonType === "none" || !comparisonMetrics) {
      return <span>{formattedValue}</span>;
    }
    
    const comparisonValue = comparisonMetrics[metric] || 0;
    const percentChange = calculatePercentChange(currentValue, comparisonValue);
    
    // Determine if increase is good or bad based on metric
    const lowerMetric = metric.toLowerCase();
    const isInverseMetric = lowerMetric === 'cost' || lowerMetric === 'cpc' || lowerMetric === 'cost of sale' || lowerMetric === 'cos';
    const isPositive = percentChange !== null && (isInverseMetric ? percentChange < 0 : percentChange > 0);
    const isNegative = percentChange !== null && (isInverseMetric ? percentChange > 0 : percentChange < 0);
    
    return (
      <div className="flex flex-col items-end">
        <span>{formattedValue}</span>
        {percentChange !== null && (
          <span className={`text-xs ${isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-muted-foreground'}`}>
            {percentChange > 0 ? '+' : ''}{percentChange.toFixed(1)}%
          </span>
        )}
      </div>
    );
  };

  // For specific month tabs, we need to calculate data on the fly
  // For mtd/ytd, use cached data
  const isSpecificMonth = activeTab.match(/^\d{4}-\d{2}$/);
  
  // Get the tab data - for specific months, use last_month data as fallback or empty
  const getTabData = (): ReportMetrics[] => {
    if (isSpecificMonth) {
      // For specific months, we'd need to recalculate - for now, return empty
      // The data will be loaded when the component re-renders with new cached data
      return data.last_month || data.mtd || [];
    }
    return (data[activeTab] as ReportMetrics[]) || [];
  };
  
  const tabData = getTabData();
  const totals = calculateTotals(tabData);
  
  // Get comparison totals
  const comparisonData = comparisonType === "previous_period" 
    ? data.comparison_previous_period?.[activeTab as keyof typeof data.comparison_previous_period]
    : comparisonType === "previous_year"
    ? data.comparison_previous_year?.[activeTab as keyof typeof data.comparison_previous_year]
    : null;
  const comparisonTotals = (comparisonData && Array.isArray(comparisonData)) ? calculateTotals(comparisonData) : null;

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-end mb-4">
        <Select value={comparisonType} onValueChange={(v) => setComparisonType(v as ComparisonType)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Comparison" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border z-50">
            <SelectItem value="none">No Comparison</SelectItem>
            <SelectItem value="previous_period">vs Previous Period</SelectItem>
            <SelectItem value="previous_year">vs Previous Year</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-6">
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
              {tabData.map((reportData, idx) => {
                const comparisonMetrics = getComparisonMetrics(reportData.reportId, activeTab);
                return (
                  <TableRow
                          key={reportData.reportId}
                          className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}
                        >
                          <TableCell className="font-medium">
                            {reportData.reportName}
                          </TableCell>
                          {safeMetrics.map((metric) => (
                            <TableCell key={metric} className="text-right tabular-nums">
                              {renderMetricCell(reportData.metrics[metric] || 0, metric, comparisonMetrics)}
                            </TableCell>
                          ))}
                        </TableRow>
                      );
                    })}
                    {/* Total Row */}
                    <TableRow className="bg-muted font-semibold border-t-2">
                      <TableCell>Total</TableCell>
                      {safeMetrics.map((metric) => (
                        <TableCell key={metric} className="text-right tabular-nums">
                          {renderMetricCell(totals[metric] || 0, metric, comparisonTotals, true)}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableBody>
                </Table>
                {data.table_insights?.summary?.[activeTab] && (
                  <div className="bg-muted/30 rounded-b-lg p-3 border-t border-border/50">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
                      <Sparkles className="h-3 w-3" />
                      Insights
                    </div>
                    <FormatAIInsights text={data.table_insights.summary[activeTab]} />
                  </div>
                )}
              </div>
              
              {/* Combined Date Breakdown Table */}
              {combinedDateBreakdown[activeTab] && combinedDateBreakdown[activeTab].length > 0 && (
                <div className="space-y-4">
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-primary/5 px-4 py-2 border-b">
                      <h4 className="font-semibold text-sm">Results By {activeTab === 'ytd' ? 'Month' : 'Week'}</h4>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="font-medium w-[200px]">{activeTab === 'ytd' ? 'Month' : 'Week'}</TableHead>
                          {safeMetrics.map((metric) => (
                            <TableHead key={metric} className="font-medium text-right text-xs">
                              {metric}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {combinedDateBreakdown[activeTab].map((row, idx) => (
                          <TableRow
                            key={row.dateGroup}
                            className={idx % 2 === 0 ? "bg-background" : "bg-muted/10"}
                          >
                            <TableCell className="font-medium text-sm">
                              {row.dateGroup}
                            </TableCell>
                            {safeMetrics.map((metric) => (
                              <TableCell key={metric} className="text-right tabular-nums text-sm">
                                {formatMetricValue(metric, row.metrics[metric] || 0)}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
              
              {/* Breakdowns */}
              {data.breakdown_data && Object.keys(data.breakdown_data).length > 0 && (
                <div className="space-y-4">
                  {Object.entries(data.breakdown_data).map(([breakdownKey, tabsData]) => {
                    const breakdownRows = tabsData?.[activeTab] || [];
                    if (breakdownRows.length === 0) return null;
                    
                    const [reportId] = breakdownKey.split('_');
                    const reportName = tabData.find(r => r.reportId === reportId)?.reportName || 'Report';
                    const dimensionName = data.breakdown_dimension_names?.[breakdownKey] || 'Group';
                    
                    return (
                      <div key={breakdownKey} className="border rounded-lg overflow-hidden">
                        <div className="bg-primary/5 px-4 py-2 border-b">
                          <h4 className="font-semibold text-sm">{reportName} - {dimensionName}</h4>
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-muted/30">
                              <TableHead className="font-medium w-[200px]">{dimensionName}</TableHead>
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
                          </TableBody>
                        </Table>
                      </div>
                    );
                  })}
                </div>
              )}
              
              {/* Executive Summary */}
              {data.executive_summaries?.[activeTab] && (
                <div className="border rounded-lg overflow-hidden bg-background">
                  <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold">Executive Summary</h3>
                  </div>
                  <div className="p-6 bg-background">
                    <FormattedAISummary summary={data.executive_summaries[activeTab]} />
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      };
