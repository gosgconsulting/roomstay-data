import React from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings, Search, Check } from "lucide-react";

interface DimensionMeta {
  id: string;
  name: string;
}

interface DimensionFilterProps {
  dimension: DimensionMeta;
  isLoading?: boolean;
  values: string[];
  searchTerm: string;
  selectedValues: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSearchTermChange: (term: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onToggleValue: (value: string) => void;
}

export const DimensionFilter: React.FC<DimensionFilterProps> = ({
  dimension,
  isLoading = false,
  values,
  searchTerm,
  selectedValues,
  open,
  onOpenChange,
  onSearchTermChange,
  onSelectAll,
  onDeselectAll,
  onToggleValue,
}) => {
  const filteredValues = searchTerm
    ? values.filter(v => v.toLowerCase().includes(searchTerm.toLowerCase()))
    : values;
  const selectedCount = selectedValues.length;

  if (isLoading) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">{dimension.name}</span>
        <Skeleton className="h-10 w-[200px]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">{dimension.name}</label>
      <Popover open={open} onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) onSearchTermChange("");
      }}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-[200px] justify-between bg-background"
          >
            {selectedCount === 0 ? (
              <span>All {dimension.name}</span>
            ) : (
              <span>
                {selectedCount === 1 ? selectedValues[0] : `${selectedCount} selected`}
              </span>
            )}
            <Settings className="ml-2 h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[250px] p-0 bg-background z-50" align="start">
          <div className="flex flex-col">
            <div className="p-2 border-b">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={`Search ${dimension.name.toLowerCase()}...`}
                  value={searchTerm}
                  onChange={(e) => onSearchTermChange(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <div className="flex gap-1 p-2 border-b">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 h-8 text-xs"
                onClick={onSelectAll}
              >
                Select All
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 h-8 text-xs"
                onClick={onDeselectAll}
              >
                Deselect All
              </Button>
            </div>
            <ScrollArea className="h-[300px]">
              <div className="p-2">
                {filteredValues.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-4">
                    No results found
                  </div>
                ) : (
                  filteredValues.map((value) => {
                    const isSelected = selectedValues.includes(value);
                    return (
                      <div
                        key={value}
                        className="flex items-center space-x-2 rounded-sm px-2 py-1.5 hover:bg-accent cursor-pointer"
                        onClick={() => onToggleValue(value)}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => onToggleValue(value)}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <label className="text-sm flex-1 cursor-pointer">
                          {value}
                        </label>
                        {isSelected && <Check className="h-4 w-4 text-primary" />}
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default DimensionFilter;