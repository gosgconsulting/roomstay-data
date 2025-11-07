import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { ChevronDown, ChevronRight, Columns3, Copy, Trash2, Plus, ArrowUp, ArrowDown, Minus, GripVertical, Save, X, CheckCircle2, AlertCircle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { useState, useEffect, useMemo, useCallback, Fragment } from "react";
import { cn, sortKPIsByDefaultOrder, getAccountDefaultKPIs } from "@/lib/utils";
import { ColumnFilterModal } from "./ColumnFilterModal";
import { DimensionSelectorModal } from "./DimensionSelectorModal";
import { supabase } from "@/integrations/supabase/client";
import { retryWithBackoff, filterDimensionsByVisibility } from "@/lib/debug";
import { format, startOfWeek, startOfMonth, startOfYear } from "date-fns";
import { FilterState } from "./FiltersBar";
import { checkDimensionsHaveData } from "@/lib/dimensionUtils";
import { TableVirtuoso } from "react-virtuoso";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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
  parentId?: string;
  data: Record<string, any>;
  children?: TableRow[];
  compareData?: Record<string, any>;
  changeData?: Record<string, number>;
}

interface PerformanceTableProps {
  reportId: string | null;
  filters: FilterState;
  isSharedView?: boolean;
  accountId?: string;
  visibilityRefreshTrigger?: number; // Trigger to refresh when dimension visibility changes
  onLoadingComplete?: () => void;
  onFiltersChange?: (filters: FilterState) => void;
}

// Sortable column item component
function SortableColumnItem({ 
  dimension, 
  isVisible, 
  onToggle 
}: { 
  dimension: Dimension; 
  isVisible: boolean; 
  onToggle: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: dimension.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center space-x-2 p-2 bg-background rounded border"
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <Checkbox
        id={`col-${dimension.id}`}
        checked={isVisible}
        onCheckedChange={onToggle}
      />
      <Label
        htmlFor={`col-${dimension.id}`}
        className="text-sm font-normal cursor-pointer flex-1"
      >
        {dimension.name}
      </Label>
    </div>
  );
}

export const PerformanceTable = ({ reportId, filters, isSharedView = false, accountId, visibilityRefreshTrigger, onLoadingComplete, onFiltersChange }: PerformanceTableProps) => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [dimensionSelectorOpen, setDimensionSelectorOpen] = useState(false);
  const [selectedKPI, setSelectedKPI] = useState("");
  const [currentSelector, setCurrentSelector] = useState<"group" | "breakdown" | "then">("group");
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [dimensionHasData, setDimensionHasData] = useState<Record<string, boolean>>({});
  const [hasDataSources, setHasDataSources] = useState<boolean>(false);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set());
  const [initialVisibleColumns, setInitialVisibleColumns] = useState<Set<string>>(new Set());
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [initialColumnOrder, setInitialColumnOrder] = useState<string[]>([]);
  const [isSavingColumnSettings, setIsSavingColumnSettings] = useState(false);
  const [isLoadingDimensions, setIsLoadingDimensions] = useState(true);
  const [tableData, setTableData] = useState<TableRow[]>([]);
  const [totalData, setTotalData] = useState<Record<string, any>>({});
  const [totalCompareData, setTotalCompareData] = useState<Record<string, any>>({});
  const [totalChangeData, setTotalChangeData] = useState<Record<string, number>>({});
  const [isLoadingData, setIsLoadingData] = useState(true);
  
  // Multiple table views state
  const [tableViews, setTableViews] = useState<any[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  
  // State for dimension selections - start empty
  const [groupByDimensions, setGroupByDimensions] = useState<string[]>([]);
  const [breakdownByDimensions, setBreakdownByDimensions] = useState<string[]>([]);
  const [thenByDimensions, setThenByDimensions] = useState<string[]>([]);
  
  // State for date granularity - default to 'day' for better user experience
  const [dateGranularity, setDateGranularity] = useState<'none' | 'day' | 'week' | 'month' | 'year'>('day');
  const [dateOrder, setDateOrder] = useState<'asc' | 'desc'>('desc');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50; // Show more rows per page
  
  // Tab editing state
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabName, setEditingTabName] = useState("");
  const [accountName, setAccountName] = useState<string | undefined>(undefined);

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

  useEffect(() => {
    if (reportId) {
      loadDimensions();
      checkDataSources();
    }
  }, [reportId]);

  // Reset table state when report changes
  useEffect(() => {
    if (reportId) {
      // Clear previous report's state
      setTableViews([]);
      setActiveViewId(null);
      setGroupByDimensions([]);
      setBreakdownByDimensions([]);
      setThenByDimensions([]);
      setVisibleColumns(new Set());
      setColumnOrder([]);
      setTableData([]);
      setTotalData({});
      setHasDataSources(false); // Reset data sources check
    }
  }, [reportId]);

  useEffect(() => {
    if (reportId && dimensions.length > 0) {
      loadAllViews();
      // Check data sources when dimensions change (might indicate data source was added)
      checkDataSources();
    }
  }, [reportId, dimensions.length]);

  // Auto-select Date dimension if no grouping is set and dimensions are loaded
  useEffect(() => {
    if (dimensions.length > 0 && groupByDimensions.length === 0 && !isLoadingDimensions && tableViews.length > 0) {
      console.log('[testing] Auto-selecting default grouping dimension');
      const dateDimension = dimensions.find(d => d.type === 'date');
      const textDimension = dimensions.find(d => d.type === 'text');
      
      if (dateDimension) {
        setGroupByDimensions([dateDimension.id]);
        console.log('[testing] Auto-selected Date dimension for grouping:', dateDimension.name);
      } else if (textDimension) {
        setGroupByDimensions([textDimension.id]);
        console.log('[testing] Auto-selected text dimension for grouping:', textDimension.name);
      } else if (dimensions.length > 0) {
        setGroupByDimensions([dimensions[0].id]);
        console.log('[testing] Auto-selected first dimension for grouping:', dimensions[0].name);
      }
    }
  }, [dimensions.length, groupByDimensions.length, isLoadingDimensions, tableViews.length]);

  // Re-check data sources when refresh is triggered (after sync completes)
  useEffect(() => {
    if (reportId && visibilityRefreshTrigger && visibilityRefreshTrigger > 0) {
      console.log('[testing] Re-checking data sources after refresh trigger');
      checkDataSources();
    }
  }, [visibilityRefreshTrigger, reportId]);

  // Refresh view settings when dimension visibility changes from DimensionsListModal
  useEffect(() => {
    if (reportId && visibilityRefreshTrigger && visibilityRefreshTrigger > 0) {
      console.log('[testing] Refreshing view settings due to dimension visibility change');
      loadAllViews(); // Reload view settings to get updated visibility
    }
  }, [visibilityRefreshTrigger, reportId]);

  // Create a stable reference for filters to prevent unnecessary re-renders
  const debouncedFilters = useMemo(() => {
    console.log('[PERF-TABLE] Creating stable filters reference:', {
      compareEnabled: filters.compareEnabled,
      compareType: filters.compareType,
      hasCompareDateRange: !!filters.compareDateRange,
      compareDateRange: filters.compareDateRange
    });
    
    const result = {
      dimensionFilters: filters.dimensionFilters,
      dateRange: filters.dateRange,
      datePreset: filters.datePreset,
      compareEnabled: filters.compareEnabled,
      compareType: filters.compareType,
      compareDateRange: filters.compareDateRange,
    };
    
    console.log('[PERF-TABLE] Debounced filters created:', result);
    return result;
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

  // Load performance data when filters change (simplified approach like KPIChart)
  useEffect(() => {
    console.log('[PERF-TABLE] useEffect triggered:', {
      reportId: !!reportId,
      groupByDimensions: groupByDimensions.length,
      compareEnabled: debouncedFilters.compareEnabled,
      compareType: debouncedFilters.compareType,
      hasCompareDateRange: !!debouncedFilters.compareDateRange,
      timestamp: new Date().toISOString()
    });
    
    // Always attempt to load data if we have a reportId - let the function handle conditions
    if (reportId) {
      console.log('[testing] ✓ reportId exists, calling loadPerformanceData with filters:', {
        dateFrom: debouncedFilters.dateRange?.from ? format(debouncedFilters.dateRange.from, 'yyyy-MM-dd') : undefined,
        dateTo: debouncedFilters.dateRange?.to ? format(debouncedFilters.dateRange.to, 'yyyy-MM-dd') : undefined,
        preset: debouncedFilters.datePreset
      });
      
      // Reset to first page when filters change
      setCurrentPage(1);
      
      // Immediately show loading state
      setIsLoadingData(true);
      
      // Load data (the function will handle its own loading state)
      loadPerformanceData();
    } else {
      console.log('[testing] ✗ No reportId, skipping data load');
      // Clear data when no reportId
      setTableData([]);
      setTotalData({});
      setTotalCompareData({});
      setTotalChangeData({});
      setIsLoadingData(false);
    }
  }, [reportId, debouncedFilters, groupByDimensions, breakdownByDimensions, thenByDimensions, dateOrder, visibilityRefreshTrigger]);

  // Save view settings whenever they change (with debounce to prevent excessive saves)
  useEffect(() => {
    if (reportId && dimensions.length > 0 && activeViewId) {
      const timeoutId = setTimeout(() => {
        saveViewSettings();
      }, 500); // Debounce for 500ms
      
      return () => clearTimeout(timeoutId);
    }
  }, [groupByDimensions, breakdownByDimensions, thenByDimensions, visibleColumns, columnOrder, dateGranularity, dateOrder, reportId, activeViewId]);

  const loadAllViews = async () => {
    if (!reportId) {
      console.error("Cannot load views: No reportId");
      return;
    }
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      console.log('Loading views for report:', reportId, 'isSharedView:', isSharedView);

      let userId = user?.id;
      
      // If this is a shared view, load the report owner's views instead
      if (isSharedView) {
        const { data: reportData, error: reportError } = await supabase
          .from("reports")
          .select("user_id")
          .eq("id", reportId)
          .single();
        
        if (reportError) {
          console.error("Error fetching report owner:", reportError);
          throw reportError;
        }
        
        userId = reportData.user_id;
        console.log('Loading report owner views for shared view. Owner:', userId);
      } else if (!user) {
        console.error("Cannot load views: No user");
        return;
      }

      // Load all views for this report (either current user or report owner)
      const { data: views, error } = await supabase
        .from("report_views")
        .select("*")
        .eq("report_id", reportId)
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching views:", error);
        throw error;
      }

      console.log('Found views:', views?.length || 0);

      if (views && views.length > 0) {
        // Update default views for Roomstay account if needed
        if (accountName?.toLowerCase() === 'roomstay' && !isSharedView && user) {
          const roomstayKPIs = [
            'Impressions',
            'Clicks',
            'CTR',
            'Bookings',
            'Conversion Rate',
            'CPC',
            'Cost',
            'Revenue',
            'ROAS',
            'Cost of sale'
          ];
          
          // Update default view if it doesn't have the right KPI order
          const defaultView = views.find(v => v.is_default);
          if (defaultView) {
            const currentKPIs = defaultView.visible_kpis || [];
            const needsUpdate = JSON.stringify(currentKPIs) !== JSON.stringify(roomstayKPIs);
            
            if (needsUpdate) {
              console.log('Updating Roomstay default view KPI order');
              await supabase
                .from('report_views')
                .update({
                  visible_kpis: roomstayKPIs,
                  kpi_order: roomstayKPIs,
                  updated_at: new Date().toISOString()
                })
                .eq('id', defaultView.id);
              
              // Update local state
              defaultView.visible_kpis = roomstayKPIs;
              defaultView.kpi_order = roomstayKPIs;
            }
          }
        }
        
        setTableViews(views);
        // Set the first view as active (default view)
        const defaultView = views.find(v => v.is_default) || views[0];
        setActiveViewId(defaultView.id);
        // Load settings directly from the view data instead of searching state
        loadViewSettingsFromData(defaultView);
      } else if (!isSharedView) {
        // Only create a default view if not a shared view and no views exist
        console.log('No views found, creating default view');
        await createDefaultView();
      } else {
        console.log('No views found for shared report');
      }
    } catch (error) {
      console.error("Error loading views:", error);
    }
  };

  const createDefaultView = async () => {
    if (!reportId) {
      console.error("Cannot create default view: No reportId");
      return;
    }
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error("Cannot create default view: No user");
        return;
      }

      // Find date dimension first, fallback to text dimension for default grouping
      const defaultGroupDimension = dimensions.find(d => d.type === 'date') || dimensions.find(d => d.type === 'text');
      const isDateGrouping = defaultGroupDimension?.type === 'date';
      
      console.log('Creating default view for report:', reportId, 'with dimension:', defaultGroupDimension?.name, 'type:', defaultGroupDimension?.type);

      // Set default visible columns - hide some columns by default
      const hiddenColumns = ['Impression Share', 'CPM', 'Leads'];
      const defaultVisibleIds = dimensions
        .filter(d => !hiddenColumns.includes(d.name) && 
                    (d.type === 'number' || d.type === 'currency' || d.type === 'percentage' || d.formula))
        .map(d => d.id);
      
      const defaultColumnOrder = dimensions
        .filter(d => d.type === 'number' || d.type === 'currency' || d.type === 'percentage' || d.formula)
        .map(d => d.id);

        // Set default KPI settings - use account-specific defaults
        const defaultKPIs = getAccountDefaultKPIs(
          accountName,
          dimensions
            .filter(d => d.type === 'number' || d.type === 'currency' || d.type === 'percentage')
            .map(d => d.name)
        );

      const { data: newView, error } = await supabase
        .from("report_views")
        .insert({
          report_id: reportId,
          user_id: user.id,
          name: "Table 1",
          is_default: true,
          group_by_dimensions: defaultGroupDimension ? [defaultGroupDimension.id] : [],
          breakdown_by_dimensions: [],
          then_by_dimensions: [],
          visible_columns: defaultVisibleIds,
          column_order: defaultColumnOrder,
          visible_kpis: defaultKPIs,
          kpi_order: defaultKPIs,
          date_granularity: isDateGrouping ? 'day' : 'day', // Always default to day
          date_order: 'desc',
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating default view:", error);
        throw error;
      }

      if (newView) {
        console.log('Default view created successfully:', newView.id);
        setTableViews([newView]);
        setActiveViewId(newView.id);
        // Load settings directly from the created view
        loadViewSettingsFromData(newView);
      }
    } catch (error) {
      console.error("Error creating default view:", error);
    }
  };

  // Helper to load view settings from view data directly
  const loadViewSettingsFromData = (view: any) => {
    if (!view) {
      console.error("No view data provided");
      return;
    }

    console.log('Loading view settings for:', view.name, view);
    
    // Map old dimension IDs to account-scoped dimension IDs for group_by_dimensions
    const mapDimensionIds = async (dimIds: string[]): Promise<string[]> => {
      if (!dimIds || dimIds.length === 0) return [];
      
      const mapped: string[] = [];
      const unmappedIds: string[] = [];
      
      // First, find dimensions that are already valid
      for (const dimId of dimIds) {
        const dimension = dimensions.find(d => d.id === dimId);
        if (dimension) {
          mapped.push(dimension.id);
        } else {
          unmappedIds.push(dimId);
        }
      }
      
      // If we have unmapped IDs, query them to get their names and map to account-scoped dimensions
      if (unmappedIds.length > 0) {
        try {
          const dimensionNameToIdMap = new Map<string, string>();
          dimensions.forEach(dim => {
            dimensionNameToIdMap.set(dim.name.toLowerCase(), dim.id);
          });
          
          const { data: oldDimensions } = await supabase
            .from("dimensions")
            .select("id, name")
            .in("id", unmappedIds);
          
          if (oldDimensions) {
            oldDimensions.forEach((oldDim) => {
              const normalizedName = oldDim.name.toLowerCase();
              const newDimensionId = dimensionNameToIdMap.get(normalizedName);
              
              if (newDimensionId) {
                mapped.push(newDimensionId);
                console.log(`[testing] Mapped group dimension "${oldDim.name}": ${oldDim.id} -> ${newDimensionId}`);
              } else {
                console.warn(`[testing] Could not find account-scoped dimension for "${oldDim.name}" (${oldDim.id})`);
              }
            });
          }
        } catch (error) {
          console.error('[testing] Error mapping old dimension IDs:', error);
        }
      }
      
      return mapped;
    };
    
    // Load saved settings - map dimension IDs asynchronously
    const loadDimensionsAsync = async () => {
      const groupDimensions = await mapDimensionIds(view.group_by_dimensions || []);
      
      // If no grouping dimension is set and dimensions are available, set a default
      let finalGroupDimensions = groupDimensions;
      if (groupDimensions.length === 0 && dimensions.length > 0) {
        // Find a suitable dimension for grouping - prefer Date first, then text dimensions
        const dateDimension = dimensions.find(d => d.type === 'date');
        const textDimension = dimensions.find(d => d.type === 'text');
        
        if (dateDimension) {
          finalGroupDimensions = [dateDimension.id];
          console.log('Auto-selected Date dimension for grouping:', dateDimension.name);
        } else if (textDimension) {
          finalGroupDimensions = [textDimension.id];
          console.log('Auto-selected text dimension for grouping:', textDimension.name);
        } else {
          // Fallback to first available dimension
          finalGroupDimensions = [dimensions[0].id];
          console.log('Auto-selected first available dimension for grouping:', dimensions[0].name);
        }
      }
      
      setGroupByDimensions(finalGroupDimensions);
      setBreakdownByDimensions(await mapDimensionIds(view.breakdown_by_dimensions || []));
      setThenByDimensions(await mapDimensionIds(view.then_by_dimensions || []));
    };
    
    loadDimensionsAsync();
    
    if (view.visible_columns && view.visible_columns.length > 0) {
      console.log('[testing] Loading visible columns from view:', view.visible_columns.length, 'columns');
      console.log('[testing] Visible column IDs:', view.visible_columns);
      
      // Map old dimension IDs to account-scoped dimension IDs
      const loadVisibleColumnsAsync = async () => {
        // Create a map of dimension name to account-scoped dimension ID
        const dimensionNameToIdMap = new Map<string, string>();
        dimensions.forEach(dim => {
          dimensionNameToIdMap.set(dim.name.toLowerCase(), dim.id);
        });
        
        // Validate and map visible_columns
        const mappedVisibleColumns: string[] = [];
        
        // First, collect all unmapped IDs to query them in one batch
        const idsToCheck = view.visible_columns.filter((id: string) => 
          !dimensions.find(d => d.id === id)
        );
        
        // If we have unmapped IDs, query them to get their names and map to account-scoped dimensions
        if (idsToCheck.length > 0) {
          try {
            const { data: oldDimensions } = await supabase
              .from("dimensions")
              .select("id, name")
              .in("id", idsToCheck);
            
            if (oldDimensions) {
              oldDimensions.forEach((oldDim) => {
                const normalizedName = oldDim.name.toLowerCase();
                const newDimensionId = dimensionNameToIdMap.get(normalizedName);
                
                if (newDimensionId) {
                  mappedVisibleColumns.push(newDimensionId);
                  console.log(`[testing] Mapped visible column "${oldDim.name}": ${oldDim.id} -> ${newDimensionId}`);
                } else {
                  console.warn(`[testing] Could not find account-scoped dimension for "${oldDim.name}" (${oldDim.id})`);
                }
              });
            }
          } catch (error) {
            console.error('[testing] Error mapping old dimension IDs:', error);
          }
        }
        
        // Add all valid dimension IDs (those that already exist in loaded dimensions)
        view.visible_columns.forEach((colDimId: string) => {
          const dimension = dimensions.find(d => d.id === colDimId);
          if (dimension && !mappedVisibleColumns.includes(dimension.id)) {
            mappedVisibleColumns.push(dimension.id);
          }
        });
        
        const visibleSet = new Set<string>(mappedVisibleColumns);
        setVisibleColumns(visibleSet);
        setInitialVisibleColumns(new Set<string>(visibleSet));
        console.log('[testing] Set visibleColumns state:', visibleSet.size, 'columns (mapped from', view.visible_columns.length, 'original)');
      };
      
      loadVisibleColumnsAsync();
    } else if (dimensions.length > 0) {
      // Set default visibility if not set
      const hiddenColumns = ['Impression Share', 'CPM', 'Leads'];
      const defaultVisible = new Set<string>(
        dimensions
          .filter(d => !hiddenColumns.includes(d.name) && 
                      (d.type === 'number' || d.type === 'currency' || d.type === 'percentage' || d.formula))
          .map(d => d.id)
      );
      console.log('Setting default visible columns:', Array.from(defaultVisible));
      setVisibleColumns(defaultVisible);
      setInitialVisibleColumns(new Set(defaultVisible));
    }
    
    // Load column order if available
    if (view.column_order && view.column_order.length > 0) {
      console.log('Loading column order:', view.column_order);
      setColumnOrder(view.column_order);
      setInitialColumnOrder([...view.column_order]);
    } else if (dimensions.length > 0) {
      // Set default order based on dimensions
      const metricDimensions = dimensions.filter(d => 
        d.type === 'number' || d.type === 'currency' || d.type === 'percentage' || d.formula
      );
      const orderIds = metricDimensions.map(d => d.id);
      setColumnOrder(orderIds);
      setInitialColumnOrder([...orderIds]);
    }
    
    // Load date granularity if available (default to none)
    if (view.date_granularity) {
      console.log('Loading date granularity:', view.date_granularity);
      setDateGranularity(view.date_granularity as 'none' | 'day' | 'week' | 'month' | 'year');
    }
    
    // Load date order if available (default to desc)
    if (view.date_order) {
      console.log('Loading date order:', view.date_order);
      setDateOrder(view.date_order as 'asc' | 'desc');
    }
    
    console.log('View settings loaded successfully');
  };

  const loadViewSettings = async (viewId: string) => {
    if (!reportId || !viewId) {
      console.error("Cannot load view settings: Missing reportId or viewId");
      return;
    }
    
    try {
      const view = tableViews.find(v => v.id === viewId);
      
      if (!view) {
        console.error("View not found:", viewId);
        return;
      }

      loadViewSettingsFromData(view);
    } catch (error) {
      console.error("Error loading view settings:", error);
    }
  };

  const saveViewSettings = async () => {
    if (!reportId || !activeViewId) return;
    
    // Don't save if this is a shared view (read-only)
    if (isSharedView) {
      console.log('Skipping save for shared view (read-only)');
      return;
    }
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Only save if user is logged in
      if (!user) return;

      const viewData = {
        group_by_dimensions: groupByDimensions,
        breakdown_by_dimensions: breakdownByDimensions,
        then_by_dimensions: thenByDimensions,
        visible_columns: Array.from(visibleColumns),
        column_order: columnOrder,
        date_granularity: dateGranularity,
        date_order: dateOrder,
      };

      console.log('Saving view settings:', activeViewId, viewData);

      const { error } = await supabase
        .from("report_views")
        .update(viewData)
        .eq("id", activeViewId);

      if (error) {
        console.error('Error saving view settings:', error);
        throw error;
      }

      console.log('View settings saved successfully');

      // Update local state
      setTableViews(prev => prev.map(v => 
        v.id === activeViewId ? { ...v, ...viewData } : v
      ));
    } catch (error) {
      console.error("Error saving view settings:", error);
    }
  };

  const handleDuplicateView = async () => {
    if (!reportId || !activeViewId || isSharedView) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const activeView = tableViews.find(v => v.id === activeViewId);
      if (!activeView) return;

      // Find next available number for naming
      const tableNumbers = tableViews
        .map(v => {
          const match = v.name.match(/^Table (\d+)$/);
          return match ? parseInt(match[1]) : 0;
        })
        .filter(n => n > 0);
      
      const nextNumber = tableNumbers.length > 0 ? Math.max(...tableNumbers) + 1 : tableViews.length + 1;

      const { data: newView, error } = await supabase
        .from("report_views")
        .insert({
          report_id: reportId,
          user_id: user.id,
          name: `Table ${nextNumber}`,
          is_default: false,
          group_by_dimensions: activeView.group_by_dimensions || [],
          breakdown_by_dimensions: activeView.breakdown_by_dimensions || [],
          then_by_dimensions: activeView.then_by_dimensions || [],
          visible_columns: activeView.visible_columns || [],
          column_order: activeView.column_order || [],
          visible_kpis: activeView.visible_kpis || [],
          kpi_order: activeView.kpi_order || [],
          date_granularity: activeView.date_granularity || 'day',
          date_order: activeView.date_order || 'desc',
        })
        .select()
        .single();

      if (error) throw error;

      if (newView) {
        setTableViews(prev => [...prev, newView]);
        setActiveViewId(newView.id);
        // Load settings directly from the created view
        loadViewSettingsFromData(newView);
        
        toast({
          title: "Table duplicated",
          description: `Created ${newView.name}`,
        });
      }
    } catch (error) {
      console.error("Error duplicating view:", error);
      toast({
        title: "Error",
        description: "Failed to duplicate table",
        variant: "destructive",
      });
    }
  };

  const handleDeleteView = async (viewId: string) => {
    if (!reportId || tableViews.length <= 1 || isSharedView) return;
    
    try {
      const { error } = await supabase
        .from("report_views")
        .delete()
        .eq("id", viewId);

      if (error) throw error;

      const deletedView = tableViews.find(v => v.id === viewId);
      setTableViews(prev => prev.filter(v => v.id !== viewId));

      // Switch to another view if the active view was deleted
      if (activeViewId === viewId) {
        const remainingViews = tableViews.filter(v => v.id !== viewId);
        if (remainingViews.length > 0) {
          const nextView = remainingViews[0];
          setActiveViewId(nextView.id);
          // Load settings directly from the next view
          loadViewSettingsFromData(nextView);
        }
      }

      toast({
        title: "Table deleted",
        description: `Deleted ${deletedView?.name}`,
      });
    } catch (error) {
      console.error("Error deleting view:", error);
      toast({
        title: "Error",
        description: "Failed to delete table",
        variant: "destructive",
      });
    }
  };

  const handleViewChange = (viewId: string) => {
    setActiveViewId(viewId);
    loadViewSettings(viewId);
  };

  const handleTabDoubleClick = (viewId: string, currentName: string) => {
    if (isSharedView) return;
    setEditingTabId(viewId);
    setEditingTabName(currentName);
  };

  const handleTabNameSave = async () => {
    if (!editingTabId || !editingTabName.trim() || isSharedView) {
      setEditingTabId(null);
      return;
    }

    try {
      const { error } = await supabase
        .from("report_views")
        .update({ name: editingTabName.trim() })
        .eq("id", editingTabId);

      if (error) throw error;

      // Update local state
      setTableViews(prev => prev.map(v => 
        v.id === editingTabId ? { ...v, name: editingTabName.trim() } : v
      ));

      toast({
        title: "Table renamed",
        description: `Renamed to "${editingTabName.trim()}"`,
      });
    } catch (error) {
      console.error("Error renaming table:", error);
      toast({
        title: "Error",
        description: "Failed to rename table",
        variant: "destructive",
      });
    } finally {
      setEditingTabId(null);
      setEditingTabName("");
    }
  };

  const handleTabNameCancel = () => {
    setEditingTabId(null);
    setEditingTabName("");
  };

  const checkDataAvailability = async (dimensionIds: string[], reportId: string) => {
    try {
      const hasDataMap = await checkDimensionsHaveData(dimensionIds, reportId);
      setDimensionHasData(hasDataMap);
    } catch (error) {
      console.error('[testing] Error checking dimension data availability:', error);
    }
  };

  const loadDimensions = async () => {
    if (!reportId) return;
    
    try {
      setIsLoadingDimensions(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        console.error("User not authenticated");
        return;
      }

      console.log('[testing] PerformanceTable - Loading dimensions for user:', user.id, 'account:', accountId);

      // Load only account-scoped dimensions (including custom which are now under account scope)
      if (!accountId) {
        console.error('[testing] No accountId provided, cannot load dimensions');
        return;
      }

      const { data: accountData, error: accountError } = await supabase
        .from("dimensions")
        .select("*")
        .eq("scope", "account")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false });

      if (accountError) throw accountError;

      const allDimensions = accountData || [];

      console.log('[testing] PerformanceTable - Loaded account dimensions:', {
        account: allDimensions.length,
        accountId
      });

      // Set all dimensions (needed for Group by/Breakdown by selectors)
      setDimensions(allDimensions);
      
      // Check data availability for dimensions
      if (reportId && allDimensions.length > 0) {
        checkDataAvailability(allDimensions.map(d => d.id), reportId);
      }
      
      // Initialize column order if not set (only for numeric dimensions)
      if (columnOrder.length === 0) {
        const numericDimensions = allDimensions.filter(d => 
          d.type === 'number' || d.type === 'currency' || d.type === 'percentage' || d.formula
        );
        const orderIds = numericDimensions.map(d => d.id);
        setColumnOrder(orderIds);
        setInitialColumnOrder([...orderIds]);
      }
      
      // Set default visibility only if no saved view exists (only for numeric dimensions)
      // This will be overridden by loadViewSettings if a saved view exists
      const hiddenColumns = ['Impression Share', 'CPM', 'Leads'];
      const numericDimensions = allDimensions.filter(d => 
        d.type === 'number' || d.type === 'currency' || d.type === 'percentage' || d.formula
      );
      const defaultVisible = new Set<string>(
        numericDimensions
          .filter(d => !hiddenColumns.includes(d.name))
          .map(d => d.id)
      );
      setVisibleColumns(defaultVisible);
      setInitialVisibleColumns(new Set(defaultVisible));
    } catch (error) {
      console.error("Error loading dimensions:", error);
    } finally {
      setIsLoadingDimensions(false);
    }
  };

  const checkDataSources = async () => {
    if (!reportId) {
      setHasDataSources(false);
      return;
    }
    
    try {
      console.log('[testing] Checking data sources for report:', reportId);
      
      const { data: dataSources, error } = await supabase
        .from('data_sources')
        .select('id')
        .eq('report_id', reportId)
        .limit(1);
      
      if (error) {
        console.error('Error checking data sources:', error);
        setHasDataSources(false);
        return;
      }
      
      const hasData = dataSources && dataSources.length > 0;
      console.log('[testing] Data sources found:', hasData ? 'Yes' : 'No');
      setHasDataSources(hasData);
    } catch (error) {
      console.error('Error checking data sources:', error);
      setHasDataSources(false);
    }
  };

  // Helper to format date based on granularity
  const formatDate = (dateValue: any, granularity: 'day' | 'week' | 'month' | 'year'): string => {
    if (!dateValue) return "-";
    
    try {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return "-";
      
      switch (granularity) {
        case 'day':
          return format(date, 'MMMM d, yyyy'); // October 31, 2025
        case 'week':
          const weekStart = startOfWeek(date);
          return format(weekStart, 'MMMM d, yyyy'); // Week starting date
        case 'month':
          return format(date, 'MMMM yyyy'); // October 2025
        case 'year':
          return format(date, 'yyyy'); // 2025
        default:
          return "-";
      }
    } catch (error) {
      console.error('Error formatting date:', error);
      return "-";
    }
  };
  
  // Helper to format row name - check if it's a date
  const formatRowName = (name: string, level: number): string => {
    // Get the dimension for this level
    let dimId: string | undefined;
    if (level === 0) {
      dimId = groupByDimensions[0];
    } else if (level === 1) {
      dimId = groupByDimensions[1];
    } else if (level === 2) {
      dimId = groupByDimensions[2];
    }
    
    if (!dimId) return name;
    
    const dimension = dimensions.find(d => d.id === dimId);
    
    // If it's a date dimension, check if it's already formatted by the backend
    if (dimension?.type === 'date') {
      // If dateGranularity is not 'none', the backend has already formatted it
      if (dateGranularity !== 'none' && dateGranularity !== 'day') {
        // Already formatted by backend (e.g., "October, 2025" or "2025")
        return name;
      }
      
      // For 'day' or 'none', format the date
      try {
        const date = new Date(name);
        if (!isNaN(date.getTime())) {
          return format(date, 'MMMM d, yyyy'); // October 29, 2025
        }
      } catch (error) {
        console.error('Error formatting date name:', error);
      }
    }
    
    return name;
  };

  // Helper to format values based on dimension type
  const formatValue = (value: any, dimension: Dimension): string => {
    if (value === null || value === undefined || value === "") return "-";
    
    const numValue = parseFloat(value);
    if (isNaN(numValue)) return value;
    
    // Format based on dimension name and type
    const dimName = dimension.name.toLowerCase();
    
    // CPC: 2 decimals with $ prefix
    if (dimName === 'cpc') {
      return `$${numValue.toFixed(2)}`;
    }
    
    // Cost and Revenue: 0 decimals with $ prefix and comma separators
    if (dimName === 'cost' || dimName === 'revenue') {
      return `$${Math.round(numValue).toLocaleString('en-US')}`;
    }
    
    // Currency type: 2 decimals with $ prefix
    if (dimension.type === 'currency') {
      return `$${numValue.toFixed(2)}`;
    }
    
    // Percentage type: show as percentage
    if (dimension.type === 'percentage') {
      return `${numValue.toFixed(2)}%`;
    }
    
    // Regular numbers: add comma separators
    if (dimension.type === 'number' || dimension.formula) {
      // If it's a whole number, show as integer with commas
      if (Number.isInteger(numValue)) {
        return numValue.toLocaleString('en-US');
      }
      // If it has decimals, show 2 decimal places with commas
      return numValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    
    return value;
  };

  // Load performance data using the new edge function
  const loadPerformanceData = async () => {
    // Loading state is already set in useEffect, but ensure it's set here too for direct calls
    
    const dateFromFormatted = filters.dateRange?.from ? format(filters.dateRange.from, 'yyyy-MM-dd') : undefined;
    const dateToFormatted = filters.dateRange?.to ? format(filters.dateRange.to, 'yyyy-MM-dd') : undefined;
    
    console.log('[PERF-TABLE] loadPerformanceData called with filters:', {
      reportId,
      groupByDimensions: groupByDimensions.length,
      compareEnabled: filters.compareEnabled,
      compareType: filters.compareType,
      hasCompareDateRange: !!filters.compareDateRange,
      compareDateFrom: filters.compareDateRange?.from ? format(filters.compareDateRange.from, 'yyyy-MM-dd') : undefined,
      compareDateTo: filters.compareDateRange?.to ? format(filters.compareDateRange.to, 'yyyy-MM-dd') : undefined
    });

    // Check conditions after setting loading state
    if (!reportId || groupByDimensions.length === 0) {
      console.log('[testing] No data loading - missing reportId or groupByDimensions');
      setTableData([]);
      setTotalData({});
      setTotalCompareData({});
      setTotalChangeData({});
      setIsLoadingData(false);
      onLoadingComplete?.(); // Mark as complete even when skipping load
      return;
    }

    try {
      // Get current user for custom dimensions
      const { data: { user } } = await supabase.auth.getUser();
      
      const requestBody = {
        reportId,
        groupByDims: groupByDimensions,
        breakdownDims: breakdownByDimensions,
        thenByDims: thenByDimensions,
        dimensionFilters: filters.dimensionFilters,
        dateFrom: dateFromFormatted,
        dateTo: dateToFormatted,
        accountId, // Pass accountId to edge function
        userId: user?.id, // Pass userId for custom dimensions
        visibleDimensionIds: Array.from(visibleColumns),
                  limit: 50000, // Increased to get more data for pagination
        offset: 0,
        compareEnabled: filters.compareEnabled || false,
        compareDateFrom: filters.compareDateRange?.from ? format(filters.compareDateRange.from, 'yyyy-MM-dd') : undefined,
        compareDateTo: filters.compareDateRange?.to ? format(filters.compareDateRange.to, 'yyyy-MM-dd') : undefined,
        dateGranularity: dateGranularity,
        dateOrder: dateOrder,
      };
      
      console.log('[testing] Calling get-performance-data with request body:', requestBody);
      console.log('[testing] Date filter details being sent:', {
        dateFrom: requestBody.dateFrom,
        dateTo: requestBody.dateTo,
        hasDateFrom: !!requestBody.dateFrom,
        hasDateTo: !!requestBody.dateTo,
        originalDateRange: filters.dateRange,
        originalFrom: filters.dateRange?.from?.toISOString(),
        originalTo: filters.dateRange?.to?.toISOString(),
        timestamp: new Date().toISOString()
      });

      const { data, error } = await supabase.functions.invoke('get-performance-data', {
        body: requestBody,
      });

      if (error) {
        console.error('[testing] Error loading performance data:', error);
        console.error('[testing] Error details:', {
          message: error.message,
          status: error.status,
          details: error.details
        });
        toast({
          title: "Error loading data",
          description: `Failed to load performance table data: ${error.message || 'Unknown error'}`,
          variant: "destructive",
        });
        setTableData([]);
        setTotalData({});
        setTotalCompareData({});
        setTotalChangeData({});
        setIsLoadingData(false);
        onLoadingComplete?.();
        return;
      }

      console.log('[testing] Performance data response:', {
        hasData: !!data,
        rowsCount: data?.data?.length || 0,
        total: data?.total || 0,
        hasMore: data?.hasMore,
        error: error
      });

      // The edge function returns { data: [...], total: ..., totalData: {...}, hasMore: ... }
      const rows = data?.data || [];
      setTableData(rows);
      
      // Use totalData from edge function if available (more efficient than recalculating)
      const finalTotalData = data?.totalData || (() => {
        // Fallback: Calculate total data from all rows if edge function doesn't provide it
        const calculatedTotalData: Record<string, any> = {};
        if (rows.length > 0 && dimensions.length > 0) {
          rows.forEach((row: any) => {
            if (row.data) {
              Object.keys(row.data).forEach((dimName: string) => {
                const dim = dimensions.find(d => d.name === dimName);
                if (dim && (dim.type === 'number' || dim.type === 'currency')) {
                  calculatedTotalData[dimName] = (calculatedTotalData[dimName] || 0) + (parseFloat(row.data[dimName]) || 0);
                }
              });
            }
          });
        }
        return calculatedTotalData;
      })();
      setTotalData(finalTotalData);
      
      // Use totalCompareData from edge function if available
      const finalCompareData = data?.totalCompareData || (() => {
        // Fallback: Calculate comparison totals from rows if not provided
        const calculatedCompareData: Record<string, any> = {};
        if (rows.length > 0 && dimensions.length > 0) {
          rows.forEach((row: any) => {
            if (row.compareData) {
              Object.keys(row.compareData).forEach((dimName: string) => {
                const dim = dimensions.find(d => d.name === dimName);
                if (dim && (dim.type === 'number' || dim.type === 'currency')) {
                  calculatedCompareData[dimName] = (calculatedCompareData[dimName] || 0) + (parseFloat(row.compareData[dimName]) || 0);
                }
              });
            }
          });
        }
        return calculatedCompareData;
      })();
      setTotalCompareData(finalCompareData);
      
      // Use totalChangeData from edge function if available
      const finalChangeData = data?.totalChangeData || (() => {
        // Fallback: Calculate change data from totals
        const calculatedChangeData: Record<string, any> = {};
        
        // Use all dimensions to ensure we calculate change for all metrics
        const allDimNames = new Set<string>();
        Object.keys(finalTotalData).forEach(k => allDimNames.add(k));
        Object.keys(finalCompareData).forEach(k => allDimNames.add(k));
        
        allDimNames.forEach((dimName: string) => {
          const current = finalTotalData[dimName] || 0;
          const previous = finalCompareData[dimName] || 0;
          if (previous !== 0) {
            calculatedChangeData[dimName] = ((current - previous) / previous) * 100;
          } else if (current !== 0) {
            calculatedChangeData[dimName] = current > 0 ? 100 : -100;
          } else {
            calculatedChangeData[dimName] = 0;
          }
        });
        return calculatedChangeData;
      })();
      setTotalChangeData(finalChangeData);
    } catch (error) {
      console.error('[testing] Error loading performance data:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      toast({
        title: "Error loading data",
        description: `Failed to load performance table data: ${errorMessage}`,
        variant: "destructive",
      });
      setTableData([]);
      setTotalData({});
      setTotalCompareData({});
      setTotalChangeData({});
    } finally {
      setIsLoadingData(false);
      onLoadingComplete?.();
    }
  };

  const toggleColumn = (dimensionId: string) => {
    const newVisible = new Set(visibleColumns);
    if (newVisible.has(dimensionId)) {
      newVisible.delete(dimensionId);
    } else {
      newVisible.add(dimensionId);
    }
    setVisibleColumns(newVisible);
  };

  const applyColumnSettings = async () => {
    if (!reportId || !activeViewId || isSharedView) {
      console.log('[testing] Cannot apply column settings:', { reportId: !!reportId, activeViewId: !!activeViewId, isSharedView });
      return;
    }

    try {
      setIsSavingColumnSettings(true);
      console.log('[testing] Applying column visibility settings to view:', activeViewId);

      const viewData = {
        visible_columns: Array.from(visibleColumns),
        column_order: columnOrder,
      };

      console.log('[testing] Updating report_views with data:', viewData);

      const { error } = await supabase
        .from("report_views")
        .update(viewData)
        .eq("id", activeViewId);

      if (error) {
        console.error('[testing] Error updating report_views:', error);
        throw error;
      }

      console.log('[testing] Successfully updated report_views');

      // Update initial state to match current state
      setInitialVisibleColumns(new Set(visibleColumns));
      setInitialColumnOrder([...columnOrder]);

      console.log('[testing] Updated initial state - visible columns:', visibleColumns.size, 'column order:', columnOrder.length);

      toast({
        title: "Success",
        description: "Column visibility settings applied successfully",
      });

      console.log('[testing] Column visibility settings applied successfully');
    } catch (error) {
      console.error("Error applying column settings:", error);
      toast({
        title: "Error",
        description: "Failed to apply column settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSavingColumnSettings(false);
    }
  };

  const cancelColumnSettings = () => {
    setVisibleColumns(new Set(initialVisibleColumns));
    setColumnOrder([...initialColumnOrder]);
    console.log('[testing] Cancelled column visibility changes');
  };

  const hasUnsavedColumnChanges = () => {
    // Compare visible columns
    if (visibleColumns.size !== initialVisibleColumns.size) return true;
    for (const id of visibleColumns) {
      if (!initialVisibleColumns.has(id)) return true;
    }
    
    // Compare column order
    if (columnOrder.length !== initialColumnOrder.length) return true;
    return columnOrder.some((id, index) => id !== initialColumnOrder[index]);
  };
  
  // Get dimensions in the custom order
  const getOrderedDimensions = (): Dimension[] => {
    const metricDimensions = dimensions.filter(d => 
      d.type === 'number' || d.type === 'currency' || d.type === 'percentage' || d.formula
    );
    
    if (columnOrder.length === 0) {
      return metricDimensions;
    }
    
    // Create a map for quick lookup
    const dimensionMap = new Map(metricDimensions.map(d => [d.id, d]));
    
    // First, add dimensions in the saved order
    const ordered: Dimension[] = [];
    columnOrder.forEach(id => {
      const dim = dimensionMap.get(id);
      if (dim) {
        ordered.push(dim);
        dimensionMap.delete(id);
      }
    });
    
    // Add any remaining dimensions that aren't in the order (new dimensions)
    dimensionMap.forEach(dim => ordered.push(dim));
    
    return ordered;
  };
  
  const handleColumnReorder = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const orderedDims = getOrderedDimensions();
      const oldIndex = orderedDims.findIndex(d => d.id === active.id);
      const newIndex = orderedDims.findIndex(d => d.id === over.id);
      
      const newOrder = arrayMove(orderedDims, oldIndex, newIndex).map(d => d.id);
      setColumnOrder(newOrder);
    }
  };
  
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const handleContextMenu = (e: React.MouseEvent, kpi: string) => {
    e.preventDefault();
    // If kpi is "name", it's the group dimension column
    if (kpi === "name" && groupByDimensions[0]) {
      const groupDim = dimensions.find(d => d.id === groupByDimensions[0]);
      setSelectedKPI(groupDim?.name || "name");
    } else {
      setSelectedKPI(kpi);
    }
    setFilterModalOpen(true);
  };

  const handleDimensionSelectorOpen = (
    e: React.MouseEvent,
    selector: "group" | "breakdown" | "then"
  ) => {
    e.preventDefault();
    setCurrentSelector(selector);
    setDimensionSelectorOpen(true);
  };

  const handleDimensionChange = (
    value: string,
    selector: "group" | "breakdown" | "then"
  ) => {
    let targetIndex = 0;
    if (selector === "group") {
      targetIndex = 0;
    } else if (selector === "breakdown") {
      targetIndex = 1;
    } else {
      targetIndex = 2;
    }
    
    // Find the current index of the selected dimension
    const currentIndex = groupByDimensions.indexOf(value);
    
    if (currentIndex === -1) {
      // Dimension not found, shouldn't happen but handle gracefully
      return;
    }
    
    // If clicking on the same dimension that's already at this position, do nothing
    if (currentIndex === targetIndex) {
      return;
    }
    
    // Swap the dimensions - reorder the array
    const newDimensions = [...groupByDimensions];
    const temp = newDimensions[targetIndex];
    newDimensions[targetIndex] = value;
    newDimensions[currentIndex] = temp;
    
    // Sync across all dimension arrays
    setGroupByDimensions(newDimensions);
    setBreakdownByDimensions(newDimensions);
    setThenByDimensions(newDimensions);
  };

  const getSelectorTitle = () => {
    return "Select dimensions";
  };

  const getCurrentDimensions = () => {
    switch (currentSelector) {
      case "group":
        return groupByDimensions;
      case "breakdown":
        return breakdownByDimensions;
      case "then":
        return thenByDimensions;
    }
  };

  const handleDimensionsChange = (dimensions: string[]) => {
    // Auto-sync dimensions across all dropdowns based on selection count
    // The same dimensions are available in all dropdowns
    setGroupByDimensions(dimensions);
    setBreakdownByDimensions(dimensions);
    setThenByDimensions(dimensions);
    setCurrentPage(1); // Reset to first page when grouping changes
  };

  // Apply column filters (text and numeric)
  const filteredTableData = useMemo(() => {
    if (!filters.dimensionFilters || Object.keys(filters.dimensionFilters).length === 0) {
      return tableData;
    }

    console.log('[testing] Applying filters:', filters.dimensionFilters);

    return tableData.filter((row) => {
      // Check each dimension filter
      for (const [dimId, filterValues] of Object.entries(filters.dimensionFilters)) {
        if (!filterValues || filterValues.length === 0) continue;

        const dimension = dimensions.find(d => d.id === dimId);
        if (!dimension) {
          console.log('[testing] Dimension not found for filter:', dimId);
          continue;
        }

        const isNumeric = dimension.type === 'number' || dimension.type === 'currency' || dimension.type === 'percentage';
        const isGroupDimension = groupByDimensions[0] === dimId;
        
        // Check each filter value
        let matchesAnyValue = false;
        for (const filterValue of filterValues) {
          if (isNumeric && (filterValue.startsWith('>') || filterValue.startsWith('<') || filterValue.startsWith('='))) {
            // Numeric comparison filter
            const operator = filterValue[0];
            const threshold = parseFloat(filterValue.substring(1));
            if (isNaN(threshold)) continue;

            const rowValue = row.data[dimension.name];
            const numRowValue = parseFloat(rowValue) || 0;

            let matches = false;
            if (operator === '>') {
              matches = numRowValue > threshold;
            } else if (operator === '<') {
              matches = numRowValue < threshold;
            } else if (operator === '=') {
              matches = Math.abs(numRowValue - threshold) < 0.01; // Allow small floating point differences
            }

            if (matches) {
              matchesAnyValue = true;
              break; // Found a match, no need to check other values
            }
          } else {
            // Text filter - check if row name (for group dimension) or dimension value matches
            const filterLower = filterValue.toLowerCase().trim();
            if (filterLower === '') continue;
            
            // For group dimension, check row name
            if (isGroupDimension) {
              const rowNameLower = row.name.toLowerCase();
              if (rowNameLower.includes(filterLower)) {
                matchesAnyValue = true;
                break; // Found a match
              }
            }
            
            // Check dimension value in row data
            const dimValue = row.data[dimension.name];
            if (dimValue !== undefined && dimValue !== null) {
              const dimValueStr = String(dimValue).toLowerCase();
              if (dimValueStr.includes(filterLower)) {
                matchesAnyValue = true;
                break; // Found a match
              }
            }
          }
        }

        // If no filter value matched, this row doesn't pass this filter
        if (!matchesAnyValue) {
          return false;
        }
      }

      return true; // All filters passed
    });
  }, [tableData, filters.dimensionFilters, dimensions, groupByDimensions]);

  // Paginate data
  const paginatedData = filteredTableData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  
  const totalPages = Math.ceil(filteredTableData.length / itemsPerPage);
  
  // Calculate totals from filtered data
  const totals = useMemo(() => {
    if (filteredTableData.length === 0) return totalData;
    
    // Recalculate totals from filtered data
    // Only sum leaf nodes (rows without children) to avoid double-counting
    const filteredTotals: Record<string, any> = {};
    for (const dim of dimensions) {
      if (dim.formula) continue;
      if (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage') {
        let sum = 0;
        const calculateRowTotal = (rows: TableRow[]) => {
          rows.forEach(row => {
            // Only sum values from leaf nodes (rows without children)
            const hasChildren = row.children && row.children.length > 0;
            if (!hasChildren) {
              const value = row.data[dim.name];
              if (value !== undefined && value !== null) {
                sum += parseFloat(value) || 0;
              }
            }
            // Recursively process children
            if (row.children) {
              calculateRowTotal(row.children);
            }
          });
        };
        calculateRowTotal(filteredTableData);
        filteredTotals[dim.name] = sum;
      }
    }
    
    // Calculate formula totals
    for (const dim of dimensions) {
      if (dim.formula) {
        try {
          let expression = dim.formula;
          const dimensionNames = dimensions.map(d => d.name).sort((a, b) => b.length - a.length);
          for (const dimName of dimensionNames) {
            const value = filteredTotals[dimName] || 0;
            const escapedName = dimName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\b${escapedName}\\b`, 'g');
            expression = expression.replace(regex, `(${value})`);
          }
          const result = eval(expression);
          filteredTotals[dim.name] = typeof result === 'number' && !isNaN(result) && isFinite(result) ? result : 0;
        } catch (error) {
          filteredTotals[dim.name] = 0;
        }
      }
    }
    
    return filteredTotals;
  }, [filteredTableData, dimensions, totalData]);

  // Calculate comparison totals and change percentages from filtered data
  const compareTotalsAndChanges = useMemo(() => {
    if (!filters.compareEnabled || filteredTableData.length === 0) {
      return { compareTotals: {}, changeData: {} };
    }

    // Calculate comparison totals from filtered data
    const filteredCompareTotals: Record<string, any> = {};
    for (const dim of dimensions) {
      if (dim.formula) continue;
      if (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage') {
        let sum = 0;
        const calculateRowTotal = (rows: TableRow[]) => {
          rows.forEach(row => {
            const hasChildren = row.children && row.children.length > 0;
            if (!hasChildren && row.compareData) {
              const value = row.compareData[dim.name];
              if (value !== undefined && value !== null) {
                sum += parseFloat(value) || 0;
              }
            }
            if (row.children) {
              calculateRowTotal(row.children);
            }
          });
        };
        calculateRowTotal(filteredTableData);
        filteredCompareTotals[dim.name] = sum;
      }
    }

    // Calculate formula comparison totals
    for (const dim of dimensions) {
      if (dim.formula) {
        try {
          let expression = dim.formula;
          const dimensionNames = dimensions.map(d => d.name).sort((a, b) => b.length - a.length);
          for (const dimName of dimensionNames) {
            const value = filteredCompareTotals[dimName] || 0;
            const escapedName = dimName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\b${escapedName}\\b`, 'g');
            expression = expression.replace(regex, `(${value})`);
          }
          const result = eval(expression);
          filteredCompareTotals[dim.name] = typeof result === 'number' && !isNaN(result) && isFinite(result) ? result : 0;
        } catch (error) {
          filteredCompareTotals[dim.name] = 0;
        }
      }
    }

    // Calculate change percentages
    const calculatedChangeData: Record<string, number> = {};
    const allDimNames = new Set<string>();
    Object.keys(totals).forEach(k => allDimNames.add(k));
    Object.keys(filteredCompareTotals).forEach(k => allDimNames.add(k));
    
    allDimNames.forEach((dimName: string) => {
      const current = totals[dimName] || 0;
      const previous = filteredCompareTotals[dimName] || 0;
      if (previous !== 0) {
        calculatedChangeData[dimName] = ((current - previous) / previous) * 100;
      } else if (current !== 0) {
        calculatedChangeData[dimName] = current > 0 ? 100 : -100;
      } else {
        calculatedChangeData[dimName] = 0;
      }
    });

    return { compareTotals: filteredCompareTotals, changeData: calculatedChangeData };
  }, [filteredTableData, dimensions, totals, filters.compareEnabled]);

  const renderRow = (row: TableRow) => {
    const isExpanded = expandedRows.has(row.id);
    const hasChildren = row.children && row.children.length > 0;

    return (
      <>
        <tr
          key={row.id}
          className={cn(
            "border-b hover:bg-muted/50 transition-colors cursor-pointer",
            row.level === 1 && "bg-muted/20",
            row.level === 2 && "bg-muted/10"
          )}
          onClick={() => hasChildren && toggleRow(row.id)}
        >
          <td className="py-3 px-4" style={{ paddingLeft: `${row.level * 2 + 1}rem` }}>
            <div className="flex items-center gap-2">
              {hasChildren ? (
                <div className="text-muted-foreground">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </div>
              ) : (
                <div className="w-4" />
              )}
              <span className={cn("font-medium", row.level > 0 && "font-normal")}>
                {formatRowName(row.name, row.level)}
              </span>
            </div>
          </td>
          {getOrderedDimensions()
            .filter(d => visibleColumns.has(d.id))
            .map((dimension) => {
              const value = row.data[dimension.name];
              const change = row.changeData?.[dimension.name];
              const hasComparison = filters.compareEnabled && change !== undefined;
              
              return (
                <td key={dimension.id} className="py-3 px-4 text-right">
                  <div className="flex flex-col items-end gap-1">
                    <span>{formatValue(value, dimension)}</span>
                    {hasComparison && (
                      <span className={cn(
                        "text-xs flex items-center gap-1",
                        change > 0 ? "text-green-600" : change < 0 ? "text-red-600" : "text-muted-foreground"
                      )}>
                        {change > 0 && <ArrowUp className="h-3 w-3" />}
                        {change < 0 && <ArrowDown className="h-3 w-3" />}
                        {change === 0 && <Minus className="h-3 w-3" />}
                        {Math.abs(change).toFixed(1)}%
                      </span>
                    )}
                  </div>
                </td>
              );
            })}
        </tr>
        {isExpanded &&
          row.children?.map((child) => (
            <Fragment key={child.id}>
              {renderRow(child)}
            </Fragment>
          ))}
      </>
    );
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          {/* Table View Tabs */}
          {tableViews.length > 0 && (
            <Tabs value={activeViewId || undefined} onValueChange={handleViewChange} className="mb-4">
              <div className="flex items-center gap-2">
                <TabsList>
                  {tableViews.map((view) => (
                    <TabsTrigger 
                      key={view.id} 
                      value={view.id}
                      onDoubleClick={!isSharedView ? () => handleTabDoubleClick(view.id, view.name) : undefined}
                      className="relative"
                    >
                      {!isSharedView && editingTabId === view.id ? (
                        <input
                          type="text"
                          value={editingTabName}
                          onChange={(e) => setEditingTabName(e.target.value)}
                          onBlur={handleTabNameSave}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleTabNameSave();
                            } else if (e.key === 'Escape') {
                              handleTabNameCancel();
                            }
                          }}
                          className="bg-transparent border-none outline-none text-center w-full px-0"
                          autoFocus
                          onClick={(e) => e.stopPropagation()}
                        />
                      ) : (
                        view.name
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </div>
            </Tabs>
          )}
          
          <div className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-sm">
                {/* Group by - always shown */}
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Group by:</span>
                  {groupByDimensions.length > 0 ? (
                    <Select
                      value={groupByDimensions[0] || ""}
                      onValueChange={(value) => handleDimensionChange(value, "group")}
                    >
                      <SelectTrigger 
                        className="w-40 bg-background"
                        onContextMenu={!isSharedView ? (e) => handleDimensionSelectorOpen(e as any, "group") : undefined}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        {groupByDimensions.map((dimId) => {
                          const dim = dimensions.find(d => d.id === dimId);
                          const hasData = reportId ? dimensionHasData[dimId] : undefined;
                          return dim ? (
                            <SelectItem key={dim.id} value={dim.id}>
                              <div className="flex items-center gap-2">
                                {reportId && (
                                  hasData !== undefined ? (
                                    hasData ? (
                                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                    ) : (
                                      <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                                    )
                                  ) : (
                                    <div className="h-3.5 w-3.5" />
                                  )
                                )}
                                <span>{dim.name}</span>
                              </div>
                            </SelectItem>
                          ) : null;
                        })}
                      </SelectContent>
                    </Select>
                  ) : !isSharedView ? (
                    <Button
                      variant="outline"
                      className="w-40 justify-start"
                      onContextMenu={(e) => handleDimensionSelectorOpen(e, "group")}
                      onClick={(e) => handleDimensionSelectorOpen(e as any, "group")}
                    >
                      <span className="text-muted-foreground">Right-click to select</span>
                    </Button>
                  ) : (
                    <span className="text-sm text-muted-foreground">-</span>
                  )}
                </div>
                {/* Breakdown by - shown only if 2+ dimensions selected */}
                {groupByDimensions.length >= 2 && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Breakdown by:</span>
                    <Select
                      value={breakdownByDimensions[1] || ""}
                      onValueChange={(value) => handleDimensionChange(value, "breakdown")}
                    >
                      <SelectTrigger 
                        className="w-40 bg-background"
                        onContextMenu={!isSharedView ? (e) => handleDimensionSelectorOpen(e as any, "breakdown") : undefined}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        {breakdownByDimensions.map((dimId) => {
                          const dim = dimensions.find(d => d.id === dimId);
                          const hasData = reportId ? dimensionHasData[dimId] : undefined;
                          return dim ? (
                            <SelectItem key={dim.id} value={dim.id}>
                              <div className="flex items-center gap-2">
                                {reportId && (
                                  hasData !== undefined ? (
                                    hasData ? (
                                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                    ) : (
                                      <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                                    )
                                  ) : (
                                    <div className="h-3.5 w-3.5" />
                                  )
                                )}
                                <span>{dim.name}</span>
                              </div>
                            </SelectItem>
                          ) : null;
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {/* Then by - shown only if 3+ dimensions selected */}
                {groupByDimensions.length >= 3 && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Then by:</span>
                    <Select
                      value={thenByDimensions[2] || ""}
                      onValueChange={(value) => handleDimensionChange(value, "then")}
                    >
                      <SelectTrigger 
                        className="w-40 bg-background"
                        onContextMenu={!isSharedView ? (e) => handleDimensionSelectorOpen(e as any, "then") : undefined}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        {thenByDimensions.map((dimId) => {
                          const dim = dimensions.find(d => d.id === dimId);
                          const hasData = reportId ? dimensionHasData[dimId] : undefined;
                          return dim ? (
                            <SelectItem key={dim.id} value={dim.id}>
                              <div className="flex items-center gap-2">
                                {reportId && (
                                  hasData !== undefined ? (
                                    hasData ? (
                                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                    ) : (
                                      <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                                    )
                                  ) : (
                                    <div className="h-3.5 w-3.5" />
                                  )
                                )}
                                <span>{dim.name}</span>
                              </div>
                            </SelectItem>
                          ) : null;
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              
              {!isSharedView && (
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="icon" 
                    className="h-9 w-9"
                    onClick={handleDuplicateView}
                    title="Duplicate table"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  
                  {tableViews.length > 1 && (
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-9 w-9 text-destructive hover:text-destructive"
                      onClick={() => activeViewId && handleDeleteView(activeViewId)}
                      title="Delete table"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                  
                  <Sheet onOpenChange={(open) => {
                    if (open) {
                      // Refresh dimensions when opening column visibility to show newly added dimensions
                      loadDimensions();
                    }
                  }}>
                    <SheetTrigger asChild>
                      <Button variant="outline" size="icon" className="h-9 w-9">
                        <Columns3 className="h-4 w-4" />
                      </Button>
                    </SheetTrigger>
                      <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
                       <SheetHeader>
                         <SheetTitle>Column Visibility</SheetTitle>
                         <SheetDescription>
                           Show or hide columns in the table
                         </SheetDescription>
                       </SheetHeader>
                       
                        <div className="mt-6 space-y-6">
                          {/* Columns Section */}
                          <div className="space-y-3">
                            <h3 className="text-sm font-semibold">Columns</h3>
                            <DndContext
                              sensors={sensors}
                              collisionDetection={closestCenter}
                              onDragEnd={handleColumnReorder}
                            >
                              <SortableContext
                                items={getOrderedDimensions().map(d => d.id)}
                                strategy={verticalListSortingStrategy}
                              >
                                <div className="space-y-2">
                                  {getOrderedDimensions().map((dimension) => (
                                    <SortableColumnItem
                                      key={dimension.id}
                                      dimension={dimension}
                                      isVisible={visibleColumns.has(dimension.id)}
                                      onToggle={() => toggleColumn(dimension.id)}
                                    />
                                  ))}
                                </div>
                              </SortableContext>
                            </DndContext>
                          </div>
                        </div>

                        {/* Apply/Cancel buttons for Column Visibility */}
                        {hasUnsavedColumnChanges() && (
                          <div className="border-t pt-4 mt-6 space-y-3">
                            <div className="flex gap-2">
                              <Button 
                                onClick={applyColumnSettings} 
                                disabled={isSavingColumnSettings}
                                className="flex-1 gap-2"
                                variant="default"
                              >
                                <Save className="h-4 w-4" />
                                {isSavingColumnSettings ? "Applying..." : "Apply Changes"}
                              </Button>
                              <Button 
                                onClick={cancelColumnSettings} 
                                disabled={isSavingColumnSettings}
                                variant="outline"
                                className="gap-2"
                              >
                                <X className="h-4 w-4" />
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                     </SheetContent>
                </Sheet>
              </div>
              )}
          </div>
        </CardHeader>
        <CardContent>
          {groupByDimensions.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              {isSharedView ? "No data available" : "Right-click on \"Group by\" to select dimensions"}
            </div>
          ) : isLoadingData ? (
            <div className="space-y-4">
              {/* Table header skeleton */}
              <div className="overflow-x-auto">
                <div className="flex gap-4 border-b pb-3">
                  <Skeleton className="h-6 w-32" />
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-6 w-24" />
                  ))}
                </div>
              </div>
              {/* Table rows skeleton */}
              <div className="space-y-3">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="flex gap-4 items-center">
                    <Skeleton className="h-5 w-40" />
                    {[...Array(5)].map((_, j) => (
                      <Skeleton key={j} className="h-5 w-24" />
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ) : tableData.length === 0 && !isLoadingData ? (
            <div className="py-8 text-center text-muted-foreground">
              {isSharedView ? "No data available for the selected filters." : "No data available. This may indicate that no data has been synced yet or the filters don't match any data."}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b bg-muted/30">
                    <tr>
                      <th
                        className="py-3 px-4 text-left font-medium text-sm"
                        onContextMenu={(e) => handleContextMenu(e, "name")}
                      >
                      {groupByDimensions[0] 
                        ? dimensions.find(d => d.id === groupByDimensions[0])?.name || "Name"
                        : "Name"}
                    </th>
                      {getOrderedDimensions()
                        .filter(d => visibleColumns.has(d.id))
                        .map((dimension) => (
                          <th
                            key={dimension.id}
                            className="py-3 px-4 text-right font-medium text-sm"
                            onContextMenu={(e) => handleContextMenu(e, dimension.name)}
                          >
                            {dimension.name}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedData.map((row) => (
                      <Fragment key={row.id}>
                        {renderRow(row)}
                      </Fragment>
                    ))}
                    {/* Total row */}
                    <tr className="border-t-2 border-primary/20 bg-muted/50 font-semibold">
                      <td className="py-3 px-4">Total</td>
                      {getOrderedDimensions()
                        .filter(d => visibleColumns.has(d.id))
                        .map((dimension) => {
                          const value = totals[dimension.name];
                          
                          return (
                            <td key={dimension.id} className="py-3 px-4 text-right">
                              <span>{formatValue(value, dimension)}</span>
                            </td>
                          );
                        })}
                    </tr>
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                    {Math.min(currentPage * itemsPerPage, filteredTableData.length)} of{" "}
                    {filteredTableData.length} rows
                  </div>
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                          className={cn(
                            currentPage === 1 && "pointer-events-none opacity-50",
                            "cursor-pointer"
                          )}
                        />
                      </PaginationItem>
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter((page) => {
                          // Show first page, last page, current page, and pages around current
                          return (
                            page === 1 ||
                            page === totalPages ||
                            Math.abs(page - currentPage) <= 1
                          );
                        })
                        .map((page, index, array) => {
                          // Add ellipsis if there's a gap
                          const prevPage = array[index - 1];
                          const showEllipsis = prevPage && page - prevPage > 1;
                          
                          return (
                            <>
                              {showEllipsis && (
                                <PaginationItem key={`ellipsis-${page}`}>
                                  <PaginationEllipsis />
                                </PaginationItem>
                              )}
                              <PaginationItem key={page}>
                                <PaginationLink
                                  onClick={() => setCurrentPage(page)}
                                  isActive={currentPage === page}
                                  className="cursor-pointer"
                                >
                                  {page}
                                </PaginationLink>
                              </PaginationItem>
                            </>
                          );
                        })}
                      <PaginationItem>
                        <PaginationNext
                          onClick={() =>
                            setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                          }
                          className={cn(
                            currentPage === totalPages && "pointer-events-none opacity-50",
                            "cursor-pointer"
                          )}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </>
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

      <DimensionSelectorModal
        open={dimensionSelectorOpen}
        onOpenChange={setDimensionSelectorOpen}
        title={getSelectorTitle()}
        selectedDimensions={getCurrentDimensions()}
        onDimensionsChange={handleDimensionsChange}
        onDateGranularityChange={(granularity) => setDateGranularity(granularity as any)}
        currentDateGranularity={dateGranularity}
        reportId={reportId}
      />
    </>
  );
};
