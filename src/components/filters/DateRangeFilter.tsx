import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Calendar } from "lucide-react";
import { format, isAfter } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Calendar as CalendarComponent } from "@/components/ui/calendar-with-presets";
import { dateRangeFromPreset } from "@/lib/monthUtils";

interface DateRangeFilterProps {
  dateRange: DateRange | undefined;
  datePreset: string;
  compareEnabled: boolean;
  compareType: string;
  /**
   * Unified apply callback — receives all draft state at once.
   * When provided, individual on* callbacks are ignored.
   */
  onApply?: (payload: {
    range: DateRange | undefined;
    preset: string;
    compareEnabled: boolean;
    compareType: string;
  }) => void;
  onDatePresetChange?: (preset: string) => void;
  onDateRangeChange?: (range: DateRange | undefined) => void;
  onCompareEnabledChange?: (enabled: boolean) => void;
  onCompareTypeChange?: (type: string) => void;
  presets?: Array<{ id: string; label: string }>;
  showCompare?: boolean;
}

const DEFAULT_PRESETS: Array<{ id: string; label: string }> = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last_7_days", label: "Last 7 Days" },
  { id: "last_14_days", label: "Last 14 Days" },
  { id: "last_30_days", label: "Last 30 Days" },
  { id: "last_90_days", label: "Last 90 Days" },
  { id: "month_to_date", label: "Month to Date" },
  { id: "quarter_to_date", label: "Quarter to Date" },
  { id: "year_to_date", label: "Year to Date" },
  { id: "last_month", label: "Last Month" },
  { id: "last_quarter", label: "Last Quarter" },
  { id: "last_year", label: "Last Year" },
  { id: "this_year", label: "This Year" },
  { id: "all_time", label: "All Time" },
];

const DateRangeFilter: React.FC<DateRangeFilterProps> = ({
  dateRange,
  datePreset,
  compareEnabled,
  compareType,
  onApply,
  onDatePresetChange,
  onDateRangeChange,
  onCompareEnabledChange,
  onCompareTypeChange,
  presets: presetsProp,
  showCompare = true,
}) => {
  const presets = presetsProp ?? DEFAULT_PRESETS;
  const [open, setOpen] = useState(false);

  // All state inside the popover is draft — nothing reaches the parent until Apply.
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>(dateRange);
  const [pendingPreset, setPendingPreset] = useState(datePreset);
  const [pendingCompareEnabled, setPendingCompareEnabled] = useState(compareEnabled);
  const [pendingCompareType, setPendingCompareType] = useState(compareType);

  const [phase, setPhase] = useState<'idle' | 'picking-end'>('idle');
  const [hoverDate, setHoverDate] = useState<Date | undefined>(undefined);

  const displayedRange: DateRange | undefined = (() => {
    if (phase === 'picking-end' && pendingRange?.from && hoverDate) {
      const from = pendingRange.from;
      const to = hoverDate;
      return isAfter(to, from) ? { from, to } : { from: to, to: from };
    }
    return pendingRange;
  })();

  const anchorDate = pendingRange?.from ?? dateRange?.from;
  const initialDisplayMonth = anchorDate
    ? new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1)
    : new Date();
  const [displayMonth, setDisplayMonth] = useState(initialDisplayMonth);

  // Reset all draft state from committed props when popover opens
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setPendingRange(dateRange);
      setPendingPreset(datePreset);
      setPendingCompareEnabled(compareEnabled);
      setPendingCompareType(compareType);
      setPhase('idle');
      setHoverDate(undefined);
      const anchor = dateRange?.from ?? new Date();
      setDisplayMonth(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    }
    setOpen(next);
  };

  const handlePresetClick = (id: string) => {
    setPendingPreset(id);
    setPhase('idle');
    setHoverDate(undefined);

    if (id === 'all_time') {
      setPendingRange(undefined);
    } else {
      const range = dateRangeFromPreset(id);
      if (range) {
        setPendingRange(range);
        setDisplayMonth(new Date(range.from!.getFullYear(), range.from!.getMonth(), 1));
      }
    }
  };

  const handleDayClick = useCallback((day: Date) => {
    setPendingPreset('custom');
    if (phase === 'idle') {
      setPendingRange({ from: day, to: undefined });
      setHoverDate(undefined);
      setPhase('picking-end');
    } else {
      const from = pendingRange?.from;
      if (!from) {
        setPendingRange({ from: day, to: undefined });
        setHoverDate(undefined);
        setPhase('picking-end');
        return;
      }
      const [start, end] = isAfter(day, from) ? [from, day] : [day, from];
      setPendingRange({ from: start, to: end });
      setHoverDate(undefined);
      setPhase('idle');
    }
  }, [phase, pendingRange?.from]);

  const handleApply = () => {
    if (onApply) {
      onApply({
        range: pendingRange,
        preset: pendingPreset,
        compareEnabled: pendingCompareEnabled,
        compareType: pendingCompareType,
      });
    } else {
      // Legacy path: commit via individual callbacks
      if (pendingPreset === 'all_time' || pendingPreset !== datePreset) {
        onDatePresetChange?.(pendingPreset);
      }
      if (pendingRange !== dateRange) {
        onDateRangeChange?.(pendingRange);
      }
      if (pendingCompareEnabled !== compareEnabled) {
        onCompareEnabledChange?.(pendingCompareEnabled);
      }
      if (pendingCompareType !== compareType) {
        onCompareTypeChange?.(pendingCompareType);
      }
    }
    setOpen(false);
  };

  const renderButtonLabel = () => {
    if (datePreset === "all_time") return "All Time";
    if (dateRange?.from) {
      if (dateRange.to) {
        const toDate = new Date(dateRange.to);
        const friendlyTo =
          toDate.getUTCHours() === 23 && toDate.getUTCMinutes() === 59
            ? format(
                new Date(toDate.getUTCFullYear(), toDate.getUTCMonth(), toDate.getUTCDate()),
                "MMM d, yyyy"
              )
            : format(toDate, "MMM d, yyyy");
        return `${format(dateRange.from, "MMM d")} – ${friendlyTo}`;
      }
      return format(dateRange.from, "MMM d, yyyy");
    }
    const active = presets.find((p) => p.id === datePreset);
    return active?.label ?? "This Month";
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "h-8 gap-1.5 text-sm font-normal bg-background border-input",
              !dateRange?.from && datePreset !== "all_time" && "text-muted-foreground"
            )}
          >
            <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{renderButtonLabel()}</span>
          </Button>
        </PopoverTrigger>

        <PopoverContent className="w-auto p-0 bg-background z-50" align="start">
          <div className="flex divide-x">
            <div className="w-36 py-2 flex flex-col">
              <div className="overflow-y-auto max-h-[300px] flex flex-col px-1.5">
                {presets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={cn(
                      "text-left text-sm px-2.5 py-1.5 rounded-md transition-colors",
                      pendingPreset === p.id
                        ? "font-semibold text-foreground bg-accent"
                        : "font-normal text-muted-foreground hover:text-foreground hover:bg-accent/60"
                    )}
                    onClick={() => handlePresetClick(p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-4">
              <CalendarComponent
                mode="range"
                selected={displayedRange}
                onDayClick={handleDayClick}
                onDayMouseEnter={(day) => phase === 'picking-end' && setHoverDate(day)}
                onDayMouseLeave={() => phase === 'picking-end' && setHoverDate(undefined)}
                numberOfMonths={1}
                month={displayMonth}
                onMonthChange={setDisplayMonth}
                onSelect={() => {}}
              />
            </div>
          </div>

          {showCompare && pendingCompareEnabled && (
            <div className="p-3 border-t space-y-2">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Compare to:
              </Label>
              <div className="flex flex-col gap-0.5">
                {[
                  { id: "previous_period", label: "Previous period" },
                  { id: "previous_year", label: "Previous year" },
                ].map((opt) => (
                  <div
                    key={opt.id}
                    className={cn(
                      "flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer hover:bg-accent text-sm",
                      pendingCompareType === opt.id && "bg-accent"
                    )}
                    onClick={() => setPendingCompareType(opt.id)}
                  >
                    <div
                      className={cn(
                        "w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0",
                        pendingCompareType === opt.id ? "border-primary" : "border-muted-foreground"
                      )}
                    >
                      {pendingCompareType === opt.id && (
                        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      )}
                    </div>
                    {opt.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="px-3 py-2 border-t flex items-center justify-between gap-2">
            {showCompare ? (
              <div className="flex items-center gap-2">
                <Switch
                  id="compare-toggle"
                  checked={pendingCompareEnabled}
                  onCheckedChange={setPendingCompareEnabled}
                />
                <Label htmlFor="compare-toggle" className="text-sm cursor-pointer text-muted-foreground">
                  Compare periods
                </Label>
              </div>
            ) : (
              <span />
            )}
            <Button size="sm" className="h-7 px-3 text-xs" onClick={handleApply}>
              Apply
            </Button>
          </div>
        </PopoverContent>
    </Popover>
  );
};

export default DateRangeFilter;
