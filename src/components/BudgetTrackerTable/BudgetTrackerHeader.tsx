import { DimensionSelectorGroup } from "../PerformanceTable/DimensionSelectorGroup";
import { ColumnVisibilitySheet } from "../PerformanceTable/ColumnVisibilitySheet";
import type { Dimension } from "@/hooks/performanceTable/usePerformanceTableDimensions";
import type { DragEndEvent } from '@dnd-kit/core';
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";

interface BudgetTrackerHeaderProps {
  breakdownByDimensions: string[];
  // NEW: Then-by dimensions
  thenByDimensions: string[];
  dimensions: Dimension[];
  dimensionHasData: Record<string, boolean>;
  reportId: string | null;
  isSharedView: boolean;
  isEditMode?: boolean;
  // Updated: selector can be "breakdown" or "then"
  onDimensionChange: (value: string, selector: "breakdown" | "then") => void;
  visibleColumns: Set<string>;
  getOrderedDimensions: () => Dimension[];
  onToggleColumn: (dimensionId: string) => void;
  onColumnReorder: (event: DragEndEvent) => void;
  hasUnsavedColumnChanges: boolean;
  isSavingColumnSettings: boolean;
  onApplyColumnSettings: () => void;
  onCancelColumnSettings: () => void;
  onRefreshDimensions?: () => void;
  // NEW: configured list for dropdowns
  availableSelectorDimensions?: string[];
  // NEW: open settings modal
  onOpenSettings?: () => void;
}

/**
 * Budget tracker header component with breakdown and then-by selectors and column visibility
 */
export function BudgetTrackerHeader({
  breakdownByDimensions,
  thenByDimensions,
  dimensions,
  dimensionHasData,
  reportId,
  isSharedView,
  isEditMode = false,
  onDimensionChange,
  visibleColumns,
  getOrderedDimensions,
  onToggleColumn,
  onColumnReorder,
  hasUnsavedColumnChanges,
  isSavingColumnSettings,
  onApplyColumnSettings,
  onCancelColumnSettings,
  onRefreshDimensions,
  availableSelectorDimensions,
  onOpenSettings,
}: BudgetTrackerHeaderProps) {
  // Build selector options (exclude date for breakdown/then)
  const configured = (availableSelectorDimensions && availableSelectorDimensions.length > 0)
    ? availableSelectorDimensions
    : dimensions.map(d => d.id);

  const dateId = dimensions.find(d => d.type === 'date')?.id;
  const selectorOptions = configured.filter(id => id !== dateId);

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3 text-sm">
        {/* Group by is always Date (mandatory) - show as read-only */}
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Group by:</span>
          <span className="px-2 py-1 bg-muted rounded text-sm font-medium">
            Date (mandatory)
          </span>
        </div>
        
        {/* Breakdown by selector */}
        {dimensions.length >= 2 && (
          <DimensionSelectorGroup
            label="Breakdown by"
            dimensions={breakdownByDimensions}
            availableDimensions={selectorOptions}
            allDimensions={dimensions}
            dimensionHasData={dimensionHasData}
            reportId={reportId}
            isSharedView={isSharedView}
            isEditMode={isEditMode}
            onValueChange={(value) => onDimensionChange(value, "breakdown")}
          />
        )}

        {/* Then by selector */}
        {(breakdownByDimensions.length >= 1 || dimensions.length >= 3) && (
          <DimensionSelectorGroup
            label="Then by"
            dimensions={thenByDimensions}
            availableDimensions={selectorOptions}
            allDimensions={dimensions}
            dimensionHasData={dimensionHasData}
            reportId={reportId}
            isSharedView={isSharedView}
            isEditMode={isEditMode}
            onValueChange={(value) => onDimensionChange(value, "then")}
          />
        )}
      </div>
      
      {/* Column visibility controls + Settings (edit mode only) */}
      <div className="flex items-center gap-2">
        <ColumnVisibilitySheet
          visibleColumns={visibleColumns}
          dimensions={dimensions}
          getOrderedDimensions={getOrderedDimensions}
          onToggleColumn={onToggleColumn}
          onColumnReorder={onColumnReorder}
          hasUnsavedChanges={hasUnsavedColumnChanges}
          isSaving={isSavingColumnSettings}
          onApply={onApplyColumnSettings}
          onCancel={onCancelColumnSettings}
          onRefreshDimensions={onRefreshDimensions}
        />
        {isEditMode && (
          <Button
            variant="ghost"
            size="sm"
            className="gap-2"
            onClick={onOpenSettings}
            title="Table settings"
          >
            <Settings className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}