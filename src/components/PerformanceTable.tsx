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
import PerformanceSettingsModal from "./PerformanceSettingsModal";

interface PerformanceTableProps {
  reportId: string | null;
  reportIds?: string[];
  filters: FilterState;
  isSharedView?: boolean;
  accountId?: string;
  visibilityRefreshTrigger?: number;
  onLoadingComplete?: () => void;
  onFiltersChange?: (filters: FilterState) => void;
  isEditMode?: boolean;
}

export const PerformanceTable = ({
  reportId,
  reportIds,
  filters,
  isSharedView = false,
  accountId,
  visibilityRefreshTrigger,
  onLoadingComplete,
  onFiltersChange,
  isEditMode = false,
}: PerformanceTableProps) => {
  // Modal states
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [selectedKPI, setSelectedKPI] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  
  // Date granularity state
  const [activeDateTab, setActiveDateTab] = useState<'day' | 'week' | 'month' | 'year'>('day');
  const [dateOrder, setDateOrder] = useState<'asc' | 'desc'>('desc');
  
  // Tab editing state
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabName, setEditingTabName] = useState("");
  const [accountName, setAccountName] = useState<string | undefined>(undefined);
  // NEW: selector options configured via view settings
  const [selectorDimensions, setSelectorDimensions] = useState<string[]>([]);

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
    isViewInitialized,
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
    saveSelectorDimensions, // NEW
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
    onSelectorDimensionsChange: setSelectorDimensions, // NEW
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
    reportIds,
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

  // Sorting state
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null);

  // Filters hook
  const {
    filteredTableData: baseFilteredTableData,
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
    activeDateTab,
    dateOrder,
  });

  // Apply sorting to filtered data
  const filteredTableData = useMemo(() => {
    if (!sortColumn || !sortDirection) {
      return baseFilteredTableData;
    }

    const sorted = [...baseFilteredTableData];
    const dimension = dimensions.find(d => d.name === sortColumn);
    
    if (!dimension) return sorted;

    sorted.sort((a, b) => {
      const aValue = a.data[sortColumn];
      const bValue = b.data[sortColumn];
      
      // Handle null/undefined values
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;

      // Check if values are numeric
      const aNum = parseFloat(String(aValue));
      const bNum = parseFloat(String(bValue));
      const isNumeric = !isNaN(aNum) && !isNaN(bNum);

      if (isNumeric) {
        // Numeric comparison
        const diff = aNum - bNum;
        return sortDirection === 'asc' ? diff : -diff;
      } else {
        // String comparison
        const aStr = String(aValue).toLowerCase();
        const bStr = String(bValue).toLowerCase();
        const diff = aStr.localeCompare(bStr);
        return sortDirection === 'asc' ? diff : -diff;
      }
    });

    return sorted;
  }, [baseFilteredTableData, sortColumn, sortDirection, dimensions]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, dimensions.length]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibilityRefreshTrigger, reportId]);

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

  // Load performance data when filters change (wait for view initialization)
  useEffect(() => {
    if (reportId && isViewInitialized) {
      console.log('[PERF-TABLE] Loading data - view initialized, dimensions:', {
        groupBy: groupByDimensions,
        breakdown: breakdownByDimensions,
        thenBy: thenByDimensions
      });
      setIsLoadingData(true);
      loadPerformanceData();
    } else if (!reportId) {
      setIsLoadingData(false);
    } else {
      console.log('[PERF-TABLE] Waiting for view initialization before loading data');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportId, isViewInitialized, debouncedFilters, JSON.stringify(groupByDimensions), JSON.stringify(breakdownByDimensions), JSON.stringify(thenByDimensions), dateOrder, activeDateTab, visibilityRefreshTrigger]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(groupByDimensions), JSON.stringify(breakdownByDimensions), JSON.stringify(thenByDimensions), JSON.stringify(Array.from(visibleColumns)), JSON.stringify(columnOrder), activeDateTab, dateOrder, reportId, activeViewId]);

  // Handle dimension change (from dropdown - preserves custom dimensions)
  const handleDimensionChange = useCallback((value: string, selector: "group" | "breakdown" | "then") => {
    // Build target selections based on current picker change
    const currentGroup = groupByDimensions[0];
    const currentBreakdown = breakdownByDimensions[0];
    const currentThen = thenByDimensions[0];

    const targetGroup = selector === "group" ? value : currentGroup;
    const targetBreakdown = selector === "breakdown" ? value : currentBreakdown;
    const targetThen = selector === "then" ? value : currentThen;

    // Compose new ordered list for grouping: [group, breakdown, then] (unique, preserve extras)
    const ordered: string[] = [];
    const pushUnique = (id?: string) => {
      if (id && !ordered.includes(id)) ordered.push(id);
    };

    pushUnique(targetGroup);
    pushUnique(targetBreakdown);
    pushUnique(targetThen);

    // Preserve any additional dimensions already selected after the first three
    groupByDimensions.forEach((id) => pushUnique(id));

    // Update states to reflect consistent selections
    setGroupByDimensions(ordered);
    setBreakdownByDimensions(targetBreakdown ? [targetBreakdown] : []);
    setThenByDimensions(targetThen ? [targetThen] : []);
  }, [groupByDimensions, breakdownByDimensions, thenByDimensions]);

  // Auto-fix: Ensure all three dimensions are different
  useEffect(() => {
    const groupValue = groupByDimensions[0];
    const breakdownValue = breakdownByDimensions[0];
    const thenValue = thenByDimensions[0];
    
    // Check if all three are the same
    if (groupValue && breakdownValue && thenValue && 
        groupValue === breakdownValue && breakdownValue === thenValue) {
      console.warn('[testing] All three dimensions are the same, fixing...');
      
      // If we have at least 2 dimensions available, fix it
      if (groupByDimensions.length >= 2) {
        // Find a different dimension for breakdown by
        const alternative = groupByDimensions.find(d => d !== groupValue);
        if (alternative) {
          setBreakdownByDimensions([alternative]);
        }
      } else if (groupByDimensions.length >= 3) {
        // If we have 3+ dimensions, set breakdown and then to different ones
        const alternatives = groupByDimensions.filter(d => d !== groupValue);
        if (alternatives.length >= 1) {
          setBreakdownByDimensions([alternatives[0]]);
        }
        if (alternatives.length >= 2) {
          setThenByDimensions([alternatives[1]]);
        }
      }
    }
    // Also check if two are the same (but not all three)
    else if (groupValue && breakdownValue && groupValue === breakdownValue && groupValue !== thenValue) {
      // Group and breakdown are same but then is different - this is okay for now
      // But we should still try to make them different if possible
      if (groupByDimensions.length >= 2) {
        const alternative = groupByDimensions.find(d => d !== groupValue && d !== thenValue);
        if (alternative) {
          setBreakdownByDimensions([alternative]);
        }
      }
    }
    else if (groupValue && thenValue && groupValue === thenValue && groupValue !== breakdownValue) {
      // Group and then are same but breakdown is different
      if (groupByDimensions.length >= 2) {
        const alternative = groupByDimensions.find(d => d !== groupValue && d !== breakdownValue);
        if (alternative) {
          setThenByDimensions([alternative]);
        }
      }
    }
    else if (breakdownValue && thenValue && breakdownValue === thenValue && breakdownValue !== groupValue) {
      // Breakdown and then are same but group is different
      if (groupByDimensions.length >= 2) {
        const alternative = groupByDimensions.find(d => d !== breakdownValue && d !== groupValue);
        if (alternative) {
          setThenByDimensions([alternative]);
        }
      }
    }
  }, [groupByDimensions, breakdownByDimensions, thenByDimensions]);

  // Handle date tab change with auto-save
  const handleDateTabChange = useCallback((newDateTab: 'day' | 'week' | 'month' | 'year') => {
    setActiveDateTab(newDateTab);
    
    // Save the updated date granularity to the view
    saveViewSettings(
      groupByDimensions,
      breakdownByDimensions,
      thenByDimensions,
      visibleColumns,
      columnOrder,
      newDateTab,
      dateOrder
    );
  }, [groupByDimensions, breakdownByDimensions, thenByDimensions, visibleColumns, columnOrder, dateOrder, saveViewSettings]);

  // NEW: Save selections from settings modal (only selector list; does not change group/breakdown/then)
  const handleSettingsSave = useCallback((selected: string[]) => {
    setSelectorDimensions(selected);
    // Persist to the active view
    saveSelectorDimensions(selected);
  }, [saveSelectorDimensions]);

  // Handle context menu for filters
  const handleContextMenu = useCallback((e: React.MouseEvent, kpi: string) => {
    e.preventDefault();
    setSelectedKPI(kpi);
    setFilterModalOpen(true);
  }, []);

  // Handle column sort
  const handleSort = useCallback((dimensionName: string) => {
    if (sortColumn === dimensionName) {
      // Toggle direction: desc -> asc (highest -> lowest)
      if (sortDirection === 'desc') {
        setSortDirection('asc');
      } else {
        // If already asc, go back to desc
        setSortDirection('desc');
      }
    } else {
      // New column: start with desc (highest first)
      setSortColumn(dimensionName);
      setSortDirection('desc');
    }
  }, [sortColumn, sortDirection]);

  // Handle reset sort
  const handleResetSort = useCallback(() => {
    setSortColumn(null);
    setSortDirection(null);
  }, []);

  // Handle row click to apply filters, especially for "Then by" rows
  const handleRowClick = useCallback((row: { level: number; name: string }) => {
    if (!onFiltersChange) return;
    
    // Determine which dimension this row represents based on its level
    let dimId: string | undefined;
    if (row.level === 0) {
      dimId = groupByDimensions[0];
    } else if (row.level === 1) {
      dimId = breakdownByDimensions[0];
    } else if (row.level === 2) {
      dimId = thenByDimensions[0];
    }
    
    if (!dimId) return;
    
    // Get the dimension to find its name
    const dimension = dimensions.find(d => d.id === dimId);
    if (!dimension) return;
    
    // Apply filter for this dimension with the row's name as the value
    const currentFilters = filters.dimensionFilters || {};
    const existingValues = currentFilters[dimId] || [];
    
    // Toggle the filter: if already filtered, remove it; otherwise add it
    const newValues = existingValues.includes(row.name)
      ? existingValues.filter((v: string) => v !== row.name)
      : [...existingValues, row.name];
    
    onFiltersChange({
      ...filters,
      dimensionFilters: {
        ...currentFilters,
        [dimId]: newValues.length > 0 ? newValues : undefined,
      },
    });
  }, [onFiltersChange, filters, groupByDimensions, breakdownByDimensions, thenByDimensions, dimensions]);


  return (
    <>
      <Card className="shadow-sm">
        <CardHeader className="pb-3 border-b">
          <TableHeader
            activeDateTab={activeDateTab}
            onDateTabChange={handleDateTabChange}
            groupByDimensions={groupByDimensions}
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
            onOpenSettings={() => setSettingsOpen(true)}
            availableSelectorDimensions={selectorDimensions} // NEW: restrict dropdowns to configured list
          />
        </CardHeader>
        <CardContent className="pt-6">
          {groupByDimensions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {isLoadingDimensions ? (
                "Loading dimensions..."
              ) : hasDataSources ? (
                isEditMode ? "Right-click on 'Group by' to select dimensions" : "No dimensions selected"
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
              onRowClick={handleRowClick}
              sortColumn={sortColumn}
              sortDirection={sortDirection}
              onSort={handleSort}
              onResetSort={handleResetSort}
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

      <PerformanceSettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        dimensions={dimensions}
        groupBy={groupByDimensions}
        breakdownBy={breakdownByDimensions}
        thenBy={thenByDimensions}
        selectedDimensionIds={selectorDimensions}
        isEditMode={isEditMode}
        onSave={handleSettingsSave}
      />
    </>
  );
};