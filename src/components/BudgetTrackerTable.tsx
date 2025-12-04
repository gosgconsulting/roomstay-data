import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState, useEffect, useMemo, useCallback } from "react";
import { YearRangeFilter } from "./filters";
import { TableBody } from "./PerformanceTable/TableBody";
import { TableSkeleton } from "./PerformanceTable/TableSkeleton";
import { usePerformanceTableDimensions } from "@/hooks/performanceTable/usePerformanceTableDimensions";
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

  // Data source state
  const [hasDataSources, setHasDataSources] = useState<boolean>(false);

  // Initialize column order callback
  const handleColumnOrderInit = useCallback((order: string[]) => {
    // Not used in simplified version
  }, []);

  // Load dimensions hook (reuse from PerformanceTable)
  const {
    dimensions,
    dimensionHasData,
    isLoadingDimensions,
  } = usePerformanceTableDimensions({
    reportId,
    accountId,
    onColumnOrderInit: handleColumnOrderInit,
  });

  // Budget tracker filters hook
  const {
    filterState,
    selectedYear,
    yearDateRange,
    handleYearChange,
  } = useBudgetTrackerFilters({
    reportId: reportId || undefined,
    accountId,
  });

  // Hardcoded: always show Cost column only
  const visibleColumns = useMemo(() => {
    const costDim = dimensions.find(d => d.name.toLowerCase() === 'cost');
    return costDim ? new Set([costDim.id]) : new Set<string>();
  }, [dimensions]);

  // Helper to get ordered dimensions (just return cost dimension)
  const getOrderedDimensions = useCallback(() => {
    const costDim = dimensions.find(d => d.name.toLowerCase() === 'cost');
    return costDim ? [costDim] : [];
  }, [dimensions]);

  // Budget tracker data hook - no breakdown dimensions
  const {
    tableData,
    totalData,
    isLoadingData,
    loadBudgetTrackerData,
    setIsLoadingData,
    loadError,
  } = useBudgetTrackerData({
    reportId,
    reportIds,
    accountId,
    breakdownByDimensions: [], // Hardcoded: no breakdown
    thenByDimensions: [], // Hardcoded: no then-by
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
        setHasDataSources(hasData.hasDataSources);
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
  }, [reportId, selectedYear, activeDateTab, dimensions.length, visibilityRefreshTrigger]);

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

  // Create totals for table display
  const totals = useMemo(() => {
    return totalData;
  }, [totalData]);

  // No additional filtering for budget tracker - show all data
  const filteredTableData = useMemo(() => {
    return tableData;
  }, [tableData]);

  return (
    <Card className="shadow-sm mt-6">
      <CardHeader className="pb-3 border-b">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold">Budget Tracker</h3>
            <p className="text-sm text-muted-foreground">
              Track cost data by month and year
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
            breakdownByDimensions={[]}
            thenByDimensions={[]}
            activeDateTab={activeDateTab as any}
            filters={{} as any}
            onContextMenu={() => {}}
            onRowClick={() => {}}
            sortColumn={null}
            sortDirection={null}
            onSort={() => {}}
            onResetSort={() => {}}
            showBudgetColumn={true}
            isEditMode={isEditMode}
            reportId={reportId}
            accountId={accountId}
          />
        )}
      </CardContent>
    </Card>
  );
};
