import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ColumnVisibilitySheet } from "./ColumnVisibilitySheet";
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

/**
 * Table header with unified design:
 * Row 1: Report name + Day/Week toggle
 * Row 2: Dimension tabs (Date, Hotel, Device, etc.)
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

  // Get dimension objects for the selector options
  const dimensionTabs = selectorOptions
    .map(id => dimensions.find(d => d.id === id))
    .filter((d): d is Dimension => d !== undefined);

  // Current active dimension (first in groupByDimensions)
  const activeDimensionId = groupByDimensions[0] || dimensionTabs[0]?.id;
  const activeDimension = dimensions.find(d => d.id === activeDimensionId);

  return (
    <div className="px-4">
      {/* Row 1: Report name + Day/Week toggle + Settings */}
      <div className="flex items-center justify-between py-3">
        <h3 className="font-semibold text-foreground">
          {reportName || "Performance"}
        </h3>
        
        <div className="flex items-center gap-2">
          {/* Day/Week/Month/Year toggle */}
          <div className="flex items-center bg-muted rounded-md p-0.5">
            {(['day', 'week'] as const).map((tab) => (
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
      
      {/* Row 2: Dimension Tabs */}
      <div className="border-b -mx-4 px-4">
        <div className="flex items-center gap-0 overflow-x-auto">
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
                  "px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors relative border-b-2",
                  isActive 
                    ? "text-foreground border-primary" 
                    : "text-muted-foreground hover:text-foreground border-transparent hover:border-muted-foreground/30",
                  (isSharedView && !isEditMode) && "cursor-default"
                )}
              >
                {dim.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
