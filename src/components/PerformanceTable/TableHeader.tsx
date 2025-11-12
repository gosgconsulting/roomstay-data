import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DimensionSelectorGroup } from "./DimensionSelectorGroup";
import { ColumnVisibilitySheet } from "./ColumnVisibilitySheet";
import type { Dimension } from "@/hooks/performanceTable/usePerformanceTableDimensions";

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
  onDimensionChange: (value: string, selector: "group" | "breakdown" | "then") => void;
  onDimensionSelectorOpen: (e: React.MouseEvent, selector: "group" | "breakdown" | "then") => void;
  visibleColumns: Set<string>;
  getOrderedDimensions: () => Dimension[];
  onToggleColumn: (dimensionId: string) => void;
  onColumnReorder: (event: any) => void;
  hasUnsavedColumnChanges: boolean;
  isSavingColumnSettings: boolean;
  onApplyColumnSettings: () => void;
  onCancelColumnSettings: () => void;
  onRefreshDimensions?: () => void;
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
  onDimensionChange,
  onDimensionSelectorOpen,
  visibleColumns,
  getOrderedDimensions,
  onToggleColumn,
  onColumnReorder,
  hasUnsavedColumnChanges,
  isSavingColumnSettings,
  onApplyColumnSettings,
  onCancelColumnSettings,
  onRefreshDimensions,
}: TableHeaderProps) {
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
          {/* Group by - always shown */}
          <DimensionSelectorGroup
            label="Group by"
            dimensions={groupByDimensions}
            allDimensions={dimensions}
            dimensionHasData={dimensionHasData}
            reportId={reportId}
            isSharedView={isSharedView}
            onValueChange={(value) => onDimensionChange(value, "group")}
            onContextMenu={(e) => onDimensionSelectorOpen(e as any, "group")}
          />
          
          {/* Breakdown by - shown only if 2+ dimensions selected */}
          {groupByDimensions.length >= 2 && (
            <DimensionSelectorGroup
              label="Breakdown by"
              dimensions={breakdownByDimensions}
              allDimensions={dimensions}
              dimensionHasData={dimensionHasData}
              reportId={reportId}
              isSharedView={isSharedView}
              onValueChange={(value) => onDimensionChange(value, "breakdown")}
              onContextMenu={(e) => onDimensionSelectorOpen(e as any, "breakdown")}
            />
          )}
          
          {/* Then by - shown only if 3+ dimensions selected */}
          {groupByDimensions.length >= 3 && (
            <DimensionSelectorGroup
              label="Then by"
              dimensions={thenByDimensions}
              allDimensions={dimensions}
              dimensionHasData={dimensionHasData}
              reportId={reportId}
              isSharedView={isSharedView}
              onValueChange={(value) => onDimensionChange(value, "then")}
              onContextMenu={(e) => onDimensionSelectorOpen(e as any, "then")}
            />
          )}
        </div>
        
        {!isSharedView && (
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
          </div>
        )}
      </div>
    </>
  );
}

