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

import { supabase } from "@/integrations/supabase/client";
import { extractUniqueDimensionValues } from "@/lib/filters/extractDimensionValues";
import { getUser } from "@/lib/auth";

// Interface for cached dimension data result
interface CachedDimensionResult {
  transformedRows: any[];
  rowCount: number;
}

// Helper function to fetch dimension data from database (much faster than source)
async function fetchDimensionDataFromDB(reportId: string): Promise<CachedDimensionResult> {
  const allRows: any[] = [];
  const batchSize = 1000;
  let offset = 0;
  let hasMore = true;

  console.log('[ADD-AI-CARD] Fetching dimension data from DB for report:', reportId);
  const startTime = performance.now();

  while (hasMore) {
    const { data, error } = await supabase
      .from('dimension_data')
      .select('id, dimension_values, data_source_id, row_number')
      .eq('report_id', reportId)
      .order('row_number', { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.error('[ADD-AI-CARD] Error fetching batch:', error);
      throw error;
    }

    if (data && data.length > 0) {
      allRows.push(...data);
      offset += batchSize;
      hasMore = data.length === batchSize;
    } else {
      hasMore = false;
    }
  }

  const duration = Math.round(performance.now() - startTime);
  console.log('[ADD-AI-CARD] Dimension data fetch completed:', {
    reportId,
    rowCount: allRows.length,
    duration: `${duration}ms`
  });

  // Transform to expected format
  const transformedRows = allRows.map(row => ({
    id: row.id,
    row_number: row.row_number,
    data_source_id: row.data_source_id,
    dimension_values: row.dimension_values,
  }));

  return {
    transformedRows,
    rowCount: allRows.length,
  };
}
import { Search, ChevronRight, ChevronLeft, Sparkles, Loader2, Calendar, Copy, ExternalLink } from "lucide-react";
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
  breakdownDimensionIds: string[]; // Changed to array for multi-select
}

interface ReportFilterConfig {
  reportId: string;
  filterDimensionIds: string[]; // Array of dimension IDs to use as filters
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
  onCardCreated?: (newCardId?: string) => void;
  editingCard?: EditingCard | null;
  mode?: "card" | "api"; // "card" for card creation/editing, "api" for API URL preview only
  initialReportId?: string; // Pre-select a report when opening from ReportDashboard
  accountId?: string; // Account ID - can be passed as prop or will use from URL params
}

type Step = "select-reports" | "filter-dimensions" | "breakdown-dimensions" | "select-metrics" | "select-period" | "preview-url";

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

export const AddAICardModal = ({ open, onOpenChange, onCardCreated, editingCard, mode = "card", initialReportId, accountId: propAccountId }: AddAICardModalProps) => {
  const { accountId: urlAccountId } = useParams();
  // Use prop accountId first, then URL param, then try to get from editingCard
  const accountId = propAccountId || urlAccountId || (editingCard as any)?.account_id || null;
  const [step, setStep] = useState<Step>("select-reports");
  const [isSaving, setIsSaving] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const [activeReportTab, setActiveReportTab] = useState<string | null>(null);
  const [dataSources, setDataSources] = useState<Record<string, DataSource>>({});
  const [sourceDataCache, setSourceDataCache] = useState<Record<string, CachedDimensionResult>>({});
  const [loadingReports, setLoadingReports] = useState<Set<string>>(new Set());
  const [dimensions, setDimensions] = useState<Record<string, Dimension[]>>({});
  const [reportConfigs, setReportConfigs] = useState<Record<string, ReportDimensionConfig>>({});
  const [breakdownConfigs, setBreakdownConfigs] = useState<Record<string, ReportBreakdownConfig>>({});
  const [filterConfigs, setFilterConfigs] = useState<Record<string, ReportFilterConfig>>({});
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

  // Initialize from editingCard when editing or when in API mode with card config
  useEffect(() => {
    if (editingCard && open) {
      setSelectedReportIds(editingCard.report_ids || []);
      // Extract breakdown_configs from report_configs if stored together
      const storedConfigs = editingCard.report_configs || {};
      const { breakdown_configs: storedBreakdown, ...filterConfigs } = storedConfigs as any;
      setReportConfigs(filterConfigs || {});
      
      // Convert legacy breakdownDimensionId to breakdownDimensionIds array
      const rawBreakdownConfigs = storedBreakdown || editingCard.breakdown_configs || {};
      const convertedBreakdownConfigs: Record<string, { reportId: string; breakdownDimensionIds: string[] }> = {};
      Object.entries(rawBreakdownConfigs).forEach(([reportId, config]: [string, any]) => {
        if (config?.breakdownDimensionIds) {
          // New format - use as-is
          convertedBreakdownConfigs[reportId] = config;
        } else if (config?.breakdownDimensionId) {
          // Legacy format - convert to array
          convertedBreakdownConfigs[reportId] = {
            reportId,
            breakdownDimensionIds: [config.breakdownDimensionId],
          };
        }
      });
      setBreakdownConfigs(convertedBreakdownConfigs);
      
      setSelectedMetrics(editingCard.selected_metrics || ["Impressions", "Clicks", "Cost", "Revenue", "ROAS"]);
      setSinceDate(editingCard.since_date || getDefaultSinceDate());
      setAiPrompt(editingCard.ai_prompt || DEFAULT_AI_PROMPT);
      if (editingCard.report_ids?.length > 0) {
        setActiveReportTab(editingCard.report_ids[0]);
      }
      
      // If in API mode, start at preview-url step
      if (mode === "api") {
        setStep("preview-url");
      }
    } else if (mode === "api" && open) {
      // In API mode without editingCard
      if (initialReportId) {
        // Pre-select the initial report when provided
        setSelectedReportIds([initialReportId]);
        setActiveReportTab(initialReportId);
        // Start at select-reports step (report is pre-selected, user can proceed)
        setStep("select-reports");
      } else {
        // No initial report, start at select-reports
        setStep("select-reports");
      }
    }
  }, [editingCard, open, mode, initialReportId]);

  // Fetch reports for the account
  useEffect(() => {
    const fetchReports = async () => {
      if (!accountId) {
        console.log('[AddAICardModal] No accountId available:', {
          propAccountId: propAccountId,
          urlAccountId: urlAccountId,
          editingCardAccountId: (editingCard as any)?.account_id,
          finalAccountId: accountId
        });
        return;
      }
      
      console.log('[AddAICardModal] Fetching reports for accountId:', accountId);
      
      const { data, error } = await supabase
        .from("reports")
        .select("id, name")
        .eq("account_id", accountId)
        .order("name");

      if (error) {
        console.error('[AddAICardModal] Error fetching reports:', error);
        return;
      }

      console.log('[AddAICardModal] Found reports:', data?.length || 0, data);
      
      // Check for duplicate report names
      if (data && data.length > 0) {
        const nameCounts = new Map<string, number>();
        data.forEach(report => {
          nameCounts.set(report.name, (nameCounts.get(report.name) || 0) + 1);
        });
        
        const duplicates = Array.from(nameCounts.entries())
          .filter(([_, count]) => count > 1)
          .map(([name]) => name);
        
        if (duplicates.length > 0) {
          console.warn('[AddAICardModal] Found duplicate report names:', duplicates);
        }
      }

      if (data) {
        setReports(data);
      }
    };

    if (open) {
      fetchReports();
    }
  }, [accountId, open, propAccountId, editingCard]);

  // Fetch custom metrics (number-type and formula-type dimensions) for the account
  useEffect(() => {
    const fetchCustomMetrics = async () => {
      if (!accountId || !open) return;

      console.log('[ADD-AI-CARD] Loading custom metrics for account:', accountId);

      // Load account-scoped dimensions
      const { data: accountDims } = await supabase
        .from("dimensions")
        .select("name, type, scope")
        .eq("account_id", accountId)
        .eq("scope", "account")
        .in("type", ["number", "formula"]);

      // Load custom dimensions (user-created)
      const { data: customDims } = await supabase
        .from("dimensions")
        .select("name, type, scope")
        .eq("scope", "custom")
        .in("type", ["number", "formula"]);

      // Load global dimensions
      const { data: globalDims } = await supabase
        .from("dimensions")
        .select("name, type, scope")
        .eq("scope", "global")
        .in("type", ["number", "formula"]);

      // Combine all dimensions with priority: account > custom > global
      const allDims = [
        ...(accountDims || []),
        ...(customDims || []),
        ...(globalDims || [])
      ];

      // Deduplicate by name, keeping highest priority (first occurrence)
      const seenNames = new Set<string>();
      const uniqueDims = allDims.filter(dim => {
        if (seenNames.has(dim.name)) {
          return false;
        }
        seenNames.add(dim.name);
        return true;
      });

      if (uniqueDims.length > 0) {
        const customNames = uniqueDims
          .map(d => d.name)
          .filter(name => !AVAILABLE_METRICS.includes(name) && !FORMULA_METRIC_NAMES.includes(name));
        
        console.log('[ADD-AI-CARD] Found custom metrics:', {
          account: accountDims?.length || 0,
          custom: customDims?.length || 0,
          global: globalDims?.length || 0,
          total: uniqueDims.length,
          customNames
        });
        
        setCustomMetrics(customNames);
      }
    };

    fetchCustomMetrics();
  }, [accountId, open]);

  // Fetch all data sources and source data when entering filter-dimensions or breakdown-dimensions step
  useEffect(() => {
    const fetchAllDataForReports = async () => {
      if ((step !== "filter-dimensions" && step !== "breakdown-dimensions") || selectedReportIds.length === 0) return;

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
              .in("type", ["text"])
              .order("name");

            if (dimData) {
              setDimensions(prev => ({ ...prev, [reportId]: dimData as Dimension[] }));
            }
          } else {
            setDimensions(prev => ({ ...prev, [reportId]: [] }));
          }

          // Fetch dimension data from database (cached data - much faster than source)
          const dimensionData = await fetchDimensionDataFromDB(reportId);
          setSourceDataCache(prev => ({ ...prev, [reportId]: dimensionData }));

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

  const handleSelectAll = (reportId: string) => {
    if (!activeReportTab) return;
    const allValues = filteredValues; // Use filtered values (respects search)
    setReportConfigs(prev => {
      const config = prev[reportId] || { reportId, dimensionId: null, selectedValues: [] };
      const existingValues = new Set(config.selectedValues);
      // Add all filtered values that aren't already selected
      allValues.forEach(value => existingValues.add(value));
      return {
        ...prev,
        [reportId]: { ...config, selectedValues: Array.from(existingValues) },
      };
    });
  };

  const handleDeselectAll = (reportId: string) => {
    if (!activeReportTab) return;
    const filteredValuesSet = new Set(filteredValues); // Use filtered values (respects search)
    setReportConfigs(prev => {
      const config = prev[reportId] || { reportId, dimensionId: null, selectedValues: [] };
      // Remove only the filtered values from selection
      const newValues = config.selectedValues.filter(v => !filteredValuesSet.has(v));
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

  const handleBreakdownToggle = (reportId: string, dimensionId: string) => {
    setBreakdownConfigs(prev => {
      const currentIds = prev[reportId]?.breakdownDimensionIds || [];
      const newIds = currentIds.includes(dimensionId)
        ? currentIds.filter(id => id !== dimensionId)
        : [...currentIds, dimensionId];
      return {
        ...prev,
        [reportId]: {
          reportId,
          breakdownDimensionIds: newIds,
        },
      };
    });
  };

  const handleFilterToggle = (reportId: string, dimensionId: string) => {
    setFilterConfigs(prev => {
      const currentIds = prev[reportId]?.filterDimensionIds || [];
      const newIds = currentIds.includes(dimensionId)
        ? currentIds.filter(id => id !== dimensionId)
        : [...currentIds, dimensionId];
      return {
        ...prev,
        [reportId]: {
          reportId,
          filterDimensionIds: newIds,
        },
      };
    });
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
      if (mode === "api") {
        setStep("preview-url");
      } else {
        setStep("select-period");
      }
    } else if (step === "select-period") {
      if (mode === "api") {
        setStep("preview-url");
      }
      // In card mode, select-period is the last step before saving
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
    } else if (step === "preview-url") {
      if (mode === "api") {
        setStep("select-metrics");
      } else {
        setStep("select-period");
      }
    }
  };

  const computePivotData = async (): Promise<CachedPivotData> => {
    const pivotData: CachedPivotData = {
      last_month: [],
      mtd: [],
      ytd: [],
      breakdown_data: {},
      combined_date_breakdown: { last_month: [], mtd: [], ytd: [] },
      comparison_previous_period: { last_month: [], mtd: [], ytd: [], breakdown_data: {} },
      comparison_previous_year: { last_month: [], mtd: [], ytd: [], breakdown_data: {} },
    };
    
    // Collect all rows for combined date breakdown
    const allRowsForDateBreakdown: any[] = [];
    const allMetricMaps: Record<string, string>[] = [];

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
        const reportRows = await processReport(fetchedReport, user.id, dateRanges, comparisonRanges, pivotData);
        if (reportRows) {
          allRowsForDateBreakdown.push(...reportRows.rows);
          allMetricMaps.push(reportRows.metricMap);
        }
      } else {
        const reportRows = await processReport(report, user.id, dateRanges, comparisonRanges, pivotData);
        if (reportRows) {
          allRowsForDateBreakdown.push(...reportRows.rows);
          allMetricMaps.push(reportRows.metricMap);
        }
      }
    }
    
    // Compute combined date breakdown after processing all reports
    const mergedMetricMap: Record<string, string> = {};
    allMetricMaps.forEach(map => Object.assign(mergedMetricMap, map));
    const dateDimId = mergedMetricMap['Date'] || mergedMetricMap['date'] || mergedMetricMap['Day'];
    
    (["last_month", "mtd", "ytd"] as DateTab[]).forEach((tab) => {
      const dateRange = dateRanges[tab];
      const dateGroups: Record<string, any[]> = {};
      
      allRowsForDateBreakdown.forEach((row: any) => {
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
        
        const groupKey = getDateGroupKey(rowDate, tab);
        if (!dateGroups[groupKey]) {
          dateGroups[groupKey] = [];
        }
        dateGroups[groupKey].push(row);
      });
      
      Object.entries(dateGroups).forEach(([dateGroup, groupRows]) => {
        const metrics = aggregateMetrics(
          groupRows,
          selectedMetrics,
          dateRange,
          undefined,
          mergedMetricMap
        );
        
        pivotData.combined_date_breakdown![tab].push({
          dateGroup,
          metrics,
        });
      });
      
      pivotData.combined_date_breakdown![tab].sort((a, b) => 
        a.dateGroup.localeCompare(b.dateGroup)
      );
    });

    console.log("[computePivotData] Final pivot data:", pivotData);
    return pivotData;
  };

  const processReport = async (
    report: { id: string; name: string },
    userId: string,
    dateRanges: Record<DateTab, { start: Date; end: Date }>,
    comparisonRanges: Record<string, Record<DateTab, { start: Date; end: Date } | null>>,
    pivotData: CachedPivotData
  ): Promise<{ rows: any[]; metricMap: Record<string, string> } | null> => {
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

      console.log(`[computePivotData] Fetching dimension data from DB for ${report.name}`);
      try {
        sourceData = await fetchDimensionDataFromDB(report.id);
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

    // Compute breakdown data if configured - support multiple breakdown dimensions
    const breakdownConfig = breakdownConfigs[report.id];
    const breakdownDimensionIds = breakdownConfig?.breakdownDimensionIds || [];
    
    // Build dimension ID to column header mapping for lookups
    const dimIdToColumnHeader: Record<string, string> = {};
    columnMappings.forEach((m: any) => {
      if (m.dimensionId && m.dimensionId !== 'none' && m.columnHeader) {
        dimIdToColumnHeader[m.dimensionId] = m.columnHeader;
      }
    });
    
    // Helper to get breakdown value from row data
    const getBreakdownValue = (rowData: any, dimId: string, dimName: string): string | undefined => {
      // Try dimension ID first
      if (rowData[dimId] !== undefined && rowData[dimId] !== null && rowData[dimId] !== '') {
        return String(rowData[dimId]);
      }
      // Try dimension name
      if (dimName && rowData[dimName] !== undefined && rowData[dimName] !== null && rowData[dimName] !== '') {
        return String(rowData[dimName]);
      }
      // Try column header from mappings
      const columnHeader = dimIdToColumnHeader[dimId];
      if (columnHeader && rowData[columnHeader] !== undefined && rowData[columnHeader] !== null && rowData[columnHeader] !== '') {
        return String(rowData[columnHeader]);
      }
      return undefined;
    };
    
    for (const breakdownDimId of breakdownDimensionIds) {
      // Fetch breakdown dimension name
      const { data: breakdownDimData } = await supabase
        .from("dimensions")
        .select("name")
        .eq("id", breakdownDimId)
        .maybeSingle();
      
      const breakdownDimName = breakdownDimData?.name || 'Group';
      
      // Use a composite key: reportId_dimensionId
      const breakdownKey = `${report.id}_${breakdownDimId}`;
      
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
        const val = getBreakdownValue(rowData, breakdownDimId, breakdownDimName);
        if (val !== undefined) {
          uniqueValues.add(val);
        } else {
          hasUncategorized = true;
        }
      });

      // Initialize breakdown data for this breakdown (using composite key)
      if (!pivotData.breakdown_data) {
        pivotData.breakdown_data = {};
      }
      if (!pivotData.breakdown_dimension_names) {
        pivotData.breakdown_dimension_names = {};
      }
      pivotData.breakdown_data[breakdownKey] = { last_month: [], mtd: [], ytd: [] };
      pivotData.breakdown_dimension_names[breakdownKey] = breakdownDimName;
      
      // Initialize comparison breakdown data for this breakdown
      if (!pivotData.comparison_previous_period!.breakdown_data) {
        pivotData.comparison_previous_period!.breakdown_data = {};
      }
      if (!pivotData.comparison_previous_year!.breakdown_data) {
        pivotData.comparison_previous_year!.breakdown_data = {};
      }
      pivotData.comparison_previous_period!.breakdown_data[breakdownKey] = { last_month: [], mtd: [], ytd: [] };
      pivotData.comparison_previous_year!.breakdown_data[breakdownKey] = { last_month: [], mtd: [], ytd: [] };
      
      (["last_month", "mtd", "ytd"] as DateTab[]).forEach((tab) => {
        // Process each named group
        uniqueValues.forEach((groupValue) => {
          // Filter rows for this specific group value
          const groupRows = filteredByDimension.filter((row: any) => {
            const rowData = row.dimension_values || row;
            const groupVal = getBreakdownValue(rowData, breakdownDimId, breakdownDimName);
            return groupVal === groupValue;
          });
          
          // Main metrics
          const metrics = aggregateMetrics(
            groupRows,
            selectedMetrics,
            dateRanges[tab],
            undefined, // Already filtered
            metricNameToIdMap
          );

          pivotData.breakdown_data![breakdownKey][tab].push({
            groupValue,
            metrics,
          });
          
          // Comparison - Previous Period
          const prevPeriodRange = comparisonRanges.previous_period[tab];
          if (prevPeriodRange) {
            const prevPeriodMetrics = aggregateMetrics(
              groupRows,
              selectedMetrics,
              prevPeriodRange,
              undefined,
              metricNameToIdMap
            );
            pivotData.comparison_previous_period!.breakdown_data![breakdownKey][tab].push({
              groupValue,
              metrics: prevPeriodMetrics,
            });
          }
          
          // Comparison - Previous Year
          const prevYearRange = comparisonRanges.previous_year[tab];
          if (prevYearRange) {
            const prevYearMetrics = aggregateMetrics(
              groupRows,
              selectedMetrics,
              prevYearRange,
              undefined,
              metricNameToIdMap
            );
            pivotData.comparison_previous_year!.breakdown_data![breakdownKey][tab].push({
              groupValue,
              metrics: prevYearMetrics,
            });
          }
        });
        
        // Add Uncategorized group for rows without breakdown value
        if (hasUncategorized) {
          const uncategorizedRows = filteredByDimension.filter((row: any) => {
            const rowData = row.dimension_values || row;
            const val = getBreakdownValue(rowData, breakdownDimId, breakdownDimName);
            return val === undefined;
          });
          
          const metrics = aggregateMetrics(
            uncategorizedRows,
            selectedMetrics,
            dateRanges[tab],
            undefined,
            metricNameToIdMap
          );

          pivotData.breakdown_data![breakdownKey][tab].push({
            groupValue: 'Uncategorized',
            metrics,
          });
          
          // Comparison for Uncategorized
          const prevPeriodRange = comparisonRanges.previous_period[tab];
          if (prevPeriodRange) {
            const prevPeriodMetrics = aggregateMetrics(
              uncategorizedRows,
              selectedMetrics,
              prevPeriodRange,
              undefined,
              metricNameToIdMap
            );
            pivotData.comparison_previous_period!.breakdown_data![breakdownKey][tab].push({
              groupValue: 'Uncategorized',
              metrics: prevPeriodMetrics,
            });
          }
          
          const prevYearRange = comparisonRanges.previous_year[tab];
          if (prevYearRange) {
            const prevYearMetrics = aggregateMetrics(
              uncategorizedRows,
              selectedMetrics,
              prevYearRange,
              undefined,
              metricNameToIdMap
            );
            pivotData.comparison_previous_year!.breakdown_data![breakdownKey][tab].push({
              groupValue: 'Uncategorized',
              metrics: prevYearMetrics,
            });
          }
        }
      });
    } // End of for loop for each breakdown dimension
    
    // Build metric name to dimension ID mapping for date breakdown
    const mappings = Array.isArray(dsData?.column_mappings) ? dsData.column_mappings : [];
    const metricMap: Record<string, string> = {};
    mappings.forEach((m: any) => {
      if (m.dimensionName && m.dimensionId && m.dimensionId !== 'none') {
        metricMap[m.dimensionName] = m.dimensionId;
      }
    });
    
    // Get rows filtered by dimension filter for combined date breakdown
    const baseRows = sourceData.transformedRows.filter((row: any) => {
      if (!dimensionFilter || dimensionFilter.values.length === 0) return true;
      const rowData = row.dimension_values || row;
      const dimVal = rowData[dimensionFilter.dimensionId] || 
                     (dimensionFilter.dimensionName ? rowData[dimensionFilter.dimensionName] : undefined);
      return dimVal !== undefined && dimensionFilter.values.includes(String(dimVal));
    });
    
    return { rows: baseRows, metricMap };
  };

  // Helper function to safely serialize pivot data (remove circular refs, non-serializable values)
  const sanitizePivotData = (data: CachedPivotData): CachedPivotData => {
    // Simple replacer to handle basic non-serializable values
    const replacer = (key: string, value: any): any => {
      // Skip functions
      if (typeof value === 'function') {
        return undefined;
      }
      // Convert undefined to null
      if (value === undefined) {
        return null;
      }
      // Return value as-is (JSON.stringify will handle circular refs by throwing)
      return value;
    };
    
    try {
      // Try to stringify - this will throw if there are circular references
      // In that case, we'll catch and return a cleaned version
      const jsonString = JSON.stringify(data, replacer);
      const serialized = JSON.parse(jsonString);
      return serialized as CachedPivotData;
    } catch (error) {
      console.error("[AddAICardModal] Error sanitizing pivot data:", error);
      console.error("[AddAICardModal] Error type:", error instanceof Error ? error.constructor.name : typeof error);
      console.error("[AddAICardModal] Error message:", error instanceof Error ? error.message : String(error));
      
      // If serialization fails, create a clean copy manually
      // Only include the essential data structures (metrics, not full row objects)
      const cleaned: CachedPivotData = {
        mtd: Array.isArray(data?.mtd) ? data.mtd.map(item => ({
          reportId: item.reportId || '',
          reportName: item.reportName || '',
          metrics: item.metrics || {}
        })) : [],
        ytd: Array.isArray(data?.ytd) ? data.ytd.map(item => ({
          reportId: item.reportId || '',
          reportName: item.reportName || '',
          metrics: item.metrics || {}
        })) : [],
        last_month: Array.isArray(data?.last_month) ? data.last_month.map(item => ({
          reportId: item.reportId || '',
          reportName: item.reportName || '',
          metrics: item.metrics || {}
        })) : [],
      };
      
      // Add optional fields if they exist and are serializable
      if (data?.breakdown_data) {
        try {
          cleaned.breakdown_data = JSON.parse(JSON.stringify(data.breakdown_data, replacer));
        } catch {
          // Skip if not serializable
        }
      }
      
      if (data?.comparison_previous_period) {
        try {
          cleaned.comparison_previous_period = JSON.parse(JSON.stringify(data.comparison_previous_period, replacer));
        } catch {
          // Skip if not serializable
        }
      }
      
      if (data?.comparison_previous_year) {
        try {
          cleaned.comparison_previous_year = JSON.parse(JSON.stringify(data.comparison_previous_year, replacer));
        } catch {
          // Skip if not serializable
        }
      }
      
      return cleaned;
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { user } = await getUser();
      if (!user) {
        toast.error("You must be logged in to save a card");
        setIsSaving(false);
        return;
      }

      // Compute pivot data - fetch from sources and apply filters
      toast.info("Fetching data from sources and computing pivot table...", {
        duration: 10000,
        id: "computing-pivot",
      });
      const rawPivotData = await computePivotData();
      
      // Sanitize the pivot data before saving to prevent circular reference issues
      const cachedPivotData = sanitizePivotData(rawPivotData);
      toast.dismiss("computing-pivot");

      // Generate a name based on selected reports
      const cardName = selectedReports.length > 0 
        ? `${selectedReports.map(r => r.name).join(", ")} Summary`
        : "AI Summary";

      if (editingCard) {
        // Update existing card - preserve the existing name
        const { error } = await (supabase.from("ai_summary_cards") as any)
          .update({
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
        // Validate required fields before insert
        if (!selectedReportIds || selectedReportIds.length === 0) {
          toast.error("Please select at least one report");
          setIsSaving(false);
          return;
        }

        if (!selectedMetrics || selectedMetrics.length === 0) {
          toast.error("Please select at least one metric");
          setIsSaving(false);
          return;
        }

        const cardData = {
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
        };

        console.log("[AddAICardModal] Creating card with data:", {
          ...cardData,
          cached_pivot_data: "..." // Don't log the full pivot data
        });

        const { data: newCard, error } = await (supabase.from("ai_summary_cards") as any)
          .insert(cardData)
          .select()
          .single();

        if (error) {
          console.error("[AddAICardModal] Error saving AI card:", error);
          console.error("[AddAICardModal] Error details:", {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code
          });
          
          // Show more descriptive error message
          const errorMessage = error.message || "Failed to save card";
          toast.error(`Failed to save card: ${errorMessage}`);
          setIsSaving(false);
          return;
        }

        if (!newCard) {
          console.error("[AddAICardModal] No card data returned from insert");
          toast.error("Failed to save card: No data returned");
          setIsSaving(false);
          return;
        }

        console.log("[AddAICardModal] Card created successfully:", newCard.id);
        toast.success("AI Summary card created!");
        
        // Pass the new card ID to the callback
        onCardCreated?.(newCard?.id);
        onOpenChange(false);
        resetState();
        return;
      }

      onCardCreated?.();
      onOpenChange(false);
      resetState();
    } catch (err) {
      console.error("[AddAICardModal] Unexpected error saving AI card:", err);
      const errorMessage = err instanceof Error ? err.message : "Unknown error occurred";
      toast.error(`Failed to save card: ${errorMessage}`);
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
    if (mode === "api" && editingCard) {
      return `API URL for ${editingCard.name}`;
    }
    const prefix = editingCard ? "Edit: " : "";
    switch (step) {
      case "select-reports":
        return `${prefix}Select Reports`;
      case "filter-dimensions":
        return `${prefix}Filter Dimensions`;
      case "breakdown-dimensions":
        return `${prefix}Choose Dimensions`;
      case "select-metrics":
        return `${prefix}Select Metrics`;
      case "select-period":
        return `${prefix}Select Period`;
      case "preview-url":
        return mode === "api" ? "API URL Preview" : `${prefix}API URL Preview`;
    }
  };

  // Generate API URL using Supabase Edge Function
  const generateApiUrl = useMemo(() => {
    const supabaseUrl = 'https://zcxxwpwheevwavdcgfht.supabase.co';
    
    // If editing an existing card, use edge function with card ID
    if (editingCard?.id) {
      return `${supabaseUrl}/functions/v1/get-ai-summary-data?cardId=${editingCard.id}`;
    }
    
    // Otherwise, show placeholder URL (card not yet saved)
    return `${supabaseUrl}/functions/v1/get-ai-summary-data?cardId=<card-id-after-save>`;
  }, [editingCard]);

  const apiUrl = generateApiUrl;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(apiUrl);
    toast.success("API URL copied to clipboard");
  };

  const handleOpenInNewTab = () => {
    window.open(apiUrl, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {getStepTitle()}
          </DialogTitle>
          {mode === "api" && editingCard && (
            <p className="text-sm text-muted-foreground">
              API URL generated from your card configuration. Settings are synced from the card.
            </p>
          )}
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

                            {filteredValues.length > 0 && (
                              <div className="flex gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleSelectAll(activeReportTab)}
                                  className="flex-1"
                                >
                                  Select All
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleDeselectAll(activeReportTab)}
                                  className="flex-1"
                                >
                                  Deselect All
                                </Button>
                              </div>
                            )}

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
                      const breakdownCount = breakdownConfigs[report.id]?.breakdownDimensionIds?.length || 0;
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
                          {breakdownCount > 0 && (
                            <span className="text-xs opacity-70">{breakdownCount}</span>
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
                            Select dimensions to break down this report's data. Each selected dimension will create a separate breakdown table.
                          </p>
                        </div>
                        
                        <div>
                          <Label className="text-sm font-medium mb-2 block">
                            Breakdown Dimensions
                          </Label>
                          <ScrollArea className="h-[250px] border rounded-md">
                            <div className="p-2 space-y-1">
                              {activeDimensions.length > 0 ? (
                                activeDimensions.map(dim => {
                                  const isSelected = breakdownConfigs[activeReportTab]?.breakdownDimensionIds?.includes(dim.id) || false;
                                  return (
                                    <div
                                      key={dim.id}
                                      className={cn(
                                        "flex items-center gap-3 p-2 rounded cursor-pointer transition-colors",
                                        isSelected
                                          ? "bg-primary/10"
                                          : "hover:bg-muted/50"
                                      )}
                                      onClick={() => handleBreakdownToggle(activeReportTab, dim.id)}
                                    >
                                      <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={() => handleBreakdownToggle(activeReportTab, dim.id)}
                                      />
                                      <span className="text-sm">{dim.name}</span>
                                    </div>
                                  );
                                })
                              ) : (
                                <p className="text-center text-muted-foreground py-4">
                                  No dimensions available
                                </p>
                              )}
                            </div>
                          </ScrollArea>
                        </div>

                        {(breakdownConfigs[activeReportTab]?.breakdownDimensionIds?.length || 0) > 0 && (
                          <div className="mt-2 p-4 bg-primary/5 rounded-lg border border-primary/20">
                            <p className="text-sm font-medium mb-2">Selected ({breakdownConfigs[activeReportTab]?.breakdownDimensionIds?.length || 0}):</p>
                            <div className="flex flex-wrap gap-2">
                              {breakdownConfigs[activeReportTab]?.breakdownDimensionIds?.map(dimId => {
                                const dim = activeDimensions.find(d => d.id === dimId);
                                return dim ? (
                                  <span key={dimId} className="px-2 py-1 bg-primary/10 rounded text-xs">
                                    {dim.name}
                                  </span>
                                ) : null;
                              })}
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">
                              A separate breakdown table will be created for each dimension.
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

          {/* Step 5: Select Period */}
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

          {/* Step 6: API URL Preview */}
          {step === "preview-url" && (
            <div className="space-y-6 h-[500px] overflow-y-auto">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="api-url" className="text-base font-semibold">
                    API URL
                  </Label>
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <Input
                          id="api-url"
                          type="text"
                          value={apiUrl}
                          readOnly
                          className="pr-10 font-mono text-xs break-all"
                          onClick={handleCopyUrl}
                          style={{ cursor: 'pointer' }}
                          title="Click to copy"
                        />
                      </div>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleCopyUrl}
                        title="Copy URL"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={handleOpenInNewTab}
                        title="Open in new tab"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Click the URL or copy button to copy to clipboard. Open in new tab to view JSON response.
                  </p>
                </div>

                {/* Parameter Summary */}
                <div className="bg-muted/30 rounded-lg p-4">
                  <h4 className="font-medium mb-3 text-sm">Parameter Summary</h4>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="font-medium text-foreground">Reports:</span>{" "}
                      <span className="text-muted-foreground">
                        {selectedReports.length} selected
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Since:</span>{" "}
                      <span className="text-muted-foreground">{formattedSinceDate}</span>
                    </div>
                    <div>
                      <span className="font-medium text-foreground">To:</span>{" "}
                      <span className="text-muted-foreground">Today</span>
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Grouping:</span>{" "}
                      <span className="text-muted-foreground">By Month</span>
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Metrics:</span>{" "}
                      <span className="text-muted-foreground">
                        {selectedMetrics.length} selected
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Dimensions:</span>{" "}
                      <span className="text-muted-foreground">
                        {Object.values(reportConfigs).filter(c => c.selectedValues.length > 0).length} reports with filters
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Breakdown:</span>{" "}
                      <span className="text-muted-foreground">
                        {Object.values(breakdownConfigs).filter(b => b.breakdownDimensionIds.length > 0).length} reports with breakdown
                      </span>
                    </div>
                  </div>
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

          {step === "preview-url" && mode === "api" ? (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setStep("select-reports");
                }}
              >
                Edit Settings
              </Button>
              <Button onClick={handleClose}>
                Done
              </Button>
            </>
          ) : step === "select-period" && mode === "card" ? (
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-1" />
              )}
              {isSaving ? "Saving..." : editingCard ? "Update Card" : "Create Card"}
            </Button>
          ) : step === "preview-url" && mode === "card" ? (
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
