import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ChevronDown, ChevronRight, Columns3, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { useState, useEffect, useMemo, Fragment } from "react";
import { cn, sortKPIsByDefaultOrder } from "@/lib/utils";
import { format, startOfWeek, startOfMonth, startOfYear, getWeek } from "date-fns";
import { FilterState } from "./FiltersBar";
import { useReportData } from "@/hooks/use-report-data";
import { calculateKPIMetrics } from "@/lib/data-loading-fix";

interface PerformanceTableProps {
  reportId: string | null;
  filters: FilterState;
  isSharedView?: boolean;
  accountId?: string;
  visibilityRefreshTrigger?: number;
  onLoadingComplete?: () => void;
}

interface TableRow {
  id: string;
  data: Record<string, any>;
  compareData?: Record<string, any>;
  changeData?: Record<string, any>;
}

export function PerformanceTable({
  reportId,
  filters,
  isSharedView = false,
  accountId,
  visibilityRefreshTrigger,
  onLoadingComplete
}: PerformanceTableProps) {
  const [tableData, setTableData] = useState<TableRow[]>([]);
  const [totalData, setTotalData] = useState<Record<string, any>>({});
  const [totalCompareData, setTotalCompareData] = useState<Record<string, any>>({});
  const [totalChangeData, setTotalChangeData] = useState<Record<string, any>>({});
  const [activeDateTab, setActiveDateTab] = useState("Day");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set());

  console.log('[PERF-TABLE-FIXED] Component render - reportId:', reportId, 'accountId:', accountId);

  // Use the unified data loading hook
  const {
    data: rawData,
    dimensions,
    isLoading,
    error,
    totalRows,
    filteredRows
  } = useReportData({
    reportId,
    accountId,
    filters: {
      dateRange: filters.dateRange,
      dimensionFilters: filters.dimensionFilters,
      compareEnabled: filters.compareEnabled,
      compareType: filters.compareType,
      compareDateRange: filters.compareDateRange
    },
    onLoadingComplete,
    enabled: !!reportId && !!accountId
  });

  // Set default visible columns when dimensions load
  useEffect(() => {
    if (dimensions.length > 0 && visibleColumns.size === 0) {
      const defaultColumns = new Set<string>();
      
      // Add key dimensions first
      const keyDimensions = ['Date', 'Channel', 'Campaign', 'Revenue', 'Cost', 'Impressions', 'Clicks'];
      keyDimensions.forEach(name => {
        const dim = dimensions.find(d => d.name === name);
        if (dim) defaultColumns.add(dim.id);
      });

      // Add other dimensions up to a reasonable limit
      dimensions.slice(0, 10).forEach(dim => {
        defaultColumns.add(dim.id);
      });

      setVisibleColumns(defaultColumns);
      console.log('[PERF-TABLE-FIXED] Set default visible columns:', Array.from(defaultColumns));
    }
  }, [dimensions, visibleColumns.size]);

  // Process data for table display
  useEffect(() => {
    if (!rawData.length || !dimensions.length) {
      setTableData([]);
      setTotalData({});
      setTotalCompareData({});
      setTotalChangeData({});
      return;
    }

    console.log('[PERF-TABLE-FIXED] Processing data for table display:', {
      rawDataLength: rawData.length,
      dimensionsLength: dimensions.length,
      activeDateTab
    });

    try {
      // Group data by date granularity
      const groupedData = groupDataByDateGranularity(rawData, dimensions, activeDateTab);
      
      // Calculate metrics for each group
      const processedRows: TableRow[] = [];
      const totals: Record<string, any> = {};
      const compareTotals: Record<string, any> = {};

      Object.entries(groupedData).forEach(([groupKey, groupRows]) => {
        const rowData: Record<string, any> = {};
        const compareRowData: Record<string, any> = {};

        // Calculate aggregated values for each dimension
        dimensions.forEach(dim => {
          if (dim.type === 'number' || dim.type === 'currency') {
            const values = groupRows.map(row => {
              const value = row.dimension_values[dim.id];
              return parseFloat(value) || 0;
            });
            rowData[dim.name] = values.reduce((sum, val) => sum + val, 0);
            
            // Add to totals
            totals[dim.name] = (totals[dim.name] || 0) + rowData[dim.name];
          } else {
            // For non-numeric dimensions, use the first value or the group key for date
            if (dim.type === 'date') {
              rowData[dim.name] = groupKey;
            } else {
              const firstValue = groupRows[0]?.dimension_values[dim.id];
              rowData[dim.name] = firstValue || '';
            }
          }
        });

        processedRows.push({
          id: groupKey,
          data: rowData,
          compareData: Object.keys(compareRowData).length > 0 ? compareRowData : undefined
        });
      });

      // Sort rows by date (most recent first)
      processedRows.sort((a, b) => {
        const dateA = new Date(a.data.Date || a.id);
        const dateB = new Date(b.data.Date || b.id);
        return dateB.getTime() - dateA.getTime();
      });

      setTableData(processedRows);
      setTotalData(totals);
      setTotalCompareData(compareTotals);

      // Calculate change data
      const changeData: Record<string, any> = {};
      Object.keys(totals).forEach(key => {
        const current = totals[key] || 0;
        const compare = compareTotals[key] || 0;
        if (compare !== 0) {
          changeData[key] = ((current - compare) / compare) * 100;
        }
      });
      setTotalChangeData(changeData);

      console.log('[PERF-TABLE-FIXED] Data processing complete:', {
        processedRows: processedRows.length,
        totalDimensions: Object.keys(totals).length
      });

    } catch (error) {
      console.error('[PERF-TABLE-FIXED] Error processing data:', error);
    }
  }, [rawData, dimensions, activeDateTab]);

  // Group data by date granularity
  const groupDataByDateGranularity = (data: any[], dimensions: any[], granularity: string) => {
    const dateDimension = dimensions.find(d => d.type === 'date');
    if (!dateDimension) return { 'No Date': data };

    const grouped: Record<string, any[]> = {};

    data.forEach(row => {
      const dateValue = row.dimension_values[dateDimension.id];
      if (!dateValue) return;

      const date = new Date(dateValue);
      let groupKey: string;

      switch (granularity) {
        case 'Week':
          const weekStart = startOfWeek(date, { weekStartsOn: 1 });
          groupKey = format(weekStart, 'yyyy-MM-dd');
          break;
        case 'Month':
          const monthStart = startOfMonth(date);
          groupKey = format(monthStart, 'yyyy-MM');
          break;
        case 'Year':
          const yearStart = startOfYear(date);
          groupKey = format(yearStart, 'yyyy');
          break;
        default: // Day
          groupKey = format(date, 'yyyy-MM-dd');
          break;
      }

      if (!grouped[groupKey]) {
        grouped[groupKey] = [];
      }
      grouped[groupKey].push(row);
    });

    return grouped;
  };

  // Format value for display
  const formatValue = (value: any, dimension: any) => {
    if (value === null || value === undefined || value === '') {
      return '-';
    }

    if (dimension?.type === 'currency') {
      const numValue = parseFloat(value);
      if (isNaN(numValue)) return '-';
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(numValue);
    }

    if (dimension?.type === 'number') {
      const numValue = parseFloat(value);
      if (isNaN(numValue)) return '-';
      
      if (Number.isInteger(numValue)) {
        return numValue.toLocaleString('en-US');
      }
      return numValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    if (dimension?.type === 'percentage') {
      const numValue = parseFloat(value);
      if (isNaN(numValue)) return '-';
      return `${numValue.toFixed(2)}%`;
    }

    return String(value);
  };

  // Get change indicator
  const getChangeIndicator = (current: number, previous: number) => {
    if (!previous || previous === 0) return null;
    
    const change = ((current - previous) / previous) * 100;
    if (Math.abs(change) < 0.01) return <Minus className="h-3 w-3 text-gray-400" />;
    
    return change > 0 
      ? <ArrowUp className="h-3 w-3 text-green-500" />
      : <ArrowDown className="h-3 w-3 text-red-500" />;
  };

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Performance Table</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-red-600">
            Error loading data: {error}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Performance Table</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const visibleDimensions = dimensions.filter(dim => visibleColumns.has(dim.id));

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Performance Table</CardTitle>
          <div className="flex items-center gap-2">
            <Tabs value={activeDateTab} onValueChange={setActiveDateTab}>
              <TabsList>
                <TabsTrigger value="Day">Day</TabsTrigger>
                <TabsTrigger value="Week">Week</TabsTrigger>
                <TabsTrigger value="Month">Month</TabsTrigger>
                <TabsTrigger value="Year">Year</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="outline" size="sm">
              <Columns3 className="h-4 w-4 mr-2" />
              Columns
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {tableData.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No data available for the selected filters
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2 font-medium">Date</th>
                  {visibleDimensions.filter(dim => dim.type !== 'date').map(dim => (
                    <th key={dim.id} className="text-right p-2 font-medium">
                      {dim.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {/* Total row */}
                <tr className="border-b bg-gray-50 font-medium">
                  <td className="p-2">Total</td>
                  {visibleDimensions.filter(dim => dim.type !== 'date').map(dim => (
                    <td key={dim.id} className="text-right p-2">
                      <div className="flex items-center justify-end gap-1">
                        {formatValue(totalData[dim.name], dim)}
                        {filters.compareEnabled && totalCompareData[dim.name] && 
                          getChangeIndicator(totalData[dim.name] || 0, totalCompareData[dim.name] || 0)
                        }
                      </div>
                    </td>
                  ))}
                </tr>
                
                {/* Data rows */}
                {tableData.map((row) => (
                  <tr key={row.id} className="border-b hover:bg-gray-50">
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const newExpanded = new Set(expandedRows);
                            if (newExpanded.has(row.id)) {
                              newExpanded.delete(row.id);
                            } else {
                              newExpanded.add(row.id);
                            }
                            setExpandedRows(newExpanded);
                          }}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          {expandedRows.has(row.id) ? 
                            <ChevronDown className="h-4 w-4" /> : 
                            <ChevronRight className="h-4 w-4" />
                          }
                        </button>
                        {formatValue(row.data.Date || row.id, { type: 'date' })}
                      </div>
                    </td>
                    {visibleDimensions.filter(dim => dim.type !== 'date').map(dim => (
                      <td key={dim.id} className="text-right p-2">
                        <div className="flex items-center justify-end gap-1">
                          {formatValue(row.data[dim.name], dim)}
                          {row.compareData && row.compareData[dim.name] && 
                            getChangeIndicator(row.data[dim.name] || 0, row.compareData[dim.name] || 0)
                          }
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        
        {/* Summary info */}
        <div className="mt-4 text-sm text-gray-500 flex justify-between">
          <span>Showing {tableData.length} rows</span>
          <span>{filteredRows} of {totalRows} total records</span>
        </div>
      </CardContent>
    </Card>
  );
}
