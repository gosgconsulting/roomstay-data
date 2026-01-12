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
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight, Sparkles, FileText, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { SlideReport, SlideReportConfiguration, SlideReportPivotData } from "@/types/slideReports";

interface CreateChildReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  userId: string;
  masterReport: SlideReport | null;
  onReportCreated: (report: any) => void;
}

type Step = "name" | "filters";

interface ChannelFilterSelection {
  metasearch: Record<string, string[]>;
  sem: Record<string, string[]>;
  social: Record<string, string[]>;
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
    metasearch: {},
    sem: {},
    social: {},
  });
  const [searchQuery, setSearchQuery] = useState("");

  // Get available filter values from master report's pivot data
  const availableFilters = useMemo(() => {
    const result: Record<string, Record<string, string[]>> = {
      metasearch: {},
      sem: {},
      social: {},
    };
    
    if (!masterReport?.pivot_data) return result;
    
    const pivotData = masterReport.pivot_data as SlideReportPivotData;
    const channels = pivotData.channels;
    
    if (!channels) return result;
    
    // Extract unique values from each channel's filter data
    Object.entries(channels).forEach(([channelKey, channelData]) => {
      const channel = channelKey as "metasearch" | "sem" | "social";
      if (channelData?.filterUniqueValues) {
        Object.entries(channelData.filterUniqueValues).forEach(([dimId, dimData]) => {
          // Handle both possible structures: { name, values } or direct array
          const values = Array.isArray(dimData) ? dimData : (dimData as any)?.values;
          if (Array.isArray(values) && values.length > 0) {
            result[channel][dimId] = values;
          }
        });
      }
    });
    
    return result;
  }, [masterReport?.pivot_data]);

  // Get dimension names from master report configuration
  const dimensionNames = useMemo(() => {
    const result: Record<string, string> = {};
    
    if (!masterReport?.configuration) return result;
    
    const config = masterReport.configuration as SlideReportConfiguration;
    
    // Get names from filterConfigs
    if (config.filterConfigs) {
      Object.entries(config.filterConfigs).forEach(([channel, channelConfig]) => {
        if (channelConfig?.filterDimensionIds) {
          Object.entries(channelConfig.filterDimensionIds).forEach(([key, dimId]) => {
            // Use the key as fallback name
            result[dimId as string] = key;
          });
        }
      });
    }
    
    return result;
  }, [masterReport?.configuration]);

  // Initialize filter selections with all values selected by default
  useEffect(() => {
    if (open && masterReport) {
      const initialSelections: ChannelFilterSelection = {
        metasearch: {},
        sem: {},
        social: {},
      };
      
      Object.entries(availableFilters).forEach(([channel, dims]) => {
        Object.entries(dims).forEach(([dimId, values]) => {
          initialSelections[channel as keyof ChannelFilterSelection][dimId] = [...values];
        });
      });
      
      setFilterSelections(initialSelections);
    }
  }, [open, masterReport, availableFilters]);

  useEffect(() => {
    if (open) {
      setStep("name");
      setReportName("");
      setSelectedChannel("metasearch");
      setSearchQuery("");
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
        childFilterSelections: filterSelections,
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

  const toggleValue = (channel: keyof ChannelFilterSelection, dimId: string, value: string) => {
    setFilterSelections(prev => {
      const current = prev[channel][dimId] || [];
      const isSelected = current.includes(value);
      return {
        ...prev,
        [channel]: {
          ...prev[channel],
          [dimId]: isSelected
            ? current.filter(v => v !== value)
            : [...current, value],
        },
      };
    });
  };

  const selectAllForDimension = (channel: keyof ChannelFilterSelection, dimId: string) => {
    const allValues = availableFilters[channel][dimId] || [];
    setFilterSelections(prev => ({
      ...prev,
      [channel]: {
        ...prev[channel],
        [dimId]: [...allValues],
      },
    }));
  };

  const deselectAllForDimension = (channel: keyof ChannelFilterSelection, dimId: string) => {
    setFilterSelections(prev => ({
      ...prev,
      [channel]: {
        ...prev[channel],
        [dimId]: [],
      },
    }));
  };

  const currentDimensions = Object.entries(availableFilters[selectedChannel]);
  const currentDimId = currentDimensions[0]?.[0] || "";
  const currentValues = currentDimensions[0]?.[1] || [];
  const selectedValues = filterSelections[selectedChannel][currentDimId] || [];

  const filteredValues = currentValues.filter(v =>
    v.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getChannelValueCount = (channel: keyof ChannelFilterSelection) => {
    const dims = availableFilters[channel];
    let total = 0;
    Object.values(dims).forEach(values => {
      total += (filterSelections[channel][Object.keys(dims)[0]] || []).length;
    });
    return total || Object.values(dims)[0]?.length || 0;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Create Child Report
          </DialogTitle>
          <DialogDescription>
            {step === "name" && "Give your report a unique name."}
            {step === "filters" && "Select which data to include from each channel."}
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
                  const hasFilters = Object.keys(availableFilters[channel]).length > 0;
                  const count = getChannelValueCount(channel);
                  return (
                    <Button
                      key={channel}
                      variant={selectedChannel === channel ? "default" : "ghost"}
                      className={cn(
                        "justify-between h-10",
                        !hasFilters && "opacity-50"
                      )}
                      onClick={() => {
                        setSelectedChannel(channel);
                        setSearchQuery("");
                      }}
                      disabled={!hasFilters}
                    >
                      <span className="capitalize">{channel}</span>
                      {hasFilters && (
                        <span className="ml-2 px-1.5 py-0.5 text-xs rounded bg-primary-foreground/20">
                          {count}
                        </span>
                      )}
                    </Button>
                  );
                })}
              </div>

              {/* Values List */}
              <div className="flex-1 flex flex-col border rounded-lg">
                {currentDimensions.length > 0 ? (
                  <>
                    <div className="p-3 border-b">
                      <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search values..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="pl-8"
                        />
                      </div>
                      <div className="flex gap-2 mt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => selectAllForDimension(selectedChannel, currentDimId)}
                        >
                          Select All
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => deselectAllForDimension(selectedChannel, currentDimId)}
                        >
                          Deselect All
                        </Button>
                      </div>
                    </div>
                    <ScrollArea className="flex-1">
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
                              onClick={() => toggleValue(selectedChannel, currentDimId, value)}
                            >
                              <Checkbox checked={isSelected} />
                              <span className="text-sm">{value}</span>
                            </div>
                          );
                        })}
                        {filteredValues.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            No values found
                          </p>
                        )}
                      </div>
                    </ScrollArea>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-muted-foreground">
                    <p className="text-sm">No filter dimensions available for this channel</p>
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
