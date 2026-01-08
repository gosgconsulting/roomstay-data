import React, { useState, useMemo, useCallback, useEffect, useTransition } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  hideOverviewAndBudget?: boolean; // ADDED: used to hide overview/budget UI in All Reports mode
  sinceDate?: string; // Date from which data is available (e.g., "2023-01-01")
  selectedYear?: number; // Year to filter data (e.g., 2025)
  onYearChange?: (year: number) => void; // Callback when year changes
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
      
      if (dimValue === undefined) {
        return false;
      }
      
      // Normalize both the row value and filter values for comparison (trim whitespace)
      const normalizedRowValue = String(dimValue).trim();
      const normalizedFilterValues = dimensionFilter.values.map(v => String(v).trim());
      
      if (!normalizedFilterValues.includes(normalizedRowValue)) {
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
  hideOverviewAndBudget = false, // ADDED: default to false
  sinceDate,
  selectedYear: externalSelectedYear,
  onYearChange,
}) => {
  const [internalTab, setInternalTab] = useState<DateTab>("mtd");
  const activeTab = selectedTab || internalTab;
  
  // Use transition for non-blocking tab switches
  const [, startTransition] = useTransition();
  
  const handleTabChange = (tab: DateTab) => {
    startTransition(() => {
      if (onTabChange) {
        onTabChange(tab);
      } else {
        setInternalTab(tab);
      }
    });
  };
  const [comparisonType, setComparisonType] = useState<ComparisonType>("none");
  
  // Year selector state - use external prop if provided, otherwise internal state
  const [internalSelectedYear, setInternalSelectedYear] = useState<number>(new Date().getFullYear());
  const selectedYear = externalSelectedYear ?? internalSelectedYear;
  
  const handleYearChange = (year: number) => {
    if (onYearChange) {
      onYearChange(year);
    } else {
      setInternalSelectedYear(year);
    }
  };
  
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
  
  const queryClient = useQueryClient();
  const dataCacheId = cardId || reportIds.join('-');

  // Use React Query for cached raw source data - persists across tab switches
  // Always fetch fresh data from sources (previous way of loading)
  const { data: rawSourceData = {}, isLoading: isLoadingRawData, isError, error, refetch } = useAISummaryRawData(
    dataCacheId, // Use cardId or fallback to joined reportIds
    reportIds,
    accountId,
    { enabled: reportIds.length > 0 }
  );

  // When switching to a past year, force a background refetch from the DB cache,
  // then invalidate computed pivot data for that year so it recalculates.
  useEffect(() => {
    const currentYear = new Date().getFullYear();
    if (selectedYear === currentYear) return;

    (async () => {
      await refetch();
      queryClient.invalidateQueries({
        predicate: (q) => {
          const key = q.queryKey as unknown as any[];
          return key?.[0] === 'computed-pivot-data' && key?.[1] === dataCacheId && key?.[2] === selectedYear;
        },
      });
    })();
  }, [selectedYear, refetch, queryClient, dataCacheId]);
  
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

  // Extract filter configs and breakdown configs from reportConfigs
  const filterConfigs = useMemo(() => {
    const configs = reportConfigs || {};
    // Remove breakdown_configs if it exists at the top level
    const { breakdown_configs, ...filterConfigsOnly } = configs as any;
    return filterConfigsOnly;
  }, [reportConfigs]);

  const breakdownConfigs = useMemo(() => {
    const configs = reportConfigs || {};
    return (configs as any)?.breakdown_configs || {};
  }, [reportConfigs]);

  // Fetch dimension names for filter dimensions and breakdown dimensions
  const [filterDimensionNames, setFilterDimensionNames] = useState<Record<string, string>>({});
  
  useEffect(() => {
    // Collect all dimension IDs (filter dimensions + breakdown dimensions)
    const dimIds = new Set<string>();
    
    // Add filter dimension IDs
    Object.values(filterConfigs).forEach((config: any) => {
      if (config?.dimensionId) {
        dimIds.add(config.dimensionId);
      }
    });
    
    // Add breakdown dimension IDs
    Object.values(breakdownConfigs).forEach((config: any) => {
      if (config?.breakdownDimensionIds) {
        config.breakdownDimensionIds.forEach((id: string) => dimIds.add(id));
      }
    });
    
    if (dimIds.size === 0) {
      setFilterDimensionNames({});
      return;
    }
    
    (async () => {
      const names: Record<string, string> = {};
      for (const dimId of dimIds) {
        const { data } = await supabase
          .from("dimensions")
          .select("name")
          .eq("id", dimId)
          .single();
        if (data) names[dimId] = data.name;
      }
      setFilterDimensionNames(names);
    })();
  }, [filterConfigs, breakdownConfigs]);
  
  // Helper to get dimension filter for a specific report - MUST be before data useMemo
  const getDimensionFilterForReport = useCallback((reportId: string) => {
    if (reportId === "overview") return undefined;
    const filterConfig = filterConfigs[reportId];
    if (!filterConfig?.dimensionId) return undefined;
    
    // Check if user has selected a specific filter value
    const userSelectedValues = filterValues[filterConfig.dimensionId];
    let filterValuesForDim: string[];
    
    if (userSelectedValues !== undefined) {
      // User has interacted with the filter dropdown
      if (userSelectedValues.length === 0) {
        // "All" selected - use all selectedValues from config
        filterValuesForDim = filterConfig.selectedValues || [];
      } else {
        // Specific value selected - use only that value
        filterValuesForDim = userSelectedValues;
      }
    } else {
      // No user selection yet - use all selectedValues from config (default behavior)
      filterValuesForDim = filterConfig.selectedValues || [];
    }
    
    if (filterValuesForDim.length === 0) return undefined;
    
    const dimName = filterDimensionNames[filterConfig.dimensionId] || filterConfig.dimensionId;
    return {
      dimensionId: filterConfig.dimensionId,
      dimensionName: dimName,
      values: filterValuesForDim,
    };
  }, [filterConfigs, filterValues, filterDimensionNames]);

  // Stable filter key that only changes when filter VALUES change
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
          if (filterConfig?.dimensionId) {
            // Check if user has selected a specific filter value
            const userSelectedValues = parsedFilters[filterConfig.dimensionId];
            let filterValuesForDim: string[];
            
            if (userSelectedValues !== undefined) {
              // User has interacted with the filter dropdown
              if (userSelectedValues.length === 0) {
                // "All" selected - use all selectedValues from config
                filterValuesForDim = filterConfig.selectedValues || [];
              } else {
                // Specific value selected - use only that value
                filterValuesForDim = userSelectedValues;
              }
            } else {
              // No user selection yet - use all selectedValues from config (default behavior)
              filterValuesForDim = filterConfig.selectedValues || [];
            }
            
            if (filterValuesForDim.length > 0) {
              const dimName = filterDimensionNames[filterConfig.dimensionId] || filterConfig.dimensionId;
              dimensionFilter = {
                dimensionId: filterConfig.dimensionId,
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
    staleTime: 0, // Always recompute when year/filters change - data is in memory anyway
    gcTime: 60 * 60 * 1000, // 1 hour
    refetchOnWindowFocus: false,
    refetchOnMount: true, // Recompute when query key changes (year change)
    refetchOnReconnect: false,
    // Don't use placeholderData to avoid showing stale year data
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

  // Report tab state - controlled from parent if props provided, otherwise internal
  // MUST be before early returns to maintain hook order
  const [internalReportTab, setInternalReportTab] = useState<ReportTab>("overview");
  const activeReportTab = selectedReportTab || internalReportTab;
  const handleReportTabChange = (tab: ReportTab) => {
    startTransition(() => {
      if (onReportTabChange) {
        onReportTabChange(tab);
      } else {
        setInternalReportTab(tab);
      }
    });
  };

  // Extract available years from raw source data
  // If sinceDate is provided, include all years from sinceDate to current year
  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    
    if (sinceDate) {
      try {
        const sinceDateObj = parseISO(sinceDate);
        if (isValid(sinceDateObj)) {
          const sinceYear = getYear(sinceDateObj);
          const years: number[] = [];
          // Include all years from sinceDate year to current year
          for (let year = currentYear; year >= sinceYear; year--) {
            years.push(year);
          }
          return years;
        }
      } catch (error) {
        console.warn('[AISummaryPivotTable] Invalid sinceDate:', sinceDate, error);
      }
    }
    
    // Fallback: only this year and last year
    return [currentYear, currentYear - 1];
  }, [sinceDate]);

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

  // Get filter dimension and selected values for active report tab from reportConfigs
  const activeFilterConfig = useMemo(() => {
    if (activeReportTab === "overview" || activeReportTab === "budget") return null;
    return filterConfigs[activeReportTab] || null;
  }, [filterConfigs, activeReportTab]);

  // Get available filter values - use selectedValues from config as the options
  const filterDimensionValues = useMemo(() => {
    if (!activeFilterConfig?.dimensionId || !activeFilterConfig?.selectedValues) return {};
    
    // Return the selected values from the modal as the available options
    return {
      [activeFilterConfig.dimensionId]: activeFilterConfig.selectedValues || []
    };
  }, [activeFilterConfig]);

  // Compute data for specific month tabs dynamically
  // Always compute dynamically to ensure filter is applied (don't use cached data that might not have filter)
  const computeDataForTab = (tab: DateTab): ReportMetrics[] => {
    // Always compute dynamically to ensure current filter is applied
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

  // Compute breakdown data dynamically with current filter applied
  // Memoize breakdown data per report/tab/filter combination
  const breakdownDataCache = useMemo(() => {
    const cache: Record<string, BreakdownRow[]> = {};
    
    if (!reportsLoaded) return cache;
    
    for (const reportId of reportIds) {
      if (reportId === "overview") continue;
      
      const breakdownConfig = breakdownConfigs[reportId];
      if (!breakdownConfig?.breakdownDimensionIds || breakdownConfig.breakdownDimensionIds.length === 0) {
        continue;
      }
      
      const reportData = rawSourceData[reportId];
      if (!reportData?.rows || reportData.rows.length === 0) continue;
      
      // For each date tab (mtd, ytd, and monthly)
      const tabsToCompute: DateTab[] = ['mtd', 'ytd'];
      const now = new Date();
      const isCurrentYear = selectedYear === now.getFullYear();
      const maxMonth = isCurrentYear ? now.getMonth() : 11;
      for (let m = 0; m <= maxMonth; m++) {
        tabsToCompute.push(format(new Date(selectedYear, m, 1), "yyyy-MM") as DateTab);
      }
      
      tabsToCompute.forEach((tab) => {
        const dateRange = getDateRange(tab, selectedYear);
        const dimensionFilter = getDimensionFilterForReport(reportId);
        const breakdownDimId = breakdownConfig.breakdownDimensionIds[0];
        const breakdownDimName = filterDimensionNames[breakdownDimId] || breakdownDimId;
        const cacheKey = `${reportId}_${breakdownDimId}_${tab}_${filterValuesKey}`;
        
        // Filter rows by date and dimension filter
        const filteredRows = reportData.rows.filter((row: any) => {
          const rowData = row.dimension_values || row;
          
          // Date filter
          let dateValue: any = rowData.Date || rowData.date || rowData.Day || rowData.day;
          if (!dateValue) {
            const dateDimId = mergedMetricMap['Date'] || mergedMetricMap['date'] || mergedMetricMap['Day'];
            if (dateDimId) dateValue = rowData[dateDimId];
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
          if (!rowDate || !isWithinInterval(rowDate, { start: dateRange.start, end: dateRange.end })) {
            return false;
          }
          
          // Dimension filter
          if (dimensionFilter && dimensionFilter.values.length > 0) {
            const dimValue = rowData[dimensionFilter.dimensionId] || 
                           (dimensionFilter.dimensionName ? rowData[dimensionFilter.dimensionName] : undefined);
            
            if (dimValue === undefined) {
              return false;
            }
            
            const normalizedRowValue = String(dimValue).trim();
            const normalizedFilterValues = dimensionFilter.values.map(v => String(v).trim());
            
            if (!normalizedFilterValues.includes(normalizedRowValue)) {
              return false;
            }
          }
          
          return true;
        });
        
        // Group rows by breakdown dimension value
        const groupedRows: Record<string, any[]> = {};
        filteredRows.forEach((row: any) => {
          const rowData = row.dimension_values || row;
          const breakdownValue = rowData[breakdownDimId] || 
                                (breakdownDimName ? rowData[breakdownDimName] : undefined);
          const groupKey = breakdownValue !== undefined && breakdownValue !== null && breakdownValue !== '' 
            ? String(breakdownValue).trim() 
            : 'Uncategorized';
          
          if (!groupedRows[groupKey]) {
            groupedRows[groupKey] = [];
          }
          groupedRows[groupKey].push(row);
        });
        
        // Compute metrics for each group
        const breakdownRows: BreakdownRow[] = [];
        Object.entries(groupedRows).forEach(([groupValue, groupRows]) => {
          const metrics = aggregateMetrics(
            groupRows,
            selectedMetrics,
            dateRange,
            undefined, // Already filtered above
            mergedMetricMap
          );
          
          breakdownRows.push({
            groupValue,
            metrics,
          });
        });
        
        cache[cacheKey] = breakdownRows;
      });
    }
    
    return cache;
  }, [reportsLoaded, reportIds, rawSourceData, breakdownConfigs, getDimensionFilterForReport, selectedYear, mergedMetricMap, filterDimensionNames, filterValuesKey, selectedMetrics]);

  // Helper function to get breakdown data for a specific report and tab
  const computeBreakdownData = useCallback((tab: DateTab, reportId: string): BreakdownRow[] => {
    if (reportId === "overview" || !reportsLoaded) return [];
    
    const breakdownConfig = breakdownConfigs[reportId];
    if (!breakdownConfig?.breakdownDimensionIds || breakdownConfig.breakdownDimensionIds.length === 0) {
      return [];
    }
    
    const breakdownDimId = breakdownConfig.breakdownDimensionIds[0];
    const cacheKey = `${reportId}_${breakdownDimId}_${tab}_${filterValuesKey}`;
    
    return breakdownDataCache[cacheKey] || [];
  }, [reportsLoaded, breakdownConfigs, filterValuesKey, breakdownDataCache]);

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
  const reportTabsList = useMemo(() => {
    return reportIds.map((id) => {
      const nameFromRaw = rawSourceData[id]?.reportName;
      const nameFromCached =
        cachedPivotData?.mtd?.find((r) => r.reportId === id)?.reportName ||
        cachedPivotData?.ytd?.find((r) => r.reportId === id)?.reportName;
      const fallbackName = nameFromRaw || nameFromCached || "Report";
      return { id, name: fallbackName };
    });
  }, [reportIds, rawSourceData, cachedPivotData]);

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

  return (
    <div className="relative w-full space-y-6">
      <div className="flex items-center justify-between gap-3 mb-4">
        {/* Report Tabs */}
        <div className="flex gap-2 border-b pb-3">
            <Button
              variant={activeReportTab === "overview" ? "default" : "ghost"}
              size="sm"
              className="px-4"
              onClick={() => handleReportTabChange("overview")}
            >
              Overview
            </Button>
            {reportTabsList.map((report) => (
              <Button
                key={report.id}
                variant={activeReportTab === report.id ? "default" : "ghost"}
                size="sm"
                className="px-4"
                onClick={() => handleReportTabChange(report.id)}
              >
                {report.name}
              </Button>
            ))}
            <Button
              variant={activeReportTab === "budget" ? "default" : "ghost"}
              size="sm"
              className="px-4"
              onClick={() => handleReportTabChange("budget")}
            >
              Budget
            </Button>
          </div>
          
          <div className="flex items-center gap-3">
          {/* Filter Value Dropdown - show when dimension is configured in modal */}
          {activeFilterConfig?.dimensionId && activeReportTab !== "overview" && activeReportTab !== "budget" && (
            <Select
              value={filterValues[activeFilterConfig.dimensionId]?.length > 0 ? filterValues[activeFilterConfig.dimensionId][0] : "all"}
              onValueChange={(value) => {
                setFilterValues(prev => ({
                  ...prev,
                  [activeFilterConfig.dimensionId]: value === "all" ? [] : [value],
                }));
              }}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder={filterDimensionNames[activeFilterConfig.dimensionId] || "Select value"} />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border z-50">
                <SelectItem value="all">All {filterDimensionNames[activeFilterConfig.dimensionId] || ""}</SelectItem>
                {(filterDimensionValues[activeFilterConfig.dimensionId] || []).map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          
          {/* Year Selector */}
          {availableYears.length > 0 && (
            <Select 
              value={selectedYear.toString()} 
              onValueChange={(v) => startTransition(() => handleYearChange(parseInt(v, 10)))}
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
      {!hideOverviewAndBudget && (() => {
        // Build monthly data for the chart based on available data
        const monthlyChartData: { month: string; result: number }[] = [];
        
        // Use selectedYear instead of current year
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        months.forEach((monthLabel, monthIdx) => {
          const monthKey = `${selectedYear}-${String(monthIdx + 1).padStart(2, '0')}`;
          
          const monthReports = data.monthly_data?.[monthKey] || [];
          const filteredReports = activeReportTab === "overview" 
            ? monthReports 
            : monthReports.filter(r => r.reportId === activeReportTab);
          
          // Calculate "result" as Revenue - Cost for each month
          const totals = calculateTotals(filteredReports);
          const revenue = totals['Revenue'] || 0;
          const cost = totals['Cost'] || 0;
          const result = revenue - cost;
          
          monthlyChartData.push({
            month: monthLabel,
            result,
          });
        });

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
                        return `$${(value as number).toFixed(0)}`;
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
        {/* OVERVIEW: Period table (unchanged) */}
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

        {/* OVERVIEW: Combined Date Breakdown -> Convert to week-by-week breakdown */}
        {activeReportTab === "overview" && (() => {
          const period = selectedDatePeriod || activeTab;
          const dateRange = getDateRange(period as DateTab, selectedYear);
          const reportRawData = rawSourceData;

          // Compute week-by-week breakdown for the period
          const weekRows: DateBreakdownRow[] = [];
          const weeks = eachWeekOfInterval(
            { start: dateRange.start, end: dateRange.end },
            { weekStartsOn: 1 }
          );

          for (const weekStart of weeks) {
            const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
            // Ensure we don't go beyond the period end date
            const weekRange = {
              start: weekStart,
              end: weekEnd > dateRange.end ? dateRange.end : weekEnd,
            };

            // Aggregate metrics across all reports for this week
            const weekMetrics: Record<string, number> = {};
            safeMetrics.forEach((metric) => (weekMetrics[metric] = 0));

            // Aggregate from all reports
            Object.entries(reportRawData).forEach(([reportId, reportData]) => {
              if (!reportData?.rows?.length) return;
              
              const reportMetrics = aggregateMetrics(
                reportData.rows,
                selectedMetrics,
                weekRange,
                getDimensionFilterForReport(reportId),
                mergedMetricMap
              );

              safeMetrics.forEach((metric) => {
                weekMetrics[metric] = (weekMetrics[metric] || 0) + (reportMetrics[metric] || 0);
              });
            });

            const hasAny = Object.values(weekMetrics).some(v => v && v !== 0);
            if (hasAny) {
              const weekNum = getWeek(weekStart);
              const year = getYear(weekStart);
              weekRows.push({
                dateGroup: `Week ${weekNum}, ${year}`,
                metrics: weekMetrics,
              });
            }
          }

          if (weekRows.length === 0) return null;

          return (
            <div className="space-y-4">
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-primary/5 px-4 py-2 border-b">
                  <h4 className="font-semibold text-sm">Results By Week</h4>
                </div>
                <div className="overflow-hidden">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-muted/30">
                      <TableRow className="bg-muted/30">
                        <TableHead className="font-medium w-[200px]">Week</TableHead>
                        {safeMetrics.map((metric) => renderSortableHeader('date-breakdown', metric))}
                      </TableRow>
                    </TableHeader>
                  </Table>
                  <div className={weekRows.length > MAX_VISIBLE_ROWS ? "max-h-[400px] overflow-y-auto" : ""}>
                    <Table>
                      <TableBody>
                        {sortRows(weekRows, 'date-breakdown', (row, metric) => row.metrics[metric] || 0).map((row, idx) => (
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

        {/* INDIVIDUAL REPORT: Results by Week */}
        {activeReportTab !== "overview" && (() => {
          const period = selectedDatePeriod || activeTab;
          const reportRawData = rawSourceData[activeReportTab];
          if (!reportRawData || !reportRawData.rows?.length) return null;

          const dateRange = getDateRange(period as DateTab, selectedYear);

          // Compute week-by-week breakdown for this report
          const weekRows: DateBreakdownRow[] = [];
          const weeks = eachWeekOfInterval(
            { start: dateRange.start, end: dateRange.end },
            { weekStartsOn: 1 }
          );

          for (const weekStart of weeks) {
            const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
            // Ensure we don't go beyond the period end date
            const weekRange = {
              start: weekStart,
              end: weekEnd > dateRange.end ? dateRange.end : weekEnd,
            };

            const metrics = aggregateMetrics(
              reportRawData.rows,
              selectedMetrics,
              weekRange,
              getDimensionFilterForReport(activeReportTab),
              mergedMetricMap
            );

            const hasAny = Object.values(metrics).some(v => v && v !== 0);
            if (hasAny) {
              const weekNum = getWeek(weekStart);
              const year = getYear(weekStart);
              weekRows.push({
                dateGroup: `Week ${weekNum}, ${year}`,
                metrics,
              });
            }
          }

          if (weekRows.length === 0) return null;

          return (
            <div className="mt-6 space-y-4">
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-primary/5 px-4 py-2 border-b">
                  <h4 className="font-semibold text-sm">Results By Week</h4>
                </div>
                <div className="overflow-hidden">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-muted/30">
                      <TableRow className="bg-muted/30">
                        <TableHead className="font-medium w-[200px]">Week</TableHead>
                        {safeMetrics.map((metric) => renderSortableHeader(`report-date-breakdown-${activeReportTab}`, metric))}
                      </TableRow>
                    </TableHeader>
                  </Table>
                  <div className={weekRows.length > MAX_VISIBLE_ROWS ? "max-h-[400px] overflow-y-auto" : ""}>
                    <Table>
                      <TableBody>
                        {sortRows(weekRows, `report-date-breakdown-${activeReportTab}`, (row, metric) => row.metrics[metric] || 0).map((row, idx) => (
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

        {/* BREAKDOWNS (per dimension) - computed dynamically with filter */}
        {activeReportTab !== "overview" && breakdownConfigs[activeReportTab]?.breakdownDimensionIds?.length > 0 && (() => {
          const period = selectedDatePeriod || activeTab;
          
          // Compute breakdown data dynamically with current filter
          const breakdownRows = computeBreakdownData(period as DateTab, activeReportTab);
          
          if (breakdownRows.length === 0) return null;
          
          // Get breakdown dimension name
          const breakdownDimId = breakdownConfigs[activeReportTab].breakdownDimensionIds[0];
          const dimensionName = filterDimensionNames[breakdownDimId] || breakdownDimId;
          
          // If only one breakdown dimension, show it directly without sub-tabs
          if (breakdownConfigs[activeReportTab].breakdownDimensionIds.length === 1) {
            const breakdownKey = `breakdown-${activeReportTab}-${breakdownDimId}`;
            
            return (
              <div className="mt-6">
                <div className="border rounded-lg overflow-hidden">
                  <div className="overflow-hidden">
                    <Table>
                      <TableHeader className="sticky top-0 z-10 bg-muted/30">
                        <TableRow className="bg-muted/30">
                          <TableHead className="font-medium w-[200px]">{dimensionName}</TableHead>
                          {safeMetrics.map((metric) => renderSortableHeader(breakdownKey, metric))}
                        </TableRow>
                      </TableHeader>
                    </Table>
                    <div className={breakdownRows.length > MAX_VISIBLE_ROWS ? "max-h-[400px] overflow-y-auto" : ""}>
                      <Table>
                        <TableBody>
                          {sortRows(breakdownRows, breakdownKey, (row, metric) => row.metrics[metric] || 0).map((row, idx) => (
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
          // For now, we only support one breakdown dimension at a time
          // This can be extended later to support multiple
          return null;
        })()}

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
