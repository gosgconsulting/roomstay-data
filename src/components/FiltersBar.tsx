import { useState, useEffect, useMemo } from "react";
import { Settings, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { differenceInDays, subDays, subYears } from "date-fns";
import { dateRangeFromPreset } from "@/lib/monthUtils";
import { DateRange } from "react-day-picker";
import { supabase } from "@/integrations/supabase/client";
import { retryWithBackoff } from "@/lib/utils/retry";
import { filterDimensionsByFilterSettings } from "@/lib/utils/dimensionFilter";
import { useToast } from "@/components/ui/use-toast";
import PerformanceSettingsModal from "@/components/PerformanceSettingsModal";
import { loadDimensionsForUser } from "@/lib/dimensionLoader";
import { useUser } from "@/lib/auth";
import { useCachedSourceData } from "@/hooks/dataSources/useCachedSourceData";
import { extractMultipleDimensionValues } from "@/lib/filters/extractDimensionValues";

import { 
  DimensionFilter, 
  ReportSelector, 
  DateRangeFilter, 
  MasterDimensionButton, 
  MasterDimensionPopover 
} from "./filters";

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
  isEditMode?: boolean;
}

interface Dimension {
  id: string;
  name: string;
  type: string;
  scope?: 'global' | 'account' | 'custom' | 'fallback';
  conditions?: import("@/types/dimensions").DimensionCondition[];
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
  onReportSelectionChange,
  isEditMode = false,
}: FiltersBarProps) => {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [allDimensions, setAllDimensions] = useState<Dimension[]>([]); // All available dimensions for settings modal
  const [activeDimensions, setActiveDimensions] = useState<string[]>([]);
  const [dimensionValues, setDimensionValues] = useState<Record<string, string[]>>({});
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({});
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [datePreset, setDatePreset] = useState<string>("this_month");
  const [showDimensionSelector, setShowDimensionSelector] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingFilters, setIsLoadingFilters] = useState(true); // Start true to prevent flash
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [compareType, setCompareType] = useState<string>("previous_period");
  const [compareDateRange, setCompareDateRange] = useState<DateRange | undefined>();
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});
  const [openPopovers, setOpenPopovers] = useState<Record<string, boolean>>({});
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const { toast } = useToast();

  // Master dimension state
  const [masterDimensionId, setMasterDimensionId] = useState<string | null>(null);
  const [masterDimensionValues, setMasterDimensionValues] = useState<string[]>([]);
  const [masterDimensionOptions, setMasterDimensionOptions] = useState<string[]>([]);
  const [masterDimensionPopoverOpen, setMasterDimensionPopoverOpen] = useState(false);
  const [masterDimensionSettingsOpen, setMasterDimensionSettingsOpen] = useState(false);
  const [masterDimensionValuesLoading, setMasterDimensionValuesLoading] = useState(false);
  // Table settings modal state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dateDimensionIdForModal, setDateDimensionIdForModal] = useState<string | null>(null);

  
  // Get current user
  const { data: userData } = useUser();
  const user = userData?.user || null;

  // Fetch source data for extracting filter values from cached dimension_data
  const {
    data: cachedSourceData,
    isLoading: sourceDataLoading,
  } = useCachedSourceData(reportId);
  const sourceRows = cachedSourceData?.transformedRows ?? [];
  const dimensionIdMap: Record<string, string> = {}; // dimension_data rows are already keyed by dimension ID

  // Initialize selected reports to all by default
  useEffect(() => {
    if (showReportFilter && availableReports.length > 0 && selectedReportIds.length === 0) {
      onReportSelectionChange?.(availableReports.map(r => r.id));
    }
  }, [availableReports, showReportFilter]);

  // Load all available dimensions for the settings modal
  const loadAllDimensions = async () => {
    if (!reportId && !accountId) return;
    try {
      if (!user) throw new Error("User not authenticated");

      // Use the centralized dimension loader to get ALL dimensions
      const allAvailableDimensions = await loadDimensionsForUser(user.id, reportId);
      
      // Filter to only text and date types (same as PerformanceSettingsModal expects)
      const textDateDimensions = allAvailableDimensions.filter(d => 
        d.type === "text" || d.type === "date"
      );
      
      // For the settings modal, show ALL text/date dimensions regardless of data availability
      // This allows users to select dimensions for filtering even if they don't have data yet
      console.log('[FiltersBar] loadAllDimensions - All available dimensions:', textDateDimensions.map(d => `${d.name} (${d.type})`));
      setAllDimensions(textDateDimensions);
    } catch (e) {
      console.error("Error loading all dimensions:", e);
      setAllDimensions([]);
    }
  };

  // Load dimensions and filter settings on report/account change
  useEffect(() => {
    if (reportId || accountId) {
      setIsInitialLoad(true);
      setIsLoadingFilters(true);
      setActiveDimensions([]);
      setSelectedFilters({});
      // Don't pre-compute dates - let loadFilterSettings handle it
      setDateRange(undefined);
      setDatePreset("this_month");
      setCompareEnabled(false);
      setCompareType("previous_period");
      setCompareDateRange(undefined);

      loadDimensions().then(() => {
        loadAllDimensions(); // Load all dimensions for settings modal
        if (reportId) {
          loadFilterSettings().finally(() => setIsInitialLoad(false));
        } else {
          // No saved view - apply "this_month" preset
          applyDatePreset("this_month");
          setIsInitialLoad(false);
        }
      });
    }
  }, [reportId, accountId]);

  // Master dimension options loader - extract from source data
  useEffect(() => {
    if (!masterDimensionId || !accountId) {
      setMasterDimensionOptions([]);
      return;
    }
    
    // If we have source rows, extract values directly
    if (sourceRows && sourceRows.length > 0) {
      setMasterDimensionValuesLoading(true);
      try {
        const extracted = extractMultipleDimensionValues(sourceRows, [masterDimensionId], 10000);
        const values = extracted[masterDimensionId] || [];
        console.log(`[FiltersBar] Master dimension values extracted from source:`, values.length);
        setMasterDimensionOptions(values);
      } catch (e) {
        console.error("Error extracting master dimension values:", e);
        setMasterDimensionOptions([]);
      } finally {
        setMasterDimensionValuesLoading(false);
      }
    }
  }, [masterDimensionId, accountId, sourceRows]);

  // Refresh dimensions on sync
  useEffect(() => {
    if ((reportId || accountId) && refreshTrigger && refreshTrigger > 0) {
      loadDimensions();
      loadAllDimensions(); // Also refresh all dimensions
    }
  }, [refreshTrigger, reportId, accountId]);

  // Load values for active dimensions when source data is available
  useEffect(() => {
    if (activeDimensions.length > 0 && reportId && sourceRows && sourceRows.length > 0) {
      loadDimensionValues();
    }
  }, [activeDimensions, reportId, sourceRows, sourceDataLoading]);

  // Ensure Date dimension is available in the settings modal
  useEffect(() => {
    getDateDimensionId().then((id) => setDateDimensionIdForModal(id));
  }, [reportId, accountId]);

  // Keep only this modalDimensions declaration - now using allDimensions
  const settingsModalDimensions = [
    ...(dateDimensionIdForModal ? [{ id: dateDimensionIdForModal, name: "Date", type: "date" }] : []),
    ...allDimensions, // Use allDimensions instead of dimensions
  ];


  // Persist filter settings after changes (only in Edit mode)
  useEffect(() => {
    if (reportId && !isLoading && !isInitialLoad && isEditMode) {
      const t = setTimeout(() => saveFilterSettings(), 300);
      return () => clearTimeout(t);
    }
  }, [activeDimensions, selectedFilters, dateRange, datePreset, masterDimensionId, reportId, isInitialLoad, isEditMode]);

  // Update compare range when needed
  useEffect(() => {
    if (compareEnabled && dateRange?.from && dateRange?.to) {
      calculateCompareDateRange();
    }
  }, [compareEnabled, compareType, dateRange]);

  // Notify parent
  useEffect(() => {
    const effectiveFilters = selectedFilters;
    onFiltersChange?.({
      dimensionFilters: effectiveFilters,
      dateRange,
      datePreset,
      compareEnabled,
      compareType,
      compareDateRange: compareEnabled ? compareDateRange : undefined,
      masterDimensionId,
      masterDimensionValues,
    });
  }, [onFiltersChange, selectedFilters, dateRange, datePreset, compareEnabled, compareType, compareDateRange, masterDimensionId, masterDimensionValues]);

  const getDateDimensionId = async (): Promise<string | null> => {
    try {
      const { data, error } = await supabase
        .from("dimensions")
        .select("id")
        .eq("scope", "global")
        .eq("type", "date")
        .eq("name", "Date")
        .maybeSingle();
      if (error) return null;
      return data?.id || null;
    } catch {
      return null;
    }
  };

  // Helper: fetch account_id for a report if not provided
  const getReportAccountId = async (): Promise<string | null> => {
    if (!reportId) return null;
    try {
      const { data, error } = await supabase
        .from("reports")
        .select("account_id")
        .eq("id", reportId)
        .maybeSingle();
      if (error) return null;
      return data?.account_id || null;
    } catch {
      return null;
    }
  };

  // Helper: Find best default filter dimension that actually has data
  const getAccountDimensionId = async (): Promise<string | null> => {
    if (!reportId) return await getDateDimensionId();
    
    try {
      const resolvedAccountId = accountId || (await getReportAccountId());
      
      // Use the new utility to find a dimension with actual data
      const { findBestDefaultFilterDimension } = await import("@/lib/dimensionDataChecker");
      const dimensionWithData = await findBestDefaultFilterDimension(
        reportId,
        resolvedAccountId,
        ["Account", "Campaign", "Ad Group", "Hotel", "Channel"]
      );
      
      if (dimensionWithData) {
        console.log("[FiltersBar] Using dimension with data:", dimensionWithData);
        return dimensionWithData;
      }
      
      // Final fallback: Date dimension (even if it has no data, it's a safe default)
      console.log("[FiltersBar] No dimensions with data found, falling back to Date");
      return await getDateDimensionId();
    } catch (error) {
      console.error("[FiltersBar] Error finding default dimension:", error);
      return await getDateDimensionId();
    }
  };

  const loadFilterSettings = async () => {
    if (!reportId) return;
    try {
      let userId = user?.id || "";

      if (isSharedView && reportId) {
        const { data: reportData } = await supabase
          .from("reports")
          .select("user_id")
          .eq("id", reportId)
          .single();
        if (reportData) userId = reportData.user_id;
      }

      const dateDimensionId = await getDateDimensionId();
      const defaultAccountDimId = await getAccountDimensionId();

      const { data, error } = await supabase
        .from("views")
        .select("*")
        .eq("mode", "performance_table")
        .eq("report_id", reportId)
        .eq("user_id", userId)
        .eq("is_default", true)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;

      if (data) {
        // If only Date is set as the sole default filter dimension, replace it with Account (if available)
        const existingDims = Array.isArray(data.filter_dimensions) ? data.filter_dimensions : [];
        
        // Filter existing dimensions to only include those that are mapped in the data source
        const { filterDimensionsByMappedData } = await import("@/lib/dimensionDataChecker");
        const validDims = await filterDimensionsByMappedData(reportId!, existingDims);
        console.log('[FiltersBar] Filtered dimensions by mapped data:', { original: existingDims.length, valid: validDims.length });
        
        if (existingDims.length === 1 && dateDimensionId && existingDims[0] === dateDimensionId && defaultAccountDimId) {
          setActiveDimensions([defaultAccountDimId]);

          await supabase
            .from("views")
            .update({
              filter_dimensions: [defaultAccountDimId],
              filter_values: {},
            })
            .eq("mode", "performance_table")
            .eq("id", data.id);
        } else if (validDims.length) {
          setActiveDimensions(validDims);
          if (data.filter_values && Object.keys(data.filter_values).length) {
            const fv = data.filter_values as Record<string, string | string[]>;
            const normalized: Record<string, string[]> = {};
            Object.entries(fv).forEach(([key, value]) => {
              if (validDims.includes(key) && !key.startsWith("__")) {
                normalized[key] = Array.isArray(value) ? value : [value];
              }
            });
            setSelectedFilters(normalized);
          }
          
          if (validDims.length < existingDims.length) {
            console.log('[FiltersBar] Updating saved view with valid dimensions only');
            await supabase
              .from("views")
              .update({
                filter_dimensions: validDims,
              })
              .eq("mode", "performance_table")
              .eq("id", data.id);
          }
        } else if (defaultAccountDimId) {
          setActiveDimensions([defaultAccountDimId]);
        } else if (dateDimensionId) {
          setActiveDimensions([dateDimensionId]);
        }

        const fv = data.filter_values as Record<string, any>;
        if (fv && fv.__master_dimension_id) {
          setMasterDimensionId(fv.__master_dimension_id);
        }

        // FORCE DEFAULT: Always initialize date to 'this_month' on first load
        console.log('[FiltersBar] Forcing default date preset to this_month on initial load');
        applyDatePreset("this_month");
        setCompareEnabled(false);
        setCompareType("previous_period");
        setCompareDateRange(undefined);

        // REMOVED: Using saved custom date ranges/presets to avoid defaulting to old months
        // (savedDateStart/savedDateEnd/preset handling removed for initial load)
      } else {
        // No view: default to Account if available, else Date, and always use this_month for date
        if (defaultAccountDimId) {
          setActiveDimensions([defaultAccountDimId]);
        } else if (dateDimensionId) {
          setActiveDimensions([dateDimensionId]);
        }
        console.log('[FiltersBar] No saved view, defaulting to this_month');
        applyDatePreset("this_month");
      }
    } catch (error) {
      console.error("Error loading filter settings:", error);
      // Fallback default - always use all_time
      const defaultAccountDimId = await getAccountDimensionId();
      const dateDimensionId = await getDateDimensionId();
      if (defaultAccountDimId) {
        setActiveDimensions([defaultAccountDimId]);
      } else if (dateDimensionId) {
        setActiveDimensions([dateDimensionId]);
      }
      console.log('[FiltersBar] Error fallback - using this_month');
      applyDatePreset("this_month");
    }
  };

  const saveFilterSettings = async () => {
    if (!reportId || isSharedView || !isEditMode) return; // Add isEditMode check
    try {
      if (!user) return;

      const { data: existingView } = await supabase
        .from("views")
        .select("id")
        .eq("mode", "performance_table")
        .eq("report_id", reportId)
        .eq("user_id", user.id)
        .eq("is_default", true)
        .maybeSingle();

      const viewData = {
        filter_dimensions: activeDimensions,
        filter_values: {
          ...selectedFilters,
          ...(masterDimensionId && { __master_dimension_id: masterDimensionId }),
        },
        date_range_start: dateRange?.from ? dateRange.from.toISOString().split("T")[0] : null,
        date_range_end: dateRange?.to ? dateRange.to.toISOString().split("T")[0] : null,
        // FIX: Save date_range_preset to match schema
        date_range_preset: datePreset as string,
      };

      if (existingView && (existingView as any).id) {
        const { error } = await supabase
          .from("views")
          .update(viewData)
          .eq("mode", "performance_table")
          .eq("id", (existingView as any).id as string);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("views")
          .insert({
            mode: "performance_table",
            ...viewData,
            report_id: reportId,
            user_id: user.id,
            name: "Default View",
            is_default: true,
          });
        if (error) throw error;
      }

      console.log('[FILTERS] Filter settings saved successfully');
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
        return;
      default:
        compareTo = subDays(from, 1);
        compareFrom = subDays(compareTo, daysDiff);
    }
    setCompareDateRange({ from: compareFrom, to: compareTo });
  };

  const applyDatePreset = (preset: string) => {
    if (preset === "all_time") {
      setDateRange(undefined);
      setDatePreset(preset);
      return;
    }
    const range = dateRangeFromPreset(preset);
    if (range) {
      setDateRange(range);
      setDatePreset(preset);
    }
  };

  const hasActiveFilters = () => {
    const hasDimensionFilters = Object.keys(selectedFilters).some(
      id => selectedFilters[id] && selectedFilters[id].length > 0
    );
    const hasDateFilter = datePreset !== "all_time";
    const hasCompareFilter = compareEnabled;
    return hasDimensionFilters || hasDateFilter || hasCompareFilter;
  };

  const getActiveFiltersCount = () => {
    let count = 0;
    Object.keys(selectedFilters).forEach(id => {
      if (selectedFilters[id]?.length) count += 1;
    });
    if (datePreset !== "all_time") count += 1;
    if (compareEnabled) count += 1;
    return count;
  };

  const handleResetFilters = () => {
    setSelectedFilters({});
    applyDatePreset("this_month");
    setCompareEnabled(false);
    setCompareType("previous_period");
    setCompareDateRange(undefined);
    setSearchTerms({});
    toast({
      title: "Filters reset",
      description: "All filters reset to default values.",
    });
  };

  const loadDimensions = async () => {
    if (!reportId && !accountId) return;
    try {
      if (!user) throw new Error("User not authenticated");

      console.log('[FiltersBar] Loading dimensions for filtering - being more permissive...');

      // Use centralized dimension loader to get ALL dimensions (no data filtering for filters)
      const allAvailableDimensions = await loadDimensionsForUser(
        user.id, 
        reportId,
        {
          filterByDataAvailability: false,  // DON'T filter by data availability for filters
          alwaysIncludeDate: true,
          alwaysIncludeCalculated: true,
          fallbackOnError: true
        }
      );

      console.log('[FiltersBar] loadDimensions - All dimensions loaded:', allAvailableDimensions.map(d => `${d.name} (${d.type})`));
      
      // Filter to only text dimensions (suitable for filtering)
      const filterable = allAvailableDimensions.filter(d => d.type === "text");
      console.log('[FiltersBar] loadDimensions - After type filter (text only):', filterable.map(d => d.name));
      
      // Apply filter settings filtering, but with fallback to ensure some dimensions are always available
      let final = filterable;
      if (user && reportId) {
        try {
          const settingsFiltered = await filterDimensionsByFilterSettings(filterable, reportId, user.id, supabase);
          
          // If filter settings result in empty array, use some default dimensions
          if (settingsFiltered.length === 0) {
            console.log('[FiltersBar] Filter settings returned empty, using fallback dimensions');
            // Use first 5 filterable dimensions as fallback
            final = filterable.slice(0, 5);
          } else {
            final = settingsFiltered;
          }
        } catch (filterError) {
          console.error('[FiltersBar] Error applying filter settings, using all filterable dimensions:', filterError);
          final = filterable;
        }
      }
      
      // Ensure we always have at least some dimensions for filtering
      if (final.length === 0) {
        console.log('[FiltersBar] No dimensions available after all filtering, using fallback');
        // Create fallback dimensions to prevent complete failure
        const fallbackDimensions = [
          {
            id: 'fallback-account',
            name: 'Account',
            type: 'text',
            scope: 'fallback' as const
          },
          {
            id: 'fallback-campaign',
            name: 'Campaign',
            type: 'text',
            scope: 'fallback' as const
          }
        ];
        final = fallbackDimensions;
      }
      
      console.log('[FiltersBar] loadDimensions - Final dimensions for filtering:', final.map(d => d.name));
      setDimensions(final);
      
      // Store all dimensions for settings modal
      setAllDimensions(allAvailableDimensions);
    } catch (e) {
      console.error("Error loading dimensions:", e);
      // Set fallback dimensions to prevent complete failure
      const fallbackDimensions = [
        {
          id: 'fallback-account',
          name: 'Account',
          type: 'text',
          scope: 'fallback' as const
        }
      ];
      setDimensions(fallbackDimensions);
      setAllDimensions(fallbackDimensions);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDimensionValues = () => {
    if ((!reportId && !accountId) || activeDimensions.length === 0) return;
    
    // Wait for source data to be loaded
    if (sourceDataLoading || !sourceRows) {
      console.log('[FiltersBar] Waiting for source data to load...');
      return;
    }

    setIsLoadingFilters(true);
    try {
      const valuesArray: Record<string, string[]> = {};
      
      // Extract values for dimensions from source data
      if (activeDimensions.length > 0 && sourceRows.length > 0) {
        console.log('[FiltersBar] Extracting dimension values from source data for:', activeDimensions);
        const extracted = extractMultipleDimensionValues(sourceRows, activeDimensions, 10000);
        
        activeDimensions.forEach(dimId => {
          const values = extracted[dimId] || [];
          console.log(`[FiltersBar] Extracted ${values.length} unique values for dimension ${dimId}`);
          valuesArray[dimId] = values.sort();
        });
      } else if (activeDimensions.length > 0) {
        // No source data yet, set empty arrays
        activeDimensions.forEach(dimId => {
          valuesArray[dimId] = [];
        });
      }

      setDimensionValues(valuesArray);
    } catch (e) {
      console.error("Error loading dimension values:", e);
    } finally {
      setIsLoadingFilters(false);
    }
  };

  const handleFilterChange = (dimensionId: string, value: string) => {
    const next = { ...selectedFilters };
    const current = next[dimensionId] || [];
    next[dimensionId] = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    if (next[dimensionId].length === 0) delete next[dimensionId];
    setSelectedFilters(next);
  };

  const handleSelectAll = (dimensionId: string) => {
    const values = dimensionValues[dimensionId] || [];
    setSelectedFilters({ ...selectedFilters, [dimensionId]: [...values] });
  };

  const handleDeselectAll = (dimensionId: string) => {
    const next = { ...selectedFilters };
    delete next[dimensionId];
    setSelectedFilters(next);
  };

  const handleDimensionsChange = async (dimensionIds: string[]) => {
    console.log('[FiltersBar] handleDimensionsChange called with:', dimensionIds);
    console.log('[FiltersBar] Current dimensions before update:', dimensions.map(d => d.name));
    
    setActiveDimensions(dimensionIds);
    const next = { ...selectedFilters };
    Object.keys(next).forEach(key => {
      if (!dimensionIds.includes(key)) delete next[key];
    });
    setSelectedFilters(next);

    // Immediately refresh dimensions so new ids are present for rendering
    console.log('[FiltersBar] Calling loadDimensions to refresh...');
    await loadDimensions();
    await loadAllDimensions(); // Also refresh all dimensions
    console.log('[FiltersBar] loadDimensions completed');
    
    // Reload filter settings to ensure we have the latest data
    await loadFilterSettings();
    console.log('[FiltersBar] loadFilterSettings completed');

    // Only persist changes in Edit mode
    if (!reportId || isSharedView || isInitialLoad || !isEditMode) return;

    try {
      if (!user) return;

      const { data: existingView } = await supabase
        .from("views")
        // FIX: Select correct date fields
        .select("id, date_range_start, date_range_end, date_range_preset")
        .eq("mode", "performance_table")
        .eq("report_id", reportId)
        .eq("user_id", user.id)
        .eq("is_default", true)
        .maybeSingle();

      const viewData = {
        filter_dimensions: dimensionIds,
        filter_values: next,
        date_range_start: (existingView && 'date_range_start' in (existingView as any))
          ? ((existingView as any).date_range_start as string)
          : null,
        date_range_end: (existingView && 'date_range_end' in (existingView as any))
          ? ((existingView as any).date_range_end as string)
          : null,
        // FIX: Use date_range_preset safely
        date_range_preset: (existingView && 'date_range_preset' in (existingView as any))
          ? ((existingView as any).date_range_preset as string)
          : "all_time",
      };

      if (existingView && (existingView as any).id) {
        const { error } = await supabase
          .from("views")
          .update(viewData)
          .eq("mode", "performance_table")
          .eq("id", (existingView as any).id as string);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("views")
          .insert({
            mode: "performance_table",
            ...viewData,
            report_id: reportId,
            user_id: user.id,
            name: "Default View",
            is_default: true,
          });
        if (error) throw error;
      }

      toast({
        title: "Dimensions saved",
        description: `${dimensionIds.length} dimension${dimensionIds.length !== 1 ? "s" : ""} configured for this report`,
      });
    } catch (error) {
      console.error("[FILTERS-BAR] Error saving dimension changes:", error);
      toast({
        title: "Error saving dimensions",
        description: "Failed to save dimension configuration",
        variant: "destructive",
      });
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isEditMode) return;
    setShowDimensionSelector(true);
  };

  return (
    <>
      {/* Remove top bar styling from filter area */}
      <div className="bg-transparent border-0">
        <div className="container mx-auto px-4 py-1">
          {/* Filters row: enable wrapping and bottom-align items */}
          <div className="flex flex-wrap items-end justify-start gap-3">
            {showMasterDimensionFilter && (
              <div className="flex items-end gap-2">
                <MasterDimensionButton
                  dimensions={dimensions}
                  masterDimensionId={masterDimensionId}
                  count={masterDimensionValues.length}
                  onOpen={() => setMasterDimensionPopoverOpen(true)}
                />
              </div>
            )}

            {showReportFilter && availableReports.length > 0 && (
              <ReportSelector
                availableReports={availableReports}
                selectedReportIds={selectedReportIds}
                onChange={(ids) => onReportSelectionChange?.(ids)}
              />
            )}

            {/* Show loading placeholders while filters are being initialized */}
            {(isLoading || isInitialLoad) ? (
              <>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Account:</span>
                  <div className="h-10 w-[160px] bg-muted animate-pulse rounded-md border" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Filter:</span>
                  <div className="h-10 w-[160px] bg-muted animate-pulse rounded-md border" />
                </div>
              </>
            ) : activeDimensions.length === 0 ? (
              // No active dimensions configured - show message in edit mode, nothing in view mode
              isEditMode ? (
                <div className="flex items-center text-sm text-muted-foreground">
                  No filters configured. Click settings to add filters.
                </div>
              ) : null
            ) : (
              activeDimensions.map((dimId) => {
                const dimension = dimensions.find(d => d.id === dimId);
                if (!dimension) return null;
                return (
                  <DimensionFilter
                    key={dimId}
                    dimension={{ id: dimId, name: dimension.name }}
                    isLoading={isLoadingFilters}
                    values={dimensionValues[dimId] || []}
                    searchTerm={searchTerms[dimId] || ""}
                    selectedValues={selectedFilters[dimId] || []}
                    open={!!openPopovers[dimId]}
                    onOpenChange={(o) => setOpenPopovers({ ...openPopovers, [dimId]: o })}
                    onSearchTermChange={(term) => setSearchTerms({ ...searchTerms, [dimId]: term })}
                    onSelectAll={() => handleSelectAll(dimId)}
                    onDeselectAll={() => handleDeselectAll(dimId)}
                    onToggleValue={(value) => handleFilterChange(dimId, value)}
                  />
                );
              })
            )}

            {isLoadingFilters ? (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Date Range:</span>
                <Skeleton className="h-10 w-[180px]" />
              </div>
            ) : (
              <DateRangeFilter
                dateRange={dateRange}
                datePreset={datePreset}
                compareEnabled={compareEnabled}
                compareType={compareType}
                onDatePresetChange={(preset) => {
                  if (preset === "all_time") {
                    setDateRange(undefined);
                    setDatePreset("all_time");
                  } else {
                    applyDatePreset(preset);
                  }
                }}
                onDateRangeChange={(range) => {
                  setDateRange(range);
                  setDatePreset("custom");
                }}
                onCompareEnabledChange={setCompareEnabled}
                onCompareTypeChange={setCompareType}
              />
            )}

            {/* Inline icon-only Reset Filters, bottom-aligned */}
            {hasActiveFilters() && (
              <Button
                variant="outline"
                size="icon"
                onClick={handleResetFilters}
                title={`Reset filters (${getActiveFiltersCount()})`}
                aria-label={`Reset filters (${getActiveFiltersCount()})`}
                className="text-muted-foreground hover:text-foreground self-end"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            )}

            {activeDimensions.length === 0 && !isSharedView && !showMasterDimensionFilter && isEditMode && (
              <Button
                variant="outline"
                className="gap-2"
                onContextMenu={handleContextMenu}
                onClick={handleContextMenu}
              >
                Right-click to configure filters
              </Button>
            )}

            {activeDimensions.length > 0 && !isSharedView && isEditMode && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSettingsOpen(true)}
                title="Edit filter dimensions"
                className="self-end"
              >
                <Settings className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

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
                    None (No master dimension)
                  </Button>

                  {dimensions.filter(d => d.type === "text").map(dim => (
                    <Button
                      key={dim.id}
                      variant={masterDimensionId === dim.id ? "secondary" : "ghost"}
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => setMasterDimensionId(dim.id)}
                    >
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

      <MasterDimensionPopover
        open={masterDimensionPopoverOpen}
        onOpenChange={setMasterDimensionPopoverOpen}
        dimensions={dimensions}
        masterDimensionId={masterDimensionId}
        setMasterDimensionId={setMasterDimensionId}
        masterDimensionValues={masterDimensionValues}
        setMasterDimensionValues={setMasterDimensionValues}
        masterDimensionOptions={masterDimensionOptions}
        masterDimensionValuesLoading={masterDimensionValuesLoading}
      />

      {/* Open the new Table Settings modal from FiltersBar */}
      <PerformanceSettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        dimensions={settingsModalDimensions as any}
        groupBy={[]}
        breakdownBy={[]}
        thenBy={[]}
        selectedDimensionIds={activeDimensions}
        isEditMode={isEditMode}
        onSave={(selectedIds) => {
          // Apply to filter options (chips) and persist via existing handler
          handleDimensionsChange(selectedIds);
          setSettingsOpen(false);
        }}
      />
    </>
  );
};
