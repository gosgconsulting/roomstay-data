import { useState, useEffect } from "react";
import { Filter, Calendar, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subDays, subMonths, startOfYear, endOfYear, differenceInDays, subYears } from "date-fns";
import { DateRange } from "react-day-picker";
import { supabase } from "@/integrations/supabase/client";
import { DimensionSelectorModal } from "./DimensionSelectorModal";

export interface FilterState {
  dimensionFilters: Record<string, string>;
  dateRange: DateRange | undefined;
  datePreset: string;
  compareEnabled: boolean;
  compareType: string;
  compareDateRange?: DateRange;
}

interface FiltersBarProps {
  reportId: string | null;
  onFiltersChange?: (filters: FilterState) => void;
  isSharedView?: boolean;
}

interface Dimension {
  id: string;
  name: string;
  type: string;
}

export const FiltersBar = ({ reportId, onFiltersChange, isSharedView = false }: FiltersBarProps) => {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [activeDimensions, setActiveDimensions] = useState<string[]>([]);
  const [dimensionValues, setDimensionValues] = useState<Record<string, string[]>>({});
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string>>({});
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [datePreset, setDatePreset] = useState<string>("this_month");
  const [showDimensionSelector, setShowDimensionSelector] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingFilters, setIsLoadingFilters] = useState(false);
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareType, setCompareType] = useState<string>("previous_period");
  const [compareDateRange, setCompareDateRange] = useState<DateRange | undefined>();

  useEffect(() => {
    if (reportId) {
      loadDimensions();
      loadFilterSettings();
    }
  }, [reportId]);

  useEffect(() => {
    if (activeDimensions.length > 0 && reportId) {
      loadDimensionValues();
    }
  }, [activeDimensions, reportId]);

  // Apply default date range on mount
  useEffect(() => {
    if (!dateRange) {
      applyDatePreset("this_month");
    }
  }, []);

  // Save filter settings whenever they change
  useEffect(() => {
    if (reportId && !isLoading) {
      saveFilterSettings();
    }
  }, [activeDimensions, selectedFilters, dateRange, datePreset, reportId]);

  // Update comparison date range when date range or compare type changes
  useEffect(() => {
    if (compareEnabled && dateRange?.from && dateRange?.to) {
      calculateCompareDateRange();
    }
  }, [compareEnabled, compareType, dateRange]);

  // Notify parent of filter changes
  useEffect(() => {
    if (onFiltersChange) {
      onFiltersChange({
        dimensionFilters: selectedFilters,
        dateRange,
        datePreset,
        compareEnabled,
        compareType,
        compareDateRange: compareEnabled ? compareDateRange : undefined,
      });
    }
  }, [selectedFilters, dateRange, datePreset, compareEnabled, compareType, compareDateRange]);

  const loadFilterSettings = async () => {
    if (!reportId) return;
    
    try {
      // Try to load saved filters (public access - first available)
      const { data, error } = await supabase
        .from("report_views")
        .select("*")
        .eq("report_id", reportId)
        .eq("is_default", true)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        // Load saved filter settings
        if (data.filter_dimensions) {
          setActiveDimensions(data.filter_dimensions);
        }
        if (data.filter_values) {
          setSelectedFilters(data.filter_values as Record<string, string>);
        }
        if (data.date_range_preset) {
          setDatePreset(data.date_range_preset);
          applyDatePreset(data.date_range_preset);
        } else if (data.date_range_start && data.date_range_end) {
          setDateRange({
            from: new Date(data.date_range_start),
            to: new Date(data.date_range_end),
          });
        }
      }
    } catch (error) {
      console.error("Error loading filter settings:", error);
    }
  };

  const saveFilterSettings = async () => {
    if (!reportId) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      // Only save if user is logged in
      if (!user) return;

      // Check if a default view already exists
      const { data: existingView } = await supabase
        .from("report_views")
        .select("id")
        .eq("report_id", reportId)
        .eq("user_id", user.id)
        .eq("is_default", true)
        .maybeSingle();

      const viewData = {
        filter_dimensions: activeDimensions,
        filter_values: selectedFilters,
        date_range_start: dateRange?.from?.toISOString().split('T')[0] || null,
        date_range_end: dateRange?.to?.toISOString().split('T')[0] || null,
        date_range_preset: datePreset,
      };

      if (existingView) {
        // Update existing view
        const { error } = await supabase
          .from("report_views")
          .update(viewData)
          .eq("id", existingView.id);

        if (error) throw error;
      }
    } catch (error) {
      console.error("Error saving filter settings:", error);
    }
  };

  const calculateCompareDateRange = () => {
    if (!dateRange?.from || !dateRange?.to) return;

    const from = dateRange.from;
    const to = dateRange.to;
    const daysDiff = differenceInDays(to, from);

    let compareFrom: Date;
    let compareTo: Date;

    switch (compareType) {
      case "previous_period":
        compareTo = subDays(from, 1);
        compareFrom = subDays(compareTo, daysDiff);
        break;
      case "previous_year":
        compareFrom = subYears(from, 1);
        compareTo = subYears(to, 1);
        break;
      case "custom":
        // For custom, we'll let users select manually
        return;
      default:
        compareTo = subDays(from, 1);
        compareFrom = subDays(compareTo, daysDiff);
    }

    setCompareDateRange({ from: compareFrom, to: compareTo });
  };

  const applyDatePreset = (preset: string) => {
    const now = new Date();
    let from: Date;
    let to: Date = now;

    switch (preset) {
      case "today":
        from = now;
        break;
      case "yesterday":
        from = subDays(now, 1);
        to = subDays(now, 1);
        break;
      case "this_week":
        from = startOfWeek(now);
        break;
      case "last_7_days":
        from = subDays(now, 7);
        break;
      case "this_month":
        from = startOfMonth(now);
        to = endOfMonth(now);
        break;
      case "last_30_days":
        from = subDays(now, 30);
        break;
      case "last_month":
        from = startOfMonth(subMonths(now, 1));
        to = endOfMonth(subMonths(now, 1));
        break;
      case "this_year":
        from = startOfYear(now);
        to = endOfYear(now);
        break;
      case "all_time":
        setDateRange(undefined);
        setDatePreset(preset);
        return;
      default:
        from = startOfMonth(now);
        to = endOfMonth(now);
    }

    setDateRange({ from, to });
    setDatePreset(preset);
  };

  const loadDimensions = async () => {
    if (!reportId) return;
    
    try {
      // Load dimensions associated with this report (works for both owned and shared reports)
      const { data: dimensionData, error: dimDataError } = await supabase
        .from("dimension_data")
        .select("dimension_values")
        .eq("report_id", reportId)
        .limit(1)
        .maybeSingle();

      if (dimDataError) throw dimDataError;

      let data = null;

      if (dimensionData?.dimension_values) {
        const dimensionIds = Object.keys(dimensionData.dimension_values as Record<string, any>);
        
        if (dimensionIds.length > 0) {
          const { data: dimensionsById, error: dimError } = await supabase
            .from("dimensions")
            .select("*")
            .in("id", dimensionIds);

          if (dimError) throw dimError;
          data = dimensionsById;
        }
      }

      // Filter only attribute dimensions (text type) that can be used for filtering
      const filterableDimensions = (data || []).filter(
        (d) => d.type === "text" || d.type === "date"
      );
      
      // Deduplicate dimensions by name (keep first occurrence)
      const seenNames = new Set<string>();
      const uniqueDimensions = filterableDimensions.filter(dim => {
        if (seenNames.has(dim.name)) {
          return false;
        }
        seenNames.add(dim.name);
        return true;
      });
      
      setDimensions(uniqueDimensions);
    } catch (error) {
      console.error("Error loading dimensions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDimensionValues = async () => {
    if (!reportId || activeDimensions.length === 0) return;

    setIsLoadingFilters(true);
    try {
      // Load distinct values for each dimension using a more efficient query
      // Limit to 10,000 rows for faster processing
      const { data, error } = await supabase
        .from("dimension_data")
        .select("dimension_values")
        .eq("report_id", reportId)
        .limit(10000); // Limit for performance

      if (error) throw error;

      const valuesMap: Record<string, Set<string>> = {};

      // Extract unique values for each active dimension
      data?.forEach((row) => {
        const dimensionValues = row.dimension_values as Record<string, any>;
        activeDimensions.forEach((dimId) => {
          const value = dimensionValues[dimId];
          if (value) {
            if (!valuesMap[dimId]) {
              valuesMap[dimId] = new Set();
            }
            valuesMap[dimId].add(String(value));
          }
        });
      });

      // Convert sets to arrays and sort
      const valuesArray: Record<string, string[]> = {};
      Object.keys(valuesMap).forEach((dimId) => {
        valuesArray[dimId] = Array.from(valuesMap[dimId]).sort();
      });

      setDimensionValues(valuesArray);
    } catch (error) {
      console.error("Error loading dimension values:", error);
    } finally {
      setIsLoadingFilters(false);
    }
  };

  const handleFilterChange = (dimensionId: string, value: string) => {
    const newFilters = { ...selectedFilters };
    if (value === "all") {
      delete newFilters[dimensionId];
    } else {
      newFilters[dimensionId] = value;
    }
    setSelectedFilters(newFilters);
  };

  const handleDimensionsChange = (dimensionIds: string[]) => {
    setActiveDimensions(dimensionIds);
    // Clear filters for removed dimensions
    const newFilters = { ...selectedFilters };
    Object.keys(newFilters).forEach((key) => {
      if (!dimensionIds.includes(key)) {
        delete newFilters[key];
      }
    });
    setSelectedFilters(newFilters);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setShowDimensionSelector(true);
  };

  return (
    <>
      <div className="border-b bg-card">
        <div className="container mx-auto px-6 py-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Filter className="h-4 w-4" />
              <span>Filters</span>
            </div>

            <div className="flex items-center gap-3 flex-1">
              {activeDimensions.map((dimId) => {
                const dimension = dimensions.find((d) => d.id === dimId);
                if (!dimension) return null;

                const values = dimensionValues[dimId] || [];

                return (
                  <div key={dimId} className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground">
                      {dimension.name}
                    </label>
                    <Select
                      disabled={isLoadingFilters}
                      value={selectedFilters[dimId] || "all"}
                      onValueChange={(value) => handleFilterChange(dimId, value)}
                    >
                      <SelectTrigger className="w-[200px] bg-background">
                        {isLoadingFilters ? (
                          <span className="text-muted-foreground">Loading...</span>
                        ) : (
                          <SelectValue placeholder={`Search or select ${dimension.name.toLowerCase()}...`} />
                        )}
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        <SelectItem value="all">All {dimension.name}</SelectItem>
                        {values.map((value) => (
                          <SelectItem key={value} value={value}>
                            {value}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}

              {/* Date Range Filter */}
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
                      {datePreset === "all_time" ? (
                        "All Time"
                      ) : dateRange?.from ? (
                        dateRange.to ? (
                          <>
                            {format(dateRange.from, "MMM d")} -{" "}
                            {format(dateRange.to, "MMM d, yyyy")}
                          </>
                        ) : (
                          format(dateRange.from, "MMM d, yyyy")
                        )
                      ) : (
                        <span>This Month</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-background z-50" align="start">
                    <div className="p-3 border-b space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant={datePreset === "today" ? "default" : "outline"}
                          size="sm"
                          onClick={() => applyDatePreset("today")}
                          className="text-xs"
                        >
                          Today
                        </Button>
                        <Button
                          variant={datePreset === "yesterday" ? "default" : "outline"}
                          size="sm"
                          onClick={() => applyDatePreset("yesterday")}
                          className="text-xs"
                        >
                          Yesterday
                        </Button>
                        <Button
                          variant={datePreset === "this_week" ? "default" : "outline"}
                          size="sm"
                          onClick={() => applyDatePreset("this_week")}
                          className="text-xs"
                        >
                          This Week
                        </Button>
                        <Button
                          variant={datePreset === "last_7_days" ? "default" : "outline"}
                          size="sm"
                          onClick={() => applyDatePreset("last_7_days")}
                          className="text-xs"
                        >
                          Last 7 Days
                        </Button>
                        <Button
                          variant={datePreset === "this_month" ? "default" : "outline"}
                          size="sm"
                          onClick={() => applyDatePreset("this_month")}
                          className="text-xs"
                        >
                          This Month
                        </Button>
                        <Button
                          variant={datePreset === "last_30_days" ? "default" : "outline"}
                          size="sm"
                          onClick={() => applyDatePreset("last_30_days")}
                          className="text-xs"
                        >
                          Last 30 Days
                        </Button>
                        <Button
                          variant={datePreset === "last_month" ? "default" : "outline"}
                          size="sm"
                          onClick={() => applyDatePreset("last_month")}
                          className="text-xs"
                        >
                          Last Month
                        </Button>
                        <Button
                          variant={datePreset === "this_year" ? "default" : "outline"}
                          size="sm"
                          onClick={() => applyDatePreset("this_year")}
                          className="text-xs"
                        >
                          This Year
                        </Button>
                      </div>
                      <Button
                        variant={datePreset === "all_time" ? "default" : "outline"}
                        size="sm"
                        onClick={() => applyDatePreset("all_time")}
                        className="text-xs w-full"
                      >
                        All Time
                      </Button>
                    </div>
                    
                    {compareEnabled && (
                      <div className="p-3 border-b space-y-2">
                        <Label className="text-xs font-medium">Compare to:</Label>
                        <div className="space-y-1">
                          <div 
                            className={cn(
                              "flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-accent",
                              compareType === "previous_period" && "bg-accent"
                            )}
                            onClick={() => setCompareType("previous_period")}
                          >
                            <div className={cn(
                              "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                              compareType === "previous_period" ? "border-primary" : "border-muted-foreground"
                            )}>
                              {compareType === "previous_period" && (
                                <div className="w-2 h-2 rounded-full bg-primary" />
                              )}
                            </div>
                            <span className="text-sm">Previous period</span>
                          </div>
                          <div 
                            className={cn(
                              "flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-accent",
                              compareType === "previous_year" && "bg-accent"
                            )}
                            onClick={() => setCompareType("previous_year")}
                          >
                            <div className={cn(
                              "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                              compareType === "previous_year" ? "border-primary" : "border-muted-foreground"
                            )}>
                              {compareType === "previous_year" && (
                                <div className="w-2 h-2 rounded-full bg-primary" />
                              )}
                            </div>
                            <span className="text-sm">Previous year</span>
                          </div>
                          <div 
                            className={cn(
                              "flex items-center gap-2 p-2 rounded cursor-pointer hover:bg-accent",
                              compareType === "custom" && "bg-accent"
                            )}
                            onClick={() => setCompareType("custom")}
                          >
                            <div className={cn(
                              "w-4 h-4 rounded-full border-2 flex items-center justify-center",
                              compareType === "custom" ? "border-primary" : "border-muted-foreground"
                            )}>
                              {compareType === "custom" && (
                                <div className="w-2 h-2 rounded-full bg-primary" />
                              )}
                            </div>
                            <span className="text-sm">Custom</span>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <CalendarComponent
                      mode="range"
                      selected={dateRange}
                      onSelect={(range) => {
                        setDateRange(range);
                        setDatePreset("custom");
                      }}
                      numberOfMonths={2}
                      className={cn("p-3 pointer-events-auto")}
                    />
                    
                    <div className="p-3 border-t flex items-center justify-end gap-2">
                      <Label htmlFor="compare-toggle" className="text-sm cursor-pointer">
                        Compare:
                      </Label>
                      <Switch
                        id="compare-toggle"
                        checked={compareEnabled}
                        onCheckedChange={setCompareEnabled}
                      />
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              {activeDimensions.length === 0 && !isSharedView && (
                <Button
                  variant="outline"
                  className="gap-2"
                  onContextMenu={handleContextMenu}
                  onClick={handleContextMenu}
                >
                  Right-click to configure filters
                </Button>
              )}
            </div>

            {activeDimensions.length > 0 && !isSharedView && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowDimensionSelector(true)}
                className="ml-auto"
                title="Edit filter dimensions"
              >
                <Settings className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      <DimensionSelectorModal
        open={showDimensionSelector}
        onOpenChange={setShowDimensionSelector}
        title="Configure Filter Dimensions"
        selectedDimensions={activeDimensions}
        onDimensionsChange={handleDimensionsChange}
      />
    </>
  );
};
