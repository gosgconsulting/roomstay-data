import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle } from "lucide-react";
import type { Dimension } from "@/hooks/performanceTable/usePerformanceTableDimensions";

interface DimensionSelectorGroupProps {
  label: string;
  dimensions: string[];
  availableDimensions?: string[];
  allDimensions: Dimension[];
  dimensionHasData: Record<string, boolean>;
  reportId: string | null;
  isSharedView: boolean;
  isEditMode?: boolean;
  onValueChange: (value: string) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

/**
 * Dimension selector group component (Group by, Breakdown by, Then by)
 */
export function DimensionSelectorGroup({
  label,
  dimensions,
  availableDimensions,
  allDimensions,
  dimensionHasData,
  reportId,
  isSharedView,
  isEditMode = false,
  onValueChange,
  onContextMenu,
}: DimensionSelectorGroupProps) {
  // Use availableDimensions if provided, otherwise fall back to dimensions
  // Always include the current selection in options so it displays properly
  const currentValue = dimensions[0] || "";
  const baseOptions = availableDimensions || dimensions;
  
  // Ensure current value is always in the options list
  const options = currentValue && !baseOptions.includes(currentValue) 
    ? [currentValue, ...baseOptions]
    : baseOptions;
  
  // Find the currently selected dimension for display
  const selectedDimension = currentValue ? allDimensions.find(d => d.id === currentValue) : null;
  
  if (options.length > 0) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{label}:</span>
        <Select
          value={currentValue}
          onValueChange={onValueChange}
        >
          <SelectTrigger 
            className="w-40 bg-background"
            onContextMenu={!isSharedView && isEditMode && onContextMenu ? onContextMenu : undefined}
          >
            <SelectValue placeholder="Select...">
              {selectedDimension && (
                <div className="flex items-center gap-2">
                  {reportId && (
                    dimensionHasData[currentValue] !== undefined ? (
                      dimensionHasData[currentValue] ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                      ) : (
                        <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                      )
                    ) : (
                      <div className="h-3.5 w-3.5" />
                    )
                  )}
                  <span>{selectedDimension.name}</span>
                </div>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="bg-background z-50">
            {options.map((dimId) => {
              const dim = allDimensions.find(d => d.id === dimId);
              const hasData = reportId ? dimensionHasData[dimId] : undefined;
              return dim ? (
                <SelectItem key={dim.id} value={dim.id}>
                  <div className="flex items-center gap-2">
                    {reportId && (
                      hasData !== undefined ? (
                        hasData ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        ) : (
                          <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                        )
                      ) : (
                        <div className="h-3.5 w-3.5" />
                      )
                    )}
                    <span>{dim.name}</span>
                  </div>
                </SelectItem>
              ) : null;
            })}
          </SelectContent>
        </Select>
      </div>
    );
  }

  if (!isSharedView && isEditMode) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{label}:</span>
        <Button
          variant="outline"
          className="w-40 justify-start"
          onContextMenu={onContextMenu}
          onClick={onContextMenu}
        >
          <span className="text-muted-foreground">Right-click to select</span>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{label}:</span>
      <span className="text-sm text-muted-foreground">-</span>
    </div>
  );
}