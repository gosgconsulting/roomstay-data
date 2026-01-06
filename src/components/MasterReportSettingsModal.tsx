import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

interface Dimension {
  id: string;
  name: string;
  type: string;
}

export interface ChannelConfig {
  groupByDimensionId: string | null;
  groupByDimensionName: string | null;
  selectedValues: string[];
  selectedMetrics: string[];
}

interface MasterReportSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: string;
  reportName: string;
  currentConfig: ChannelConfig;
  onSave: (config: ChannelConfig) => void;
}

const AVAILABLE_METRICS = [
  { id: "Cost", label: "Cost" },
  { id: "Revenue", label: "Revenue" },
  { id: "Clicks", label: "Clicks" },
  { id: "Impressions", label: "Impressions" },
  { id: "Conversions", label: "Conversions" },
  { id: "ROAS", label: "ROAS" },
  { id: "CPC", label: "CPC" },
  { id: "CTR", label: "CTR" },
  { id: "Conversion Rate", label: "Conversion Rate" },
];

export function MasterReportSettingsModal({
  open,
  onOpenChange,
  reportId,
  reportName,
  currentConfig,
  onSave,
}: MasterReportSettingsModalProps) {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [dimensionValues, setDimensionValues] = useState<string[]>([]);
  const [isLoadingDimensions, setIsLoadingDimensions] = useState(false);
  const [isLoadingValues, setIsLoadingValues] = useState(false);

  const [selectedDimensionId, setSelectedDimensionId] = useState<string | null>(
    currentConfig.groupByDimensionId
  );
  const [selectedValues, setSelectedValues] = useState<string[]>(
    currentConfig.selectedValues
  );
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(
    currentConfig.selectedMetrics.length > 0
      ? currentConfig.selectedMetrics
      : ["Cost", "Revenue", "ROAS", "Conversions"]
  );

  // Load dimensions for the report
  useEffect(() => {
    if (!open || !reportId) return;

    const loadDimensions = async () => {
      setIsLoadingDimensions(true);
      try {
        // Get data source for the report
        const { data: dsData } = await supabase
          .from("data_sources")
          .select("id, column_mappings")
          .eq("report_id", reportId)
          .limit(1)
          .maybeSingle();

        if (!dsData) {
          setDimensions([]);
          return;
        }

        // Extract dimension IDs from column mappings
        const mappings = (dsData.column_mappings || []) as any[];
        const dimensionIds = mappings
          .filter((m) => m.dimensionId && m.dimensionId !== "none")
          .map((m) => m.dimensionId);

        if (dimensionIds.length === 0) {
          setDimensions([]);
          return;
        }

        // Fetch dimensions
        const { data: dimsData } = await supabase
          .from("dimensions")
          .select("id, name, type")
          .in("id", dimensionIds)
          .eq("type", "dimension");

        setDimensions(dimsData || []);
      } catch (error) {
        console.error("Error loading dimensions:", error);
      } finally {
        setIsLoadingDimensions(false);
      }
    };

    loadDimensions();
  }, [open, reportId]);

  // Load dimension values when dimension changes
  useEffect(() => {
    if (!selectedDimensionId || !reportId) {
      setDimensionValues([]);
      return;
    }

    const loadDimensionValues = async () => {
      setIsLoadingValues(true);
      try {
        const { data, error } = await supabase.functions.invoke(
          "get-unique-dimension-values",
          {
            body: {
              reportId,
              dimensionId: selectedDimensionId,
            },
          }
        );

        if (error) {
          console.error("Error fetching dimension values:", error);
          setDimensionValues([]);
          return;
        }

        setDimensionValues(data?.values || []);
      } catch (error) {
        console.error("Error loading dimension values:", error);
        setDimensionValues([]);
      } finally {
        setIsLoadingValues(false);
      }
    };

    loadDimensionValues();
  }, [selectedDimensionId, reportId]);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setSelectedDimensionId(currentConfig.groupByDimensionId);
      setSelectedValues(currentConfig.selectedValues);
      setSelectedMetrics(
        currentConfig.selectedMetrics.length > 0
          ? currentConfig.selectedMetrics
          : ["Cost", "Revenue", "ROAS", "Conversions"]
      );
    }
  }, [open, currentConfig]);

  const handleDimensionChange = (dimensionId: string) => {
    setSelectedDimensionId(dimensionId === "none" ? null : dimensionId);
    setSelectedValues([]); // Reset selected values when dimension changes
  };

  const handleValueToggle = (value: string) => {
    setSelectedValues((prev) =>
      prev.includes(value)
        ? prev.filter((v) => v !== value)
        : [...prev, value]
    );
  };

  const handleSelectAllValues = () => {
    setSelectedValues(dimensionValues);
  };

  const handleClearValues = () => {
    setSelectedValues([]);
  };

  const handleMetricToggle = (metricId: string) => {
    setSelectedMetrics((prev) =>
      prev.includes(metricId)
        ? prev.filter((m) => m !== metricId)
        : [...prev, metricId]
    );
  };

  const handleSave = () => {
    const selectedDim = dimensions.find((d) => d.id === selectedDimensionId);
    onSave({
      groupByDimensionId: selectedDimensionId,
      groupByDimensionName: selectedDim?.name || null,
      selectedValues,
      selectedMetrics,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Configure {reportName}</DialogTitle>
          <DialogDescription>
            Set up the group by dimension, filter values, and metrics to display.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Group By Dimension */}
          <div className="space-y-2">
            <Label>Group By Dimension</Label>
            {isLoadingDimensions ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading dimensions...
              </div>
            ) : (
              <Select
                value={selectedDimensionId || "none"}
                onValueChange={handleDimensionChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a dimension" />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
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
          {selectedDimensionId && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Filter Values</Label>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleSelectAllValues}
                    disabled={isLoadingValues}
                  >
                    Select All
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearValues}
                    disabled={isLoadingValues}
                  >
                    Clear
                  </Button>
                </div>
              </div>
              {isLoadingValues ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading values...
                </div>
              ) : dimensionValues.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No values found for this dimension.
                </p>
              ) : (
                <ScrollArea className="h-[150px] border rounded-md p-3">
                  <div className="space-y-2">
                    {dimensionValues.map((value) => (
                      <div key={value} className="flex items-center space-x-2">
                        <Checkbox
                          id={`value-${value}`}
                          checked={selectedValues.includes(value)}
                          onCheckedChange={() => handleValueToggle(value)}
                        />
                        <label
                          htmlFor={`value-${value}`}
                          className="text-sm cursor-pointer"
                        >
                          {value}
                        </label>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
              {selectedValues.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedValues.length} value{selectedValues.length !== 1 ? "s" : ""} selected
                </p>
              )}
            </div>
          )}

          {/* Metrics Selection */}
          <div className="space-y-2">
            <Label>Display Metrics</Label>
            <div className="grid grid-cols-2 gap-2">
              {AVAILABLE_METRICS.map((metric) => (
                <div key={metric.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`metric-${metric.id}`}
                    checked={selectedMetrics.includes(metric.id)}
                    onCheckedChange={() => handleMetricToggle(metric.id)}
                  />
                  <label
                    htmlFor={`metric-${metric.id}`}
                    className="text-sm cursor-pointer"
                  >
                    {metric.label}
                  </label>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Configuration</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
