import { useState, useEffect } from "react";
import { Filter, Calendar, Settings, Check, Search, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, subDays, subMonths, startOfYear, endOfYear, differenceInDays, subYears } from "date-fns";
import { DateRange } from "react-day-picker";
import { supabase } from "@/integrations/supabase/client";
import { DimensionSelectorModal } from "./DimensionSelectorModal";
import { ScrollArea } from "@/components/ui/scroll-area";
import { retryWithBackoff, filterDimensionsByVisibility } from "@/lib/debug";
import { useToast } from "@/components/ui/use-toast";

export interface FilterState {
  dimensionFilters: Record<string, string[]>;
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
  accountId?: string;
  refreshTrigger?: number;
}

interface Dimension {
  id: string;
  name: string;
  type: string;
}

export const FiltersBar = ({ reportId, onFiltersChange, isSharedView = false, accountId, refreshTrigger }: FiltersBarProps) => {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [activeDimensions, setActiveDimensions] = useState<string[]>([]);
  const [dimensionValues, setDimensionValues] = useState<Record<string, string[]>>({});
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({});
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [datePreset, setDatePreset] = useState<string>("this_month");
  const [showDimensionSelector, setShowDimensionSelector] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingFilters, setIsLoadingFilters] = useState(false);
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareType, setCompareType] = useState<string>("previous_period");
  const [compareDateRange, setCompareDateRange] = useState<DateRange | undefined>();
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});
  const [openPopovers, setOpenPopovers] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  useEffect(() => {
    if (reportId) {
      // Reset all filter state when report changes - use last 7 days for performance
      setActiveDimensions([]);
      setSelectedFilters({});
      setDateRange(undefined);
      setDatePreset("this_month");
      setCompareEnabled(false);
      setCompareType("previous_period");
      setCompareDateRange(undefined);
      
      // Then load settings for the new report
      loadDimensions();
      loadFilterSettings();
    }
  }, [reportId]);

  // Refresh dimensions when data is remapped/synced
  useEffect(() => {
    if (reportId && refreshTrigger && refreshTrigger > 0) {
      console.log('[testing] FiltersBar - Refreshing dimensions due to data sync, trigger:', refreshTrigger);
      loadDimensions();
    }
  }, [refreshTrigger, reportId]);

  useEffect(() => {
    if (activeDimensions.length > 0 && reportId) {
      loadDimensionValues();
    }
  }, [activeDimensions, reportId]);

  // Apply default date range on mount - default to this month
  // Only apply if no reportId yet (initial mount)
  useEffect(() => {
    if (!reportId) {
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
    console.log('[testing] FiltersBar - Filter state changed, notifying parent');
    if (onFiltersChange) {
      const newFilters = {
        dimensionFilters: selectedFilters,
        dateRange,
        datePreset,
        compareEnabled,
        compareType,
        compareDateRange: compareEnabled ? compareDateRange : undefined,
      };
      console.log('[testing] FiltersBar - Calling onFiltersChange with:', newFilters);
      onFiltersChange(newFilters);
    }
  }, [onFiltersChange, selectedFilters, dateRange, datePreset, compareEnabled, compareType, compareDateRange]);

  const loadFilterSettings = async () => {
    if (!reportId) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      let userId = user?.id || '';
      
      // If this is a shared view, load the report owner's filters
      if (isSharedView && reportId) {
        const { data: reportData, error: reportError } = await supabase
          .from("reports")
          .select("user_id")
          .eq("id", reportId)
          .single();
        
        if (!reportError && reportData) {
          userId = reportData.user_id;
        }
      }
      
      // Try to load saved filters for this specific report and user (or report owner for shared views)
      const { data, error } = await supabase
        .from("report_views")
        .select("*")
        .eq("report_id", reportId)
        .eq("user_id", userId)
        .eq("is_default", true)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error; // Ignore "no rows" error

      if (data) {
        // Load saved filter settings for this report
        if (data.filter_dimensions && data.filter_dimensions.length > 0) {
          setActiveDimensions(data.filter_dimensions);
        }
        if (data.filter_values && Object.keys(data.filter_values).length > 0) {
          // Convert old single-value filters to array format if needed
          const filterValues = data.filter_values as Record<string, string | string[]>;
          const normalizedFilters: Record<string, string[]> = {};
          Object.entries(filterValues).forEach(([key, value]) => {
            normalizedFilters[key] = Array.isArray(value) ? value : [value];
          });
          setSelectedFilters(normalizedFilters);
        }
        // Always apply date preset if saved, or default to "this_month"
        const preset = data.date_range_preset || "this_month";
        setDatePreset(preset);
        applyDatePreset(preset);
      } else {
        // No saved view for this report, apply defaults
        applyDatePreset("this_month");
      }
    } catch (error) {
      console.error("Error loading filter settings:", error);
      // On error, apply defaults
      applyDatePreset("this_month");
    }
  };

  const saveFilterSettings = async () => {
    if (!reportId) return;
    
    // Don't save if this is a shared view (read-only)
    if (isSharedView) return;
    
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

  // Check if any filters are currently applied (excluding default "this_month")
  const hasActiveFilters = () => {
    // Check if any dimension has selected filter values
    const hasDimensionFilters = Object.keys(selectedFilters).some(
      dimensionId => selectedFilters[dimensionId] && selectedFilters[dimensionId].length > 0
    );
    // Only consider date filter active if it's NOT the default "this_month"
    const hasDateFilter = datePreset !== "this_month";
    const hasCompareFilter = compareEnabled;
    return hasDimensionFilters || hasDateFilter || hasCompareFilter;
  };

  // Count active filters for display
  const getActiveFiltersCount = () => {
    let count = 0;
    
    // Count dimension filters that have actual values selected
    Object.keys(selectedFilters).forEach(dimensionId => {
      if (selectedFilters[dimensionId] && selectedFilters[dimensionId].length > 0) {
        count += 1;
      }
    });
    
    // Only count date filter if it's NOT the default "this_month"
    if (datePreset !== "this_month") {
      count += 1;
    }
    
    // Count compare filter if enabled
    if (compareEnabled) {
      count += 1;
    }
    
    return count;
  };

  const handleResetFilters = () => {
    // Keep the active dimensions but clear their selected values
    // setActiveDimensions([]); // DON'T remove dimensions from filter bar
    setSelectedFilters({}); // Clear all filter values
    // Reset to default "this_month" date filter
    applyDatePreset("this_month");
    setCompareEnabled(false);
    setCompareType("previous_period");
    setCompareDateRange(undefined);
    setSearchTerms({});
    
    toast({
      title: "Filters reset",
      description: "All filters reset to default values. Date filter set to 'This Month'.",
    });
  };

  const loadDimensions = async () => {
    if (!reportId) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      console.log('[testing] FiltersBar - Loading dimensions for user:', user.id, 'report:', reportId, 'account:', accountId);

      // Load global dimensions (available to all users)
      const { data: globalData, error: globalError } = await supabase
        .from("dimensions")
        .select("*")
        .eq("scope", "global")
        .order("created_at", { ascending: false });

      if (globalError) throw globalError;

      // Load account-specific dimensions if accountId is provided
      let accountData: Dimension[] = [];
      if (accountId) {
        const { data, error: accountError } = await supabase
          .from("dimensions")
          .select("*")
          .eq("scope", "account")
          .eq("account_id", accountId)
          .order("created_at", { ascending: false });

        if (accountError) throw accountError;
        accountData = (data || []) as Dimension[];
      }

      // Load custom dimensions for this user (both global custom and report-specific)
      let customData: Dimension[] = [];
      const { data, error: customError } = await supabase
        .from("dimensions")
        .select("*")
        .eq("user_id", user.id)
        .eq("scope", "custom")
        .or(`report_id.is.null,report_id.eq.${reportId}`) // Include both global custom (report_id=null) and report-specific
        .order("created_at", { ascending: false });

      if (customError) throw customError;
      customData = (data || []) as Dimension[];

      // Combine all dimensions
      const allDimensions = [
        ...(globalData || []),
        ...accountData,
        ...customData
      ] as Dimension[];

      console.log('[testing] FiltersBar - Loaded dimensions - Global:', globalData?.length || 0, 'Account:', accountData?.length || 0, 'Custom:', customData?.length || 0);

      // Filter only attribute dimensions (text type) that can be used for filtering
      const filterableDimensions = allDimensions.filter(
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

      // Filter dimensions by visibility settings
      let finalDimensions = uniqueDimensions;
      if (user && reportId) {
        finalDimensions = await filterDimensionsByVisibility(uniqueDimensions, reportId, user.id, supabase);
      }

      console.log('[testing] FiltersBar - Final filterable dimensions:', finalDimensions.length);
      setDimensions(finalDimensions);
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
      const data = await retryWithBackoff(
        async () => {
          const { data, error } = await supabase
            .from("dimension_data")
            .select("dimension_values")
            .eq("report_id", reportId)
            .limit(10000); // Limit for performance

          if (error) throw error;
          return data;
        },
        3,
        500
      );

      const valuesMap: Record<string, Set<string>> = {};

      // Extract unique values for each active dimension
      data?.forEach((row) => {
        const dimensionValues = row.dimension_values as Record<string, string | number | boolean>;
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
    const currentValues = newFilters[dimensionId] || [];
    
    if (currentValues.includes(value)) {
      // Remove value
      const updated = currentValues.filter(v => v !== value);
      if (updated.length === 0) {
        delete newFilters[dimensionId];
      } else {
        newFilters[dimensionId] = updated;
      }
    } else {
      // Add value
      newFilters[dimensionId] = [...currentValues, value];
    }
    
    setSelectedFilters(newFilters);
  };

  const handleSelectAll = (dimensionId: string) => {
    const values = dimensionValues[dimensionId] || [];
    const newFilters = { ...selectedFilters };
    newFilters[dimensionId] = [...values];
    setSelectedFilters(newFilters);
  };

  const handleDeselectAll = (dimensionId: string) => {
    const newFilters = { ...selectedFilters };
    delete newFilters[dimensionId];
    setSelectedFilters(newFilters);
  };

  const getFilteredValues = (dimensionId: string) => {
    const values = dimensionValues[dimensionId] || [];
    const searchTerm = searchTerms[dimensionId] || "";
    if (!searchTerm) return values;
    return values.filter(value => 
      value.toLowerCase().includes(searchTerm.toLowerCase())
    );
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
                const filteredValues = getFilteredValues(dimId);
                const selectedValues = selectedFilters[dimId] || [];
                const selectedCount = selectedValues.length;

                return (
                  <div key={dimId} className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground">
                      {dimension.name}
                    </label>
                    <Popover 
                      open={openPopovers[dimId]} 
                      onOpenChange={(open) => {
                        setOpenPopovers({ ...openPopovers, [dimId]: open });
                        if (!open) {
                          setSearchTerms({ ...searchTerms, [dimId]: "" });
                        }
                      }}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          disabled={isLoadingFilters}
                          className="w-[200px] justify-between bg-background"
                        >
                          {isLoadingFilters ? (
                            <span className="text-muted-foreground">Loading...</span>
                          ) : selectedCount === 0 ? (
                            <span>All {dimension.name}</span>
                          ) : (
                            <span>
                              {selectedCount === 1 
                                ? selectedValues[0]
                                : `${selectedCount} selected`}
                            </span>
                          )}
                          <Settings className="ml-2 h-4 w-4 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[250px] p-0 bg-background z-50" align="start">
                        <div className="flex flex-col">
                          {/* Search input */}
                          <div className="p-2 border-b">
                            <div className="relative">
                              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                              <Input
                                placeholder={`Search ${dimension.name.toLowerCase()}...`}
                                value={searchTerms[dimId] || ""}
                                onChange={(e) => setSearchTerms({ ...searchTerms, [dimId]: e.target.value })}
                                className="pl-8"
                              />
                            </div>
                          </div>
                          
                          {/* Select All / Deselect All */}
                          <div className="flex gap-1 p-2 border-b">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="flex-1 h-8 text-xs"
                              onClick={() => handleSelectAll(dimId)}
                            >
                              Select All
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="flex-1 h-8 text-xs"
                              onClick={() => handleDeselectAll(dimId)}
                            >
                              Deselect All
                            </Button>
                          </div>
                          
                          {/* Values list */}
                          <ScrollArea className="h-[300px]">
                            <div className="p-2">
                              {filteredValues.length === 0 ? (
                                <div className="text-sm text-muted-foreground text-center py-4">
                                  No results found
                                </div>
                              ) : (
                                filteredValues.map((value) => {
                                  const isSelected = selectedValues.includes(value);
                                  return (
                                    <div
                                      key={value}
                                      className="flex items-center space-x-2 rounded-sm px-2 py-1.5 hover:bg-accent cursor-pointer"
                                      onClick={() => handleFilterChange(dimId, value)}
                                    >
                                      <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={() => handleFilterChange(dimId, value)}
                                        onClick={(e) => e.stopPropagation()}
                                      />
                                      <label className="text-sm flex-1 cursor-pointer">
                                        {value}
                                      </label>
                                      {isSelected && (
                                        <Check className="h-4 w-4 text-primary" />
                                      )}
                                    </div>
                                  );
                                })
                              )}
                            </div>
                          </ScrollArea>
                        </div>
                      </PopoverContent>
                    </Popover>
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
                    <div className="p-2 border-b">
                      <div className="grid grid-cols-3 gap-1">
                        <Button
                          variant={datePreset === "today" ? "default" : "outline"}
                          size="sm"
                          onClick={() => applyDatePreset("today")}
                          className="text-xs h-7 px-2"
                        >
                          Today
                        </Button>
                        <Button
                          variant={datePreset === "yesterday" ? "default" : "outline"}
                          size="sm"
                          onClick={() => applyDatePreset("yesterday")}
                          className="text-xs h-7 px-2"
                        >
                          Yesterday
                        </Button>
                        <Button
                          variant={datePreset === "this_week" ? "default" : "outline"}
                          size="sm"
                          onClick={() => applyDatePreset("this_week")}
                          className="text-xs h-7 px-2"
                        >
                          This Week
                        </Button>
                        <Button
                          variant={datePreset === "last_7_days" ? "default" : "outline"}
                          size="sm"
                          onClick={() => applyDatePreset("last_7_days")}
                          className="text-xs h-7 px-2 font-medium"
                        >
                          Last 7 Days
                        </Button>
                        <Button
                          variant={datePreset === "last_30_days" ? "default" : "outline"}
                          size="sm"
                          onClick={() => applyDatePreset("last_30_days")}
                          className="text-xs h-7 px-2"
                        >
                          Last 30 Days
                        </Button>
                        <Button
                          variant={datePreset === "this_month" ? "default" : "outline"}
                          size="sm"
                          onClick={() => applyDatePreset("this_month")}
                          className="text-xs h-7 px-2"
                        >
                          This Month
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-1 mt-1">
                        <Button
                          variant={datePreset === "last_month" ? "default" : "outline"}
                          size="sm"
                          onClick={() => applyDatePreset("last_month")}
                          className="text-xs h-7 px-2"
                        >
                          Last Month
                        </Button>
                        <Button
                          variant={datePreset === "this_year" ? "default" : "outline"}
                          size="sm"
                          onClick={() => applyDatePreset("this_year")}
                          className="text-xs h-7 px-2"
                        >
                          This Year
                        </Button>
                      </div>
                      <Button
                        variant={datePreset === "all_time" ? "default" : "outline"}
                        size="sm"
                        onClick={() => applyDatePreset("all_time")}
                        className="text-xs h-7 w-full mt-1"
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

            <div className="flex items-center gap-2 ml-auto">
              {hasActiveFilters() && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetFilters}
                  className="gap-2 text-muted-foreground hover:text-foreground"
                  title={`Reset ${getActiveFiltersCount()} active filter${getActiveFiltersCount() > 1 ? 's' : ''}`}
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset Filters ({getActiveFiltersCount()})
                </Button>
              )}

              {activeDimensions.length > 0 && !isSharedView && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowDimensionSelector(true)}
                  title="Edit filter dimensions"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <DimensionSelectorModal
        open={showDimensionSelector}
        onOpenChange={setShowDimensionSelector}
        title="Configure Filter Dimensions"
        selectedDimensions={activeDimensions}
        onDimensionsChange={handleDimensionsChange}
        reportId={reportId}
      />
    </>
  );
};
