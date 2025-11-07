import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { Check, ChevronDown, X, Filter, CalendarIcon, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, startOfWeek, subDays, startOfYear, endOfYear, differenceInDays, subYears } from "date-fns";
import { DateRange } from "react-day-picker";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Dimension {
  id: string;
  name: string;
  type: string;
  scope: string;
}

interface Report {
  id: string;
  name: string;
}

interface MasterFilterProps {
  accountId?: string;
  reports: Report[];
  onFilterChange: (
    dimension: string | null, 
    values: string[], 
    dateRange?: DateRange,
    reportIds?: string[],
    compareEnabled?: boolean,
    compareType?: string,
    compareDateRange?: DateRange
  ) => void;
  selectedDimension: string | null;
  selectedValues: string[];
  selectedDateRange?: DateRange;
  selectedReportIds?: string[];
}

export const MasterFilter = ({ 
  accountId,
  reports,
  onFilterChange, 
  selectedDimension, 
  selectedValues,
  selectedDateRange,
  selectedReportIds 
}: MasterFilterProps) => {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [dimensionValues, setDimensionValues] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [showDimensionSelector, setShowDimensionSelector] = useState(false);
  const [showValueSelector, setShowValueSelector] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showReportSelector, setShowReportSelector] = useState(false);
  
  const [localDateRange, setLocalDateRange] = useState<DateRange | undefined>(selectedDateRange);
  const [localReportIds, setLocalReportIds] = useState<string[]>(selectedReportIds || reports.map(r => r.id));
  const [datePreset, setDatePreset] = useState<string>("this_month");
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareType, setCompareType] = useState<string>("previous_period");
  const [compareDateRange, setCompareDateRange] = useState<DateRange | undefined>();
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});
  const [reportSearchTerm, setReportSearchTerm] = useState("");

  // Load settings and dimensions
  useEffect(() => {
    loadDimensions();
  }, [accountId]);

  useEffect(() => {
    if (selectedDimension) {
      loadDimensionValues(selectedDimension);
    }
  }, [selectedDimension]);

  // Load saved settings after reports are available
  useEffect(() => {
    if (reports.length > 0 && accountId) {
      loadSavedSettings();
    }
  }, [reports, accountId]);

  useEffect(() => {
    if (compareEnabled && localDateRange?.from && localDateRange?.to) {
      calculateCompareDateRange();
    }
  }, [compareEnabled, compareType, localDateRange]);

  // Auto-save settings when they change (debounced)
  useEffect(() => {
    if (!accountId) return;
    
    const timeoutId = setTimeout(() => {
      saveSettings();
    }, 1000); // Debounce for 1 second
    
    return () => clearTimeout(timeoutId);
  }, [
    selectedDimension,
    selectedValues,
    localDateRange,
    localReportIds,
    datePreset,
    compareEnabled,
    compareType,
    compareDateRange,
    accountId
  ]);

  const loadSavedSettings = async () => {
    if (!accountId) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('master_filter_settings')
        .select('*')
        .eq('user_id', user.id)
        .eq('account_id', accountId)
        .maybeSingle();

      if (error) {
        console.error('[MASTER-FILTER] Error loading settings:', error);
        return;
      }

      if (data) {
        console.log('[MASTER-FILTER] Loaded saved settings:', data);
        
        // Restore date range
        if (data.date_range_from && data.date_range_to) {
          setLocalDateRange({
            from: new Date(data.date_range_from),
            to: new Date(data.date_range_to)
          });
        }
        
        // Restore preset
        if (data.date_preset) {
          setDatePreset(data.date_preset);
        }
        
        // Restore report selection
        if (data.selected_report_ids && data.selected_report_ids.length > 0) {
          setLocalReportIds(data.selected_report_ids);
        }
        
        // Restore comparison
        setCompareEnabled(data.compare_enabled || false);
        setCompareType(data.compare_type || 'previous_period');
        if (data.compare_date_from && data.compare_date_to) {
          setCompareDateRange({
            from: new Date(data.compare_date_from),
            to: new Date(data.compare_date_to)
          });
        }
        
        // Trigger filter change with restored settings
        handleFilterUpdate(
          data.selected_dimension_id || null,
          data.selected_dimension_values || [],
          data.date_range_from && data.date_range_to ? {
            from: new Date(data.date_range_from),
            to: new Date(data.date_range_to)
          } : undefined,
          data.selected_report_ids && data.selected_report_ids.length > 0 
            ? data.selected_report_ids 
            : reports.map(r => r.id)
        );
      }
    } catch (error) {
      console.error('[MASTER-FILTER] Error in loadSavedSettings:', error);
    }
  };

  const saveSettings = async () => {
    if (!accountId) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const settings = {
        user_id: user.id,
        account_id: accountId,
        selected_dimension_id: selectedDimension,
        selected_dimension_values: selectedValues,
        selected_report_ids: localReportIds,
        date_range_from: localDateRange?.from?.toISOString().split('T')[0] || null,
        date_range_to: localDateRange?.to?.toISOString().split('T')[0] || null,
        date_preset: datePreset,
        compare_enabled: compareEnabled,
        compare_type: compareType,
        compare_date_from: compareDateRange?.from?.toISOString().split('T')[0] || null,
        compare_date_to: compareDateRange?.to?.toISOString().split('T')[0] || null
      };

      const { error } = await supabase
        .from('master_filter_settings')
        .upsert(settings, {
          onConflict: 'user_id,account_id'
        });

      if (error) {
        console.error('[MASTER-FILTER] Error saving settings:', error);
      } else {
        console.log('[MASTER-FILTER] Settings saved successfully');
      }
    } catch (error) {
      console.error('[MASTER-FILTER] Error in saveSettings:', error);
    }
  };

  const loadDimensions = async () => {
    try {
      setIsLoading(true);
      console.log('[MASTER-FILTER] Loading dimensions for account:', accountId);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from('dimensions')
        .select('id, name, type, scope')
        .eq('type', 'text')
        .in('scope', ['global', 'account']);

      if (accountId) {
        query = query.or(`account_id.eq.${accountId},scope.eq.global`);
      } else {
        query = query.eq('scope', 'global');
      }

      const { data, error } = await query.order('name');

      if (error) {
        console.error('[MASTER-FILTER] Error loading dimensions:', error);
        return;
      }

      const dimensionMap = new Map<string, Dimension>();
      (data || []).forEach(dim => {
        if (!dim || typeof dim !== 'object' || !dim.id || !dim.name || !dim.type || !dim.scope) {
          return;
        }
        const existing = dimensionMap.get(dim.name);
        if (!existing || (dim.scope === 'account' && existing.scope === 'global')) {
          dimensionMap.set(dim.name, dim);
        }
      });

      const uniqueDimensions = Array.from(dimensionMap.values()).sort((a, b) => a.name.localeCompare(b.name));
      console.log('[MASTER-FILTER] Loaded unique dimensions:', uniqueDimensions.length);
      setDimensions(uniqueDimensions);
    } catch (error) {
      console.error('[MASTER-FILTER] Error in loadDimensions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDimensionValues = async (dimensionId: string) => {
    try {
      console.log('[MASTER-FILTER] Loading values for dimension:', dimensionId);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from('dimension_data')
        .select('dimension_values')
        .not('dimension_values', 'is', null);

      if (accountId) {
        const { data: reports } = await supabase
          .from('reports')
          .select('id')
          .eq('account_id', accountId);
        
        if (reports && reports.length > 0) {
          const reportIds = reports.map(r => r.id);
          query = query.in('report_id', reportIds);
        }
      }

      const { data, error } = await query.limit(10000);

      if (error) {
        console.error('[MASTER-FILTER] Error loading dimension values:', error);
        return;
      }

      const uniqueValues = new Set<string>();
      data?.forEach(row => {
        const value = row.dimension_values[dimensionId];
        if (value && typeof value === 'string') {
          uniqueValues.add(value);
        }
      });

      const sortedValues = Array.from(uniqueValues).sort();
      console.log('[MASTER-FILTER] Loaded values:', sortedValues.length);
      
      setDimensionValues(prev => ({
        ...prev,
        [dimensionId]: sortedValues
      }));
    } catch (error) {
      console.error('[MASTER-FILTER] Error in loadDimensionValues:', error);
    }
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
      case "this_month": {
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        
        const fromDateString = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
        const toDateString = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;
        
        from = new Date(fromDateString);
        to = new Date(toDateString);
        break;
      }
      case "last_30_days":
        from = subDays(now, 30);
        break;
      case "last_month": {
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        
        let lastMonthYear = currentYear;
        let lastMonth = currentMonth - 1;
        if (lastMonth < 0) {
          lastMonth = 11;
          lastMonthYear = currentYear - 1;
        }
        
        const lastDayOfMonth = new Date(lastMonthYear, lastMonth + 1, 0).getDate();
        const fromDateString = `${lastMonthYear}-${String(lastMonth + 1).padStart(2, '0')}-01`;
        const toDateString = `${lastMonthYear}-${String(lastMonth + 1).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;
        
        from = new Date(fromDateString);
        to = new Date(toDateString);
        break;
      }
      case "this_year":
        from = startOfYear(now);
        to = endOfYear(now);
        break;
      case "all_time":
        setLocalDateRange(undefined);
        setDatePreset(preset);
        handleFilterUpdate(selectedDimension, selectedValues, undefined, localReportIds);
        return;
      default:
        from = startOfMonth(now);
        to = endOfMonth(now);
    }
    
    const newRange = { from, to };
    setLocalDateRange(newRange);
    setDatePreset(preset);
    handleFilterUpdate(selectedDimension, selectedValues, newRange, localReportIds);
  };

  const calculateCompareDateRange = () => {
    if (!localDateRange?.from || !localDateRange?.to) return;

    const from = localDateRange.from;
    const to = localDateRange.to;
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
        return;
      default:
        compareTo = subDays(from, 1);
        compareFrom = subDays(compareTo, daysDiff);
    }

    setCompareDateRange({ from: compareFrom, to: compareTo });
  };

  const handleFilterUpdate = (
    dimension: string | null,
    values: string[],
    dateRange?: DateRange,
    reportIds?: string[]
  ) => {
    onFilterChange(
      dimension,
      values,
      dateRange,
      reportIds,
      compareEnabled,
      compareType,
      compareEnabled ? compareDateRange : undefined
    );
  };

  const handleDimensionSelect = (dimensionId: string) => {
    console.log('[MASTER-FILTER] Selected dimension:', dimensionId);
    handleFilterUpdate(dimensionId, [], localDateRange, localReportIds);
    setShowDimensionSelector(false);
  };

  const handleValueToggle = (value: string) => {
    const newValues = selectedValues.includes(value)
      ? selectedValues.filter(v => v !== value)
      : [...selectedValues, value];
    
    console.log('[MASTER-FILTER] Updated values:', newValues);
    handleFilterUpdate(selectedDimension, newValues, localDateRange, localReportIds);
  };

  const handleSelectAllValues = () => {
    if (selectedDimension) {
      const allValues = dimensionValues[selectedDimension] || [];
      handleFilterUpdate(selectedDimension, allValues, localDateRange, localReportIds);
    }
  };

  const handleDeselectAllValues = () => {
    handleFilterUpdate(selectedDimension, [], localDateRange, localReportIds);
  };

  const handleReportToggle = (reportId: string) => {
    const newReportIds = localReportIds.includes(reportId)
      ? localReportIds.filter(id => id !== reportId)
      : [...localReportIds, reportId];
    
    setLocalReportIds(newReportIds);
    handleFilterUpdate(selectedDimension, selectedValues, localDateRange, newReportIds);
  };

  const handleSelectAllReports = () => {
    const allReportIds = reports.map(r => r.id);
    setLocalReportIds(allReportIds);
    handleFilterUpdate(selectedDimension, selectedValues, localDateRange, allReportIds);
  };

  const handleDeselectAllReports = () => {
    setLocalReportIds([]);
    handleFilterUpdate(selectedDimension, selectedValues, localDateRange, []);
  };

  const handleClearFilter = () => {
    setLocalDateRange(undefined);
    setLocalReportIds(reports.map(r => r.id));
    setDatePreset("all_time");
    setCompareEnabled(false);
    setCompareDateRange(undefined);
    handleFilterUpdate(null, [], undefined, reports.map(r => r.id));
  };

  const getFilteredValues = (dimensionId: string) => {
    const values = dimensionValues[dimensionId] || [];
    const searchTerm = searchTerms[dimensionId] || "";
    if (!searchTerm) return values;
    return values.filter(value => 
      value.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const getFilteredReports = () => {
    if (!reportSearchTerm) return reports;
    return reports.filter(report =>
      report.name.toLowerCase().includes(reportSearchTerm.toLowerCase())
    );
  };

  const selectedDimensionObj = dimensions.find(d => d.id === selectedDimension);
  const availableValues = selectedDimension ? dimensionValues[selectedDimension] || [] : [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Master Filter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <div className="animate-pulse h-4 bg-muted rounded w-32"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Master Filter
          </div>
          {selectedDimension && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearFilter}
              className="h-8 px-3 text-xs"
            >
              Clear All
            </Button>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-3">
          {/* Date Range Filter */}
          <div className="flex flex-col gap-1 min-w-[200px]">
            <label className="text-xs text-muted-foreground">Date Range</label>
            <Popover open={showDatePicker} onOpenChange={setShowDatePicker}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal bg-background",
                    !localDateRange?.from && datePreset !== "all_time" && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {datePreset === "all_time" ? (
                    "All Time"
                  ) : localDateRange?.from ? (
                    localDateRange.to ? (
                      <>
                        {format(localDateRange.from, "MMM d")} - {format(localDateRange.to, "MMM d, yyyy")}
                      </>
                    ) : (
                      format(localDateRange.from, "MMM d, yyyy")
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
                    </div>
                  </div>
                )}
                
                <Calendar
                  mode="range"
                  selected={localDateRange}
                  onSelect={(range) => {
                    setLocalDateRange(range);
                    setDatePreset("custom");
                    if (range?.from && range?.to) {
                      handleFilterUpdate(selectedDimension, selectedValues, range, localReportIds);
                    }
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

          {/* Report Filter */}
          <div className="flex flex-col gap-1 min-w-[200px]">
            <label className="text-xs text-muted-foreground">Data Sources</label>
            <Popover open={showReportSelector} onOpenChange={(open) => {
              setShowReportSelector(open);
              if (!open) setReportSearchTerm("");
            }}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between bg-background"
                >
                  {localReportIds.length === 0
                    ? "No reports"
                    : localReportIds.length === reports.length
                    ? "All reports"
                    : `${localReportIds.length} selected`}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[250px] p-0 bg-background z-50" align="start">
                <div className="flex flex-col">
                  {/* Search input */}
                  <div className="p-2 border-b">
                    <div className="relative">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search reports..."
                        value={reportSearchTerm}
                        onChange={(e) => setReportSearchTerm(e.target.value)}
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
                      onClick={handleSelectAllReports}
                    >
                      Select All
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="flex-1 h-8 text-xs"
                      onClick={handleDeselectAllReports}
                    >
                      Deselect All
                    </Button>
                  </div>
                  
                  {/* Report list */}
                  <ScrollArea className="max-h-[300px]">
                    <div className="p-2">
                      {getFilteredReports().map((report) => (
                        <div
                          key={report.id}
                          className="flex items-center gap-2 p-2 rounded hover:bg-accent cursor-pointer"
                          onClick={() => handleReportToggle(report.id)}
                        >
                          <div className={cn(
                            "w-4 h-4 border-2 rounded flex items-center justify-center",
                            localReportIds.includes(report.id) ? "bg-primary border-primary" : "border-muted-foreground"
                          )}>
                            {localReportIds.includes(report.id) && (
                              <Check className="h-3 w-3 text-primary-foreground" />
                            )}
                          </div>
                          <span className="text-sm">{report.name}</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {/* Dimension Filter */}
          {!selectedDimension ? (
            <div className="flex flex-col gap-1 min-w-[200px]">
              <label className="text-xs text-muted-foreground">Dimension Filter (Optional)</label>
              <Popover open={showDimensionSelector} onOpenChange={setShowDimensionSelector}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={showDimensionSelector}
                    className="w-full justify-between bg-background"
                  >
                    <span className="text-muted-foreground">Select dimension...</span>
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[250px] p-0 bg-background z-50" align="start">
                  <Command>
                    <CommandInput placeholder="Search dimensions..." />
                    <CommandList>
                      <CommandEmpty>No dimensions found.</CommandEmpty>
                      <CommandGroup>
                        {dimensions.map((dimension) => (
                          <CommandItem
                            key={dimension.id}
                            value={dimension.name}
                            onSelect={() => handleDimensionSelect(dimension.id)}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedDimension === dimension.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {dimension.name}
                            <Badge variant="secondary" className="ml-auto text-xs">
                              {dimension.scope}
                            </Badge>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          ) : (
            <div className="flex flex-col gap-1 min-w-[200px]">
              <label className="text-xs text-muted-foreground">{selectedDimensionObj?.name}</label>
              
              <Popover open={showValueSelector} onOpenChange={(open) => {
                setShowValueSelector(open);
                if (!open && selectedDimension) {
                  setSearchTerms({ ...searchTerms, [selectedDimension]: "" });
                }
              }}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-between bg-background"
                  >
                    {selectedValues.length === 0 
                      ? `All ${selectedDimensionObj?.name || 'values'}`
                      : selectedValues.length === 1
                      ? selectedValues[0]
                      : `${selectedValues.length} selected`}
                    <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[250px] p-0 bg-background z-50" align="start">
                  <div className="flex flex-col">
                    {/* Search input */}
                    <div className="p-2 border-b">
                      <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder={`Search ${selectedDimensionObj?.name.toLowerCase()}...`}
                          value={selectedDimension ? (searchTerms[selectedDimension] || "") : ""}
                          onChange={(e) => selectedDimension && setSearchTerms({ ...searchTerms, [selectedDimension]: e.target.value })}
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
                        onClick={handleSelectAllValues}
                      >
                        Select All
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex-1 h-8 text-xs"
                        onClick={handleDeselectAllValues}
                      >
                        Deselect All
                      </Button>
                    </div>
                    
                    {/* Value list */}
                    <ScrollArea className="max-h-[300px]">
                      <div className="p-2">
                        {selectedDimension && getFilteredValues(selectedDimension).map((value) => (
                          <div
                            key={value}
                            className="flex items-center gap-2 p-2 rounded hover:bg-accent cursor-pointer"
                            onClick={() => handleValueToggle(value)}
                          >
                            <div className={cn(
                              "w-4 h-4 border-2 rounded flex items-center justify-center",
                              selectedValues.includes(value) ? "bg-primary border-primary" : "border-muted-foreground"
                            )}>
                              {selectedValues.includes(value) && (
                                <Check className="h-3 w-3 text-primary-foreground" />
                              )}
                            </div>
                            <span className="text-sm">{value}</span>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </PopoverContent>
              </Popover>

              {selectedValues.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {selectedValues.slice(0, 3).map((value) => (
                    <Badge key={value} variant="secondary" className="text-xs">
                      {value}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleValueToggle(value)}
                        className="h-4 w-4 p-0 ml-1 hover:bg-transparent"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </Badge>
                  ))}
                  {selectedValues.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{selectedValues.length - 3} more
                    </Badge>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
