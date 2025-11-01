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
import { Pencil, Trash2, Plus, Link } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Dimension {
  id: string;
  name: string;
  type: string;
  formula: string | null;
  is_system?: boolean;
}

interface DimensionsListModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddNew: () => void;
  onEdit?: (dimension: Dimension) => void;
  refreshTrigger?: number; // Used to trigger refresh from parent
  reportId?: string;
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
}: DimensionsListModalProps) => {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
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

      // Get all data sources for the user's reports
      const { data: reports } = await supabase
        .from("reports")
        .select("id")
        .eq("user_id", user.id);

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
      if (!reportId) throw new Error("Report ID not provided");

      console.log('[testing] Loading dimensions for user:', user.id, 'report:', reportId);
      const { data, error } = await supabase
        .from("dimensions")
        .select("*")
        .eq("user_id", user.id)
        .eq("report_id", reportId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      console.log('[testing] Loaded report-specific dimensions:', data?.length || 0);
      console.log('[testing] Dimensions:', data?.map(d => `${d.name} (${d.is_system ? 'system' : 'user'})`));
      setDimensions(data || []);
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
    // [testing] Prevent deletion of system dimensions
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
      console.log('[testing] Deleting user dimension:', name);
      const { error } = await supabase
        .from("dimensions")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setDimensions(dimensions.filter((d) => d.id !== id));
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Dimensions ({dimensions.length})</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading dimensions...
            </div>
          ) : dimensions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No dimensions yet. Add your first dimension to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Formula</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
