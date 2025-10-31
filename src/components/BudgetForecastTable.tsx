import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, X, Plus } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { startOfMonth, endOfMonth, getDaysInMonth, getDate } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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
  data: Record<string, any>;
  children?: TableRow[];
}

interface BudgetForecastTableProps {
  reportId: string | null;
}

export const BudgetForecastTable = ({ reportId }: BudgetForecastTableProps) => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [visibleColumns] = useState<Set<string>>(new Set(["Cost", "Revenue", "ROAS", "Cost of sale"]));
  const [isLoadingDimensions, setIsLoadingDimensions] = useState(true);
  const [tableData, setTableData] = useState<TableRow[]>([]);
  const [totalData, setTotalData] = useState<Record<string, any>>({});
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isDimensionModalOpen, setIsDimensionModalOpen] = useState(false);
  
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
      loadForecastData();
    }
  }, [reportId, groupByDimensions, breakdownByDimensions, thenByDimensions, dimensions.length]);

  const loadDimensions = async () => {
    if (!reportId) return;
    
    setIsLoadingDimensions(true);
    try {
      const { data, error } = await supabase
        .from("dimensions")
        .select("*")
        .eq("report_id", reportId);

      if (error) throw error;
      
      setDimensions(data || []);
      
      // Set Date as default group by if not already set
      const dateDim = data?.find(d => d.type === "date");
      if (dateDim && groupByDimensions.length === 0) {
        setGroupByDimensions([dateDim.id]);
      }
    } catch (error) {
      console.error("Error loading dimensions:", error);
    } finally {
      setIsLoadingDimensions(false);
    }
  };

  const loadForecastData = async () => {
    if (!reportId || dimensions.length === 0) return;

    setIsLoadingData(true);
    try {
      const dateDim = dimensions.find(d => d.type === "date");
      if (!dateDim) {
        console.error("No date dimension found");
        return;
      }

      // Calculate current month range
      const now = new Date();
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);
      const daysInMonth = getDaysInMonth(now);
      const daysElapsed = getDate(now);
      const prorateMultiplier = daysInMonth / daysElapsed;

      console.log(`Forecast calculation: ${daysElapsed} days elapsed out of ${daysInMonth} days. Multiplier: ${prorateMultiplier.toFixed(2)}`);

      // Build dimension filters (empty for now - can be added later if needed)
      const dimensionFilters: Record<string, string> = {};

      const requestBody = {
        reportId,
        groupByDims: groupByDimensions,
        breakdownDims: breakdownByDimensions,
        thenByDims: thenByDimensions,
        dimensionFilters,
        dateFrom: monthStart.toISOString().split('T')[0],
        dateTo: now.toISOString().split('T')[0], // Only up to today
        visibleDimensionIds: [],
        compareEnabled: false,
        dateGranularity: 'none',
        dateOrder: 'desc',
        limit: 1000,
        offset: 0,
      };

      const { data: responseData, error } = await supabase.functions.invoke('get-performance-data', {
        body: requestBody,
      });

      if (error) throw error;

      const { rows, totals } = responseData;

      // Apply prorated forecasting to all metrics
      const forecastRows = rows.map((row: any) => ({
        ...row,
        data: {
          ...row.data,
          Cost: row.data.Cost ? row.data.Cost * prorateMultiplier : 0,
          Revenue: row.data.Revenue ? row.data.Revenue * prorateMultiplier : 0,
          ROAS: row.data.ROAS, // ROAS doesn't get prorated, it's a ratio
          "Cost of sale": row.data["Cost of sale"], // Cost of sale is a percentage
        }
      }));

      const forecastTotals = {
        Cost: totals.Cost ? totals.Cost * prorateMultiplier : 0,
        Revenue: totals.Revenue ? totals.Revenue * prorateMultiplier : 0,
        ROAS: totals.ROAS,
        "Cost of sale": totals["Cost of sale"],
      };

      setTableData(forecastRows);
      setTotalData(forecastTotals);
    } catch (error) {
      console.error("Error loading forecast data:", error);
    } finally {
      setIsLoadingData(false);
    }
  };

  const formatValue = (value: any, dimensionName: string) => {
    if (value === null || value === undefined || value === "") return "-";
    
    const dimension = dimensions.find(d => d.name === dimensionName);
    if (!dimension) return String(value);

    if (dimension.type === "currency") {
      const numValue = typeof value === 'string' ? parseFloat(value) : value;
      return numValue.toLocaleString('en-US', { 
        style: 'currency', 
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
    }

    if (dimension.type === "percentage") {
      const numValue = typeof value === 'string' ? parseFloat(value) : value;
      return `${numValue.toFixed(2)}%`;
    }

    if (dimension.type === "number") {
      const numValue = typeof value === 'string' ? parseFloat(value) : value;
      return numValue.toLocaleString('en-US', { 
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
    }

    return String(value);
  };

  const toggleRow = (rowId: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(rowId)) {
      newExpanded.delete(rowId);
    } else {
      newExpanded.add(rowId);
    }
    setExpandedRows(newExpanded);
  };

  const renderRow = (row: TableRow): JSX.Element[] => {
    const hasChildren = row.children && row.children.length > 0;
    const isExpanded = expandedRows.has(row.id);
    
    const elements: JSX.Element[] = [
      <TableRow key={row.id}>
        <TableCell 
          className="font-medium cursor-pointer"
          style={{ paddingLeft: `${row.level * 24 + 16}px` }}
          onClick={() => hasChildren && toggleRow(row.id)}
        >
          <div className="flex items-center gap-2">
            {hasChildren ? (
              isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
            ) : <span className="w-4" />}
            <span>{row.name}</span>
          </div>
        </TableCell>
        {Array.from(visibleColumns).map((colName) => (
          <TableCell key={`${row.id}-${colName}`} className="text-right">
            {formatValue(row.data[colName], colName)}
          </TableCell>
        ))}
      </TableRow>
    ];

    if (hasChildren && isExpanded) {
      row.children!.forEach(child => {
        elements.push(...renderRow(child));
      });
    }

    return elements;
  };

  const getAvailableDimensions = (currentSelection: string[], ...otherSelections: string[][]) => {
    const allSelected = [...currentSelection, ...otherSelections.flat()];
    return dimensions.filter(d => !allSelected.includes(d.id));
  };

  const handleDimensionChange = (type: 'breakdown' | 'then', value: string) => {
    if (type === 'breakdown') {
      setBreakdownByDimensions(value ? [value] : []);
    } else if (type === 'then') {
      setThenByDimensions(value ? [value] : []);
    }
  };

  const addGroupByDimension = (dimensionId: string) => {
    if (!groupByDimensions.includes(dimensionId)) {
      setGroupByDimensions([...groupByDimensions, dimensionId]);
    }
  };

  const removeGroupByDimension = (dimensionId: string) => {
    // Don't allow removing the date dimension if it's the only one
    const dateDim = dimensions.find(d => d.type === "date");
    if (dateDim && dimensionId === dateDim.id && groupByDimensions.length === 1) {
      return;
    }
    setGroupByDimensions(groupByDimensions.filter(id => id !== dimensionId));
  };

  const dateDimension = dimensions.find(d => d.type === "date");

  if (isLoadingDimensions) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Budget Forecast</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">Loading dimensions...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Budget Forecast</CardTitle>
          <p className="text-sm text-muted-foreground">Current month prorated forecast</p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Dimension Selectors */}
          <div className="flex flex-wrap items-start gap-4">
            <div className="flex flex-col gap-2">
              <Label>Group by:</Label>
              <Dialog open={isDimensionModalOpen} onOpenChange={setIsDimensionModalOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="justify-start h-auto min-h-[40px] px-3 py-2">
                    {groupByDimensions.length === 0 ? (
                      <Plus className="h-4 w-4" />
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        {groupByDimensions.map((dimId) => {
                          const dim = dimensions.find(d => d.id === dimId);
                          if (!dim) return null;
                          return (
                            <Badge key={dimId} variant="secondary">
                              {dim.name}
                            </Badge>
                          );
                        })}
                        <Plus className="h-4 w-4 ml-1" />
                      </div>
                    )}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle>Select dimensions</DialogTitle>
                    <DialogDescription>
                      Select dimensions to populate Group by, Breakdown by, and Then by options. More dimensions = more breakdown options.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    {groupByDimensions.map((dimId) => {
                      const dim = dimensions.find(d => d.id === dimId);
                      if (!dim) return null;
                      const isDate = dim.type === "date";
                      return (
                        <div key={dimId} className="flex items-center justify-between">
                          <span className="font-medium">{dim.name}</span>
                          <div className="flex items-center gap-2">
                            {isDate && (
                              <Select defaultValue="day">
                                <SelectTrigger className="w-[120px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="day">Day</SelectItem>
                                  <SelectItem value="week">Week</SelectItem>
                                  <SelectItem value="month">Month</SelectItem>
                                  <SelectItem value="quarter">Quarter</SelectItem>
                                  <SelectItem value="year">Year</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                            {(!isDate || groupByDimensions.length > 1) && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => removeGroupByDimension(dimId)}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    
                    {getAvailableDimensions(groupByDimensions, breakdownByDimensions, thenByDimensions).length > 0 && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          const availableDims = getAvailableDimensions(groupByDimensions, breakdownByDimensions, thenByDimensions);
                          if (availableDims.length > 0) {
                            addGroupByDimension(availableDims[0].id);
                          }
                        }}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add dimension
                      </Button>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => setIsDimensionModalOpen(false)}>Close</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            {groupByDimensions.length > 0 && (
              <>
                <div className="flex items-center gap-2">
                  <Label>Breakdown by:</Label>
                  <Select
                    value={breakdownByDimensions[0] || undefined}
                    onValueChange={(value) => handleDimensionChange('breakdown', value)}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      {getAvailableDimensions(breakdownByDimensions, groupByDimensions, thenByDimensions).map((dim) => (
                        <SelectItem key={dim.id} value={dim.id}>{dim.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <Label>Then by:</Label>
                  <Select
                    value={thenByDimensions[0] || undefined}
                    onValueChange={(value) => handleDimensionChange('then', value)}
                  >
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      {getAvailableDimensions(thenByDimensions, groupByDimensions, breakdownByDimensions).map((dim) => (
                        <SelectItem key={dim.id} value={dim.id}>{dim.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[300px]">
                    {groupByDimensions.length > 0
                      ? groupByDimensions.map(id => dimensions.find(d => d.id === id)?.name).filter(Boolean).join(" / ")
                      : "Dimension"}
                  </TableHead>
                  {Array.from(visibleColumns).map((colName) => (
                    <TableHead key={colName} className="text-right">{colName}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingData ? (
                  <TableRow>
                    <TableCell colSpan={visibleColumns.size + 1} className="text-center text-muted-foreground">
                      Loading forecast data...
                    </TableCell>
                  </TableRow>
                ) : tableData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={visibleColumns.size + 1} className="text-center text-muted-foreground">
                      No data available for current month
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {tableData.map(row => renderRow(row))}
                    <TableRow className="font-bold bg-muted/50">
                      <TableCell>Total</TableCell>
                      {Array.from(visibleColumns).map((colName) => (
                        <TableCell key={`total-${colName}`} className="text-right">
                          {formatValue(totalData[colName], colName)}
                        </TableCell>
                      ))}
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
