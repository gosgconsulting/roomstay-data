import { useMemo, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  // Dropdown to add existing dimension
  const [addSelectValue, setAddSelectValue] = useState<string>("");
  const addableDims = useMemo(
    () =>
      textDateDims.filter(
        (d) => !selectedDims.includes(d.id) && !(dateDimId && d.id === dateDimId)
      ),
    [textDateDims, selectedDims, dateDimId]
  );
  const addDimensionById = (id: string) => {
    setSelectedDims((prev) => (prev.includes(id) ? prev : [...prev, id]));
    const added = localDimensions.find((d) => d.id === id);
    if (added) {
      toast({ title: "Added", description: `Dimension "${added.name}" added to filters.` });
    }
  };

  useEffect(() => {
    if (open) {
      setLocalDimensions(dimensions || []);
    }
  }, [open, dimensions]);

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

  // REMOVED: reloadDimensions (no longer needed without create modal)

  const handleDeleteDimension = async (dim: Dimension) => {
    const isDate = dateDimId && dim.id === dateDimId;
    const scope = String(dim.scope ?? "");
    const isProtected = isDate || scope === "global" || scope === "virtual";
    const isDeletable = scope === "account" || scope === "custom";
    if (isProtected || !isDeletable) {
      toast({
        title: "Not allowed",
        description: "This dimension cannot be deleted.",
        variant: "destructive",
      });
      return;
    }
    const { error } = await supabase
      .from("dimensions")
      .delete()
      .eq("id", dim.id);
    if (error) {
      toast({
        title: "Delete failed",
        description: error.message || "Could not delete dimension",
        variant: "destructive",
      });
      return;
    }
    setLocalDimensions((prev) => prev.filter((d) => d.id !== dim.id));
    setSelectedDims((prev) => prev.filter((id) => id !== dim.id));
    toast({ title: "Deleted", description: `Dimension "${dim.name}" removed.` });
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
          <div className="flex items-center justify-between">
            <Label>Available dimensions</Label>
            <Select
              value={addSelectValue}
              onValueChange={(id) => {
                addDimensionById(id);
                setAddSelectValue("");
              }}
            >
              <SelectTrigger
                className="w-[220px] bg-background"
                aria-label="Add dimension to filters"
                disabled={addableDims.length === 0}
              >
                <SelectValue placeholder={addableDims.length ? "Add dimension..." : "No dimensions to add"} />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                {addableDims.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name} {d.scope ? `(${d.scope})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <ScrollArea className="h-[300px] rounded-md border bg-card">
              <div className="p-3 space-y-2">
                {textDateDims.map((dim) => {
                  const isDate = dateDimId && dim.id === dateDimId;
                  const checked = selectedDims.includes(dim.id);
                  const scope = String(dim.scope ?? "");
                  const isProtected = isDate || scope === "global" || scope === "virtual";
                  const isDeletable = !isProtected && (scope === "account" || scope === "custom");
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
                      <div className="flex items-center gap-3">
                        <div className="text-xs text-muted-foreground">
                          {isDate ? "Pinned" : checked ? "Selected" : "Not selected"}
                        </div>
                        {isDeletable && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 px-2 text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete dimension</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will remove the dimension "{dim.name}". You can't undo this action.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => handleDeleteDimension(dim)}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
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

        {/* REMOVED: Create-new dimension modal; adding is now via dropdown of existing dimensions */}
      </DialogContent>
    </Dialog>
  );
}

export default PerformanceSettingsModal;