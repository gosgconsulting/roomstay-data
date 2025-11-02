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
import { Pencil, Trash2, Plus, Link } from "lucide-react";
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

  useEffect(() => {
    if (open) {
      loadDimensions();
      loadMappedDimensions();
    }
  }, [open, refreshTrigger]);

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
