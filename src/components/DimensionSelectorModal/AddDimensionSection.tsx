import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus, CheckCircle2, AlertCircle } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Dimension } from "@/lib/dimensionLoader";

interface AddDimensionSectionProps {
  availableDimensions: Dimension[];
  dimensionHasData: Record<string, boolean>;
  reportId?: string;
  onAdd: (dimensionId: string) => void;
  disabled?: boolean;
}

export function AddDimensionSection({
  availableDimensions,
  dimensionHasData,
  reportId,
  onAdd,
  disabled = false,
}: AddDimensionSectionProps) {
  const [showAddSelector, setShowAddSelector] = useState(false);
  const [selectedToAdd, setSelectedToAdd] = useState<string>("");

  const handleAdd = () => {
    if (selectedToAdd && !disabled) {
      onAdd(selectedToAdd);
      setSelectedToAdd("");
      setShowAddSelector(false);
    }
  };

  const handleCancel = () => {
    setShowAddSelector(false);
    setSelectedToAdd("");
  };

  if (showAddSelector) {
    return (
      <div className="space-y-3">
        <Select value={selectedToAdd} onValueChange={setSelectedToAdd} disabled={disabled}>
          <SelectTrigger className="bg-background">
            <SelectValue placeholder="Select a dimension to add..." />
          </SelectTrigger>
          <SelectContent className="bg-background z-50">
            {availableDimensions.length === 0 ? (
              <div className="py-2 px-2 text-sm text-muted-foreground">
                No more dimensions available
              </div>
            ) : (
              availableDimensions.map((dimension) => {
                const hasData = reportId ? dimensionHasData[dimension.id] : undefined;
                return (
                  <SelectItem key={dimension.id} value={dimension.id}>
                    <div className="flex items-center gap-2">
                      {reportId && (
                        hasData !== undefined ? (
                          hasData ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                          ) : (
                            <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                          )
                        ) : (
                          <div className="h-3.5 w-3.5" />
                        )
                      )}
                      <span>{dimension.name}</span>
                    </div>
                  </SelectItem>
                );
              })
            )}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Button onClick={handleAdd} disabled={!selectedToAdd || disabled} size="sm">
            Add
          </Button>
          <Button variant="outline" size="sm" onClick={handleCancel} disabled={disabled}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Button
        variant="outline"
        className="w-full gap-2"
        onClick={() => setShowAddSelector(true)}
        disabled={availableDimensions.length === 0 || disabled}
      >
        <Plus className="h-4 w-4" />
        Add dimension
      </Button>
      {availableDimensions.length === 0 && (
        <p className="text-xs text-muted-foreground mt-2 text-center">
          No additional dimensions available. Date filtering is handled by the date range picker above.
        </p>
      )}
    </div>
  );
}