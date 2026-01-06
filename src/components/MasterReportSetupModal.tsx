import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Report {
  id: string;
  name: string;
}

interface Dimension {
  id: string;
  name: string;
  type: string;
}

export interface MasterReportConfig {
  reportId: string;
  reportName: string;
  groupByDimensionId: string | null;
  groupByDimensionName: string | null;
  selectedValues: string[];
}

interface MasterReportSetupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reports: Report[];
  accountId?: string;
  currentConfigs: Record<string, MasterReportConfig>;
  onSave: (configs: Record<string, MasterReportConfig>) => void;
}

const AVAILABLE_METRICS = [
  "Cost",
  "Revenue",
  "ROAS",
  "Conversions",
  "Clicks",
  "Impressions",
  "CTR",
  "CPC",
];

export const MasterReportSetupModal: React.FC<MasterReportSetupModalProps> = ({
  open,
  onOpenChange,
  reports,
  accountId,
  currentConfigs,
  onSave,
}) => {
  const [configs, setConfigs] = useState<Record<string, MasterReportConfig>>({});
  const [dimensionsByReport, setDimensionsByReport] = useState<Record<string, Dimension[]>>({});
  const [valuesByReport, setValuesByReport] = useState<Record<string, string[]>>({});
  const [loadingDimensions, setLoadingDimensions] = useState<Record<string, boolean>>({});
  const [loadingValues, setLoadingValues] = useState<Record<string, boolean>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [activeReportTab, setActiveReportTab] = useState<string | null>(null);

  // Initialize configs when modal opens
  useEffect(() => {
    if (open && reports.length > 0) {
      const initialConfigs: Record<string, MasterReportConfig> = {};
      reports.forEach((report) => {
        initialConfigs[report.id] = currentConfigs[report.id] || {
          reportId: report.id,
          reportName: report.name,
          groupByDimensionId: null,
          groupByDimensionName: null,
          selectedValues: [],
        };
      });
      setConfigs(initialConfigs);
      
      // Set first report as active tab
      setActiveReportTab(reports[0].id);
      
      // Load dimensions for all reports
      reports.forEach((report) => {
        loadDimensionsForReport(report.id);
      });
    } else if (!open) {
      // Reset active tab when modal closes
      setActiveReportTab(null);
    }
  }, [open, reports]);

  const loadDimensionsForReport = async (reportId: string) => {
    setLoadingDimensions((prev) => ({ ...prev, [reportId]: true }));
    try {
      // 1. Fetch data source for the report
      const { data: dsData, error: dsError } = await supabase
        .from("data_sources")
        .select("*")
        .eq("report_id", reportId)
        .limit(1)
        .single();

      if (dsError || !dsData) {
        console.error(`Error fetching data source for report ${reportId}:`, dsError);
        setDimensionsByReport((prev) => ({ ...prev, [reportId]: [] }));
        return;
      }

      // 2. Extract dimension IDs from column mappings
      const columnMappings = Array.isArray(dsData.column_mappings) ? dsData.column_mappings : [];
      const dimensionIds = columnMappings
        .filter((m: any) => m.dimensionId && m.dimensionId !== "none" && m.dimensionId.length > 10)
        .map((m: any) => m.dimensionId);

      if (dimensionIds.length === 0) {
        setDimensionsByReport((prev) => ({ ...prev, [reportId]: [] }));
        return;
      }

      // 3. Fetch dimension details by ID
      const { data, error } = await supabase
        .from("dimensions")
        .select("id, name, type")
        .in("id", dimensionIds)
        .in("type", ["text", "date"])  // Only text/date for grouping
        .order("name");

      if (!error && data) {
        setDimensionsByReport((prev) => ({ ...prev, [reportId]: data }));
      } else {
        console.error("Error loading dimensions:", error);
        setDimensionsByReport((prev) => ({ ...prev, [reportId]: [] }));
      }
    } catch (err) {
      console.error("Error loading dimensions:", err);
      setDimensionsByReport((prev) => ({ ...prev, [reportId]: [] }));
    } finally {
      setLoadingDimensions((prev) => ({ ...prev, [reportId]: false }));
    }
  };

  const loadValuesForDimension = async (reportId: string, dimensionId: string) => {
    setLoadingValues((prev) => ({ ...prev, [reportId]: true }));
    try {
      const { data, error } = await supabase.functions.invoke(
        "get-unique-dimension-values",
        {
          body: { reportId, dimensionId },
        }
      );

      if (!error && data?.values) {
        setValuesByReport((prev) => ({ ...prev, [reportId]: data.values }));
      }
    } catch (err) {
      console.error("Error loading dimension values:", err);
    } finally {
      setLoadingValues((prev) => ({ ...prev, [reportId]: false }));
    }
  };

  const handleDimensionChange = (reportId: string, dimensionId: string) => {
    const dimension = dimensionsByReport[reportId]?.find((d) => d.id === dimensionId);
    setConfigs((prev) => ({
      ...prev,
      [reportId]: {
        ...prev[reportId],
        groupByDimensionId: dimensionId === "none" ? null : dimensionId,
        groupByDimensionName: dimensionId === "none" ? null : dimension?.name || null,
        selectedValues: [],
      },
    }));
    
    // Clear values and load new ones
    setValuesByReport((prev) => ({ ...prev, [reportId]: [] }));
    if (dimensionId && dimensionId !== "none") {
      loadValuesForDimension(reportId, dimensionId);
    }
  };

  const handleValueToggle = (reportId: string, value: string) => {
    setConfigs((prev) => {
      const current = prev[reportId];
      const isSelected = current.selectedValues.includes(value);
      return {
        ...prev,
        [reportId]: {
          ...current,
          selectedValues: isSelected
            ? current.selectedValues.filter((v) => v !== value)
            : [...current.selectedValues, value],
        },
      };
    });
  };

  const handleSelectAllValues = (reportId: string) => {
    const allValues = valuesByReport[reportId] || [];
    setConfigs((prev) => ({
      ...prev,
      [reportId]: {
        ...prev[reportId],
        selectedValues: [...allValues],
      },
    }));
  };

  const handleClearValues = (reportId: string) => {
    setConfigs((prev) => ({
      ...prev,
      [reportId]: {
        ...prev[reportId],
        selectedValues: [],
      },
    }));
  };

  const handleSave = () => {
    setIsSaving(true);
    onSave(configs);
    setIsSaving(false);
    onOpenChange(false);
  };

  const handleClose = () => {
    setActiveReportTab(null);
    onOpenChange(false);
  };

  const activeConfig = activeReportTab ? configs[activeReportTab] : null;
  const activeDimensions = activeReportTab ? dimensionsByReport[activeReportTab] || [] : [];
  const activeValues = activeReportTab ? valuesByReport[activeReportTab] || [] : [];
  const isLoadingDims = activeReportTab ? loadingDimensions[activeReportTab] : false;
  const isLoadingVals = activeReportTab ? loadingValues[activeReportTab] : false;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Set Up Master Report</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Configure how each report is grouped in the master report view. Select a dimension to group by and filter the values you want to include.
          </p>
        </DialogHeader>

        <div className="flex-1 flex gap-4 min-h-0">
          {/* Left: Report tabs */}
          <div className="w-48 border-r pr-4">
            <ScrollArea className="h-full">
              <div className="space-y-1">
                {reports.map((report) => {
                  const config = configs[report.id];
                  const hasGrouping = config?.groupByDimensionId && config.groupByDimensionId !== "none";
                  return (
                    <button
                      key={report.id}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between",
                        activeReportTab === report.id
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-muted"
                      )}
                      onClick={() => setActiveReportTab(report.id)}
                    >
                      <span className="truncate">{report.name}</span>
                      {hasGrouping && (
                        <span className="text-xs opacity-70">✓</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          {/* Right: Configuration for active report */}
          <div className="flex-1 flex flex-col gap-4 min-h-0">
            {activeReportTab && activeConfig ? (
              <>
                {/* Group By Dimension */}
                <div className="space-y-2">
                  <Label>Group By Dimension</Label>
                  {isLoadingDims ? (
                    <Skeleton className="h-10 w-full" />
                  ) : (
                    <Select
                      value={activeConfig.groupByDimensionId || "none"}
                      onValueChange={(value) => handleDimensionChange(activeReportTab, value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select dimension..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No grouping</SelectItem>
                        {activeDimensions.map((dim) => (
                          <SelectItem key={dim.id} value={dim.id}>
                            {dim.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {/* Filter Values */}
                {activeConfig.groupByDimensionId && activeConfig.groupByDimensionId !== "none" && (
                  <div className="space-y-2 flex-1 flex flex-col min-h-0">
                    <div className="flex items-center justify-between">
                      <Label>Filter Values</Label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSelectAllValues(activeReportTab)}
                          disabled={isLoadingVals || activeValues.length === 0}
                        >
                          Select All
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => handleClearValues(activeReportTab)}
                          disabled={isLoadingVals}
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                    {isLoadingVals ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading values...
                      </div>
                    ) : activeValues.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-2">
                        No values found for this dimension.
                      </p>
                    ) : (
                      <ScrollArea className="flex-1 border rounded-md p-2">
                        <div className="space-y-2">
                          {activeValues.map((value) => (
                            <div key={value} className="flex items-center gap-2">
                              <Checkbox
                                id={`${activeReportTab}-${value}`}
                                checked={activeConfig.selectedValues.includes(value)}
                                onCheckedChange={() => handleValueToggle(activeReportTab, value)}
                              />
                              <label
                                htmlFor={`${activeReportTab}-${value}`}
                                className="text-sm cursor-pointer flex-1"
                              >
                                {value}
                              </label>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                    {activeConfig.selectedValues.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {activeConfig.selectedValues.length} value(s) selected
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                Select a report to configure
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="pt-4 border-t">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
