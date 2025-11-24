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
import PerformanceSettingsModal from "./PerformanceSettingsModal";

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
  
  // Settings modal + selector config
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectorDimensions, setSelectorDimensions] = useState<string[]>([]);
  // NEW: Budget Tracker view id for persistence
  const [budgetViewId, setBudgetViewId] = useState<string | null>(null);

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
    thenByDimensions,
    yearDateRange,
    handleYearChange,
    handleBreakdownDimensionChange,
    handleThenByDimensionChange,
    resetFilters,
  } = useBudgetTrackerFilters({
    reportId: reportId || undefined,
    accountId,
  });

  // Load or create dedicated Budget Tracker view for this user/report
  useEffect(() => {
    const initBudgetView = async () => {
      if (!reportId) {
        setBudgetViewId(null);
        return;
      }
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData?.user) {
        console.warn('[BUDGET-TRACKER] No authenticated user, skipping view init');
        setBudgetViewId(null);
        return;
      }
      const userId = userData.user.id;

      const { data: existingViews, error: loadErr } = await supabase
        .from('report_views')
        .select('*')
        .eq('report_id', reportId)
        .eq('user_id', userId)
        .eq('name', 'Budget Tracker')
        .limit(1);

      if (loadErr) {
        console.error('[BUDGET-TRACKER] Error loading Budget Tracker view:', loadErr);
        return;
      }

      if (existingViews && existingViews.length > 0) {
        const view = existingViews[0] as any;
        setBudgetViewId(view.id);

        // Initialize local state from saved settings
        const savedVisible = Array.isArray(view.visible_columns) ? view.visible_columns : [];
        const savedOrder = Array.isArray(view.column_order) ? view.column_order : [];
        setVisibleColumns(new Set(savedVisible));
        setInitialVisibleColumns(new Set(savedVisible));
        setColumnOrder(savedOrder);
        setInitialColumnOrder(savedOrder);

        const savedSelectorDims = Array.isArray(view.visible_dimensions) ? view.visible_dimensions : [];
        setSelectorDimensions(savedSelectorDims);

        const savedBreakdown = Array.isArray(view.breakdown_by_dimensions) ? view.breakdown_by_dimensions : [];
        const savedThenBy = Array.isArray(view.then_by_dimensions) ? view.then_by_dimensions : [];
        if (savedBreakdown.length > 0) handleBreakdownDimensionChange(savedBreakdown);
        if (savedThenBy.length > 0) handleThenByDimensionChange(savedThenBy);

        console.log('[BUDGET-TRACKER] Initialized from existing view');
      } else {
        // Create a new dedicated Budget Tracker view
        const { data: inserted, error: insertErr } = await supabase
          .from('report_views')
          .insert({
            report_id: reportId,
            user_id: userId,
            name: 'Budget Tracker',
            is_default: false,
            visible_columns: [],
            column_order: [],
            breakdown_by_dimensions: [],
            then_by_dimensions: [],
            visible_dimensions: [],
            date_order: 'asc',
          })
          .select('id')
          .single();

        if (insertErr) {
          console.error('[BUDGET-TRACKER] Error creating Budget Tracker view:', insertErr);
          return;
        }
        setBudgetViewId(inserted.id);
        console.log('[BUDGET-TRACKER] Created new Budget Tracker view');
      }
    };

    initBudgetView();
  }, [reportId]);

  // Column management hook: use Budget Tracker view id for persistence
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
    activeViewId: budgetViewId, // was null; now persist to budget view
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
    thenByDimensions,
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
        setHasDataSources(hasData.hasDataSources); // use boolean field from result
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
  }, [reportId, selectedYear, JSON.stringify(breakdownByDimensions), JSON.stringify(thenByDimensions), activeDateTab, dimensions.length, visibilityRefreshTrigger]);

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

  // Handle dimension change (persist breakdown/then-by in edit mode)
  const handleDimensionChange = useCallback(
    async (value: string, type: "breakdown" | "then") => {
      if (type === "breakdown") {
        console.log('[BUDGET-TRACKER] Breakdown dimension changed:', value);
        handleBreakdownDimensionChange([value]);
        if (isEditMode && budgetViewId) {
          const { error } = await supabase
            .from('report_views')
            .update({ breakdown_by_dimensions: [value] })
            .eq('id', budgetViewId);
          if (!error) {
            toast({ title: "Saved", description: "Breakdown setting updated" });
          } else {
            console.error('[BUDGET-TRACKER] Failed to save breakdown:', error);
          }
        }
      } else if (type === "then") {
        console.log('[BUDGET-TRACKER] Then-by dimension changed:', value);
        handleThenByDimensionChange([value]);
        if (isEditMode && budgetViewId) {
          const { error } = await supabase
            .from('report_views')
            .update({ then_by_dimensions: [value] })
            .eq('id', budgetViewId);
          if (!error) {
            toast({ title: "Saved", description: "Then-by setting updated" });
          } else {
            console.error('[BUDGET-TRACKER] Failed to save then-by:', error);
          }
        }
      }
    },
    [handleBreakdownDimensionChange, handleThenByDimensionChange, isEditMode, budgetViewId]
  );

  // Create totals for table display
  const totals = useMemo(() => {
    return totalData;
  }, [totalData]);

  // No additional filtering for budget tracker - show all data
  const filteredTableData = useMemo(() => {
    return tableData;
  }, [tableData]);

  // Settings modal save handler: persist selector dimensions to view
  const handleSettingsSave = useCallback(
    async (selected: string[]) => {
      setSelectorDimensions(selected);
      setSettingsOpen(false);

      if (budgetViewId) {
        const { error } = await supabase
          .from('report_views')
          .update({ visible_dimensions: selected })
          .eq('id', budgetViewId);

        if (error) {
          console.error('[BUDGET-TRACKER] Failed to save selector dimensions:', error);
          toast({
            title: "Error",
            description: "Failed to save filter settings",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Settings saved",
            description: "Breakdown/Then-by dropdowns updated",
          });
        }
      } else {
        toast({
          title: "Settings saved",
          description: "Breakdown/Then-by dropdowns updated",
        });
      }
    },
    [budgetViewId]
  );

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
            thenByDimensions={thenByDimensions}
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
            availableSelectorDimensions={selectorDimensions}
            onOpenSettings={() => setSettingsOpen(true)}
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
              thenByDimensions={thenByDimensions}
              activeDateTab={activeDateTab as any} // Cast to match expected type
              filters={{} as any} // No filters for budget tracker
              onContextMenu={() => {}} // No context menu
              onRowClick={() => {}} // No row click handling
              sortColumn={null}
              sortDirection={null}
              onSort={() => {}} // No sorting
              onResetSort={() => {}} // No sorting
              showBudgetColumn={true}
              isEditMode={isEditMode}
              reportId={reportId}
              accountId={accountId}
            />
          )}
        </CardContent>
      </Card>

      {/* Settings modal for configuring selector dimensions */}
      <PerformanceSettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        dimensions={dimensions}
        groupBy={groupByDimensions}
        breakdownBy={breakdownByDimensions}
        thenBy={thenByDimensions}
        selectedDimensionIds={selectorDimensions}
        onSave={handleSettingsSave}
        reportId={reportId || undefined}
        accountId={accountId}
      />
    </>
  );
};