import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  newDimensionName?: string;
  newDimensionType?: string;
}

interface ColumnMappingStepProps {
  headers: string[];
  onSave: (mappings: ColumnMapping[]) => void;
  onBack: () => void;
  isLoading: boolean;
  existingMappings?: ColumnMapping[];
  accountId?: string;
  reportId?: string;
}

export const ColumnMappingStep = ({
  headers,
  onSave,
  onBack,
  isLoading,
  existingMappings,
  accountId,
  reportId,
}: ColumnMappingStepProps) => {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [isLoadingDimensions, setIsLoadingDimensions] = useState(true);

  useEffect(() => {
    loadDimensions();
  }, []);

  useEffect(() => {
    if (dimensions.length > 0 && headers.length > 0) {
      initializeMappings();
    }
  }, [dimensions, headers, existingMappings]);

  const loadDimensions = async () => {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) return;

      const { data, error } = await supabase
        .from("dimensions")
        .select("*")
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
    // If we have existing mappings, use them
    if (existingMappings && existingMappings.length > 0) {
      // Match existing mappings with current headers
      const updatedMappings: ColumnMapping[] = headers.map((header) => {
        const existingMapping = existingMappings.find(m => m.column === header);
        if (existingMapping) {
          return existingMapping;
        }
        // For new columns not in existing mappings, try smart matching
        const matchedDimension = findBestMatch(header, dimensions);
        return {
          column: header,
          dimensionId: matchedDimension?.id || "none",
          visible: true,
        };
      });
      setMappings(updatedMappings);
    } else {
      // No existing mappings, use smart matching
      const initialMappings: ColumnMapping[] = headers.map((header) => {
        const matchedDimension = findBestMatch(header, dimensions);
        return {
          column: header,
          dimensionId: matchedDimension?.id || "none",
          visible: true,
        };
      });
      setMappings(initialMappings);
    }
  };

  // Smart matching function to find the best dimension match for a column
  const findBestMatch = (columnName: string, dimensions: Dimension[]): Dimension | null => {
    const normalizedColumn = normalizeString(columnName);
    
    // Define common synonyms/mappings - more specific matches
    const synonyms: Record<string, string[]> = {
      'impressions': ['impression', 'impr', 'imp', 'impressions'],
      'clicks': ['click', 'clk', 'clicks'],
      'conversions': ['conversion', 'conversions', 'booking', 'bookings', 'conv', 'cvr'],
      'purchases': ['purchase', 'purchases', 'orders', 'order'],
      'cost': ['spend', 'cost', 'costs'],
      'revenue': ['rev', 'revenue', 'income', 'sales'],
      'ctr': ['click_through_rate', 'clickrate', 'ctr'],
      'cpc': ['cost_per_click', 'costperclick'],
      'cpm': ['cost_per_mille', 'cost_per_thousand', 'cpm'],
      'roas': ['return_on_ad_spend', 'returnon_ad_spend', 'roas'],
      'leads': ['lead', 'leads', 'prospects'],
    };

    // First try exact match (case-insensitive)
    let exactMatch = dimensions.find(
      d => normalizeString(d.name) === normalizedColumn
    );
    if (exactMatch) return exactMatch;

    // Try synonym matching with exact synonym match first
    for (const [dimensionKey, synonymList] of Object.entries(synonyms)) {
      // Check if the column name exactly matches any synonym
      if (synonymList.includes(normalizedColumn)) {
        const match = dimensions.find(d => normalizeString(d.name) === dimensionKey || normalizeString(d.name).includes(dimensionKey));
        if (match) return match;
      }
    }

    // Try more lenient partial match for compound names (e.g., "Purchases conversion value")
    // Only match if dimension name is a complete word in the column
    const partialMatch = dimensions.find(d => {
      const normalizedDim = normalizeString(d.name);
      // Only match if dimension appears as a complete word segment
      const columnWords = columnName.toLowerCase().split(/[\s_-]+/);
      const dimensionWords = d.name.toLowerCase().split(/[\s_-]+/);
      
      // Check if all dimension words appear in column words
      return dimensionWords.every(dimWord => 
        columnWords.some(colWord => colWord === dimWord || colWord.includes(dimWord))
      );
    });
    
    return partialMatch || null;
  };

  // Normalize string for comparison (lowercase, remove spaces and special chars)
  const normalizeString = (str: string): string => {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();
  };

  const updateMapping = (index: number, dimensionId: string | null) => {
    const newMappings = [...mappings];
    newMappings[index].dimensionId = dimensionId;
    
    // If "create_new" is selected, auto-populate new dimension name
    if (dimensionId === 'create_new') {
      newMappings[index].newDimensionName = mappings[index].column;
      newMappings[index].newDimensionType = 'text';
    }
    
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
                  <div className="space-y-2">
                    <Select
                      value={mapping.dimensionId || "none"}
                      onValueChange={(value) => updateMapping(index, value === "none" ? null : value)}
                    >
                      <SelectTrigger className="bg-background">
                        <SelectValue placeholder="Select dimension..." />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        <SelectItem value="none">No mapping</SelectItem>
                        <SelectItem value="create_new" className="text-primary font-medium">
                          + Create new dimension
                        </SelectItem>
                        {dimensions.map((dimension) => (
                          <SelectItem key={dimension.id} value={dimension.id}>
                            {dimension.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {mapping.dimensionId === 'create_new' && (
                      <div className="flex gap-2">
                        <Input
                          placeholder="Dimension name"
                          value={mapping.newDimensionName || ''}
                          onChange={(e) => {
                            const newMappings = [...mappings];
                            newMappings[index].newDimensionName = e.target.value;
                            setMappings(newMappings);
                          }}
                          className="flex-1"
                        />
                        <Select
                          value={mapping.newDimensionType || 'text'}
                          onValueChange={(value) => {
                            const newMappings = [...mappings];
                            newMappings[index].newDimensionType = value;
                            setMappings(newMappings);
                          }}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="text">Text</SelectItem>
                            <SelectItem value="number">Number</SelectItem>
                            <SelectItem value="currency">Currency</SelectItem>
                            <SelectItem value="date">Date</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
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
