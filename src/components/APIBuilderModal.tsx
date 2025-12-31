import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "react-router-dom";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { Copy, ExternalLink, ChevronRight, ChevronLeft, Search, Loader2, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchSourceData, type SourceDataResult } from "@/hooks/dataSources/useSourceData";
import { extractUniqueDimensionValues } from "@/lib/filters/extractDimensionValues";
import { getUser } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface APIBuilderModalProps {
  accountId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

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

// Helper function to infer channel from report name
const inferChannel = (reportName: string): string => {
  const name = reportName.toLowerCase();
  if (name.includes("metasearch")) return "Metasearch";
  if (name.includes("sem")) return "SEM";
  if (name.includes("social")) return "Social";
  return "Other";
};

// Group reports by channel
const groupReportsByChannel = (reports: Report[]): Record<string, Report[]> => {
  const grouped: Record<string, Report[]> = {};
  reports.forEach(report => {
    const channel = inferChannel(report.name);
    if (!grouped[channel]) {
      grouped[channel] = [];
    }
    grouped[channel].push(report);
  });
  return grouped;
};

type Step = "select-reports" | "filter-dimensions" | "breakdown-dimensions" | "select-metrics" | "select-period" | "preview-url";

export const APIBuilderModal = ({ accountId: propAccountId, open, onOpenChange, cardConfig, cardName }: APIBuilderModalProps) => {
  const { accountId: paramAccountId } = useParams<{ accountId: string }>();
  const accountId = propAccountId || paramAccountId;
  const { toast } = useToast();
  
  // If cardConfig is provided, start at preview-url step, otherwise start at select-reports
  const [step, setStep] = useState<Step>(cardConfig ? "preview-url" : "select-reports");
  const [reports, setReports] = useState<Report[]>([]);
  // Initialize state from cardConfig if provided, otherwise use defaults
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>(cardConfig?.reportIds || []);
  const [activeReportTab, setActiveReportTab] = useState<string | null>(cardConfig?.reportIds?.[0] || null);
  const [dataSources, setDataSources] = useState<Record<string, DataSource>>({});
  const [sourceDataCache, setSourceDataCache] = useState<Record<string, SourceDataResult>>({});
  const [loadingReports, setLoadingReports] = useState<Set<string>>(new Set());
  const [dimensions, setDimensions] = useState<Record<string, Dimension[]>>({});
  const [reportDimensionConfigs, setReportDimensionConfigs] = useState<Record<string, ReportDimensionConfig>>(
    cardConfig?.reportConfigs || {}
  );
  const [reportBreakdownConfigs, setReportBreakdownConfigs] = useState<Record<string, string[]>>(
    cardConfig?.breakdownConfigs || {}
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(
    cardConfig?.selectedMetrics || [
      "Impressions",
      "Clicks",
      "Cost",
      "Revenue",
      "ROAS",
    ]
  );
  const [sinceDate, setSinceDate] = useState<string>(
    cardConfig?.sinceDate || (() => {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    })
  );

  // Group reports by channel
  const reportsByChannel = useMemo(() => groupReportsByChannel(reports), [reports]);
  
  // Get selected reports
  const selectedReports = useMemo(
    () => reports.filter(r => selectedReportIds.includes(r.id)),
    [reports, selectedReportIds]
  );

  // Get active report's dimensions
  const activeDimensions = useMemo(() => {
    if (!activeReportTab) return [];
    return dimensions[activeReportTab] || [];
  }, [activeReportTab, dimensions]);

  // Get active report's dimension values
  const currentDimensionValues = useMemo(() => {
    if (!activeReportTab) return [];
    const sourceData = sourceDataCache[activeReportTab];
    if (!sourceData?.transformedRows) return [];
    
    const config = reportDimensionConfigs[activeReportTab];
    if (!config?.dimensionId) return [];

    return extractUniqueDimensionValues(sourceData.transformedRows, {
      dimensionId: config.dimensionId,
    });
  }, [activeReportTab, sourceDataCache, reportDimensionConfigs]);

  const filteredValues = useMemo(() => {
    if (!searchQuery) return currentDimensionValues;
    return currentDimensionValues.filter(v =>
      v.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [currentDimensionValues, searchQuery]);

  // Check if active report is loading
  const isActiveReportLoading = useMemo(() => {
    if (!activeReportTab) return false;
    return loadingReports.has(activeReportTab);
  }, [activeReportTab, loadingReports]);

  // Reset state when modal opens
  useEffect(() => {
    if (!open) return;
    
    if (cardConfig) {
      // Initialize from cardConfig - skip to preview
      setStep("preview-url");
      setSelectedReportIds(cardConfig.reportIds);
      setActiveReportTab(cardConfig.reportIds[0] || null);
      setReportDimensionConfigs(cardConfig.reportConfigs);
      setReportBreakdownConfigs(cardConfig.breakdownConfigs);
      setSelectedMetrics(cardConfig.selectedMetrics);
      setSinceDate(cardConfig.sinceDate);
      setSearchQuery("");
    } else {
      // Normal mode - reset to defaults
      setStep("select-reports");
      setSelectedReportIds([]);
      setActiveReportTab(null);
      setSearchQuery("");
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      setSinceDate(`${year}-${month}-${day}`);
    }
  }, [open, cardConfig]);

  // Fetch reports for the account
  useEffect(() => {
    const fetchReports = async () => {
      if (!accountId || !open) return;
      
      const { data, error } = await supabase
        .from("reports")
        .select("id, name")
        .eq("account_id", accountId)
        .order("name");

      if (!error && data) {
        setReports(data);
        // Auto-select all reports by default (only if no cardConfig)
        if (!cardConfig) {
          setSelectedReportIds(data.map(r => r.id));
        }
      }
    };

    fetchReports();
  }, [accountId, open, cardConfig]);

  // Fetch all data sources and source data when entering dimension/breakdown steps or when opened from card
  useEffect(() => {
    const fetchAllDataForReports = async () => {
      // If opened from card, load data immediately for display purposes
      const shouldLoadData = cardConfig 
        ? open && selectedReportIds.length > 0
        : (step === "filter-dimensions" || step === "breakdown-dimensions") && selectedReportIds.length > 0;
      
      if (!shouldLoadData) return;

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

          // Fetch source data
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
  }, [step, selectedReportIds, accountId, sourceDataCache, cardConfig, open]);

  // Initialize dimension configs with all values selected by default
  useEffect(() => {
    if (step === "filter-dimensions" && activeReportTab && currentDimensionValues.length > 0) {
      const config = reportDimensionConfigs[activeReportTab];
      if (!config || config.selectedValues.length === 0) {
        setReportDimensionConfigs(prev => ({
          ...prev,
          [activeReportTab]: {
            reportId: activeReportTab,
            dimensionId: config?.dimensionId || null,
            selectedValues: currentDimensionValues,
          },
        }));
      }
    }
  }, [step, activeReportTab, currentDimensionValues, reportDimensionConfigs]);

  // Handlers
  const handleReportToggle = (reportId: string) => {
    setSelectedReportIds(prev =>
      prev.includes(reportId)
        ? prev.filter(id => id !== reportId)
        : [...prev, reportId]
    );
  };

  const handleChannelToggle = (channel: string, selectAll: boolean) => {
    const channelReports = reportsByChannel[channel] || [];
    const channelReportIds = channelReports.map(r => r.id);
    
    if (selectAll) {
      setSelectedReportIds(prev => {
        const newIds = [...prev];
        channelReportIds.forEach(id => {
          if (!newIds.includes(id)) {
            newIds.push(id);
          }
        });
        return newIds;
      });
    } else {
      setSelectedReportIds(prev => prev.filter(id => !channelReportIds.includes(id)));
    }
  };

  const handleDimensionChange = (reportId: string, dimensionId: string) => {
    const sourceData = sourceDataCache[reportId];
    const allValues = sourceData?.transformedRows 
      ? extractUniqueDimensionValues(sourceData.transformedRows, { dimensionId })
      : [];
    
    setReportDimensionConfigs(prev => ({
      ...prev,
      [reportId]: {
        reportId,
        dimensionId,
        selectedValues: allValues, // Default to all selected
      },
    }));
    setSearchQuery("");
  };

  const handleValueToggle = (reportId: string, value: string) => {
    setReportDimensionConfigs(prev => {
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

  const handleSelectAllValues = (reportId: string) => {
    const config = reportDimensionConfigs[reportId];
    if (!config?.dimensionId) return;
    
    const sourceData = sourceDataCache[reportId];
    const allValues = sourceData?.transformedRows 
      ? extractUniqueDimensionValues(sourceData.transformedRows, { dimensionId: config.dimensionId })
      : [];
    
    setReportDimensionConfigs(prev => ({
      ...prev,
      [reportId]: { ...config, selectedValues: allValues },
    }));
  };

  const handleDeselectAllValues = (reportId: string) => {
    setReportDimensionConfigs(prev => {
      const config = prev[reportId];
      if (!config) return prev;
      return {
        ...prev,
        [reportId]: { ...config, selectedValues: [] },
      };
    });
  };

  const handleBreakdownToggle = (reportId: string, dimensionId: string) => {
    setReportBreakdownConfigs(prev => {
      const currentIds = prev[reportId] || [];
      const newIds = currentIds.includes(dimensionId)
        ? currentIds.filter(id => id !== dimensionId)
        : [...currentIds, dimensionId];
      return {
        ...prev,
        [reportId]: newIds,
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

  const handleNext = () => {
    if (step === "select-reports") {
      if (selectedReportIds.length === 0) {
        toast({
          title: "No reports selected",
          description: "Please select at least one report to continue.",
          variant: "destructive",
        });
        return;
      }
      setStep("filter-dimensions");
      setActiveReportTab(selectedReportIds[0]);
    } else if (step === "filter-dimensions") {
      setStep("breakdown-dimensions");
      setActiveReportTab(selectedReportIds[0]);
    } else if (step === "breakdown-dimensions") {
      setStep("select-metrics");
    } else if (step === "select-metrics") {
      if (selectedMetrics.length === 0) {
        toast({
          title: "No metrics selected",
          description: "Please select at least one metric to continue.",
          variant: "destructive",
        });
        return;
      }
      setStep("select-period");
    } else if (step === "select-period") {
      setStep("preview-url");
    }
  };

  const handleBack = () => {
    if (step === "filter-dimensions") {
      setStep("select-reports");
      setActiveReportTab(null);
    } else if (step === "breakdown-dimensions") {
      setStep("filter-dimensions");
      setActiveReportTab(selectedReportIds[0]);
    } else if (step === "select-metrics") {
      setStep("breakdown-dimensions");
      setActiveReportTab(selectedReportIds[0]);
    } else if (step === "select-period") {
      setStep("select-metrics");
    } else if (step === "preview-url") {
      setStep("select-period");
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  // Generate API URL
  const generateApiUrl = useCallback(() => {
    const params = new URLSearchParams();
    
    // Add reportIds (comma-separated)
    if (selectedReportIds.length > 0) {
      params.append('reportIds', selectedReportIds.join(','));
    }
    
    // Add since date (start date)
    if (sinceDate) {
      params.append('date_from', sinceDate);
    }
    
    // End date is always today
    const today = new Date().toISOString().split('T')[0];
    params.append('date_to', today);
    
    // Add metrics
    selectedMetrics.forEach(metric => {
      params.append('metrics[]', metric);
    });
    
    // Add dimension filters per report
    selectedReportIds.forEach(reportId => {
      const config = reportDimensionConfigs[reportId];
      if (config?.dimensionId && config.selectedValues.length > 0) {
        config.selectedValues.forEach(value => {
          params.append(`dimensions[${reportId}][${config.dimensionId}][]`, value);
        });
      }
    });
    
    // Add breakdown dimensions per report
    selectedReportIds.forEach(reportId => {
      const breakdownIds = reportBreakdownConfigs[reportId] || [];
      breakdownIds.forEach(dimId => {
        params.append(`breakdown[${reportId}][]`, dimId);
      });
    });
    
    // No pagination - load everything
    
    const baseUrl = `${window.location.origin}/api/reports`;
    const queryString = params.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  }, [selectedReportIds, sinceDate, selectedMetrics, reportDimensionConfigs, reportBreakdownConfigs]);

  const apiUrl = generateApiUrl();

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(apiUrl);
    toast({
      title: "URL Copied",
      description: "API URL has been copied to clipboard",
    });
  };

  const handleOpenInNewTab = () => {
    window.open(apiUrl, '_blank');
  };

  // Get step title
  const getStepTitle = () => {
    if (cardConfig && cardName) {
      return `API URL for ${cardName}`;
    }
    switch (step) {
      case "select-reports":
        return "Select Reports";
      case "filter-dimensions":
        return "Filter Dimensions";
      case "breakdown-dimensions":
        return "Breakdown By";
      case "select-metrics":
        return "Select Metrics";
      case "select-period":
        return "Select Period";
      case "preview-url":
        return "API URL Preview";
      default:
        return "API URL Builder";
    }
  };

  // Format since date for display
  const formattedSinceDate = useMemo(() => {
    if (!sinceDate) return "";
    try {
      const date = new Date(sinceDate);
      return format(date, "MMM d, yyyy");
    } catch {
      return sinceDate;
    }
  }, [sinceDate]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>{getStepTitle()}</span>
          </DialogTitle>
          <DialogDescription>
            {cardConfig ? (
              "API URL generated from your card configuration. Settings are synced from the card."
            ) : (
              <>
                {step === "select-reports" && "Select reports to include in your API. Reports are grouped by channel."}
                {step === "filter-dimensions" && "Select dimensions and values to filter data for each channel."}
                {step === "breakdown-dimensions" && "Optionally select dimensions to break down the data."}
                {step === "select-metrics" && "Select the metrics to include in your API response."}
                {step === "select-period" && "Select start date to filter data. End date is automatically set to today."}
                {step === "preview-url" && "Review and copy your generated API URL."}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {/* Step 1: Select Reports */}
          {step === "select-reports" && (
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-4">
                {Object.entries(reportsByChannel).map(([channel, channelReports]) => {
                  const allSelected = channelReports.every(r => selectedReportIds.includes(r.id));
                  const someSelected = channelReports.some(r => selectedReportIds.includes(r.id));
                  
                  return (
                    <div key={channel} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-base font-semibold">
                          {channel} ({channelReports.length})
                        </Label>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleChannelToggle(channel, true)}
                            disabled={allSelected}
                          >
                            Select All
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleChannelToggle(channel, false)}
                            disabled={!someSelected}
                          >
                            Deselect All
                          </Button>
                        </div>
                      </div>
                      <div className="space-y-2 pl-4">
                        {channelReports.map(report => (
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
                      </div>
                    </div>
                  );
                })}
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
            <div className="flex h-[500px] gap-4">
              {/* Left: Channel/Report tabs */}
              <div className="w-48 border-r pr-4">
                <ScrollArea className="h-full">
                  <div className="space-y-1">
                    {selectedReports.map(report => {
                      const isLoading = loadingReports.has(report.id);
                      const hasData = !!sourceDataCache[report.id];
                      const config = reportDimensionConfigs[report.id];
                      const valueCount = config?.selectedValues.length || 0;
                      
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
                            {valueCount > 0 && (
                              <span className="ml-1 text-xs opacity-70">
                                ({valueCount})
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
                            value={reportDimensionConfigs[activeReportTab]?.dimensionId || ""}
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

                        {reportDimensionConfigs[activeReportTab]?.dimensionId && (
                          <>
                            <div className="flex gap-2">
                              <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                  placeholder="Search values..."
                                  value={searchQuery}
                                  onChange={e => setSearchQuery(e.target.value)}
                                  className="pl-9"
                                />
                              </div>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleSelectAllValues(activeReportTab)}
                              >
                                Select All
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleDeselectAllValues(activeReportTab)}
                              >
                                Deselect All
                              </Button>
                            </div>

                            <ScrollArea className="flex-1 border rounded-md">
                              <div className="p-2 space-y-1">
                                {filteredValues.length > 0 ? (
                                  filteredValues.map(value => (
                                    <div
                                      key={value}
                                      className={cn(
                                        "flex items-center gap-3 p-2 rounded cursor-pointer transition-colors",
                                        reportDimensionConfigs[activeReportTab]?.selectedValues.includes(value)
                                          ? "bg-primary/10"
                                          : "hover:bg-muted/50"
                                      )}
                                      onClick={() =>
                                        handleValueToggle(activeReportTab, value)
                                      }
                                    >
                                      <Checkbox
                                        checked={reportDimensionConfigs[activeReportTab]?.selectedValues.includes(value)}
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

          {/* Step 3: Breakdown By */}
          {step === "breakdown-dimensions" && (
            <div className="flex h-[500px] gap-4">
              {/* Left: Channel/Report tabs */}
              <div className="w-48 border-r pr-4">
                <ScrollArea className="h-full">
                  <div className="space-y-1">
                    {selectedReports.map(report => {
                      const breakdownCount = reportBreakdownConfigs[report.id]?.length || 0;
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
                            Select dimensions to break down this report's data. Each selected dimension will create a separate breakdown table. This step is optional.
                          </p>
                        </div>
                        
                        <div>
                          <Label className="text-sm font-medium mb-2 block">
                            Breakdown Dimensions
                          </Label>
                          <ScrollArea className="h-[300px] border rounded-md">
                            <div className="p-2 space-y-1">
                              {activeDimensions.length > 0 ? (
                                activeDimensions.map(dim => {
                                  const isSelected = reportBreakdownConfigs[activeReportTab]?.includes(dim.id) || false;
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

                        {(reportBreakdownConfigs[activeReportTab]?.length || 0) > 0 && (
                          <div className="mt-2 p-4 bg-primary/5 rounded-lg border border-primary/20">
                            <p className="text-sm font-medium mb-2">
                              Selected ({reportBreakdownConfigs[activeReportTab]?.length || 0}):
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {reportBreakdownConfigs[activeReportTab]?.map(dimId => {
                                const dim = activeDimensions.find(d => d.id === dimId);
                                return dim ? (
                                  <span key={dimId} className="px-2 py-1 bg-primary/10 rounded text-xs">
                                    {dim.name}
                                  </span>
                                ) : null;
                              })}
                            </div>
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
            <ScrollArea className="h-[500px] pr-4">
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground mb-4">
                  Select the metrics to include in your API response.
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

          {/* Step 5: Select Period - Simplified (Since Date only) */}
          {step === "select-period" && (
            <div className="space-y-6 h-[500px] overflow-y-auto">
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
                      Select start date to filter data. End date is automatically set to today.
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
                  <p>
                    <span className="font-medium text-foreground">Reports:</span>{" "}
                    {selectedReports.map(r => r.name).join(", ")}
                  </p>
                  <p>
                    <span className="font-medium text-foreground">Metrics:</span>{" "}
                    {selectedMetrics.join(", ")}
                  </p>
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
                    API URL Preview
                  </Label>
                  <div className="flex gap-2 mt-2">
                    <div className="flex-1 relative">
                      <Input
                        id="api-url"
                        type="text"
                        value={apiUrl}
                        readOnly
                        className="pr-10 font-mono text-xs"
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
                  <p className="text-xs text-muted-foreground mt-1">
                    Click the URL or copy button to copy to clipboard
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
                      <span className="font-medium text-foreground">End Date:</span>{" "}
                      <span className="text-muted-foreground">Today</span>
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
                        {Object.values(reportDimensionConfigs).filter(c => c.selectedValues.length > 0).length} reports with filters
                      </span>
                    </div>
                    <div>
                      <span className="font-medium text-foreground">Breakdown:</span>{" "}
                      <span className="text-muted-foreground">
                        {Object.values(reportBreakdownConfigs).filter(b => b.length > 0).length} reports with breakdown
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
          {cardConfig && step === "preview-url" ? (
            // When opened from card and on preview step, show Edit Settings and Done buttons
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
          ) : cardConfig ? (
            // When editing settings from card, show normal navigation
            <>
              <Button
                variant="outline"
                onClick={step === "select-reports" ? handleClose : handleBack}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                {step === "select-reports" ? "Cancel" : "Back"}
              </Button>
              {step === "preview-url" ? (
                <Button onClick={handleClose}>
                  Done
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
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={step === "select-reports" ? handleClose : handleBack}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                {step === "select-reports" ? "Cancel" : "Back"}
              </Button>

              {step === "preview-url" ? (
                <Button onClick={handleClose}>
                  Done
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
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
