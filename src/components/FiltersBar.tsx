import { useState, useEffect } from "react";
import { Filter, Calendar, Settings, Check, Search, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { useVlookupMappings, getMappedValue, getAllValuesForFilter } from "@/hooks/useVlookupMappings";

export interface FilterState {
  dimensionFilters: Record<string, string[]>;
  dateRange: DateRange | undefined;
  datePreset: string;
  compareEnabled: boolean;
  compareType: string;
  compareDateRange?: DateRange;
  masterDimensionId?: string | null;
  masterDimensionValues?: string[];
}

interface FiltersBarProps {
  reportId: string | null;
  onFiltersChange?: (filters: FilterState) => void;
  isSharedView?: boolean;
  accountId?: string;
  refreshTrigger?: number;
  showMasterDimensionFilter?: boolean;
  showReportFilter?: boolean;
  availableReports?: Array<{ id: string; name: string }>;
  selectedReportIds?: string[];
  onReportSelectionChange?: (reportIds: string[]) => void;
}

interface Dimension {
  id: string;
  name: string;
  type: string;
  scope?: 'global' | 'account' | 'custom';
}

export const FiltersBar = ({ 
  reportId, 
  onFiltersChange, 
  isSharedView = false, 
  accountId, 
  refreshTrigger,
  showMasterDimensionFilter = false,
  showReportFilter = false,
  availableReports = [],
  selectedReportIds = [],
  onReportSelectionChange
}: FiltersBarProps) => {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [activeDimensions, setActiveDimensions] = useState<string[]>([]);
  const [dimensionValues, setDimensionValues] = useState<Record<string, string[]>>({});
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({});
  const [dateRange, setDateRange] = useState<DateRange | undefined>(() => {
    console.log('[testing] FiltersBar - Initial dateRange state set to undefined');
    return undefined;
  });
  const [datePreset, setDatePreset] = useState<string>("all_time");
  const [showDimensionSelector, setShowDimensionSelector] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingFilters, setIsLoadingFilters] = useState(false);
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareType, setCompareType] = useState<string>("previous_period");
  const [compareDateRange, setCompareDateRange] = useState<DateRange | undefined>();
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});
  const [openPopovers, setOpenPopovers] = useState<Record<string, boolean>>({});
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const { toast } = useToast();
  
  // Master dimension filter state
  const [masterDimensionId, setMasterDimensionId] = useState<string | null>(null);
  const [masterDimensionValues, setMasterDimensionValues] = useState<string[]>([]);
  const [masterDimensionOptions, setMasterDimensionOptions] = useState<string[]>([]);
  const [masterDimensionPopoverOpen, setMasterDimensionPopoverOpen] = useState(false);
  const [masterDimensionSettingsOpen, setMasterDimensionSettingsOpen] = useState(false);
  const [masterDimensionValuesLoading, setMasterDimensionValuesLoading] = useState(false);
  
  // Load vlookup mappings for this report/account
  const { data: vlookupMappings = [] } = useVlookupMappings(reportId || undefined, accountId);

  // Initialize selected reports to all reports by default
  useEffect(() => {
    if (showReportFilter && availableReports.length > 0 && selectedReportIds.length === 0) {
      onReportSelectionChange?.(availableReports.map(r => r.id));
    }
  }, [availableReports, showReportFilter]);

  useEffect(() => {
    // Load dimensions when report or account changes
    console.log('[testing] FiltersBar - useEffect triggered. reportId:', reportId, 'accountId:', accountId);
    if (reportId || accountId) {
      // Reset all filter state when report changes - use last 7 days for performance
      setIsInitialLoad(true);
      setActiveDimensions([]);
      setSelectedFilters({});
      setDateRange(undefined);
      setDatePreset("all_time");
      setCompareEnabled(false);
      setCompareType("previous_period");
      setCompareDateRange(undefined);
      
      console.log('[testing] FiltersBar - Starting to load dimensions...');
      // Load dimensions first, then load settings (only if reportId exists)
      loadDimensions().then(() => {
        console.log('[testing] FiltersBar - Dimensions loaded');
        if (reportId) {
          loadFilterSettings().finally(() => {
            setIsInitialLoad(false);
          });
        } else {
          setIsInitialLoad(false);
        }
      });
    }
  }, [reportId, accountId]);

  // Load master dimension values when dimension is selected
  useEffect(() => {
    const loadMasterDimensionValues = async () => {
      if (!masterDimensionId || !accountId) {
        setMasterDimensionOptions([]);
        return;
      }

      setMasterDimensionValuesLoading(true);
      try {
        console.log('[FiltersBar] Loading values for master dimension:', masterDimensionId);
        
        // First, get the dimension name from the dimensions table
        const { data: dimensionData, error: dimensionError } = await supabase
          .from("dimensions")
          .select("name")
          .eq("id", masterDimensionId)
          .single();
          
        if (dimensionError) throw dimensionError;
        
        const dimensionName = dimensionData.name;
        console.log('[FiltersBar] Master dimension name:', dimensionName);
        
        // Load dimension values from all reports in the account
        const { data: reportsData } = await supabase
          .from("reports")
          .select("id")
          .eq("account_id", accountId);
        
        if (!reportsData || reportsData.length === 0) {
          setMasterDimensionOptions([]);
          return;
        }
        
        const reportIds = reportsData.map(r => r.id);
        
        // Load dimension data for all reports
        const { data, error } = await supabase
          .from("dimension_data")
          .select("dimension_values")
          .in("report_id", reportIds)
          .limit(10000);
        
        if (error) throw error;
        
        const valuesSet = new Set<string>();
        
        data?.forEach((row) => {
          const dimensionValues = row.dimension_values as Record<string, string>;
          const value = dimensionValues[dimensionName];
          if (value && value !== null && value !== undefined && value !== '') {
            valuesSet.add(String(value));
          }
        });
        
        const sortedValues = Array.from(valuesSet).sort();
        console.log('[FiltersBar] Loaded', sortedValues.length, 'unique values for dimension:', dimensionName);
        setMasterDimensionOptions(sortedValues);
      } catch (error) {
        console.error("Error loading master dimension values:", error);
        setMasterDimensionOptions([]);
      } finally {
        setMasterDimensionValuesLoading(false);
      }
    };

    loadMasterDimensionValues();
  }, [masterDimensionId, accountId]);

  // Refresh dimensions when data is remapped/synced
  useEffect(() => {
    if ((reportId || accountId) && refreshTrigger && refreshTrigger > 0) {
      console.log('[testing] FiltersBar - Refreshing dimensions due to data sync, trigger:', refreshTrigger);
      loadDimensions();
    }
  }, [refreshTrigger, reportId, accountId]);

  useEffect(() => {
    if (activeDimensions.length > 0 && reportId) {
      loadDimensionValues();
    }
  }, [activeDimensions, reportId]);

  // Track dateRange changes
  useEffect(() => {
    console.log('[testing] FiltersBar - dateRange state changed:', {
      dateRange,
      from: dateRange?.from?.toISOString(),
      to: dateRange?.to?.toISOString(),
      hasDateRange: !!dateRange,
      timestamp: new Date().toISOString()
    });
  }, [dateRange]);

  // Apply default date range on mount when no reportId
  useEffect(() => {
    console.log('[testing] FiltersBar - Initial mount effect');
    if (!reportId) {
      console.log('[testing] FiltersBar - No reportId on mount, applying all_time preset');
      applyDatePreset("all_time");
    }
  }, []); // Only run on mount

  // Save filter settings whenever they change (but not during initial load)
  useEffect(() => {
    if (reportId && !isLoading && !isInitialLoad) {
      const timeoutId = setTimeout(() => {
        saveFilterSettings();
      }, 300); // Small delay to batch rapid changes
      
      return () => clearTimeout(timeoutId);
    }
  }, [activeDimensions, selectedFilters, dateRange, datePreset, masterDimensionId, reportId, isInitialLoad]);

  // Update comparison date range when date range or compare type changes
  useEffect(() => {
    if (compareEnabled && dateRange?.from && dateRange?.to) {
      calculateCompareDateRange();
    }
  }, [compareEnabled, compareType, dateRange]);

  // Notify parent of filter changes
  useEffect(() => {
    console.log('[FiltersBar] Filter state changed, notifying parent');
    console.log('[FiltersBar] Date range change details:', {
      dateRange,
      from: dateRange?.from?.toISOString(),
      to: dateRange?.to?.toISOString(),
      preset: datePreset,
      timestamp: new Date().toISOString()
    });
    if (onFiltersChange) {
      const newFilters = {
        dimensionFilters: selectedFilters,
        dateRange,
        datePreset,
        compareEnabled,
        compareType,
        compareDateRange: compareEnabled ? compareDateRange : undefined,
        masterDimensionId,
        masterDimensionValues,
      };
      console.log('[FiltersBar] Calling onFiltersChange with:', newFilters);
      onFiltersChange(newFilters);
    }
  }, [onFiltersChange, selectedFilters, dateRange, datePreset, compareEnabled, compareType, compareDateRange, masterDimensionId, masterDimensionValues]);

  // Helper function to get Date dimension ID from database
  const getDateDimensionId = async (): Promise<string | null> => {
    try {
      const { data, error } = await supabase
        .from("dimensions")
        .select("id")
        .eq("scope", "global")
        .eq("type", "date")
        .eq("name", "Date")
        .maybeSingle();
      
      if (error) {
        console.error('[FILTERS-BAR] Error fetching Date dimension:', error);
        return null;
      }
      
      return data?.id || null;
    } catch (error) {
      console.error('[FILTERS-BAR] Error in getDateDimensionId:', error);
      return null;
    }
  };

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
      
      // Get the Date dimension ID first
      const dateDimensionId = await getDateDimensionId();
      
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
        console.log('[FILTERS-BAR] Loading saved filter settings:', {
          filter_dimensions: data.filter_dimensions,
          filter_values: data.filter_values,
        });
        
        // Load saved dimensions if they exist
        if (data.filter_dimensions && data.filter_dimensions.length > 0) {
          setActiveDimensions(data.filter_dimensions);
          console.log('[FILTERS-BAR] Loaded', data.filter_dimensions.length, 'saved dimensions');
          
          if (data.filter_values && Object.keys(data.filter_values).length > 0) {
            // Convert old single-value filters to array format if needed
            const filterValues = data.filter_values as Record<string, string | string[]>;
            const normalizedFilters: Record<string, string[]> = {};
            const activeDims = data.filter_dimensions || [];
            
            Object.entries(filterValues).forEach(([key, value]) => {
              // Only load filter values for dimensions that are in filter_dimensions
              // Skip special keys like __master_dimension_id
              if (activeDims.includes(key) && !key.startsWith('__')) {
                normalizedFilters[key] = Array.isArray(value) ? value : [value];
              }
            });
            setSelectedFilters(normalizedFilters);
            console.log('[FILTERS-BAR] Loaded filter values for', Object.keys(normalizedFilters).length, 'dimensions');
          }
        } else if (dateDimensionId) {
          // Default to only Date dimension if none saved
          setActiveDimensions([dateDimensionId]);
          console.log('[FILTERS-BAR] No saved dimensions, defaulting to Date dimension');
        }
        
        // Load master dimension if saved (stored in filter_values with special key)
        if (data.filter_values && typeof data.filter_values === 'object') {
          const filterValues = data.filter_values as Record<string, any>;
          if (filterValues.__master_dimension_id) {
            setMasterDimensionId(filterValues.__master_dimension_id);
          }
        }
        
        // Always apply date preset if saved, or default to "all_time"
        const preset = data.date_range_preset || "all_time";
        setDatePreset(preset);
        applyDatePreset(preset);
      } else {
        // No saved view for this report, apply defaults
        if (dateDimensionId) {
          setActiveDimensions([dateDimensionId]);
        }
        applyDatePreset("all_time");
      }
    } catch (error) {
      console.error("Error loading filter settings:", error);
      // On error, apply defaults
      applyDatePreset("all_time");
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
        filter_values: {
          ...selectedFilters,
          // Store master dimension ID with special key to distinguish from regular filters
          ...(masterDimensionId && { __master_dimension_id: masterDimensionId })
        },
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
      } else {
        // Create new view if it doesn't exist
        const { error } = await supabase
          .from("report_views")
          .insert({
            ...viewData,
            report_id: reportId,
            user_id: user.id,
            is_default: true,
          });

        if (error) throw error;
        console.log('[FILTERS-BAR] Created new default view with filter settings');
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
      case "this_month": {
        // Timezone-free this month calculation
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth();
        const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
        
        const fromDateString = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`;
        const toDateString = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;
        
        from = new Date(fromDateString);
        to = new Date(toDateString);
        
        console.log('[testing] FiltersBar - This month calculated:', {
          fromDateString,
          toDateString,
          from: from.toISOString(),
          to: to.toISOString()
        });
        break;
      }
      case "last_30_days":
        from = subDays(now, 30);
        break;
      case "last_month": {
        // Calculate last month using pure date math - no timezone handling
        const currentYear = now.getFullYear();
        const currentMonth = now.getMonth(); // 0-based (0 = January)
        
        // Calculate last month year and month
        let lastMonthYear = currentYear;
        let lastMonth = currentMonth - 1;
        if (lastMonth < 0) {
          lastMonth = 11; // December
          lastMonthYear = currentYear - 1;
        }
        
        // Get last day of the month
        const lastDayOfMonth = new Date(lastMonthYear, lastMonth + 1, 0).getDate();
        
        // Create date strings and then convert to Date objects for display only
        const fromDateString = `${lastMonthYear}-${String(lastMonth + 1).padStart(2, '0')}-01`;
        const toDateString = `${lastMonthYear}-${String(lastMonth + 1).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}`;
        
        // Create Date objects - use local timezone for UI display to match calendar expectations
        from = new Date(fromDateString);
        to = new Date(toDateString);
        
        console.log('[testing] FiltersBar - Last month date range (timezone-free):', {
          fromDateString,
          toDateString,
          from: from.toISOString(),
          to: to.toISOString(),
          fromFormatted: fromDateString,
          toFormatted: toDateString,
          lastMonthYear,
          lastMonth: lastMonth + 1,
          lastDayOfMonth
        });
        break;
      }
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

    console.log('[testing] FiltersBar - Setting date range:', {
      preset,
      from: from?.toISOString(),
      to: to?.toISOString(),
      fromDefined: !!from,
      toDefined: !!to
    });
    
    setDateRange({ from, to });
    setDatePreset(preset);
  };

  // Check if any filters are currently applied (excluding default "all_time")
  const hasActiveFilters = () => {
    // Check if any dimension has selected filter values
    const hasDimensionFilters = Object.keys(selectedFilters).some(
      dimensionId => selectedFilters[dimensionId] && selectedFilters[dimensionId].length > 0
    );
    // Only consider date filter active if it's NOT the default "all_time"
    const hasDateFilter = datePreset !== "all_time";
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
    
    // Only count date filter if it's NOT the default "all_time"
    if (datePreset !== "all_time") {
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
    // Reset to default "all_time" date filter
    applyDatePreset("all_time");
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
    // Allow loading dimensions even without reportId if accountId is available (All Reports view)
    if (!reportId && !accountId) return;
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      console.log('[testing] FiltersBar - Loading dimensions for user:', user.id, 'report:', reportId, 'account:', accountId);

      // Load account-specific dimensions first (highest priority)
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

      // Load custom dimensions for this user
      let customData: Dimension[] = [];
      if (reportId) {
        // If reportId is provided, load both global custom and report-specific
        const { data, error: customError } = await supabase
          .from("dimensions")
          .select("*")
          .eq("user_id", user.id)
          .eq("scope", "custom")
          .or(`report_id.is.null,report_id.eq.${reportId}`)
          .order("created_at", { ascending: false });

        if (customError) throw customError;
        customData = (data || []) as Dimension[];
      } else {
        // If no reportId (All Reports view), only load global custom dimensions (not report-specific)
        const { data, error: customError } = await supabase
          .from("dimensions")
          .select("*")
          .eq("user_id", user.id)
          .eq("scope", "custom")
          .is("report_id", null) // Only global custom dimensions
          .order("created_at", { ascending: false });

        if (customError) throw customError;
        customData = (data || []) as Dimension[];
      }

      // Load global dimensions (lowest priority, fallback)
      const { data: globalData, error: globalError } = await supabase
        .from("dimensions")
        .select("*")
        .eq("scope", "global")
        .order("created_at", { ascending: false });

      if (globalError) throw globalError;

      // Combine all dimensions with proper priority: account > custom > global
      const allDimensions = [
        ...accountData,
        ...customData,
        ...(globalData || [])
      ] as Dimension[];

      // Deduplicate by name, keeping highest priority (first occurrence)
      const seenNames = new Set<string>();
      const uniqueDimensions = allDimensions.filter(dim => {
        if (seenNames.has(dim.name)) {
          return false;
        }
        seenNames.add(dim.name);
        return true;
      });

      console.log('[testing] FiltersBar - Loaded dimensions - Account:', accountData?.length || 0, 'Custom:', customData?.length || 0, 'Global:', globalData?.length || 0, 'Unique:', uniqueDimensions.length);

      // Filter to only text dimensions (for filtering) - date filtering is handled by date range picker
      const filterableDimensions = uniqueDimensions.filter(d => 
        d.type === 'text'
      );

      // Filter dimensions by visibility settings (only for specific reports)
      let finalDimensions = filterableDimensions;
      if (user && reportId) {
        finalDimensions = await filterDimensionsByVisibility(filterableDimensions, reportId, user.id, supabase);
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
            
            const valueStr = String(value);
            // Add the original value
            valuesMap[dimId].add(valueStr);
            
            // Apply vlookup mapping and add the mapped value if different
            const mappedValue = getMappedValue(valueStr, vlookupMappings, dimId);
            if (mappedValue !== valueStr) {
              valuesMap[dimId].add(mappedValue);
            }
          }
          
          // Also check if any values from OTHER dimensions map TO this dimension
          // For example, if Hotel values map to Account dimension, add those mapped values to Account
          Object.entries(dimensionValues).forEach(([sourceDimId, sourceValue]) => {
            if (sourceDimId !== dimId && sourceValue) {
              // Check if this source value has a mapping that targets the current dimension
              const targetMappings = vlookupMappings.filter(
                m => m.sourceDimensionId === sourceDimId && m.targetDimensionId === dimId
              );
              
              targetMappings.forEach(mapping => {
                if (mapping.sourceValue.toLowerCase() === String(sourceValue).toLowerCase()) {
                  if (!valuesMap[dimId]) {
                    valuesMap[dimId] = new Set();
                  }
                  valuesMap[dimId].add(mapping.targetValue);
                }
              });
            }
          });
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
      // Add value (don't expand - expansion happens during filtering)
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

  const handleDimensionsChange = async (dimensionIds: string[]) => {
    console.log('[FILTERS-BAR] Dimensions changed:', dimensionIds);
    setActiveDimensions(dimensionIds);
    // Clear filters for removed dimensions
    const newFilters = { ...selectedFilters };
    Object.keys(newFilters).forEach((key) => {
      if (!dimensionIds.includes(key)) {
        delete newFilters[key];
      }
    });
    setSelectedFilters(newFilters);
    
    // Save the updated dimensions to the database (but not during initial load)
    if (!reportId || isSharedView || isInitialLoad) {
      console.log('[FILTERS-BAR] Skipping save - reportId:', reportId, 'isSharedView:', isSharedView, 'isInitialLoad:', isInitialLoad);
      return;
    }
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('[FILTERS-BAR] No user found, cannot save dimensions');
        return;
      }

      const { data: existingView } = await supabase
        .from("report_views")
        .select("id, date_range_start, date_range_end, date_range_preset")
        .eq("report_id", reportId)
        .eq("user_id", user.id)
        .eq("is_default", true)
        .maybeSingle();

      const viewData = {
        filter_dimensions: dimensionIds,
        filter_values: newFilters,
        date_range_start: existingView?.date_range_start || null,
        date_range_end: existingView?.date_range_end || null,
        date_range_preset: existingView?.date_range_preset || "all_time",
      };

      if (existingView) {
        const { error } = await supabase
          .from("report_views")
          .update(viewData)
          .eq("id", existingView.id);
        
        if (error) throw error;
        console.log('[FILTERS-BAR] Updated filter dimensions in existing view');
      } else {
        const { error } = await supabase
          .from("report_views")
          .insert({
            ...viewData,
            report_id: reportId,
            user_id: user.id,
            is_default: true,
          });
        
        if (error) throw error;
        console.log('[FILTERS-BAR] Created new view with filter dimensions');
      }
      
      toast({
        title: "Dimensions saved",
        description: `${dimensionIds.length} dimension${dimensionIds.length !== 1 ? 's' : ''} configured for this report`,
      });
    } catch (error) {
      console.error('[FILTERS-BAR] Error saving dimension changes:', error);
      toast({
        title: "Error saving dimensions",
        description: "Failed to save dimension configuration",
        variant: "destructive",
      });
    }
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
              {/* Master Dimension Filter */}
              {showMasterDimensionFilter && (
                <div className="flex items-end gap-2">
                  <div 
                    className="flex flex-col gap-1"
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMasterDimensionPopoverOpen(true);
                    }}
                  >
                    <label className="text-xs text-muted-foreground">
                      Master Dimension
                    </label>
                    <Button
                      variant="outline"
                      className="w-[200px] justify-between bg-background"
                      onClick={() => setMasterDimensionPopoverOpen(true)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setMasterDimensionPopoverOpen(true);
                      }}
                    >
                      {masterDimensionId 
                        ? (
                          <span className="flex items-center gap-2">
                            {dimensions.find(d => d.id === masterDimensionId)?.name || 'Select...'}
                            {masterDimensionValues.length > 0 && (
                              <span className="text-xs text-muted-foreground">
                                ({masterDimensionValues.length})
                              </span>
                            )}
                          </span>
                        )
                        : 'Select dimension...'}
                      <Settings className="ml-2 h-4 w-4 opacity-50" />
                    </Button>
                </div>
              </div>
              )}

              {/* Report Filter */}
              {showReportFilter && availableReports.length > 0 && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">
                    Include Reports
                  </label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-[200px] justify-between bg-background"
                      >
                        {selectedReportIds.length === 0
                          ? 'All reports'
                          : selectedReportIds.length === availableReports.length
                          ? 'All reports'
                          : `${selectedReportIds.length} selected`}
                        <Settings className="ml-2 h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[300px] p-0 bg-background z-50" align="start">
                      <div className="p-2 border-b flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1 h-8 text-xs"
                          onClick={() => onReportSelectionChange?.(availableReports.map(r => r.id))}
                        >
                          Select All
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="flex-1 h-8 text-xs"
                          onClick={() => onReportSelectionChange?.([])}
                        >
                          Deselect All
                        </Button>
                      </div>
                      <ScrollArea className="h-[200px]">
                        <div className="p-2 space-y-1">
                          {availableReports.map(report => (
                            <div
                              key={report.id}
                              className="flex items-center gap-2 p-2 hover:bg-accent rounded cursor-pointer"
                              onClick={() => {
                                const newSelection = selectedReportIds.includes(report.id)
                                  ? selectedReportIds.filter(id => id !== report.id)
                                  : [...selectedReportIds, report.id];
                                onReportSelectionChange?.(newSelection);
                              }}
                            >
                              <Checkbox
                                checked={selectedReportIds.includes(report.id)}
                                onCheckedChange={() => {}}
                              />
                              <span className="text-sm">{report.name}</span>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </PopoverContent>
                  </Popover>
                </div>
              )}

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
                            {(() => {
                              // Format the 'to' date properly to avoid timezone issues
                              const toDate = new Date(dateRange.to);
                              // If it's near end of day (23:59:59), use the date as-is
                              if (toDate.getUTCHours() === 23 && toDate.getUTCMinutes() === 59) {
                                return format(new Date(toDate.getUTCFullYear(), toDate.getUTCMonth(), toDate.getUTCDate()), "MMM d, yyyy");
                              }
                              return format(toDate, "MMM d, yyyy");
                            })()}
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

              {activeDimensions.length === 0 && !isSharedView && !showMasterDimensionFilter && (
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

      {/* Master Dimension Settings Modal */}
      <Dialog open={masterDimensionSettingsOpen} onOpenChange={setMasterDimensionSettingsOpen}>
        <DialogContent className="sm:max-w-[500px] bg-background">
          <DialogHeader>
            <DialogTitle>Master Dimension Settings</DialogTitle>
            <DialogDescription>
              Choose a dimension to use as the master filter across all reports. This will be automatically applied when viewing consolidated data.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select Master Dimension</Label>
              <ScrollArea className="h-[300px] border rounded-md p-2">
                <div className="space-y-1">
                  <Button
                    variant={!masterDimensionId ? "secondary" : "ghost"}
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => setMasterDimensionId(null)}
                  >
                    <Check className={cn("mr-2 h-4 w-4", !masterDimensionId ? "opacity-100" : "opacity-0")} />
                    None (No master dimension)
                  </Button>
                  
                  {dimensions.filter(d => d.type === 'text').map(dim => (
                    <Button
                      key={dim.id}
                      variant={masterDimensionId === dim.id ? "secondary" : "ghost"}
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => setMasterDimensionId(dim.id)}
                    >
                      <Check className={cn("mr-2 h-4 w-4", masterDimensionId === dim.id ? "opacity-100" : "opacity-0")} />
                      {dim.name}
                      {dim.scope && (
                        <span className="ml-2 text-xs text-muted-foreground capitalize">
                          ({dim.scope})
                        </span>
                      )}
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setMasterDimensionSettingsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              setMasterDimensionSettingsOpen(false);
              toast({
                title: "Settings saved",
                description: masterDimensionId 
                  ? `Master dimension set to: ${dimensions.find(d => d.id === masterDimensionId)?.name}`
                  : "Master dimension cleared",
              });
            }}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Master Dimension Popover */}
      <Popover open={masterDimensionPopoverOpen} onOpenChange={setMasterDimensionPopoverOpen}>
        <PopoverTrigger asChild>
          <div style={{ display: 'none' }} />
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0 bg-background border shadow-lg z-[100]" align="start">
          {!masterDimensionId ? (
            // Show dimension selector
            <>
              <div className="p-2 border-b bg-muted/50">
                <p className="text-xs font-medium text-muted-foreground">Select Master Dimension</p>
              </div>
              <ScrollArea className="h-[250px]">
                <div className="p-2 space-y-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-xs"
                    onClick={() => {
                      setMasterDimensionId(null);
                      setMasterDimensionValues([]);
                      setMasterDimensionPopoverOpen(false);
                    }}
                  >
                    None (Clear filter)
                  </Button>
                  {dimensions.filter(d => d.type === 'text').map(dim => (
                    <Button
                      key={dim.id}
                      variant={masterDimensionId === dim.id ? "secondary" : "ghost"}
                      size="sm"
                      className="w-full justify-start text-xs"
                      onClick={() => {
                        setMasterDimensionId(dim.id);
                        setMasterDimensionValues([]);
                      }}
                    >
                      {dim.name}
                      {dim.scope && (
                        <span className="ml-auto text-[10px] text-muted-foreground capitalize">
                          {dim.scope}
                        </span>
                      )}
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            </>
          ) : (
            // Show dimension values for filtering
            <>
              <div className="p-2 border-b bg-muted/50 flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  {dimensions.find(d => d.id === masterDimensionId)?.name} Values
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => {
                    setMasterDimensionId(null);
                    setMasterDimensionValues([]);
                  }}
                >
                  Change Dimension
                </Button>
              </div>
              <div className="p-2 border-b flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 h-7 text-xs"
                  onClick={() => setMasterDimensionValues(masterDimensionOptions)}
                >
                  Select All
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 h-7 text-xs"
                  onClick={() => setMasterDimensionValues([])}
                >
                  Clear All
                </Button>
              </div>
              <ScrollArea className="h-[250px]">
                <div className="p-2 space-y-1">
                  {masterDimensionValuesLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary"></div>
                    </div>
                  ) : masterDimensionOptions.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-4">
                      No values found
                    </div>
                  ) : (
                    masterDimensionOptions.map(value => (
                      <div
                        key={value}
                        className="flex items-center gap-2 p-2 hover:bg-accent rounded cursor-pointer transition-colors"
                        onClick={() => {
                          const newValues = masterDimensionValues.includes(value)
                            ? masterDimensionValues.filter(v => v !== value)
                            : [...masterDimensionValues, value];
                          setMasterDimensionValues(newValues);
                        }}
                      >
                        <Checkbox
                          checked={masterDimensionValues.includes(value)}
                          onCheckedChange={() => {}}
                        />
                        <span className="text-xs">{value}</span>
                      </div>
                    ))
                  )}
                </div>
              </ScrollArea>
            </>
          )}
        </PopoverContent>
      </Popover>
    </>
  );
};
