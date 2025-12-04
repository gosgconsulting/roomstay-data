import React, { useState, useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { fetchSourceData, type SourceDataResult } from "@/hooks/dataSources/useSourceData";
import { extractUniqueDimensionValues } from "@/lib/filters/extractDimensionValues";
import { getUser } from "@/lib/auth";
import { Search, ChevronRight, ChevronLeft, Sparkles, Loader2, Calendar } from "lucide-react";
import { 
  getDateRange, 
  getComparisonDateRange,
  aggregateMetrics, 
  getDateGroupKey,
  parseDate,
  type CachedPivotData, 
  type DateTab 
} from "@/components/AISummaryPivotTable";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { format } from "date-fns";

interface Report {
  id: string;
  name: string;
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
  updated_at: string;
}

interface Dimension {
  id: string;
  name: string;
  type: string;
}

interface ReportDimensionConfig {
  reportId: string;
  dimensionId: string | null;
  selectedValues: string[];
}

interface ReportBreakdownConfig {
  reportId: string;
  breakdownDimensionId: string | null;
}

interface EditingCard {
  id: string;
  name: string;
  report_ids: string[];
  report_configs: Record<string, any>;
  breakdown_configs?: Record<string, ReportBreakdownConfig>;
  selected_metrics: string[];
  since_date: string;
  ai_prompt: string;
}

interface AddAICardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCardCreated?: () => void;
  editingCard?: EditingCard | null;
}

type Step = "select-reports" | "filter-dimensions" | "breakdown-dimensions" | "select-metrics" | "select-period" | "ai-prompt";

// Standard KPI metrics available
const AVAILABLE_METRICS = [
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
];

// Metrics that are formulas (calculated, not raw data)
const FORMULA_METRIC_NAMES = ["CTR", "ROAS", "Conversion rate", "CPC", "Cost of sale", "COS"];

const DEFAULT_AI_PROMPT = `You are an analytics expert.
I will provide raw performance data broken down by channel (e.g., SEM, Social Ads, Metasearch).
Using the dataset and the selected metrics I provide, generate a clear and executive-level performance summary following the structure below.

1. Global Results per Channel

For each channel:

Present the selected metrics clearly and consistently.

Provide:

Short narrative summary

Bullet insights on performance drivers, efficiency, volume changes, notable strengths or weaknesses.

2. MTD vs Previous Period

Compare Month-To-Date vs Previous Period (same number of days) using the same selected metrics:

Highlight key increases or decreases

Add a 1–2 sentence executive interpretation per channel

Mention seasonal or competitive factors if they explain the change

3. MTD vs Last Month

Compare MTD to the full previous calendar month, using the same selected metrics:

Summarize shifts, trends, and efficiency changes

Provide a short strategic interpretation (why the changes matter)

4. YTD vs Previous Year (if available)

If YTD data exists:

Compare the selected metrics against previous year

Identify the major drivers of improvement or decline
If not available:

State YTD comparison is not applicable.

5. Cross-Channel Executive Summary

Provide a high-level overview answering:

Which channel is most efficient overall?

Which channel delivers the strongest scale?

Are costs rising or stabilizing?

What major shifts define this period?

What is the single biggest opportunity to improve?

This section must read as a polished C-suite executive summary.

6. Recommendations

Provide short, strategic, actionable recommendations:

Budget allocation

Optimizations

Creative and audience refresh

Structural changes

Any funnel or CRO improvements

Focus on impact, not technical details.

7. Automatically Add These Insights When Relevant
Seasonality

Call out if performance changes align with known seasonal periods, holidays, or industry cycles.

Competitive/Auction Dynamics

Identify trends such as increased competition, volatility, or efficiency shifts.

Tracking/Data Considerations

Mention anomalies, missing signals, attribution mismatches, or measurement gaps if visible.

Final Output Format

Executive Summary

Global Results per Channel

MTD vs Previous Period

MTD vs Last Month

YTD vs Previous Year

Key Insights

Recommendations

Tone: Concise, professional, and performance-driven.`;

// Calculate default "Since" date - January 1st of previous year
const getDefaultSinceDate = (): string => {
  const now = new Date();
  const previousYear = now.getFullYear() - 1;
  return `${previousYear}-01-01`;
};

export const AddAICardModal = ({ open, onOpenChange, onCardCreated, editingCard }: AddAICardModalProps) => {
  const { accountId } = useParams();
  const [step, setStep] = useState<Step>("select-reports");
  const [isSaving, setIsSaving] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const [activeReportTab, setActiveReportTab] = useState<string | null>(null);
  const [dataSources, setDataSources] = useState<Record<string, DataSource>>({});
  const [sourceDataCache, setSourceDataCache] = useState<Record<string, SourceDataResult>>({});
  const [loadingReports, setLoadingReports] = useState<Set<string>>(new Set());
  const [dimensions, setDimensions] = useState<Record<string, Dimension[]>>({});
  const [reportConfigs, setReportConfigs] = useState<Record<string, ReportDimensionConfig>>({});
  const [breakdownConfigs, setBreakdownConfigs] = useState<Record<string, ReportBreakdownConfig>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [customMetrics, setCustomMetrics] = useState<string[]>([]);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([
    "Impressions",
    "Clicks",
    "Cost",
    "Revenue",
    "ROAS",
  ]);
  const [sinceDate, setSinceDate] = useState<string>(getDefaultSinceDate());
  const [aiPrompt, setAiPrompt] = useState(DEFAULT_AI_PROMPT);
  
  // Combine standard and custom metrics
  const allAvailableMetrics = useMemo(() => {
    const combined = [...AVAILABLE_METRICS];
    customMetrics.forEach(cm => {
      if (!combined.includes(cm)) {
        combined.push(cm);
      }
    });
    return combined;
  }, [customMetrics]);

  // Initialize from editingCard when editing
  useEffect(() => {
    if (editingCard && open) {
      setSelectedReportIds(editingCard.report_ids || []);
      // Extract breakdown_configs from report_configs if stored together
      const storedConfigs = editingCard.report_configs || {};
      const { breakdown_configs: storedBreakdown, ...filterConfigs } = storedConfigs as any;
      setReportConfigs(filterConfigs || {});
      setBreakdownConfigs(storedBreakdown || editingCard.breakdown_configs || {});
      setSelectedMetrics(editingCard.selected_metrics || ["Impressions", "Clicks", "Cost", "Revenue", "ROAS"]);
      setSinceDate(editingCard.since_date || getDefaultSinceDate());
      setAiPrompt(editingCard.ai_prompt || DEFAULT_AI_PROMPT);
      if (editingCard.report_ids?.length > 0) {
        setActiveReportTab(editingCard.report_ids[0]);
      }
    }
  }, [editingCard, open]);

  // Fetch reports for the account
  useEffect(() => {
    const fetchReports = async () => {
      if (!accountId) return;
      
      const { data, error } = await supabase
        .from("reports")
        .select("id, name")
        .eq("account_id", accountId)
        .order("name");

      if (!error && data) {
        setReports(data);
      }
    };

    if (open) {
      fetchReports();
    }
  }, [accountId, open]);

  // Fetch custom metrics (number-type dimensions) for the account
  useEffect(() => {
    const fetchCustomMetrics = async () => {
      if (!accountId || !open) return;

      // Fetch dimensions of type "number" that could be custom metrics
      const { data: numberDims } = await supabase
        .from("dimensions")
        .select("name")
        .eq("account_id", accountId)
        .eq("type", "number");

      if (numberDims) {
        const customNames = numberDims
          .map(d => d.name)
          .filter(name => !AVAILABLE_METRICS.includes(name) && !FORMULA_METRIC_NAMES.includes(name));
        setCustomMetrics(customNames);
      }
    };

    fetchCustomMetrics();
  }, [accountId, open]);

  // Fetch all data sources and source data when entering filter-dimensions step
  useEffect(() => {
    const fetchAllDataForReports = async () => {
      if (step !== "filter-dimensions" || selectedReportIds.length === 0) return;

      const { user } = await getUser();
      if (!user) return;

      for (const reportId of selectedReportIds) {
        // Skip if already loaded
        if (sourceDataCache[reportId]) continue;

        // Mark as loading
        setLoadingReports(prev => new Set([...prev, reportId]));

        try {
          // Fetch data source for the report
          const { data: dsData, error: dsError } = await supabase
            .from("data_sources")
            .select("*")
            .eq("report_id", reportId)
            .limit(1)
            .single();

          if (dsError || !dsData) {
            console.error(`Error fetching data source for report ${reportId}:`, dsError);
            setLoadingReports(prev => {
              const next = new Set(prev);
              next.delete(reportId);
              return next;
            });
            continue;
          }

          setDataSources(prev => ({ ...prev, [reportId]: dsData as DataSource }));

          // Extract dimension IDs from column mappings (filter out "none" and invalid values)
          const columnMappings = Array.isArray(dsData.column_mappings) ? dsData.column_mappings : [];
          const dimensionIds = columnMappings
            .filter((m: any) => m.dimensionId && m.dimensionId !== "none" && m.dimensionId.length > 10)
            .map((m: any) => m.dimensionId);

          if (dimensionIds.length > 0) {
            // Fetch dimension details
            const { data: dimData } = await supabase
              .from("dimensions")
              .select("id, name, type")
              .in("id", dimensionIds)
              .in("type", ["text", "vlookup"])
              .order("name");

            if (dimData) {
              setDimensions(prev => ({ ...prev, [reportId]: dimData as Dimension[] }));
            }
          } else {
            setDimensions(prev => ({ ...prev, [reportId]: [] }));
          }

          // Fetch source data directly from Google Sheets/CSV
          const sourceData = await fetchSourceData(dsData as any, user.id, accountId);
          setSourceDataCache(prev => ({ ...prev, [reportId]: sourceData }));

        } catch (err) {
          console.error(`Error fetching data for report ${reportId}:`, err);
        } finally {
          setLoadingReports(prev => {
            const next = new Set(prev);
            next.delete(reportId);
            return next;
          });
        }
      }
    };

    fetchAllDataForReports();
  }, [step, selectedReportIds, accountId]);

  // Extract dimension values from source data
  const currentDimensionValues = useMemo(() => {
    if (!activeReportTab) return [];
    const sourceData = sourceDataCache[activeReportTab];
    if (!sourceData?.transformedRows) return [];
    
    const config = reportConfigs[activeReportTab];
    if (!config?.dimensionId) return [];

    return extractUniqueDimensionValues(sourceData.transformedRows, {
      dimensionId: config.dimensionId,
    });
  }, [activeReportTab, sourceDataCache, reportConfigs]);

  const filteredValues = useMemo(() => {
    if (!searchQuery) return currentDimensionValues;
    return currentDimensionValues.filter(v =>
      v.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [currentDimensionValues, searchQuery]);

  const handleReportToggle = (reportId: string) => {
    setSelectedReportIds(prev =>
      prev.includes(reportId)
        ? prev.filter(id => id !== reportId)
        : [...prev, reportId]
    );
  };

  const handleDimensionChange = (reportId: string, dimensionId: string) => {
    setReportConfigs(prev => ({
      ...prev,
      [reportId]: {
        reportId,
        dimensionId,
        selectedValues: prev[reportId]?.selectedValues || [],
      },
    }));
  };

  const handleValueToggle = (reportId: string, value: string) => {
    setReportConfigs(prev => {
      const config = prev[reportId] || { reportId, dimensionId: null, selectedValues: [] };
      const newValues = config.selectedValues.includes(value)
        ? config.selectedValues.filter(v => v !== value)
        : [...config.selectedValues, value];
      return {
        ...prev,
        [reportId]: { ...config, selectedValues: newValues },
      };
    });
  };

  const handleMetricToggle = (metric: string) => {
    setSelectedMetrics(prev =>
      prev.includes(metric)
        ? prev.filter(m => m !== metric)
        : [...prev, metric]
    );
  };

  const selectedReports = useMemo(
    () => reports.filter(r => selectedReportIds.includes(r.id)),
    [reports, selectedReportIds]
  );

  const handleBreakdownChange = (reportId: string, dimensionId: string | null) => {
    setBreakdownConfigs(prev => ({
      ...prev,
      [reportId]: {
        reportId,
        breakdownDimensionId: dimensionId,
      },
    }));
  };

  const handleNext = () => {
    if (step === "select-reports" && selectedReportIds.length > 0) {
      setStep("filter-dimensions");
      setActiveReportTab(selectedReportIds[0]);
    } else if (step === "filter-dimensions") {
      setStep("breakdown-dimensions");
      setActiveReportTab(selectedReportIds[0]);
    } else if (step === "breakdown-dimensions") {
      setStep("select-metrics");
    } else if (step === "select-metrics") {
      setStep("select-period");
    } else if (step === "select-period") {
      setStep("ai-prompt");
    }
  };

  const handleBack = () => {
    if (step === "filter-dimensions") {
      setStep("select-reports");
    } else if (step === "breakdown-dimensions") {
      setStep("filter-dimensions");
      setActiveReportTab(selectedReportIds[0]);
    } else if (step === "select-metrics") {
      setStep("breakdown-dimensions");
    } else if (step === "select-period") {
      setStep("select-metrics");
    } else if (step === "ai-prompt") {
      setStep("select-period");
    }
  };

  const computePivotData = async (): Promise<CachedPivotData> => {
    const pivotData: CachedPivotData = {
      last_month: [],
      mtd: [],
      ytd: [],
      breakdown_data: {},
      date_breakdown_data: {},
      comparison_previous_period: { last_month: [], mtd: [], ytd: [] },
      comparison_previous_year: { last_month: [], mtd: [], ytd: [] },
    };

    const dateRanges: Record<DateTab, { start: Date; end: Date }> = {
      last_month: getDateRange("last_month"),
      mtd: getDateRange("mtd"),
      ytd: getDateRange("ytd"),
    };
    
    // Comparison date ranges
    const comparisonRanges: Record<string, Record<DateTab, { start: Date; end: Date } | null>> = {
      previous_period: {
        last_month: getComparisonDateRange("last_month", "previous_period"),
        mtd: getComparisonDateRange("mtd", "previous_period"),
        ytd: getComparisonDateRange("ytd", "previous_period"),
      },
      previous_year: {
        last_month: getComparisonDateRange("last_month", "previous_year"),
        mtd: getComparisonDateRange("mtd", "previous_year"),
        ytd: getComparisonDateRange("ytd", "previous_year"),
      },
    };

    const { user } = await getUser();
    if (!user) {
      console.error("[computePivotData] No user found");
      return pivotData;
    }

    console.log("[computePivotData] Starting for reports:", selectedReportIds);
    console.log("[computePivotData] Breakdown configs:", breakdownConfigs);

    for (const reportId of selectedReportIds) {
      const report = reports.find(r => r.id === reportId);
      if (!report) {
        console.warn(`[computePivotData] Report ${reportId} not found in state`);
        // Try to fetch report name from database
        const { data: reportData } = await supabase
          .from("reports")
          .select("id, name")
          .eq("id", reportId)
          .single();
        
        if (!reportData) {
          console.error(`[computePivotData] Could not fetch report ${reportId}`);
          continue;
        }
        
        // Use fetched report data
        const fetchedReport = reportData;
        
        // Continue with fetched report
        await processReport(fetchedReport, user.id, dateRanges, comparisonRanges, pivotData);
      } else {
        await processReport(report, user.id, dateRanges, comparisonRanges, pivotData);
      }
    }

    console.log("[computePivotData] Final pivot data:", pivotData);
    return pivotData;
  };

  const processReport = async (
    report: { id: string; name: string },
    userId: string,
    dateRanges: Record<DateTab, { start: Date; end: Date }>,
    comparisonRanges: Record<string, Record<DateTab, { start: Date; end: Date } | null>>,
    pivotData: CachedPivotData
  ) => {
    // Get source data - either from cache or fetch fresh
    let sourceData = sourceDataCache[report.id];
    let dsData: any = dataSources[report.id];
    
    if (!sourceData?.transformedRows) {
      console.log(`[computePivotData] Fetching data source for report ${report.id}`);
      
      // Fetch data source and source data
      const { data: fetchedDsData, error: dsError } = await supabase
        .from("data_sources")
        .select("*")
        .eq("report_id", report.id)
        .limit(1)
        .single();

      if (dsError || !fetchedDsData) {
        console.error(`[computePivotData] No data source for report ${report.id}:`, dsError);
        return;
      }
      
      dsData = fetchedDsData;

      console.log(`[computePivotData] Fetching source data for ${report.name}`);
      try {
        sourceData = await fetchSourceData(dsData as any, userId, accountId);
        console.log(`[computePivotData] Got ${sourceData?.transformedRows?.length || 0} rows for ${report.name}`);
      } catch (err) {
        console.error(`[computePivotData] Error fetching source data for report ${report.id}:`, err);
        return;
      }
    }

    if (!sourceData?.transformedRows || sourceData.transformedRows.length === 0) {
      console.warn(`[computePivotData] No transformed rows for report ${report.id}`);
      return;
    }

    // Build metric name to dimension ID mapping from column_mappings
    const columnMappings = Array.isArray(dsData?.column_mappings) ? dsData.column_mappings : [];
    const metricNameToIdMap: Record<string, string> = {};
    columnMappings.forEach((m: any) => {
      if (m.dimensionName && m.dimensionId && m.dimensionId !== 'none') {
        metricNameToIdMap[m.dimensionName] = m.dimensionId;
      }
    });

    // Get dimension filter config for this report
    const filterConfig = reportConfigs[report.id];
    let dimensionFilter: { dimensionId: string; dimensionName?: string; values: string[] } | undefined;
    
    if (filterConfig?.dimensionId && filterConfig.selectedValues.length > 0) {
      // Get dimension name - from cache or fetch from DB
      let dimName = dimensions[report.id]?.find(d => d.id === filterConfig.dimensionId)?.name;
      
      if (!dimName) {
        // Fetch dimension name from database
        const { data: dimData } = await supabase
          .from("dimensions")
          .select("name")
          .eq("id", filterConfig.dimensionId)
          .single();
        dimName = dimData?.name;
      }
      
      dimensionFilter = {
        dimensionId: filterConfig.dimensionId,
        dimensionName: dimName,
        values: filterConfig.selectedValues,
      };
    }

    // Aggregate main metrics
    (["last_month", "mtd", "ytd"] as DateTab[]).forEach((tab) => {
      const metrics = aggregateMetrics(
        sourceData.transformedRows,
        selectedMetrics,
        dateRanges[tab],
        dimensionFilter,
        metricNameToIdMap
      );

      pivotData[tab].push({
        reportId: report.id,
        reportName: report.name,
        metrics,
      });
      
      // Compute comparison data - Previous Period
      const prevPeriodRange = comparisonRanges.previous_period[tab];
      if (prevPeriodRange) {
        const prevPeriodMetrics = aggregateMetrics(
          sourceData.transformedRows,
          selectedMetrics,
          prevPeriodRange,
          dimensionFilter,
          metricNameToIdMap
        );
        pivotData.comparison_previous_period![tab].push({
          reportId: report.id,
          reportName: report.name,
          metrics: prevPeriodMetrics,
        });
      }
      
      // Compute comparison data - Previous Year
      const prevYearRange = comparisonRanges.previous_year[tab];
      if (prevYearRange) {
        const prevYearMetrics = aggregateMetrics(
          sourceData.transformedRows,
          selectedMetrics,
          prevYearRange,
          dimensionFilter,
          metricNameToIdMap
        );
        pivotData.comparison_previous_year![tab].push({
          reportId: report.id,
          reportName: report.name,
          metrics: prevYearMetrics,
        });
      }
    });

    // Compute breakdown data if configured
    const breakdownConfig = breakdownConfigs[report.id];
    if (breakdownConfig?.breakdownDimensionId) {
      // Fetch breakdown dimension name
      const { data: breakdownDimData } = await supabase
        .from("dimensions")
        .select("name")
        .eq("id", breakdownConfig.breakdownDimensionId)
        .maybeSingle();
      
      const breakdownDimName = breakdownDimData?.name;
      const breakdownDimId = breakdownConfig.breakdownDimensionId;
      
      // First filter rows by dimension filter
      const filteredByDimension = sourceData.transformedRows.filter((row: any) => {
        if (!dimensionFilter || dimensionFilter.values.length === 0) return true;
        const rowData = row.dimension_values || row;
        const dimVal = rowData[dimensionFilter.dimensionId] || 
                       (dimensionFilter.dimensionName ? rowData[dimensionFilter.dimensionName] : undefined);
        return dimVal !== undefined && dimensionFilter.values.includes(String(dimVal));
      });
      
      // Get unique values for breakdown dimension from filtered rows
      const uniqueValues = new Set<string>();
      let hasUncategorized = false;
      
      filteredByDimension.forEach((row: any) => {
        const rowData = row.dimension_values || row;
        const val = rowData[breakdownDimId] || (breakdownDimName ? rowData[breakdownDimName] : undefined);
        if (val !== undefined && val !== null && val !== '') {
          uniqueValues.add(String(val));
        } else {
          hasUncategorized = true;
        }
      });

      // Initialize breakdown data for this report
      if (!pivotData.breakdown_data) {
        pivotData.breakdown_data = {};
      }
      pivotData.breakdown_data[report.id] = { last_month: [], mtd: [], ytd: [] };
      
      (["last_month", "mtd", "ytd"] as DateTab[]).forEach((tab) => {
        // Process each named group
        uniqueValues.forEach((groupValue) => {
          // Filter rows for this specific group value
          const groupRows = filteredByDimension.filter((row: any) => {
            const rowData = row.dimension_values || row;
            const groupVal = rowData[breakdownDimId] || 
                             (breakdownDimName ? rowData[breakdownDimName] : undefined);
            return groupVal !== undefined && String(groupVal) === groupValue;
          });
          
          const metrics = aggregateMetrics(
            groupRows,
            selectedMetrics,
            dateRanges[tab],
            undefined, // Already filtered
            metricNameToIdMap
          );

          pivotData.breakdown_data![report.id][tab].push({
            groupValue,
            metrics,
          });
        });
        
        // Add Uncategorized group for rows without breakdown value
        if (hasUncategorized) {
          const uncategorizedRows = filteredByDimension.filter((row: any) => {
            const rowData = row.dimension_values || row;
            const val = rowData[breakdownDimId] || (breakdownDimName ? rowData[breakdownDimName] : undefined);
            return val === undefined || val === null || val === '';
          });
          
          const metrics = aggregateMetrics(
            uncategorizedRows,
            selectedMetrics,
            dateRanges[tab],
            undefined,
            metricNameToIdMap
          );

          pivotData.breakdown_data![report.id][tab].push({
            groupValue: 'Uncategorized',
            metrics,
          });
        }
      });
    }
    
    // Always compute date breakdown data (grouped by week for last_month/mtd, by year for ytd)
    // Initialize date breakdown data for this report
    if (!pivotData.date_breakdown_data) {
      pivotData.date_breakdown_data = {};
    }
    pivotData.date_breakdown_data[report.id] = { last_month: [], mtd: [], ytd: [] };
    
    // Build metric name to dimension ID mapping if not already done
    const mappings = Array.isArray(dsData?.column_mappings) ? dsData.column_mappings : [];
    const metricMap: Record<string, string> = {};
    mappings.forEach((m: any) => {
      if (m.dimensionName && m.dimensionId && m.dimensionId !== 'none') {
        metricMap[m.dimensionName] = m.dimensionId;
      }
    });
    
    // Find date dimension ID
    const dateDimId = metricMap['Date'] || metricMap['date'] || metricMap['Day'];
    
    // Get rows filtered by dimension filter
    const baseRows = sourceData.transformedRows.filter((row: any) => {
      if (!dimensionFilter || dimensionFilter.values.length === 0) return true;
      const rowData = row.dimension_values || row;
      const dimVal = rowData[dimensionFilter.dimensionId] || 
                     (dimensionFilter.dimensionName ? rowData[dimensionFilter.dimensionName] : undefined);
      return dimVal !== undefined && dimensionFilter.values.includes(String(dimVal));
    });
    
    (["last_month", "mtd", "ytd"] as DateTab[]).forEach((tab) => {
      const dateRange = dateRanges[tab];
      
      // Group rows by date group (week or year)
      const dateGroups: Record<string, any[]> = {};
      
      baseRows.forEach((row: any) => {
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
        
        // Check if within date range
        if (rowDate < dateRange.start || rowDate > dateRange.end) return;
        
        const groupKey = getDateGroupKey(rowDate, tab);
        if (!dateGroups[groupKey]) {
          dateGroups[groupKey] = [];
        }
        dateGroups[groupKey].push(row);
      });
      
      // Aggregate metrics for each date group
      Object.entries(dateGroups).forEach(([dateGroup, groupRows]) => {
        const metrics = aggregateMetrics(
          groupRows,
          selectedMetrics,
          dateRange,
          undefined,
          metricNameToIdMap
        );
        
        pivotData.date_breakdown_data![report.id][tab].push({
          dateGroup,
          metrics,
        });
      });
      
      // Sort by date group
      pivotData.date_breakdown_data![report.id][tab].sort((a, b) => 
        a.dateGroup.localeCompare(b.dateGroup)
      );
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { user } = await getUser();
      if (!user) {
        toast.error("You must be logged in to save a card");
        return;
      }

      // Compute pivot data - fetch from sources and apply filters
      toast.info("Fetching data from sources and computing pivot table...", {
        duration: 10000,
        id: "computing-pivot",
      });
      const cachedPivotData = await computePivotData();
      toast.dismiss("computing-pivot");

      // Generate a name based on selected reports
      const cardName = selectedReports.length > 0 
        ? `${selectedReports.map(r => r.name).join(", ")} Summary`
        : "AI Summary";

      if (editingCard) {
        // Update existing card
        const { error } = await (supabase.from("ai_summary_cards") as any)
          .update({
            name: cardName,
            report_ids: selectedReportIds,
            report_configs: { ...reportConfigs, breakdown_configs: breakdownConfigs },
            selected_metrics: selectedMetrics,
            since_date: sinceDate,
            ai_prompt: aiPrompt,
            cached_pivot_data: cachedPivotData,
            pivot_data_refreshed_at: new Date().toISOString(),
          })
          .eq("id", editingCard.id);

        if (error) {
          console.error("Error updating AI card:", error);
          toast.error("Failed to update card");
          return;
        }

        toast.success("AI Summary card updated!");
      } else {
        // Create new card
        const { error } = await (supabase.from("ai_summary_cards") as any).insert({
          user_id: user.id,
          account_id: accountId || null,
          name: cardName,
          report_ids: selectedReportIds,
          report_configs: { ...reportConfigs, breakdown_configs: breakdownConfigs },
          selected_metrics: selectedMetrics,
          since_date: sinceDate,
          ai_prompt: aiPrompt,
          cached_pivot_data: cachedPivotData,
          pivot_data_refreshed_at: new Date().toISOString(),
        });

        if (error) {
          console.error("Error saving AI card:", error);
          toast.error("Failed to save card");
          return;
        }

        toast.success("AI Summary card created!");
      }

      onCardCreated?.();
      onOpenChange(false);
      resetState();
    } catch (err) {
      console.error("Error saving AI card:", err);
      toast.error("Failed to save card");
    } finally {
      setIsSaving(false);
    }
  };

  const resetState = () => {
    setStep("select-reports");
    setSelectedReportIds([]);
    setActiveReportTab(null);
    setDataSources({});
    setSourceDataCache({});
    setDimensions({});
    setReportConfigs({});
    setBreakdownConfigs({});
    setSearchQuery("");
    setSelectedMetrics(["Impressions", "Clicks", "Cost", "Revenue", "ROAS"]);
    setSinceDate(getDefaultSinceDate());
    setAiPrompt(DEFAULT_AI_PROMPT);
    setLoadingReports(new Set());
  };

  const handleClose = () => {
    onOpenChange(false);
    resetState();
  };

  const activeDimensions = activeReportTab ? dimensions[activeReportTab] || [] : [];
  const isActiveReportLoading = activeReportTab ? loadingReports.has(activeReportTab) : false;

  // Format the "since" date for display
  const formattedSinceDate = useMemo(() => {
    try {
      return format(new Date(sinceDate), "MMMM d, yyyy");
    } catch {
      return sinceDate;
    }
  }, [sinceDate]);

  const getStepTitle = () => {
    const prefix = editingCard ? "Edit: " : "";
    switch (step) {
      case "select-reports":
        return `${prefix}Select Reports`;
      case "filter-dimensions":
        return `${prefix}Filter Dimensions`;
      case "breakdown-dimensions":
        return `${prefix}Breakdown By`;
      case "select-metrics":
        return `${prefix}Select Metrics`;
      case "select-period":
        return `${prefix}Select Period`;
      case "ai-prompt":
        return `${prefix}AI Summary Prompt`;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {getStepTitle()}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {/* Step 1: Select Reports */}
          {step === "select-reports" && (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-2">
                {reports.map(report => (
                  <div
                    key={report.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                      selectedReportIds.includes(report.id)
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/50"
                    )}
                    onClick={() => handleReportToggle(report.id)}
                  >
                    <Checkbox
                      checked={selectedReportIds.includes(report.id)}
                      onCheckedChange={() => handleReportToggle(report.id)}
                    />
                    <span className="font-medium">{report.name}</span>
                  </div>
                ))}
                {reports.length === 0 && (
                  <p className="text-muted-foreground text-center py-8">
                    No reports found for this account.
                  </p>
                )}
              </div>
            </ScrollArea>
          )}

          {/* Step 2: Filter Dimensions */}
          {step === "filter-dimensions" && (
            <div className="flex h-[400px] gap-4">
              {/* Left: Report tabs */}
              <div className="w-48 border-r pr-4">
                <ScrollArea className="h-full">
                  <div className="space-y-1">
                    {selectedReports.map(report => {
                      const isLoading = loadingReports.has(report.id);
                      const hasData = !!sourceDataCache[report.id];
                      return (
                        <button
                          key={report.id}
                          className={cn(
                            "w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between",
                            activeReportTab === report.id
                              ? "bg-primary text-primary-foreground"
                              : "hover:bg-muted"
                          )}
                          onClick={() => {
                            setActiveReportTab(report.id);
                            setSearchQuery("");
                          }}
                        >
                          <span className="truncate">
                            {report.name}
                            {reportConfigs[report.id]?.selectedValues.length > 0 && (
                              <span className="ml-1 text-xs opacity-70">
                                ({reportConfigs[report.id].selectedValues.length})
                              </span>
                            )}
                          </span>
                          {isLoading && (
                            <Loader2 className="h-3 w-3 animate-spin flex-shrink-0" />
                          )}
                          {!isLoading && hasData && (
                            <span className="text-xs opacity-50">✓</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>

              {/* Right: Dimension selector */}
              <div className="flex-1 flex flex-col gap-4">
                {activeReportTab && (
                  <>
                    {isActiveReportLoading ? (
                      <div className="flex-1 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-8 w-8 animate-spin" />
                          <span>Loading data from source...</span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <Label className="text-sm font-medium mb-2 block">
                            Select Dimension
                          </Label>
                          <Select
                            value={reportConfigs[activeReportTab]?.dimensionId || ""}
                            onValueChange={value =>
                              handleDimensionChange(activeReportTab, value)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Choose a dimension..." />
                            </SelectTrigger>
                            <SelectContent>
                              {activeDimensions.map(dim => (
                                <SelectItem key={dim.id} value={dim.id}>
                                  {dim.name}
                                </SelectItem>
                              ))}
                              {activeDimensions.length === 0 && (
                                <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                                  No dimensions available
                                </div>
                              )}
                            </SelectContent>
                          </Select>
                        </div>

                        {reportConfigs[activeReportTab]?.dimensionId && (
                          <>
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                              <Input
                                placeholder="Search values..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="pl-9"
                              />
                            </div>

                            <ScrollArea className="flex-1 border rounded-md">
                              <div className="p-2 space-y-1">
                                {filteredValues.length > 0 ? (
                                  filteredValues.map(value => (
                                    <div
                                      key={value}
                                      className={cn(
                                        "flex items-center gap-3 p-2 rounded cursor-pointer transition-colors",
                                        reportConfigs[activeReportTab]?.selectedValues.includes(
                                          value
                                        )
                                          ? "bg-primary/10"
                                          : "hover:bg-muted/50"
                                      )}
                                      onClick={() =>
                                        handleValueToggle(activeReportTab, value)
                                      }
                                    >
                                      <Checkbox
                                        checked={reportConfigs[
                                          activeReportTab
                                        ]?.selectedValues.includes(value)}
                                        onCheckedChange={() =>
                                          handleValueToggle(activeReportTab, value)
                                        }
                                      />
                                      <span className="text-sm">{value}</span>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-center text-muted-foreground py-4">
                                    No values found.
                                  </p>
                                )}
                              </div>
                            </ScrollArea>
                          </>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Breakdown Dimensions */}
          {step === "breakdown-dimensions" && (
            <div className="flex h-[400px] gap-4">
              {/* Left: Report tabs */}
              <div className="w-48 border-r pr-4">
                <ScrollArea className="h-full">
                  <div className="space-y-1">
                    {selectedReports.map(report => {
                      const hasBreakdown = !!breakdownConfigs[report.id]?.breakdownDimensionId;
                      return (
                        <button
                          key={report.id}
                          className={cn(
                            "w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between",
                            activeReportTab === report.id
                              ? "bg-primary text-primary-foreground"
                              : "hover:bg-muted"
                          )}
                          onClick={() => {
                            setActiveReportTab(report.id);
                          }}
                        >
                          <span className="truncate">{report.name}</span>
                          {hasBreakdown && (
                            <span className="text-xs opacity-50">✓</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>

              {/* Right: Breakdown dimension selector */}
              <div className="flex-1 flex flex-col gap-4">
                {activeReportTab && (
                  <>
                    {isActiveReportLoading ? (
                      <div className="flex-1 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-8 w-8 animate-spin" />
                          <span>Loading dimensions...</span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="bg-muted/30 rounded-lg p-4 mb-2">
                          <p className="text-sm text-muted-foreground">
                            Select a dimension to break down this report's data. This will create a detailed table grouped by the selected dimension.
                          </p>
                        </div>
                        
                        <div>
                          <Label className="text-sm font-medium mb-2 block">
                            Breakdown By
                          </Label>
                          <Select
                            value={breakdownConfigs[activeReportTab]?.breakdownDimensionId || "none"}
                            onValueChange={value =>
                              handleBreakdownChange(activeReportTab, value === "none" ? null : value)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Choose a dimension..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">
                                <span className="text-muted-foreground">No breakdown</span>
                              </SelectItem>
                              {activeDimensions.map(dim => (
                                <SelectItem key={dim.id} value={dim.id}>
                                  {dim.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {breakdownConfigs[activeReportTab]?.breakdownDimensionId && (
                          <div className="mt-4 p-4 bg-primary/5 rounded-lg border border-primary/20">
                            <p className="text-sm">
                              <span className="font-medium">Selected:</span>{" "}
                              {activeDimensions.find(d => d.id === breakdownConfigs[activeReportTab]?.breakdownDimensionId)?.name}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              A detailed breakdown table will be created for this report.
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Select Metrics */}
          {step === "select-metrics" && (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground mb-4">
                  Select the metrics to include in your AI summary.
                </p>
                {allAvailableMetrics.map(metric => {
                  const isCustom = !AVAILABLE_METRICS.includes(metric);
                  return (
                    <div
                      key={metric}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                        selectedMetrics.includes(metric)
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/50"
                      )}
                      onClick={() => handleMetricToggle(metric)}
                    >
                      <Checkbox
                        checked={selectedMetrics.includes(metric)}
                        onCheckedChange={() => handleMetricToggle(metric)}
                      />
                      <span className="font-medium">{metric}</span>
                      {isCustom && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                          Custom
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}

          {/* Step 4: Select Period */}
          {step === "select-period" && (
            <div className="space-y-6">
              <div className="bg-muted/50 rounded-lg p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Calendar className="h-5 w-5 text-primary" />
                  <h4 className="font-medium">Data Period</h4>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium mb-2 block">
                      Since
                    </Label>
                    <Input
                      type="date"
                      value={sinceDate}
                      onChange={e => setSinceDate(e.target.value)}
                      className="w-full max-w-xs"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Data will be analyzed from this date up to today.
                    </p>
                  </div>

                  <div className="pt-4 border-t">
                    <p className="text-sm">
                      <span className="font-medium">Selected Period:</span>{" "}
                      {formattedSinceDate} → Today
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-muted/30 rounded-lg p-4">
                <h4 className="font-medium mb-2 text-sm">Configuration Summary</h4>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p><span className="font-medium text-foreground">Reports:</span> {selectedReports.map(r => r.name).join(", ")}</p>
                  <p><span className="font-medium text-foreground">Metrics:</span> {selectedMetrics.join(", ")}</p>
                </div>
              </div>
            </div>
          )}

          {/* Step 5: AI Prompt */}
          {step === "ai-prompt" && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium mb-2 block">
                  AI Prompt
                </Label>
                <Textarea
                  className="w-full h-64 resize-none"
                  placeholder="Enter instructions for the AI summary..."
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  This prompt will guide the AI in generating your executive summary.
                </p>
              </div>

              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="font-medium mb-2">Summary Configuration</h4>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <p>
                    <span className="font-medium text-foreground">Period:</span>{" "}
                    {formattedSinceDate} → Today
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Metrics:</span>{" "}
                    {selectedMetrics.join(", ")}
                  </p>
                  {selectedReports.map(report => {
                    const config = reportConfigs[report.id];
                    const breakdownConfig = breakdownConfigs[report.id];
                    const filterDim = dimensions[report.id]?.find(
                      d => d.id === config?.dimensionId
                    );
                    const breakdownDim = dimensions[report.id]?.find(
                      d => d.id === breakdownConfig?.breakdownDimensionId
                    );
                    return (
                      <div key={report.id} className="space-y-1">
                        <div>
                          <span className="font-medium text-foreground">
                            {report.name}:
                          </span>{" "}
                          {filterDim ? (
                            <>
                              Filter: {filterDim.name} ({config?.selectedValues.length || 0}{" "}
                              selected)
                            </>
                          ) : (
                            <span className="italic">No filter</span>
                          )}
                        </div>
                        {breakdownDim && (
                          <div className="ml-4 text-xs">
                            → Breakdown by: {breakdownDim.name}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={step === "select-reports" ? handleClose : handleBack}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            {step === "select-reports" ? "Cancel" : "Back"}
          </Button>

          {step === "ai-prompt" ? (
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-1" />
              )}
              {isSaving ? "Saving..." : editingCard ? "Update Card" : "Create Card"}
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              disabled={
                (step === "select-reports" && selectedReportIds.length === 0) ||
                (step === "select-metrics" && selectedMetrics.length === 0)
              }
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
