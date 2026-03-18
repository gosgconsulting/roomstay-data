import React from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Calendar } from "lucide-react";
import { format } from "date-fns";
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
    // Show the active preset label if no explicit range
    const active = presets.find((p) => p.id === datePreset);
    return active?.label ?? "This Month";
  };

  // Keep calendar anchored to the start of the selected range
  const displayMonth = dateRange?.from
    ? new Date(dateRange.from.getFullYear(), dateRange.from.getMonth(), 1)
    : new Date();
  const displayMonthKey = `${displayMonth.getFullYear()}-${displayMonth.getMonth()}`;

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Date Range:
      </label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-[210px] justify-start text-left font-normal bg-background border-input gap-2",
              !dateRange?.from && datePreset !== "all_time" && "text-muted-foreground"
            )}
          >
            <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate flex-1">{renderButtonLabel()}</span>
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
                      datePreset === p.id
                        ? "font-semibold text-foreground bg-accent"
                        : "font-normal text-muted-foreground hover:text-foreground hover:bg-accent/60"
                    )}
                    onClick={() => onDatePresetChange(p.id)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Right: calendar — 2 months for easy cross-month range selection */}
            <div className="p-4">
              <CalendarComponent
                mode="range"
                selected={dateRange}
                onSelect={(range) => onDateRangeChange(range)}
                numberOfMonths={2}
                defaultMonth={displayMonth}
                key={displayMonthKey}
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

          {showCompare && (
            <div className="px-3 py-2 border-t flex items-center justify-between gap-2">
              <Label htmlFor="compare-toggle" className="text-sm cursor-pointer text-muted-foreground">
                Compare periods
              </Label>
              <Switch
                id="compare-toggle"
                checked={compareEnabled}
                onCheckedChange={onCompareEnabledChange}
              />
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default DateRangeFilter;
