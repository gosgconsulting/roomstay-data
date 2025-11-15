import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchUniqueDimensionValues } from "../lib/vlookup/fetchUniqueValues";
import { useDebounce } from "@/hooks/useDebounce";
import type { Dimension } from "@/hooks/performanceTable/usePerformanceTableDimensions";

type Row = {
  sourceDimensionId?: string;
  valuesToMap: string[];
  newDimensionName: string;
  groupedValue: string;
};

interface VlookupModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  reportId: string | null;
  reportIds?: string[];
  accountId?: string;
  dimensions?: Dimension[];
  onCreate?: (rows: Row[]) => void;
}

export default function VlookupModal({
  open,
  onOpenChange,
  reportId,
  reportIds,
  accountId,
  dimensions = [],
  onCreate,
}: VlookupModalProps) {
  const [rows, setRows] = useState<Row[]>([{ valuesToMap: [], newDimensionName: "", groupedValue: "" }]);
  const [options, setOptions] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const textDimensions = useMemo(
    () => dimensions.filter(d => d.type === "text"),
    [dimensions]
  );

  const selectedSourceDimensionId = rows[0]?.sourceDimensionId;

  // Load unique values whenever source dimension changes or search updates
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!open) return;
      if (!selectedSourceDimensionId) {
        setOptions([]);
        return;
      }
      if (!reportId && (!reportIds || reportIds.length === 0)) {
        setOptions([]);
        return;
      }

      setLoadingOptions(true);
      const values = await fetchUniqueDimensionValues({
        reportId: reportId ?? undefined,
        reportIds,
        dimensionId: selectedSourceDimensionId,
        search: debouncedSearch || undefined,
        limit: 5000,
      }).catch(() => []);

      if (!cancelled) {
        setOptions(values);
        setLoadingOptions(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [open, selectedSourceDimensionId, debouncedSearch, reportId, JSON.stringify(reportIds)]);

  const updateRow = (index: number, patch: Partial<Row>) => {
    setRows(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...patch };
      return copy;
    });
  };

  const addRow = () => setRows(prev => [...prev, { sourceDimensionId: selectedSourceDimensionId, valuesToMap: [], newDimensionName: "", groupedValue: "" }]);
  const removeRow = (index: number) => setRows(prev => prev.filter((_, i) => i !== index));

  const handleCreate = () => {
    const valid = rows.filter(r => r.sourceDimensionId && r.valuesToMap.length > 0 && r.newDimensionName.trim() && r.groupedValue.trim());
    if (valid.length === 0) return;
    onCreate?.(valid as Row[]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Create Pivot Dimensions</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {rows.map((row, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-3 items-end">
              <div className="col-span-3">
                <Label>Source Dimension</Label>
                <Select
                  value={row.sourceDimensionId}
                  onValueChange={(val) => {
                    // set on the current row
                    updateRow(idx, { sourceDimensionId: val, valuesToMap: [] });
                    // also align first row's source for options loading UX
                    if (idx === 0) {
                      setRows(prev => prev.map((r, i) => i === 0 ? { ...r, sourceDimensionId: val } : r));
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select dimension" />
                  </SelectTrigger>
                  <SelectContent>
                    {textDimensions.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-4">
                <Label>Values to Map</Label>
                <div className="space-y-2">
                  <Input
                    placeholder="Search..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <div className="max-h-48 overflow-auto border rounded p-2">
                    {loadingOptions ? (
                      <div className="text-sm text-muted-foreground">Loading values…</div>
                    ) : options.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No values found</div>
                    ) : (
                      <div className="flex flex-col gap-1">
                        {options.map((val) => {
                          const selected = row.valuesToMap.includes(val);
                          return (
                            <button
                              key={val}
                              type="button"
                              onClick={() => {
                                const valuesToMap = selected
                                  ? row.valuesToMap.filter(v => v !== val)
                                  : [...row.valuesToMap, val];
                                updateRow(idx, { valuesToMap });
                              }}
                              className={`text-left px-2 py-1 rounded ${selected ? 'bg-primary/10' : 'hover:bg-accent'}`}
                            >
                              {val}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  {row.valuesToMap.length > 0 && (
                    <div className="text-xs text-muted-foreground">{row.valuesToMap.length} selected</div>
                  )}
                </div>
              </div>

              <div className="col-span-3">
                <Label>New Dimension Name</Label>
                <Input
                  placeholder="e.g., Account"
                  value={row.newDimensionName}
                  onChange={(e) => updateRow(idx, { newDimensionName: e.target.value })}
                />
              </div>

              <div className="col-span-2">
                <Label>Grouped Value</Label>
                <Input
                  placeholder="e.g., Brady"
                  value={row.groupedValue}
                  onChange={(e) => updateRow(idx, { groupedValue: e.target.value })}
                />
              </div>

              <div className="col-span-12 flex items-center gap-2">
                {rows.length > 1 && (
                  <Button variant="outline" size="sm" onClick={() => removeRow(idx)}>
                    Remove
                  </Button>
                )}
                {idx === rows.length - 1 && (
                  <Button variant="outline" size="sm" onClick={addRow}>
                    + Add Row
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate}>Create Dimensions</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}