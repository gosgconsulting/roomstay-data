import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight, Sparkles, FileText, Search, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { SlideReport, SlideReportConfiguration } from "@/types/slideReports";

interface CreateChildReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  userId: string;
  masterReport: SlideReport | null;
  onReportCreated: (report: any) => void;
}

type Step = "name" | "filters";

interface Dimension {
  id: string;
  name: string;
  report_id: string | null;
}

interface ChannelDimensionConfig {
  viewByDimensionId: string;
  breakdownByDimensionId: string;
  selectedValues: string[];
}

interface ChannelFilterSelection {
  metasearch: ChannelDimensionConfig;
  sem: ChannelDimensionConfig;
  social: ChannelDimensionConfig;
}

export function CreateChildReportModal({
  open,
  onOpenChange,
  accountId,
  userId,
  masterReport,
  onReportCreated,
}: CreateChildReportModalProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("name");
  const [reportName, setReportName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<"metasearch" | "sem" | "social">("metasearch");
  const [filterSelections, setFilterSelections] = useState<ChannelFilterSelection>({
    metasearch: { viewByDimensionId: "", breakdownByDimensionId: "", selectedValues: [] },
    sem: { viewByDimensionId: "", breakdownByDimensionId: "", selectedValues: [] },
    social: { viewByDimensionId: "", breakdownByDimensionId: "", selectedValues: [] },
  });
  const [searchQuery, setSearchQuery] = useState("");
  
  // Channel dimensions - loaded from reports
  const [channelDimensions, setChannelDimensions] = useState<Record<string, Dimension[]>>({
    metasearch: [],
    sem: [],
    social: [],
  });
  const [isLoadingDimensions, setIsLoadingDimensions] = useState(false);
  
  // Dimension values - loaded when dimension is selected
  const [dimensionValues, setDimensionValues] = useState<Record<string, string[]>>({});
  const [isLoadingValues, setIsLoadingValues] = useState(false);

  // Get report IDs per channel from master report configuration
  const channelReportIds = useMemo(() => {
    const result: Record<string, string | null> = {
      metasearch: null,
      sem: null,
      social: null,
    };
    
    if (!masterReport?.report_ids) return result;
    
    const reportIds = masterReport.report_ids as Record<string, string>;
    result.metasearch = reportIds.metasearch || null;
    result.sem = reportIds.sem || null;
    result.social = reportIds.social || null;
    
    return result;
  }, [masterReport?.report_ids]);

  // Load dimensions for all channels when modal opens
  useEffect(() => {
    if (!open || !masterReport) return;
    
    const loadDimensions = async () => {
      setIsLoadingDimensions(true);
      try {
        const allReportIds = Object.values(channelReportIds).filter(Boolean) as string[];
        if (allReportIds.length === 0) return;
        
        const { data: dimensions, error } = await supabase
          .from("dimensions")
          .select("id, name, report_id")
          .in("report_id", allReportIds)
          .order("name");
        
        if (error) throw error;
        
        // Group dimensions by channel
        const grouped: Record<string, Dimension[]> = {
          metasearch: [],
          sem: [],
          social: [],
        };
        
        dimensions?.forEach((dim) => {
          if (dim.report_id === channelReportIds.metasearch) {
            grouped.metasearch.push(dim);
          } else if (dim.report_id === channelReportIds.sem) {
            grouped.sem.push(dim);
          } else if (dim.report_id === channelReportIds.social) {
            grouped.social.push(dim);
          }
        });
        
        setChannelDimensions(grouped);
      } catch (error) {
        console.error("Error loading dimensions:", error);
      } finally {
        setIsLoadingDimensions(false);
      }
    };
    
    loadDimensions();
  }, [open, masterReport, channelReportIds]);

  // Load dimension values when a dimension is selected
  const loadDimensionValues = async (dimensionId: string, reportId: string) => {
    if (!dimensionId || !reportId) return;
    
    // Check if already loaded
    if (dimensionValues[dimensionId]) return;
    
    setIsLoadingValues(true);
    try {
      // Get data sources for this report
      const { data: dataSources, error: dsError } = await supabase
        .from("data_sources")
        .select("id")
        .eq("report_id", reportId);
      
      if (dsError) throw dsError;
      if (!dataSources?.length) return;
      
      const dataSourceIds = dataSources.map(ds => ds.id);
      
      // Get dimension data
      const { data: dimData, error: dimError } = await supabase
        .from("dimension_data")
        .select("dimension_values")
        .in("data_source_id", dataSourceIds)
        .limit(5000);
      
      if (dimError) throw dimError;
      
      // Extract unique values for this dimension
      const uniqueValues = new Set<string>();
      dimData?.forEach((row) => {
        const values = row.dimension_values as Record<string, any>;
        if (values && values[dimensionId]) {
          uniqueValues.add(String(values[dimensionId]));
        }
      });
      
      const sortedValues = Array.from(uniqueValues).sort();
      setDimensionValues(prev => ({
        ...prev,
        [dimensionId]: sortedValues,
      }));
    } catch (error) {
      console.error("Error loading dimension values:", error);
    } finally {
      setIsLoadingValues(false);
    }
  };

  // Handle dimension selection change
  const handleViewByChange = (channel: keyof ChannelFilterSelection, dimensionId: string) => {
    setFilterSelections(prev => ({
      ...prev,
      [channel]: {
        ...prev[channel],
        viewByDimensionId: dimensionId,
        selectedValues: [], // Reset values when dimension changes
      },
    }));
    
    // Load values for this dimension
    const reportId = channelReportIds[channel];
    if (reportId) {
      loadDimensionValues(dimensionId, reportId);
    }
  };

  const handleBreakdownByChange = (channel: keyof ChannelFilterSelection, dimensionId: string) => {
    setFilterSelections(prev => ({
      ...prev,
      [channel]: {
        ...prev[channel],
        breakdownByDimensionId: dimensionId,
      },
    }));
  };

  // Reset on modal open
  useEffect(() => {
    if (open) {
      setStep("name");
      setReportName("");
      setSelectedChannel("metasearch");
      setSearchQuery("");
      setFilterSelections({
        metasearch: { viewByDimensionId: "", breakdownByDimensionId: "", selectedValues: [] },
        sem: { viewByDimensionId: "", breakdownByDimensionId: "", selectedValues: [] },
        social: { viewByDimensionId: "", breakdownByDimensionId: "", selectedValues: [] },
      });
      setDimensionValues({});
    }
  }, [open]);

  const generateSlug = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .substring(0, 50);
  };

  const handleCreate = async () => {
    if (!reportName.trim() || !masterReport) return;

    setIsCreating(true);
    try {
      const slug = generateSlug(reportName);
      
      // Create child report with filter configurations
      const childConfiguration: SlideReportConfiguration = {
        ...(masterReport.configuration as SlideReportConfiguration),
        parentReportId: masterReport.id,
        isChildReport: true,
        childFilterSelections: filterSelections as any,
      };

      const { data, error } = await supabase
        .from("slide_reports")
        .insert({
          name: reportName.trim(),
          account_id: accountId,
          user_id: userId,
          configuration: childConfiguration as any,
          report_ids: masterReport.report_ids as any,
          pivot_data: {}, // Will be computed from master report's data with filters applied
          date_range: masterReport.date_range as any,
          is_active: true,
          description: `Child report of Master Report with custom filters`,
        })
        .select()
        .single();

      if (error) throw error;

      onReportCreated(data);
      onOpenChange(false);
      
      // Navigate to the child report with unique slug
      navigate(`/tools/reports/${accountId}/${slug}?reportId=${data.id}`);
    } catch (error) {
      console.error("Error creating child report:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const canProceed = () => {
    if (step === "name") {
      return reportName.trim().length > 0;
    }
    return true;
  };

  const goNext = () => {
    if (step === "name") {
      setStep("filters");
    } else if (step === "filters") {
      handleCreate();
    }
  };

  const goBack = () => {
    if (step === "filters") {
      setStep("name");
    }
  };

  const toggleValue = (value: string) => {
    setFilterSelections(prev => {
      const current = prev[selectedChannel].selectedValues;
      const isSelected = current.includes(value);
      return {
        ...prev,
        [selectedChannel]: {
          ...prev[selectedChannel],
          selectedValues: isSelected
            ? current.filter(v => v !== value)
            : [...current, value],
        },
      };
    });
  };

  const selectAll = () => {
    const dimId = filterSelections[selectedChannel].viewByDimensionId;
    const allValues = dimensionValues[dimId] || [];
    setFilterSelections(prev => ({
      ...prev,
      [selectedChannel]: {
        ...prev[selectedChannel],
        selectedValues: [...allValues],
      },
    }));
  };

  const deselectAll = () => {
    setFilterSelections(prev => ({
      ...prev,
      [selectedChannel]: {
        ...prev[selectedChannel],
        selectedValues: [],
      },
    }));
  };

  const currentDimensions = channelDimensions[selectedChannel] || [];
  const viewByDimId = filterSelections[selectedChannel].viewByDimensionId;
  const breakdownByDimId = filterSelections[selectedChannel].breakdownByDimensionId;
  const currentValues = dimensionValues[viewByDimId] || [];
  const selectedValues = filterSelections[selectedChannel].selectedValues;

  const filteredValues = currentValues.filter(v =>
    v.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getChannelValueCount = (channel: keyof ChannelFilterSelection) => {
    return filterSelections[channel].selectedValues.length;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Create Child Report
          </DialogTitle>
          <DialogDescription>
            {step === "name" && "Give your report a unique name."}
            {step === "filters" && "Select a dimension and choose which values to include."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 py-4">
          {step === "name" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="report-name">Report Name</Label>
                <Input
                  id="report-name"
                  placeholder="e.g., Brady Hotels Central Melbourne"
                  value={reportName}
                  onChange={(e) => setReportName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canProceed()) {
                      goNext();
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  This will create a filtered view of the Master Report data.
                </p>
              </div>
              
              <div className="p-4 bg-muted/50 rounded-lg border border-dashed">
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">Child Report</p>
                    <ul className="text-xs text-muted-foreground mt-1 space-y-1">
                      <li>• Uses Master Report's computed data</li>
                      <li>• Filter data by selecting specific values</li>
                      <li>• No separate data refresh needed</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === "filters" && (
            <div className="flex gap-4 h-[400px]">
              {/* Channel Tabs */}
              <div className="w-32 flex flex-col gap-1">
                {(["metasearch", "sem", "social"] as const).map((channel) => {
                  const hasDimensions = channelDimensions[channel]?.length > 0;
                  const count = getChannelValueCount(channel);
                  return (
                    <Button
                      key={channel}
                      variant={selectedChannel === channel ? "default" : "ghost"}
                      className={cn(
                        "justify-between h-10",
                        !hasDimensions && "opacity-50"
                      )}
                      onClick={() => {
                        setSelectedChannel(channel);
                        setSearchQuery("");
                      }}
                      disabled={!hasDimensions}
                    >
                      <span className="capitalize">{channel}</span>
                      {count > 0 && (
                        <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-primary-foreground/20">
                          {count}
                        </span>
                      )}
                    </Button>
                  );
                })}
              </div>

              {/* Dimension Selectors + Values List */}
              <div className="flex-1 flex flex-col border rounded-lg">
                {isLoadingDimensions ? (
                  <div className="flex-1 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : currentDimensions.length > 0 ? (
                  <>
                    {/* Dimension Selectors Header */}
                    <div className="p-3 border-b bg-muted/30">
                      <div className="flex items-center gap-6">
                        {/* View by Selector */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                            View by:
                          </span>
                          <Select
                            value={viewByDimId}
                            onValueChange={(value) => handleViewByChange(selectedChannel, value)}
                          >
                            <SelectTrigger className="w-[160px] h-8 bg-background">
                              <SelectValue placeholder="Select..." />
                            </SelectTrigger>
                            <SelectContent>
                              {currentDimensions.map((dim) => (
                                <SelectItem key={dim.id} value={dim.id}>
                                  {dim.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Breakdown by Selector */}
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                            Breakdown by:
                          </span>
                          <Select
                            value={breakdownByDimId}
                            onValueChange={(value) => handleBreakdownByChange(selectedChannel, value)}
                          >
                            <SelectTrigger className="w-[160px] h-8 bg-background">
                              <SelectValue placeholder="None" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="">None</SelectItem>
                              {currentDimensions
                                .filter((dim) => dim.id !== viewByDimId)
                                .map((dim) => (
                                  <SelectItem key={dim.id} value={dim.id}>
                                    {dim.name}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    {/* Search and Select Controls */}
                    {viewByDimId && (
                      <div className="p-3 border-b space-y-3">
                        <div className="relative">
                          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                          <Input
                            placeholder="Search values..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-8"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={selectAll}
                            disabled={currentValues.length === 0}
                          >
                            Select All
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1"
                            onClick={deselectAll}
                            disabled={selectedValues.length === 0}
                          >
                            Deselect All
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Values List */}
                    <ScrollArea className="flex-1">
                      {!viewByDimId ? (
                        <div className="flex items-center justify-center h-full p-4">
                          <p className="text-sm text-muted-foreground text-center">
                            Select a dimension in "View by" to see available values
                          </p>
                        </div>
                      ) : isLoadingValues ? (
                        <div className="flex items-center justify-center p-8">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : filteredValues.length > 0 ? (
                        <div className="p-2 space-y-1">
                          {filteredValues.map((value) => {
                            const isSelected = selectedValues.includes(value);
                            return (
                              <div
                                key={value}
                                className={cn(
                                  "flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-muted/50",
                                  isSelected && "bg-primary/10"
                                )}
                                onClick={() => toggleValue(value)}
                              >
                                <Checkbox checked={isSelected} />
                                <span className="text-sm">{value}</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : currentValues.length === 0 ? (
                        <div className="flex items-center justify-center h-full p-4">
                          <p className="text-sm text-muted-foreground text-center">
                            No values found for this dimension
                          </p>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center h-full p-4">
                          <p className="text-sm text-muted-foreground text-center">
                            No matching values
                          </p>
                        </div>
                      )}
                    </ScrollArea>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-muted-foreground">
                    <p className="text-sm">No dimensions available for this channel</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <div>
            {step === "filters" && (
              <Button variant="ghost" onClick={goBack} className="gap-1">
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={goNext}
              disabled={!canProceed() || isCreating}
              className="gap-2"
            >
              {isCreating ? (
                "Creating..."
              ) : step === "filters" ? (
                <>
                  Create Report
                  <ChevronRight className="h-4 w-4" />
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
