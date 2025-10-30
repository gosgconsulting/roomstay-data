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
import { Eye, Trash2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Dimension {
  id: string;
  name: string;
  type: string;
  formula: string | null;
}

interface DimensionsListModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAddNew: () => void;
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
}: DimensionsListModalProps) => {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (open) {
      loadDimensions();
    }
  }, [open]);

  const loadDimensions = async () => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) throw new Error("User not authenticated");

      const { data, error } = await supabase
        .from("dimensions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
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

  const handleDelete = async (id: string, name: string) => {
    try {
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleDelete(dimension.id, dimension.name)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
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
