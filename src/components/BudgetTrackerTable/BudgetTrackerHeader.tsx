import { DimensionSelectorGroup } from "../PerformanceTable/DimensionSelectorGroup";
import { ColumnVisibilitySheet } from "../PerformanceTable/ColumnVisibilitySheet";
import type { Dimension } from "@/hooks/performanceTable/usePerformanceTableDimensions";
import type { DragEndEvent } from '@dnd-kit/core';

interface BudgetTrackerHeaderProps {
  breakdownByDimensions: string[];
  dimensions: Dimension[];
  dimensionHasData: Record<string, boolean>;
  reportId: string | null;
  isSharedView: boolean;
  isEditMode?: boolean;
  onDimensionChange: (value: string, selector: string) => void;
  visibleColumns: Set<string>;
  getOrderedDimensions: () => Dimension[];
  onToggleColumn: (dimensionId: string) => void;
  onColumnReorder: (event: DragEndEvent) => void;
  hasUnsavedColumnChanges: boolean;
  isSavingColumnSettings: boolean;
  onApplyColumnSettings: () => void;
  onCancelColumnSettings: () => void;
  onRefreshDimensions?: () => void;
}

/**
 * Budget tracker header component with breakdown dimension selector and column visibility
 */
export function BudgetTrackerHeader({
  breakdownByDimensions,
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
}: BudgetTrackerHeaderProps) {
  // Build selector options for breakdown by (exclude date since it's always group by)
  const selectorOptions = dimensions
    .filter(d => d.type !== 'date') // Exclude date dimension
    .map(d => d.id);

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
      </div>
      
      {/* Column visibility controls */}
      <div className="flex items-center gap-2">
        <ColumnVisibilitySheet
          visibleColumns={visibleColumns}
          dimensions={getOrderedDimensions()}
          onToggleColumn={onToggleColumn}
          onColumnReorder={onColumnReorder}
          hasUnsavedChanges={hasUnsavedColumnChanges}
          isSaving={isSavingColumnSettings}
          onApplyChanges={onApplyColumnSettings}
          onCancelChanges={onCancelColumnSettings}
          onRefreshDimensions={onRefreshDimensions}
        />
      </div>
    </div>
  );
}
