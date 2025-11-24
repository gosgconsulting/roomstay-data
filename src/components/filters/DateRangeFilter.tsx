import React from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { Calendar } from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";

interface DateRangeFilterProps {
  dateRange: DateRange | undefined;
  datePreset: string;
  compareEnabled: boolean;
  compareType: string;
  onDatePresetChange: (preset: string) => void;
  onDateRangeChange: (range: DateRange | undefined) => void;
  onCompareEnabledChange: (enabled: boolean) => void;
  onCompareTypeChange: (type: string) => void;
}

const DateRangeFilter: React.FC<DateRangeFilterProps> = ({
  dateRange,
  datePreset,
  compareEnabled,
  compareType,
  onDatePresetChange,
  onDateRangeChange,
  onCompareEnabledChange,
  onCompareTypeChange,
}) => {
  const renderButtonLabel = () => {
    if (datePreset === "all_time") return "All Time";
    if (dateRange?.from) {
      if (dateRange.to) {
        const toDate = new Date(dateRange.to);
        const friendlyTo =
          toDate.getUTCHours() === 23 && toDate.getUTCMinutes() === 59
            ? format(new Date(toDate.getUTCFullYear(), toDate.getUTCMonth(), toDate.getUTCDate()), "MMM d, yyyy")
            : format(toDate, "MMM d, yyyy");
        return `${format(dateRange.from, "MMM d")} - ${friendlyTo}`;
      }
      return format(dateRange.from, "MMM d, yyyy");
    }
    return "This Month";
  };

  // Ensure the calendar displays the earlier month on the left when showing two months.
  const displayMonth = dateRange?.from
    ? new Date(dateRange.from.getFullYear(), dateRange.from.getMonth(), 1)
    : new Date();
  const displayMonthKey = `${displayMonth.getFullYear()}-${displayMonth.getMonth()}`;

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">Date Range</label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-[200px] justify-start text-left font-normal bg-background",
              !dateRange?.from && datePreset !== "all_time" && "text-muted-foreground"
            )}
          >
            <Calendar className="mr-2 h-4 w-4" />
            {renderButtonLabel()}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 bg-background z-50" align="start">
          <div className="p-2 border-b">
            <div className="grid grid-cols-3 gap-1">
              {[
                { id: "today", label: "Today" },
                { id: "yesterday", label: "Yesterday" },
                { id: "this_week", label: "This Week" },
                { id: "last_7_days", label: "Last 7 Days" },
                { id: "last_30_days", label: "Last 30 Days" },
                { id: "this_month", label: "This Month" },
              ].map(p => (
                <Button
                  key={p.id}
                  variant={datePreset === p.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => onDatePresetChange(p.id)}
                  className="text-xs h-7 px-2"
                >
                  {p.label}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-1 mt-1">
              <Button
                variant={datePreset === "last_month" ? "default" : "outline"}
                size="sm"
                onClick={() => onDatePresetChange("last_month")}
                className="text-xs h-7 px-2"
              >
                Last Month
              </Button>
              <Button
                variant={datePreset === "this_year" ? "default" : "outline"}
                size="sm"
                onClick={() => onDatePresetChange("this_year")}
                className="text-xs h-7 px-2"
              >
                This Year
              </Button>
            </div>
            <Button
              variant={datePreset === "all_time" ? "default" : "outline"}
              size="sm"
              onClick={() => onDatePresetChange("all_time")}
              className="text-xs h-7 w-full mt-1"
            >
              All Time
            </Button>
          </div>

          {compareEnabled && (
            <div className="p-3 border-b space-y-2">
              <Label className="text-xs font-medium">Compare to:</Label>
              <div className="space-y-1">
                {[
                  { id: "previous_period", label: "Previous period" },
                  { id: "previous_year", label: "Previous year" },
                  { id: "custom", label: "Custom" },
                ].map(opt => (
                  <div
                    key={opt.id}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-accent",
                      compareType === opt.id && "bg-accent"
                    )}
                    onClick={() => onCompareTypeChange(opt.id)}
                  >
                    <div
                      className={cn(
                        "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                        compareType === opt.id ? "border-primary" : "border-muted-foreground"
                      )}
                    >
                      {compareType === opt.id && <div className="w-2 h-2 rounded-full bg-primary" />}
                    </div>
                    <span className="text-sm">{opt.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <CalendarComponent
            mode="range"
            selected={dateRange}
            onSelect={(range) => {
              onDateRangeChange(range);
            }}
            numberOfMonths={2}
            defaultMonth={displayMonth}
            key={displayMonthKey}
            className={cn("p-3 pointer-events-auto")}
          />

          <div className="p-3 border-t flex items-center justify-end gap-2">
            <Label htmlFor="compare-toggle" className="text-sm cursor-pointer">
              Compare:
            </Label>
            <Switch
              id="compare-toggle"
              checked={compareEnabled}
              onCheckedChange={onCompareEnabledChange}
            />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default DateRangeFilter;