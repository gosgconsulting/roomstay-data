import { useState, useCallback, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getAccountDefaultKPIs } from "@/lib/utils";
import { mapDimensionIds, mapVisibleColumns } from "@/lib/performanceTable/viewSettingsMapper";
import type { Dimension } from "./usePerformanceTableDimensions";
import { useUser } from "@/lib/auth";

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
  report_id: string;
  filter_dimensions?: string[]; // NEW: list of dimension IDs for selector options
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
  onSelectorDimensionsChange?: (ids: string[]) => void; // NEW: callback to set selector options
}

/**
 * Hook for managing table views in PerformanceTable
 * Each report has its own set of views that are NOT shared with other reports
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
  onSelectorDimensionsChange,
}: UsePerformanceTableViewsOptions) {
  const { data: userData } = useUser();
  const user = userData?.user || null;
  const [tableViews, setTableViews] = useState<View[]>([]);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [isViewInitialized, setIsViewInitialized] = useState<boolean>(false);

  // Reset initialization flag when reportId changes
  useEffect(() => {
    setIsViewInitialized(false);
  }, [reportId]);

  const loadAllViews = useCallback(async () => {
    if (!reportId) {
      console.error("Cannot load views: No reportId");
      setIsViewInitialized(false);
      return;
    }
    
    setIsViewInitialized(false);
    
    try {
      console.log('[VIEWS] Loading views for report:', reportId, 'isSharedView:', isSharedView);

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
          throw new Error((reportError as any)?.message ?? 'Failed to fetch report owner');
        }
        
        userId = reportData.user_id;
        console.log('[VIEWS] Loading report owner views for shared view. Owner:', userId);
      } else if (!user) {
        console.error("Cannot load views: No user");
        return;
      }

      // Load views ONLY for this specific report (report-scoped, not account-scoped)
      const { data: views, error } = await supabase
        .from("report_views")
        .select("*")
        .eq("report_id", reportId) // CRITICAL: Only load views for THIS report
        .eq("user_id", userId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching views:", error);
        throw new Error((error as any)?.message ?? 'Failed to fetch views');
      }

      console.log('[VIEWS] Found views for report', reportId, ':', views?.length || 0);

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
              console.log('[VIEWS] Updating Roomstay default view KPI order for report:', reportId);
              await supabase
                .from('report_views')
                .update({
                  visible_kpis: roomstayKPIs,
                  kpi_order: roomstayKPIs,
                  updated_at: new Date().toISOString(),
                  name: defaultView.name || "Default View",
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
        console.log('[VIEWS] No views found for report', reportId, ', creating default views');
        await createDefaultViews();
      } else {
        console.log('[VIEWS] No views found for shared report');
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

    console.log('[VIEWS] Loading view settings for report:', reportId, 'view:', view.name, view);
    
    // Map old dimension IDs to account-scoped dimension IDs for group_by_dimensions
    const mapDimensionIdsLocal = async (dimIds: string[]): Promise<string[]> => {
      if (!dimIds || dimIds.length === 0) return [];
      
      const mapped: string[] = [];
      const unmappedIds: string[] = [];
      
      for (const dimId of dimIds) {
        const dimension = dimensions.find(d => d.id === dimId);
        if (dimension) {
          mapped.push(dimension.id);
        } else {
          unmappedIds.push(dimId);
        }
      }
      
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
                console.log(`[VIEWS] Mapped group dimension "${oldDim.name}": ${oldDim.id} -> ${newDimensionId}`);
              } else {
                console.warn(`[VIEWS] Could not find account-scoped dimension for "${oldDim.name}" (${oldDim.id})`);
              }
            });
          }
        } catch (error) {
          console.error('[VIEWS] Error mapping old dimension IDs:', error);
        }
      }
      
      return mapped;
    };

    // Load saved settings - map dimension IDs asynchronously
    const loadDimensionsAsync = async () => {
      const groupDimensions = await mapDimensionIdsLocal(view.group_by_dimensions || []);
      let finalGroupDimensions = groupDimensions;
      if (groupDimensions.length === 0 && dimensions.length > 0) {
        const dateDimension = dimensions.find(d => d.type === 'date');
        const textDimension = dimensions.find(d => d.type === 'text');
        if (dateDimension) {
          finalGroupDimensions = [dateDimension.id];
        } else if (textDimension) {
          finalGroupDimensions = [textDimension.id];
        } else {
          finalGroupDimensions = [dimensions[0].id];
        }
      }
      
      let breakdownDimensions = await mapDimensionIdsLocal(view.breakdown_by_dimensions || []);
      // If no breakdown dimension is set but we have multiple dimensions available, set a default
      if (breakdownDimensions.length === 0 && dimensions.length > 1) {
        const dateDimension = dimensions.find(d => d.type === 'date');
        const textDimensions = dimensions.filter(d => d.type === 'text');
        
        // If group is date, use first text dimension for breakdown
        if (finalGroupDimensions[0] === dateDimension?.id && textDimensions.length > 0) {
          breakdownDimensions = [textDimensions[0].id];
        }
        // If group is text, use date or another text dimension for breakdown
        else if (textDimensions.length > 0) {
          const groupDim = dimensions.find(d => d.id === finalGroupDimensions[0]);
          if (groupDim?.type === 'text') {
            if (dateDimension) {
              breakdownDimensions = [dateDimension.id];
            } else if (textDimensions.length > 1) {
              const otherTextDim = textDimensions.find(d => d.id !== finalGroupDimensions[0]);
              if (otherTextDim) {
                breakdownDimensions = [otherTextDim.id];
              }
            }
          }
        }
      }
      
      let thenByDimensions = await mapDimensionIdsLocal(view.then_by_dimensions || []);
      // If no then by dimension is set but we have 3+ dimensions available, set a default
      if (thenByDimensions.length === 0 && dimensions.length >= 3) {
        const usedDimensions = [...finalGroupDimensions, ...breakdownDimensions];
        const availableForThenBy = dimensions.filter(d => !usedDimensions.includes(d.id));
        
        if (availableForThenBy.length > 0) {
          // Prefer text dimensions for then by, then date, then any other
          const preferredThenBy = availableForThenBy.find(d => d.type === 'text') || 
                                 availableForThenBy.find(d => d.type === 'date') || 
                                 availableForThenBy[0];
          if (preferredThenBy) {
            thenByDimensions = [preferredThenBy.id];
          }
        }
      }
      
      onGroupByChange(finalGroupDimensions);
      onBreakdownByChange(breakdownDimensions);
      onThenByChange(thenByDimensions);
      
      // NEW: selector options mapping (filter_dimensions)
      if (typeof onSelectorDimensionsChange === 'function') {
        const mappedFilters = await mapDimensionIdsLocal(view.filter_dimensions || []);
        const defaultSelectorIds = dimensions
          .filter(d => d.type === 'text' || d.type === 'date')
          .map(d => d.id);
        const configured = mappedFilters.length > 0 ? mappedFilters : defaultSelectorIds;

        // Ensure Date is always included
        const dateId = dimensions.find(d => d.type === 'date')?.id;
        const ensured = dateId ? Array.from(new Set([dateId, ...configured])) : configured;

        onSelectorDimensionsChange(ensured);
      }
    };
    
    loadDimensionsAsync();
    
    if (view.visible_columns && view.visible_columns.length > 0) {
      console.log('[VIEWS] Loading visible columns from view:', view.visible_columns.length, 'columns');
      console.log('[VIEWS] Visible column IDs:', view.visible_columns);
      
      // Map old dimension IDs to account-scoped dimension IDs
      const loadVisibleColumnsAsync = async () => {
        const mappedVisibleColumns = await mapVisibleColumns(view.visible_columns || [], dimensions.map(d => ({ ...d, formula: d.formula || null })));
        
        const visibleSet = new Set<string>(mappedVisibleColumns);
        onVisibleColumnsChange(visibleSet);
        onInitialVisibleColumnsChange(new Set<string>(visibleSet));
        console.log('[VIEWS] Set visibleColumns state:', visibleSet.size, 'columns (mapped from', view.visible_columns.length, 'original)');
      };
      
      loadVisibleColumnsAsync();
    } else {
      // No saved visible_columns - set defaults based on dimension type
      console.log('[VIEWS] No saved visible_columns, setting defaults');
      const hiddenColumns = ['Impression Share', 'CPM', 'Leads'];
      const defaultVisible = new Set<string>(
        dimensions
          .filter(d => !hiddenColumns.includes(d.name) && 
                      (d.type === 'number' || d.type === 'currency' || d.type === 'percentage' || d.formula))
          .map(d => d.id)
      );
      console.log('[VIEWS] Setting default visible columns:', Array.from(defaultVisible));
      onVisibleColumnsChange(defaultVisible);
      onInitialVisibleColumnsChange(new Set(defaultVisible));
    }
    
    
    // Load column order if available
    if (view.column_order && view.column_order.length > 0) {
      console.log('[VIEWS] Loading column order:', view.column_order);
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
      console.log('[VIEWS] Loading date granularity:', view.date_granularity);
      onDateGranularityChange(view.date_granularity as 'day' | 'week' | 'month' | 'year');
    }
    
    // Load date order if available (default to desc)
    if (view.date_order) {
      console.log('[VIEWS] Loading date order:', view.date_order);
      onDateOrderChange(view.date_order as 'asc' | 'desc');
    }
    
    console.log('[VIEWS] View settings loaded successfully for report:', reportId);
    setIsViewInitialized(true);
  }, [dimensions, onGroupByChange, onBreakdownByChange, onThenByChange, onVisibleColumnsChange, onInitialVisibleColumnsChange, onColumnOrderChange, onInitialColumnOrderChange, onDateGranularityChange, onDateOrderChange, reportId, onSelectorDimensionsChange]);

  const createDefaultViews = useCallback(async () => {
    if (!reportId) {
      console.error("Cannot create default views: No reportId");
      return;
    }
    
    try {
      if (!user) {
        console.error("Cannot create default views: No user");
        return;
      }

      const dateDimension = dimensions.find(d => d.type === 'date');
      const defaultGroupDimension = dateDimension || dimensions.find(d => d.type === 'text');

      const hiddenColumns = ['Impression Share', 'CPM', 'Leads'];
      const defaultVisibleIds = dimensions
        .filter(d => !hiddenColumns.includes(d.name) && 
                    (d.type === 'number' || d.type === 'currency' || d.type === 'percentage' || d.formula))
        .map(d => d.id);
      
      const defaultColumnOrder = dimensions
        .filter(d => d.type === 'number' || d.type === 'currency' || d.type === 'percentage' || d.formula)
        .map(d => d.id);

      const defaultKPIs = getAccountDefaultKPIs(
        accountName,
        dimensions
          .filter(d => d.type === 'number' || d.type === 'currency' || d.type === 'percentage')
          .map(d => d.name)
      );

      // NEW: default selector options = all text/date dimensions
      const defaultSelectorIds = dimensions
        .filter(d => d.type === 'text' || d.type === 'date')
        .map(d => d.id);

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
            filter_dimensions: defaultSelectorIds, // NEW
          })
          .select()
          .single();

        if (error) {
          console.error(`[VIEWS] Error creating ${dateConfig.name} view for report ${reportId}:`, error);
          continue;
        }

        if (newView) {
          createdViews.push(newView);
        }
      }

      if (createdViews.length > 0) {
        setTableViews(createdViews);
        const defaultView = createdViews.find(v => v.is_default) || createdViews[0];
        setActiveViewId(defaultView.id);
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
      console.log('[VIEWS] Skipping save for shared view (read-only)');
      return;
    }
    
    try {
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

      console.log('[VIEWS] Saving view settings for report:', reportId, 'view:', activeViewId, viewData);

      const { error } = await supabase
        .from("report_views")
        .update({
          ...viewData,
          name: tableViews.find(v => v.id === activeViewId)?.name || "Default View",
        })
        .eq("id", activeViewId)
        .eq("report_id", reportId); // CRITICAL: Ensure we only update views for THIS report

      if (error) {
        console.error('[VIEWS] Error saving view settings:', error);
        throw new Error((error as any)?.message ?? 'Failed to save view settings');
      }

      console.log('[VIEWS] View settings saved successfully for report:', reportId);

      // Update local state
      setTableViews(prev => prev.map(v => 
        v.id === activeViewId ? { ...v, ...viewData } : v
      ));
    } catch (error) {
      console.error("Error saving view settings:", error);
    }
  }, [reportId, activeViewId, isSharedView, tableViews]);

  // NEW: Save selector dimensions list to the active view
  const saveSelectorDimensions = useCallback(async (selectorIds: string[]) => {
    if (!reportId || !activeViewId) return;
    if (isSharedView) {
      console.log('[VIEWS] Skipping save selector dimensions for shared view (read-only)');
      return;
    }
    const dateId = dimensions.find(d => d.type === 'date')?.id;
    const ensured = dateId ? Array.from(new Set([dateId, ...selectorIds])) : selectorIds;

    const filterVirtualDimensions = (ids: string[]): string[] => {
      return ids.filter(id => !id.startsWith('virtual-'));
    };
    const payload = { filter_dimensions: filterVirtualDimensions(ensured) };

    console.log('[VIEWS] Saving selector dimensions for report:', reportId, 'view:', activeViewId, payload);

    const { error } = await supabase
      .from("report_views")
      .update({
        ...payload,
        name: tableViews.find(v => v.id === activeViewId)?.name || "Default View",
      })
      .eq("id", activeViewId)
      .eq("report_id", reportId);

    if (error) {
      console.error('[VIEWS] Error saving selector dimensions:', error);
      throw new Error((error as any)?.message ?? 'Failed to save selector dimensions');
    }

    // Update local cache
    setTableViews(prev => prev.map(v => 
      v.id === activeViewId ? { ...v, ...payload } : v
    ));
  }, [reportId, activeViewId, isSharedView, tableViews, dimensions]);

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
        .eq("id", viewId)
        .eq("report_id", reportId); // CRITICAL: Only delete views for THIS report

      if (error) throw new Error((error as any)?.message ?? 'Failed to delete view');

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
        .eq("id", editingTabId)
        .eq("report_id", reportId); // CRITICAL: Only update views for THIS report

      if (error) throw new Error((error as any)?.message ?? 'Failed to rename view');

      // Update local state
      setTableViews(prev => prev.map(v => 
        v.id === editingTabId ? { ...v, name: editingTabName.trim() } : v
      ));
    } catch (error) {
      console.error("Error renaming table:", error);
      throw error;
    }
  }, [isSharedView, reportId]);

  return {
    tableViews,
    activeViewId,
    isViewInitialized,
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
    saveSelectorDimensions,
  };
}