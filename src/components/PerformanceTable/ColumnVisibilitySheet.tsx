import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Columns3, Save, X } from "lucide-react";
import { SortableColumnItem } from "./SortableColumnItem";
import type { Dimension } from "@/hooks/performanceTable/usePerformanceTableDimensions";

interface ColumnVisibilitySheetProps {
  dimensions: Dimension[];
  visibleColumns: Set<string>;
  getOrderedDimensions: () => Dimension[];
  onToggleColumn: (dimensionId: string) => void;
  onColumnReorder: (event: any) => void;
  hasUnsavedChanges: boolean;
  isSaving: boolean;
  onApply: () => void;
  onCancel: () => void;
  /** When provided with `open`, sheet is controlled; Apply/Cancel will call onOpenChange(false) to close. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onRefreshDimensions?: () => void;
}

/**
 * Sheet component for managing column visibility and ordering
 */
export function ColumnVisibilitySheet({
  dimensions,
  visibleColumns,
  getOrderedDimensions,
  onToggleColumn,
  onColumnReorder,
  hasUnsavedChanges,
  isSaving,
  onApply,
  onCancel,
  open,
  onOpenChange,
  onRefreshDimensions,
}: ColumnVisibilitySheetProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleOpenChange = (next: boolean) => {
    if (next && onRefreshDimensions) onRefreshDimensions();
    onOpenChange?.(next);
  };

  const handleApply = () => {
    onApply();
    onOpenChange?.(false);
  };

  const handleCancel = () => {
    onCancel();
    onOpenChange?.(false);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={handleOpenChange}
    >
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="h-9 w-9">
          <Columns3 className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Column Visibility</SheetTitle>
          <SheetDescription>
            Show or hide columns in the table
          </SheetDescription>
        </SheetHeader>
        
        <div className="mt-6 space-y-6">
          {/* Columns Section */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold">Columns</h3>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onColumnReorder}
            >
              <SortableContext
                items={getOrderedDimensions().map(d => d.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {getOrderedDimensions().map((dimension) => (
                    <SortableColumnItem
                      key={dimension.id}
                      dimension={dimension}
                      isVisible={visibleColumns.has(dimension.id)}
                      onToggle={() => onToggleColumn(dimension.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        </div>

        {/* Apply/Cancel buttons for Column Visibility */}
        {hasUnsavedChanges && (
          <div className="border-t pt-4 mt-6 space-y-3">
            <div className="flex gap-2">
              <Button 
                onClick={handleApply} 
                disabled={isSaving}
                className="flex-1 gap-2"
                variant="default"
              >
                <Save className="h-4 w-4" />
                {isSaving ? "Applying..." : "Apply Changes"}
              </Button>
              <Button 
                onClick={handleCancel} 
                disabled={isSaving}
                variant="outline"
                className="gap-2"
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

