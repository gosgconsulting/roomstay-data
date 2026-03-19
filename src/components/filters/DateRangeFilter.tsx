import React, { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Calendar } from "lucide-react";
import { format, isAfter, isBefore } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Calendar as CalendarComponent } from "@/components/ui/calendar-with-presets";

interface DateRangeFilterProps {
  dateRange: DateRange | undefined;
  datePreset: string;
  compareEnabled: boolean;
  compareType: string;
  onDatePresetChange: (preset: string) => void;
  onDateRangeChange: (range: DateRange | undefined) => void;
  onCompareEnabledChange: (enabled: boolean) => void;
  onCompareTypeChange: (type: string) => void;
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
  onDatePresetChange,
  onDateRangeChange,
  onCompareEnabledChange,
  onCompareTypeChange,
  presets: presetsProp,
  showCompare = true,
}) => {
  const presets = presetsProp ?? DEFAULT_PRESETS;
  const [open, setOpen] = useState(false);

  // Pending range — only committed on Apply
  const [pendingRange, setPendingRange] = useState<DateRange | undefined>(dateRange);
  const [pendingPreset, setPendingPreset] = useState(datePreset);

  // Selection phase: 'idle' = no click yet / range complete, 'picking-end' = from set, waiting for to
  const [phase, setPhase] = useState<'idle' | 'picking-end'>('idle');
  // Hovered date for live range preview while picking end
  const [hoverDate, setHoverDate] = useState<Date | undefined>(undefined);

  // The range shown in the calendar — while picking end, preview up to hoverDate
  const displayedRange: DateRange | undefined = (() => {
    if (phase === 'picking-end' && pendingRange?.from && hoverDate) {
      const from = pendingRange.from;
      const to = hoverDate;
      return isAfter(to, from) ? { from, to } : { from: to, to: from };
    }
    return pendingRange;
  })();

  // Calendar view month — controlled so left/right arrows change the visible month
  const anchorDate = pendingRange?.from ?? dateRange?.from;
  const initialDisplayMonth = anchorDate
    ? new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1)
    : new Date();
  const [displayMonth, setDisplayMonth] = useState(initialDisplayMonth);

  // Sync pending state and calendar month when popover opens
  const handleOpenChange = (next: boolean) => {
    if (next) {
      setPendingRange(dateRange);
      setPendingPreset(datePreset);
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
    onDatePresetChange(id);
  };

  // Custom day click: two-phase selection
  const handleDayClick = useCallback((day: Date) => {
    if (phase === 'idle') {
      // First click — set start, clear end, enter picking-end phase
      setPendingRange({ from: day, to: undefined });
      setHoverDate(undefined);
      setPhase('picking-end');
    } else {
      // Second click — set end (swap if needed), complete selection
      const from = pendingRange?.from;
      if (!from) {
        // Defensive: if state got reset, treat this as a first click.
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
    onDateRangeChange(pendingRange);
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
          {/* Preset sidebar + calendar */}
          <div className="flex divide-x">
            {/* Left: preset list */}
            <div className="w-36 py-2 flex flex-col">
              <div className="overflow-y-auto max-h-[300px] flex flex-col px-1.5">
                {presets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={cn(
                      "text-left text-sm px-2.5 py-1.5 rounded-md transition-colors",
                      (pendingPreset === p.id || datePreset === p.id)
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

            {/* Right: single-month calendar */}
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
                // Suppress built-in range onSelect so our two-phase handler is the only driver
                onSelect={() => {}}
              />
            </div>
          </div>

          {/* Compare section */}
          {showCompare && compareEnabled && (
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
                      compareType === opt.id && "bg-accent"
                    )}
                    onClick={() => onCompareTypeChange(opt.id)}
                  >
                    <div
                      className={cn(
                        "w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0",
                        compareType === opt.id ? "border-primary" : "border-muted-foreground"
                      )}
                    >
                      {compareType === opt.id && (
                        <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                      )}
                    </div>
                    {opt.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer: Compare toggle + Apply */}
          <div className="px-3 py-2 border-t flex items-center justify-between gap-2">
            {showCompare ? (
              <div className="flex items-center gap-2">
                <Switch
                  id="compare-toggle"
                  checked={compareEnabled}
                  onCheckedChange={onCompareEnabledChange}
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
