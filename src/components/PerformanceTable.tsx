import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Columns3 } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { MappingModal } from "./MappingModal";
import { DimensionSelectorModal } from "./DimensionSelectorModal";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfWeek, startOfMonth, startOfYear } from "date-fns";

interface Dimension {
  id: string;
  name: string;
  type: string;
  formula: string | null;
}

interface TableRow {
  id: string;
  name: string;
  level: number;
  parentId?: string;
  data: Record<string, any>;
  children?: TableRow[];
}

interface PerformanceTableProps {
  reportId: string | null;
}

export const PerformanceTable = ({ reportId }: PerformanceTableProps) => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set(["2"]));
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [dimensionSelectorOpen, setDimensionSelectorOpen] = useState(false);
  const [selectedKPI, setSelectedKPI] = useState("");
  const [currentSelector, setCurrentSelector] = useState<"group" | "breakdown" | "then">("group");
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set());
  const [isLoadingDimensions, setIsLoadingDimensions] = useState(true);
  const [tableData, setTableData] = useState<TableRow[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);
  
  // State for dimension selections - start empty
  const [groupByDimensions, setGroupByDimensions] = useState<string[]>([]);
  const [breakdownByDimensions, setBreakdownByDimensions] = useState<string[]>([]);
  const [thenByDimensions, setThenByDimensions] = useState<string[]>([]);
  
  // State for date granularity - default to 'none'
  const [dateGranularity, setDateGranularity] = useState<'none' | 'day' | 'week' | 'month' | 'year'>('none');

  useEffect(() => {
    if (reportId) {
      loadDimensions();
      loadViewSettings();
    }
  }, [reportId]);

  useEffect(() => {
    if (reportId && dimensions.length > 0) {
      loadTableData();
    }
  }, [groupByDimensions, breakdownByDimensions, thenByDimensions, reportId, dimensions]);

  // Save view settings whenever they change
  useEffect(() => {
    if (reportId && dimensions.length > 0) {
      saveViewSettings();
    }
  }, [groupByDimensions, breakdownByDimensions, thenByDimensions, visibleColumns, reportId]);

  const loadViewSettings = async () => {
    if (!reportId) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("report_views")
        .select("*")
        .eq("report_id", reportId)
        .eq("user_id", user.id)
        .eq("is_default", true)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        // Load saved settings
        setGroupByDimensions(data.group_by_dimensions || []);
        setBreakdownByDimensions(data.breakdown_by_dimensions || []);
        setThenByDimensions(data.then_by_dimensions || []);
        
        if (data.visible_columns && data.visible_columns.length > 0) {
          setVisibleColumns(new Set(data.visible_columns));
        }
      }
    } catch (error) {
      console.error("Error loading view settings:", error);
    }
  };

  const saveViewSettings = async () => {
    if (!reportId) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if a default view already exists
      const { data: existingView } = await supabase
        .from("report_views")
        .select("id")
        .eq("report_id", reportId)
        .eq("user_id", user.id)
        .eq("is_default", true)
        .maybeSingle();

      const viewData = {
        report_id: reportId,
        user_id: user.id,
        name: "Default View",
        is_default: true,
        group_by_dimensions: groupByDimensions,
        breakdown_by_dimensions: breakdownByDimensions,
        then_by_dimensions: thenByDimensions,
        visible_columns: Array.from(visibleColumns),
      };

      if (existingView) {
        // Update existing view
        const { error } = await supabase
          .from("report_views")
          .update(viewData)
          .eq("id", existingView.id);

        if (error) throw error;
      } else {
        // Create new view
        const { error } = await supabase
          .from("report_views")
          .insert(viewData);

        if (error) throw error;
      }
    } catch (error) {
      console.error("Error saving view settings:", error);
    }
  };

  const loadDimensions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("dimensions")
        .select("*")
        .eq("user_id", user.id);

      if (error) throw error;

      // Define the desired column order
      const columnOrder = [
        'Impressions',
        'Impression Share',
        'Clicks',
        'CTR',
        'Conversions',
        'Conversion Rate',
        'CPC',
        'CPM',
        'Cost',
        'Revenue',
        'Leads',
        'ROAS',
        'Cost of sale'
      ];

      // Sort dimensions according to the defined order
      const sortedDimensions = (data || []).sort((a, b) => {
        const indexA = columnOrder.indexOf(a.name);
        const indexB = columnOrder.indexOf(b.name);
        
        // If not in the order list, put at the end
        if (indexA === -1 && indexB === -1) return 0;
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        
        return indexA - indexB;
      });

      setDimensions(sortedDimensions);
      
      // Set default visibility only if no saved view exists
      // This will be overridden by loadViewSettings if a saved view exists
      const hiddenColumns = ['Impression Share', 'CPM', 'Leads'];
      const defaultVisible = new Set(
        sortedDimensions
          .filter(d => !hiddenColumns.includes(d.name))
          .map(d => d.id)
      );
      setVisibleColumns(defaultVisible);
    } catch (error) {
      console.error("Error loading dimensions:", error);
    } finally {
      setIsLoadingDimensions(false);
    }
  };

  // Helper to format date based on granularity
  const formatDate = (dateValue: any, granularity: 'day' | 'week' | 'month' | 'year'): string => {
    if (!dateValue) return "-";
    
    try {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return "-";
      
      switch (granularity) {
        case 'day':
          return format(date, 'MMM d, yyyy'); // Oct 31, 2025
        case 'week':
          const weekStart = startOfWeek(date);
          return format(weekStart, 'MMM d, yyyy'); // Week starting date
        case 'month':
          return format(date, 'MMMM yyyy'); // October 2025
        case 'year':
          return format(date, 'yyyy'); // 2025
        default:
          return "-";
      }
    } catch (error) {
      console.error('Error formatting date:', error);
      return "-";
    }
  };

  // Helper to format values based on dimension type
  const formatValue = (value: any, dimension: Dimension): string => {
    if (value === null || value === undefined || value === "") return "-";
    
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return value;
    
    // Format based on dimension name and type
    const dimName = dimension.name.toLowerCase();
    
    // CPC: 2 decimals with $ prefix
    if (dimName === 'cpc') {
      return `$${numValue.toFixed(2)}`;
    }
    
    // Cost and Revenue: 0 decimals with $ prefix and comma separators
    if (dimName === 'cost' || dimName === 'revenue') {
      return `$${Math.round(numValue).toLocaleString('en-US')}`;
    }
    
    // Currency type: 2 decimals with $ prefix
    if (dimension.type === 'currency') {
      return `$${numValue.toFixed(2)}`;
    }
    
    // Percentage type: show as percentage
    if (dimension.type === 'percentage') {
      return `${numValue.toFixed(2)}%`;
    }
    
    // Regular numbers: add comma separators
    if (dimension.type === 'number' || dimension.formula) {
      // If it's a whole number, show as integer with commas
      if (Number.isInteger(numValue)) {
        return numValue.toLocaleString('en-US');
      }
      // If it has decimals, show 2 decimal places with commas
      return numValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    
    return value;
  };


  // Helper to calculate formula based on aggregated data
  const calculateFormula = (formula: string, data: Record<string, any>): number | null => {
    if (!formula) return null;
    
    try {
      // Replace dimension names with actual values
      let expression = formula;
      
      // Extract all dimension names from the formula
      const dimensionNames = dimensions.map(d => d.name);
      
      // Sort by length (descending) to replace longer names first
      // This prevents "Cost" from being replaced when we want "Cost of sale"
      const sortedNames = [...dimensionNames].sort((a, b) => b.length - a.length);
      
      for (const dimName of sortedNames) {
        if (expression.includes(dimName)) {
          const value = data[dimName] || 0;
          // Use word boundaries to ensure exact match
          expression = expression.replace(new RegExp(`\\b${dimName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), String(value));
        }
      }
      
      // Evaluate the expression
      // eslint-disable-next-line no-eval
      const result = eval(expression);
      
      // Return null if result is Infinity, NaN, or undefined
      if (!isFinite(result)) return null;
      
      return result;
    } catch (error) {
      console.error(`Error calculating formula "${formula}":`, error);
      return null;
    }
  };

  const loadTableData = async () => {
    if (!reportId) return;
    
    // Don't load if no grouping dimension is selected
    if (groupByDimensions.length === 0) {
      setTableData([]);
      setIsLoadingData(false);
      return;
    }
    
    setIsLoadingData(true);
    try {
      // Fetch all dimension_data for this report
      const { data: dimensionData, error: dataError } = await supabase
        .from('dimension_data')
        .select('*')
        .eq('report_id', reportId);

      if (dataError) throw dataError;

      if (!dimensionData || dimensionData.length === 0) {
        setTableData([]);
        return;
      }

      // Group data by the first grouping dimension
      const groupDimensionId = groupByDimensions[0];
      const groupDimension = dimensions.find(d => d.id === groupDimensionId);
      
      if (!groupDimension) {
        setTableData([]);
        return;
      }

      const grouped = new Map<string, any>();

      dimensionData.forEach((row) => {
        const dimensionValues = row.dimension_values as Record<string, any>;
        const groupKey = dimensionValues[groupDimensionId] || "Unknown";

        if (!grouped.has(groupKey)) {
          grouped.set(groupKey, {
            id: String(groupKey).toLowerCase().replace(/\s+/g, '-'),
            name: groupKey,
            level: 0,
            data: {},
            children: [],
          });
        }

        // Aggregate only base metrics (no formulas)
        const groupItem = grouped.get(groupKey);
        dimensions.forEach((dimension) => {
          // Skip dimensions with formulas - we'll calculate them after aggregation
          if (dimension.formula) return;
          
          const value = dimensionValues[dimension.id];
          if (value !== undefined && value !== null) {
            if (dimension.type === 'number' || dimension.type === 'currency') {
              const numValue = parseFloat(value) || 0;
              groupItem.data[dimension.name] = (groupItem.data[dimension.name] || 0) + numValue;
            } else if (dimension.type === 'date') {
              // For date fields, keep the first date encountered
              if (!groupItem.data[dimension.name]) {
                groupItem.data[dimension.name] = value;
              }
            } else {
              groupItem.data[dimension.name] = value;
            }
          }
        });
      });

      // Calculate formula fields for each group after aggregation
      const groupedArray = Array.from(grouped.values());
      groupedArray.forEach((group) => {
        dimensions.forEach((dimension) => {
          if (dimension.formula) {
            const calculatedValue = calculateFormula(dimension.formula, group.data);
            group.data[dimension.name] = calculatedValue;
          }
        });
      });

      setTableData(groupedArray);
    } catch (error) {
      console.error("Error loading table data:", error);
    } finally {
      setIsLoadingData(false);
    }
  };

  const toggleColumn = (dimensionId: string) => {
    const newVisible = new Set(visibleColumns);
    if (newVisible.has(dimensionId)) {
      newVisible.delete(dimensionId);
    } else {
      newVisible.add(dimensionId);
    }
    setVisibleColumns(newVisible);
  };

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const handleContextMenu = (e: React.MouseEvent, kpi: string) => {
    e.preventDefault();
    setSelectedKPI(kpi);
    setMappingModalOpen(true);
  };

  const handleDimensionSelectorOpen = (
    e: React.MouseEvent,
    selector: "group" | "breakdown" | "then"
  ) => {
    e.preventDefault();
    setCurrentSelector(selector);
    setDimensionSelectorOpen(true);
  };

  const getSelectorTitle = () => {
    switch (currentSelector) {
      case "group":
        return "Group by dimensions";
      case "breakdown":
        return "Breakdown by dimensions";
      case "then":
        return "Then by dimensions";
    }
  };

  const getCurrentDimensions = () => {
    switch (currentSelector) {
      case "group":
        return groupByDimensions;
      case "breakdown":
        return breakdownByDimensions;
      case "then":
        return thenByDimensions;
    }
  };

  const handleDimensionsChange = (dimensions: string[]) => {
    switch (currentSelector) {
      case "group":
        setGroupByDimensions(dimensions);
        break;
      case "breakdown":
        setBreakdownByDimensions(dimensions);
        break;
      case "then":
        setThenByDimensions(dimensions);
        break;
    }
  };

  const renderRow = (row: TableRow) => {
    const isExpanded = expandedRows.has(row.id);
    const hasChildren = row.children && row.children.length > 0;

    return (
      <>
        <tr
          key={row.id}
          className={cn(
            "border-b hover:bg-muted/50 transition-colors",
            row.level === 1 && "bg-muted/30"
          )}
        >
          <td className="py-3 px-4" style={{ paddingLeft: `${row.level * 2 + 1}rem` }}>
            <div className="flex items-center gap-2">
              {hasChildren && (
                <button
                  onClick={() => toggleRow(row.id)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              )}
              {!hasChildren && <div className="w-4" />}
              <span className="font-medium">{row.name}</span>
            </div>
          </td>
          {dateGranularity !== 'none' && (
            <td className="py-3 px-4 text-left">
              {formatDate(row.data['Date'], dateGranularity)}
            </td>
          )}
          {dimensions
            .filter(d => {
              // Only show metric/value columns (same filter as Column Visibility)
              return (d.type === 'number' || 
                      d.type === 'currency' || 
                      d.type === 'percentage' ||
                      d.formula !== null) && 
                     visibleColumns.has(d.id);
            })
            .map((dimension) => (
              <td key={dimension.id} className="py-3 px-4 text-right">
                {formatValue(row.data[dimension.name], dimension)}
              </td>
            ))}
        </tr>
        {isExpanded &&
          row.children?.map((child) => renderRow(child))}
      </>
    );
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Hotel Performance</CardTitle>
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Group by:</span>
                <Button
                  variant="outline"
                  className="w-40 justify-start"
                  onContextMenu={(e) => handleDimensionSelectorOpen(e, "group")}
                  onClick={(e) => handleDimensionSelectorOpen(e as any, "group")}
                >
                  {groupByDimensions.length > 0 ? (
                    <span className="truncate">
                      {groupByDimensions.map(id => dimensions.find(d => d.id === id)?.name || id).join(", ")}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Right-click to select</span>
                  )}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Breakdown by:</span>
                <Button
                  variant="outline"
                  className="w-40 justify-start"
                  onContextMenu={(e) => handleDimensionSelectorOpen(e, "breakdown")}
                  onClick={(e) => handleDimensionSelectorOpen(e as any, "breakdown")}
                >
                  {breakdownByDimensions.length > 0 ? (
                    <span className="truncate">
                      {breakdownByDimensions.map(id => dimensions.find(d => d.id === id)?.name || id).join(", ")}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Right-click to select</span>
                  )}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Then by:</span>
                <Button
                  variant="outline"
                  className="w-40 justify-start"
                  onContextMenu={(e) => handleDimensionSelectorOpen(e, "then")}
                  onClick={(e) => handleDimensionSelectorOpen(e as any, "then")}
                >
                  {thenByDimensions.length > 0 ? (
                    <span className="truncate">
                      {thenByDimensions.map(id => dimensions.find(d => d.id === id)?.name || id).join(", ")}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Right-click to select</span>
                  )}
                </Button>
              </div>
              
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9">
                    <Columns3 className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>Column Visibility</SheetTitle>
                    <SheetDescription>
                      Select which metrics to display in the table
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 space-y-6">
                    {/* Date Section */}
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold">Date</h3>
                      <RadioGroup value={dateGranularity} onValueChange={(value) => setDateGranularity(value as any)}>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="none" id="date-none" />
                          <Label htmlFor="date-none" className="cursor-pointer font-normal">None</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="day" id="date-day" />
                          <Label htmlFor="date-day" className="cursor-pointer font-normal">Day</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="week" id="date-week" />
                          <Label htmlFor="date-week" className="cursor-pointer font-normal">Week</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="month" id="date-month" />
                          <Label htmlFor="date-month" className="cursor-pointer font-normal">Month</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="year" id="date-year" />
                          <Label htmlFor="date-year" className="cursor-pointer font-normal">Year</Label>
                        </div>
                      </RadioGroup>
                    </div>

                    <Separator />

                    {/* Metrics Section */}
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold">Metrics</h3>
                      {isLoadingDimensions ? (
                        <div className="text-sm text-muted-foreground">Loading dimensions...</div>
                      ) : dimensions.length === 0 ? (
                        <div className="text-sm text-muted-foreground">No dimensions found</div>
                      ) : (
                        <div className="space-y-3">
                          {dimensions
                            .filter(dimension => {
                              // Only show metric/value fields (number, currency, percentage, formula)
                              // Exclude attribute fields that are used for grouping
                              return dimension.type === 'number' || 
                                     dimension.type === 'currency' || 
                                     dimension.type === 'percentage' ||
                                     dimension.formula !== null;
                            })
                            .map((dimension) => (
                              <div key={dimension.id} className="flex items-center space-x-3">
                                <Checkbox
                                  id={dimension.id}
                                  checked={visibleColumns.has(dimension.id)}
                                  onCheckedChange={() => toggleColumn(dimension.id)}
                                />
                                <label
                                  htmlFor={dimension.id}
                                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                                >
                                  {dimension.name}
                                  {dimension.formula && (
                                    <span className="ml-2 text-xs text-muted-foreground">
                                      (formula)
                                    </span>
                                  )}
                                </label>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {groupByDimensions.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              Right-click on "Group by" to select dimensions
            </div>
          ) : isLoadingData ? (
            <div className="py-8 text-center text-muted-foreground">
              Loading data...
            </div>
          ) : tableData.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No data available. Connect a data source to view the table.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b bg-muted/30">
                  <tr>
                    <th
                      className="py-3 px-4 text-left font-medium text-sm"
                      onContextMenu={(e) => handleContextMenu(e, "name")}
                    >
                      {groupByDimensions[0] || "Name"}
                    </th>
                    {dateGranularity !== 'none' && (
                      <th className="py-3 px-4 text-left font-medium text-sm">
                        Date
                      </th>
                    )}
                    {dimensions
                      .filter(d => {
                        // Only show metric/value columns (same filter as Column Visibility)
                        return (d.type === 'number' || 
                                d.type === 'currency' || 
                                d.type === 'percentage' ||
                                d.formula !== null) && 
                               visibleColumns.has(d.id);
                      })
                      .map((dimension) => (
                        <th
                          key={dimension.id}
                          className="py-3 px-4 text-right font-medium text-sm"
                          onContextMenu={(e) => handleContextMenu(e, dimension.name)}
                        >
                          {dimension.name}
                        </th>
                      ))}
                  </tr>
                </thead>
                <tbody>{tableData.map((row) => renderRow(row))}</tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <MappingModal
        open={mappingModalOpen}
        onOpenChange={setMappingModalOpen}
        kpiName={selectedKPI}
      />

      <DimensionSelectorModal
        open={dimensionSelectorOpen}
        onOpenChange={setDimensionSelectorOpen}
        title={getSelectorTitle()}
        selectedDimensions={getCurrentDimensions()}
        onDimensionsChange={handleDimensionsChange}
      />
    </>
  );
};
