import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { YearRangeFilter } from "./filters";
import { BudgetTrackerHeader } from "./BudgetTrackerTable/BudgetTrackerHeader";
import { TableBody } from "./PerformanceTable/TableBody";
import { TableSkeleton } from "./PerformanceTable/TableSkeleton";
import { usePerformanceTableDimensions } from "@/hooks/performanceTable/usePerformanceTableDimensions";
import { usePerformanceTableColumns } from "@/hooks/performanceTable/usePerformanceTableColumns";
import { useBudgetTrackerData } from "@/hooks/budgetTracker/useBudgetTrackerData";
import { useBudgetTrackerFilters } from "@/hooks/budgetTracker/useBudgetTrackerFilters";
import { checkDataSources } from "@/lib/performanceTable/dataSourceUtils";

interface BudgetTrackerTableProps {
  reportId: string | null;
  reportIds?: string[];
  isSharedView?: boolean;
  accountId?: string;
  visibilityRefreshTrigger?: number;
  onLoadingComplete?: () => void;
  isEditMode?: boolean;
}

export const BudgetTrackerTable = ({
  reportId,
  reportIds,
  isSharedView = false,
  accountId,
  visibilityRefreshTrigger,
  onLoadingComplete,
  isEditMode = false,
}: BudgetTrackerTableProps) => {
  // Date granularity state (Month/Year tabs)
  const [activeDateTab, setActiveDateTab] = useState<'month' | 'year'>('month');
  const [accountName, setAccountName] = useState<string | undefined>(undefined);
  
  // Data source state
  const [hasDataSources, setHasDataSources] = useState<boolean>(false);

  // Load account name when accountId changes
  useEffect(() => {
    const loadAccountName = async () => {
      if (!accountId) {
        setAccountName(undefined);
        return;
      }
      
      try {
        const { data, error } = await supabase
          .from('accounts')
          .select('name')
          .eq('id', accountId)
          .single();
        
        if (!error && data) {
          setAccountName(data.name);
        }
      } catch (error) {
        console.error('Error loading account name:', error);
      }
    };
    
    loadAccountName();
  }, [accountId]);

  // Initialize column order callback
  const handleColumnOrderInit = useCallback((order: string[]) => {
    // This will be handled by the columns hook
  }, []);

  // Load dimensions hook (reuse from PerformanceTable)
  const {
    dimensions,
    dimensionHasData,
    isLoadingDimensions,
    loadDimensions,
  } = usePerformanceTableDimensions({
    reportId,
    accountId,
    onColumnOrderInit: handleColumnOrderInit,
  });

  // Budget tracker filters hook
  const {
    filterState,
    selectedYear,
    breakdownByDimensions,
    yearDateRange,
    handleYearChange,
    handleBreakdownDimensionChange,
    resetFilters,
  } = useBudgetTrackerFilters({
    reportId: reportId || undefined,
    accountId,
  });

  // Column management hook (reuse from PerformanceTable)
  const {
    visibleColumns,
    initialVisibleColumns,
    columnOrder,
    initialColumnOrder,
    isSavingColumnSettings,
    setVisibleColumns,
    setInitialVisibleColumns,
    setColumnOrder,
    setInitialColumnOrder,
    toggleColumn,
    applyColumnSettings,
    cancelColumnSettings,
    hasUnsavedColumnChanges,
    getOrderedDimensions,
    handleColumnReorder,
  } = usePerformanceTableColumns({
    reportId,
    activeViewId: null, // Budget tracker doesn't use views
    isSharedView,
    dimensions,
  });

  // Budget tracker data hook
  const {
    tableData,
    totalData,
    isLoadingData,
    loadBudgetTrackerData,
    setIsLoadingData,
    loadError,
    yearMonths,
  } = useBudgetTrackerData({
    reportId,
    reportIds,
    accountId,
    breakdownByDimensions,
    visibleColumns,
    filters: filterState,
    activeDateTab,
    dimensions,
    onLoadingComplete,
  });

  // Check for data sources
  useEffect(() => {
    const checkSources = async () => {
      if (reportId) {
        const hasData = await checkDataSources(reportId);
        setHasDataSources(hasData);
      }
    };
    checkSources();
  }, [reportId]);

  // Load data when dependencies change
  useEffect(() => {
    if (reportId && dimensions.length > 0) {
      setIsLoadingData(true);
      loadBudgetTrackerData();
    } else {
      setIsLoadingData(false);
    }
  }, [reportId, selectedYear, JSON.stringify(breakdownByDimensions), activeDateTab, dimensions.length, visibilityRefreshTrigger]);

  // Always group by Date (mandatory for budget tracker)
  const groupByDimensions = useMemo(() => {
    const dateId = dimensions.find(d => d.type === 'date')?.id;
    return dateId ? [dateId] : [];
  }, [dimensions]);

  // Handle date tab change
  const handleDateTabChange = useCallback((tab: string) => {
    if (tab === 'month' || tab === 'year') {
      console.log('[BUDGET-TRACKER] Date tab changed to:', tab);
      setActiveDateTab(tab);
    }
  }, []);

  // Handle breakdown dimension change
  const handleDimensionChange = useCallback((value: string, type: string) => {
    if (type === "breakdown") {
      console.log('[BUDGET-TRACKER] Breakdown dimension changed:', value);
      handleBreakdownDimensionChange([value]);
    }
    // Group by is always Date and cannot be changed
    // Then by is not supported in budget tracker
  }, [handleBreakdownDimensionChange]);

  // Create mock totals for table display
  const totals = useMemo(() => {
    return totalData;
  }, [totalData]);

  // No filtering for budget tracker - show all data
  const filteredTableData = useMemo(() => {
    return tableData;
  }, [tableData]);

  return (
    <>
      <Card className="shadow-sm mt-6">
        <CardHeader className="pb-3 border-b">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold">Budget Tracker</h3>
              <p className="text-sm text-muted-foreground">
                Track performance data by month and year with full year visibility
              </p>
            </div>
            
            {/* Year Filter */}
            <YearRangeFilter
              selectedYear={selectedYear}
              onYearChange={handleYearChange}
            />
          </div>

          {/* Month/Year Tabs */}
          <Tabs value={activeDateTab} onValueChange={handleDateTabChange} className="mb-4">
            <TabsList>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="year">Year</TabsTrigger>
            </TabsList>
          </Tabs>
          
          <BudgetTrackerHeader
            breakdownByDimensions={breakdownByDimensions}
            dimensions={dimensions}
            dimensionHasData={dimensionHasData}
            reportId={reportId}
            isSharedView={isSharedView}
            isEditMode={isEditMode}
            onDimensionChange={handleDimensionChange}
            visibleColumns={visibleColumns}
            getOrderedDimensions={getOrderedDimensions}
            onToggleColumn={toggleColumn}
            onColumnReorder={handleColumnReorder}
            hasUnsavedColumnChanges={hasUnsavedColumnChanges()}
            isSavingColumnSettings={isSavingColumnSettings}
            onApplyColumnSettings={applyColumnSettings}
            onCancelColumnSettings={cancelColumnSettings}
            onRefreshDimensions={loadDimensions}
          />
        </CardHeader>
        <CardContent className="pt-6">
          {groupByDimensions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {isLoadingDimensions ? (
                "Loading dimensions..."
              ) : hasDataSources ? (
                "No date dimension found. Budget tracker requires a date dimension."
              ) : (
                "No data sources found. Please add a data source to this report."
              )}
            </div>
          ) : isLoadingData || isLoadingDimensions ? (
            <TableSkeleton />
          ) : loadError ? (
            <div className="text-center py-8 text-destructive">
              <p>Error loading budget data: {loadError}</p>
            </div>
          ) : (
            <TableBody
              filteredTableData={filteredTableData}
              dimensions={dimensions}
              visibleColumns={visibleColumns}
              getOrderedDimensions={getOrderedDimensions}
              totals={totals}
              groupByDimensions={groupByDimensions}
              breakdownByDimensions={breakdownByDimensions}
              thenByDimensions={[]}
              activeDateTab={activeDateTab as any} // Cast to match expected type
              filters={{} as any} // No filters for budget tracker
              onContextMenu={() => {}} // No context menu
              onRowClick={() => {}} // No row click handling
              sortColumn={null}
              sortDirection={null}
              onSort={() => {}} // No sorting
              onResetSort={() => {}} // No sorting
            />
          )}
        </CardContent>
      </Card>
    </>
  );
};
