import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Dimension } from "@/lib/dimensionLoader";

interface SelectedDimensionItemProps {
  dimension: Dimension | undefined;
  dimensionId: string;
  granularity: string;
  onRemove: (dimensionId: string) => void;
  onGranularityChange: (dimensionId: string, granularity: string) => void;
  disabled?: boolean;
}

export function SelectedDimensionItem({
  dimension,
  dimensionId,
  granularity,
  onRemove,
  onGranularityChange,
  disabled = false,
}: SelectedDimensionItemProps) {
  const isDateDimension = dimension?.type === 'date';
  // Date dimension cannot be removed
  const canRemove = !isDateDimension;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between py-2 px-3 bg-muted rounded-md">
        <span className="font-medium">{dimension?.name || dimensionId}</span>
        {canRemove && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive hover:text-destructive"
            onClick={() => onRemove(dimensionId)}
            disabled={disabled}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      {/* {isDateDimension && (
        <div className="pl-3 pr-3">
          <Select
            value={granularity || 'Day'}
            onValueChange={(value) => onGranularityChange(dimensionId, value)}
            disabled={disabled}
          >
            <SelectTrigger className="h-9 bg-background">
              <SelectValue placeholder="Select granularity..." />
            </SelectTrigger>
            <SelectContent className="bg-background z-50">
              <SelectItem value="Day">Day</SelectItem>
              <SelectItem value="Week">Week</SelectItem>
              <SelectItem value="Month">Month</SelectItem>
              <SelectItem value="Year">Year</SelectItem>
              <SelectItem value="Forecast">Forecast</SelectItem>
              <SelectItem value="Forecast Historical">Historical Forecast</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )} */}
    </div>
  );
}