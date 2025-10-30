import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Eye, EyeOff } from "lucide-react";
import { useState, useEffect } from "react";

interface Dimension {
  id: string;
  name: string;
  type: string;
}

interface ColumnMapping {
  column: string;
  dimensionId: string | null;
  visible: boolean;
}

interface ColumnMappingStepProps {
  headers: string[];
  onSave: (mappings: ColumnMapping[]) => void;
  onBack: () => void;
  isLoading: boolean;
}

export const ColumnMappingStep = ({
  headers,
  onSave,
  onBack,
  isLoading,
}: ColumnMappingStepProps) => {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [isLoadingDimensions, setIsLoadingDimensions] = useState(true);

  useEffect(() => {
    loadDimensions();
    initializeMappings();
  }, [headers]);

  const loadDimensions = async () => {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) return;

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
      setIsLoadingDimensions(false);
    }
  };

  const initializeMappings = () => {
    const initialMappings: ColumnMapping[] = headers.map((header) => ({
      column: header,
      dimensionId: null,
      visible: true,
    }));
    setMappings(initialMappings);
  };

  const updateMapping = (index: number, dimensionId: string | null) => {
    const newMappings = [...mappings];
    newMappings[index].dimensionId = dimensionId;
    setMappings(newMappings);
  };

  const toggleVisibility = (index: number) => {
    const newMappings = [...mappings];
    newMappings[index].visible = !newMappings[index].visible;
    setMappings(newMappings);
  };

  const handleSave = () => {
    onSave(mappings);
  };

  if (isLoadingDimensions) {
    return (
      <div className="py-8 text-center text-muted-foreground">
        Loading dimensions...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-sm text-muted-foreground">
        Map your Google Sheets columns to dimensions. You can hide columns you don't need.
      </div>

      <div className="border rounded-lg max-h-[400px] overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 bg-background z-10">
            <TableRow>
              <TableHead className="w-[35%]">Column from Sheet</TableHead>
              <TableHead className="w-[50%]">Map to Dimension</TableHead>
              <TableHead className="w-[15%] text-center">Visible</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mappings.map((mapping, index) => (
              <TableRow key={index}>
                <TableCell className="font-medium">{mapping.column}</TableCell>
                <TableCell>
                  <Select
                    value={mapping.dimensionId || ""}
                    onValueChange={(value) => updateMapping(index, value || null)}
                  >
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Select dimension..." />
                    </SelectTrigger>
                    <SelectContent className="bg-background z-50">
                      <SelectItem value="">No mapping</SelectItem>
                      {dimensions.map((dimension) => (
                        <SelectItem key={dimension.id} value={dimension.id}>
                          {dimension.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleVisibility(index)}
                    className="h-8 w-8"
                  >
                    {mapping.visible ? (
                      <Eye className="h-4 w-4 text-primary" />
                    ) : (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex justify-end gap-3 pt-4">
        <Button variant="outline" onClick={onBack} disabled={isLoading}>
          Back
        </Button>
        <Button onClick={handleSave} disabled={isLoading}>
          {isLoading ? "Saving..." : "Save Data Source"}
        </Button>
      </div>
    </div>
  );
};
