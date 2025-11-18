import { useMemo, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import type { Dimension } from "@/hooks/performanceTable/usePerformanceTableDimensions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface PerformanceSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dimensions: Dimension[];
  groupBy: string[]; // kept for backward compatibility, not used for initial selection now
  breakdownBy: string[];
  thenBy: string[];
  onSave: (selectedDimensions: string[]) => void;
  selectedDimensionIds?: string[]; // NEW: initial selection to sync with filters/options
  reportId?: string;
  accountId?: string;
}

export function PerformanceSettingsModal({
  open,
  onOpenChange,
  dimensions,
  groupBy,
  breakdownBy,
  thenBy,
  onSave,
  selectedDimensionIds = [],
  reportId,
  accountId,
}: PerformanceSettingsModalProps) {
  const [localDimensions, setLocalDimensions] = useState<Dimension[]>(dimensions || []);
  const textDateDims = useMemo(
    () => localDimensions.filter(d => d.type === "text" || d.type === "date"),
    [localDimensions]
  );

  const dateDimId = useMemo(() => {
    const dateDim = localDimensions.find(d => d.type === "date");
    return dateDim?.id ?? null;
  }, [localDimensions]);

  const buildInitial = () => {
    // Prefer the provided selectedDimensionIds; fallback to previous heuristic
    const base = selectedDimensionIds.length
      ? [...selectedDimensionIds]
      : [groupBy[0], breakdownBy[0], thenBy[0]].filter(Boolean) as string[];

    const unique: string[] = [];
    base.forEach(id => {
      if (id && !unique.includes(id)) unique.push(id);
    });
    // Ensure Date is always present (prefer to place it first)
    if (dateDimId && !unique.includes(dateDimId)) {
      unique.unshift(dateDimId);
    }
    return unique;
  };

  const [selectedDims, setSelectedDims] = useState<string[]>(buildInitial());

  useEffect(() => {
    if (open) {
      setLocalDimensions(dimensions || []);
    }
  }, [open, dimensions]);

  useEffect(() => {
    if (open) {
      setSelectedDims(buildInitial());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedDimensionIds.join(','), groupBy[0], breakdownBy[0], thenBy[0]]);

  const toggleSelection = (id: string) => {
    if (dateDimId && id === dateDimId) return; // Date cannot be toggled off
    setSelectedDims(prev => {
      const exists = prev.includes(id);
      const next = exists ? prev.filter(d => d !== id) : [...prev, id];
      // Keep Date at the front if present
      if (dateDimId && !next.includes(dateDimId)) next.unshift(dateDimId);
      return next;
    });
  };

  const handleSave = () => {
    const final = dateDimId ? Array.from(new Set([dateDimId, ...selectedDims])) : selectedDims;
    onSave(final);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] bg-background">
        <DialogHeader>
          <DialogTitle>Filters Settings</DialogTitle>
          <DialogDescription>
            Date is required and always available. Select which dimensions appear in the Group by / Breakdown by / Then by dropdowns and the filter options.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          <div className="space-y-2">
            <Label>Available dimensions</Label>
            <ScrollArea className="h-[300px] rounded-md border bg-card">
              <div className="p-3 space-y-2">
                {textDateDims.map((dim) => {
                  const isDate = dateDimId && dim.id === dateDimId;
                  const checked = selectedDims.includes(dim.id);
                  const scope = String(dim.scope ?? "");
                  return (
                    <div
                      key={dim.id}
                      className="flex items-center justify-between rounded-md border px-3 py-2 bg-background"
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleSelection(dim.id)}
                          disabled={!!isDate}
                        />
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{dim.name}</span>
                          {isDate && (
                            <span className="text-xs text-muted-foreground">
                              (Required)
                            </span>
                          )}
                          {dim.scope && (
                            <span className="text-xs text-muted-foreground capitalize">
                              ({dim.scope})
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {isDate ? "Pinned" : checked ? "Selected" : "Not selected"}
                      </div>
                    </div>
                  );
                })}
                {textDateDims.length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    No dimensions available.
                  </div>
                )}
              </div>
            </ScrollArea>
            <p className="text-xs text-muted-foreground">
              Selected dimensions will appear in the table dropdowns and filter options. Date is always included.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave}>Save</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default PerformanceSettingsModal;