import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DimensionSelectorGroup } from "./DimensionSelectorGroup";
import { ColumnVisibilitySheet } from "./ColumnVisibilitySheet";
import type { Dimension } from "@/hooks/performanceTable/usePerformanceTableDimensions";
import type { DragEndEvent } from '@dnd-kit/core';
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";

interface TableHeaderProps {
  activeDateTab: 'day' | 'week' | 'month' | 'year';
  onDateTabChange: (value: 'day' | 'week' | 'month' | 'year') => void;
  groupByDimensions: string[];
  breakdownByDimensions: string[];
  thenByDimensions: string[];
  dimensions: Dimension[];
  dimensionHasData: Record<string, boolean>;
  reportId: string | null;
  isSharedView: boolean;
  isEditMode?: boolean;
  onDimensionChange: (value: string, selector: "group" | "breakdown" | "then") => void;
  visibleColumns: Set<string>;
  getOrderedDimensions: () => Dimension[];
  onToggleColumn: (dimensionId: string) => void;
  onColumnReorder: (event: DragEndEvent) => void;
  hasUnsavedColumnChanges: boolean;
  isSavingColumnSettings: boolean;
  onApplyColumnSettings: () => void;
  onCancelColumnSettings: () => void;
  onRefreshDimensions?: () => void;
  onOpenSettings?: () => void;
  availableSelectorDimensions?: string[];
}

/**
 * Table header component with date granularity tabs and dimension selectors
 */
export function TableHeader({
  activeDateTab,
  onDateTabChange,
  groupByDimensions,
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
  onOpenSettings,
  availableSelectorDimensions,
}: TableHeaderProps) {
  // Build selector options: use configured list if provided, else default to all text/date
  const selectorOptions = (availableSelectorDimensions && availableSelectorDimensions.length > 0)
    ? availableSelectorDimensions
    : dimensions.filter(d => d.type === 'text' || d.type === 'date').map(d => d.id);

  return (
    <>
      {/* Date Granularity Tabs */}
      <Tabs value={activeDateTab} onValueChange={(value) => onDateTabChange(value as 'day' | 'week' | 'month' | 'year')} className="mb-4">
        <TabsList>
          <TabsTrigger value="day">Day</TabsTrigger>
          <TabsTrigger value="week">Week</TabsTrigger>
          <TabsTrigger value="month">Month</TabsTrigger>
          <TabsTrigger value="year">Year</TabsTrigger>
        </TabsList>
      </Tabs>
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm">
          <DimensionSelectorGroup
            label="Group by"
            dimensions={groupByDimensions}
            availableDimensions={selectorOptions}
            allDimensions={dimensions}
            dimensionHasData={dimensionHasData}
            reportId={reportId}
            isSharedView={isSharedView}
            isEditMode={isEditMode}
            onValueChange={(value) => onDimensionChange(value, "group")}
          />
          
          {groupByDimensions.length >= 2 && (
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
          
          {groupByDimensions.length >= 2 && (
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
        
        {!isSharedView && isEditMode && (
          <div className="flex items-center gap-2">
            <ColumnVisibilitySheet
              dimensions={dimensions}
              visibleColumns={visibleColumns}
              getOrderedDimensions={getOrderedDimensions}
              onToggleColumn={onToggleColumn}
              onColumnReorder={onColumnReorder}
              hasUnsavedChanges={hasUnsavedColumnChanges}
              isSaving={isSavingColumnSettings}
              onApply={onApplyColumnSettings}
              onCancel={onCancelColumnSettings}
              onRefreshDimensions={onRefreshDimensions}
            />
            <Button
              variant="ghost"
              size="sm"
              className="gap-2"
              onClick={onOpenSettings}
              title="Table settings"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </>
  );
}