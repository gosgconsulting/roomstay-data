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
import { Search, ChevronRight, ChevronLeft, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface Report {
  id: string;
  name: string;
}

interface Dimension {
  id: string;
  name: string;
}

interface DimensionValue {
  value: string;
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

type Step = "select-reports" | "configure-dimensions" | "ai-prompt";

export const AddAICardModal = ({ open, onOpenChange }: AddAICardModalProps) => {
  const { accountId } = useParams();
  const [step, setStep] = useState<Step>("select-reports");
  const [reports, setReports] = useState<Report[]>([]);
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  const [activeReportTab, setActiveReportTab] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<Record<string, Dimension[]>>({});
  const [dimensionValues, setDimensionValues] = useState<Record<string, DimensionValue[]>>({});
  const [reportConfigs, setReportConfigs] = useState<Record<string, ReportDimensionConfig>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);
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

  // Fetch dimensions for active report
  useEffect(() => {
    const fetchDimensions = async () => {
      if (!activeReportTab || dimensions[activeReportTab]) return;

      const { data, error } = await supabase
        .from("dimensions")
        .select("id, name")
        .or(`report_id.eq.${activeReportTab},account_id.eq.${accountId}`)
        .in("type", ["text", "vlookup"])
        .order("name");

      if (!error && data) {
        setDimensions(prev => ({ ...prev, [activeReportTab]: data }));
      }
    };

    fetchDimensions();
  }, [activeReportTab, accountId]);

  // Fetch dimension values when dimension is selected
  const fetchDimensionValues = async (reportId: string, dimensionId: string) => {
    const key = `${reportId}-${dimensionId}`;
    if (dimensionValues[key]) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("get-unique-dimension-values", {
        body: { reportId, dimensionId },
      });

      if (!error && data?.values) {
        setDimensionValues(prev => ({
          ...prev,
          [key]: data.values.map((v: string) => ({ value: v })),
        }));
      }
    } catch (err) {
      console.error("Error fetching dimension values:", err);
    }
    setIsLoading(false);
  };

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
    fetchDimensionValues(reportId, dimensionId);
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

  const currentDimensionValues = useMemo(() => {
    if (!activeReportTab) return [];
    const config = reportConfigs[activeReportTab];
    if (!config?.dimensionId) return [];
    const key = `${activeReportTab}-${config.dimensionId}`;
    return dimensionValues[key] || [];
  }, [activeReportTab, reportConfigs, dimensionValues]);

  const filteredValues = useMemo(() => {
    if (!searchQuery) return currentDimensionValues;
    return currentDimensionValues.filter(v =>
      v.value.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [currentDimensionValues, searchQuery]);

  const selectedReports = useMemo(
    () => reports.filter(r => selectedReportIds.includes(r.id)),
    [reports, selectedReportIds]
  );

  const handleNext = () => {
    if (step === "select-reports" && selectedReportIds.length > 0) {
      setStep("configure-dimensions");
      setActiveReportTab(selectedReportIds[0]);
    } else if (step === "configure-dimensions") {
      setStep("ai-prompt");
    }
  };

  const handleBack = () => {
    if (step === "configure-dimensions") {
      setStep("select-reports");
    } else if (step === "ai-prompt") {
      setStep("configure-dimensions");
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
    setReportConfigs({});
    setSearchQuery("");
    setAiPrompt("");
  };

  const handleClose = () => {
    onOpenChange(false);
    resetState();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {step === "select-reports" && "Select Reports"}
            {step === "configure-dimensions" && "Configure Dimensions"}
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

          {/* Step 2: Configure Dimensions */}
          {step === "configure-dimensions" && (
            <div className="flex h-[400px] gap-4">
              {/* Left: Report tabs */}
              <div className="w-48 border-r pr-4">
                <ScrollArea className="h-full">
                  <div className="space-y-1">
                    {selectedReports.map(report => (
                      <button
                        key={report.id}
                        className={cn(
                          "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                          activeReportTab === report.id
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-muted"
                        )}
                        onClick={() => {
                          setActiveReportTab(report.id);
                          setSearchQuery("");
                        }}
                      >
                        {report.name}
                        {reportConfigs[report.id]?.selectedValues.length > 0 && (
                          <span className="ml-2 text-xs opacity-70">
                            ({reportConfigs[report.id].selectedValues.length})
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Right: Dimension selector */}
              <div className="flex-1 flex flex-col gap-4">
                {activeReportTab && (
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
                          {dimensions[activeReportTab]?.map(dim => (
                            <SelectItem key={dim.id} value={dim.id}>
                              {dim.name}
                            </SelectItem>
                          ))}
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
                            {isLoading ? (
                              <p className="text-center text-muted-foreground py-4">
                                Loading...
                              </p>
                            ) : filteredValues.length > 0 ? (
                              filteredValues.map(item => (
                                <div
                                  key={item.value}
                                  className={cn(
                                    "flex items-center gap-3 p-2 rounded cursor-pointer transition-colors",
                                    reportConfigs[activeReportTab]?.selectedValues.includes(
                                      item.value
                                    )
                                      ? "bg-primary/10"
                                      : "hover:bg-muted/50"
                                  )}
                                  onClick={() =>
                                    handleValueToggle(activeReportTab, item.value)
                                  }
                                >
                                  <Checkbox
                                    checked={reportConfigs[
                                      activeReportTab
                                    ]?.selectedValues.includes(item.value)}
                                    onCheckedChange={() =>
                                      handleValueToggle(activeReportTab, item.value)
                                    }
                                  />
                                  <span className="text-sm">{item.value}</span>
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
                          <span className="italic">No dimension selected</span>
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
