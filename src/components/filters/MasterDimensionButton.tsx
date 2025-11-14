import React from "react";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";

interface MasterDimensionButtonProps {
  dimensions: Array<{ id: string; name: string; type: string; scope?: string }>;
  masterDimensionId: string | null;
  count: number;
  onOpen: () => void;
}

const MasterDimensionButton: React.FC<MasterDimensionButtonProps> = ({
  dimensions,
  masterDimensionId,
  count,
  onOpen,
}) => {
  const label = masterDimensionId
    ? (
      <span className="flex items-center gap-2">
        {dimensions.find(d => d.id === masterDimensionId)?.name || "Select..."}
        {count > 0 && (
          <span className="text-xs text-muted-foreground">
            ({count})
          </span>
        )}
      </span>
    )
    : "Select dimension...";

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">Master Dimension</label>
      <Button
        variant="outline"
        className="w-[200px] justify-between bg-background"
        onClick={onOpen}
        onContextMenu={(e) => {
          e.preventDefault();
          onOpen();
        }}
      >
        {label}
        <Settings className="ml-2 h-4 w-4 opacity-50" />
      </Button>
    </div>
  );
};

export default MasterDimensionButton;