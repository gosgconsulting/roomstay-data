import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getAccountDefaultKPIs } from "@/lib/utils";
import { mapDimensionIds, mapVisibleColumns } from "@/lib/performanceTable/viewSettingsMapper";
import type { Dimension } from "./usePerformanceTableDimensions";

interface View {
  id: string;
  name: string;
  group_by_dimensions?: string[];
  breakdown_by_dimensions?: string[];
  then_by_dimensions?: string[];
  visible_columns?: string[];
  column_order?: string[];
  date_granularity?: string;
  date_order?: string;
  is_default?: boolean;
  visible_kpis?: string[];
  kpi_order?: string[];
}

interface UsePerformanceTableViewsOptions {
  reportId: string | null;
  isSharedView: boolean;
  accountName?: string;
  dimensions: Dimension[];
  onGroupByChange: (dims: string[]) => void;
  onBreakdownByChange: (dims: string[]) => void;
  onThenByChange: (dims: string[]) => void;
  onVisibleColumnsChange: (columns: Set<string>) => void;
  onInitialVisibleColumnsChange: (columns: Set<string>) => void;
  onColumnOrderChange: (order: string[]) => void;
  onInitialColumnOrderChange: (order: string[]) => void;
  onDateGranularityChange: (granularity: 'day' | 'week' | 'month' | 'year') => void;
  onDateOrderChange: (order: 'asc' | 'desc') => void;
}

/**
 * Hook for managing table views in PerformanceTable
 */
export function usePerformanceTableViews({
  reportId,
  isSharedView,
  accountName,
  dimensions,
  onGroupByChange,
  onBreakdownByChange,
  onThenByChange,
  onVisibleColumnsChange,
  onInitialVisibleColumnsChange,
  onColumnOrderChange,
  onInitialColumnOrderChange,
  onDateGranularityChange,
  onDateOrderChange,
}: UsePerformanceTableViewsOptions) {
  const [tableViews, setTableViews] = useState<View[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  const loadAllViews = useCallback(async () => {
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
        console.log('No views found, creating default views');
        await createDefaultViews();
      } else {
        console.log('No views found for shared report');
      }
    } catch (error) {
      console.error("Error loading views:", error);
    }
  }, [reportId, isSharedView, accountName, dimensions.length]);

  const loadViewSettingsFromData = useCallback(async (view: View) => {
    if (!view) {
      console.error("No view data provided");
      return;
    }

    console.log('Loading view settings for:', view.name, view);
    
    // Load saved settings - map dimension IDs asynchronously
    const loadDimensionsAsync = async () => {
      const groupDimensions = await mapDimensionIds(view.group_by_dimensions || [], dimensions);
      const breakdownDimensions = await mapDimensionIds(view.breakdown_by_dimensions || [], dimensions);
      const thenDimensions = await mapDimensionIds(view.then_by_dimensions || [], dimensions);
      
      // Find Date dimension
      const dateDimension = dimensions.find(d => d.type === 'date');
      
      // If no grouping dimension is set and dimensions are available, set a default
      let finalGroupDimensions = groupDimensions;
      if (groupDimensions.length === 0 && dimensions.length > 0) {
        // Prefer Date first, then text dimensions
        if (dateDimension) {
          finalGroupDimensions = [dateDimension.id];
          console.log('Auto-selected Date dimension for grouping:', dateDimension.name);
        } else {
          const textDimension = dimensions.find(d => d.type === 'text');
          if (textDimension) {
            finalGroupDimensions = [textDimension.id];
            console.log('Auto-selected text dimension for grouping:', textDimension.name);
          } else {
            // Fallback to first available dimension
            finalGroupDimensions = [dimensions[0].id];
            console.log('Auto-selected first available dimension for grouping:', dimensions[0].name);
          }
        }
      }
      
      // Ensure Date dimension is included in selected dimensions if it exists
      // Add it to breakdown if not already in group, breakdown, or then
      let finalBreakdownDimensions = breakdownDimensions;
      let finalThenDimensions = thenDimensions;
      
      if (dateDimension) {
        const allSelectedIds = [...finalGroupDimensions, ...finalBreakdownDimensions, ...finalThenDimensions];
        const dateAlreadySelected = allSelectedIds.includes(dateDimension.id);
        
        if (!dateAlreadySelected) {
          // Add Date dimension to breakdown by default if not already selected
          finalBreakdownDimensions = [dateDimension.id, ...finalBreakdownDimensions];
          console.log('Auto-added Date dimension to breakdown by default:', dateDimension.name);
        }
      }
      
      onGroupByChange(finalGroupDimensions);
      onBreakdownByChange(finalBreakdownDimensions);
      onThenByChange(finalThenDimensions);
    };
    
    loadDimensionsAsync();
    
    if (view.visible_columns && view.visible_columns.length > 0) {
      console.log('[testing] Loading visible columns from view:', view.visible_columns.length, 'columns');
      console.log('[testing] Visible column IDs:', view.visible_columns);
      
      // Map old dimension IDs to account-scoped dimension IDs
      const loadVisibleColumnsAsync = async () => {
        const mappedVisibleColumns = await mapVisibleColumns(view.visible_columns || [], dimensions);
        
        const visibleSet = new Set<string>(mappedVisibleColumns);
        onVisibleColumnsChange(visibleSet);
        onInitialVisibleColumnsChange(new Set<string>(visibleSet));
        console.log('[testing] Set visibleColumns state:', visibleSet.size, 'columns (mapped from', view.visible_columns.length, 'original)');
      };
      
      loadVisibleColumnsAsync();
    } else {
      // No saved visible_columns - set defaults based on dimension type
      console.log('[testing] No saved visible_columns, setting defaults');
      const hiddenColumns = ['Impression Share', 'CPM', 'Leads'];
      const defaultVisible = new Set<string>(
        dimensions
          .filter(d => !hiddenColumns.includes(d.name) && 
                      (d.type === 'number' || d.type === 'currency' || d.type === 'percentage' || d.formula))
          .map(d => d.id)
      );
      console.log('[testing] Setting default visible columns:', Array.from(defaultVisible));
      onVisibleColumnsChange(defaultVisible);
      onInitialVisibleColumnsChange(new Set(defaultVisible));
    }
    
    
    // Load column order if available
    if (view.column_order && view.column_order.length > 0) {
      console.log('Loading column order:', view.column_order);
      onColumnOrderChange(view.column_order);
      onInitialColumnOrderChange([...view.column_order]);
    } else if (dimensions.length > 0) {
      // Set default order based on dimensions
      const metricDimensions = dimensions.filter(d => 
        d.type === 'number' || d.type === 'currency' || d.type === 'percentage' || d.formula
      );
      const orderIds = metricDimensions.map(d => d.id);
      onColumnOrderChange(orderIds);
      onInitialColumnOrderChange([...orderIds]);
    }
    
    // Load date granularity if available (default to day)
    if (view.date_granularity && view.date_granularity !== 'none') {
      console.log('Loading date granularity:', view.date_granularity);
      onDateGranularityChange(view.date_granularity as 'day' | 'week' | 'month' | 'year');
    }
    
    // Load date order if available (default to desc)
    if (view.date_order) {
      console.log('Loading date order:', view.date_order);
      onDateOrderChange(view.date_order as 'asc' | 'desc');
    }
    
    console.log('View settings loaded successfully');
  }, [dimensions.length, onGroupByChange, onBreakdownByChange, onThenByChange, onVisibleColumnsChange, onInitialVisibleColumnsChange, onColumnOrderChange, onInitialColumnOrderChange, onDateGranularityChange, onDateOrderChange]);

  const createDefaultViews = useCallback(async () => {
    if (!reportId) {
      console.error("Cannot create default views: No reportId");
      return;
    }
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error("Cannot create default views: No user");
        return;
      }

      // Find date dimension first, fallback to text dimension for default grouping
      const dateDimension = dimensions.find(d => d.type === 'date');
      const defaultGroupDimension = dateDimension || dimensions.find(d => d.type === 'text');
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

      // Create four default views for different date granularities
      const dateGranularities: Array<{name: string, granularity: 'day' | 'week' | 'month' | 'year', isDefault: boolean}> = [
        { name: "Day", granularity: 'day', isDefault: true },
        { name: "Week", granularity: 'week', isDefault: false },
        { name: "Month", granularity: 'month', isDefault: false },
        { name: "Year", granularity: 'year', isDefault: false }
      ];

      const createdViews = [];
      
      for (const dateConfig of dateGranularities) {
        const { data: newView, error } = await supabase
          .from("report_views")
          .insert({
            report_id: reportId,
            user_id: user.id,
            name: dateConfig.name,
            is_default: dateConfig.isDefault,
            group_by_dimensions: defaultGroupDimension ? [defaultGroupDimension.id] : [],
            // Always include Date dimension in breakdown if it exists and isn't already in group
            breakdown_by_dimensions: dateDimension && defaultGroupDimension?.id !== dateDimension.id 
              ? [dateDimension.id] 
              : [],
            then_by_dimensions: [],
            visible_columns: defaultVisibleIds,
            column_order: defaultColumnOrder,
            visible_kpis: defaultKPIs,
            kpi_order: defaultKPIs,
            date_granularity: dateConfig.granularity,
            date_order: 'desc',
          })
          .select()
          .single();

        if (error) {
          console.error(`Error creating ${dateConfig.name} view:`, error);
          continue;
        }

        if (newView) {
          createdViews.push(newView);
        }
      }

      if (createdViews.length > 0) {
        console.log(`Created ${createdViews.length} default views successfully`);
        setTableViews(createdViews);
        const defaultView = createdViews.find(v => v.is_default) || createdViews[0];
        setActiveViewId(defaultView.id);
        // Load settings directly from the default view
        loadViewSettingsFromData(defaultView);
      }
    } catch (error) {
      console.error("Error creating default view:", error);
    }
  }, [reportId, accountName, dimensions.length, loadViewSettingsFromData]);

  const loadViewSettings = useCallback(async (viewId: string) => {
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
  }, [reportId, tableViews, loadViewSettingsFromData]);

  const saveViewSettings = useCallback(async (
    groupByDimensions: string[],
    breakdownByDimensions: string[],
    thenByDimensions: string[],
    visibleColumns: Set<string>,
    columnOrder: string[],
    activeDateTab: 'day' | 'week' | 'month' | 'year',
    dateOrder: 'asc' | 'desc'
  ) => {
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

      // Filter out virtual dimensions (like "virtual-budget") that aren't valid UUIDs
      const filterVirtualDimensions = (ids: string[]): string[] => {
        return ids.filter(id => !id.startsWith('virtual-'));
      };

      const viewData = {
        group_by_dimensions: filterVirtualDimensions(groupByDimensions),
        breakdown_by_dimensions: filterVirtualDimensions(breakdownByDimensions),
        then_by_dimensions: filterVirtualDimensions(thenByDimensions),
        visible_columns: filterVirtualDimensions(Array.from(visibleColumns)),
        column_order: filterVirtualDimensions(columnOrder),
        date_granularity: activeDateTab,
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
  }, [reportId, activeViewId, isSharedView]);

  const handleViewChange = useCallback((viewId: string) => {
    setActiveViewId(viewId);
    loadViewSettings(viewId);
  }, [loadViewSettings]);

  const handleDeleteView = useCallback(async (viewId: string) => {
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

      return deletedView;
    } catch (error) {
      console.error("Error deleting view:", error);
      throw error;
    }
  }, [reportId, tableViews, activeViewId, isSharedView, loadViewSettingsFromData]);

  const handleTabNameSave = useCallback(async (editingTabId: string, editingTabName: string) => {
    if (!editingTabId || !editingTabName.trim() || isSharedView) {
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
    } catch (error) {
      console.error("Error renaming table:", error);
      throw error;
    }
  }, [isSharedView]);

  return {
    tableViews,
    activeViewId,
    setTableViews,
    setActiveViewId,
    loadAllViews,
    createDefaultViews,
    loadViewSettings,
    loadViewSettingsFromData,
    saveViewSettings,
    handleViewChange,
    handleDeleteView,
    handleTabNameSave,
  };
}

