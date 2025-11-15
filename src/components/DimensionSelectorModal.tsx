import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEffect, useCallback } from "react";
import { useDimensionSelector } from "@/hooks/useDimensionSelector";
import { SelectedDimensionItem } from "./DimensionSelectorModal/SelectedDimensionItem";
import { AddDimensionSection } from "./DimensionSelectorModal/AddDimensionSection";

interface DimensionSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  selectedDimensions: string[];
  onDimensionsChange: (dimensions: string[]) => void;
  onDateGranularityChange?: (granularity: string) => void;
  currentDateGranularity?: string;
  reportId?: string;
}

export const DimensionSelectorModal = ({
  open,
  onOpenChange,
  title,
  selectedDimensions,
  onDimensionsChange,
  onDateGranularityChange,
  currentDateGranularity = 'day',
  reportId,
}: DimensionSelectorModalProps) => {
  const {
    dimensions,
    isLoading,
    dimensionHasData,
    availableDimensions,
    loadDimensions,
    handleRemoveDimension,
    handleAddDimension,
    handleGranularityChange,
  } = useDimensionSelector({
    selectedDimensions,
    onDimensionsChange,
    reportId,
    currentDateGranularity,
    onDateGranularityChange,
  });

  // Load dimensions and check their data availability
  useEffect(() => {
    if (open) {
      loadDimensions();
    }
  }, [open, loadDimensions]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Select dimensions to populate Group by, Breakdown by, and Then by options. More dimensions = more breakdown options.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-3">
          {isLoading ? (
            <div className="text-center py-4 text-muted-foreground text-sm">
              Loading dimensions...
            </div>
          ) : (
            <>
              {/* Selected dimensions list */}
              {selectedDimensions.length > 0 && (
                <div className="space-y-2 mb-3">
                  {selectedDimensions.map((dimensionId) => {
                    const dimension = dimensions.find(d => d.id === dimensionId);
                    return (
                      <SelectedDimensionItem
                        key={dimensionId}
                        dimension={dimension}
                        dimensionId={dimensionId}
                        granularity={String(dimensionHasData[dimensionId] || 'Day')}
                        onRemove={handleRemoveDimension}
                        onGranularityChange={handleGranularityChange}
                      />
                    );
                  })}
                </div>
              )}

              {/* Add dimension section */}
              <div className="border-t pt-3">
                <AddDimensionSection
                  availableDimensions={availableDimensions}
                  dimensionHasData={dimensionHasData}
                  reportId={reportId}
                  onAdd={handleAddDimension}
                />
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};