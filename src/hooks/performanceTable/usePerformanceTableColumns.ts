import { useState, useCallback, useMemo } from "react";
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

