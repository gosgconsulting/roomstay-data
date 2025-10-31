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
  onDateGranularityChange?: (granularity: string) => void;
  currentDateGranularity?: string;
}

export const DimensionSelectorModal = ({
  open,
  onOpenChange,
  title,
  selectedDimensions,
  onDimensionsChange,
  onDateGranularityChange,
  currentDateGranularity = 'day',
}: DimensionSelectorModalProps) => {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddSelector, setShowAddSelector] = useState(false);
  const [selectedToAdd, setSelectedToAdd] = useState<string>("");
  const [dimensionGranularities, setDimensionGranularities] = useState<Record<string, string>>({});

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
      const { data, error } = await supabase
        .from("dimensions")
        .select("*")
        .eq("user_id", user.id)
        .order("name", { ascending: true });

      if (error) throw error;
      
      // Deduplicate dimensions by name (keep first occurrence)
      const seenNames = new Set<string>();
      const uniqueDimensions = (data || []).filter(dim => {
        if (seenNames.has(dim.name)) {
          return false;
        }
        seenNames.add(dim.name);
        return true;
      });
      
      setDimensions(uniqueDimensions);
    } catch (error) {
      console.error("Error loading dimensions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveDimension = (dimensionId: string) => {
    const updated = selectedDimensions.filter((d) => d !== dimensionId);
    const newGranularities = { ...dimensionGranularities };
    delete newGranularities[dimensionId];
    setDimensionGranularities(newGranularities);
    onDimensionsChange(updated);
  };

  const handleAddDimension = () => {
    if (selectedToAdd && !selectedDimensions.includes(selectedToAdd)) {
      const dimension = dimensions.find(d => d.id === selectedToAdd);
      // For date dimensions, default to "Day" granularity
      if (dimension?.type === 'date') {
        setDimensionGranularities({
          ...dimensionGranularities,
          [selectedToAdd]: 'Day'
        });
        // Notify parent component of defaults
        if (onDateGranularityChange) {
          onDateGranularityChange('day');
        }
      }
      onDimensionsChange([...selectedDimensions, selectedToAdd]);
      setSelectedToAdd("");
      setShowAddSelector(false);
    }
  };

  const handleGranularityChange = (dimensionId: string, granularity: string) => {
    setDimensionGranularities({
      ...dimensionGranularities,
      [dimensionId]: granularity
    });
    // Notify parent component if this is a date dimension
    const dimension = dimensions.find(d => d.id === dimensionId);
    if (dimension?.type === 'date' && onDateGranularityChange) {
      onDateGranularityChange(granularity.toLowerCase());
    }
  };

  // Parse existing dimensions to extract granularities
  useEffect(() => {
    const granularities: Record<string, string> = {};
    selectedDimensions.forEach(dim => {
      const dimension = dimensions.find(d => d.id === dim);
      if (dimension?.type === 'date') {
        // Use current value from parent or default to Day
        const capitalizedGranularity = currentDateGranularity.charAt(0).toUpperCase() + currentDateGranularity.slice(1);
        granularities[dim] = capitalizedGranularity;
      }
    });
    setDimensionGranularities(granularities);
  }, [selectedDimensions, dimensions, currentDateGranularity]);

  const availableDimensions = dimensions.filter(
    (d) => !selectedDimensions.includes(d.id)
  );

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
                    const isDateDimension = dimension?.type === 'date';
                    return (
                      <div
                        key={dimensionId}
                        className="space-y-2"
                      >
                        <div className="flex items-center justify-between py-2 px-3 bg-muted rounded-md">
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
                        {isDateDimension && (
                          <div className="pl-3 pr-3">
                            <Select
                              value={dimensionGranularities[dimensionId] || 'Day'}
                              onValueChange={(value) => handleGranularityChange(dimensionId, value)}
                            >
                              <SelectTrigger className="h-9 bg-background">
                                <SelectValue placeholder="Select granularity..." />
                              </SelectTrigger>
                              <SelectContent className="bg-background z-50">
                                <SelectItem value="Day">Day</SelectItem>
                                <SelectItem value="Week">Week</SelectItem>
                                <SelectItem value="Month">Month</SelectItem>
                                <SelectItem value="Year">Year</SelectItem>
                                <SelectItem value="Forecast">Forecast</SelectItem>
                                <SelectItem value="Forecast Historical">Historical Forecast</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        )}
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
