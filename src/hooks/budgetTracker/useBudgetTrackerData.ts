import { useState, useCallback, useMemo } from "react";
import { format, startOfYear, endOfYear, eachMonthOfInterval, startOfMonth, endOfMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useVlookupMappings } from "@/hooks/useVlookupMappings";
import type { Dimension } from "../performanceTable/usePerformanceTableDimensions";
import type { BudgetTrackerFilterState } from "./useBudgetTrackerFilters";
import { useUser } from "@/lib/auth";
import { fetchPerformanceData } from "../performanceTable/usePerformanceData";
import { useQueryClient } from "@tanstack/react-query";

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
  thenByDimensions: string[];
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
  thenByDimensions,
  visibleColumns,
  filters,
  activeDateTab,
  dimensions,
  onLoadingComplete,
}: UseBudgetTrackerDataOptions) {
  const queryClient = useQueryClient();
  const { data: userData } = useUser();
  const user = userData?.user || null;
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
    
    const monthsAsc = eachMonthOfInterval({ start: yearStart, end: yearEnd }).map(date => ({
      date,
      key: format(date, 'yyyy-MM-dd'),
      name: format(date, 'MMMM yyyy'),
      shortName: format(date, 'MMM'),
    }));
    // Show latest to earliest (e.g., Dec → Jan)
    return monthsAsc.reverse();
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

      // Preload budgets map keyed by item -> YYYY-MM -> value
      const budgetsMap: Record<string, Record<string, number>> = {};
      const breakdownDimId = breakdownByDimensions[0];
      const breakdownDim = breakdownDimId ? dimensions.find(d => d.id === breakdownDimId) : undefined;
      const userId = user?.id || null;

      if (userId && breakdownDim) {
        let q = supabase
          .from('budgets')
          .select('dimension_item, budget_data')
          .eq('user_id', userId)
          .eq('dimension_name', breakdownDim.name);
        if (accountId) q = q.eq('account_id', accountId);
        else if (reportId) q = q.eq('report_id', reportId);
        const { data: budgetRows, error: budgetErr } = await q;
        if (!budgetErr && Array.isArray(budgetRows)) {
          for (const row of budgetRows) {
            const item = String(row.dimension_item || '').trim();
            const bd = row.budget_data || {};
            const itemMap: Record<string, number> = {};
            Object.keys(bd).forEach((k) => {
              if (k.startsWith(String(filters.selectedYear))) {
                const num = parseFloat(String(bd[k]));
                if (!isNaN(num)) itemMap[k] = num;
              }
            });
            budgetsMap[item] = itemMap;
          }
        }
      }

      // Use edge function for optimized, server-side data loading with React Query caching
      const edgeFunctionData = await fetchPerformanceData({
        reportId: reportId || undefined,
        reportIds: reportIds,
        accountId: accountId!,
        groupByDims: groupByDimensions,
        breakdownDims: breakdownByDimensions,
        thenByDims: thenByDimensions,
        visibleDimensionIds: Array.from(visibleColumns),
        dimensionFilters: {},
        dateFrom: dateFromFormatted,
        dateTo: dateToFormatted,
        dateGranularity: activeDateTab === 'year' ? 'year' : 'month',
        dateOrder: 'desc',
        limit: 50000,
        offset: 0
      }, queryClient);
      
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
        // Year view: show single row for the entire year with breakdown children if selected
        const yearRowData: Record<string, any> = {};
        const breakdownDimId2 = breakdownByDimensions[0];
        const thenDimId2 = thenByDimensions[0];
        const breakdownDim2 = breakdownDimId2 ? dimensions.find(d => d.id === breakdownDimId2) : undefined;
        const thenDim2 = thenDimId2 ? dimensions.find(d => d.id === thenDimId2) : undefined;

        // Initialize all dimensions
        dimensions.forEach(dim => {
          if (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage') {
            yearRowData[dim.name] = 0;
          } else if (dim.type === 'date') {
            yearRowData[dim.name] = `${filters.selectedYear}`;
          }
        });

        // Aggregate all months into year totals and collect breakdowns (and then-by)
        const breakdownAggregate: Record<string, Record<string, number>> = {};
        const nestedAggregate: Record<string, Record<string, Record<string, number>>> = {};
        
        dataByMonth.forEach((monthRows, monthKey) => {
          // Add budgets into aggregates per item for this month
          if (breakdownDim2) {
            Object.keys(budgetsMap).forEach((itemName) => {
              const v = budgetsMap[itemName]?.[monthKey.replace(/-\d{2}$/, '')] // no day part; handled below
              // monthKey is yyyy-MM-dd; convert to YYYY-MM
              const ym = monthKey.slice(0, 7);
              const val = budgetsMap[itemName]?.[ym];
              if (val !== undefined) {
                breakdownAggregate[itemName] = breakdownAggregate[itemName] || {};
                breakdownAggregate[itemName]['Budget'] = (breakdownAggregate[itemName]['Budget'] || 0) + val;
                yearRowData['Budget'] = (yearRowData['Budget'] || 0) + val;
              }
            });
          }
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
            if (breakdownDim2) {
              const itemName = String(row.data[breakdownDim2.name] ?? '').trim();
              if (itemName) {
                breakdownAggregate[itemName] = breakdownAggregate[itemName] || {};
                Object.keys(row.data).forEach(dimName => {
                  const dim = dimensions.find(d => d.name === dimName);
                  if (dim && (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage')) {
                    const v = parseFloat(String(row.data[dimName] ?? '0'));
                    if (!isNaN(v)) {
                      breakdownAggregate[itemName][dimName] = (breakdownAggregate[itemName][dimName] || 0) + v;
                    }
                  }
                });
                if (thenDim2) {
                  const thenName = String(row.data[thenDim2.name] ?? '').trim();
                  if (thenName) {
                    nestedAggregate[itemName] = nestedAggregate[itemName] || {};
                    nestedAggregate[itemName][thenName] = nestedAggregate[itemName][thenName] || {};
                    Object.keys(row.data).forEach(dimName => {
                      const dim = dimensions.find(d => d.name === dimName);
                      if (dim && (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage')) {
                        const v = parseFloat(String(row.data[dimName] ?? '0'));
                        if (!isNaN(v)) {
                          nestedAggregate[itemName][thenName][dimName] = (nestedAggregate[itemName][thenName][dimName] || 0) + v;
                        }
                      }
                    });
                  }
                }
              }
            }
          });
        });

        // Build children from breakdown aggregate
        const children: BudgetTableRow[] = [];
        if (breakdownDim2) {
          Object.keys(breakdownAggregate)
            .sort((a, b) => a.localeCompare(b))
            .forEach(itemName => {
              const childId = `year-${filters.selectedYear}-${breakdownDim2.id}-${itemName}`;
              const childData = breakdownAggregate[itemName];
              const child: BudgetTableRow = {
                id: childId,
                name: itemName,
                level: 1,
                parentId: `budget-year-${filters.selectedYear}`,
                data: childData,
              };
              
              if (thenDim2 && nestedAggregate[itemName]) {
                const grandChildren: BudgetTableRow[] = Object.keys(nestedAggregate[itemName])
                  .sort((a, b) => a.localeCompare(b))
                  .map(thenName => ({
                    id: `${childId}-${thenDim2.id}-${thenName}`,
                    name: thenName,
                    level: 2,
                    parentId: childId,
                    data: nestedAggregate[itemName][thenName],
                  }));
                if (grandChildren.length > 0) {
                  child.children = grandChildren;
                }
              }
              
              children.push(child);
            });
        }

        finalTableData.push({
          id: `budget-year-${filters.selectedYear}`,
          name: `${filters.selectedYear}`,
          level: 0,
          data: yearRowData,
          originalDate: `${filters.selectedYear}-01-01`,
          children: children.length > 0 ? children : undefined,
        });
      } else {
        const breakdownDimId = breakdownByDimensions[0];
        const thenDimId = thenByDimensions[0];
        const breakdownDim = breakdownDimId ? dimensions.find(d => d.id === breakdownDimId) : undefined;
        const thenDim = thenDimId ? dimensions.find(d => d.id === thenDimId) : undefined;

        yearMonths.forEach(month => {
          const monthRows = dataByMonth.get(month.key) || [];
          
          const ym = format(month.date, 'yyyy-MM');

          if (monthRows.length > 0) {
            const monthRowData: Record<string, any> = {};
            dimensions.forEach(dim => {
              if (dim.type === 'date') {
                monthRowData[dim.name] = month.key;
              } else if (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage') {
                monthRowData[dim.name] = 0;
              }
            });

            const breakdownAggregate: Record<string, Record<string, number>> = {};
            const nestedAggregate: Record<string, Record<string, Record<string, number>>> = {};

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
              if (breakdownDim) {
                const itemName = String(row.data[breakdownDim.name] ?? '').trim();
                if (itemName) {
                  breakdownAggregate[itemName] = breakdownAggregate[itemName] || {};
                  Object.keys(row.data).forEach(dimName => {
                    const dim = dimensions.find(d => d.name === dimName);
                    if (dim && (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage')) {
                      const v = parseFloat(String(row.data[dimName] ?? '0'));
                      if (!isNaN(v)) {
                        breakdownAggregate[itemName][dimName] = (breakdownAggregate[itemName][dimName] || 0) + v;
                      }
                    }
                  });
                }
              }
            });

            // Inject budgets into breakdown aggregates and sum to month
            if (breakdownDim) {
              Object.keys(budgetsMap).forEach((itemName) => {
                const val = budgetsMap[itemName]?.[ym];
                if (val !== undefined) {
                  breakdownAggregate[itemName] = breakdownAggregate[itemName] || {};
                  breakdownAggregate[itemName]['Budget'] = (breakdownAggregate[itemName]['Budget'] || 0) + val;
                  monthRowData['Budget'] = (monthRowData['Budget'] || 0) + val;
                }
              });
            }

            // Build children rows
            let children: BudgetTableRow[] | undefined = undefined;
            if (breakdownDim && Object.keys(breakdownAggregate).length > 0) {
              children = Object.keys(breakdownAggregate)
                .sort((a, b) => a.localeCompare(b))
                .map(itemName => {
                  const childId = `budget-month-${month.key}-${breakdownDim.id}-${itemName}`;
                  const childData = breakdownAggregate[itemName];
                  const child: BudgetTableRow = {
                    id: childId,
                    name: itemName,
                    level: 1,
                    parentId: `budget-month-${month.key}`,
                    data: childData,
                  };
                  if (thenDim && nestedAggregate[itemName]) {
                    const grandChildren: BudgetTableRow[] = Object.keys(nestedAggregate[itemName])
                      .sort((a, b) => a.localeCompare(b))
                      .map(thenName => ({
                        id: `${childId}-${thenDim.id}-${thenName}`,
                        name: thenName,
                        level: 2,
                        parentId: childId,
                        data: nestedAggregate[itemName][thenName],
                      }));
                    if (grandChildren.length > 0) {
                      child.children = grandChildren;
                    }
                  }
                  return child;
                });
            }

            const monthRow: BudgetTableRow = {
              id: `budget-month-${month.key}`,
              name: month.name,
              level: 0,
              data: monthRowData,
              originalDate: month.date,
              children,
            };

            finalTableData.push(monthRow);
          } else {
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
            // Ensure Budget visible even without data
            emptyRowData['Budget'] = 0;

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

      // Compute totals including Budget
      const calculatedTotalData: Record<string, any> = {};
      if (finalTableData.length > 0 && dimensions.length > 0) {
        finalTableData.forEach((row: BudgetTableRow) => {
          if (row.data) {
            Object.keys(row.data).forEach((dimName: string) => {
              const dim = dimensions.find(d => d.name === dimName) || (dimName === 'Budget' ? { name: 'Budget', type: 'currency' } as any : null);
              if (dim && (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage' || dimName === 'Budget')) {
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
    JSON.stringify(thenByDimensions),
    JSON.stringify(Array.from(visibleColumns)),
    filters.selectedYear,
    activeDateTab,
    dimensions.length,
    onLoadingComplete,
    vlookupMappings.length,
    yearMonths.length,
    queryClient
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