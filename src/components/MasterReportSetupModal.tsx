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
      
      // Load dimensions for all reports
      reports.forEach((report) => {
        loadDimensionsForReport(report.id);
      });
    }
  }, [open, reports]);

  const loadDimensionsForReport = async (reportId: string) => {
    setLoadingDimensions((prev) => ({ ...prev, [reportId]: true }));
    try {
      const { data, error } = await supabase
        .from("dimensions")
        .select("id, name, type")
        .or(`report_id.eq.${reportId},report_id.is.null`)
        .order("name");

      if (!error && data) {
        // Filter to only text/date dimensions (not metrics)
        const filteredDimensions = data.filter(
          (d) => d.type === "text" || d.type === "date"
        );
        setDimensionsByReport((prev) => ({ ...prev, [reportId]: filteredDimensions }));
      }
    } catch (err) {
      console.error("Error loading dimensions:", err);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Set Up Master Report</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6 py-4">
            <p className="text-sm text-muted-foreground">
              Configure how each report is grouped in the master report view. Select a dimension to group by and filter the values you want to include.
            </p>

            {reports.map((report) => {
              const config = configs[report.id];
              const dimensions = dimensionsByReport[report.id] || [];
              const values = valuesByReport[report.id] || [];
              const isLoadingDims = loadingDimensions[report.id];
              const isLoadingVals = loadingValues[report.id];

              return (
                <div
                  key={report.id}
                  className="border rounded-lg p-4 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-lg">{report.name}</h3>
                  </div>

                  {/* Group By Dimension */}
                  <div className="space-y-2">
                    <Label>Group By Dimension</Label>
                    {isLoadingDims ? (
                      <Skeleton className="h-10 w-full" />
                    ) : (
                      <Select
                        value={config?.groupByDimensionId || "none"}
                        onValueChange={(value) => handleDimensionChange(report.id, value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select dimension..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No grouping</SelectItem>
                          {dimensions.map((dim) => (
                            <SelectItem key={dim.id} value={dim.id}>
                              {dim.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>

                  {/* Filter Values */}
                  {config?.groupByDimensionId && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Filter Values</Label>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSelectAllValues(report.id)}
                            disabled={isLoadingVals || values.length === 0}
                          >
                            Select All
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleClearValues(report.id)}
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
                      ) : values.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">
                          No values found for this dimension.
                        </p>
                      ) : (
                        <ScrollArea className="h-40 border rounded-md p-2">
                          <div className="space-y-2">
                            {values.map((value) => (
                              <div key={value} className="flex items-center gap-2">
                                <Checkbox
                                  id={`${report.id}-${value}`}
                                  checked={config?.selectedValues.includes(value)}
                                  onCheckedChange={() => handleValueToggle(report.id, value)}
                                />
                                <label
                                  htmlFor={`${report.id}-${value}`}
                                  className="text-sm cursor-pointer flex-1"
                                >
                                  {value}
                                </label>
                              </div>
                            ))}
                          </div>
                        </ScrollArea>
                      )}
                      {config?.selectedValues.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {config.selectedValues.length} value(s) selected
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
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
