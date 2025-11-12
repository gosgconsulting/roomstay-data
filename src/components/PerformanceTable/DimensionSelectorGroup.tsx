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
  allDimensions: Dimension[];
  dimensionHasData: Record<string, boolean>;
  reportId: string | null;
  isSharedView: boolean;
  onValueChange: (value: string) => void;
  onContextMenu: (e: React.MouseEvent) => void;
}

/**
 * Dimension selector group component (Group by, Breakdown by, Then by)
 */
export function DimensionSelectorGroup({
  label,
  dimensions,
  allDimensions,
  dimensionHasData,
  reportId,
  isSharedView,
  onValueChange,
  onContextMenu,
}: DimensionSelectorGroupProps) {
  if (dimensions.length > 0) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{label}:</span>
        <Select
          value={dimensions[0] || ""}
          onValueChange={onValueChange}
        >
          <SelectTrigger 
            className="w-40 bg-background"
            onContextMenu={!isSharedView ? onContextMenu : undefined}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-background z-50">
            {dimensions.map((dimId) => {
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

  if (!isSharedView) {
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

