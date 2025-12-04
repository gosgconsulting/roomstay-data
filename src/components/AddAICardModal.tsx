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
import { fetchSourceData, type SourceDataResult } from "@/hooks/dataSources/useSourceData";
import { extractUniqueDimensionValues } from "@/lib/filters/extractDimensionValues";
import { getUser } from "@/lib/auth";
import { Search, ChevronRight, ChevronLeft, Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

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

interface AddAICardModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = "select-reports" | "filter-dimensions" | "ai-prompt";

export const AddAICardModal = ({ open, onOpenChange }: AddAICardModalProps) => {
  const { accountId } = useParams();
  const [step, setStep] = useState<Step>("select-reports");
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const [activeReportTab, setActiveReportTab] = useState<string | null>(null);
  const [dataSources, setDataSources] = useState<Record<string, DataSource>>({});
  const [sourceDataCache, setSourceDataCache] = useState<Record<string, SourceDataResult>>({});
  const [loadingReports, setLoadingReports] = useState<Set<string>>(new Set());
  const [dimensions, setDimensions] = useState<Record<string, Dimension[]>>({});
  const [reportConfigs, setReportConfigs] = useState<Record<string, ReportDimensionConfig>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");

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

          // Extract dimension IDs from column mappings
          const columnMappings = Array.isArray(dsData.column_mappings) ? dsData.column_mappings : [];
          const dimensionIds = columnMappings
            .filter((m: any) => m.dimensionId)
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

  const selectedReports = useMemo(
    () => reports.filter(r => selectedReportIds.includes(r.id)),
    [reports, selectedReportIds]
  );

  const handleNext = () => {
    if (step === "select-reports" && selectedReportIds.length > 0) {
      setStep("filter-dimensions");
      setActiveReportTab(selectedReportIds[0]);
    } else if (step === "filter-dimensions") {
      setStep("ai-prompt");
    }
  };

  const handleBack = () => {
    if (step === "filter-dimensions") {
      setStep("select-reports");
    } else if (step === "ai-prompt") {
      setStep("filter-dimensions");
    }
  };

  const handleSave = () => {
    // TODO: Save card configuration and generate AI summary
    console.log("Saving card config:", { reportConfigs, aiPrompt });
    onOpenChange(false);
    resetState();
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
    setAiPrompt("");
    setLoadingReports(new Set());
  };

  const handleClose = () => {
    onOpenChange(false);
    resetState();
  };

  const activeDimensions = activeReportTab ? dimensions[activeReportTab] || [] : [];
  const isActiveReportLoading = activeReportTab ? loadingReports.has(activeReportTab) : false;
  const activeSourceData = activeReportTab ? sourceDataCache[activeReportTab] : null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {step === "select-reports" && "Select Reports"}
            {step === "filter-dimensions" && "Filter Dimensions"}
            {step === "ai-prompt" && "AI Summary Prompt"}
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

          {/* Step 3: AI Prompt */}
          {step === "ai-prompt" && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium mb-2 block">
                  AI Prompt (optional)
                </Label>
                <textarea
                  className="w-full h-32 px-3 py-2 border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-primary bg-background"
                  placeholder="Enter additional instructions for the AI summary (e.g., 'Focus on performance trends and key insights...')"
                  value={aiPrompt}
                  onChange={e => setAiPrompt(e.target.value)}
                />
              </div>

              <div className="bg-muted/50 rounded-lg p-4">
                <h4 className="font-medium mb-2">Summary Configuration</h4>
                <div className="space-y-2 text-sm text-muted-foreground">
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
            <Button onClick={handleSave}>
              <Sparkles className="h-4 w-4 mr-1" />
              Generate Summary
            </Button>
          ) : (
            <Button
              onClick={handleNext}
              disabled={
                step === "select-reports" && selectedReportIds.length === 0
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
