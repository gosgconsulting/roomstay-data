import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Pencil, Trash2, Plus, Link, Eye, EyeOff, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import type { Dimension } from "@/types/dimensions";
import { useUser } from "@/lib/auth";
import { loadDimensionsForUser } from "@/lib/dimensionLoader";

interface DimensionsListModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddNew: () => void;
  onEdit?: (dimension: Dimension) => void;
  refreshTrigger?: number; // Used to trigger refresh from parent
  reportId?: string;
  accountId?: string;
  onVisibilityChange?: () => void; // Callback when visibility settings are saved
}

const typeLabels: Record<string, string> = {
  text: "Plain text",
  date: "Date", 
  number: "Number",
  currency: "Currency",
  percentage: "Percentage",
};

export const DimensionsListModal = ({
  open,
  onOpenChange,
  onAddNew,
  onEdit,
  refreshTrigger,
  reportId,
  accountId,
  onVisibilityChange,
}: DimensionsListModalProps) => {
  const { data: userData } = useUser();
  const user = userData?.user || null;
  const [textDimensions, setTextDimensions] = useState<Dimension[]>([]);
  const [valueDimensions, setValueDimensions] = useState<Dimension[]>([]);
  const [allDimensions, setAllDimensions] = useState<Dimension[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mappedDimensionIds, setMappedDimensionIds] = useState<Set<string>>(new Set());
  const [visibleDimensions, setVisibleDimensions] = useState<Set<string> | null>(null); // null = not loaded yet
  const [initialVisibleDimensions, setInitialVisibleDimensions] = useState<Set<string> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingDimensionId, setDeletingDimensionId] = useState<string | null>(null);
  const [editingDimensionId, setEditingDimensionId] = useState<string | null>(null);
  const [isAddingDimension, setIsAddingDimension] = useState(false);

  useEffect(() => {
    if (open) {
      loadDimensions();
      loadMappedDimensions();
      loadVisibleDimensions();
    }
  }, [open, refreshTrigger]);

  // When dimensions load and we have no saved settings, initialize all as visible
  useEffect(() => {
    // Only run once after dimensions are loaded
    if (isLoading || visibleDimensions === null) return;

    // If visibleDimensions is an empty set, it means no saved settings were found
    // So initialize with all dimension IDs to show all as visible
    if (visibleDimensions.size === 0) {
      const allDimensionIds = new Set<string>();

      allDimensions.forEach(d => allDimensionIds.add(d.id));

      if (allDimensionIds.size > 0) {
        console.log('[testing] No saved visibility settings, initializing all', allDimensionIds.size, 'dimensions as visible');
        setVisibleDimensions(allDimensionIds);
      }
    }
  }, [isLoading, visibleDimensions, allDimensions]);

  const loadVisibleDimensions = async () => {
    try {
      if (!reportId) {
        // No report ID, so can't have saved settings - default all visible
        setVisibleDimensions(new Set()); // Will be populated once dimensions load
        setInitialVisibleDimensions(new Set());
        return;
      }

      if (!user) {
        setVisibleDimensions(new Set());
        setInitialVisibleDimensions(new Set());
        return;
      }

      // Try to get saved visibility settings
      const { data: viewSettings, error } = await supabase
        .from("views")
        .select("visible_columns, visible_kpis, kpi_order, filter_values")
        .eq("mode", "performance_table")
        .eq("report_id", reportId)
        .eq("user_id", user.id)
        .eq("is_default", true)
        .maybeSingle();

      if (error) {
        console.warn("[testing] Could not load visible dimensions, will default to all visible:", error);
        // If we can't load settings, mark as empty (will be populated with all dimensions)
        setVisibleDimensions(new Set<string>());
        setInitialVisibleDimensions(new Set<string>());
      } else {
        // No saved visibility settings — default to all visible
        console.log("[testing] No saved visibility settings, will default to all visible");
        setVisibleDimensions(new Set<string>());
        setInitialVisibleDimensions(new Set<string>());
      }
    } catch (error) {
      console.error("[testing] Error loading visible dimensions:", error);
      // Fallback: default all visible
      setVisibleDimensions(new Set());
      setInitialVisibleDimensions(new Set());
    }
  };

  const toggleDimensionVisibility = (dimensionId: string) => {
    if (!reportId) {
      console.warn("[testing] No reportId provided, cannot toggle visibility");
      return;
    }

    // If visibleDimensions hasn't been initialized yet, start with all dimensions
    const currentVisible = visibleDimensions === null ? new Set<string>() : visibleDimensions;
    const newVisibleDimensions = new Set(currentVisible);

    if (newVisibleDimensions.has(dimensionId)) {
      newVisibleDimensions.delete(dimensionId);
    } else {
      newVisibleDimensions.add(dimensionId);
    }

    // Update local state only - no database save yet
    setVisibleDimensions(newVisibleDimensions);
    console.log('[testing] Toggled dimension visibility locally:', dimensionId);
  };

  const saveVisibilityChanges = async () => {
    try {
      if (!reportId) {
        console.warn("[testing] No reportId provided, cannot save visibility changes");
        return;
      }

      if (!user) {
        toast({
          title: "Error",
          description: "You must be logged in to save visibility changes",
          variant: "destructive",
        });
        return;
      }

      setIsSaving(true);
      console.log('[testing] Saving visibility changes to database');

      const visibilityArray = visibleDimensions ? Array.from(visibleDimensions) : [];

      // Create synchronized visibility settings
      const visibleDimensionNames = allDimensions
        .filter(d => visibleDimensions?.has(d.id))
        .map(d => d.name);

      // Sync visible_columns (for table columns)
      const visibleColumnIds = allDimensions
        .filter(d => visibleDimensions?.has(d.id))
        .map(d => d.id);

      // Sync visible_kpis (for KPI cards and chart) - only numeric/currency/percentage types
      const visibleKPIs = allDimensions
        .filter(d => 
          visibleDimensions?.has(d.id) && 
          ['number', 'currency', 'percentage'].includes(d.type)
        )
        .map(d => d.name);

      console.log('[testing] Syncing visibility across all systems:', {
        dimensions: visibilityArray.length,
        columns: visibleColumnIds.length,
        kpis: visibleKPIs.length
      });

      // Try to get existing view
      const { data: existingView, error: viewError } = await supabase
        .from("views")
        .select("id, kpi_order")
        .eq("mode", "performance_table")
        .eq("report_id", reportId)
        .eq("user_id", user.id)
        .eq("is_default", true)
        .maybeSingle();

      if (viewError) {
        throw new Error(`Failed to fetch report view: ${viewError.message}`);
      }

      // Preserve existing KPI order, but filter to only visible KPIs
      let kpiOrder = visibleKPIs;
      if (existingView?.kpi_order && Array.isArray(existingView.kpi_order)) {
        // Keep existing order for visible KPIs, add new ones at the end
        const existingOrder = existingView.kpi_order.filter((kpi: string) => visibleKPIs.includes(kpi));
        const newKPIs = visibleKPIs.filter(kpi => !existingOrder.includes(kpi));
        kpiOrder = [...existingOrder, ...newKPIs];
      }

      const updateData = {
        visible_dimensions: visibilityArray,
        visible_columns: visibleColumnIds,
        visible_kpis: visibleKPIs,
        kpi_order: kpiOrder,
      };

      if (existingView?.id) {
        // Update existing view
        const { error: updateError } = await supabase
          .from("views")
          .update({
            ...updateData,
            name: "Default View", // Use static name since existingView type is unclear
          })
          .eq("mode", "performance_table")
          .eq("id", existingView.id);

        if (updateError) {
          throw new Error(`Failed to update report view: ${updateError.message}`);
        }
      } else {
        // Create new default view
        const { error: insertError } = await supabase
          .from("views")
          .insert({
            mode: "performance_table",
            report_id: reportId,
            user_id: user.id,
            is_default: true,
            name: "Default View",
            ...updateData,
          });

        if (insertError) {
          throw new Error(`Failed to create report view: ${insertError.message}`);
        }
      }

      // Update initial state to match current state
      setInitialVisibleDimensions(new Set(visibleDimensions));

      toast({
        title: "Success",
        description: "Visibility settings saved and synchronized across all components",
      });

      console.log('[testing] Successfully saved and synchronized visibility changes');
      
      // Notify parent components that visibility has changed
      onVisibilityChange?.();
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : (typeof error === 'string' ? error : JSON.stringify(error));
      console.error('[testing] Error saving visibility changes:', errorMsg);
      toast({
        title: "Error",
        description: "Failed to save visibility settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const cancelVisibilityChanges = () => {
    if (initialVisibleDimensions) {
      setVisibleDimensions(new Set(initialVisibleDimensions));
      console.log('[testing] Cancelled visibility changes, reverted to initial state');
    }
    onOpenChange(false);
  };

  const hasUnsavedChanges = () => {
    if (!initialVisibleDimensions || !visibleDimensions) return false;
    
    // Compare sets
    if (initialVisibleDimensions.size !== visibleDimensions.size) return true;
    
    for (const id of visibleDimensions) {
      if (!initialVisibleDimensions.has(id)) return true;
    }
    
    return false;
  };

  const loadMappedDimensions = async () => {
    try {
      if (!user) return;

      // Get all data sources for the user's reports in this account
      let query = supabase
        .from("reports")
        .select("id")
        .eq("user_id", user.id);

      // Filter by account if provided
      if (accountId) {
        query = query.eq("account_id", accountId);
      }

      const { data: reports } = await query;

      if (!reports) return;

      const reportIds = reports.map(r => r.id);

      // Get all data sources for these reports
      const { data: dataSources } = await supabase
        .from("data_sources")
        .select("column_mappings")
        .in("report_id", reportIds);

      if (!dataSources) return;

      // Extract all mapped dimension IDs
      const mappedIds = new Set<string>();
      dataSources.forEach(ds => {
        if (ds.column_mappings) {
          const mappings = ds.column_mappings as Record<string, string>;
          Object.values(mappings).forEach(dimensionId => {
            if (dimensionId) mappedIds.add(dimensionId);
          });
        }
      });

      setMappedDimensionIds(mappedIds);
    } catch (error) {
      console.error("Error loading mapped dimensions:", error);
    }
  };

  const loadDimensions = async () => {
    try {
      setIsLoading(true);
      if (!user) throw new Error("User not authenticated");

      const uniqueDimensions = await loadDimensionsForUser(user.id, reportId, {
        accountId: accountId ?? undefined,
      });
      const withConditions = uniqueDimensions.map((d) => ({
        ...d,
        conditions: Array.isArray(d.conditions) ? d.conditions : [],
      })) as Dimension[];

      const textDims = withConditions.filter((d) => d.type === "text");
      const valueDims = withConditions.filter((d) =>
        ["number", "currency", "percentage", "date"].includes(d.type)
      );

      setTextDimensions(textDims);
      setValueDimensions(valueDims);
      setAllDimensions(withConditions);
    } catch (error) {
      console.error("Error loading dimensions:", error);
      toast({
        title: "Error",
        description: "Failed to load dimensions",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // [testing] Check if dimension is a system/default dimension that cannot be deleted
  const isSystemDimension = (dimension: Dimension): boolean => {
    const systemDimensionNames = [
      'Impressions', 'Clicks', 'Revenue', 'Cost', 'Conversions', 'Leads',
      'CTR', 'ROAS', 'Cost of sale', 'Conversion Rate', 'CPM', 'CPC', 'Impression Share'
    ];
    return dimension.is_system === true || systemDimensionNames.includes(dimension.name);
  };

  const handleDelete = async (id: string, name: string, dimension: Dimension) => {
    console.log('[DIMENSIONS] handleDelete called with:', { id, name, dimension });
    
    // Prevent deletion of system dimensions
    if (isSystemDimension(dimension)) {
      console.log('[DIMENSIONS] Attempted to delete system dimension:', name);
      toast({
        title: "Cannot delete system dimension",
        description: `"${name}" is a default dimension and cannot be deleted`,
        variant: "destructive",
      });
      return;
    }

    // Prevent multiple simultaneous deletions
    if (deletingDimensionId) {
      console.log('[DIMENSIONS] Delete already in progress for:', deletingDimensionId);
      return;
    }

    // Add confirmation dialog
    if (!window.confirm(`Are you sure you want to delete the dimension "${name}"? This action cannot be undone.`)) {
      console.log('[DIMENSIONS] Delete cancelled by user');
      return;
    }

    try {
      setDeletingDimensionId(id);
      console.log('[DIMENSIONS] Deleting dimension:', name);
      
      const { error } = await supabase
        .from("dimensions")
        .delete()
        .eq("id", id);

      if (error) {
        console.error('[DIMENSIONS] Delete error:', error);
        throw error;
      }

      console.log('[DIMENSIONS] Dimension deleted successfully, updating state');
      // Remove from appropriate list
      setTextDimensions(prev => prev.filter((d) => d.id !== id));
      setValueDimensions(prev => prev.filter((d) => d.id !== id));
      setAllDimensions(prev => prev.filter((d) => d.id !== id));
      
      // Also remove from visible dimensions if present
      if (visibleDimensions && visibleDimensions.has(id)) {
        setVisibleDimensions(prev => {
          if (!prev) return prev;
          const newSet = new Set(prev);
          newSet.delete(id);
          return newSet;
        });
      }
      
      toast({
        title: "Dimension deleted",
        description: `Deleted "${name}"`,
      });
    } catch (error) {
      console.error("[DIMENSIONS] Error deleting dimension:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete dimension",
        variant: "destructive",
      });
    } finally {
      setDeletingDimensionId(null);
    }
  };

  const DimensionTable = ({ dimensions, showActions = true }: { dimensions: Dimension[], showActions?: boolean }) => (
    dimensions.length === 0 ? (
      <div className="text-center py-8 text-muted-foreground">
        No dimensions in this category yet.
      </div>
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Formula</TableHead>
            {showActions && <TableHead className="text-right">Actions</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {dimensions.map((dimension) => (
            <TableRow key={dimension.id}>
              <TableCell className="font-medium">
                {dimension.name}
              </TableCell>
              <TableCell>{typeLabels[dimension.type] || dimension.type}</TableCell>
              <TableCell className="text-muted-foreground">
                {dimension.formula || "-"}
              </TableCell>
              {showActions && (
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    {reportId && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 transition-colors"
                        onClick={() => toggleDimensionVisibility(dimension.id)}
                        title={visibleDimensions === null || visibleDimensions.has(dimension.id) ? "Deactivate for report" : "Activate for report"}
                      >
                        {visibleDimensions === null || visibleDimensions.has(dimension.id) ? (
                          <Eye className="h-4 w-4 text-primary hover:text-primary/80" />
                        ) : (
                          <EyeOff className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                        )}
                      </Button>
                    )}
                    {mappedDimensionIds.has(dimension.id) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-primary"
                        title="Mapped to data source"
                      >
                        <Link className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => {
                        console.log('[DIMENSIONS] Edit button clicked for dimension:', dimension.name, dimension);
                        console.log('[DIMENSIONS] onEdit prop available:', !!onEdit);
                        setEditingDimensionId(dimension.id);
                        if (onEdit) {
                          onEdit(dimension);
                          // Clear the editing state after a delay to show feedback
                          setTimeout(() => setEditingDimensionId(null), 1000);
                        } else {
                          console.error('[DIMENSIONS] onEdit prop is missing!');
                          setEditingDimensionId(null);
                        }
                      }}
                      disabled={editingDimensionId === dimension.id}
                      title={editingDimensionId === dimension.id ? "Opening editor..." : "Edit dimension"}
                      data-testid="edit-button"
                    >
                      <Pencil className={`h-4 w-4 ${editingDimensionId === dimension.id ? 'animate-pulse' : ''}`} data-testid="edit-icon" />
                    </Button>
                    {!isSystemDimension(dimension) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => {
                          console.log('[DIMENSIONS] Delete button clicked for dimension:', dimension.name, dimension);
                          handleDelete(dimension.id, dimension.name, dimension);
                        }}
                        disabled={deletingDimensionId === dimension.id}
                        title={deletingDimensionId === dimension.id ? "Deleting..." : "Delete dimension"}
                      >
                        <Trash2 className={`h-4 w-4 ${deletingDimensionId === dimension.id ? 'animate-pulse' : ''}`} />
                      </Button>
                    )}
                    {isSystemDimension(dimension) && (
                      <div className="h-8 w-8 flex items-center justify-center">
                        <span className="text-xs text-muted-foreground" title="System dimension - cannot be deleted">
                          SYS
                        </span>
                      </div>
                    )}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Dimensions ({allDimensions.length})
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading dimensions...
            </div>
          ) : (
            <Tabs defaultValue="text" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="text">
                  Text ({textDimensions.length})
                </TabsTrigger>
                <TabsTrigger value="values">
                  Values ({valueDimensions.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="text" className="mt-4">
                <DimensionTable dimensions={textDimensions} showActions={true} />
              </TabsContent>

              <TabsContent value="values" className="mt-4">
                <DimensionTable dimensions={valueDimensions} showActions={true} />
              </TabsContent>

            </Tabs>
          )}
        </div>

        <div className="border-t pt-4 space-y-3">
          {/* Save/Cancel buttons for visibility changes - only show when reportId is present */}
          {reportId && hasUnsavedChanges() && (
            <div className="flex gap-2">
              <Button 
                onClick={saveVisibilityChanges} 
                disabled={isSaving}
                className="flex-1 gap-2"
                variant="default"
              >
                <Save className="h-4 w-4" />
                {isSaving ? "Saving..." : "Save Visibility Changes"}
              </Button>
              <Button 
                onClick={cancelVisibilityChanges} 
                disabled={isSaving}
                variant="outline"
                className="gap-2"
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
            </div>
          )}
          
          {/* Add Dimension button */}
          <Button 
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              alert('ADD DIMENSION BUTTON CLICKED!'); // Simple test
              console.log('[DIMENSIONS] Add dimension button clicked - DIRECT TEST');
              console.log('[DIMENSIONS] onAddNew prop:', onAddNew);
              console.log('[DIMENSIONS] isAddingDimension:', isAddingDimension);
              
              if (!onAddNew) {
                console.error('[DIMENSIONS] onAddNew prop is missing!');
                alert('onAddNew prop is missing!');
                return;
              }
              
              setIsAddingDimension(true);
              console.log('[DIMENSIONS] Calling onAddNew...');
              
              try {
                onAddNew();
                console.log('[DIMENSIONS] onAddNew called successfully');
              } catch (error) {
                console.error('[DIMENSIONS] Error calling onAddNew:', error);
                alert('Error calling onAddNew: ' + error);
              }
              
              // Clear the adding state after a delay
              setTimeout(() => {
                console.log('[DIMENSIONS] Clearing isAddingDimension state');
                setIsAddingDimension(false);
              }, 1500);
            }} 
            disabled={isAddingDimension}
            className="w-full gap-2" 
            variant={reportId && hasUnsavedChanges() ? "secondary" : "default"}
            type="button"
          >
            <Plus className={`h-4 w-4 ${isAddingDimension ? 'animate-pulse' : ''}`} />
            {isAddingDimension ? "OPENING..." : "ADD A DIMENSION"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};