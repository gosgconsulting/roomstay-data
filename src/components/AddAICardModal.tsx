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

interface EditingCard {
  id: string;
  name: string;
  report_ids: string[];
  report_configs: Record<string, any>;
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

type Step = "select-reports" | "filter-dimensions" | "select-metrics" | "select-period" | "ai-prompt";

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
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([
    "Impressions",
    "Clicks",
    "Cost",
    "Revenue",
    "ROAS",
  ]);
  const [sinceDate, setSinceDate] = useState<string>(getDefaultSinceDate());
  const [aiPrompt, setAiPrompt] = useState(DEFAULT_AI_PROMPT);

  // Initialize from editingCard when editing
  useEffect(() => {
    if (editingCard && open) {
      setSelectedReportIds(editingCard.report_ids || []);
      setReportConfigs(editingCard.report_configs || {});
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

  const handleNext = () => {
    if (step === "select-reports" && selectedReportIds.length > 0) {
      setStep("filter-dimensions");
      setActiveReportTab(selectedReportIds[0]);
    } else if (step === "filter-dimensions") {
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
    } else if (step === "select-metrics") {
      setStep("filter-dimensions");
    } else if (step === "select-period") {
      setStep("select-metrics");
    } else if (step === "ai-prompt") {
      setStep("select-period");
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { user } = await getUser();
      if (!user) {
        toast.error("You must be logged in to save a card");
        return;
      }

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
            report_configs: reportConfigs,
            selected_metrics: selectedMetrics,
            since_date: sinceDate,
            ai_prompt: aiPrompt,
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
          report_configs: reportConfigs,
          selected_metrics: selectedMetrics,
          since_date: sinceDate,
          ai_prompt: aiPrompt,
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

          {/* Step 3: Select Metrics */}
          {step === "select-metrics" && (
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground mb-4">
                  Select the metrics to include in your AI summary.
                </p>
                {AVAILABLE_METRICS.map(metric => (
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
                  </div>
                ))}
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
                    const dim = dimensions[report.id]?.find(
                      d => d.id === config?.dimensionId
                    );
                    return (
                      <div key={report.id}>
                        <span className="font-medium text-foreground">
                          {report.name}:
                        </span>{" "}
                        {dim ? (
                          <>
                            {dim.name} ({config?.selectedValues.length || 0}{" "}
                            selected)
                          </>
                        ) : (
                          <span className="italic">No filter selected</span>
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
