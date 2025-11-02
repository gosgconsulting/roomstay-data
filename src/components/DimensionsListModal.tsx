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
import { Pencil, Trash2, Plus, Link, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Dimension {
  id: string;
  name: string;
  type: string;
  formula: string | null;
  is_system?: boolean;
  scope?: 'global' | 'custom';
}

interface DimensionsListModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddNew: () => void;
  onEdit?: (dimension: Dimension) => void;
  refreshTrigger?: number; // Used to trigger refresh from parent
  reportId?: string;
  accountId?: string;
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
}: DimensionsListModalProps) => {
  const [globalDimensions, setGlobalDimensions] = useState<Dimension[]>([]);
  const [customDimensions, setCustomDimensions] = useState<Dimension[]>([]);
  const [accountDimensions, setAccountDimensions] = useState<Dimension[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [mappedDimensionIds, setMappedDimensionIds] = useState<Set<string>>(new Set());
  const [visibleDimensions, setVisibleDimensions] = useState<Set<string> | null>(null); // null = not loaded yet

  useEffect(() => {
    if (open) {
      loadDimensions();
      loadMappedDimensions();
      loadVisibleDimensions();
    }
  }, [open, refreshTrigger]);

  // When dimensions load, set all as visible by default
  useEffect(() => {
    const allDimensionIds = new Set<string>();

    globalDimensions.forEach(d => allDimensionIds.add(d.id));
    accountDimensions.forEach(d => allDimensionIds.add(d.id));
    customDimensions.forEach(d => allDimensionIds.add(d.id));

    // Only set if we haven't loaded saved visibility settings yet
    if (visibleDimensions.size === 0 && allDimensionIds.size > 0) {
      console.log('[testing] Initializing all dimensions as visible:', allDimensionIds.size);
      setVisibleDimensions(allDimensionIds);
    }
  }, [globalDimensions, accountDimensions, customDimensions]);

  const loadVisibleDimensions = async () => {
    try {
      if (!reportId) {
        // No report ID, so can't have saved settings - default all visible
        setVisibleDimensions(new Set()); // Will be populated once dimensions load
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setVisibleDimensions(new Set());
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
      } else if (viewSettings?.visible_dimensions && Array.isArray(viewSettings.visible_dimensions) && viewSettings.visible_dimensions.length > 0) {
        // Use saved visibility settings
        console.log("[testing] Loaded saved visibility settings:", viewSettings.visible_dimensions.length);
        setVisibleDimensions(new Set(viewSettings.visible_dimensions));
      } else {
        // No saved settings - will default to all visible
        console.log("[testing] No saved visibility settings, will default to all visible");
        setVisibleDimensions(new Set());
      }
    } catch (error) {
      console.error("[testing] Error loading visible dimensions:", error);
      // Fallback: default all visible
      setVisibleDimensions(new Set());
    }
  };

  const toggleDimensionVisibility = async (dimensionId: string) => {
    try {
      if (!reportId) {
        console.warn("[testing] No reportId provided, cannot toggle visibility");
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.warn("[testing] No user authenticated, cannot toggle visibility");
        return;
      }

      const newVisibleDimensions = new Set(visibleDimensions);

      if (newVisibleDimensions.has(dimensionId)) {
        newVisibleDimensions.delete(dimensionId);
      } else {
        newVisibleDimensions.add(dimensionId);
      }

      // Update local state immediately for responsive UI
      setVisibleDimensions(newVisibleDimensions);

      // Try to persist to database, but don't fail if it doesn't work
      try {
        const { data: existingView, error: viewError } = await supabase
          .from("report_views")
          .select("id")
          .eq("report_id", reportId)
          .eq("user_id", user.id)
          .eq("is_default", true)
          .maybeSingle();

        if (viewError) {
          console.warn("[testing] Warning - could not fetch report view:", viewError);
          // Don't throw, just warn - continue with local state
          return;
        }

        if (existingView?.id) {
          // Update existing view
          const { error: updateError } = await supabase
            .from("report_views")
            .update({ visible_dimensions: Array.from(newVisibleDimensions) })
            .eq("id", existingView.id);

          if (updateError) {
            console.warn("[testing] Warning - could not update report view:", updateError);
            // Don't throw - local state is updated
          }
        } else {
          // Create new default view with this setting
          const { error: insertError } = await supabase
            .from("report_views")
            .insert({
              report_id: reportId,
              user_id: user.id,
              is_default: true,
              name: "Default View",
              visible_dimensions: Array.from(newVisibleDimensions),
            });

          if (insertError) {
            console.warn("[testing] Warning - could not create report view:", insertError);
            // Don't throw - local state is updated
          }
        }
      } catch (dbError) {
        // Silently fail on database operations - local state is already updated
        console.warn("[testing] Database operation failed but local state updated:", dbError);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : (typeof error === 'string' ? error : JSON.stringify(error));
      console.error('[testing] Unexpected error in toggleDimensionVisibility:', errorMsg);
    }
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

      // Load global dimensions (available to all users)
      const { data: globalData, error: globalError } = await supabase
        .from("dimensions")
        .select("*")
        .eq("scope", "global")
        .order("created_at", { ascending: false });

      if (globalError) throw globalError;

      // Load account-specific dimensions if accountId is provided
      let accountData: Dimension[] = [];
      if (accountId) {
        const { data, error: accountError } = await supabase
          .from("dimensions")
          .select("*")
          .eq("scope", "account")
          .eq("account_id", accountId)
          .order("created_at", { ascending: false });

        if (accountError) throw accountError;
        accountData = data || [];
      }

      // Load custom dimensions for this specific report if reportId is provided
      let customData: Dimension[] = [];
      if (reportId) {
        const { data, error: customError } = await supabase
          .from("dimensions")
          .select("*")
          .eq("user_id", user.id)
          .eq("report_id", reportId)
          .eq("scope", "custom")
          .order("created_at", { ascending: false });

        if (customError) throw customError;
        customData = data || [];
      }

      console.log('[testing] Loaded global dimensions:', globalData?.length || 0);
      console.log('[testing] Loaded account dimensions:', accountData?.length || 0);
      console.log('[testing] Loaded custom dimensions:', customData?.length || 0);

      setGlobalDimensions(globalData || []);
      setAccountDimensions(accountData);
      setCustomDimensions(customData);
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

    // Prevent deletion of global dimensions
    if (dimension.scope === 'global') {
      toast({
        title: "Cannot delete global dimension",
        description: `"${name}" is a global dimension and can only be deleted by administrators`,
        variant: "destructive",
      });
      return;
    }

    try {
      console.log('[testing] Deleting custom dimension:', name);
      const { error } = await supabase
        .from("dimensions")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setCustomDimensions(customDimensions.filter((d) => d.id !== id));
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
                    {dimension.scope === 'custom' && !isSystemDimension(dimension) && (
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
                    {dimension.scope === 'global' && (
                      <div className="h-8 w-8 flex items-center justify-center">
                        <span className="text-xs text-muted-foreground font-semibold" title="Global dimension">
                          GLOBAL
                        </span>
                      </div>
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
            Dimensions ({globalDimensions.length + accountDimensions.length + customDimensions.length})
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading dimensions...
            </div>
          ) : (
            <Tabs defaultValue="global" className="w-full">
              <TabsList className={`grid w-full ${accountDimensions.length > 0 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <TabsTrigger value="global">
                  Global ({globalDimensions.length})
                </TabsTrigger>
                {accountDimensions.length > 0 && (
                  <TabsTrigger value="account">
                    Account ({accountDimensions.length})
                  </TabsTrigger>
                )}
                <TabsTrigger value="custom">
                  Custom ({customDimensions.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="global" className="mt-4">
                <DimensionTable dimensions={globalDimensions} showActions={true} />
              </TabsContent>

              {accountDimensions.length > 0 && (
                <TabsContent value="account" className="mt-4">
                  <DimensionTable dimensions={accountDimensions} showActions={true} />
                </TabsContent>
              )}

              <TabsContent value="custom" className="mt-4">
                <DimensionTable dimensions={customDimensions} showActions={true} />
              </TabsContent>
            </Tabs>
          )}
        </div>

        <div className="border-t pt-4">
          <Button onClick={onAddNew} className="w-full gap-2">
            <Plus className="h-4 w-4" />
            ADD A DIMENSION
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
