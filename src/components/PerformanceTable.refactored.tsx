import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { useState, useEffect, useMemo, useCallback } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { FilterState } from "./FiltersBar";
import { ColumnFilterModal } from "./ColumnFilterModal";
import { TableHeader } from "./PerformanceTable/TableHeader";
import { TableBody } from "./PerformanceTable/TableBody";
import { TableSkeleton } from "./PerformanceTable/TableSkeleton";
import { usePerformanceTableDimensions } from "@/hooks/performanceTable/usePerformanceTableDimensions";
import { usePerformanceTableViews } from "@/hooks/performanceTable/usePerformanceTableViews";
import { usePerformanceTableColumns } from "@/hooks/performanceTable/usePerformanceTableColumns";
import { usePerformanceTableData } from "@/hooks/performanceTable/usePerformanceTableData";
import { usePerformanceTableFilters } from "@/hooks/performanceTable/usePerformanceTableFilters";
import { checkDataSources } from "@/lib/performanceTable/dataSourceUtils";

interface PerformanceTableProps {
  reportId: string | null;
  filters: FilterState;
  isSharedView?: boolean;
  accountId?: string;
  visibilityRefreshTrigger?: number;
  onLoadingComplete?: () => void;
  onFiltersChange?: (filters: FilterState) => void;
}

export const PerformanceTable = ({
  reportId,
  filters,
  isSharedView = false,
  accountId,
  visibilityRefreshTrigger,
  onLoadingComplete,
  onFiltersChange,
}: PerformanceTableProps) => {
  // Modal states
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [selectedKPI, setSelectedKPI] = useState("");
  
  // Date granularity state
  const [activeDateTab, setActiveDateTab] = useState<'day' | 'week' | 'month' | 'year'>('day');
  const [dateOrder, setDateOrder] = useState<'asc' | 'desc'>('desc');
  
  // Tab editing state
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabName, setEditingTabName] = useState("");
  const [accountName, setAccountName] = useState<string | undefined>(undefined);
  
  // Data source state
  const [hasDataSources, setHasDataSources] = useState<boolean>(false);
  const [hasCSVSource, setHasCSVSource] = useState<boolean>(false);

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

  // Dimension selection state
  const [groupByDimensions, setGroupByDimensions] = useState<string[]>([]);
  const [breakdownByDimensions, setBreakdownByDimensions] = useState<string[]>([]);
  const [thenByDimensions, setThenByDimensions] = useState<string[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  // Initialize column order callback
  const handleColumnOrderInit = useCallback((order: string[]) => {
    // This will be handled by the columns hook
  }, []);

  // Load dimensions hook
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

  // Column management hook
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
    activeViewId,
    isSharedView,
    dimensions,
  });

  // Views management hook
  const {
    tableViews,
    activeViewId: viewsActiveViewId,
    setTableViews,
    setActiveViewId: setViewsActiveViewId,
    loadAllViews,
    createDefaultViews,
    loadViewSettings,
    loadViewSettingsFromData,
    saveViewSettings,
    handleViewChange,
    handleDeleteView,
    handleTabNameSave,
  } = usePerformanceTableViews({
    reportId,
    isSharedView,
    accountName,
    dimensions,
    onGroupByChange: setGroupByDimensions,
    onBreakdownByChange: setBreakdownByDimensions,
    onThenByChange: setThenByDimensions,
    onVisibleColumnsChange: setVisibleColumns,
    onInitialVisibleColumnsChange: setInitialVisibleColumns,
    onColumnOrderChange: setColumnOrder,
    onInitialColumnOrderChange: setInitialColumnOrder,
    onDateGranularityChange: setActiveDateTab,
    onDateOrderChange: setDateOrder,
  });

  // Sync activeViewId from views hook
  useEffect(() => {
    setActiveViewId(viewsActiveViewId);
  }, [viewsActiveViewId]);

  // Data loading hook
  const {
    tableData,
    totalData,
    totalCompareData,
    totalChangeData,
    isLoadingData,
    loadPerformanceData,
    setIsLoadingData,
  } = usePerformanceTableData({
    reportId,
    accountId,
    groupByDimensions,
    breakdownByDimensions,
    thenByDimensions,
    visibleColumns,
    filters,
    activeDateTab,
    dateOrder,
    dimensions,
    onLoadingComplete,
  });

  // Filters hook
  const {
    filteredTableData,
    totals,
    compareTotals,
    changeData,
  } = usePerformanceTableFilters({
    tableData,
    filters,
    dimensions,
    groupByDimensions,
    totalData,
    reportId: reportId || undefined,
    accountId,
  });

  // Load dimensions and check data sources when reportId changes
  useEffect(() => {
    if (reportId) {
      loadDimensions();
      checkDataSources(reportId).then(({ hasDataSources, hasCSVSource }) => {
        setHasDataSources(hasDataSources);
        setHasCSVSource(hasCSVSource);
      });
    }
  }, [reportId, loadDimensions]);

  // Reset table state when report changes
  useEffect(() => {
    if (reportId) {
      setTableViews([]);
      setViewsActiveViewId(null);
      setGroupByDimensions([]);
      setBreakdownByDimensions([]);
      setThenByDimensions([]);
      setVisibleColumns(new Set());
      setColumnOrder([]);
      setHasDataSources(false);
    }
  }, [reportId, setTableViews, setViewsActiveViewId, setVisibleColumns, setColumnOrder]);

  // Load views when dimensions are loaded
  useEffect(() => {
    if (reportId && dimensions.length > 0) {
      loadAllViews();
      checkDataSources(reportId).then(({ hasDataSources, hasCSVSource }) => {
        setHasDataSources(hasDataSources);
        setHasCSVSource(hasCSVSource);
      });
    }
  }, [reportId, dimensions.length, loadAllViews]);

  // Re-check data sources when refresh is triggered
  useEffect(() => {
    if (reportId && visibilityRefreshTrigger && visibilityRefreshTrigger > 0) {
      console.log('[testing] Re-checking data sources after refresh trigger');
      checkDataSources(reportId).then(({ hasDataSources, hasCSVSource }) => {
        setHasDataSources(hasDataSources);
        setHasCSVSource(hasCSVSource);
      });
    }
  }, [visibilityRefreshTrigger, reportId]);

  // Refresh view settings when dimension visibility changes
  useEffect(() => {
    if (reportId && visibilityRefreshTrigger && visibilityRefreshTrigger > 0) {
      console.log('[testing] Refreshing view settings due to dimension visibility change');
      loadAllViews();
    }
  }, [visibilityRefreshTrigger, reportId, loadAllViews]);

  // Create a stable reference for filters
  const debouncedFilters = useMemo(() => {
    return {
      dimensionFilters: filters.dimensionFilters,
      dateRange: filters.dateRange,
      datePreset: filters.datePreset,
      compareEnabled: filters.compareEnabled,
      compareType: filters.compareType,
      compareDateRange: filters.compareDateRange,
    };
  }, [
    JSON.stringify(filters.dimensionFilters),
    filters.dateRange?.from?.toISOString(),
    filters.dateRange?.to?.toISOString(),
    filters.datePreset,
    filters.compareEnabled,
    filters.compareType,
    filters.compareDateRange?.from?.toISOString(),
    filters.compareDateRange?.to?.toISOString(),
  ]);

  // Load performance data when filters change
  useEffect(() => {
    if (reportId) {
      setIsLoadingData(true);
      loadPerformanceData();
    } else {
      setIsLoadingData(false);
    }
  }, [reportId, debouncedFilters, groupByDimensions, breakdownByDimensions, thenByDimensions, dateOrder, activeDateTab, visibilityRefreshTrigger, loadPerformanceData, setIsLoadingData]);

  // Save view settings whenever they change (with debounce)
  useEffect(() => {
    if (reportId && dimensions.length > 0 && activeViewId) {
      const timeoutId = setTimeout(() => {
        saveViewSettings(
          groupByDimensions,
          breakdownByDimensions,
          thenByDimensions,
          visibleColumns,
          columnOrder,
          activeDateTab,
          dateOrder
        );
      }, 500);
      
      return () => clearTimeout(timeoutId);
    }
  }, [groupByDimensions, breakdownByDimensions, thenByDimensions, visibleColumns, columnOrder, activeDateTab, dateOrder, reportId, activeViewId, saveViewSettings]);

  // Handle dimension change
  const handleDimensionChange = useCallback((value: string, selector: "group" | "breakdown" | "then") => {
    if (selector === "group") {
      setGroupByDimensions([value]);
    } else if (selector === "breakdown") {
      setBreakdownByDimensions([value]);
    } else if (selector === "then") {
      setThenByDimensions([value]);
    }
  }, []);

  // Handle context menu for filters
  const handleContextMenu = useCallback((e: React.MouseEvent, kpi: string) => {
    e.preventDefault();
    setSelectedKPI(kpi);
    setFilterModalOpen(true);
  }, []);


  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <TableHeader
            activeDateTab={activeDateTab}
            onDateTabChange={setActiveDateTab}
            groupByDimensions={groupByDimensions}
            breakdownByDimensions={breakdownByDimensions}
            thenByDimensions={thenByDimensions}
            dimensions={dimensions}
            dimensionHasData={dimensionHasData}
            reportId={reportId}
            isSharedView={isSharedView}
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
        <CardContent>
          {groupByDimensions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {isLoadingDimensions ? (
                "Loading dimensions..."
              ) : hasDataSources ? (
                "Right-click on 'Group by' to select dimensions"
              ) : (
                "No data sources found. Please add a data source to this report."
              )}
            </div>
          ) : isLoadingData || isLoadingDimensions ? (
            <TableSkeleton />
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
              activeDateTab={activeDateTab}
              filters={filters}
              onContextMenu={handleContextMenu}
            />
          )}
        </CardContent>
      </Card>

      <ColumnFilterModal
        open={filterModalOpen}
        onOpenChange={setFilterModalOpen}
        columnName={selectedKPI}
        dimension={
          selectedKPI === "name" && groupByDimensions[0]
            ? dimensions.find(d => d.id === groupByDimensions[0])
            : dimensions.find(d => d.name === selectedKPI)
        }
        currentFilters={filters}
        onFiltersChange={onFiltersChange}
        tableData={tableData}
      />
    </>
  );
};