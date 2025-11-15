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

interface Dimension {
  id: string;
  name: string;
  type: string;
  formula: string | null;
  is_system?: boolean;
  scope?: 'global' | 'custom' | 'account';
}

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
  const [textDimensions, setTextDimensions] = useState<Dimension[]>([]);
  const [valueDimensions, setValueDimensions] = useState<Dimension[]>([]);
  const [allDimensions, setAllDimensions] = useState<Dimension[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mappedDimensionIds, setMappedDimensionIds] = useState<Set<string>>(new Set());
  const [visibleDimensions, setVisibleDimensions] = useState<Set<string> | null>(null); // null = not loaded yet
  const [initialVisibleDimensions, setInitialVisibleDimensions] = useState<Set<string> | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setVisibleDimensions(new Set());
        setInitialVisibleDimensions(new Set());
        return;
      }

      // Try to get saved visibility settings
      const { data: viewSettings, error } = await supabase
        .from("report_views")
        .select("visible_dimensions")
        .eq("report_id", reportId)
        .eq("user_id", user.id)
        .eq("is_default", true)
        .maybeSingle();

      if (error) {
        console.warn("[testing] Could not load visible dimensions, will default to all visible:", error);
        // If we can't load settings, mark as empty (will be populated with all dimensions)
        setVisibleDimensions(new Set());
        setInitialVisibleDimensions(new Set());
      } else if (viewSettings?.visible_dimensions && Array.isArray(viewSettings.visible_dimensions) && viewSettings.visible_dimensions.length > 0) {
        // Use saved visibility settings
        console.log("[testing] Loaded saved visibility settings:", viewSettings.visible_dimensions.length);
        const visibleSet = new Set(viewSettings.visible_dimensions);
        setVisibleDimensions(visibleSet);
        setInitialVisibleDimensions(new Set(visibleSet));
      } else {
        // No saved settings - will default to all visible
        console.log("[testing] No saved visibility settings, will default to all visible");
        setVisibleDimensions(new Set());
        setInitialVisibleDimensions(new Set());
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

      const { data: { user } } = await supabase.auth.getUser();
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
        .from("report_views")
        .select("id, kpi_order")
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
          .from("report_views")
          .update({
            ...updateData,
            name: "Default View", // Use static name since existingView type is unclear
          })
          .eq("id", existingView.id);

        if (updateError) {
          throw new Error(`Failed to update report view: ${updateError.message}`);
        }
      } else {
        // Create new default view
        const { error: insertError } = await supabase
          .from("report_views")
          .insert({
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
    // Revert to initial state
    if (initialVisibleDimensions) {
      setVisibleDimensions(new Set(initialVisibleDimensions));
      console.log('[testing] Cancelled visibility changes, reverted to initial state');
    }
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
      const { data: { user } } = await supabase.auth.getUser();
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
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) throw new Error("User not authenticated");

      console.log('[testing] Loading dimensions for user:', user.id, 'report:', reportId, 'account:', accountId);

      // Load account-specific dimensions first (highest priority)
      let accountData: Dimension[] = [];
      if (accountId) {
        const { data, error: accountError } = await supabase
          .from("dimensions")
          .select("*")
          .eq("scope", "account")
          .eq("account_id", accountId)
          .order("created_at", { ascending: false });

        if (accountError) throw accountError;
        accountData = (data || []) as Dimension[];
      }

      // Load custom dimensions for this user
      let customData: Dimension[] = [];
      const { data, error: customError } = await supabase
        .from("dimensions")
        .select("*")
        .eq("user_id", user.id)
        .eq("scope", "custom")
        .order("created_at", { ascending: false });

      if (customError) throw customError;
      customData = (data || []) as Dimension[];

      // Load global dimensions (lowest priority, fallback)
      const { data: globalData, error: globalError } = await supabase
        .from("dimensions")
        .select("*")
        .eq("scope", "global")
        .order("created_at", { ascending: false });

      if (globalError) throw globalError;

      // Combine all dimensions with proper priority: account > custom > global
      const allDimensions = [
        ...accountData,
        ...customData,
        ...(globalData || [])
      ] as Dimension[];

      // Deduplicate by name, keeping highest priority (first occurrence)
      const seenNames = new Set<string>();
      const uniqueDimensions = allDimensions.filter(dim => {
        if (seenNames.has(dim.name)) {
          return false;
        }
        seenNames.add(dim.name);
        return true;
      });

      console.log('[testing] Loaded dimensions - Account:', accountData?.length || 0, 'Custom:', customData?.length || 0, 'Global:', globalData?.length || 0, 'Unique:', uniqueDimensions.length);

      // Separate into text and value dimensions
      const textDims = uniqueDimensions.filter(d => d.type === 'text');
      const valueDims = uniqueDimensions.filter(d => d.type !== 'text'); // number, currency, percentage, date

      setTextDimensions(textDims);
      setValueDimensions(valueDims);
      setAllDimensions(uniqueDimensions);
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
    // Prevent deletion of system dimensions
    if (isSystemDimension(dimension)) {
      console.log('[testing] Attempted to delete system dimension:', name);
      toast({
        title: "Cannot delete system dimension",
        description: `"${name}" is a default dimension and cannot be deleted`,
        variant: "destructive",
      });
      return;
    }

    try {
      console.log('[testing] Deleting dimension:', name);
      const { error } = await supabase
        .from("dimensions")
        .delete()
        .eq("id", id);

      if (error) throw error;

      // Remove from appropriate list
      setTextDimensions(textDimensions.filter((d) => d.id !== id));
      setValueDimensions(valueDimensions.filter((d) => d.id !== id));
      setAllDimensions(allDimensions.filter((d) => d.id !== id));
      toast({
        title: "Dimension deleted",
        description: `Deleted "${name}"`,
      });
    } catch (error) {
      console.error("Error deleting dimension:", error);
      toast({
        title: "Error",
        description: "Failed to delete dimension",
        variant: "destructive",
      });
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
                        className="h-8 w-8"
                        onClick={() => toggleDimensionVisibility(dimension.id)}
                        title={visibleDimensions === null || visibleDimensions.has(dimension.id) ? "Deactivate for report" : "Activate for report"}
                      >
                        {visibleDimensions === null || visibleDimensions.has(dimension.id) ? (
                          <Eye className="h-4 w-4 text-primary" />
                        ) : (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
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
                      onClick={() => onEdit?.(dimension)}
                      title="Edit dimension"
                      data-testid="edit-button"
                    >
                      <Pencil className="h-4 w-4" data-testid="edit-icon" />
                    </Button>
                    {!isSystemDimension(dimension) && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(dimension.id, dimension.name, dimension)}
                        title="Delete dimension"
                      >
                        <Trash2 className="h-4 w-4" />
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
              <TabsList className="grid w-full grid-cols-2">
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
          <Button onClick={onAddNew} className="w-full gap-2" variant={reportId && hasUnsavedChanges() ? "secondary" : "default"}>
            <Plus className="h-4 w-4" />
            ADD A DIMENSION
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};