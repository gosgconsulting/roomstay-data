import React, { useState, useMemo, useCallback } from "react";
import { format, subMonths, startOfMonth, endOfMonth, startOfYear, endOfYear, subYears } from "date-fns";
import { CalendarIcon, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { MONTH_NAMES } from "@/constants/slideViewConstants";

export type DatePreset = "this_month" | "last_month" | "this_year" | "last_year" | "custom";

interface DatePresetPickerProps {
  selectedYear: string;
  selectedMonth: string;
  onYearChange: (year: string) => void;
  onMonthChange: (month: string) => void;
  disabled?: boolean;
}

/** Derive the active preset from current selectedYear/selectedMonth */
function derivePreset(selectedYear: string, selectedMonth: string): DatePreset {
  const now = new Date();
  const curYear = now.getFullYear().toString();
  const curMonthName = MONTH_NAMES[now.getMonth()];
  const lastMonth = subMonths(now, 1);
  const lastMonthYear = lastMonth.getFullYear().toString();
  const lastMonthName = MONTH_NAMES[lastMonth.getMonth()];

  if (selectedYear === curYear && selectedMonth === curMonthName) return "this_month";
  if (selectedYear === lastMonthYear && selectedMonth === lastMonthName) return "last_month";
  if (selectedYear === curYear && selectedMonth === "all") return "this_year";
  if (selectedYear === (now.getFullYear() - 1).toString() && selectedMonth === "all") return "last_year";
  return "custom";
}

/** Convert a date range to year/month strings */
function dateRangeToYearMonth(from: Date, to: Date): { year: string; month: string } {
  const fromYear = from.getFullYear();
  const toYear = to.getFullYear();
  const fromMonth = from.getMonth();
  const toMonth = to.getMonth();

  // Same month
  if (fromYear === toYear && fromMonth === toMonth) {
    return { year: fromYear.toString(), month: MONTH_NAMES[fromMonth] };
  }

  // Full year (Jan 1 - Dec 31 of same year)
  if (fromYear === toYear && fromMonth === 0 && toMonth === 11) {
    return { year: fromYear.toString(), month: "all" };
  }

  // Multi-month within same year – consecutive months
  if (fromYear === toYear) {
    const months: string[] = [];
    for (let m = fromMonth; m <= toMonth; m++) {
      months.push(MONTH_NAMES[m]);
    }
    return { year: fromYear.toString(), month: months.join(",") };
  }

  // Cross-year – fall back to the "from" year with multi-month (best effort)
  return { year: fromYear.toString(), month: "all" };
}

const PRESETS: { value: DatePreset; label: string }[] = [
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_year", label: "This Year" },
  { value: "last_year", label: "Last Year" },
  { value: "custom", label: "Custom Range" },
];

export const DatePresetPicker = React.memo<DatePresetPickerProps>(
  ({ selectedYear, selectedMonth, onYearChange, onMonthChange, disabled }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [showCalendar, setShowCalendar] = useState(false);
    const [customRange, setCustomRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
      from: undefined,
      to: undefined,
    });

    const activePreset = useMemo(() => derivePreset(selectedYear, selectedMonth), [selectedYear, selectedMonth]);

    const displayLabel = useMemo(() => {
      switch (activePreset) {
        case "this_month": return "This Month";
        case "last_month": return "Last Month";
        case "this_year": return "This Year";
        case "last_year": return "Last Year";
        case "custom": {
          // Show descriptive label for custom
          if (selectedMonth === "all") return `${selectedYear} (Full Year)`;
          const months = selectedMonth.split(",").map(m => m.trim());
          if (months.length === 1) return `${months[0]} ${selectedYear}`;
          const first = months[0].slice(0, 3);
          const last = months[months.length - 1].slice(0, 3);
          return `${first}–${last} ${selectedYear}`;
        }
        default: return "Select Date";
      }
    }, [activePreset, selectedYear, selectedMonth]);

    const applyPreset = useCallback((preset: DatePreset) => {
      const now = new Date();
      switch (preset) {
        case "this_month":
          onYearChange(now.getFullYear().toString());
          onMonthChange(MONTH_NAMES[now.getMonth()]);
          setIsOpen(false);
          setShowCalendar(false);
          break;
        case "last_month": {
          const last = subMonths(now, 1);
          onYearChange(last.getFullYear().toString());
          onMonthChange(MONTH_NAMES[last.getMonth()]);
          setIsOpen(false);
          setShowCalendar(false);
          break;
        }
        case "this_year":
          onYearChange(now.getFullYear().toString());
          onMonthChange("all");
          setIsOpen(false);
          setShowCalendar(false);
          break;
        case "last_year":
          onYearChange((now.getFullYear() - 1).toString());
          onMonthChange("all");
          setIsOpen(false);
          setShowCalendar(false);
          break;
        case "custom":
          setShowCalendar(true);
          // Reset range so user picks fresh start & end dates
          setCustomRange({ from: undefined, to: undefined });
          break;
      }
    }, [onYearChange, onMonthChange, selectedYear, selectedMonth]);

    const applyCustomRange = useCallback(() => {
      if (customRange.from && customRange.to) {
        const { year, month } = dateRangeToYearMonth(customRange.from, customRange.to);
        onYearChange(year);
        onMonthChange(month);
      }
      setIsOpen(false);
      setShowCalendar(false);
    }, [customRange, onYearChange, onMonthChange]);

    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Date:</span>
        <Popover open={isOpen} onOpenChange={(open) => {
          setIsOpen(open);
          if (!open) setShowCalendar(false);
        }}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-[200px] h-9 justify-between px-3 bg-background text-sm font-normal",
                !selectedYear && "text-muted-foreground"
              )}
              disabled={disabled}
            >
              <div className="flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                <span className="truncate">{displayLabel}</span>
              </div>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0 bg-popover z-50" align="start">
            <div className="flex">
              {/* Presets sidebar */}
              <div className="border-r p-2 min-w-[150px]">
                <div className="space-y-0.5">
                  {PRESETS.map(preset => (
                    <button
                      key={preset.value}
                      className={cn(
                        "w-full text-left px-3 py-2 rounded-md text-sm transition-colors",
                        activePreset === preset.value && !showCalendar
                          ? "bg-primary text-primary-foreground"
                          : preset.value === "custom" && showCalendar
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent"
                      )}
                      onClick={() => applyPreset(preset.value)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Calendar panel (shown for custom) */}
              {showCalendar && (
                <div className="p-2">
                  <Calendar
                    mode="range"
                    selected={customRange.from ? { from: customRange.from, to: customRange.to } : undefined}
                    onSelect={(range) => {
                      setCustomRange({ from: range?.from, to: range?.to });
                    }}
                    numberOfMonths={2}
                    defaultMonth={customRange.from || new Date()}
                    className={cn("p-3 pointer-events-auto")}
                    fromYear={2023}
                    toYear={2027}
                  />
                  <div className="flex items-center justify-between border-t pt-2 px-2">
                    <div className="text-xs text-muted-foreground">
                      {customRange.from && customRange.to
                        ? `${format(customRange.from, "MMM d, yyyy")} – ${format(customRange.to, "MMM d, yyyy")}`
                        : "Select a date range"
                      }
                    </div>
                    <Button
                      size="sm"
                      onClick={applyCustomRange}
                      disabled={!customRange.from || !customRange.to}
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    );
  }
);

DatePresetPicker.displayName = "DatePresetPicker";
