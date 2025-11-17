import { useMemo, useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
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

  const buildInitial = () => {
    const initial = [groupBy[0], breakdownBy[0], thenBy[0]].filter(Boolean) as string[];
    const unique: string[] = [];
    initial.forEach(id => {
      if (id && !unique.includes(id)) unique.push(id);
    });
    return unique.slice(0, 3);
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
    () => textDateDims.filter(d => !selectedDims.includes(d.id)),
    [textDateDims, selectedDims]
  );

  const handleAdd = () => {
    if (!addValue) return;
    if (selectedDims.length >= 3) return;
    setSelectedDims(prev => [...prev, addValue]);
    setAddValue("");
  };

  const handleRemove = (id: string) => {
    setSelectedDims(prev => prev.filter(d => d !== id));
  };

  const handleSave = () => {
    onSave(selectedDims);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Table Settings</DialogTitle>
          <DialogDescription>
            Choose up to 3 dimensions in order. They'll be applied as Group by, Breakdown by, and Then by.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Selected dimensions (order)</Label>
            {selectedDims.length === 0 ? (
              <div className="text-sm text-muted-foreground">No dimensions selected yet.</div>
            ) : (
              <div className="space-y-2">
                {selectedDims.map((id, idx) => {
                  const dim = textDateDims.find(d => d.id === id);
                  return (
                    <div key={id} className="flex items-center justify-between rounded-md border px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground w-14">
                          {idx === 0 ? "Group by" : idx === 1 ? "Breakdown by" : "Then by"}
                        </span>
                        <span className="text-sm">{dim?.name ?? id}</span>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => handleRemove(id)}>
                        Remove
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Add dimension</Label>
            <div className="flex items-center gap-2">
              <Select value={addValue} onValueChange={setAddValue}>
                <SelectTrigger className="w-full bg-background">
                  <SelectValue placeholder={selectedDims.length >= 3 ? "Maximum 3 selected" : "Select a dimension"} />
                </SelectTrigger>
                <SelectContent className="bg-background">
                  {availableToAdd.map(d => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleAdd} disabled={!addValue || selectedDims.length >= 3}>
                Add
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              You can select up to 3 dimensions. The order matters.
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