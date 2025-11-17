import { useMemo, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Dimension } from "@/hooks/performanceTable/usePerformanceTableDimensions";

interface PerformanceSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dimensions: Dimension[];
  groupBy: string[];
  breakdownBy: string[];
  thenBy: string[];
  onSave: (selectedDimensions: string[]) => void;
}

export function PerformanceSettingsModal({
  open,
  onOpenChange,
  dimensions,
  groupBy,
  breakdownBy,
  thenBy,
  onSave,
}: PerformanceSettingsModalProps) {
  const textDateDims = useMemo(
    () => dimensions.filter(d => d.type === "text" || d.type === "date"),
    [dimensions]
  );

  const dateDimId = useMemo(() => {
    const dateDim = dimensions.find(d => d.type === "date");
    return dateDim?.id ?? null;
  }, [dimensions]);

  const buildInitial = () => {
    const initial = [groupBy[0], breakdownBy[0], thenBy[0]].filter(Boolean) as string[];
    const unique: string[] = [];
    initial.forEach(id => {
      if (id && !unique.includes(id)) unique.push(id);
    });
    // Ensure Date is always present (prefer to place it first)
    if (dateDimId && !unique.includes(dateDimId)) {
      unique.unshift(dateDimId);
    }
    return unique;
  };

  const [selectedDims, setSelectedDims] = useState<string[]>(buildInitial());
  const [addValue, setAddValue] = useState<string>("");

  useEffect(() => {
    if (open) {
      setSelectedDims(buildInitial());
      setAddValue("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, groupBy[0], breakdownBy[0], thenBy[0]]);

  const availableToAdd = useMemo(
    () => textDateDims
      .filter(d => !selectedDims.includes(d.id))
      .filter(d => d.id !== dateDimId), // exclude Date from add list (it's pinned)
    [textDateDims, selectedDims, dateDimId]
  );

  const handleAdd = () => {
    if (!addValue) return;
    if (selectedDims.includes(addValue)) return;
    setSelectedDims(prev => [...prev, addValue]);
    setAddValue("");
  };

  const handleRemove = (id: string) => {
    // Do not allow removing Date
    if (dateDimId && id === dateDimId) return;
    setSelectedDims(prev => prev.filter(d => d !== id));
  };

  const handleSave = () => {
    // Ensure Date is always saved
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
            Date is required and always available. Add other dimensions to appear in the Group by / Breakdown by / Then by dropdowns.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-2">
          <div className="space-y-2">
            <Label>Selected dimensions</Label>
            <ScrollArea className="h-[240px] rounded-md border bg-card">
              <div className="p-3 space-y-2">
                {selectedDims.map((id) => {
                  const dim = textDateDims.find(d => d.id === id);
                  const isDate = dateDimId && id === dateDimId;
                  return (
                    <div
                      key={id}
                      className="flex items-center justify-between rounded-md border px-3 py-2 bg-background"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{dim?.name ?? id}</span>
                        {isDate && (
                          <span className="text-xs text-muted-foreground">
                            (Required)
                          </span>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemove(id)}
                        disabled={!!isDate}
                      >
                        {isDate ? "Pinned" : "Remove"}
                      </Button>
                    </div>
                  );
                })}
                {selectedDims.length === 0 && (
                  <div className="text-sm text-muted-foreground">
                    No dimensions selected yet.
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>

          <div className="space-y-2">
            <Label>Add dimension</Label>
            <div className="flex items-center gap-2">
              <Select value={addValue} onValueChange={setAddValue}>
                <SelectTrigger className="w-full bg-background">
                  <SelectValue placeholder="Select a dimension" />
                </SelectTrigger>
                <SelectContent className="bg-background">
                  {availableToAdd.map(d => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleAdd} disabled={!addValue}>
                Add
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Added dimensions will be available in the table dropdowns. Date is always included.
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