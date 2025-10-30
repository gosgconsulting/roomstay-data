import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { X, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Dimension {
  id: string;
  name: string;
  type: string;
}

interface DimensionSelectorModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  selectedDimensions: string[];
  onDimensionsChange: (dimensions: string[]) => void;
}

export const DimensionSelectorModal = ({
  open,
  onOpenChange,
  title,
  selectedDimensions,
  onDimensionsChange,
}: DimensionSelectorModalProps) => {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddSelector, setShowAddSelector] = useState(false);
  const [selectedToAdd, setSelectedToAdd] = useState<string>("");

  useEffect(() => {
    if (open) {
      loadDimensions();
    }
  }, [open]);

  const loadDimensions = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load all dimensions - both metrics and attributes
      // In the future, we should add an 'attribute' type for grouping dimensions
      const { data, error } = await supabase
        .from("dimensions")
        .select("*")
        .eq("user_id", user.id)
        .order("name", { ascending: true });

      if (error) throw error;
      setDimensions(data || []);
    } catch (error) {
      console.error("Error loading dimensions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveDimension = (dimensionId: string) => {
    const updated = selectedDimensions.filter((d) => d !== dimensionId);
    onDimensionsChange(updated);
  };

  const handleAddDimension = () => {
    if (selectedToAdd && !selectedDimensions.includes(selectedToAdd)) {
      onDimensionsChange([...selectedDimensions, selectedToAdd]);
      setSelectedToAdd("");
      setShowAddSelector(false);
    }
  };

  const availableDimensions = dimensions.filter(
    (d) => !selectedDimensions.includes(d.id)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Manage dimensions for this grouping
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
                      <div
                        key={dimensionId}
                        className="flex items-center justify-between py-2 px-3 bg-muted rounded-md"
                      >
                        <span className="font-medium">{dimension?.name || dimensionId}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          onClick={() => handleRemoveDimension(dimensionId)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add dimension section */}
              <div className="border-t pt-3">
                {showAddSelector ? (
                  <div className="space-y-3">
                    <Select
                      value={selectedToAdd}
                      onValueChange={setSelectedToAdd}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Select a dimension to add..." />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        {availableDimensions.length === 0 ? (
                          <div className="py-2 px-2 text-sm text-muted-foreground">
                            No more dimensions available
                          </div>
                        ) : (
                          availableDimensions.map((dimension) => (
                            <SelectItem key={dimension.id} value={dimension.id}>
                              {dimension.name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Button
                        onClick={handleAddDimension}
                        disabled={!selectedToAdd}
                        size="sm"
                      >
                        Add
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setShowAddSelector(false);
                          setSelectedToAdd("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => setShowAddSelector(true)}
                    disabled={availableDimensions.length === 0}
                  >
                    <Plus className="h-4 w-4" />
                    Add dimension
                  </Button>
                )}
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
