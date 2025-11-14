import React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface MasterDimensionPopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dimensions: Array<{ id: string; name: string; type: string; scope?: string }>;
  masterDimensionId: string | null;
  setMasterDimensionId: (id: string | null) => void;
  masterDimensionValues: string[];
  setMasterDimensionValues: (vals: string[]) => void;
  masterDimensionOptions: string[];
  masterDimensionValuesLoading: boolean;
}

const MasterDimensionPopover: React.FC<MasterDimensionPopoverProps> = ({
  open,
  onOpenChange,
  dimensions,
  masterDimensionId,
  setMasterDimensionId,
  masterDimensionValues,
  setMasterDimensionValues,
  masterDimensionOptions,
  masterDimensionValuesLoading,
}) => {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <div style={{ display: "none" }} />
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0 bg-background border shadow-lg z-[100]" align="start">
        {!masterDimensionId ? (
          <>
            <div className="p-2 border-b bg-muted/50">
              <p className="text-xs font-medium text-muted-foreground">Select Master Dimension</p>
            </div>
            <ScrollArea className="h-[250px]">
              <div className="p-2 space-y-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-xs"
                  onClick={() => {
                    setMasterDimensionId(null);
                    setMasterDimensionValues([]);
                    onOpenChange(false);
                  }}
                >
                  None (Clear filter)
                </Button>
                {dimensions.filter(d => d.type === "text").map(dim => (
                  <Button
                    key={dim.id}
                    variant={masterDimensionId === dim.id ? "secondary" : "ghost"}
                    size="sm"
                    className="w-full justify-start text-xs"
                    onClick={() => {
                      setMasterDimensionId(dim.id);
                      setMasterDimensionValues([]);
                    }}
                  >
                    {dim.name}
                    {dim.scope && (
                      <span className="ml-auto text-[10px] text-muted-foreground capitalize">
                        {dim.scope}
                      </span>
                    )}
                  </Button>
                ))}
              </div>
            </ScrollArea>
          </>
        ) : (
          <>
            <div className="p-2 border-b bg-muted/50 flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">
                {dimensions.find(d => d.id === masterDimensionId)?.name} Values
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => {
                  setMasterDimensionId(null);
                  setMasterDimensionValues([]);
                }}
              >
                Change Dimension
              </Button>
            </div>
            <div className="p-2 border-b flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 h-7 text-xs"
                onClick={() => setMasterDimensionValues(masterDimensionOptions)}
              >
                Select All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 h-7 text-xs"
                onClick={() => setMasterDimensionValues([])}
              >
                Clear All
              </Button>
            </div>
            <ScrollArea className="h-[250px]">
              <div className="p-2 space-y-1">
                {masterDimensionValuesLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary"></div>
                  </div>
                ) : masterDimensionOptions.length === 0 ? (
                  <div className="text-xs text-muted-foreground text-center py-4">
                    No values found
                  </div>
                ) : (
                  masterDimensionOptions.map(value => (
                    <div
                      key={value}
                      className="flex items-center gap-2 p-2 hover:bg-accent rounded cursor-pointer transition-colors"
                      onClick={() => {
                        const next = masterDimensionValues.includes(value)
                          ? masterDimensionValues.filter(v => v !== value)
                          : [...masterDimensionValues, value];
                        setMasterDimensionValues(next);
                      }}
                    >
                      <Checkbox
                        checked={masterDimensionValues.includes(value)}
                        onCheckedChange={() => {}}
                      />
                      <span className="text-xs">{value}</span>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
};

export default MasterDimensionPopover;