import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, X } from "lucide-react";
import { FilterState } from "./FiltersBar";
import { toast } from "@/hooks/use-toast";

interface TableRow {
  id: string;
  name: string;
  data: Record<string, any>;
  children?: TableRow[];
}

interface ColumnFilterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columnName: string;
  dimension?: {
    id: string;
    name: string;
    type: string;
  };
  currentFilters?: FilterState;
  onFiltersChange?: (filters: FilterState) => void;
  tableData?: TableRow[];
}

export const ColumnFilterModal = ({
  open,
  onOpenChange,
  columnName,
  dimension,
  currentFilters,
  onFiltersChange,
  tableData = [],
}: ColumnFilterModalProps) => {
  const [selectedValues, setSelectedValues] = useState<string[]>([]);
  const [numericOperator, setNumericOperator] = useState<"gt" | "lt" | "eq">("gt");
  const [numericValue, setNumericValue] = useState<string>("");
  const [textSearchTerm, setTextSearchTerm] = useState("");

  // Extract available values from table data
  const availableValues = useMemo(() => {
    if (!dimension || !tableData || tableData.length === 0) return [];

    const values = new Set<string>();
    
    // Recursively extract values from table rows
    const extractValues = (rows: TableRow[]) => {
      rows.forEach(row => {
        // For group dimensions, row.name contains the value; for others, use dimension value in data
        // Check both row.name and row.data[dimension.name] to catch all cases
        if (row.name) {
          values.add(String(row.name));
        }
        const dimValue = row.data[dimension.name];
        if (dimValue !== undefined && dimValue !== null && dimValue !== "") {
          values.add(String(dimValue));
        }
        if (row.children) {
          extractValues(row.children);
        }
      });
    };

    extractValues(tableData);
    return Array.from(values).sort();
  }, [dimension, tableData]);

  // Initialize selected values from current filters
  useEffect(() => {
    if (dimension && currentFilters?.dimensionFilters) {
      const currentFilterValues = currentFilters.dimensionFilters[dimension.id] || [];
      if (Array.isArray(currentFilterValues)) {
        setSelectedValues(currentFilterValues);
      }
    } else {
      setSelectedValues([]);
    }
    setNumericValue("");
    setTextSearchTerm("");
  }, [dimension, currentFilters, open]);

  const handleToggleValue = (value: string) => {
    setSelectedValues((prev) => {
      if (prev.includes(value)) {
        return prev.filter((v) => v !== value);
      } else {
        return [...prev, value];
      }
    });
  };

  const handleApplyFilter = () => {
    if (!dimension || !onFiltersChange || !currentFilters) {
      console.log('[testing] Cannot apply filter - missing:', { dimension: !!dimension, onFiltersChange: !!onFiltersChange, currentFilters: !!currentFilters });
      toast({
        title: "Error",
        description: "Cannot apply filter. Missing required data.",
        variant: "destructive",
      });
      return;
    }

    let filterValues: string[] = [];

    if (isNumeric) {
      // For numeric filters, create a filter value with operator prefix
      if (numericValue && !isNaN(parseFloat(numericValue))) {
        const operatorPrefix = numericOperator === "gt" ? ">" : numericOperator === "lt" ? "<" : "=";
        filterValues = [`${operatorPrefix}${numericValue}`];
        console.log('[testing] Applying numeric filter:', filterValues);
      } else {
        console.log('[testing] Invalid numeric value:', numericValue);
        return;
      }
    } else {
      // For text filters, use selected values or search term
      if (selectedValues.length > 0) {
        // If all available values are selected, clear the filter (show all)
        if (selectedValues.length === availableValues.length && 
            availableValues.every(v => selectedValues.includes(v))) {
          filterValues = [];
          console.log('[testing] All values selected, clearing filter');
        } else {
          filterValues = selectedValues;
          console.log('[testing] Applying filter with selected values:', filterValues);
        }
      } else if (textSearchTerm.trim()) {
        // If search term is provided but no values selected, use search term
        filterValues = [textSearchTerm.trim()];
        console.log('[testing] Applying filter with search term:', filterValues);
      } else {
        // No selection and no search term - clear filter
        filterValues = [];
      }
    }

    // Create new filters object
    const newFilters: FilterState = {
      ...currentFilters,
      dimensionFilters: { ...currentFilters.dimensionFilters },
    };

    if (filterValues.length === 0) {
      // Clear the filter
      console.log('[testing] No filter values to apply, clearing filter');
      delete newFilters.dimensionFilters[dimension.id];
    } else {
      // Apply the filter
      newFilters.dimensionFilters[dimension.id] = filterValues;
      console.log('[testing] Applying filter - dimension:', dimension.id, dimension.name, 'values:', filterValues);
    }

    console.log('[testing] New filters:', newFilters.dimensionFilters);

    // Apply the filter change
    onFiltersChange(newFilters);
    onOpenChange(false);
  };

  const handleClearFilter = () => {
    if (!dimension || !onFiltersChange || !currentFilters) return;

    const newFilters: FilterState = {
      ...currentFilters,
      dimensionFilters: { ...currentFilters.dimensionFilters },
    };
    delete newFilters.dimensionFilters[dimension.id];

    onFiltersChange(newFilters);
    setSelectedValues([]);
    setNumericValue("");
    setTextSearchTerm("");
  };

  const filteredValues = availableValues.filter((value) =>
    textSearchTerm ? value.toLowerCase().includes(textSearchTerm.toLowerCase()) : true
  );

  // Check if all filtered values are selected
  const allFilteredSelected = filteredValues.length > 0 && filteredValues.every(value => selectedValues.includes(value));

  const handleToggleSelectAll = () => {
    if (allFilteredSelected) {
      // Deselect all filtered values
      setSelectedValues(prev => prev.filter(v => !filteredValues.includes(v)));
    } else {
      // Select all filtered values
      setSelectedValues(prev => {
        const newValues = [...prev];
        filteredValues.forEach(value => {
          if (!newValues.includes(value)) {
            newValues.push(value);
          }
        });
        return newValues;
      });
    }
  };

  const isNumeric = dimension?.type === "number" || dimension?.type === "currency" || dimension?.type === "percentage";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Filter by {columnName}</DialogTitle>
          <DialogDescription>
            {isNumeric
              ? "Enter a value to filter this column"
              : "Select values to filter this column"}
          </DialogDescription>
        </DialogHeader>

        {isNumeric ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Filter by Value</Label>
              <div className="flex gap-2">
                <Select value={numericOperator} onValueChange={(value: "gt" | "lt" | "eq") => setNumericOperator(value)}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gt">Greater than</SelectItem>
                    <SelectItem value="lt">Less than</SelectItem>
                    <SelectItem value="eq">Equal to</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  placeholder="Enter value"
                  value={numericValue}
                  onChange={(e) => setNumericValue(e.target.value)}
                  className="flex-1"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleApplyFilter} className="flex-1">
                Apply Filter
              </Button>
              <Button variant="outline" onClick={handleClearFilter}>
                Clear
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Search by name</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search or type to filter..."
                  value={textSearchTerm}
                  onChange={(e) => setTextSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            {availableValues.length > 0 && (
              <div className="space-y-2">
                <Label>Or select from available values</Label>
                <ScrollArea className="h-[200px] border rounded-md">
                  <div className="space-y-1 p-2">
                    {/* Select All option */}
                    {filteredValues.length > 0 && (
                      <div
                        className="flex items-center space-x-2 cursor-pointer hover:bg-muted p-2 rounded border-b mb-2 pb-2"
                        onClick={handleToggleSelectAll}
                      >
                        <Checkbox
                          checked={allFilteredSelected}
                          onCheckedChange={handleToggleSelectAll}
                        />
                        <Label className="flex-1 cursor-pointer text-sm font-medium">
                          Select All {filteredValues.length > 0 && `(${filteredValues.length})`}
                        </Label>
                      </div>
                    )}
                    {filteredValues.slice(0, 100).map((value) => (
                      <div
                        key={value}
                        className="flex items-center space-x-2 cursor-pointer hover:bg-muted p-2 rounded"
                        onClick={() => handleToggleValue(value)}
                      >
                        <Checkbox
                          checked={selectedValues.includes(value)}
                          onCheckedChange={() => handleToggleValue(value)}
                        />
                        <Label className="flex-1 cursor-pointer text-sm">{value}</Label>
                      </div>
                    ))}
                    {filteredValues.length > 100 && (
                      <div className="text-xs text-muted-foreground p-2 text-center">
                        Showing first 100 of {filteredValues.length} values. Use search to find specific values.
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            )}

            {availableValues.length === 0 && (
              <div className="text-sm text-muted-foreground text-center py-4 border rounded-md">
                Enter a search term above to filter by name
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={handleApplyFilter} className="flex-1">
                Apply Filter
              </Button>
              <Button variant="outline" onClick={handleClearFilter}>
                Clear
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

