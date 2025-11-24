import { useState, useCallback, useMemo } from "react";
import { format, startOfYear, endOfYear, eachMonthOfInterval, startOfMonth, endOfMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useVlookupMappings } from "@/hooks/useVlookupMappings";
import type { Dimension } from "../performanceTable/usePerformanceTableDimensions";
import type { BudgetTrackerFilterState } from "./useBudgetTrackerFilters";

export interface BudgetTableRow {
  id: string;
  name: string;
  level: number;
  parentId?: string;
  data: Record<string, any>;
  children?: BudgetTableRow[];
  originalDate?: string | Date;
}

interface UseBudgetTrackerDataOptions {
  reportId: string | null;
  reportIds?: string[];
  accountId?: string;
  breakdownByDimensions: string[];
  visibleColumns: Set<string>;
  filters: BudgetTrackerFilterState;
  activeDateTab: 'month' | 'year';
  dimensions: Dimension[];
  onLoadingComplete?: () => void;
}

/**
 * Hook for loading budget tracker data with full year display (Jan-Dec)
 * Always shows all 12 months even when no data exists
 */
export function useBudgetTrackerData({
  reportId,
  reportIds,
  accountId,
  breakdownByDimensions,
  visibleColumns,
  filters,
  activeDateTab,
  dimensions,
  onLoadingComplete,
}: UseBudgetTrackerDataOptions) {
  const [tableData, setTableData] = useState<BudgetTableRow[]>([]);
  const [totalData, setTotalData] = useState<Record<string, any>>({});
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Load vlookup mappings for applying to data
  const { data: vlookupMappings = [] } = useVlookupMappings(reportId || undefined, accountId);

  // Generate all months for the selected year
  const yearMonths = useMemo(() => {
    const yearStart = startOfYear(new Date(filters.selectedYear, 0, 1));
    const yearEnd = endOfYear(new Date(filters.selectedYear, 0, 1));
    
    return eachMonthOfInterval({ start: yearStart, end: yearEnd }).map(date => ({
      date,
      key: format(date, 'yyyy-MM-dd'),
      name: format(date, 'MMMM yyyy'),
      shortName: format(date, 'MMM'),
    }));
  }, [filters.selectedYear]);

  const loadBudgetTrackerData = useCallback(async () => {
    setLoadError(null);
    setIsLoadingData(true);
    
    // Create date range for the entire selected year
    const yearStart = startOfYear(new Date(filters.selectedYear, 0, 1));
    const yearEnd = endOfYear(new Date(filters.selectedYear, 0, 1));
    
    const dateFromFormatted = format(yearStart, 'yyyy-MM-dd');
    const dateToFormatted = format(yearEnd, 'yyyy-MM-dd');
    
    console.log('[BUDGET-TRACKER] Loading data for year:', filters.selectedYear);
    console.log('[BUDGET-TRACKER] Date range:', dateFromFormatted, 'to', dateToFormatted);

    const useConsolidatedView = reportIds && reportIds.length > 0;
    
    if (!reportId && !useConsolidatedView) {
      console.log('[BUDGET-TRACKER] No data loading - missing reportId/reportIds');
      setTableData([]);
      setTotalData({});
      setIsLoadingData(false);
      onLoadingComplete?.();
      return;
    }

    try {
      // Always group by Date (mandatory for budget tracker)
      const dateId = dimensions.find(d => d.type === 'date')?.id;
      if (!dateId) {
        throw new Error('No date dimension found for budget tracker');
      }

      const groupByDimensions = [dateId, ...breakdownByDimensions];

      // Use edge function for optimized, server-side data loading
      const { data: edgeFunctionData, error: fetchError } = await supabase.functions.invoke(
        'get-performance-data',
        {
          body: {
            reportId: reportId,
            reportIds: reportIds || undefined,
            accountId: accountId,
            groupByDims: groupByDimensions,
            breakdownDims: [],
            thenByDims: [],
            visibleDimensionIds: Array.from(visibleColumns),
            dimensionFilters: {}, // No dimension filters for budget tracker
            dateFrom: dateFromFormatted,
            dateTo: dateToFormatted,
            dateGranularity: activeDateTab === 'year' ? 'year' : 'month',
            dateOrder: 'asc', // Always ascending for budget tracker
            limit: 50000,
            offset: 0
          }
        }
      );

      if (fetchError) throw fetchError;
      
      const rawRows = edgeFunctionData?.data || [];

      console.log('[BUDGET-TRACKER] Edge function returned', rawRows.length, 'rows');

      // Transform edge function rows and ensure all months are represented
      const dataByMonth = new Map<string, BudgetTableRow[]>();
      
      // Initialize all months with empty data
      yearMonths.forEach(month => {
        dataByMonth.set(month.key, []);
      });

      // Process actual data rows
      if (rawRows.length > 0) {
        const transformedRows: BudgetTableRow[] = rawRows.map((row: any, idx: number) => {
          const dv: Record<string, any> = row.dimension_values || {};
          
          // Apply vlookup mappings if present
          if (vlookupMappings.length > 0) {
            for (const m of vlookupMappings) {
              const src = dv[m.sourceDimensionId];
              if (src !== undefined && src !== null) {
                if (String(src).toLowerCase() === m.sourceValue.toLowerCase()) {
                  dv[m.targetDimensionId] = m.targetValue;
                }
              }
            }
          }

          // Build row.data keyed by dimension names with numeric conversion
          const rowData: Record<string, any> = {};
          dimensions.forEach(dim => {
            if (dv[dim.id] !== undefined) {
              const val = dv[dim.id];
              if (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage') {
                const numValue = parseFloat(String(val));
                rowData[dim.name] = !isNaN(numValue) ? numValue : val;
              } else {
                rowData[dim.name] = val;
              }
            }
          });

          const dateValue = dv[dateId];
          const originalDate = dateValue;
          const name = dateValue !== undefined && dateValue !== null && dateValue !== '' ? String(dateValue) : 'Unknown';

          return {
            id: `budget-row-${idx + 1}`,
            name,
            level: 0,
            data: rowData,
            originalDate,
          };
        });

        // Group rows by month
        transformedRows.forEach(row => {
          if (row.originalDate) {
            try {
              const rowDate = new Date(row.originalDate);
              const monthKey = format(startOfMonth(rowDate), 'yyyy-MM-dd');
              
              if (dataByMonth.has(monthKey)) {
                dataByMonth.get(monthKey)!.push(row);
              }
            } catch (e) {
              console.warn('[BUDGET-TRACKER] Invalid date in row:', row.originalDate);
            }
          }
        });
      }

      // Create final table data ensuring all months are present
      const finalTableData: BudgetTableRow[] = [];
      
      if (activeDateTab === 'year') {
        // Year view: show single row for the entire year
        const yearRowData: Record<string, any> = {};
        
        // Initialize all dimensions with 0
        dimensions.forEach(dim => {
          if (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage') {
            yearRowData[dim.name] = 0;
          } else if (dim.type === 'date') {
            yearRowData[dim.name] = `${filters.selectedYear}`;
          }
        });

        // Aggregate all month data into year totals
        dataByMonth.forEach((monthRows) => {
          monthRows.forEach(row => {
            Object.keys(row.data).forEach(dimName => {
              const dim = dimensions.find(d => d.name === dimName);
              if (dim && (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage')) {
                const value = parseFloat(String(row.data[dimName] ?? '0'));
                if (!isNaN(value)) {
                  yearRowData[dimName] = (yearRowData[dimName] || 0) + value;
                }
              }
            });
          });
        });

        finalTableData.push({
          id: `budget-year-${filters.selectedYear}`,
          name: `${filters.selectedYear}`,
          level: 0,
          data: yearRowData,
          originalDate: `${filters.selectedYear}-01-01`,
        });
      } else {
        // Month view: show all 12 months
        yearMonths.forEach(month => {
          const monthRows = dataByMonth.get(month.key) || [];
          
          if (monthRows.length > 0) {
            // Aggregate month data if multiple rows exist
            const monthRowData: Record<string, any> = {};
            
            // Initialize with first row data
            dimensions.forEach(dim => {
              if (dim.type === 'date') {
                monthRowData[dim.name] = month.key;
              } else if (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage') {
                monthRowData[dim.name] = 0;
              }
            });

            // Aggregate all rows for this month
            monthRows.forEach(row => {
              Object.keys(row.data).forEach(dimName => {
                const dim = dimensions.find(d => d.name === dimName);
                if (dim && (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage')) {
                  const value = parseFloat(String(row.data[dimName] ?? '0'));
                  if (!isNaN(value)) {
                    monthRowData[dimName] = (monthRowData[dimName] || 0) + value;
                  }
                }
              });
            });

            finalTableData.push({
              id: `budget-month-${month.key}`,
              name: month.name,
              level: 0,
              data: monthRowData,
              originalDate: month.date,
            });
          } else {
            // No data for this month - create empty row
            const emptyRowData: Record<string, any> = {};
            dimensions.forEach(dim => {
              if (dim.type === 'date') {
                emptyRowData[dim.name] = month.key;
              } else if (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage') {
                emptyRowData[dim.name] = 0;
              } else {
                emptyRowData[dim.name] = '';
              }
            });

            finalTableData.push({
              id: `budget-month-empty-${month.key}`,
              name: month.name,
              level: 0,
              data: emptyRowData,
              originalDate: month.date,
            });
          }
        });
      }

      setTableData(finalTableData);

      // Compute totals
      const calculatedTotalData: Record<string, any> = {};
      if (finalTableData.length > 0 && dimensions.length > 0) {
        finalTableData.forEach((row: BudgetTableRow) => {
          if (row.data) {
            Object.keys(row.data).forEach((dimName: string) => {
              const dim = dimensions.find(d => d.name === dimName);
              if (dim && (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage')) {
                const value = parseFloat(String(row.data[dimName] ?? '0'));
                if (!isNaN(value)) {
                  calculatedTotalData[dimName] = (calculatedTotalData[dimName] || 0) + value;
                }
              }
            });
          }
        });
      }
      setTotalData(calculatedTotalData);

      console.log('[BUDGET-TRACKER] Successfully processed', finalTableData.length, 'rows');

    } catch (error) {
      console.error('[BUDGET-TRACKER] Error loading data:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      setLoadError(errorMessage);
      
      toast({
        title: "Error loading budget data",
        description: `Failed to load budget tracker data: ${errorMessage}`,
        variant: "destructive",
      });
      setTableData([]);
      setTotalData({});
    } finally {
      setIsLoadingData(false);
      onLoadingComplete?.();
    }
  }, [
    reportId,
    reportIds,
    accountId,
    JSON.stringify(breakdownByDimensions),
    JSON.stringify(Array.from(visibleColumns)),
    filters.selectedYear,
    activeDateTab,
    dimensions.length,
    onLoadingComplete,
    vlookupMappings.length,
    yearMonths.length
  ]);

  return {
    tableData,
    totalData,
    isLoadingData,
    loadBudgetTrackerData,
    setIsLoadingData,
    loadError,
    yearMonths,
  };
}
