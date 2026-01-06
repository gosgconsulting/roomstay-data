import { ColumnVisibilitySheet } from "./ColumnVisibilitySheet";
import { DimensionSelectorGroup } from "./DimensionSelectorGroup";
import type { Dimension } from "@/hooks/performanceTable/usePerformanceTableDimensions";
import type { DragEndEvent } from '@dnd-kit/core';
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import { cn } from "@/lib/utils";

interface TableHeaderProps {
  activeDateTab: 'day' | 'week' | 'month' | 'year';
  onDateTabChange: (value: 'day' | 'week' | 'month' | 'year') => void;
  groupByDimensions: string[];
  breakdownByDimensions: string[];
  thenByDimensions: string[];
  dimensions: Dimension[];
  dimensionHasData: Record<string, boolean>;
  reportId: string | null;
  reportName?: string;
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

const DATE_TABS = ['day', 'week', 'month', 'year'] as const;

/**
 * Table header with:
 * Row 1: Report name + Day/Week/Month/Year tabs + Settings
 * Row 2: Group by / Breakdown by / Then by selectors
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
  reportName,
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
  const configured = (availableSelectorDimensions && availableSelectorDimensions.length > 0)
    ? availableSelectorDimensions
    : dimensions.filter(d => d.type === 'text' || d.type === 'date').map(d => d.id);

  const dateId = dimensions.find(d => d.type === 'date')?.id;
  const selectorOptions = dateId
    ? Array.from(new Set([dateId, ...configured])) // Ensure Date is always included
    : configured;

  return (
    <div className="px-4">
      {/* Row 1: Report name + Date Tabs + Settings */}
      <div className="flex items-center justify-between py-3">
        <h3 className="font-semibold text-foreground">
          {reportName || "Performance"}
        </h3>
        
        <div className="flex items-center gap-2">
          {/* Day/Week/Month/Year tabs */}
          <div className="flex items-center bg-muted rounded-md p-0.5">
            {DATE_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => onDateTabChange(tab)}
                className={cn(
                  "px-3 py-1 text-sm font-medium rounded transition-colors capitalize",
                  activeDateTab === tab
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tab}
              </button>
            ))}
          </div>
          
          {!isSharedView && (
            <>
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
              {isEditMode && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={onOpenSettings}
                  title="Table settings"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      
      {/* Row 2: Dimension Selectors (Group by / Breakdown by / Then by) */}
      <div className="flex items-center gap-6 py-3 border-t border-border">
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
      </div>
    </div>
  );
}
