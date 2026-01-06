import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ColumnVisibilitySheet } from "./ColumnVisibilitySheet";
import type { Dimension } from "@/hooks/performanceTable/usePerformanceTableDimensions";
import type { DragEndEvent } from '@dnd-kit/core';
import { Button } from "@/components/ui/button";
import { Settings, SlidersHorizontal } from "lucide-react";
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
 * Table header component with Google Search Console-style tabs
 * Row 1: Dimension tabs (Group by options)
 * Row 2: Date granularity tabs + settings
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
  const configured = (availableSelectorDimensions && availableSelectorDimensions.length > 0)
    ? availableSelectorDimensions
    : dimensions.filter(d => d.type === 'text' || d.type === 'date').map(d => d.id);

  const dateId = dimensions.find(d => d.type === 'date')?.id;
  const selectorOptions = dateId
    ? Array.from(new Set([dateId, ...configured])) // Ensure Date is always included
    : configured;

  // Get dimension objects for the selector options
  const dimensionTabs = selectorOptions
    .map(id => dimensions.find(d => d.id === id))
    .filter((d): d is Dimension => d !== undefined);

  // Current active dimension (first in groupByDimensions)
  const activeDimensionId = groupByDimensions[0] || dimensionTabs[0]?.id;

  return (
    <div className="space-y-0">
      {/* Row 1: Dimension Tabs (Google Search Console style) */}
      <div className="border-b">
        <div className="flex items-center">
          {dimensionTabs.map((dim) => {
            const isActive = dim.id === activeDimensionId;
            return (
              <button
                key={dim.id}
                onClick={() => {
                  if (!isSharedView || isEditMode) {
                    onDimensionChange(dim.id, "group");
                  }
                }}
                disabled={isSharedView && !isEditMode}
                className={cn(
                  "px-4 py-3 text-sm font-medium uppercase tracking-wide transition-colors relative",
                  isActive 
                    ? "text-primary" 
                    : "text-muted-foreground hover:text-foreground",
                  (isSharedView && !isEditMode) && "cursor-default"
                )}
              >
                {dim.name}
                {/* Active indicator line */}
                {isActive && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
                )}
              </button>
            );
          })}
        </div>
      </div>
      
      {/* Row 2: Date Granularity + Settings */}
      <div className="flex items-center justify-between py-2">
        <div className="flex items-center gap-2">
          {/* Day/Week/Month/Year Tabs */}
          <Tabs value={activeDateTab} onValueChange={(value) => onDateTabChange(value as 'day' | 'week' | 'month' | 'year')}>
            <TabsList className="h-8">
              <TabsTrigger value="day" className="text-xs px-3 h-7">Day</TabsTrigger>
              <TabsTrigger value="week" className="text-xs px-3 h-7">Week</TabsTrigger>
              <TabsTrigger value="month" className="text-xs px-3 h-7">Month</TabsTrigger>
              <TabsTrigger value="year" className="text-xs px-3 h-7">Year</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        
        {!isSharedView && (
          <div className="flex items-center gap-1">
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
          </div>
        )}
      </div>
    </div>
  );
}
