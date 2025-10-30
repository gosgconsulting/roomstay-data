import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { ChevronDown, ChevronRight, Columns3 } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { MappingModal } from "./MappingModal";
import { DimensionSelectorModal } from "./DimensionSelectorModal";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfWeek, startOfMonth, startOfYear } from "date-fns";
import { FilterState } from "./FiltersBar";

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
  filters: FilterState;
}

export const PerformanceTable = ({ reportId, filters }: PerformanceTableProps) => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
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
  const [dateOrder, setDateOrder] = useState<'asc' | 'desc'>('desc');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

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
  }, [groupByDimensions, breakdownByDimensions, thenByDimensions, reportId, dimensions, dateOrder, filters]);

  // Save view settings whenever they change
  useEffect(() => {
    if (reportId && dimensions.length > 0) {
      saveViewSettings();
    }
  }, [groupByDimensions, breakdownByDimensions, thenByDimensions, visibleColumns, dateGranularity, dateOrder, reportId]);

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
        
        // Load date granularity if available (default to none)
        if (data.date_granularity) {
          setDateGranularity(data.date_granularity as 'none' | 'day' | 'week' | 'month' | 'year');
        }
        
        // Load date order if available (default to desc)
        if (data.date_order) {
          setDateOrder(data.date_order as 'asc' | 'desc');
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
        date_granularity: dateGranularity,
        date_order: dateOrder,
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

  const buildHierarchicalData = (
    data: any[],
    groupDimId: string,
    breakdownDimId: string | null,
    thenByDimId: string | null,
    level: number = 0
  ): TableRow[] => {
    const grouped = new Map<string, any>();

    data.forEach((row) => {
      const dimensionValues = row.dimension_values as Record<string, any>;
      const groupKey = dimensionValues[groupDimId] || "Unknown";

      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, {
          id: `${level}-${String(groupKey).toLowerCase().replace(/\s+/g, '-')}`,
          name: groupKey,
          level,
          data: {},
          children: [],
          rawRows: [],
        });
      }

      const groupItem = grouped.get(groupKey);
      groupItem.rawRows.push(row);

      // Aggregate only base metrics (no formulas)
      dimensions.forEach((dimension) => {
        if (dimension.formula) return;
        
        const value = dimensionValues[dimension.id];
        if (value !== undefined && value !== null) {
          if (dimension.type === 'number' || dimension.type === 'currency') {
            const numValue = parseFloat(value) || 0;
            groupItem.data[dimension.name] = (groupItem.data[dimension.name] || 0) + numValue;
          } else if (dimension.type === 'date') {
            if (!groupItem.data[dimension.name]) {
              groupItem.data[dimension.name] = value;
            }
          } else {
            groupItem.data[dimension.name] = value;
          }
        }
      });
    });

    // Convert to array and process children
    const groupedArray = Array.from(grouped.values());
    
    groupedArray.forEach((group) => {
      // Calculate formula fields after aggregation
      dimensions.forEach((dimension) => {
        if (dimension.formula) {
          const calculatedValue = calculateFormula(dimension.formula, group.data);
          group.data[dimension.name] = calculatedValue;
        }
      });

      // Build children if there's a breakdown dimension
      if (breakdownDimId && group.rawRows.length > 0) {
        group.children = buildHierarchicalData(
          group.rawRows,
          breakdownDimId,
          thenByDimId,
          null,
          level + 1
        );
      }

      // Clean up temporary rawRows
      delete group.rawRows;
    });

    // Sort by date if date granularity is not 'none' and we have date data
    if (dateGranularity !== 'none') {
      groupedArray.sort((a, b) => {
        const dateA = a.data['Date'] ? new Date(a.data['Date']).getTime() : 0;
        const dateB = b.data['Date'] ? new Date(b.data['Date']).getTime() : 0;
        
        if (dateOrder === 'desc') {
          return dateB - dateA; // Latest first
        } else {
          return dateA - dateB; // Earliest first
        }
      });
    }

    return groupedArray;
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

      const groupDimensionId = groupByDimensions[0];
      const breakdownDimensionId = breakdownByDimensions[0] || null;
      const thenByDimensionId = thenByDimensions[0] || null;

      // Filter data based on applied filters
      const filteredData = dimensionData.filter((row) => {
        const dimensionValues = row.dimension_values as Record<string, any>;
        
        // Apply dimension filters
        for (const [dimId, filterValue] of Object.entries(filters.dimensionFilters)) {
          if (dimensionValues[dimId] !== filterValue) {
            return false;
          }
        }
        
        // Apply date range filter if there's a Date dimension
        if (filters.dateRange?.from || filters.dateRange?.to) {
          const dateDimension = dimensions.find(d => d.type === 'date');
          if (dateDimension && dimensionValues[dateDimension.id]) {
            const rowDate = new Date(dimensionValues[dateDimension.id]);
            if (filters.dateRange.from && rowDate < filters.dateRange.from) {
              return false;
            }
            if (filters.dateRange.to && rowDate > filters.dateRange.to) {
              return false;
            }
          }
        }
        
        return true;
      });

      const hierarchicalData = buildHierarchicalData(
        filteredData,
        groupDimensionId,
        breakdownDimensionId,
        thenByDimensionId,
        0
      );

      setTableData(hierarchicalData);
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

  const handleDimensionChange = (
    value: string,
    selector: "group" | "breakdown" | "then"
  ) => {
    if (selector === "group") {
      setGroupByDimensions([value]);
    } else if (selector === "breakdown") {
      setBreakdownByDimensions([value]);
    } else {
      setThenByDimensions([value]);
    }
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
        setCurrentPage(1); // Reset to first page when grouping changes
        break;
      case "breakdown":
        setBreakdownByDimensions(dimensions);
        setCurrentPage(1);
        break;
      case "then":
        setThenByDimensions(dimensions);
        setCurrentPage(1);
        break;
    }
  };

  // Calculate total row
  const calculateTotals = (): Record<string, any> => {
    const totals: Record<string, any> = {};
    
    dimensions.forEach((dimension) => {
      if (dimension.formula) {
        // Skip for now, will calculate after base totals
        return;
      }
      
      if (dimension.type === 'number' || dimension.type === 'currency') {
        let sum = 0;
        tableData.forEach((row) => {
          const value = parseFloat(row.data[dimension.name]) || 0;
          sum += value;
        });
        totals[dimension.name] = sum;
      }
    });
    
    // Calculate formula dimensions using totals
    dimensions.forEach((dimension) => {
      if (dimension.formula) {
        const calculatedValue = calculateFormula(dimension.formula, totals);
        totals[dimension.name] = calculatedValue;
      }
    });
    
    return totals;
  };

  // Paginate data
  const paginatedData = tableData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  
  const totalPages = Math.ceil(tableData.length / itemsPerPage);
  const totals = calculateTotals();

  const renderRow = (row: TableRow) => {
    const isExpanded = expandedRows.has(row.id);
    const hasChildren = row.children && row.children.length > 0;

    return (
      <>
        <tr
          key={row.id}
          className={cn(
            "border-b hover:bg-muted/50 transition-colors cursor-pointer",
            row.level === 1 && "bg-muted/20",
            row.level === 2 && "bg-muted/10"
          )}
          onClick={() => hasChildren && toggleRow(row.id)}
        >
          <td className="py-3 px-4" style={{ paddingLeft: `${row.level * 2 + 1}rem` }}>
            <div className="flex items-center gap-2">
              {hasChildren ? (
                <div className="text-muted-foreground">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </div>
              ) : (
                <div className="w-4" />
              )}
              <span className={cn("font-medium", row.level > 0 && "font-normal")}>
                {row.name}
              </span>
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
                {groupByDimensions.length > 0 ? (
                  <Select
                    value={groupByDimensions[0] || ""}
                    onValueChange={(value) => handleDimensionChange(value, "group")}
                  >
                    <SelectTrigger 
                      className="w-40 bg-background"
                      onContextMenu={(e) => handleDimensionSelectorOpen(e as any, "group")}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background z-50">
                      {dimensions
                        .filter(d => d.type === "text" || d.type === "date")
                        .map((dim) => (
                          <SelectItem key={dim.id} value={dim.id}>
                            {dim.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Button
                    variant="outline"
                    className="w-40 justify-start"
                    onContextMenu={(e) => handleDimensionSelectorOpen(e, "group")}
                    onClick={(e) => handleDimensionSelectorOpen(e as any, "group")}
                  >
                    <span className="text-muted-foreground">Right-click to select</span>
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Breakdown by:</span>
                {breakdownByDimensions.length > 0 ? (
                  <Select
                    value={breakdownByDimensions[0] || ""}
                    onValueChange={(value) => handleDimensionChange(value, "breakdown")}
                  >
                    <SelectTrigger 
                      className="w-40 bg-background"
                      onContextMenu={(e) => handleDimensionSelectorOpen(e as any, "breakdown")}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background z-50">
                      {dimensions
                        .filter(d => d.type === "text" || d.type === "date")
                        .map((dim) => (
                          <SelectItem key={dim.id} value={dim.id}>
                            {dim.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Button
                    variant="outline"
                    className="w-40 justify-start"
                    onContextMenu={(e) => handleDimensionSelectorOpen(e, "breakdown")}
                    onClick={(e) => handleDimensionSelectorOpen(e as any, "breakdown")}
                  >
                    <span className="text-muted-foreground">Right-click to select</span>
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Then by:</span>
                {thenByDimensions.length > 0 ? (
                  <Select
                    value={thenByDimensions[0] || ""}
                    onValueChange={(value) => handleDimensionChange(value, "then")}
                  >
                    <SelectTrigger 
                      className="w-40 bg-background"
                      onContextMenu={(e) => handleDimensionSelectorOpen(e as any, "then")}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-background z-50">
                      {dimensions
                        .filter(d => d.type === "text" || d.type === "date")
                        .map((dim) => (
                          <SelectItem key={dim.id} value={dim.id}>
                            {dim.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Button
                    variant="outline"
                    className="w-40 justify-start"
                    onContextMenu={(e) => handleDimensionSelectorOpen(e, "then")}
                    onClick={(e) => handleDimensionSelectorOpen(e as any, "then")}
                  >
                    <span className="text-muted-foreground">Right-click to select</span>
                  </Button>
                )}
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
                      
                      {dateGranularity !== 'none' && (
                        <>
                          <div className="mt-4 pt-3 border-t">
                            <h4 className="text-sm font-medium mb-2">Order by</h4>
                            <RadioGroup value={dateOrder} onValueChange={(value) => setDateOrder(value as 'asc' | 'desc')}>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="desc" id="date-order-desc" />
                                <Label htmlFor="date-order-desc" className="cursor-pointer font-normal">
                                  Descending (Latest first)
                                </Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="asc" id="date-order-asc" />
                                <Label htmlFor="date-order-asc" className="cursor-pointer font-normal">
                                  Ascending (Earliest first)
                                </Label>
                              </div>
                            </RadioGroup>
                          </div>
                        </>
                      )}
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
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b bg-muted/30">
                    <tr>
                      <th
                        className="py-3 px-4 text-left font-medium text-sm"
                        onContextMenu={(e) => handleContextMenu(e, "name")}
                      >
                        {groupByDimensions[0] 
                          ? dimensions.find(d => d.id === groupByDimensions[0])?.name || "Name"
                          : "Name"}
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
                  <tbody>
                    {paginatedData.map((row) => renderRow(row))}
                    {/* Total row */}
                    <tr className="border-t-2 border-primary/20 bg-muted/50 font-semibold">
                      <td className="py-3 px-4">Total</td>
                      {dateGranularity !== 'none' && (
                        <td className="py-3 px-4"></td>
                      )}
                      {dimensions
                        .filter(d => {
                          return (d.type === 'number' || 
                                  d.type === 'currency' || 
                                  d.type === 'percentage' ||
                                  d.formula !== null) && 
                                 visibleColumns.has(d.id);
                        })
                        .map((dimension) => (
                          <td key={dimension.id} className="py-3 px-4 text-right">
                            {formatValue(totals[dimension.name], dimension)}
                          </td>
                        ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                    {Math.min(currentPage * itemsPerPage, tableData.length)} of{" "}
                    {tableData.length} rows
                  </div>
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                          className={cn(
                            currentPage === 1 && "pointer-events-none opacity-50",
                            "cursor-pointer"
                          )}
                        />
                      </PaginationItem>
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter((page) => {
                          // Show first page, last page, current page, and pages around current
                          return (
                            page === 1 ||
                            page === totalPages ||
                            Math.abs(page - currentPage) <= 1
                          );
                        })
                        .map((page, index, array) => {
                          // Add ellipsis if there's a gap
                          const prevPage = array[index - 1];
                          const showEllipsis = prevPage && page - prevPage > 1;
                          
                          return (
                            <>
                              {showEllipsis && (
                                <PaginationItem key={`ellipsis-${page}`}>
                                  <PaginationEllipsis />
                                </PaginationItem>
                              )}
                              <PaginationItem key={page}>
                                <PaginationLink
                                  onClick={() => setCurrentPage(page)}
                                  isActive={currentPage === page}
                                  className="cursor-pointer"
                                >
                                  {page}
                                </PaginationLink>
                              </PaginationItem>
                            </>
                          );
                        })}
                      <PaginationItem>
                        <PaginationNext
                          onClick={() =>
                            setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                          }
                          className={cn(
                            currentPage === totalPages && "pointer-events-none opacity-50",
                            "cursor-pointer"
                          )}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </>
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
