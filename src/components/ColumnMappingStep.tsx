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
import { useState, useEffect, useImperativeHandle, forwardRef } from "react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/lib/auth";

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
  hideButtons?: boolean; // Option to hide buttons for custom rendering
}

export interface ColumnMappingStepRef {
  save: () => void;
  getMappings: () => ColumnMapping[];
}

export const ColumnMappingStep = forwardRef<ColumnMappingStepRef, ColumnMappingStepProps>(({
  headers,
  sampleDataRows = [],
  onSave,
  onBack,
  isLoading,
  existingMappings,
  accountId,
  reportId,
  hideButtons = false,
}, ref) => {
  const { data: userData } = useUser();
  const user = userData?.user || null;
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [isLoadingDimensions, setIsLoadingDimensions] = useState(true);
  const [creatingDimensionIndex, setCreatingDimensionIndex] = useState<number | null>(null);

  useEffect(() => {
    if (user) {
      loadDimensions();
    }
  }, [user]);

  useEffect(() => {
    if (dimensions.length > 0 && headers.length > 0) {
      initializeMappings();
    }
  }, [dimensions, headers, existingMappings]);

  const loadDimensions = async () => {
    try {
      setIsLoadingDimensions(true);
      if (!user) return;

      console.log('[COLUMN-MAPPING] Loading dimensions for user:', user.id, 'account:', accountId, 'report:', reportId);

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
        accountData = ((data || []) as any[]).map(d => ({
          ...d,
          conditions: Array.isArray(d.conditions) ? d.conditions : []
        })) as Dimension[];
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
      customData = ((data || []) as any[]).map(d => ({
        ...d,
        conditions: Array.isArray(d.conditions) ? d.conditions : []
      })) as Dimension[];

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

      console.log('[COLUMN-MAPPING] Loaded dimensions:', {
        account: accountData.length,
        custom: customData.length,
        global: globalData?.length || 0,
        total: uniqueDimensions.length,
        names: uniqueDimensions.map(d => d.name)
      });

      setDimensions(uniqueDimensions);
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
    // Validate if a dimension ID is valid (exists in loaded account-scoped dimensions)
    const isValidDimensionId = (dimensionId: string | null | undefined): boolean => {
      if (!dimensionId || dimensionId === 'none' || dimensionId === 'create_new') {
        return false;
      }
      // Check if the dimension exists in the loaded account-scoped dimensions list
      return dimensions.some(d => d.id === dimensionId);
    };

    // Ensure existingMappings is an array
    const safeExistingMappings = Array.isArray(existingMappings) ? existingMappings : [];

    // If we have existing mappings, validate them against account-scoped dimensions
    // Preserve user-modified mappings and only fix broken ones
    if (safeExistingMappings.length > 0) {
      const updatedMappings: ColumnMapping[] = headers.map((header, index) => {
        const existingMapping = safeExistingMappings.find(m => m.column === header);
        if (existingMapping) {
          // Check if this is a user-modified mapping
          const isUserModified = (existingMapping as any).user_modified === true;
          
          // If user-modified, validate but preserve the mapping
          if (isUserModified) {
            const isValid = isValidDimensionId(existingMapping.dimensionId);
            if (isValid || existingMapping.dimensionId === "none") {
              // Preserve user-modified mapping as-is, but ensure dimensionName is set
              const preservedMapping = {
                ...existingMapping,
                // Ensure dimensionName is set if we have a valid dimensionId
                dimensionName: existingMapping.dimensionName || 
                  (existingMapping.dimensionId && existingMapping.dimensionId !== "none" 
                    ? dimensions.find(d => d.id === existingMapping.dimensionId)?.name || null
                    : null)
              };
              
              console.log(`[COLUMN-MAPPING] Preserving user-modified mapping for column "${header}":`, preservedMapping);
              return preservedMapping;
            } else {
              console.log(`[COLUMN-MAPPING] User-modified mapping for column "${header}" references invalid dimension, will reset`);
              // Fall through to auto-detection logic
            }
          }
          
          // For non-user-modified mappings or broken user mappings, apply validation logic
          let dimensionId: string | null = "none";
          let dimensionName: string | null = null;
          
          // First try to match by dimension name (more stable across accounts)
          if (existingMapping.dimensionName) {
            const dimension = dimensions.find(d => d.name === existingMapping.dimensionName);
            if (dimension) {
              dimensionId = dimension.id;
              dimensionName = dimension.name;
            }
          }
          
          // If no name match, try by dimension ID (only if it's valid for this account)
          if (dimensionId === "none" && existingMapping.dimensionId) {
            const isValid = isValidDimensionId(existingMapping.dimensionId);
            if (isValid) {
              const dimension = dimensions.find(d => d.id === existingMapping.dimensionId);
              if (dimension) {
                dimensionId = dimension.id;
                dimensionName = dimension.name;
              }
            }
          }
          
          // If still no match, this mapping references an old dimension - unmap it
          if (dimensionId === "none") {
            return {
              column: header,
              dimensionId: "none",
              dimensionName: null,
              visible: existingMapping.visible,
              dateFormat: existingMapping.dateFormat,
            };
          }
          
          return {
            ...existingMapping,
            dimensionId,
            dimensionName,
          };
        }
        
        // For new headers, create default mappings
        return {
          column: header,
          dimensionId: "none",
          dimensionName: null,
          visible: true,
        };
      });
      
      setMappings(updatedMappings);
    } else {
      // No existing mappings, create default mappings for all headers
      const defaultMappings: ColumnMapping[] = headers.map(header => ({
        column: header,
        dimensionId: "none",
        dimensionName: null,
        visible: true,
      }));
      
      setMappings(defaultMappings);
    }
  };

  const handleDimensionChange = (index: number, dimensionId: string) => {
    const newMappings = [...mappings];
    
    if (dimensionId === "create_new") {
      // Set up for creating a new dimension
      newMappings[index] = {
        ...newMappings[index],
        dimensionId: "create_new",
        dimensionName: null,
        newDimensionName: newMappings[index].column, // Default to column name
        newDimensionType: "text", // Default type
      };
      setCreatingDimensionIndex(index);
    } else if (dimensionId === "none") {
      // Clear dimension mapping
      newMappings[index] = {
        ...newMappings[index],
        dimensionId: "none",
        dimensionName: null,
        // Clear any temporary fields
        newDimensionName: undefined,
        newDimensionType: undefined,
      };
    } else {
      // Set to existing dimension
      const dimension = dimensions.find(d => d.id === dimensionId);
      if (dimension) {
        newMappings[index] = {
          ...newMappings[index],
          dimensionId: dimension.id,
          dimensionName: dimension.name,
          // Set default date format for date dimensions
          dateFormat: dimension.type === 'date' ? (newMappings[index].dateFormat || 'yyyy-mm-dd') : undefined,
          // Clear any temporary fields when selecting existing dimension
          newDimensionName: undefined,
          newDimensionType: undefined,
        };
        
        console.log(`[COLUMN-MAPPING] Updated dimension for column "${newMappings[index].column}":`, {
          dimensionId: dimension.id,
          dimensionName: dimension.name,
          column: newMappings[index].column
        });
      }
    }
    
    setMappings(newMappings);
  };

  const handleVisibilityToggle = (index: number) => {
    const newMappings = [...mappings];
    newMappings[index] = {
      ...newMappings[index],
      visible: !newMappings[index].visible,
    };
    setMappings(newMappings);
  };

  const handleNewDimensionNameChange = (index: number, name: string) => {
    const newMappings = [...mappings];
    newMappings[index] = {
      ...newMappings[index],
      newDimensionName: name,
    };
    setMappings(newMappings);
  };

  const handleNewDimensionTypeChange = (index: number, type: string) => {
    const newMappings = [...mappings];
    newMappings[index] = {
      ...newMappings[index],
      newDimensionType: type,
    };
    setMappings(newMappings);
  };

  const handleDateFormatChange = (index: number, format: string) => {
    const newMappings = [...mappings];
    newMappings[index] = {
      ...newMappings[index],
      dateFormat: format,
    };
    setMappings(newMappings);
  };

  const handleSave = () => {
    console.log('[COLUMN-MAPPING] Starting save validation for', mappings.length, 'mappings');
    
    // Validate new dimension names
    const newDimensionMappings = mappings.filter(m => m.dimensionId === 'create_new');
    
    for (const mapping of newDimensionMappings) {
      if (!mapping.newDimensionName || mapping.newDimensionName.trim() === '') {
        toast({
          title: "Validation error",
          description: "New dimension name cannot be empty",
          variant: "destructive",
        });
        return;
      }
      
      // Check for duplicate names
      const existingDimension = dimensions.find(d => 
        d.name.toLowerCase() === mapping.newDimensionName?.toLowerCase()
      );
      
      if (existingDimension) {
        toast({
          title: "Validation error",
          description: `Dimension name "${mapping.newDimensionName}" already exists`,
          variant: "destructive",
        });
        return;
      }
    }
    
    console.log('[COLUMN-MAPPING] Validation passed, saving mappings');
    onSave(mappings);
  };

  // Expose save handler and mappings via ref
  useImperativeHandle(ref, () => ({
    save: handleSave,
    getMappings: () => mappings,
  }));

  return (
    <div className="flex flex-col space-y-4 w-full">
      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">Column</TableHead>
              <TableHead className="w-[200px]">Example Value</TableHead>
              <TableHead className="w-[250px]">Map to Dimension</TableHead>
              <TableHead className="w-[150px]">Format</TableHead>
              <TableHead className="w-[80px] text-center">Visible</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mappings.map((mapping, index) => (
              <TableRow key={index}>
                <TableCell className="font-medium">{mapping.column}</TableCell>
                <TableCell className="text-muted-foreground">
                  {getExampleValue(index) || "No example"}
                </TableCell>
                <TableCell>
                  {creatingDimensionIndex === index ? (
                    <div className="space-y-2">
                      <Input
                        placeholder="New dimension name"
                        value={mapping.newDimensionName || ''}
                        onChange={(e) => handleNewDimensionNameChange(index, e.target.value)}
                      />
                      <Select
                        value={mapping.newDimensionType || 'text'}
                        onValueChange={(value) => handleNewDimensionTypeChange(index, value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="text">Text</SelectItem>
                          <SelectItem value="number">Number</SelectItem>
                          <SelectItem value="currency">Currency</SelectItem>
                          <SelectItem value="percentage">Percentage</SelectItem>
                          <SelectItem value="date">Date</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setCreatingDimensionIndex(null)}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Done
                      </Button>
                    </div>
                  ) : (
                    <Select
                      value={mapping.dimensionId || 'none'}
                      onValueChange={(value) => handleDimensionChange(index, value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select dimension" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="create_new">Create New Dimension</SelectItem>
                        {dimensions.map((dimension) => (
                          <SelectItem key={dimension.id} value={dimension.id}>
                            {dimension.name} ({dimension.type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </TableCell>
                <TableCell>
                  {isDateDimension(mapping.dimensionId) && (
                    <Select
                      value={mapping.dateFormat || 'yyyy-mm-dd'}
                      onValueChange={(value) => handleDateFormatChange(index, value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Date format" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yyyy-mm-dd">YYYY-MM-DD</SelectItem>
                        <SelectItem value="mm-dd-yyyy">MM-DD-YYYY</SelectItem>
                        <SelectItem value="dd-mm-yyyy">DD-MM-YYYY</SelectItem>
                        <SelectItem value="auto-detect">Auto-detect</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleVisibilityToggle(index)}
                  >
                    {mapping.visible ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <EyeOff className="h-4 w-4" />
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {!hideButtons && (
        <div className="flex justify-between pt-4 flex-shrink-0 border-t mt-4">
          <Button variant="outline" onClick={onBack}>
            Back
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? "Saving..." : "Save Mappings"}
          </Button>
        </div>
      )}
    </div>
  );
});

ColumnMappingStep.displayName = "ColumnMappingStep";