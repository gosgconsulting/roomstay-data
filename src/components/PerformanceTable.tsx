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
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Columns3 } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { MappingModal } from "./MappingModal";
import { DimensionSelectorModal } from "./DimensionSelectorModal";
import { supabase } from "@/integrations/supabase/client";

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

  useEffect(() => {
    if (reportId) {
      loadDimensions();
    }
  }, [reportId]);

  useEffect(() => {
    if (reportId && dimensions.length > 0) {
      loadTableData();
    }
  }, [groupByDimensions, breakdownByDimensions, thenByDimensions, reportId, dimensions]);

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
      
      // Set default visibility - hide Impression Share, CPM, and Leads
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

  // Helper to get value from row data, trying both mapped dimension name and original column name
  const getValueFromRow = (rowData: Record<string, any>, dimensionName: string, dataSourceId: string, dataSources: any[]): any => {
    // First try dimension name (mapped)
    if (rowData[dimensionName] !== undefined && rowData[dimensionName] !== null) {
      return rowData[dimensionName];
    }
    
    // Fallback: find original column name from mapping
    const dataSource = dataSources.find(ds => ds.id === dataSourceId);
    if (dataSource?.column_mappings) {
      const mapping = dataSource.column_mappings.find((m: any) => {
        const dim = dimensions.find(d => d.id === m.dimensionId);
        return dim?.name === dimensionName;
      });
      
      if (mapping && rowData[mapping.column] !== undefined) {
        return rowData[mapping.column];
      }
    }
    
    return null;
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
      // Fetch data sources for this report with their mappings
      const { data: dataSources, error: dsError } = await supabase
        .from('data_sources')
        .select('id, column_mappings')
        .eq('report_id', reportId);

      if (dsError) throw dsError;

      if (!dataSources || dataSources.length === 0) {
        setTableData([]);
        return;
      }

      // Fetch all sheet data for these data sources
      const dataSourceIds = dataSources.map(ds => ds.id);
      const { data: sheetData, error: sheetError } = await supabase
        .from('sheet_data')
        .select('*')
        .in('data_source_id', dataSourceIds);

      if (sheetError) throw sheetError;

      if (!sheetData || sheetData.length === 0) {
        setTableData([]);
        return;
      }

      // Group data by the first grouping dimension
      const groupDimension = groupByDimensions[0];
      const grouped = new Map<string, any>();

      sheetData.forEach((row) => {
        const rowData = row.row_data as Record<string, any>;
        const groupKey = getValueFromRow(rowData, groupDimension, row.data_source_id, dataSources) || "Unknown";

        if (!grouped.has(groupKey)) {
          grouped.set(groupKey, {
            id: groupKey.toLowerCase().replace(/\s+/g, '-'),
            name: groupKey,
            level: 0,
            data: {},
            children: [],
          });
        }

        // Aggregate numeric values
        const groupItem = grouped.get(groupKey);
        dimensions.forEach((dimension) => {
          const value = getValueFromRow(rowData, dimension.name, row.data_source_id, dataSources);
          if (value !== undefined && value !== null) {
            if (dimension.type === 'number' || dimension.type === 'currency') {
              const numValue = parseFloat(value) || 0;
              groupItem.data[dimension.name] = (groupItem.data[dimension.name] || 0) + numValue;
            } else {
              groupItem.data[dimension.name] = value;
            }
          }
        });
      });

      setTableData(Array.from(grouped.values()));
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
                    <span className="truncate">{groupByDimensions.join(", ")}</span>
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
                    <span className="truncate">{breakdownByDimensions.join(", ")}</span>
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
                    <span className="truncate">{thenByDimensions.join(", ")}</span>
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
                  <div className="mt-6 space-y-4">
                    {isLoadingDimensions ? (
                      <div className="text-sm text-muted-foreground">Loading dimensions...</div>
                    ) : dimensions.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No dimensions found</div>
                    ) : (
                      dimensions
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
                        ))
                    )}
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
