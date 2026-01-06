import React, { useState, useMemo, useCallback, useEffect, useTransition } from "react";
import { useQuery } from "@tanstack/react-query";
import { LoadingTransition } from "@/components/ui/loading-transition";
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
import { Loader2, Sparkles, ArrowUp, ArrowDown, Minus, ArrowUpDown, ChevronUp, ChevronDown, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Bar, BarChart, LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, LabelList, Cell, CartesianGrid, Legend } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import FormattedAISummary from "@/components/FormattedAISummary";
import { useAISummaryRawData, type RawSourceData } from "@/hooks/useAISummaryData";
import { extractMultipleDimensionValues } from "@/lib/filters/extractDimensionValues";
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
  subDays,
  eachDayOfInterval,
  subWeeks,
  eachWeekOfInterval,
  differenceInDays,
} from "date-fns";
import { supabase } from "@/integrations/supabase/client";

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
  // Monthly data stored by key like "2025-01", "2025-02", etc.
  monthly_data?: Record<string, ReportMetrics[]>;
  breakdown_data?: Record<string, Record<string, BreakdownRow[]>>;
  breakdown_dimension_names?: Record<string, string>;
  date_breakdown_data?: Record<string, Record<string, DateBreakdownRow[]>>;
  combined_date_breakdown?: Record<string, DateBreakdownRow[]>;
  table_insights?: TableInsights;
  executive_summaries?: ExecutiveSummaries;
  // Actual data date ranges per report (stored during refresh)
  actual_data_ranges?: Record<string, { reportName: string; firstDate: string | null; lastDate: string | null }>;
  comparison_previous_period?: {
    last_month?: ReportMetrics[];
    mtd?: ReportMetrics[];
    ytd?: ReportMetrics[];
    monthly_data?: Record<string, ReportMetrics[]>;
    breakdown_data?: Record<string, Record<string, BreakdownRow[]>>;
  };
  comparison_previous_year?: {
    last_month?: ReportMetrics[];
    mtd?: ReportMetrics[];
    ytd?: ReportMetrics[];
    monthly_data?: Record<string, ReportMetrics[]>;
    breakdown_data?: Record<string, Record<string, BreakdownRow[]>>;
  };
}

interface AISummaryPivotTableProps {
  cardId?: string; // Used for React Query caching
  reportIds: string[];
  selectedMetrics: string[];
  accountId?: string;
  cachedPivotData?: CachedPivotData | null;
  reportConfigs?: Record<string, any>;
  selectedTab?: DateTab;
  onTabChange?: (tab: DateTab) => void;
  selectedReportTab?: ReportTab;
  onReportTabChange?: (tab: ReportTab) => void;
  dateOptions?: { value: string; label: string }[];
  selectedDatePeriod?: string;
  onDatePeriodChange?: (period: string) => void;
  hideOverviewAndBudget?: boolean; // Hide Overview and Budget tabs (for All Reports view)
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
export const getDateRange = (tab: DateTab, targetYear?: number): { start: Date; end: Date } => {
  const now = new Date();
  const year = targetYear || now.getFullYear();
  const isCurrentYear = year === now.getFullYear();
  
  // Handle specific month keys like "2025-11"
  if (tab.match(/^\d{4}-\d{2}$/)) {
    const [monthYear, month] = tab.split('-').map(Number);
    const monthDate = new Date(monthYear, month - 1, 1);
    return {
      start: startOfMonth(monthDate),
      end: endOfMonth(monthDate),
    };
  }
  
  switch (tab) {
    case "last_month":
      // For selected year, last month is December of that year (unless current year)
      if (isCurrentYear) {
        const lastMonth = subMonths(now, 1);
        return {
          start: startOfMonth(lastMonth),
          end: endOfMonth(lastMonth),
        };
      } else {
        const lastMonth = new Date(year, 11, 1); // December
        return {
          start: startOfMonth(lastMonth),
          end: endOfMonth(lastMonth),
        };
      }
    case "mtd":
      // For selected year: if current year, use current date; otherwise use end of year
      if (isCurrentYear) {
        return {
          start: startOfMonth(now),
          end: now,
        };
      } else {
        // For past years, show December (full month)
        const dec = new Date(year, 11, 1);
        return {
          start: startOfMonth(dec),
          end: endOfMonth(dec),
        };
      }
    case "ytd":
      // For selected year: Jan 1 to now (current year) or Jan 1 to Dec 31 (past years)
      if (isCurrentYear) {
        return {
          start: startOfYear(now),
          end: now,
        };
      } else {
        return {
          start: new Date(year, 0, 1),
          end: new Date(year, 11, 31),
        };
      }
    default:
      // Fallback to MTD logic
      if (isCurrentYear) {
        return {
          start: startOfMonth(now),
          end: now,
        };
      } else {
        const dec = new Date(year, 11, 1);
        return {
          start: startOfMonth(dec),
          end: endOfMonth(dec),
        };
      }
  }
};

// Get comparison date range based on comparison type
// Uses YTD-style comparison: same day of month/year for accurate comparison
export const getComparisonDateRange = (
  tab: DateTab, 
  comparisonType: ComparisonType,
  targetYear?: number
): { start: Date; end: Date } | null => {
  if (comparisonType === "none") return null;
  
  const currentRange = getDateRange(tab, targetYear);
  const now = new Date();
  const year = targetYear || now.getFullYear();
  const isCurrentYear = year === now.getFullYear();
  
  // Handle specific month tabs (e.g., "2025-11")
  const isSpecificMonth = tab.match(/^\d{4}-\d{2}$/);
  
  if (comparisonType === "previous_period") {
    // Previous period = same day range in the previous month/period
    if (isSpecificMonth) {
      // For specific months, compare to the previous month
      const [monthYear, month] = tab.split('-').map(Number);
      const monthDate = new Date(monthYear, month - 1, 1);
      const prevMonth = subMonths(monthDate, 1);
      return {
        start: startOfMonth(prevMonth),
        end: endOfMonth(prevMonth),
      };
    }
    
    switch (tab) {
      case "last_month": {
        // Compare to 2 months ago (full month)
        if (isCurrentYear) {
          const twoMonthsAgo = subMonths(now, 2);
          return {
            start: startOfMonth(twoMonthsAgo),
            end: endOfMonth(twoMonthsAgo),
          };
        } else {
          // For past years, compare December to November
          const nov = new Date(year, 10, 1);
          return {
            start: startOfMonth(nov),
            end: endOfMonth(nov),
          };
        }
      }
      case "mtd": {
        // Compare to same day of previous month (e.g., Dec 1-8 vs Nov 1-8)
        if (isCurrentYear) {
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
        } else {
          // For past years, compare December to November
          const nov = new Date(year, 10, 1);
          return {
            start: startOfMonth(nov),
            end: endOfMonth(nov),
          };
        }
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
const FORMULA_METRICS = ['CTR', 'ROAS', 'Conversion rate', 'CPC', 'Cost of sale', 'COS'];

// Base metrics needed for formula calculations (including alternatives like Bookings)
const BASE_METRICS = ['Impressions', 'Clicks', 'Cost', 'Revenue', 'Conversions', 'Bookings'];

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

// Tab for selecting which report to view
export type ReportTab = "overview" | string; // "overview" or reportId

export const AISummaryPivotTable: React.FC<AISummaryPivotTableProps> = ({
  cardId,
  reportIds,
  selectedMetrics,
  accountId,
  cachedPivotData,
  reportConfigs,
  selectedTab,
  onTabChange,
  selectedReportTab,
  onReportTabChange,
  dateOptions = [],
  selectedDatePeriod,
  onDatePeriodChange,
  hideOverviewAndBudget = false,
}) => {
  const [internalTab, setInternalTab] = useState<DateTab>("mtd");
  const activeTab = selectedTab || internalTab;
  
  // Use transition for non-blocking tab switches
  const [isPending, startTransition] = useTransition();
  
  // Report tab state - MUST be declared here before any early returns (Rules of Hooks)
  const [internalReportTab, setInternalReportTab] = useState<ReportTab>("overview");
  
  // For All Reports view (hideOverviewAndBudget), use first report as default if overview is selected
  const activeReportTab = useMemo(() => {
    const current = selectedReportTab || internalReportTab;
    // If in All Reports mode and current tab is "overview", use first report ID
    if (hideOverviewAndBudget && current === "overview" && reportIds.length > 0) {
      return reportIds[0];
    }
    return current;
  }, [selectedReportTab, internalReportTab, hideOverviewAndBudget, reportIds]);
  
  const handleTabChange = (tab: DateTab) => {
    startTransition(() => {
      if (onTabChange) {
        onTabChange(tab);
      } else {
        setInternalTab(tab);
      }
    });
  };
  
  const handleReportTabChange = (tab: ReportTab) => {
    startTransition(() => {
      if (onReportTabChange) {
        onReportTabChange(tab);
      } else {
        setInternalReportTab(tab);
      }
    });
  };
  
  const [comparisonType, setComparisonType] = useState<ComparisonType>("none");
  
  // Year selector state - defaults to current year
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  
  // State for Day/Week tabs in unified table (applies to all reports)
  const [unifiedTableViewTab, setUnifiedTableViewTab] = useState<"day" | "week">("day");
  
  // chartPeriod state removed - no longer needed
  
  // State for filter values (dimensionId -> selected values)
  const [filterValues, setFilterValues] = useState<Record<string, string[]>>({});
  
  // State for active breakdown sub-tab (per report tab)
  const [activeBreakdownTab, setActiveBreakdownTab] = useState<Record<string, string | null>>({});
  
  // Reset period selection when year changes to pick latest available option (December)
  React.useEffect(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const isCurrentYear = selectedYear === currentYear;
    
    // Set default period for the selected year
    let newPeriod: string;
    if (isCurrentYear) {
      // Current year: default to current month (using actual month key)
      newPeriod = format(now, "yyyy-MM");
    } else {
      // Past year: default to December of that year (latest month)
      newPeriod = format(new Date(selectedYear, 11, 1), "yyyy-MM");
    }
    
    // Update both the tab and the date period
    handleTabChange(newPeriod as DateTab);
    if (onDatePeriodChange) {
      onDatePeriodChange(newPeriod);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear]);
  
  // Use React Query for cached raw source data - persists across tab switches
  // Always fetch fresh data from sources (previous way of loading)
  const { data: rawSourceData = {}, isLoading: isLoadingRawData, isError, error, refetch } = useAISummaryRawData(
    cardId || reportIds.join('-'), // Use cardId or fallback to joined reportIds
    reportIds,
    accountId,
    { enabled: reportIds.length > 0 }
  );
  
  // Compute if data is ready
  const reportsLoaded = Object.keys(rawSourceData).length > 0;
  
  // Build merged metric map for dimension ID resolution - CACHED for instant loading
  // Cache key includes reportIds so switching tabs uses cached map
  const metricMapCacheKey = useMemo(() => ['metric-map', ...reportIds.sort()], [reportIds]);
  
  const { data: mergedMetricMap = {} } = useQuery({
    queryKey: metricMapCacheKey,
    queryFn: async () => {
      if (reportIds.length === 0) return {};
      const map: Record<string, string> = {};
      
      // Fetch all data sources in parallel for speed
      const fetchPromises = reportIds.map(async (reportId) => {
        const { data: dsData } = await supabase
          .from("data_sources")
          .select("column_mappings")
          .eq("report_id", reportId)
          .limit(1)
          .maybeSingle();
        return { reportId, columnMappings: Array.isArray(dsData?.column_mappings) ? dsData!.column_mappings : [] };
      });
      
      const results = await Promise.all(fetchPromises);
      results.forEach(({ columnMappings }) => {
        columnMappings.forEach((m: any) => {
          if (m.dimensionName && m.dimensionId && m.dimensionId !== 'none') {
            map[m.dimensionName] = m.dimensionId;
          }
        });
      });
      return map;
    },
    enabled: reportIds.length > 0,
    staleTime: 30 * 60 * 1000, // 30 minutes - column mappings rarely change
    gcTime: 60 * 60 * 1000, // 1 hour
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Use cached data for instant loading
    refetchOnReconnect: false,
    placeholderData: (prev) => prev, // Show previous data instantly
  });

  // Extract filter configs from reportConfigs - MUST be before data useMemo
  const filterConfigs = useMemo(() => {
    return reportConfigs?.filter_configs || {};
  }, [reportConfigs]);

  // Fetch dimension names for filter dimensions - state for getDimensionFilterForReport
  const [filterDimensionNames, setFilterDimensionNames] = useState<Record<string, string>>({});
  
  // Helper to get dimension filter for a specific report - MUST be before data useMemo
  const getDimensionFilterForReport = useCallback((reportId: string) => {
    if (reportId === "overview") return undefined;
    const filterConfig = filterConfigs[reportId];
    if (!filterConfig?.filterDimensionIds || filterConfig.filterDimensionIds.length === 0) return undefined;
    
    // Apply filters for the first filter dimension (can be extended to support multiple)
    const firstFilterDimId = filterConfig.filterDimensionIds[0];
    const filterValuesForDim = filterValues[firstFilterDimId] || [];
    if (filterValuesForDim.length === 0) return undefined;
    
    const dimName = filterDimensionNames[firstFilterDimId] || firstFilterDimId;
    return {
      dimensionId: firstFilterDimId,
      dimensionName: dimName,
      values: filterValuesForDim,
    };
  }, [filterConfigs, filterValues, filterDimensionNames]);

  // Stable filter key that only changes when filter VALUES change, not on every render
  const filterValuesKey = useMemo(() => JSON.stringify(filterValues), [filterValues]);
  
  // Cache computed pivot data with React Query for instant tab switching
  // This prevents heavy recalculation on every tab switch - data is computed once and cached
  const computedDataQueryKey = useMemo(() => 
    ['computed-pivot-data', cardId || reportIds.join('-'), selectedYear, filterValuesKey, selectedMetrics.sort().join(',')],
    [cardId, reportIds, selectedYear, filterValuesKey, selectedMetrics]
  );
  
  const { data: computedPivotData } = useQuery({
    queryKey: computedDataQueryKey,
    queryFn: (): CachedPivotData => {
      console.log('[PIVOT] Computing data for year:', selectedYear);
      const startTime = performance.now();
      
      const dateRanges = {
        mtd: getDateRange("mtd", selectedYear),
        ytd: getDateRange("ytd", selectedYear),
      };
      
      // Generate month keys for the selected year
      const now = new Date();
      const isCurrentYear = selectedYear === now.getFullYear();
      // For current year, go up to current month; for past years, include all 12 months
      const maxMonth = isCurrentYear ? now.getMonth() : 11; // 0-indexed
      const monthKeys: string[] = [];
      for (let m = 0; m <= maxMonth; m++) {
        monthKeys.push(format(new Date(selectedYear, m, 1), "yyyy-MM"));
      }
      
      const newData: CachedPivotData = { 
        mtd: [], 
        ytd: [],
        monthly_data: {}
      };
      
      // Initialize monthly_data for each month
      monthKeys.forEach(monthKey => {
        newData.monthly_data![monthKey] = [];
      });
      
      // Compute metrics for each report
      for (const reportId of reportIds) {
        const reportData = rawSourceData[reportId];
        if (!reportData) continue;
        
        // Get dimension filter for this report (using parsed filterValues from key)
        const parsedFilters = JSON.parse(filterValuesKey) as Record<string, string[]>;
        let dimensionFilter: { dimensionId: string; dimensionName?: string; values: string[] } | undefined;
        
        if (reportId !== "overview") {
          const filterConfig = filterConfigs[reportId];
          if (filterConfig?.filterDimensionIds && filterConfig.filterDimensionIds.length > 0) {
            const firstFilterDimId = filterConfig.filterDimensionIds[0];
            const filterValuesForDim = parsedFilters[firstFilterDimId] || [];
            if (filterValuesForDim.length > 0) {
              const dimName = filterDimensionNames[firstFilterDimId] || firstFilterDimId;
              dimensionFilter = {
                dimensionId: firstFilterDimId,
                dimensionName: dimName,
                values: filterValuesForDim,
              };
            }
          }
        }
        
        // Compute MTD and YTD - now passing mergedMetricMap for dimension ID resolution
        (["mtd", "ytd"] as const).forEach((tab) => {
          const metrics = aggregateMetrics(
            reportData.rows,
            selectedMetrics,
            dateRanges[tab],
            dimensionFilter, // apply dimension filter if configured
            mergedMetricMap // pass mapping for ID-based lookup
          );
          newData[tab].push({
            reportId: reportId,
            reportName: reportData.reportName,
            metrics,
          });
        });
        
        // Compute monthly data - now passing mergedMetricMap
        monthKeys.forEach((monthKey) => {
          const monthRange = getDateRange(monthKey, selectedYear);
          const metrics = aggregateMetrics(
            reportData.rows,
            selectedMetrics,
            monthRange,
            dimensionFilter, // apply dimension filter if configured
            mergedMetricMap // pass mapping for ID-based lookup
          );
          newData.monthly_data![monthKey].push({
            reportId: reportId,
            reportName: reportData.reportName,
            metrics,
          });
        });
      }
      
      console.log('[PIVOT] Data computed in', Math.round(performance.now() - startTime), 'ms');
      return newData;
    },
    enabled: reportsLoaded && Object.keys(mergedMetricMap).length > 0,
    staleTime: 30 * 60 * 1000, // 30 minutes - matching Budget tab
    gcTime: 60 * 60 * 1000, // 1 hour
    refetchOnWindowFocus: false,
    refetchOnMount: false, // Use cached data for instant tab switching
    refetchOnReconnect: false,
    placeholderData: (prev) => prev, // Show previous data instantly
  });
  
  // Final data combines computed data with cached breakdown data
  const data: CachedPivotData = useMemo(() => {
    if (computedPivotData) {
      // Merge with cached data for breakdowns and other computed fields if available
      if (cachedPivotData) {
        return {
          ...computedPivotData,
          breakdown_data: cachedPivotData.breakdown_data,
          breakdown_dimension_names: cachedPivotData.breakdown_dimension_names,
          combined_date_breakdown: cachedPivotData.combined_date_breakdown,
          table_insights: cachedPivotData.table_insights,
          executive_summaries: cachedPivotData.executive_summaries,
          comparison_previous_period: cachedPivotData.comparison_previous_period,
          comparison_previous_year: cachedPivotData.comparison_previous_year,
        };
      }
      return computedPivotData;
    }
    
    // Fallback to cached data only if no computed data is available yet
    if (cachedPivotData) {
      return cachedPivotData;
    }
    
    return { mtd: [], ytd: [] };
  }, [computedPivotData, cachedPivotData]);
  
  // Only show loading if we have no cached data and are actively loading
  const isLoading = isLoadingRawData && Object.keys(rawSourceData).length === 0 && !cachedPivotData;

  // Early returns moved to AFTER all hooks to comply with Rules of Hooks
  // See lines below (after useEffect for filterDimensionNames)

  // Extract available years from raw source data
  const availableYears = useMemo(() => {
    const years = new Set<number>();
    const currentYear = new Date().getFullYear();
    years.add(currentYear); // Always include current year
    
    if (!reportsLoaded || Object.keys(rawSourceData).length === 0) {
      return [currentYear];
    }
    
    // Scan all rows in all reports for date values
    Object.values(rawSourceData).forEach((reportData) => {
      if (!reportData?.rows) return;
      
      reportData.rows.forEach((row: any) => {
        const rowData = row.dimension_values || row;
        
        // Try to find date value
        let dateValue: any = rowData.Date || rowData.date || rowData.Day || rowData.day;
        
        // Search for date patterns if not found by name
        if (!dateValue) {
          for (const [, val] of Object.entries(rowData)) {
            if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) {
              dateValue = val as string;
              break;
            }
          }
        }
        
        if (dateValue) {
          const parsedDate = parseDate(dateValue);
          if (parsedDate) {
            years.add(parsedDate.getFullYear());
          }
        }
      });
    });
    
    // Sort years descending (newest first)
    return Array.from(years).sort((a, b) => b - a);
  }, [rawSourceData, reportsLoaded]);

  // Generate date options dynamically based on selected year
  // Current year: Year to date, current month, previous months
  // Past years: Full year + all 12 months (December at top, January at bottom)
  const effectiveDateOptions = useMemo(() => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const isCurrentYear = selectedYear === currentYear;
    const options: { value: string; label: string }[] = [];
    
    if (isCurrentYear) {
      // Current year: show Year to date + months from current going back to January
      options.push({ value: "ytd", label: "Year to date" });
      
      let current = now;
      const yearStart = new Date(currentYear, 0, 1);
      while (current >= yearStart) {
        const monthKey = format(current, "yyyy-MM");
        // Use actual month name instead of "MTD"
        const monthLabel = format(current, "MMMM");
        options.push({ value: monthKey, label: monthLabel });
        current = subMonths(current, 1);
      }
    } else {
      // Past years: show "Full year" + all 12 months (December at top, January at bottom)
      options.push({ value: "ytd", label: "Full year" });
      for (let m = 11; m >= 0; m--) {
        const monthKey = format(new Date(selectedYear, m, 1), "yyyy-MM");
        const monthLabel = format(new Date(selectedYear, m, 1), "MMMM");
        options.push({ value: monthKey, label: monthLabel });
      }
    }
    
    return options;
  }, [selectedYear]);

  // Sorting state for tables - keyed by table identifier
  const [sortConfig, setSortConfig] = useState<Record<string, { column: string | null; direction: 'asc' | 'desc' }>>({});

  // Toggle sort for a table
  const toggleSort = useCallback((tableId: string, column: string) => {
    setSortConfig(prev => {
      const current = prev[tableId];
      if (current?.column === column) {
        // Toggle direction or clear
        if (current.direction === 'desc') {
          return { ...prev, [tableId]: { column, direction: 'asc' } };
        } else {
          return { ...prev, [tableId]: { column: null, direction: 'desc' } };
        }
      }
      // Default to descending (high to low) first
      return { ...prev, [tableId]: { column, direction: 'desc' } };
    });
  }, []);

  // Sort rows by metric
  const sortRows = useCallback(<T extends { metrics?: Record<string, number>; groupValue?: string }>(
    rows: T[], 
    tableId: string,
    getMetricValue: (row: T, metric: string) => number
  ): T[] => {
    const config = sortConfig[tableId];
    if (!config?.column) {
      // For date-based tables, show most recent first by default
      if (tableId === 'date-breakdown') {
        return [...rows].reverse();
      }
      return rows;
    }
    
    return [...rows].sort((a, b) => {
      const aVal = getMetricValue(a, config.column!);
      const bVal = getMetricValue(b, config.column!);
      return config.direction === 'desc' ? bVal - aVal : aVal - bVal;
    });
  }, [sortConfig]);

  // Render sortable header
  const renderSortableHeader = useCallback((tableId: string, metric: string) => {
    const config = sortConfig[tableId];
    const isActive = config?.column === metric;
    
    return (
      <TableHead 
        key={metric} 
        className="font-semibold text-right cursor-pointer hover:bg-muted/50 transition-colors select-none"
        onClick={() => toggleSort(tableId, metric)}
      >
        <div className="flex items-center justify-end gap-1">
          {metric}
          {isActive ? (
            config.direction === 'desc' ? (
              <ChevronDown className="h-3 w-3 text-primary" />
            ) : (
              <ChevronUp className="h-3 w-3 text-primary" />
            )
          ) : (
            <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />
          )}
        </div>
      </TableHead>
    );
  }, [sortConfig, toggleSort]);

  // Max rows before scroll
  const MAX_VISIBLE_ROWS = 10;

  // Prepare monthly chart data - full year January to December with comparisons
  // Filter by activeReportTab when not in overview mode
  // Uses selectedYear instead of current year to support past years
  const ytdChartData = useMemo(() => {
    const year = selectedYear;
    const prevYear = year - 1;
    const monthlyData: { month: string; Cost: number; Revenue: number }[] = [];
    
    // Create data for all 12 months
    for (let m = 0; m < 12; m++) {
      const monthKey = `${year}-${String(m + 1).padStart(2, '0')}`;
      
      const monthLabel = MONTH_NAMES[m].substring(0, 3); // Jan, Feb, etc.
      
      // Get current period data - filter by report if not overview
      // Always get Cost and Revenue
      let costValue = 0;
      let revenueValue = 0;
      if (cachedPivotData?.monthly_data?.[monthKey]) {
        const monthReports = cachedPivotData.monthly_data[monthKey];
        const filteredReports = activeReportTab === "overview" 
          ? monthReports 
          : monthReports.filter(r => r.reportId === activeReportTab);
        costValue = filteredReports.reduce((sum, r) => sum + (r.metrics['Cost'] || 0), 0);
        revenueValue = filteredReports.reduce((sum, r) => sum + (r.metrics['Revenue'] || 0), 0);
      }
      
      monthlyData.push({
        month: monthLabel,
        Cost: costValue,
        Revenue: revenueValue,
      });
    }
    
    return monthlyData;
  }, [cachedPivotData?.monthly_data, activeReportTab, selectedYear]);

  // aggregatedChartData removed - now using simple monthly chart inline

  // Prepare daily chart data for specific month selection (legacy - for backward compatibility)
  const dailyChartData = useMemo(() => {
    const period = selectedDatePeriod || activeTab;
    const isSpecificMonth = period.match(/^\d{4}-\d{2}$/);
    if (!isSpecificMonth) return [];

    const range = getDateRange(period as DateTab, selectedYear);
    const allDays = eachDayOfInterval({ start: range.start, end: range.end });
    const dailyData: { day: string; Cost: number; Revenue: number }[] = [];

    // Get all rows from all reports, filtered by activeReportTab
    const allRows: any[] = [];
    Object.entries(rawSourceData).forEach(([reportId, reportData]) => {
      if (reportData?.rows) {
        // Filter by activeReportTab if not overview
        if (activeReportTab === "overview" || reportId === activeReportTab) {
          allRows.push(...reportData.rows);
        }
      }
    });

    // Build data for each day
    allDays.forEach((day) => {
      const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0);
      const dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59);
      const dateRange = { start: dayStart, end: dayEnd };
      const metrics = aggregateMetrics(allRows, selectedMetrics, dateRange, undefined, mergedMetricMap);
      
      dailyData.push({
        day: format(day, 'MMM d'),
        Cost: metrics['Cost'] || 0,
        Revenue: metrics['Revenue'] || 0,
      });
    });

    return dailyData;
  }, [selectedDatePeriod, activeTab, selectedYear, rawSourceData, activeReportTab, selectedMetrics, mergedMetricMap]);

  // Note: Raw source data is now loaded via React Query hook (useAISummaryRawData)
  // which provides caching across tab switches and reconnections
  // mergedMetricMap is declared at the top (before data useMemo) for proper dependency ordering

  // Get filter dimensions for active report tab
  const activeFilterDimensions = useMemo(() => {
    if (activeReportTab === "overview") return [];
    const config = filterConfigs[activeReportTab];
    if (!config?.filterDimensionIds || config.filterDimensionIds.length === 0) return [];
    return config.filterDimensionIds;
  }, [filterConfigs, activeReportTab]);

  // Fetch unique values for filter dimensions
  const filterDimensionValues = useMemo(() => {
    if (activeFilterDimensions.length === 0) return {};
    if (activeReportTab === "overview") return {};
    
    const reportData = rawSourceData[activeReportTab];
    if (!reportData?.rows || reportData.rows.length === 0) return {};
    
    return extractMultipleDimensionValues(reportData.rows, activeFilterDimensions);
  }, [activeFilterDimensions, activeReportTab, rawSourceData]);

  // Fetch dimension names for filter dimensions - updates the state declared earlier
  useEffect(() => {
    if (activeFilterDimensions.length === 0) {
      setFilterDimensionNames({});
      return;
    }
    
    (async () => {
      const names: Record<string, string> = {};
      for (const dimId of activeFilterDimensions) {
        const { data } = await supabase
          .from("dimensions")
          .select("name")
          .eq("id", dimId)
          .single();
        if (data) names[dimId] = data.name;
      }
      setFilterDimensionNames(names);
    })();
  }, [activeFilterDimensions]);

  // Compute data for specific month tabs dynamically
  const computeDataForTab = (tab: DateTab): ReportMetrics[] => {
    // If we have pre-computed data for this tab (mtd/ytd), use it
    if (tab === 'mtd' && data.mtd?.length > 0) {
      return data.mtd;
    }
    if (tab === 'ytd' && data.ytd?.length > 0) {
      return data.ytd;
    }
    
    // Check for cached monthly data (e.g., "2025-01", "2025-02", etc.)
    if (tab.match(/^\d{4}-\d{2}$/) && data.monthly_data?.[tab]?.length > 0) {
      return data.monthly_data[tab];
    }
    
    // For specific month tabs or fallback, compute dynamically from raw data
    if (!reportsLoaded || Object.keys(rawSourceData).length === 0) {
      return [];
    }
    
    const dateRange = getDateRange(tab, selectedYear);
    const results: ReportMetrics[] = [];
    
    for (const reportId of reportIds) {
      const reportData = rawSourceData[reportId];
      if (!reportData) continue;
      
      // Get dimension filter for this report
      const dimensionFilter = getDimensionFilterForReport(reportId);
      
      const metrics = aggregateMetrics(
        reportData.rows,
        selectedMetrics,
        dateRange,
        dimensionFilter, // apply dimension filter if configured
        mergedMetricMap // pass mapping for ID-based lookup
      );
      
      results.push({
        reportId: reportId,
        reportName: reportData.reportName,
        metrics,
      });
    }
    
    return results;
  };

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

  // === ALL EARLY RETURNS - placed after all hooks to comply with Rules of Hooks ===
  
  // Show error state if query failed and we have no cached data
  if (isError && Object.keys(rawSourceData).length === 0 && !cachedPivotData) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <AlertCircle className="h-8 w-8 text-destructive mb-4" />
        <h3 className="text-lg font-semibold mb-2">Failed to Load Report Data</h3>
        <p className="text-muted-foreground text-sm mb-4 text-center max-w-md">
          {error?.message || 'An error occurred while loading data from the data sources. Please check that all data sources are properly configured.'}
        </p>
        <Button
          onClick={() => refetch()}
          variant="default"
        >
          Retry
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Allow rendering with empty data - show table structure even when no reports
  // Only return null if metrics are not selected
  if (!selectedMetrics || selectedMetrics.length === 0) {
    return null;
  }

  // Preferred metric display order - matches AVAILABLE_METRICS in AddAICardModal
  const METRIC_ORDER = [
    "Impressions",
    "Impression share",
    "Clicks",
    "CTR",
    "Conversions",
    "Conversion rate",
    "CPC",
    "Cost",
    "Revenue",
    "ROAS",
    "Cost of sale",
    "Bookings", // Custom metric fallback
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
  // Returns null when comparison is 0 (no comparison data available)
  const calculatePercentChange = (current: number, comparison: number): number | null => {
    if (comparison === 0) return null; // No comparison data - show "-" instead of misleading percentage
    return ((current - comparison) / Math.abs(comparison)) * 100;
  };
  
  // Compute comparison data dynamically for a given tab
  // For both YoY and Previous Period, we match the exact number of days each report has data for
  const computeComparisonDataForTab = (tab: DateTab, compType: ComparisonType): ReportMetrics[] => {
    if (compType === "none" || !reportsLoaded || Object.keys(rawSourceData).length === 0) {
      return [];
    }
    
    const results: ReportMetrics[] = [];
    const currentDateRange = getDateRange(tab, selectedYear);
    
    for (const reportId of reportIds) {
      const reportData = rawSourceData[reportId];
      if (!reportData) continue;
      
      let comparisonDateRange: { start: Date; end: Date } | null;
      
      // Helper to extract date from row (handles both flat and nested dimension_values)
      const getRowDate = (row: any): Date | null => {
        const rowData = row.dimension_values || row;
        let dateValue = rowData.Date || rowData.date || rowData.Day || rowData.day;
        
        // Search for date patterns if not found by name
        if (!dateValue) {
          for (const [key, val] of Object.entries(rowData)) {
            if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) {
              dateValue = val as string;
              break;
            }
          }
        }
        
        return parseDate(dateValue);
      };
      
      // Find actual data range for this report in current period
      const rowsInPeriod = reportData.rows.filter((row: any) => {
        const rowDate = getRowDate(row);
        if (!rowDate) return false;
        return rowDate >= currentDateRange.start && rowDate <= currentDateRange.end;
      });
      
      if (rowsInPeriod.length > 0) {
        // Find the actual min and max dates in the data
        const dates = rowsInPeriod
          .map((row: any) => getRowDate(row))
          .filter((d: Date | null): d is Date => d !== null)
          .sort((a: Date, b: Date) => a.getTime() - b.getTime());
        
        if (dates.length > 0) {
          const actualStart = dates[0];
          const actualEnd = dates[dates.length - 1];
          
          if (compType === "previous_year") {
            // Use the same day range from last year
            comparisonDateRange = {
              start: subYears(actualStart, 1),
              end: subYears(actualEnd, 1),
            };
          } else if (compType === "previous_period") {
            // Use the same number of days from previous month
            // Calculate the day-of-month range and apply to previous month
            const startDayOfMonth = actualStart.getDate();
            const endDayOfMonth = actualEnd.getDate();
            const prevMonthStart = subMonths(actualStart, 1);
            const prevMonthEnd = subMonths(actualEnd, 1);
            
            // Ensure we don't exceed the days in the previous month
            const prevMonthLastDay = endOfMonth(prevMonthStart).getDate();
            
            comparisonDateRange = {
              start: new Date(prevMonthStart.getFullYear(), prevMonthStart.getMonth(), Math.min(startDayOfMonth, prevMonthLastDay)),
              end: new Date(prevMonthEnd.getFullYear(), prevMonthEnd.getMonth(), Math.min(endDayOfMonth, prevMonthLastDay)),
            };
          } else {
            comparisonDateRange = getComparisonDateRange(tab, compType);
          }
        } else {
          comparisonDateRange = getComparisonDateRange(tab, compType);
        }
      } else {
        comparisonDateRange = getComparisonDateRange(tab, compType);
      }
      
      if (!comparisonDateRange) continue;
      
      const metrics = aggregateMetrics(
        reportData.rows,
        selectedMetrics,
        comparisonDateRange,
        undefined, // no dimension filter
        mergedMetricMap // pass mapping for ID-based lookup
      );
      
      results.push({
        reportId: reportId,
        reportName: reportData.reportName,
        metrics,
      });
    }
    
    return results;
  };
  
  // Get actual date ranges for display label
  const getDateRangeLabel = (tab: DateTab, compType: ComparisonType): { 
    currentLabel: string; 
    comparisonLabel: string | null;
  } => {
    const now = new Date();
    
    // Determine the period boundaries based on tab
    let periodStart: Date;
    let periodMaxEnd: Date; // Maximum theoretical end (for filtering)
    
    const isSpecificMonth = tab.match(/^\d{4}-\d{2}$/);
    if (isSpecificMonth) {
      const [year, month] = tab.split('-').map(Number);
      periodStart = new Date(year, month - 1, 1);
      periodMaxEnd = endOfMonth(periodStart);
    } else if (tab === 'last_month') {
      const lastMonth = subMonths(now, 1);
      periodStart = startOfMonth(lastMonth);
      periodMaxEnd = endOfMonth(lastMonth);
    } else if (tab === 'ytd') {
      periodStart = startOfYear(now);
      periodMaxEnd = now;
    } else {
      // MTD or default
      periodStart = startOfMonth(now);
      periodMaxEnd = now;
    }
    
    // Find the actual data range across all reports
    // First, check cached actual_data_ranges from pivot data refresh
    let actualStart: Date | null = null;
    let actualEnd: Date | null = null;
    
    if (data.actual_data_ranges && Object.keys(data.actual_data_ranges).length > 0) {
      // Use cached data ranges from pivot refresh
      for (const reportId of reportIds) {
        const rangeInfo = data.actual_data_ranges[reportId];
        if (!rangeInfo) continue;
        
        const lastDate = rangeInfo.lastDate ? new Date(rangeInfo.lastDate) : null;
        const firstDate = rangeInfo.firstDate ? new Date(rangeInfo.firstDate) : null;
        
        // For the current period, we want the latest date within the period
        if (lastDate && lastDate >= periodStart && lastDate <= periodMaxEnd) {
          if (!actualEnd || lastDate > actualEnd) actualEnd = lastDate;
        }
        if (firstDate && firstDate >= periodStart && firstDate <= periodMaxEnd) {
          if (!actualStart || firstDate < actualStart) actualStart = firstDate;
        }
        // If the last date is before the period, use the last date as the boundary
        if (lastDate && lastDate < periodMaxEnd && (!actualEnd || lastDate > actualEnd)) {
          actualEnd = lastDate > periodStart ? lastDate : null;
        }
      }
    }
    
    // Fallback to raw source data if no cached ranges
    if (!actualStart || !actualEnd) {
      if (reportsLoaded && Object.keys(rawSourceData).length > 0) {
        for (const reportId of reportIds) {
          const reportData = rawSourceData[reportId];
          if (!reportData) continue;
          
          // Get all dates from the data and filter to the period
          const datesInPeriod = reportData.rows
            .map((row: any) => parseDate(row.Date || row.date))
            .filter((d: Date | null): d is Date => {
              if (!d) return false;
              return d >= periodStart && d <= periodMaxEnd;
            })
            .sort((a: Date, b: Date) => a.getTime() - b.getTime());
          
          if (datesInPeriod.length > 0) {
            const firstDate = datesInPeriod[0];
            const lastDate = datesInPeriod[datesInPeriod.length - 1];
            
            if (!actualStart || firstDate < actualStart) actualStart = firstDate;
            if (!actualEnd || lastDate > actualEnd) actualEnd = lastDate;
          }
        }
      }
    }
    
    // Use actual dates if found, otherwise fall back to period boundaries
    // For MTD/YTD, cap the end at today (now) if no actual data
    const effectiveStart = actualStart || periodStart;
    const effectiveEnd = actualEnd || (tab === 'mtd' || tab === 'ytd' ? now : periodMaxEnd);
    
    // Get period label from effectiveDateOptions
    const periodLabel = effectiveDateOptions.find(o => o.value === tab)?.label || tab.toUpperCase();
    const currentDateStr = `${format(effectiveStart, 'MMM d')} - ${format(effectiveEnd, 'MMM d, yyyy')}`;
    const currentLabel = `${periodLabel} (${currentDateStr})`;
    
    if (compType === "none") {
      return { currentLabel, comparisonLabel: null };
    }
    
    // Calculate comparison date range based on actual dates found
    let compStart: Date;
    let compEnd: Date;
    
    if (compType === "previous_year") {
      compStart = subYears(effectiveStart, 1);
      compEnd = subYears(effectiveEnd, 1);
    } else {
      // previous_period: use same day range in previous month
      const startDayOfMonth = effectiveStart.getDate();
      const endDayOfMonth = effectiveEnd.getDate();
      const prevMonthStart = subMonths(effectiveStart, 1);
      const prevMonthLastDay = endOfMonth(prevMonthStart).getDate();
      
      compStart = new Date(prevMonthStart.getFullYear(), prevMonthStart.getMonth(), Math.min(startDayOfMonth, prevMonthLastDay));
      compEnd = new Date(subMonths(effectiveEnd, 1).getFullYear(), subMonths(effectiveEnd, 1).getMonth(), Math.min(endDayOfMonth, prevMonthLastDay));
    }
    
    const compDateStr = `${format(compStart, 'MMM d')} - ${format(compEnd, 'MMM d, yyyy')}`;
    const compLabel = compType === "previous_year" 
      ? `Previous Year (${compDateStr})`
      : `Previous Period (${compDateStr})`;
    
    return { currentLabel, comparisonLabel: compLabel };
  };

  // Get comparison data for a report
  const getComparisonMetrics = (reportId: string, tab: DateTab): Record<string, number> | null => {
    if (comparisonType === "none") return null;
    
    const cachedComparisonData = comparisonType === "previous_period" 
      ? data.comparison_previous_period 
      : data.comparison_previous_year;
    
    if (cachedComparisonData) {
      let tabData: ReportMetrics[] | undefined;
      
      if (tab === 'mtd') {
        tabData = cachedComparisonData.mtd;
      } else if (tab === 'ytd') {
        tabData = cachedComparisonData.ytd;
      } else if (tab.match(/^\d{4}-\d{2}$/) && cachedComparisonData.monthly_data) {
        // Check for cached monthly comparison data
        tabData = cachedComparisonData.monthly_data[tab];
      }
      
      if (tabData && Array.isArray(tabData)) {
        const reportData = tabData.find((r: ReportMetrics) => r.reportId === reportId);
        if (reportData?.metrics) return reportData.metrics;
      }
    }
    
    // Compute dynamically as fallback
    const dynamicComparisonData = computeComparisonDataForTab(tab, comparisonType);
    const reportData = dynamicComparisonData.find(r => r.reportId === reportId);
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
        {percentChange !== null ? (
          <span className={`text-xs ${isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-muted-foreground'}`}>
            {percentChange > 0 ? '+' : ''}{percentChange.toFixed(1)}%
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">-</span>
        )}
      </div>
    );
  };

  // Get the tab data - compute dynamically for any tab
  const tabData = computeDataForTab(activeTab);
  const totals = calculateTotals(tabData);
  
  // Get comparison totals - compute dynamically
  const comparisonTabData = computeComparisonDataForTab(activeTab, comparisonType);
  const comparisonTotals = comparisonTabData.length > 0 ? calculateTotals(comparisonTabData) : null;

  // Get list of reports with names for tabs
  const reportTabsList = tabData.map(r => ({ id: r.reportId, name: r.reportName }));
  
  // Filter data based on active report tab
  const filteredTabData = activeReportTab === "overview" 
    ? tabData 
    : tabData.filter(r => r.reportId === activeReportTab);
  
  const filteredTotals = activeReportTab === "overview"
    ? totals
    : calculateTotals(filteredTabData);
  
  const filteredComparisonTotals = activeReportTab === "overview"
    ? comparisonTotals
    : comparisonTabData.length > 0 
      ? calculateTotals(comparisonTabData.filter(r => r.reportId === activeReportTab))
      : null;

  // Note: No loading overlay on tab switch - data is cached via React Query for instant loading
  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-between gap-3 mb-4">
          {/* Report Tabs - show different variants based on hideOverviewAndBudget */}
          {hideOverviewAndBudget ? (
            /* All Reports view: show only report tabs without Overview/Budget */
            <Tabs value={activeReportTab} onValueChange={(value) => handleReportTabChange(value as ReportTab)} className="w-auto">
              <TabsList>
                {reportTabsList.map((report) => (
                  <TabsTrigger key={report.id} value={report.id}>
                    {report.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          ) : (
            /* Regular view: show Overview + reports + Budget */
            <Tabs value={activeReportTab} onValueChange={(value) => handleReportTabChange(value as ReportTab)} className="w-auto">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                {reportTabsList.map((report) => (
                  <TabsTrigger key={report.id} value={report.id}>
                    {report.name}
                  </TabsTrigger>
                ))}
                <TabsTrigger value="budget">Budget</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          <div className="flex items-center gap-3">
          {/* Filter Dropdowns - before Date dropdown */}
          {activeFilterDimensions.map((dimId) => {
            const dimName = filterDimensionNames[dimId] || dimId;
            const values = filterDimensionValues[dimId] || [];
            const selectedValues = filterValues[dimId] || [];
            
            return (
              <Select
                key={dimId}
                value={selectedValues.length > 0 ? selectedValues[0] : "all"}
                onValueChange={(value) => {
                  setFilterValues(prev => ({
                    ...prev,
                    [dimId]: value === "all" ? [] : [value],
                  }));
                }}
              >
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder={dimName} />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border z-50">
                  <SelectItem value="all">All {dimName}</SelectItem>
                  {values.map((value) => (
                    <SelectItem key={value} value={value}>
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          })}
          
          {/* Year Selector */}
          {availableYears.length > 0 && (
            <Select 
              value={selectedYear.toString()} 
              onValueChange={(v) => startTransition(() => setSelectedYear(parseInt(v, 10)))}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border z-50">
                {availableYears.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          
          {/* Single Date Period Select - uses dynamically generated options based on selected year */}
          {effectiveDateOptions.length > 0 && (
            <Select 
              value={selectedDatePeriod || activeTab} 
              onValueChange={(v) => {
                if (onDatePeriodChange) {
                  onDatePeriodChange(v);
                }
                handleTabChange(v as DateTab);
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Select date" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border z-50">
                {effectiveDateOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          
          {/* Comparison Filter */}
          <Select value={comparisonType} onValueChange={(v) => startTransition(() => setComparisonType(v as ComparisonType))}>
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
        </div>

        {/* KPI Cards Grid */}
        {(() => {
        const period = selectedDatePeriod || activeTab;
        const periodData = computeDataForTab(period as DateTab);
        
        // Filter by active report tab
        const filteredData = activeReportTab === "overview" 
          ? periodData 
          : periodData.filter(r => r.reportId === activeReportTab);
        
        // Calculate totals for KPI cards
        const kpiTotals = calculateTotals(filteredData);
        
        // Get comparison data for KPI cards
        let kpiComparisonTotals: Record<string, number> | null = null;
        if (comparisonType !== "none") {
          const cachedComparisonData = comparisonType === "previous_period" 
            ? data.comparison_previous_period 
            : data.comparison_previous_year;
          
          let comparisonData: ReportMetrics[] = [];
          if (cachedComparisonData) {
            if (period === 'mtd' && cachedComparisonData.mtd) {
              comparisonData = cachedComparisonData.mtd;
            } else if (period === 'ytd' && cachedComparisonData.ytd) {
              comparisonData = cachedComparisonData.ytd;
            } else if (period.match(/^\d{4}-\d{2}$/) && cachedComparisonData.monthly_data?.[period]) {
              comparisonData = cachedComparisonData.monthly_data[period];
            }
          }
          
          if (comparisonData.length === 0) {
            comparisonData = computeComparisonDataForTab(period as DateTab, comparisonType);
          }
          
          const filteredComparisonData = activeReportTab === "overview"
            ? comparisonData
            : comparisonData.filter(r => r.reportId === activeReportTab);
          
          kpiComparisonTotals = filteredComparisonData.length > 0 ? calculateTotals(filteredComparisonData) : null;
        }
        
        // Split metrics into two rows of 5
        const topRowMetrics = safeMetrics.slice(0, 5);
        const bottomRowMetrics = safeMetrics.slice(5, 10);
        
        const renderKPICard = (metric: string) => {
          const value = kpiTotals[metric] || 0;
          const formattedValue = formatMetricValue(metric, value);
          
          // Calculate percentage change
          const compValue = kpiComparisonTotals?.[metric] || 0;
          const percentChange = calculatePercentChange(value, compValue);
          
          // Determine if increase is good or bad
          const lowerMetric = metric.toLowerCase();
          const isInverseMetric = lowerMetric === 'cost' || lowerMetric === 'cpc' || lowerMetric === 'cost of sale' || lowerMetric === 'cos';
          const isPositive = percentChange !== null && (isInverseMetric ? percentChange < 0 : percentChange > 0);
          const isNegative = percentChange !== null && (isInverseMetric ? percentChange > 0 : percentChange < 0);
          
          return (
            <Card key={metric} className="bg-background border">
              <CardContent className="p-4">
                <div className="text-xs font-medium text-primary uppercase tracking-wide mb-1">
                  {metric}
                </div>
                <div className="flex items-end justify-between">
                  <div className="text-2xl font-bold text-foreground">
                    {formattedValue}
                  </div>
                  {comparisonType !== "none" && percentChange !== null && (
                    <div className={`flex items-center gap-1 text-sm ${isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-muted-foreground'}`}>
                      {isPositive ? <ArrowUp className="h-3 w-3" /> : isNegative ? <ArrowDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                      <span>{Math.abs(percentChange).toFixed(1)}%</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        };
        
        return (
          <div className="space-y-3">
            {/* Top row of KPI cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {topRowMetrics.map(renderKPICard)}
            </div>
            {/* Bottom row of KPI cards */}
            {bottomRowMetrics.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {bottomRowMetrics.map(renderKPICard)}
              </div>
            )}
          </div>
        );
      })()}

      {/* Monthly Results Bar Chart - placed right after KPI cards, hidden in All Reports view */}
      {!hideOverviewAndBudget && activeReportTab === "overview" && (() => {
        // Build monthly data for the chart based on available data
        const monthlyChartData: { month: string; result: number }[] = [];
        
        // Use selectedYear instead of current year
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        months.forEach((monthLabel, monthIdx) => {
          const monthKey = `${selectedYear}-${String(monthIdx + 1).padStart(2, '0')}`;
          
          // Get data for this month from monthly_data or compute from cached data
          let monthData = data.monthly_data?.[monthKey];
          
          if (monthData && monthData.length > 0) {
            // Calculate "result" as Revenue - Cost for each month
            const totals = calculateTotals(monthData);
            const revenue = totals['Revenue'] || totals['revenue'] || 0;
            const cost = totals['Cost'] || totals['cost'] || 0;
            const result = revenue - cost;
            
            monthlyChartData.push({
              month: monthLabel,
              result,
            });
          } else {
            // Month has no data yet
            monthlyChartData.push({
              month: monthLabel,
              result: 0,
            });
          }
        });
        
        // Check if we have any actual data
        const hasChartData = monthlyChartData.some(d => d.result !== 0);
        if (!hasChartData) return null;
        
        return (
          <div className="border rounded-lg overflow-hidden">
            <div className="bg-primary/5 px-4 py-2 border-b">
              <h4 className="font-semibold text-sm">Monthly Results ({selectedYear})</h4>
            </div>
            <div className="p-4">
              <ChartContainer
                config={{
                  result: {
                    label: "Result",
                    color: "hsl(var(--primary))",
                  },
                }}
                className="h-[300px] w-full"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyChartData} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <XAxis 
                      dataKey="month" 
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(value) => {
                        if (Math.abs(value) >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
                        if (Math.abs(value) >= 1000) return `$${(value / 1000).toFixed(0)}K`;
                        return `$${value.toFixed(0)}`;
                      }}
                    />
                    <ChartTooltip 
                      content={<ChartTooltipContent />}
                      formatter={(value: any) => [
                        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value),
                        'Result'
                      ]}
                    />
                    <Bar 
                      dataKey="result" 
                      radius={[4, 4, 0, 0]}
                    >
                      {monthlyChartData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.result >= 0 ? 'hsl(var(--primary))' : 'hsl(var(--destructive))'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            </div>
          </div>
        );
      })()}

      <div className="space-y-6">
        {/* Render a table for the selected date period - ONLY on Overview tab */}
        {activeReportTab === "overview" && (() => {
          const period = selectedDatePeriod || activeTab;
          const periodData = computeDataForTab(period as DateTab);
          const periodTotals = calculateTotals(periodData);
          // Get comparison data - use cached data first, then fallback to dynamic computation
          let periodComparisonData: ReportMetrics[] = [];
          const cachedComparisonData = comparisonType === "previous_period" 
            ? data.comparison_previous_period 
            : comparisonType === "previous_year" 
              ? data.comparison_previous_year 
              : null;
          
          if (cachedComparisonData) {
            if (period === 'mtd' && cachedComparisonData.mtd) {
              periodComparisonData = cachedComparisonData.mtd;
            } else if (period === 'ytd' && cachedComparisonData.ytd) {
              periodComparisonData = cachedComparisonData.ytd;
            } else if (period.match(/^\d{4}-\d{2}$/) && cachedComparisonData.monthly_data?.[period]) {
              periodComparisonData = cachedComparisonData.monthly_data[period];
            }
          }
          
          // Fallback to dynamic computation if no cached data
          if (periodComparisonData.length === 0 && comparisonType !== "none") {
            periodComparisonData = computeComparisonDataForTab(period as DateTab, comparisonType);
          }
          
          const periodComparisonTotals = periodComparisonData.length > 0 ? calculateTotals(periodComparisonData) : null;
          
          // Get period label from effectiveDateOptions
          const periodLabel = effectiveDateOptions.find(o => o.value === period)?.label || period;
          
          // Get date range labels for display
          const dateRangeLabels = getDateRangeLabel(period as DateTab, comparisonType);
          
          return (
            <div key={period} className="border rounded-lg overflow-hidden">
              {/* Date Range Label - Always show period, conditionally show comparison */}
              <div className="px-4 py-2 bg-muted/30 border-b text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Period:</span>{" "}
                {dateRangeLabels.currentLabel}
                {comparisonType !== "none" && dateRangeLabels.comparisonLabel && (
                  <>
                    {" "}<span className="text-muted-foreground">vs</span>{" "}
                    {dateRangeLabels.comparisonLabel}
                  </>
                )}
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-muted/50">
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold min-w-[200px]">
                        Report
                      </TableHead>
                      {safeMetrics.map((metric) => renderSortableHeader('main-table', metric))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortRows(periodData, 'main-table', (row, metric) => row.metrics[metric] || 0).map((reportData, idx) => {
                      const comparisonMetrics = getComparisonMetrics(reportData.reportId, period as DateTab);
                      return (
                        <TableRow
                          key={reportData.reportId}
                          className={idx % 2 === 0 ? "bg-background" : "bg-muted/20"}
                        >
                          <TableCell className="font-medium min-w-[200px]">
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
                    {/* Total Row - only show when multiple reports */}
                    {periodData.length > 1 && (
                      <TableRow className="bg-muted font-semibold border-t-2">
                        <TableCell className="min-w-[200px]">Total</TableCell>
                        {safeMetrics.map((metric) => (
                          <TableCell key={metric} className="text-right tabular-nums">
                            {renderMetricCell(periodTotals[metric] || 0, metric, periodComparisonTotals, true)}
                          </TableCell>
                        ))}
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {data.table_insights?.summary?.[period as DateTab] && (
                <div className="bg-muted/30 rounded-b-lg p-3 border-t border-border/50">
                  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
                    <Sparkles className="h-3 w-3" />
                    Insights
                  </div>
                  <FormatAIInsights text={data.table_insights.summary[period as DateTab]} />
                </div>
              )}
            </div>
          );
        })()}
        
        {/* Combined Date Breakdown Table - for selected period in overview mode */}
        {activeReportTab === "overview" && (() => {
          const period = selectedDatePeriod || activeTab;
          let periodBreakdown = combinedDateBreakdown[period as DateTab];
          if (!periodBreakdown || periodBreakdown.length === 0) return null;
          
          // Reverse week-based breakdowns to show latest first (not month-based)
          // Only reverse if this is a week view (not ytd/month)
          const isWeekView = period !== 'ytd' && period !== 'mtd' && !period.match(/^\d{4}-\d{2}$/);
          if (isWeekView) {
            // Reverse the array to show latest week first
            periodBreakdown = [...periodBreakdown].reverse();
          }
          
          return (
            <div className="space-y-4">
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-primary/5 px-4 py-2 border-b">
                  <h4 className="font-semibold text-sm">
                    Results By {period === 'ytd' ? 'Month' : 'Week'}
                  </h4>
                </div>
                <div className="overflow-hidden">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-muted/30">
                      <TableRow className="bg-muted/30">
                        <TableHead className="font-medium w-[200px]">{period === 'ytd' ? 'Month' : 'Week'}</TableHead>
                        {safeMetrics.map((metric) => renderSortableHeader('date-breakdown', metric))}
                      </TableRow>
                    </TableHeader>
                  </Table>
                  <div className={periodBreakdown.length > MAX_VISIBLE_ROWS ? "max-h-[400px] overflow-y-auto" : ""}>
                    <Table>
                      <TableBody>
                        {sortRows(periodBreakdown, 'date-breakdown', (row, metric) => row.metrics[metric] || 0).map((row, idx) => (
                          <TableRow
                            key={row.dateGroup}
                            className={idx % 2 === 0 ? "bg-background" : "bg-muted/10"}
                          >
                            <TableCell className="font-medium text-sm w-[200px]">
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
              </div>
            </div>
          );
        })()}

        {/* Results by Week table - for individual report tabs */}
        {activeReportTab !== "overview" && (() => {
          const period = selectedDatePeriod || activeTab;
          
          // Get data for the active report tab
          const reportData = data[period as DateTab]?.find(r => r.reportId === activeReportTab);
          if (!reportData) return null;
          
          // Compute date breakdown for this specific report
          const reportId = activeReportTab;
          const reportRawData = rawSourceData[reportId];
          if (!reportRawData || !reportRawData.rows || reportRawData.rows.length === 0) return null;
          
          // Get date range for the period
          const dateRange = getDateRange(period as DateTab, selectedYear);
          
          // Group rows by week/month
          const dateGroups: Record<string, any[]> = {};
          const dateDimId = mergedMetricMap['Date'] || mergedMetricMap['date'] || mergedMetricMap['Day'];
          
          reportRawData.rows.forEach((row: any) => {
            const rowData = row.dimension_values || row;
            let dateValue: any = rowData.Date || rowData.date || rowData.Day || rowData.day;
            if (!dateValue && dateDimId) {
              dateValue = rowData[dateDimId];
            }
            if (!dateValue) {
              for (const [key, val] of Object.entries(rowData)) {
                if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) {
                  dateValue = val;
                  break;
                }
              }
            }
            
            const rowDate = parseDate(dateValue);
            if (!rowDate) return;
            if (rowDate < dateRange.start || rowDate > dateRange.end) return;
            
            const groupKey = getDateGroupKey(rowDate, period as DateTab);
            if (!dateGroups[groupKey]) {
              dateGroups[groupKey] = [];
            }
            dateGroups[groupKey].push(row);
          });
          
          // Convert to DateBreakdownRow format
          const reportDateBreakdown: DateBreakdownRow[] = [];
          Object.entries(dateGroups).forEach(([dateGroup, groupRows]) => {
            const dimensionFilter = getDimensionFilterForReport(reportId);
            const metrics = aggregateMetrics(
              groupRows,
              selectedMetrics,
              dateRange,
              dimensionFilter,
              mergedMetricMap
            );
            
            reportDateBreakdown.push({
              dateGroup,
              metrics,
            });
          });
          
          // Sort by date group
          reportDateBreakdown.sort((a, b) => a.dateGroup.localeCompare(b.dateGroup));
          
          // Reverse week-based breakdowns to show latest first (not month-based)
          const isWeekView = period !== 'ytd' && period !== 'mtd' && !period.match(/^\d{4}-\d{2}$/);
          const sortedBreakdown = isWeekView ? [...reportDateBreakdown].reverse() : reportDateBreakdown;
          
          if (sortedBreakdown.length === 0) return null;
          
          return (
            <div className="mt-6 space-y-4">
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-primary/5 px-4 py-2 border-b">
                  <h4 className="font-semibold text-sm">
                    Results By {period === 'ytd' ? 'Month' : 'Week'}
                  </h4>
                </div>
                <div className="overflow-hidden">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-muted/30">
                      <TableRow className="bg-muted/30">
                        <TableHead className="font-medium w-[200px]">{period === 'ytd' ? 'Month' : 'Week'}</TableHead>
                        {safeMetrics.map((metric) => renderSortableHeader(`report-date-breakdown-${reportId}`, metric))}
                      </TableRow>
                    </TableHeader>
                  </Table>
                  <div className={sortedBreakdown.length > MAX_VISIBLE_ROWS ? "max-h-[400px] overflow-y-auto" : ""}>
                    <Table>
                      <TableBody>
                        {sortRows(sortedBreakdown, `report-date-breakdown-${reportId}`, (row, metric) => row.metrics[metric] || 0).map((row, idx) => (
                          <TableRow
                            key={row.dateGroup}
                            className={idx % 2 === 0 ? "bg-background" : "bg-muted/10"}
                          >
                            <TableCell className="font-medium text-sm w-[200px]">
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
              </div>
            </div>
          );
        })()}

        {/* Breakdowns - only show on individual report tabs, not on overview */}
        {activeReportTab !== "overview" && data.breakdown_data && Object.keys(data.breakdown_data).length > 0 && (() => {
          const period = selectedDatePeriod || activeTab;
          
          // Extract breakdown dimensions for the active report tab
          const breakdownEntries = Object.entries(data.breakdown_data!)
            .filter(([breakdownKey]) => {
              const [reportId] = breakdownKey.split('_');
              return reportId === activeReportTab;
            });
          
          if (breakdownEntries.length === 0) return null;
          
          // Group breakdowns by dimension name and get unique dimensions
          const breakdownDimensions = breakdownEntries
            .map(([breakdownKey]) => {
              const dimensionName = data.breakdown_dimension_names?.[breakdownKey] || 'Group';
              return {
                key: breakdownKey,
                name: dimensionName,
              };
            })
            // Remove duplicates by name (in case same dimension appears multiple times)
            .filter((dim, index, self) => 
              index === self.findIndex(d => d.name === dim.name)
            );
          
          // Get current active breakdown tab for this report, default to first dimension
          const currentBreakdownTab = activeBreakdownTab[activeReportTab] || breakdownDimensions[0]?.key || null;
          
          // If only one breakdown dimension, show it directly without sub-tabs
          if (breakdownDimensions.length === 1) {
            const breakdownRows = data.breakdown_data![breakdownDimensions[0].key]?.[period as DateTab] || [];
            if (breakdownRows.length === 0) return null;
            
            const dimensionName = breakdownDimensions[0].name;
            
            return (
              <div className="mt-6">
                <div className="border rounded-lg overflow-hidden">
                  <div className="overflow-hidden">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-muted/30">
                        <TableRow className="bg-muted/30">
                          <TableHead className="font-medium w-[200px]">{dimensionName}</TableHead>
                          {safeMetrics.map((metric) => renderSortableHeader(`breakdown-${breakdownDimensions[0].key}`, metric))}
                        </TableRow>
                      </TableHeader>
                    </Table>
                    <div className={breakdownRows.length > MAX_VISIBLE_ROWS ? "max-h-[400px] overflow-y-auto" : ""}>
                      <Table>
                        <TableBody>
                          {sortRows(breakdownRows, `breakdown-${breakdownDimensions[0].key}`, (row, metric) => row.metrics[metric] || 0).map((row, idx) => (
                            <TableRow
                              key={row.groupValue}
                              className={idx % 2 === 0 ? "bg-background" : "bg-muted/10"}
                            >
                              <TableCell className="font-medium text-sm w-[200px]">
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
                  </div>
                </div>
              </div>
            );
          }
          
          // Multiple breakdown dimensions - show sub-tabs
          return (
            <div className="mt-6">
              <Tabs
                value={currentBreakdownTab || ""}
                onValueChange={(value) => {
                  setActiveBreakdownTab((prev) => ({
                    ...prev,
                    [activeReportTab]: value,
                  }));
                }}
              >
                <TabsList className="mb-4">
                  {breakdownDimensions.map((dim) => (
                    <TabsTrigger key={dim.key} value={dim.key}>
                      {dim.name}
                    </TabsTrigger>
                  ))}
                </TabsList>
                
                {breakdownDimensions.map((dim) => {
                  const breakdownRows = data.breakdown_data![dim.key]?.[period as DateTab] || [];
                  if (breakdownRows.length === 0) return null;
                  
                  return (
                    <TabsContent key={dim.key} value={dim.key}>
                      <div className="border rounded-lg overflow-hidden">
                        <div className="overflow-hidden">
                          <Table>
                            <TableHeader className="sticky top-0 z-10 bg-muted/30">
                              <TableRow className="bg-muted/30">
                                <TableHead className="font-medium w-[200px]">{dim.name}</TableHead>
                                {safeMetrics.map((metric) => renderSortableHeader(`breakdown-${dim.key}`, metric))}
                              </TableRow>
                            </TableHeader>
                          </Table>
                          <div className={breakdownRows.length > MAX_VISIBLE_ROWS ? "max-h-[400px] overflow-y-auto" : ""}>
                            <Table>
                              <TableBody>
                                {sortRows(breakdownRows, `breakdown-${dim.key}`, (row, metric) => row.metrics[metric] || 0).map((row, idx) => (
                                  <TableRow
                                    key={row.groupValue}
                                    className={idx % 2 === 0 ? "bg-background" : "bg-muted/10"}
                                  >
                                    <TableCell className="font-medium text-sm w-[200px]">
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
                        </div>
                      </div>
                    </TabsContent>
                  );
                })}
              </Tabs>
            </div>
          );
        })()}
        
        {/* Removed: Individual report weekly/monthly/last7 tables - now using unified Day/Week table above */}

        {/* Executive Summary - TEMPORARILY HIDDEN
        {activeReportTab === "overview" && (() => {
          const period = selectedDatePeriod || activeTab;
          const summaryContent = data.executive_summaries?.[period as DateTab];
          if (!summaryContent) return null;
          
          return (
            <div className="border rounded-lg overflow-hidden bg-background">
              <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">Executive Summary</h3>
              </div>
              <div className="p-6 bg-background">
                <FormattedAISummary summary={summaryContent} />
              </div>
            </div>
          );
        })()} */}
      </div>
    </div>
  );
};