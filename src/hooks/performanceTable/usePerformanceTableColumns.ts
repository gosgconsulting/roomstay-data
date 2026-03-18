import { useState, useCallback, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { DragEndEvent } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import type { Dimension } from "./usePerformanceTableDimensions";

interface UsePerformanceTableColumnsOptions {
  reportId: string | null;
  activeViewId: string | null;
  isSharedView: boolean;
  dimensions: Dimension[];
}

/**
 * Hook for managing column visibility and ordering in PerformanceTable
 */
export function usePerformanceTableColumns({
  reportId,
  activeViewId,
  isSharedView,
  dimensions,
}: UsePerformanceTableColumnsOptions) {
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set());
  const [initialVisibleColumns, setInitialVisibleColumns] = useState<Set<string>>(new Set());
  const [columnOrder, setColumnOrder] = useState<string[]>([]);
  const [initialColumnOrder, setInitialColumnOrder] = useState<string[]>([]);
  const [isSavingColumnSettings, setIsSavingColumnSettings] = useState(false);

  // NEW: Auto-save column settings when they change (with debounce)
  useEffect(() => {
    if (reportId && activeViewId && !isSharedView) {
      // Only auto-save if there are actual changes
      if (hasUnsavedColumnChanges()) {
        const timeoutId = setTimeout(() => {
          console.log('[COLUMNS] Auto-saving column settings...');
          applyColumnSettings();
        }, 1000); // 1 second debounce for column changes
        
        return () => clearTimeout(timeoutId);
      }
    }
  }, [
    Array.from(visibleColumns).sort().join(','), 
    columnOrder.join(','), 
    reportId, 
    activeViewId, 
    isSharedView
  ]);

  const toggleColumn = useCallback((dimensionId: string) => {
    setVisibleColumns(prev => {
      const newVisible = new Set(prev);
      if (newVisible.has(dimensionId)) {
        newVisible.delete(dimensionId);
      } else {
        newVisible.add(dimensionId);
      }
      return newVisible;
    });
  }, []);

  const applyColumnSettings = useCallback(async () => {
    if (!reportId) {
      console.log('[COLUMNS] Cannot apply column settings: No reportId');
      return;
    }

    // Budget Tracker path: no views -> commit locally and skip DB save
    if (!activeViewId || isSharedView) {
      console.log('[COLUMNS] Applying column settings locally (no view/save)');
      setInitialVisibleColumns(new Set(visibleColumns));
      setInitialColumnOrder([...columnOrder]);

      toast({
        title: "Success",
        description: "Column visibility updated",
      });

      return;
    }

    try {
      setIsSavingColumnSettings(true);
      console.log('[COLUMNS] Applying column visibility settings to view:', activeViewId);

      const viewData = {
        visible_columns: Array.from(visibleColumns),
        column_order: columnOrder,
      };

      console.log('[COLUMNS] Updating report_views with data:', viewData);

      const { error } = await supabase
        .from("views")
        .update({
          ...viewData,
          name: "Default View",
        })
        .eq("mode", "performance_table")
        .eq("id", activeViewId);

      if (error) {
        console.error('[COLUMNS] Error updating report_views:', error);
        throw error;
      }

      console.log('[COLUMNS] Successfully updated report_views');

      setInitialVisibleColumns(new Set(visibleColumns));
      setInitialColumnOrder([...columnOrder]);

      if (arguments.length > 0) {
        toast({
          title: "Success",
          description: "Column visibility settings applied successfully",
        });
      }

      console.log('[COLUMNS] Column visibility settings applied successfully');
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
  }, [reportId, activeViewId, isSharedView, visibleColumns, columnOrder]);

  const cancelColumnSettings = useCallback(() => {
    setVisibleColumns(new Set(initialVisibleColumns));
    setColumnOrder([...initialColumnOrder]);
    console.log('[testing] Cancelled column visibility changes');
  }, [initialVisibleColumns, initialColumnOrder]);

  const hasUnsavedColumnChanges = useCallback(() => {
    // Compare visible columns
    if (visibleColumns.size !== initialVisibleColumns.size) return true;
    for (const id of visibleColumns) {
      if (!initialVisibleColumns.has(id)) return true;
    }
    
    // Compare column order
    if (columnOrder.length !== initialColumnOrder.length) return true;
    return columnOrder.some((id, index) => id !== initialColumnOrder[index]);
  }, [visibleColumns, initialVisibleColumns, columnOrder, initialColumnOrder]);

  // Get dimensions in the custom order
  const getOrderedDimensions = useCallback((): Dimension[] => {
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
  }, [dimensions, columnOrder]);

  const handleColumnReorder = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const orderedDims = getOrderedDimensions();
      const oldIndex = orderedDims.findIndex(d => d.id === active.id);
      const newIndex = orderedDims.findIndex(d => d.id === over.id);
      
      const newOrder = arrayMove(orderedDims, oldIndex, newIndex).map(d => d.id);
      setColumnOrder(newOrder);
    }
  }, [getOrderedDimensions]);

  return {
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
  };
}