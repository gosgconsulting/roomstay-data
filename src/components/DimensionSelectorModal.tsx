import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { X, Plus, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { checkDimensionsHaveData } from "@/lib/dimensionUtils";

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
  reportId?: string; // Added reportId prop
}

export const DimensionSelectorModal = ({
  open,
  onOpenChange,
  title,
  selectedDimensions,
  onDimensionsChange,
  onDateGranularityChange,
  currentDateGranularity = 'day',
  reportId, // Destructure reportId
}: DimensionSelectorModalProps) => {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddSelector, setShowAddSelector] = useState(false);
  const [selectedToAdd, setSelectedToAdd] = useState<string>("");
  const [dimensionGranularities, setDimensionGranularities] = useState<Record<string, string>>({});
  const [dimensionHasData, setDimensionHasData] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (open) {
      loadDimensions();
    }
  }, [open]);

  // Re-check data availability when reportId changes
  useEffect(() => {
    if (open && reportId && dimensions.length > 0) {
      const dimensionIds = dimensions.map(d => d.id);
      checkDataAvailability(dimensionIds, reportId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, open, dimensions.length]);

  const loadDimensions = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      console.log('[testing] DimensionSelectorModal - Loading dimensions for user:', user.id);

      // Load global dimensions (available to all users)
      const { data: globalData, error: globalError } = await supabase
        .from("dimensions")
        .select("*")
        .eq("scope", "global")
        .order("created_at", { ascending: false });

      if (globalError) throw globalError;

      // Load account-specific dimensions (we don't have accountId here, so load all account dimensions)
      const { data: accountData, error: accountError } = await supabase
        .from("dimensions")
        .select("*")
        .eq("scope", "account")
        .order("created_at", { ascending: false });

      if (accountError) throw accountError;

      // Load user's custom dimensions
      const { data: customData, error: customError } = await supabase
        .from("dimensions")
        .select("*")
        .eq("scope", "custom")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (customError) throw customError;

      // Combine all dimensions and remove duplicates by name (keep the most specific scope)
      const allDimensions = [
        ...(customData || []),    // Custom dimensions take precedence
        ...(accountData || []),   // Then account dimensions
        ...(globalData || [])     // Finally global dimensions
      ];

      // Remove duplicates by name, keeping the first occurrence (most specific scope)
      const uniqueDimensions = allDimensions.filter((dim, index, arr) => 
        arr.findIndex(d => d.name === dim.name) === index
      );

      console.log('[testing] DimensionSelectorModal - Loaded dimensions:', {
        global: globalData?.length || 0,
        account: accountData?.length || 0,
        custom: customData?.length || 0,
        total: uniqueDimensions.length
      });

      setDimensions(uniqueDimensions);

      // Check data availability for dimensions if reportId is provided
      if (reportId && uniqueDimensions.length > 0) {
        checkDataAvailability(uniqueDimensions.map(d => d.id), reportId);
      }
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
    
    // Save dimension changes per report
    if (reportId) {
      saveDimensionSettings(updated);
    }
  };

  const handleAddDimension = () => {
    if (selectedToAdd && !selectedDimensions.includes(selectedToAdd)) {
      const updated = [...selectedDimensions, selectedToAdd];
      onDimensionsChange(updated);
      setSelectedToAdd("");
      setShowAddSelector(false);
      
      // Save dimension changes per report
      if (reportId) {
        saveDimensionSettings(updated);
      }
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

  const checkDataAvailability = async (dimensionIds: string[], reportId: string) => {
    try {
      const hasDataMap = await checkDimensionsHaveData(dimensionIds, reportId);
      setDimensionHasData(hasDataMap);
    } catch (error) {
      console.error('[testing] Error checking dimension data availability:', error);
    }
  };

  const saveDimensionSettings = async (dimensions: string[]) => {
    if (!reportId) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      console.log(`[DIMENSION-SELECTOR] Saving dimensions for report ${reportId}:`, dimensions);

      // Check if a default view already exists for this report
      const { data: existingView } = await supabase
        .from("report_views")
        .select("id, filter_values, date_range_start, date_range_end, date_range_preset")
        .eq("report_id", reportId)
        .eq("user_id", user.id)
        .eq("is_default", true)
        .maybeSingle();

      const viewData = {
        filter_dimensions: dimensions,
        // Preserve existing filter settings if they exist
        filter_values: existingView?.filter_values || {},
        date_range_start: existingView?.date_range_start || null,
        date_range_end: existingView?.date_range_end || null,
        date_range_preset: existingView?.date_range_preset || "this_month",
      };

      if (existingView) {
        // Update existing view
        const { error } = await supabase
          .from("report_views")
          .update(viewData)
          .eq("id", existingView.id);

        if (error) {
          console.error('[DIMENSION-SELECTOR] Error updating report view:', error);
        } else {
          console.log('[DIMENSION-SELECTOR] Successfully updated dimension settings for report');
        }
      } else {
        // Create new view
        const { error } = await supabase
          .from("report_views")
          .insert({
            ...viewData,
            report_id: reportId,
            user_id: user.id,
            is_default: true,
          });

        if (error) {
          console.error('[DIMENSION-SELECTOR] Error creating report view:', error);
        } else {
          console.log('[DIMENSION-SELECTOR] Successfully created dimension settings for report');
        }
      }
    } catch (error) {
      console.error('[DIMENSION-SELECTOR] Error saving dimension settings:', error);
    }
  };

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
                                      <div className="h-3.5 w-3.5" /> // Placeholder for loading
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
