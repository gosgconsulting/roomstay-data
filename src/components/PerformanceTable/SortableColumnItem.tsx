import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { GripVertical } from "lucide-react";
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Dimension } from "@/hooks/performanceTable/usePerformanceTableDimensions";

interface SortableColumnItemProps {
  dimension: Dimension;
  isVisible: boolean;
  onToggle: () => void;
}

/**
 * Sortable column item component for drag & drop column ordering
 */
export function SortableColumnItem({ 
  dimension, 
  isVisible, 
  onToggle 
}: SortableColumnItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: dimension.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center space-x-2 p-2 bg-background rounded border"
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <Checkbox
        id={`col-${dimension.id}`}
        checked={isVisible}
        onCheckedChange={onToggle}
      />
      <Label
        htmlFor={`col-${dimension.id}`}
        className="text-sm font-normal cursor-pointer flex-1"
      >
        {dimension.name}
      </Label>
    </div>
  );
}

