import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useEffect, useCallback, useState } from "react";
import { useDimensionSelector } from "@/hooks/useDimensionSelector";
import { SelectedDimensionItem } from "./DimensionSelectorModal/SelectedDimensionItem";
import { AddDimensionSection } from "./DimensionSelectorModal/AddDimensionSection";
import { useToast } from "@/hooks/use-toast";
import { AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";

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
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const {
    dimensions,
    isLoading,
    error: loadError,
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
      setSuccessMessage(null);
      
      // Find dimension name for better user feedback
      const dimensionName = dimensions.find(d => d.id === dimensionId)?.name || 'Dimension';
      
      await baseHandleRemoveDimension(dimensionId);
      
      setSuccessMessage(`${dimensionName} removed successfully`);
      toast({
        title: "Dimension removed",
        description: `${dimensionName} has been removed from your configuration.`,
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
  }, [baseHandleRemoveDimension, toast, dimensions]);

  const handleAddDimension = useCallback(async (dimensionId: string) => {
    try {
      setIsSaving(true);
      setSaveError(null);
      setSuccessMessage(null);
      
      // Find dimension name for better user feedback
      const dimensionName = dimensions.find(d => d.id === dimensionId)?.name || 'Dimension';
      
      await baseHandleAddDimension(dimensionId);
      
      setSuccessMessage(`${dimensionName} added successfully`);
      toast({
        title: "Dimension added",
        description: `${dimensionName} has been added to your configuration.`,
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
  }, [baseHandleAddDimension, toast, dimensions]);

  // Reset error state when modal opens
  useEffect(() => {
    if (open) {
      setSaveError(null);
      setSuccessMessage(null);
      loadDimensions();
    }
  }, [open, loadDimensions]);

  // Auto-hide success message after 3 seconds
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // Handle close with confirmation if there's an error
  const handleClose = useCallback(() => {
    if (saveError) {
      // If there's an error, ask for confirmation before closing
      if (confirm("There was an error saving dimensions. Close anyway?")) {
        onOpenChange(false);
      }
    } else {
      onOpenChange(false);
    }
  }, [saveError, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Select dimensions to populate Group by, Breakdown by, and Then by options. More dimensions = more breakdown options.
          </DialogDescription>
        </DialogHeader>

        {/* Error display */}
        {(saveError || loadError) && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm mb-4">
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            <div>
              <div className="font-medium">Error</div>
              <div className="text-red-600">{saveError || loadError}</div>
              {loadError && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="mt-2 h-8 text-xs" 
                  onClick={loadDimensions}
                >
                  <RefreshCw className="h-3 w-3 mr-1" /> Retry Loading
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Success message */}
        {successMessage && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-md text-green-700 text-sm mb-4">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            <div>
              <div className="font-medium">Success</div>
              <div className="text-green-600">{successMessage}</div>
            </div>
          </div>
        )}

        <div className="py-4 space-y-3">
          {isLoading ? (
            <div className="text-center py-4 text-muted-foreground text-sm">
              <div className="flex justify-center mb-2">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              </div>
              Loading dimensions...
            </div>
          ) : (
            <>
              {/* Selected dimensions list */}
              {selectedDimensions.length > 0 ? (
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
              ) : (
                <div className="text-center py-4 text-muted-foreground text-sm border border-dashed border-gray-200 rounded-md">
                  No dimensions selected. Add dimensions below.
                </div>
              )}

              {/* Add dimension section */}
              <div className="border-t pt-3">
                <AddDimensionSection
                  availableDimensions={availableDimensions}
                  dimensionHasData={dimensionHasData}
                  reportId={reportId}
                  onAdd={handleAddDimension}
                  disabled={isSaving || !!loadError}
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
          <Button variant="outline" onClick={handleClose} disabled={isSaving}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};