import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEffect, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { loadDimensionsForUser } from "@/lib/dimensionLoader";
import { checkDimensionsHaveData } from "@/lib/dimensionUtils";
import { useDimensionSelector } from "@/hooks/useDimensionSelector";
import { SelectedDimensionItem } from "./DimensionSelectorModal/SelectedDimensionItem";
import { AddDimensionSection } from "./DimensionSelectorModal/AddDimensionSection";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, CheckCircle2 } from "lucide-react";

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
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    dimensions,
    isLoading,
    dimensionHasData,
    dimensionGranularities,
    availableDimensions,
    loadDimensions,
    handleRemoveDimension: baseHandleRemoveDimension,
    handleAddDimension: baseHandleAddDimension,
    handleGranularityChange,
  } = useDimensionSelector({
    selectedDimensions,
    onDimensionsChange,
    reportId,
    currentDateGranularity,
    onDateGranularityChange,
  });

  // Enhanced handlers with error handling
  const handleRemoveDimension = useCallback(async (dimensionId: string) => {
    try {
      setIsSaving(true);
      setSaveError(null);
      await baseHandleRemoveDimension(dimensionId);
      toast({
        title: "Dimension removed",
        description: "Dimension configuration updated successfully.",
        duration: 2000,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to remove dimension';
      setSaveError(errorMessage);
      toast({
        title: "Error removing dimension",
        description: errorMessage,
        variant: "destructive",
        duration: 4000,
      });
      console.error('[DimensionSelectorModal] Error removing dimension:', error);
    } finally {
      setIsSaving(false);
    }
  }, [baseHandleRemoveDimension, toast]);

  const handleAddDimension = useCallback(async (dimensionId: string) => {
    try {
      setIsSaving(true);
      setSaveError(null);
      await baseHandleAddDimension(dimensionId);
      toast({
        title: "Dimension added",
        description: "Dimension configuration updated successfully.",
        duration: 2000,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to add dimension';
      setSaveError(errorMessage);
      toast({
        title: "Error adding dimension",
        description: errorMessage,
        variant: "destructive",
        duration: 4000,
      });
      console.error('[DimensionSelectorModal] Error adding dimension:', error);
    } finally {
      setIsSaving(false);
    }
  }, [baseHandleAddDimension, toast]);

  useEffect(() => {
    if (open) {
      setSaveError(null);
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

        {/* Error display */}
        {saveError && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <div>
              <div className="font-medium">Error saving dimensions</div>
              <div className="text-red-600">{saveError}</div>
            </div>
          </div>
        )}

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
                        granularity={dimensionGranularities[dimensionId] || 'Day'}
                        onRemove={handleRemoveDimension}
                        onGranularityChange={handleGranularityChange}
                        disabled={isSaving}
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
                  disabled={isSaving}
                />
              </div>
            </>
          )}
        </div>

        <div className="flex justify-between items-center border-t pt-4">
          {isSaving && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              Saving...
            </div>
          )}
          <div className="flex-1"></div>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};