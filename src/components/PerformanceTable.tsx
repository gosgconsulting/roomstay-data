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
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { ChevronDown, ChevronRight, Columns3, Copy, Trash2, Plus, ArrowUp, ArrowDown, Minus, GripVertical } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { useState, useEffect, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { MappingModal } from "./MappingModal";
import { DimensionSelectorModal } from "./DimensionSelectorModal";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfWeek, startOfMonth, startOfYear } from "date-fns";
import { FilterState } from "./FiltersBar";
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

export const PerformanceTable = ({ reportId, filters, isSharedView = false }: PerformanceTableProps) => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [dimensionSelectorOpen, setDimensionSelectorOpen] = useState(false);
  const [selectedKPI, setSelectedKPI] = useState("");
  const [currentSelector, setCurrentSelector] = useState<"group" | "breakdown" | "then">("group");
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set());
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
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
  
  // State for date granularity - default to 'none'
  const [dateGranularity, setDateGranularity] = useState<'none' | 'day' | 'week' | 'month' | 'year'>('none');
  const [dateOrder, setDateOrder] = useState<'asc' | 'desc'>('desc');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // Tab editing state
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabName, setEditingTabName] = useState("");

  useEffect(() => {
    if (reportId) {
      loadDimensions();
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
    }
  }, [reportId]);

  useEffect(() => {
    if (reportId && dimensions.length > 0) {
      loadAllViews();
    }
  }, [reportId, dimensions.length]);

  // Debounced filter change to reduce API calls
  const debouncedFilters = useMemo(() => filters, [JSON.stringify(filters)]);

  useEffect(() => {
    if (reportId && groupByDimensions.length > 0 && dimensions.length > 0) {
      loadPerformanceData();
    }
  }, [reportId, groupByDimensions, breakdownByDimensions, thenByDimensions, dimensions.length, dateOrder, debouncedFilters]);

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

      // Find first text dimension to use as default grouping
      const defaultGroupDimension = dimensions.find(d => d.type === 'text');
      
      console.log('Creating default view for report:', reportId, 'with dimension:', defaultGroupDimension?.name);

      // Set default visible columns - hide some columns by default
      const hiddenColumns = ['Impression Share', 'CPM', 'Leads'];
      const defaultVisibleIds = dimensions
        .filter(d => !hiddenColumns.includes(d.name) && 
                    (d.type === 'number' || d.type === 'currency' || d.type === 'percentage' || d.formula))
        .map(d => d.id);
      
      const defaultColumnOrder = dimensions
        .filter(d => d.type === 'number' || d.type === 'currency' || d.type === 'percentage' || d.formula)
        .map(d => d.id);

      // Set default KPI settings - all numeric/currency dimensions visible
      const defaultKPIs = dimensions
        .filter(d => d.type === 'number' || d.type === 'currency' || d.type === 'percentage')
        .map(d => d.name);

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
          date_granularity: 'none',
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
    
    // Load saved settings
    let groupDimensions = view.group_by_dimensions || [];
    
    // If no grouping dimension is set and dimensions are available, set a default
    if (groupDimensions.length === 0 && dimensions.length > 0) {
      // Find a suitable text dimension for grouping (like Hotel, Channel, etc.)
      const textDimension = dimensions.find(d => d.type === 'text');
      if (textDimension) {
        groupDimensions = [textDimension.id];
        console.log('Auto-selected grouping dimension:', textDimension.name);
      }
    }
    
    setGroupByDimensions(groupDimensions);
    setBreakdownByDimensions(view.breakdown_by_dimensions || []);
    setThenByDimensions(view.then_by_dimensions || []);
    
    if (view.visible_columns && view.visible_columns.length > 0) {
      console.log('Loading visible columns:', view.visible_columns);
      setVisibleColumns(new Set(view.visible_columns));
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
    }
    
    // Load column order if available
    if (view.column_order && view.column_order.length > 0) {
      console.log('Loading column order:', view.column_order);
      setColumnOrder(view.column_order);
    } else if (dimensions.length > 0) {
      // Set default order based on dimensions
      const metricDimensions = dimensions.filter(d => 
        d.type === 'number' || d.type === 'currency' || d.type === 'percentage' || d.formula
      );
      setColumnOrder(metricDimensions.map(d => d.id));
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
          date_granularity: activeView.date_granularity || 'none',
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

  const loadDimensions = async () => {
    if (!reportId) return;
    
    try {
      // Get the current user to load all their dimensions
      const { data: { user } } = await supabase.auth.getUser();
      
      let data = null;

      // Fetch dimensions accessible to the user
      if (user) {
        try {
          const { data: allDims, error: dimError } = await supabase
            .from("dimensions")
            .select("*");

          if (dimError) throw dimError;

          // Filter to global dimensions and custom dimensions for this report if reportId provided
          if (reportId) {
            data = (allDims || []).filter((d: any) =>
              d.scope === 'global' ||
              (d.scope === 'custom' && d.report_id === reportId)
            );
          } else {
            data = allDims || [];
          }
        } catch (error) {
          console.error('Error loading dimensions:', error);
          data = [];
        }
      }

      // If no dimensions found, try falling back to loading from dimension_data
      if (!data || data.length === 0) {
        const { data: dimensionData, error: dimDataError } = await supabase
          .from("dimension_data")
          .select("dimension_values")
          .limit(1);

        if (dimDataError) throw dimDataError;

        if (dimensionData && dimensionData.length > 0) {
          const dimensionIds = Object.keys(dimensionData[0].dimension_values as Record<string, any>);

          if (dimensionIds.length > 0) {
            const { data: dimensionsById, error: dimError2 } = await supabase
              .from("dimensions")
              .select("*")
              .in("id", dimensionIds);

            if (dimError2) throw dimError2;
            data = dimensionsById;
          }
        }
      }

      // Define the desired column order
      const columnOrder = [
        'Impressions',
        'Impression Share',
        'Clicks',
        'CTR',
        'Conversions',
        'Conversion Rate',
        'CPC',
        'CPM',
        'Cost',
        'Revenue',
        'Leads',
        'ROAS',
        'Cost of sale'
      ];

      // Sort dimensions according to the defined order
      const sortedDimensions = (data || []).sort((a, b) => {
        const indexA = columnOrder.indexOf(a.name);
        const indexB = columnOrder.indexOf(b.name);
        
        // If not in the order list, put at the end
        if (indexA === -1 && indexB === -1) return 0;
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        
        return indexA - indexB;
      });

      // Deduplicate dimensions by name (keep first occurrence)
      const seenNames = new Set<string>();
      const uniqueDimensions = sortedDimensions.filter(dim => {
        if (seenNames.has(dim.name)) {
          return false;
        }
        seenNames.add(dim.name);
        return true;
      });

      setDimensions(uniqueDimensions);
      
      // Initialize column order if not set
      if (columnOrder.length === 0) {
        const metricDimensions = uniqueDimensions.filter(d => 
          d.type === 'number' || d.type === 'currency' || d.type === 'percentage' || d.formula
        );
        setColumnOrder(metricDimensions.map(d => d.id));
      }
      
      // Set default visibility only if no saved view exists
      // This will be overridden by loadViewSettings if a saved view exists
      const hiddenColumns = ['Impression Share', 'CPM', 'Leads'];
      const defaultVisible = new Set<string>(
        uniqueDimensions
          .filter(d => !hiddenColumns.includes(d.name) && 
                      (d.type === 'number' || d.type === 'currency' || d.type === 'percentage' || d.formula))
          .map(d => d.id)
      );
      setVisibleColumns(defaultVisible);
    } catch (error) {
      console.error("Error loading dimensions:", error);
    } finally {
      setIsLoadingDimensions(false);
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
    if (!reportId || groupByDimensions.length === 0) {
      setTableData([]);
      setTotalData({});
      setTotalCompareData({});
      setTotalChangeData({});
      return;
    }

    setIsLoadingData(true);

    try {
      const { data, error } = await supabase.functions.invoke('get-performance-data', {
        body: {
          reportId,
          groupByDims: groupByDimensions,
          breakdownDims: breakdownByDimensions,
          thenByDims: thenByDimensions,
          dimensionFilters: filters.dimensionFilters,
          dateFrom: filters.dateRange?.from?.toISOString(),
          dateTo: filters.dateRange?.to?.toISOString(),
          visibleDimensionIds: Array.from(visibleColumns),
          limit: 10000, // Reasonable limit to prevent timeouts
          offset: 0,
          compareEnabled: filters.compareEnabled || false,
          compareDateFrom: filters.compareDateRange?.from?.toISOString(),
          compareDateTo: filters.compareDateRange?.to?.toISOString(),
          dateGranularity: dateGranularity,
          dateOrder: dateOrder,
        },
      });

      if (error) {
        console.error('Error loading performance data:', error);
        toast({
          title: "Error loading data",
          description: "Failed to load performance table data.",
          variant: "destructive",
        });
        return;
      }

      console.log('Loaded performance data:', data);
      setTableData(data.rows || []);
      setTotalData(data.totalData || {});
      setTotalCompareData(data.totalCompareData || {});
      setTotalChangeData(data.totalChangeData || {});
    } catch (error) {
      console.error('Error loading performance data:', error);
    } finally {
      setIsLoadingData(false);
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
    setSelectedKPI(kpi);
    setMappingModalOpen(true);
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

  // Calculate totals from server-side data
  const calculateTotals = (): Record<string, any> => {
    // Use server-side totals directly
    return totalData;
  };

  // Paginate data
  const paginatedData = tableData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );
  
  const totalPages = Math.ceil(tableData.length / itemsPerPage);
  const totals = calculateTotals();

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
          row.children?.map((child) => renderRow(child))}
      </>
    );
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          {/* Table View Tabs */}
          {!isSharedView && tableViews.length > 0 && (
            <Tabs value={activeViewId || undefined} onValueChange={handleViewChange} className="mb-4">
              <div className="flex items-center gap-2">
                <TabsList>
                  {tableViews.map((view) => (
                    <TabsTrigger 
                      key={view.id} 
                      value={view.id}
                      onDoubleClick={() => handleTabDoubleClick(view.id, view.name)}
                      className="relative"
                    >
                      {editingTabId === view.id ? (
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
                          return dim ? (
                            <SelectItem key={dim.id} value={dim.id}>
                              {dim.name}
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
                          return dim ? (
                            <SelectItem key={dim.id} value={dim.id}>
                              {dim.name}
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
                          return dim ? (
                            <SelectItem key={dim.id} value={dim.id}>
                              {dim.name}
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
            <div className="py-8 text-center text-muted-foreground">
              Loading data...
            </div>
          ) : tableData.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              No data available. Connect a data source to view the table.
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
                    {paginatedData.map((row) => renderRow(row))}
                    {/* Total row */}
                    <tr className="border-t-2 border-primary/20 bg-muted/50 font-semibold">
                      <td className="py-3 px-4">Total</td>
                      {getOrderedDimensions()
                        .filter(d => visibleColumns.has(d.id))
                        .map((dimension) => {
                          const value = totals[dimension.name];
                          const change = totalChangeData[dimension.name];
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
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Showing {(currentPage - 1) * itemsPerPage + 1} to{" "}
                    {Math.min(currentPage * itemsPerPage, tableData.length)} of{" "}
                    {tableData.length} rows
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

      <MappingModal
        open={mappingModalOpen}
        onOpenChange={setMappingModalOpen}
        kpiName={selectedKPI}
      />

      <DimensionSelectorModal
        open={dimensionSelectorOpen}
        onOpenChange={setDimensionSelectorOpen}
        title={getSelectorTitle()}
        selectedDimensions={getCurrentDimensions()}
        onDimensionsChange={handleDimensionsChange}
        onDateGranularityChange={(granularity) => setDateGranularity(granularity as any)}
        currentDateGranularity={dateGranularity}
      />
    </>
  );
};
