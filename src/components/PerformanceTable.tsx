import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
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
import { usePerformanceTableDataFixed } from "@/hooks/performanceTable/usePerformanceTableDataFixed";
import { usePerformanceTableFilters } from "@/hooks/performanceTable/usePerformanceTableFilters";
import { checkDataSources } from "@/lib/performanceTable/dataSourceUtils";
import PerformanceSettingsModal from "./PerformanceSettingsModal";
import { AlertTriangle, RefreshCw, Loader2, FileSpreadsheet, BarChart3, Plus } from "lucide-react";

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

export function PerformanceTable({
  reportId,
  reportIds,
  accountId,
  filters,
  onFiltersChange,
  visibilityRefreshTrigger,
  isSharedView = false,
  onLoadingComplete,
  isEditMode = false,
}: PerformanceTableProps) {
  // Modal states
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [selectedKPI, setSelectedKPI] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [columnVisibilityOpen, setColumnVisibilityOpen] = useState(false);
  const [showDataSourceSelectionModal, setShowDataSourceSelectionModal] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  
  // Date granularity state
  const [activeDateTab, setActiveDateTab] = useState<'day' | 'week' | 'month' | 'year'>('day');
  const [dateOrder, setDateOrder] = useState<'asc' | 'desc'>('desc');
  
  // Tab editing state
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabName, setEditingTabName] = useState("");
  const [accountName, setAccountName] = useState<string | undefined>(undefined);
  const [selectorDimensions, setSelectorDimensions] = useState<string[]>([]);

  // Data source state
  const [hasDataSources, setHasDataSources] = useState<boolean>(false);
  const [hasCSVSource, setHasCSVSource] = useState<boolean>(false);

  // Dimension selection state
  const [groupByDimensions, setGroupByDimensions] = useState<string[]>([]);
  const [breakdownByDimensions, setBreakdownByDimensions] = useState<string[]>([]);
  const [thenByDimensions, setThenByDimensions] = useState<string[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  // Sorting state
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(null);

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

  // Load dimensions
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
    saveSelectorDimensions,
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
    onSelectorDimensionsChange: setSelectorDimensions,
  });

  // Sync activeViewId from views hook
  useEffect(() => {
    setActiveViewId(viewsActiveViewId);
  }, [viewsActiveViewId]);

  // Load data with fixed variable names
  const {
    tableData: rawTableData,
    totalData: rawTotalData,
    totalCompareData: rawTotalCompareData,
    totalChangeData: rawTotalChangeData,
    isLoadingData,
    loadError,
    retryCount,
    loadingStrategy,
    loadPerformanceData,
  } = usePerformanceTableDataFixed({
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

  // Apply filters to the raw table data with different variable names
  const {
    filteredTableData: baseFilteredTableData,
    totals: filteredTotals,
    compareTotals: filteredCompareTotals,
    changeData: filteredChangeData,
  } = usePerformanceTableFilters({
    tableData: rawTableData,
    filters,
    dimensions,
    groupByDimensions,
    totalData: rawTotalData,
    reportId: reportId || undefined,
    accountId,
    activeDateTab,
    dateOrder,
  });

  // Apply sorting to filtered data
  const finalFilteredTableData = useMemo(() => {
    if (!sortColumn || !sortDirection) {
      return baseFilteredTableData;
    }

    const sorted = [...baseFilteredTableData];
    const dimension = dimensions.find(d => d.name === sortColumn);
    
    if (!dimension) return sorted;

    sorted.sort((a, b) => {
      const aValue = a.data[sortColumn];
      const bValue = b.data[sortColumn];
      
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;

      const aNum = parseFloat(String(aValue));
      const bNum = parseFloat(String(bValue));
      const isNumeric = !isNaN(aNum) && !isNaN(bNum);

      if (isNumeric) {
        const diff = aNum - bNum;
        return sortDirection === 'asc' ? diff : -diff;
      } else {
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
  }, [reportId, dimensions.length, loadAllViews]);

  // Handle dimension change
  const handleDimensionChange = useCallback((value: string, selector: "group" | "breakdown" | "then") => {
    const currentGroup = groupByDimensions[0];
    const currentBreakdown = breakdownByDimensions[0];
    const currentThen = thenByDimensions[0];

    const targetGroup = selector === "group" ? value : currentGroup;
    const targetBreakdown = selector === "breakdown" ? value : currentBreakdown;
    const targetThen = selector === "then" ? value : currentThen;

    const ordered: string[] = [];
    const pushUnique = (id?: string) => {
      if (id && !ordered.includes(id)) ordered.push(id);
    };

    pushUnique(targetGroup);
    pushUnique(targetBreakdown);
    pushUnique(targetThen);

    groupByDimensions.forEach((id) => pushUnique(id));

    setGroupByDimensions(ordered);
    setBreakdownByDimensions(targetBreakdown ? [targetBreakdown] : []);
    setThenByDimensions(targetThen ? [targetThen] : []);
  }, [groupByDimensions, breakdownByDimensions, thenByDimensions]);

  // Handle settings save
  const handleSettingsSave = useCallback(async (selected: string[]) => {
    setSelectorDimensions(selected);
    await saveSelectorDimensions(selected);
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
      if (sortDirection === 'desc') {
        setSortDirection('asc');
      } else {
        setSortDirection('desc');
      }
    } else {
      setSortColumn(dimensionName);
      setSortDirection('desc');
    }
  }, [sortColumn, sortDirection]);

  // Handle reset sort
  const handleResetSort = useCallback(() => {
    setSortColumn(null);
    setSortDirection(null);
  }, []);

  // Handle row click
  const handleRowClick = useCallback((row: { level: number; name: string }) => {
    if (!onFiltersChange) return;
    
    let dimId: string | undefined;
    if (row.level === 0) {
      dimId = groupByDimensions[0];
    } else if (row.level === 1) {
      dimId = breakdownByDimensions[0];
    } else if (row.level === 2) {
      dimId = thenByDimensions[0];
    }
    
    if (!dimId) return;
    
    const dimension = dimensions.find(d => d.id === dimId);
    if (!dimension) return;
    
    const currentFilters = filters.dimensionFilters || {};
    const existingValues = currentFilters[dimId] || [];
    
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

  // Enhanced retry handler
  const handleRetry = useCallback(() => {
    console.log('[PERF-TABLE] Manual retry triggered');
    loadPerformanceData();
  }, [loadPerformanceData]);

  return (
    <div className="space-y-4">
      {/* Enhanced Error Display */}
      {loadError && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="font-medium text-destructive mb-1">Data Loading Failed</h4>
              <p className="text-sm text-muted-foreground mb-3">
                {loadError}
              </p>
              {loadingStrategy && (
                <p className="text-xs text-muted-foreground mb-3">
                  Last attempted strategy: {loadingStrategy}
                </p>
              )}
              <div className="flex gap-2">
                <Button 
                  onClick={handleRetry} 
                  size="sm" 
                  variant="outline"
                  disabled={isLoadingData}
                >
                  {isLoadingData ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Retry {retryCount > 0 && `(${retryCount}/3)`}
                </Button>
                <Button 
                  onClick={() => window.location.reload()} 
                  size="sm" 
                  variant="ghost"
                >
                  Reload Page
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Enhanced Loading State */}
      {isLoadingData && (
        <div className="flex items-center justify-center py-12">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div className="text-center">
              <p className="text-sm font-medium">Loading performance data...</p>
              {loadingStrategy && (
                <p className="text-xs text-muted-foreground mt-1">
                  Using: {loadingStrategy}
                </p>
              )}
              {retryCount > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Retry attempt {retryCount}/3
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Table Content */}
      {!isLoadingData && !loadError && (
        <>
          {!hasDataSources && (
            <div className="text-center py-8">
              <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Data Sources</h3>
              <p className="text-muted-foreground mb-4">
                Add a data source to start analyzing your performance data.
              </p>
              <Button onClick={() => setShowDataSourceSelectionModal(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Data Source
              </Button>
            </div>
          )}

          {hasDataSources && finalFilteredTableData.length === 0 && (
            <div className="text-center py-8">
              <BarChart3 className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No Data Found</h3>
              <p className="text-muted-foreground mb-4">
                No data matches your current filters. Try adjusting your date range or filters.
              </p>
              <Button onClick={handleRetry} variant="outline">
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh Data
              </Button>
            </div>
          )}

          {hasDataSources && finalFilteredTableData.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <TableHeader
                  activeDateTab={activeDateTab}
                  onDateTabChange={setActiveDateTab}
                  dimensions={dimensions}
                  groupByDimensions={groupByDimensions}
                  breakdownByDimensions={breakdownByDimensions}
                  thenByDimensions={thenByDimensions}
                  availableSelectorDimensions={selectorDimensions}
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
                  onOpenSettings={() => setSettingsOpen(true)}
                />
              </CardHeader>
              <CardContent>
                <TableBody
                  filteredTableData={finalFilteredTableData}
                  dimensions={dimensions}
                  visibleColumns={visibleColumns}
                  getOrderedDimensions={getOrderedDimensions}
                  totals={filteredTotals}
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
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Modals */}
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
        tableData={rawTableData}
      />

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
    </div>
  );
}