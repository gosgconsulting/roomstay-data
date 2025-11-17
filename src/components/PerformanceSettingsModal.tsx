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
  onSave: (groupBy: string[], breakdownBy: string[], thenBy: string[]) => void;
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

  const [localGroup, setLocalGroup] = useState<string | undefined>(groupBy[0]);
  const [localBreakdown, setLocalBreakdown] = useState<string | undefined>(breakdownBy[0]);
  const [localThen, setLocalThen] = useState<string | undefined>(thenBy[0]);

  useEffect(() => {
    setLocalGroup(groupBy[0]);
    setLocalBreakdown(breakdownBy[0]);
    setLocalThen(thenBy[0]);
  }, [groupBy, breakdownBy, thenBy, open]);

  const handleSave = () => {
    const nextGroup = localGroup ? [localGroup] : [];
    const nextBreakdown = localBreakdown ? [localBreakdown] : [];
    const nextThen = localThen ? [localThen] : [];
    onSave(nextGroup, nextBreakdown, nextThen);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Table Settings</DialogTitle>
          <DialogDescription>Configure grouping dimensions for your table.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Group by</Label>
            <Select value={localGroup || ""} onValueChange={setLocalGroup}>
              <SelectTrigger className="w-full bg-background">
                <SelectValue placeholder="Select a dimension" />
              </SelectTrigger>
              <SelectContent className="bg-background">
                {textDateDims.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Breakdown by</Label>
            <Select value={localBreakdown || ""} onValueChange={setLocalBreakdown}>
              <SelectTrigger className="w-full bg-background">
                <SelectValue placeholder="Select a dimension" />
              </SelectTrigger>
              <SelectContent className="bg-background">
                {textDateDims.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Then by</Label>
            <Select value={localThen || ""} onValueChange={setLocalThen}>
              <SelectTrigger className="w-full bg-background">
                <SelectValue placeholder="Select a dimension" />
              </SelectTrigger>
              <SelectContent className="bg-background">
                {textDateDims.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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