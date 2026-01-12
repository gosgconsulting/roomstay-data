import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";

interface DimensionValuesListProps {
  values: string[];
  selectedValues: string[];
  loading: boolean;
  onValueToggle: (value: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
}

export function DimensionValuesList({
  values,
  selectedValues,
  loading,
  onValueToggle,
  onSelectAll,
  onDeselectAll,
}: DimensionValuesListProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredValues = useMemo(() => {
    if (!searchQuery.trim()) return values;
    return values.filter(v =>
      v.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [values, searchQuery]);

  return (
    <>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search values..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {filteredValues.length > 0 && !loading && (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSelectAll}
            className="flex-1"
          >
            Select All
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onDeselectAll}
            className="flex-1"
          >
            Deselect All
          </Button>
        </div>
      )}

      <ScrollArea className="flex-1 border rounded-md">
        <div className="p-2 space-y-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mb-2" />
              <p className="text-sm">Loading dimension values...</p>
            </div>
          ) : filteredValues.length > 0 ? (
            filteredValues.map(value => (
              <div
                key={value}
                className={cn(
                  "flex items-center gap-3 p-2 rounded cursor-pointer transition-colors",
                  selectedValues.includes(value)
                    ? "bg-primary/10"
                    : "hover:bg-muted/50"
                )}
                onClick={() => onValueToggle(value)}
              >
                <Checkbox
                  checked={selectedValues.includes(value)}
                  onCheckedChange={() => onValueToggle(value)}
                />
                <span className="text-sm">{value}</span>
              </div>
            ))
          ) : (
            <p className="text-center text-muted-foreground py-4">
              No values found.
            </p>
          )}
        </div>
      </ScrollArea>
    </>
  );
}
