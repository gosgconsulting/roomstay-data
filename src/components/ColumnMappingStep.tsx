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
import { Eye, EyeOff, Check } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface Dimension {
  id: string;
  name: string;
  type: string;
}

interface ColumnMapping {
  column: string;
  dimensionId?: string | null; // Optional, kept for backward compatibility
  dimensionName?: string | null; // Primary identifier for mapping (stable across accounts)
  visible: boolean;
  newDimensionName?: string;
  newDimensionType?: string;
  dateFormat?: string; // Store the date format for date dimensions
}

interface ColumnMappingStepProps {
  headers: string[];
  sampleDataRows?: any[][]; // Sample data rows (first few rows) for displaying examples
  onSave: (mappings: ColumnMapping[]) => void;
  onBack: () => void;
  isLoading: boolean;
  existingMappings?: ColumnMapping[];
  accountId?: string;
  reportId?: string;
}

export const ColumnMappingStep = ({
  headers,
  sampleDataRows = [],
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
  const [creatingDimensionIndex, setCreatingDimensionIndex] = useState<number | null>(null);

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
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) return;

      // Get all dimensions accessible to the user
      const { data, error } = await supabase
        .from("dimensions")
        .select("*")
        .order("name", { ascending: true });

      if (error) throw error;

      // Filter and prioritize dimensions:
      // 1. Account-specific dimensions (if accountId provided) - REQUIRED when accountId exists
      // 2. Custom report dimensions (if reportId provided)
      // 3. Global dimensions (fallback ONLY if no accountId)
      const dimensionsByName: Record<string, Dimension> = {};

      // Helper function to normalize dimension name for deduplication (case-insensitive)
      const normalizeKey = (name: string) => name.toLowerCase().trim();

      if (accountId) {
        // When accountId is provided, ONLY use account-specific and custom dimensions
        // Do NOT include global dimensions to prevent wrong mappings
        
        // First pass: add account-specific dimensions
        (data || [])
          .filter((d: any) => d.scope === 'account' && d.account_id === accountId)
          .forEach((d: any) => {
            dimensionsByName[normalizeKey(d.name)] = d;
          });

        // Second pass: add custom dimensions (highest priority, can override account-specific)
        (data || [])
          .filter((d: any) => 
            d.scope === 'custom' && 
            d.user_id === user.id &&
            (d.report_id === null || d.report_id === reportId)
          )
          .forEach((d: any) => {
            dimensionsByName[normalizeKey(d.name)] = d; // Override with custom version
          });
      } else {
        // No accountId: use global dimensions as fallback
        // First pass: add global dimensions as base
        (data || []).filter((d: any) => d.scope === 'global').forEach((d: any) => {
          dimensionsByName[normalizeKey(d.name)] = d;
        });

        // Second pass: add custom dimensions (highest priority)
        (data || [])
          .filter((d: any) => 
            d.scope === 'custom' && 
            d.user_id === user.id &&
            (d.report_id === null || d.report_id === reportId)
          )
          .forEach((d: any) => {
            dimensionsByName[normalizeKey(d.name)] = d; // Override with custom version
          });
      }

      setDimensions(Object.values(dimensionsByName));
    } catch (error) {
      console.error("Error loading dimensions:", error);
    } finally {
      setIsLoadingDimensions(false);
    }
  };

  // Get example value for a column (from sample data)
  const getExampleValue = (columnIndex: number): string | null => {
    if (!sampleDataRows || sampleDataRows.length === 0) return null;
    if (columnIndex < 0 || columnIndex >= headers.length) return null;
    
    // Find first non-empty value in this column
    // Try each sample row until we find a value
    for (const row of sampleDataRows) {
      if (!row || !Array.isArray(row)) continue;
      
      // Make sure the row has enough columns
      if (columnIndex < row.length) {
        const value = row[columnIndex];
        
        // Check if value exists and is not empty
        if (value !== null && value !== undefined && value !== '') {
          const stringValue = String(value).trim();
          if (stringValue.length > 0) {
            return stringValue;
          }
        }
      }
    }
    
    return null;
  };

  // Check if selected dimension is a Date type
  const isDateDimension = (dimensionId: string | null): boolean => {
    if (!dimensionId || dimensionId === 'none' || dimensionId === 'create_new') return false;
    const dimension = dimensions.find(d => d.id === dimensionId);
    return dimension?.type === 'date';
  };

  const initializeMappings = () => {
    // Validate if a dimension ID is valid (exists in loaded dimensions)
    const isValidDimensionId = (dimensionId: string | null | undefined): boolean => {
      if (!dimensionId || dimensionId === 'none' || dimensionId === 'create_new') {
        return false;
      }
      // Check if the dimension exists in the loaded dimensions list
      // This ensures we only use account-specific dimensions (or custom/global if no account)
      return dimensions.some(d => d.id === dimensionId);
    };

    // If we have existing mappings, use them but validate dimension IDs
    if (existingMappings && existingMappings.length > 0) {
      // Match existing mappings with current headers
      const updatedMappings: ColumnMapping[] = headers.map((header, index) => {
        const existingMapping = existingMappings.find(m => m.column === header);
        if (existingMapping) {
          // Priority: Use dimensionName if available, otherwise fall back to dimensionId
          let dimensionId: string | null = "none";
          let dimensionName: string | null = existingMapping.dimensionName || null;
          
          if (dimensionName) {
            // Find dimension by name in the loaded dimensions (account-specific)
            const dimension = dimensions.find(d => d.name === dimensionName);
            if (dimension) {
              dimensionId = dimension.id;
            } else {
              // Dimension name not found in account-specific dimensions, clear it
              dimensionName = null;
              dimensionId = "none";
            }
          } else if (existingMapping.dimensionId) {
            // Fallback: Validate dimension ID - if it's invalid (global or wrong account), set to "none"
            const isValid = isValidDimensionId(existingMapping.dimensionId);
            dimensionId = isValid ? existingMapping.dimensionId : "none";
            
            // If dimensionId is valid, look up the name
            if (isValid && dimensionId && dimensionId !== 'none') {
              const dimension = dimensions.find(d => d.id === dimensionId);
              dimensionName = dimension?.name || null;
            }
          }
          
          return {
            ...existingMapping,
            dimensionId: dimensionId,
            dimensionName: dimensionName, // Store name for stable mapping
            dateFormat: existingMapping.dateFormat || 'yyyy-mm-dd', // Default date format
          };
        }
        // For new columns not in existing mappings, try smart matching
        const matchedDimension = findBestMatch(header, dimensions);
        return {
          column: header,
          dimensionId: matchedDimension?.id || "none",
          dimensionName: matchedDimension?.name || null, // Store name for stable mapping
          visible: true,
          dateFormat: matchedDimension?.type === 'date' ? 'yyyy-mm-dd' : undefined,
        };
      });
      setMappings(updatedMappings);
    } else {
      // No existing mappings, use smart matching
      const initialMappings: ColumnMapping[] = headers.map((header, index) => {
        const matchedDimension = findBestMatch(header, dimensions);
        return {
          column: header,
          dimensionId: matchedDimension?.id || "none",
          dimensionName: matchedDimension?.name || null, // Store name for stable mapping
          visible: true,
          dateFormat: matchedDimension?.type === 'date' ? 'yyyy-mm-dd' : undefined,
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
    
    // Store dimension name for stable mapping (primary identifier)
    if (dimensionId && dimensionId !== 'none' && dimensionId !== 'create_new') {
      const dimension = dimensions.find(d => d.id === dimensionId);
      if (dimension) {
        newMappings[index].dimensionName = dimension.name;
      }
    } else {
      newMappings[index].dimensionName = null;
    }
    
    // If "create_new" is selected, auto-populate new dimension name
    if (dimensionId === 'create_new') {
      newMappings[index].newDimensionName = mappings[index].column;
      newMappings[index].newDimensionType = 'text';
      newMappings[index].dateFormat = undefined;
    } else {
      // If Date dimension is selected, set default date format if not already set
      const dimension = dimensions.find(d => d.id === dimensionId);
      if (dimension?.type === 'date' && !newMappings[index].dateFormat) {
        newMappings[index].dateFormat = 'yyyy-mm-dd';
      } else if (dimension?.type !== 'date') {
        newMappings[index].dateFormat = undefined;
      }
    }
    
    setMappings(newMappings);
  };

  const updateDateFormat = (index: number, dateFormat: string) => {
    const newMappings = [...mappings];
    newMappings[index].dateFormat = dateFormat;
    setMappings(newMappings);
  };

    const toggleVisibility = (index: number) => {
      const newMappings = [...mappings];
      newMappings[index].visible = !newMappings[index].visible;
      setMappings(newMappings);
    };

    const handleCreateDimension = async (index: number) => {
      const mapping = mappings[index];
      
      if (!mapping.newDimensionName || mapping.newDimensionName.trim() === '') {
        toast({
          title: "Error",
          description: "Please enter a dimension name",
          variant: "destructive",
        });
        return;
      }

      if (!reportId) {
        toast({
          title: "Error",
          description: "Report ID is required to create dimensions",
          variant: "destructive",
        });
        return;
      }

      setCreatingDimensionIndex(index);

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error("User not authenticated");
        }

        // Check if dimension with same name already exists
        const normalizedName = mapping.newDimensionName.trim();
        const existingDimension = dimensions.find(
          d => d.name.toLowerCase() === normalizedName.toLowerCase()
        );

        if (existingDimension) {
          // Use existing dimension
          const newMappings = [...mappings];
          newMappings[index].dimensionId = existingDimension.id;
          newMappings[index].dimensionName = existingDimension.name; // Store name for stable mapping
          newMappings[index].newDimensionName = undefined;
          newMappings[index].newDimensionType = undefined;
          setMappings(newMappings);
          
          toast({
            title: "Dimension already exists",
            description: `Using existing dimension "${existingDimension.name}"`,
          });
          return;
        }

        // Create new dimension
        const { data: newDimension, error: createError } = await supabase
          .from('dimensions')
          .insert({
            user_id: user.id,
            report_id: reportId,
            name: normalizedName,
            type: mapping.newDimensionType || 'text',
            scope: 'custom',
          })
          .select()
          .single();

        if (createError) throw createError;

        // Update mapping to use the newly created dimension
        const newMappings = [...mappings];
        newMappings[index].dimensionId = newDimension.id;
        newMappings[index].dimensionName = newDimension.name; // Store name for stable mapping
        newMappings[index].newDimensionName = undefined;
        newMappings[index].newDimensionType = undefined;
        setMappings(newMappings);

        // Reload dimensions to include the new one
        await loadDimensions();

        toast({
          title: "Dimension created",
          description: `Successfully created dimension "${newDimension.name}"`,
        });
      } catch (error) {
        console.error("Error creating dimension:", error);
        const errorMessage = error instanceof Error ? error.message : "Failed to create dimension";
        toast({
          title: "Error",
          description: errorMessage,
          variant: "destructive",
        });
      } finally {
        setCreatingDimensionIndex(null);
      }
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
            {mappings.map((mapping, index) => {
              const exampleValue = getExampleValue(index);
              const isDate = isDateDimension(mapping.dimensionId) || 
                           (mapping.dimensionId === 'create_new' && mapping.newDimensionType === 'date');
              
              return (
              <TableRow key={index}>
                <TableCell className="font-medium">
                  <div className="space-y-1">
                    <div>{mapping.column}</div>
                    {exampleValue && (
                      <div className="text-xs text-muted-foreground italic">
                        {exampleValue}
                      </div>
                    )}
                  </div>
                </TableCell>
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
                        <div className="space-y-2">
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
                              disabled={creatingDimensionIndex === index}
                            />
                            <Select
                              value={mapping.newDimensionType || 'text'}
                              onValueChange={(value) => {
                                const newMappings = [...mappings];
                                newMappings[index].newDimensionType = value;
                                if (value === 'date' && !newMappings[index].dateFormat) {
                                  newMappings[index].dateFormat = 'yyyy-mm-dd';
                                } else if (value !== 'date') {
                                  newMappings[index].dateFormat = undefined;
                                }
                                setMappings(newMappings);
                              }}
                              disabled={creatingDimensionIndex === index}
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="text">Text</SelectItem>
                                <SelectItem value="number">Number</SelectItem>
                                <SelectItem value="currency">Currency</SelectItem>
                                <SelectItem value="date">Date</SelectItem>
                                <SelectItem value="percentage">Percentage</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              onClick={() => handleCreateDimension(index)}
                              disabled={creatingDimensionIndex === index || !mapping.newDimensionName?.trim()}
                              size="sm"
                              className="gap-2"
                            >
                              {creatingDimensionIndex === index ? (
                                <>
                                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                  Creating...
                                </>
                              ) : (
                                <>
                                  <Check className="h-4 w-4" />
                                  Create
                                </>
                              )}
                            </Button>
                          </div>
                          {mapping.newDimensionType === 'date' && (
                            <Select
                              value={mapping.dateFormat || 'yyyy-mm-dd'}
                              onValueChange={(value) => updateDateFormat(index, value)}
                              disabled={creatingDimensionIndex === index}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select date format" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="yyyy-mm-dd">YYYY-MM-DD (e.g., 2025-01-01)</SelectItem>
                                <SelectItem value="dd-mm-yyyy">DD-MM-YYYY (e.g., 01-01-2025)</SelectItem>
                                <SelectItem value="mm-dd-yyyy">MM-DD-YYYY (e.g., 01-01-2025)</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      )}
                    {isDate && mapping.dimensionId !== 'create_new' && (
                      <Select
                        value={mapping.dateFormat || 'yyyy-mm-dd'}
                        onValueChange={(value) => updateDateFormat(index, value)}
                      >
                        <SelectTrigger className="w-full mt-2">
                          <SelectValue placeholder="Select date format" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="yyyy-mm-dd">YYYY-MM-DD (e.g., 2025-01-01)</SelectItem>
                          <SelectItem value="dd-mm-yyyy">DD-MM-YYYY (e.g., 01-01-2025)</SelectItem>
                          <SelectItem value="mm-dd-yyyy">MM-DD-YYYY (e.g., 01-01-2025)</SelectItem>
                        </SelectContent>
                      </Select>
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
              );
            })}
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
