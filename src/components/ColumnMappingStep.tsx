import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Badge } from "@/components/ui/badge";
import { Eye, EyeOff, Check } from "lucide-react";
import { useState, useEffect, useImperativeHandle, forwardRef } from "react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface Dimension {
  id: string;
  name: string;
  type: string;
}

interface ColumnMapping {
  column: string;
  dimensionId?: string | null;
  dimensionName?: string | null;
  visible: boolean;
  newDimensionName?: string;
  newDimensionType?: string;
  dateFormat?: string;
  isBreakdown?: boolean;
}

interface ColumnMappingStepProps {
  headers: string[];
  sampleDataRows?: any[][];
  onSave: (mappings: ColumnMapping[]) => void;
  onBack: () => void;
  isLoading: boolean;
  existingMappings?: ColumnMapping[];
  accountId?: string;
  reportId?: string;
  hideButtons?: boolean;
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

      const { data: globalData, error: globalError } = await supabase
        .from("dimensions")
        .select("*")
        .eq("scope", "global")
        .order("created_at", { ascending: false });

      if (globalError) throw globalError;

      const allDimensions = [
        ...accountData,
        ...customData,
        ...(globalData || [])
      ] as Dimension[];

      const seenNames = new Set<string>();
      const uniqueDimensions = allDimensions.filter(dim => {
        if (seenNames.has(dim.name)) return false;
        seenNames.add(dim.name);
        return true;
      });

      setDimensions(uniqueDimensions);
    } catch (error) {
      console.error("Error loading dimensions:", error);
    } finally {
      setIsLoadingDimensions(false);
    }
  };

  const getExampleValue = (columnIndex: number): string | null => {
    if (!sampleDataRows || sampleDataRows.length === 0) return null;
    if (columnIndex < 0 || columnIndex >= headers.length) return null;

    for (const row of sampleDataRows) {
      if (!row || !Array.isArray(row)) continue;
      if (columnIndex < row.length) {
        const value = row[columnIndex];
        if (value !== null && value !== undefined && value !== '') {
          const stringValue = String(value).trim();
          if (stringValue.length > 0) return stringValue;
        }
      }
    }
    return null;
  };

  const isDateDimension = (dimensionId: string | null): boolean => {
    if (!dimensionId || dimensionId === 'none' || dimensionId === 'create_new') return false;
    return dimensions.find(d => d.id === dimensionId)?.type === 'date';
  };

  const initializeMappings = () => {
    const isValidDimensionId = (dimensionId: string | null | undefined): boolean => {
      if (!dimensionId || dimensionId === 'none' || dimensionId === 'create_new') return false;
      return dimensions.some(d => d.id === dimensionId);
    };

    const safeExistingMappings = Array.isArray(existingMappings) ? existingMappings : [];

    if (safeExistingMappings.length > 0) {
      const updatedMappings: ColumnMapping[] = headers.map((header) => {
        const existingMapping = safeExistingMappings.find(m => m.column === header);
        if (existingMapping) {
          const isUserModified = (existingMapping as any).user_modified === true;

          if (isUserModified) {
            const isValid = isValidDimensionId(existingMapping.dimensionId);
            if (isValid || existingMapping.dimensionId === "none") {
              const { isFilter: _legacyFilter, ...row } = existingMapping as ColumnMapping & {
                isFilter?: boolean;
                user_modified?: boolean;
              };
              return {
                ...row,
                dimensionName: existingMapping.dimensionName ||
                  (existingMapping.dimensionId && existingMapping.dimensionId !== "none"
                    ? dimensions.find(d => d.id === existingMapping.dimensionId)?.name || null
                    : null)
              };
            }
          }

          let dimensionId: string | null = "none";
          let dimensionName: string | null = null;

          if (existingMapping.dimensionName) {
            const dimension = dimensions.find(d => d.name === existingMapping.dimensionName);
            if (dimension) {
              dimensionId = dimension.id;
              dimensionName = dimension.name;
            }
          }

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

          if (dimensionId === "none") {
            return {
              column: header,
              dimensionId: "none",
              dimensionName: null,
              visible: existingMapping.visible,
              dateFormat: existingMapping.dateFormat,
            };
          }

          const { isFilter: _legacyFilter, ...row } = existingMapping as ColumnMapping & {
            isFilter?: boolean;
          };
          return {
            ...row,
            dimensionId,
            dimensionName,
          };
        }

        return {
          column: header,
          dimensionId: "none",
          dimensionName: null,
          visible: true,
        };
      });

      setMappings(updatedMappings);
    } else {
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
      newMappings[index] = {
        ...newMappings[index],
        dimensionId: "create_new",
        dimensionName: null,
        newDimensionName: newMappings[index].column,
        newDimensionType: "text",
      };
      setCreatingDimensionIndex(index);
    } else if (dimensionId === "none") {
      newMappings[index] = {
        ...newMappings[index],
        dimensionId: "none",
        dimensionName: null,
        newDimensionName: undefined,
        newDimensionType: undefined,
      };
    } else {
      const dimension = dimensions.find(d => d.id === dimensionId);
      if (dimension) {
        newMappings[index] = {
          ...newMappings[index],
          dimensionId: dimension.id,
          dimensionName: dimension.name,
          dateFormat: dimension.type === 'date' ? (newMappings[index].dateFormat || 'yyyy-mm-dd') : undefined,
          newDimensionName: undefined,
          newDimensionType: undefined,
        };
      }
    }

    setMappings(newMappings);
  };

  const handleVisibilityToggle = (index: number) => {
    const newMappings = [...mappings];
    newMappings[index] = { ...newMappings[index], visible: !newMappings[index].visible };
    setMappings(newMappings);
  };

  const handleNewDimensionNameChange = (index: number, name: string) => {
    const newMappings = [...mappings];
    newMappings[index] = { ...newMappings[index], newDimensionName: name };
    setMappings(newMappings);
  };

  const handleNewDimensionTypeChange = (index: number, type: string) => {
    const newMappings = [...mappings];
    newMappings[index] = { ...newMappings[index], newDimensionType: type };
    setMappings(newMappings);
  };

  const handleDateFormatChange = (index: number, format: string) => {
    const newMappings = [...mappings];
    newMappings[index] = { ...newMappings[index], dateFormat: format };
    setMappings(newMappings);
  };

  const handleSave = () => {
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

    onSave(mappings);
  };

  useImperativeHandle(ref, () => ({
    save: handleSave,
    getMappings: () => mappings,
  }));

  return (
    <div className="flex flex-col space-y-4 w-full">
      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[160px]">Column</TableHead>
              <TableHead className="w-[160px]">Example</TableHead>
              <TableHead className="w-[220px]">Map to Dimension</TableHead>
              <TableHead className="w-[130px]">Format</TableHead>
              <TableHead className="w-[60px] text-center">
                <div className="flex flex-col items-center gap-0.5">
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground font-normal">Visible</span>
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {mappings.map((mapping, index) => {
              const isMapped = mapping.dimensionId && mapping.dimensionId !== 'none' && mapping.dimensionId !== 'create_new';
              const dimType = isMapped ? dimensions.find(d => d.id === mapping.dimensionId)?.type : null;

              return (
                <TableRow key={index} className={cn(!isMapped && "opacity-60")}>
                  <TableCell className="font-medium text-sm">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate max-w-[140px]" title={mapping.column}>
                        {mapping.column}
                      </span>
                      {dimType && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 shrink-0">
                          {dimType}
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    <span className="truncate block max-w-[150px]" title={getExampleValue(index) ?? ''}>
                      {getExampleValue(index) || <span className="italic text-xs">No example</span>}
                    </span>
                  </TableCell>
                  <TableCell>
                    {creatingDimensionIndex === index ? (
                      <div className="space-y-1.5">
                        <Input
                          placeholder="Dimension name"
                          value={mapping.newDimensionName || ''}
                          onChange={(e) => handleNewDimensionNameChange(index, e.target.value)}
                          className="h-8 text-sm"
                        />
                        <Select
                          value={mapping.newDimensionType || 'text'}
                          onValueChange={(value) => handleNewDimensionTypeChange(index, value)}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue placeholder="Type" />
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
                          className="h-7 text-xs"
                          onClick={() => setCreatingDimensionIndex(null)}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          Done
                        </Button>
                      </div>
                    ) : (
                      <Select
                        value={mapping.dimensionId || 'none'}
                        onValueChange={(value) => handleDimensionChange(index, value)}
                      >
                        <SelectTrigger
                          className={cn("h-8 text-sm", isMapped && "border-primary/40")}
                          aria-label={`Map column "${mapping.column}" to a dimension`}
                        >
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="create_new">+ Create New Dimension</SelectItem>
                          {dimensions.map((dimension) => (
                            <SelectItem key={dimension.id} value={dimension.id}>
                              {dimension.name}
                              <span className="ml-1 text-muted-foreground text-xs">({dimension.type})</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell>
                    {isDateDimension(mapping.dimensionId ?? null) && (
                      <Select
                        value={mapping.dateFormat || 'yyyy-mm-dd'}
                        onValueChange={(value) => handleDateFormatChange(index, value)}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue />
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
                    <button
                      type="button"
                      onClick={() => handleVisibilityToggle(index)}
                      className="inline-flex items-center justify-center p-1 rounded hover:bg-accent transition-colors"
                      title={mapping.visible ? "Visible" : "Hidden"}
                    >
                      {mapping.visible ? (
                        <Eye className="h-4 w-4 text-foreground" />
                      ) : (
                        <EyeOff className="h-4 w-4 text-muted-foreground" />
                      )}
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
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
