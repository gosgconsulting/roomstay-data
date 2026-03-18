import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

type Channel = "metasearch" | "sem" | "social";

export interface DimensionOption {
  id: string;
  name: string;
  type: string;
}

export type DimensionSettingsMode = "filters" | "breakdowns";

export interface DimensionSettingsModalValue {
  filtersByChannel: Record<Channel, string[]>;
  breakdownsByChannel: Record<Channel, string[]>;
}

interface DimensionSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: DimensionSettingsMode;
  initialChannel: Channel;
  filterDimensions: Record<Channel, DimensionOption[]>;
  breakdownDimensions: Record<Channel, DimensionOption[]>;
  value: DimensionSettingsModalValue;
  onApply: (next: DimensionSettingsModalValue) => void;
  disabled?: boolean;
}

function normalizeQuery(v: string) {
  return v.trim().toLowerCase();
}

export function DimensionSettingsModal({
  open,
  onOpenChange,
  mode,
  initialChannel,
  filterDimensions,
  breakdownDimensions,
  value,
  onApply,
  disabled,
}: DimensionSettingsModalProps) {
  const [activeChannel, setActiveChannel] = useState<Channel>(initialChannel);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<DimensionSettingsModalValue>(value);

  // Reset draft on open/mode/channel changes so Cancel truly reverts.
  // (Dialog is reused for both filters + breakdowns.)
  useEffect(() => {
    if (!open) return;
    setActiveChannel(initialChannel);
    setQuery("");
    setDraft(value);
  }, [open, mode, initialChannel, value]);

  const options = useMemo(() => {
    const list =
      mode === "filters"
        ? filterDimensions[activeChannel] || []
        : breakdownDimensions[activeChannel] || [];

    const q = normalizeQuery(query);
    const filtered = q
      ? list.filter((d) => d.name.toLowerCase().includes(q))
      : list;

    // Sort: selected first, then alpha
    const selectedSet = new Set(
      mode === "filters"
        ? draft.filtersByChannel[activeChannel] || []
        : draft.breakdownsByChannel[activeChannel] || []
    );
    return [...filtered].sort((a, b) => {
      const aSel = selectedSet.has(a.id) ? 0 : 1;
      const bSel = selectedSet.has(b.id) ? 0 : 1;
      if (aSel !== bSel) return aSel - bSel;
      return a.name.localeCompare(b.name);
    });
  }, [activeChannel, breakdownDimensions, draft, filterDimensions, mode, query]);

  const selectedIds = mode === "filters"
    ? (draft.filtersByChannel[activeChannel] || [])
    : (draft.breakdownsByChannel[activeChannel] || []);

  const setSelectedIds = (nextIds: string[]) => {
    setDraft((prev) => {
      if (mode === "filters") {
        return {
          ...prev,
          filtersByChannel: {
            ...prev.filtersByChannel,
            [activeChannel]: nextIds,
          },
        };
      }
      return {
        ...prev,
        breakdownsByChannel: {
          ...prev.breakdownsByChannel,
          [activeChannel]: nextIds,
        },
      };
    });
  };

  const title = mode === "filters" ? "Filter dimensions" : "Breakdown dimensions";
  const description = mode === "filters"
    ? "Choose which dimensions appear as filter dropdowns for each channel."
    : "Choose which dimensions are available for Group by / Breakdown by.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <p className="text-sm text-muted-foreground">{description}</p>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Tabs value={activeChannel} onValueChange={(v) => setActiveChannel(v as Channel)}>
              <TabsList>
                <TabsTrigger value="metasearch">Metasearch</TabsTrigger>
                <TabsTrigger value="sem">SEM</TabsTrigger>
                <TabsTrigger value="social">Social</TabsTrigger>
              </TabsList>
              {/* Keep content outside; this is just the control */}
              <TabsContent value="metasearch" />
              <TabsContent value="sem" />
              <TabsContent value="social" />
            </Tabs>

            <div className="w-[240px]">
              <Label className="sr-only" htmlFor="dimension-settings-search">Search</Label>
              <Input
                id="dimension-settings-search"
                placeholder="Search dimensions"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="rounded-md border">
            <ScrollArea className="h-[320px]">
              <div className="p-2 space-y-1">
                {options.length === 0 ? (
                  <div className="p-6 text-sm text-muted-foreground text-center">
                    No dimensions available for this channel.
                  </div>
                ) : (
                  options.map((dim) => {
                    const checked = selectedIds.includes(dim.id);
                    return (
                      <button
                        key={dim.id}
                        type="button"
                        className="w-full flex items-center gap-3 rounded-md px-2 py-2 hover:bg-accent text-left"
                        onClick={() => {
                          if (disabled) return;
                          setSelectedIds(
                            checked
                              ? selectedIds.filter((id) => id !== dim.id)
                              : [...selectedIds, dim.id]
                          );
                        }}
                      >
                        <Checkbox checked={checked} onCheckedChange={() => {}} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{dim.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{dim.type}</div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              onApply(draft);
              onOpenChange(false);
            }}
            disabled={disabled}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

