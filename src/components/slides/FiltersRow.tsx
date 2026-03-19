import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Filter, Share2, RefreshCw, Loader2, ChevronDown, X, RotateCcw } from "lucide-react";
import { slideSelectionToDateRange, dateRangeToSlideSelection, deriveSlideDatePreset, dateRangeFromPreset, derivePresetFromDateRange } from "@/lib/monthUtils";
import { DateRangeFilter } from "@/components/filters";
import type { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import type { FilterValues, FilterOptions, DimensionNameMap, FilterConfigs } from "@/hooks/useDataStudioFilters";

type Channel = 'metasearch' | 'sem' | 'social';

// ─── Inline filter dropdown (shown next to date range) ────────────────────────

interface InlineFilterDropdownProps {
  label: string;
  dimensionId: string;
  options: string[];
  selected: string[];
  onToggle: (values: string[]) => void;
  onClear: () => void;
}

function InlineFilterDropdown({
  label,
  options,
  selected,
  onToggle,
  onClear,
}: InlineFilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(
    () => (search ? options.filter((v) => v.toLowerCase().includes(search.toLowerCase())) : options),
    [options, search]
  );

  // Empty selected = "All" (no active filter). All items visually checked in that state.
  const isAllMode = selected.length === 0;
  const activeCount = selected.length;

  const buttonLabel = isAllMode
    ? "All"
    : activeCount === 1
      ? selected[0]
      : `${activeCount} selected`;

  const handleRowClick = (val: string) => {
    if (isAllMode) {
      // Uncheck one item from "all" → select everything except this one
      const next = options.filter((v) => v !== val);
      onToggle(next);
    } else {
      const checked = selected.includes(val);
      const next = checked
        ? selected.filter((v) => v !== val)
        : [...selected, val];
      // If every option is now selected, revert to "all" mode (empty = no filter)
      onToggle(next.length === options.length ? [] : next);
    }
  };

  const handleOnly = (e: React.MouseEvent, val: string) => {
    e.stopPropagation();
    onToggle([val]);
  };

  const handleSelectAll = () => onClear(); // empty selection = "All"

  return (
    <div className="shrink-0">
      <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(""); }}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-8 gap-1.5 text-sm font-normal bg-background border-input max-w-[200px]",
              !isAllMode && "border-primary text-primary bg-primary/5"
            )}
          >
            {/* Dimension name as muted prefix */}
            <span className="text-muted-foreground font-medium shrink-0">{label}:</span>
            <span className="truncate">{buttonLabel}</span>
            {!isAllMode ? (
              <Badge
                variant="secondary"
                className="h-4 px-1.5 text-[10px] font-semibold shrink-0 bg-primary/10 text-primary"
              >
                {activeCount}
              </Badge>
            ) : (
              <ChevronDown className="h-3.5 w-3.5 opacity-50 shrink-0" />
            )}
          </Button>
        </PopoverTrigger>

        {/* min-w matches trigger, w-max lets it grow to fit longest label */}
        <PopoverContent
          align="start"
          className="min-w-[220px] w-max max-w-[400px] p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {/* Search */}
          <div className="p-2 border-b">
            <Input
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 text-sm w-full"
              autoFocus
            />
          </div>

          {/* Select / deselect all checkbox */}
          <div
            className="px-3 py-2 border-b flex items-center gap-2 cursor-pointer hover:bg-accent transition-colors"
            onClick={() => isAllMode ? onToggle([]) : onClear()}
          >
            <Checkbox
              checked={isAllMode}
              onCheckedChange={() => isAllMode ? onToggle([]) : onClear()}
              className="shrink-0 pointer-events-none"
            />
            <span className="text-sm select-none">
              {isAllMode
                ? `All (${options.length})`
                : `${activeCount} selected`}
            </span>
          </div>

          {/* Option list */}
          <ScrollArea className="max-h-[240px]">
            <div className="p-1.5 space-y-px">
              {filtered.length === 0 && (
                <p className="text-xs text-muted-foreground py-4 text-center">No options</p>
              )}
              {filtered.map((val) => {
                const checked = isAllMode || selected.includes(val);
                return (
                  // Use CSS group-hover — no React hover state needed, avoids re-render flicker
                  <div
                    key={val}
                    className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent cursor-pointer transition-colors"
                    onClick={() => handleRowClick(val)}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => {}}
                      className="shrink-0 pointer-events-none"
                    />
                    {/* Label takes remaining space; "Only" slides in from right on hover */}
                    <span className="text-sm flex-1 select-none whitespace-nowrap">{val}</span>
                    <button
                      type="button"
                      className="ml-2 shrink-0 text-[10px] font-semibold text-primary bg-primary/10 hover:bg-primary/20 px-1.5 py-0.5 rounded transition-colors opacity-0 group-hover:opacity-100"
                      onClick={(e) => handleOnly(e, val)}
                    >
                      Only
                    </button>
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          {/* Footer */}
          {!isAllMode && (
            <div className="border-t p-2 flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">{activeCount} selected</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs gap-1 px-2"
                onClick={onClear}
              >
                <X className="h-3 w-3" />
                Clear all
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ─── FiltersRow ───────────────────────────────────────────────────────────────

interface FiltersRowProps {
  selectedTab: string;
  isReadOnlyMode: boolean;
  selectedYear: string;
  setSelectedYear: (year: string) => void;
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  customDateRange?: DateRange | undefined;
  setCustomDateRange?: (range: DateRange | undefined) => void;
  comparisonType: string;
  setComparisonType: (type: string) => void;
  onOpenFilters: () => void;
  /** Number of active filter selections — shown as badge on the Filters button */
  activeFilterCount?: number;
  /** Active filter configs — determines which filter dropdowns to show inline */
  filterConfigs?: FilterConfigs;
  /** Available filter options per channel */
  filterOptions?: FilterOptions;
  /** Current filter values per channel */
  filterValues?: FilterValues;
  /** Dimension name map */
  dimensionNames?: DimensionNameMap;
  /** Callback to toggle a filter value */
  onToggleFilterValue?: (channel: Channel, dimId: string, values: string[]) => void;
  /** Callback to clear a filter dimension */
  onClearFilter?: (channel: Channel, dimId: string) => void;
  /** Callback to reset all active filter selections across all channels */
  onResetAllFilters?: () => void;
  onShare: () => void;
  onRefreshData: () => void;
  isRefreshInProgress: boolean;
  showRefreshButton: boolean;
}

export function FiltersRow({
  selectedTab,
  isReadOnlyMode,
  selectedYear,
  setSelectedYear,
  selectedMonth,
  setSelectedMonth,
  customDateRange,
  setCustomDateRange,
  comparisonType,
  setComparisonType,
  onOpenFilters,
  activeFilterCount = 0,
  filterConfigs,
  filterOptions,
  filterValues,
  dimensionNames = {},
  onToggleFilterValue,
  onClearFilter,
  onResetAllFilters,
  onShare,
  onRefreshData,
  isRefreshInProgress,
  showRefreshButton,
}: FiltersRowProps) {
  // Build inline filter entries — only on channel tabs (not overview or other tabs)
  const inlineFilters = useMemo(() => {
    if (!filterConfigs || !filterOptions || !filterValues) return [];

    // Filters are channel-specific — hide them on overview and non-channel tabs
    if (selectedTab !== "metasearch" && selectedTab !== "sem" && selectedTab !== "social") return [];

    const channelsToShow: Channel[] = [selectedTab as Channel];

    const entries: Array<{
      channel: Channel;
      dimId: string;
      label: string;
      options: string[];
      selected: string[];
    }> = [];

    for (const ch of channelsToShow) {
      const enabledIds = filterConfigs[ch]?.filterDimensionIds ?? [];
      const chOptions = filterOptions[ch] ?? {};
      const chSelected = filterValues[ch] ?? {};

      for (const dimId of enabledIds) {
        const options = chOptions[dimId] ?? [];
        entries.push({
          channel: ch,
          dimId,
          label: dimensionNames[dimId] || dimId,
          options,
          selected: chSelected[dimId] ?? [],
        });
      }
    }

    return entries;
  }, [selectedTab, filterConfigs, filterOptions, filterValues, dimensionNames]);

  return (
    <div className="flex flex-nowrap items-center justify-between gap-3">
      {/* Left: date range + inline filter dropdowns */}
      <div className="flex flex-nowrap items-center gap-2 flex-1 min-w-0 overflow-x-auto">
        {/* Date Filters — Show on all tabs except Budget */}
        {selectedTab !== "budget" && (
          <div className="shrink-0">
            <DateRangeFilter
              dateRange={customDateRange ?? slideSelectionToDateRange(selectedYear, selectedMonth)}
              datePreset={customDateRange ? derivePresetFromDateRange(customDateRange) : deriveSlideDatePreset(selectedYear, selectedMonth)}
              compareEnabled={comparisonType !== "none"}
              compareType={comparisonType}
              onDatePresetChange={(preset) => {
                if (isReadOnlyMode) return;
                if (preset === "all_time") {
                  setCustomDateRange?.(undefined);
                  setSelectedYear("all");
                  setSelectedMonth("all");
                  setComparisonType("none");
                  return;
                }
                const presetRange = dateRangeFromPreset(preset);
                if (presetRange) {
                  setCustomDateRange?.(presetRange);
                  const next = dateRangeToSlideSelection(presetRange);
                  setSelectedYear(next.year);
                  setSelectedMonth(next.month);
                  return;
                }
              }}
              onDateRangeChange={(range) => {
                if (isReadOnlyMode) return;
                setCustomDateRange?.(range);
                const next = dateRangeToSlideSelection(range);
                setSelectedYear(next.year);
                setSelectedMonth(next.month);
              }}
              onCompareEnabledChange={(enabled) => {
                if (isReadOnlyMode) return;
                setComparisonType(enabled ? "previous_period" : "none");
              }}
              onCompareTypeChange={(type) => {
                if (isReadOnlyMode) return;
                setComparisonType(type);
              }}
              presets={[
                { id: "today", label: "Today" },
                { id: "yesterday", label: "Yesterday" },
                { id: "last_7_days", label: "Last 7 Days" },
                { id: "last_14_days", label: "Last 14 Days" },
                { id: "last_30_days", label: "Last 30 Days" },
                { id: "this_month", label: "This Month" },
                { id: "last_month", label: "Last Month" },
                { id: "this_year", label: "This Year" },
                { id: "last_year", label: "Last Year" },
                { id: "all_time", label: "All Time" },
              ]}
              showCompare
            />
          </div>
        )}

        {/* Inline filter dropdowns — appear after date range on channel tabs */}
        {inlineFilters.length > 0 && (
          <div className="flex items-center gap-2 flex-nowrap overflow-x-auto">
            <div className="w-px h-5 bg-border shrink-0" />
            {inlineFilters.map(({ channel, dimId, label, options, selected }) => (
              <InlineFilterDropdown
                key={`${channel}-${dimId}`}
                label={label}
                dimensionId={dimId}
                options={options}
                selected={selected}
                onToggle={(vals) => onToggleFilterValue?.(channel, dimId, vals)}
                onClear={() => onClearFilter?.(channel, dimId)}
              />
            ))}
            {/* Reset all — only shown when at least one filter has a non-empty selection */}
            {activeFilterCount > 0 && onResetAllFilters && (
              <button
                type="button"
                title="Reset all filters"
                className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={onResetAllFilters}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            )}
          </div>
        )}
      </div>

      {/* Right: Filters settings button, Share, Refresh */}
      <div className="flex items-center gap-2 shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={onOpenFilters}
        >
          <Filter className="h-3.5 w-3.5" />
          Filters
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5"
          onClick={onShare}
        >
          <Share2 className="h-3.5 w-3.5" />
          Share
        </Button>
        {showRefreshButton && (
          <Button
            variant="default"
            size="sm"
            className="h-8 gap-1.5 bg-primary hover:bg-primary/90"
            onClick={onRefreshData}
            disabled={isRefreshInProgress}
          >
            {isRefreshInProgress ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh Data
          </Button>
        )}
      </div>
    </div>
  );
}
