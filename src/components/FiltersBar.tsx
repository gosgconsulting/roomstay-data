import { useState, useEffect } from "react";
import { Filter, Settings, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { startOfMonth, endOfMonth, startOfWeek, subDays, subMonths, startOfYear, endOfYear, differenceInDays, subYears } from "date-fns";
import { DateRange } from "react-day-picker";
import { supabase } from "@/integrations/supabase/client";
import { retryWithBackoff, filterDimensionsByVisibility, filterDimensionsByFilterSettings } from "@/lib/debug";
import { useToast } from "@/components/ui/use-toast";
import { useVlookupMappings, getMappedValue } from "@/hooks/useVlookupMappings";
import PerformanceSettingsModal from "@/components/PerformanceSettingsModal";
import { loadDimensionsForUser } from "@/lib/dimensionLoader";

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
  onReportSelectionChange,
  isEditMode = false,
}: FiltersBarProps) => {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [allDimensions, setAllDimensions] = useState<Dimension[]>([]); // NEW: All available dimensions for settings modal
  const [activeDimensions, setActiveDimensions] = useState<string[]>([]);
  const [dimensionValues, setDimensionValues] = useState<Record<string, string[]>>({});
  const [selectedFilters, setSelectedFilters] = useState<Record<string, string[]>>({});
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
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

  // vlookup mappings
  const { data: vlookupMappings = [] } = useVlookupMappings(reportId || undefined, accountId);

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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Use the centralized dimension loader to get ALL dimensions
      const allAvailableDimensions = await loadDimensionsForUser(user.id, reportId);
      
      // Filter to only text and date types (same as PerformanceSettingsModal expects)
      const textDateDimensions = allAvailableDimensions.filter(d => 
        d.type === "text" || d.type === "date"
      );
      
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
      setActiveDimensions([]);
      setSelectedFilters({});
      setDateRange(undefined);
      setDatePreset("all_time");
      setCompareEnabled(false);
      setCompareType("previous_period");
      setCompareDateRange(undefined);

      loadDimensions().then(() => {
        loadAllDimensions(); // Load all dimensions for settings modal
        if (reportId) {
          loadFilterSettings().finally(() => setIsInitialLoad(false));
        } else {
          setIsInitialLoad(false);
        }
      });
    }
  }, [reportId, accountId]);

  // Master dimension options loader
  useEffect(() => {
    const loadOptions = async () => {
      if (!masterDimensionId || !accountId) {
        setMasterDimensionOptions([]);
        return;
      }
      setMasterDimensionValuesLoading(true);
      try {
        const { data: reportsData } = await supabase
          .from("reports")
          .select("id")
          .eq("account_id", accountId);

        const reportIds = (reportsData || []).map(r => r.id);
        if (reportIds.length === 0) {
          setMasterDimensionOptions([]);
          return;
        }

        const { data, error } = await supabase
          .from("dimension_data")
          .select("dimension_values")
          .in("report_id", reportIds)
          .limit(10000);

        if (error) throw error;

        const valuesSet = new Set<string>();
        data?.forEach(row => {
          const dv = row.dimension_values as Record<string, string>;
          const value = dv[masterDimensionId];
          if (value && value !== "") valuesSet.add(String(value));
        });

        setMasterDimensionOptions(Array.from(valuesSet).sort());
      } catch (e) {
        console.error("Error loading master dimension values:", e);
        setMasterDimensionOptions([]);
      } finally {
        setMasterDimensionValuesLoading(false);
      }
    };
    loadOptions();
  }, [masterDimensionId, accountId]);

  // Refresh dimensions on sync
  useEffect(() => {
    if ((reportId || accountId) && refreshTrigger && refreshTrigger > 0) {
      loadDimensions();
      loadAllDimensions(); // Also refresh all dimensions
    }
  }, [refreshTrigger, reportId, accountId]);

  // Load values for active dimensions
  useEffect(() => {
    if (activeDimensions.length > 0 && reportId) {
      loadDimensionValues();
    }
  }, [activeDimensions, reportId]);

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
    onFiltersChange?.({
      dimensionFilters: selectedFilters,
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

  // Helper: prefer Account dimension as default (account-scoped > custom/global), fallback to Date
  const getAccountDimensionId = async (): Promise<string | null> => {
    try {
      const resolvedAccountId = accountId || (await getReportAccountId());
      // 1) Prefer account-scoped "Account" dimension for the report's account
      if (resolvedAccountId) {
        const { data: acctDim, error: acctErr } = await supabase
          .from("dimensions")
          .select("id")
          .eq("name", "Account")
          .eq("type", "text")
          .eq("scope", "account")
          .eq("account_id", resolvedAccountId)
          .order("created_at", { ascending: false })
          .maybeSingle();
        if (!acctErr && acctDim?.id) return acctDim.id;
      }

      // 2) Fall back to a user custom "Account" dimension (global custom or report-specific)
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: customDim, error: customErr } = await supabase
          .from("dimensions")
          .select("id")
          .eq("name", "Account")
          .eq("type", "text")
          .eq("scope", "custom")
          .eq("user_id", user.id)
          .or(`report_id.is.null,report_id.eq.${reportId || ''}`)
          .order("created_at", { ascending: false })
          .maybeSingle();
        if (!customErr && customDim?.id) return customDim.id;
      }

      // 3) Fall back to a global "Account" dimension if present
      const { data: globalDim, error: globalErr } = await supabase
        .from("dimensions")
        .select("id")
        .eq("name", "Account")
        .eq("type", "text")
        .eq("scope", "global")
        .order("created_at", { ascending: false })
        .maybeSingle();
      if (!globalErr && globalDim?.id) return globalDim.id;

      // 4) Final fallback: Date dimension
      return await getDateDimensionId();
    } catch {
      return await getDateDimensionId();
    }
  };

  const loadFilterSettings = async () => {
    if (!reportId) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
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
        .from("report_views")
        .select("*")
        .eq("report_id", reportId)
        .eq("user_id", userId)
        .eq("is_default", true)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;

      if (data) {
        // If only Date is set as the sole default filter dimension, replace it with Account (if available)
        const existingDims = Array.isArray(data.filter_dimensions) ? data.filter_dimensions : [];
        if (existingDims.length === 1 && dateDimensionId && existingDims[0] === dateDimensionId && defaultAccountDimId) {
          setActiveDimensions([defaultAccountDimId]);

          // Persist fix so future loads are correct
          await supabase
            .from("report_views")
            .update({
              filter_dimensions: [defaultAccountDimId],
              filter_values: {}, // clear since dimension changed
            })
            .eq("id", data.id);
        } else if (existingDims.length) {
          setActiveDimensions(existingDims);
          if (data.filter_values && Object.keys(data.filter_values).length) {
            const fv = data.filter_values as Record<string, string | string[]>;
            const normalized: Record<string, string[]> = {};
            const activeDims = existingDims;
            Object.entries(fv).forEach(([key, value]) => {
              if (activeDims.includes(key) && !key.startsWith("__")) {
                normalized[key] = Array.isArray(value) ? value : [value];
              }
            });
            setSelectedFilters(normalized);
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

        // FIX: Use date_range_preset from DB
        const preset = (data as any).date_range_preset || "all_time";
        applyDatePreset(preset);
      } else {
        // No view: default to Account if available, else Date
        if (defaultAccountDimId) {
          setActiveDimensions([defaultAccountDimId]);
        } else if (dateDimensionId) {
          setActiveDimensions([dateDimensionId]);
        }
        applyDatePreset("all_time");
      }
    } catch (error) {
      console.error("Error loading filter settings:", error);
      // Fallback default
      const defaultAccountDimId = await getAccountDimensionId();
      const dateDimensionId = await getDateDimensionId();
      if (defaultAccountDimId) {
        setActiveDimensions([defaultAccountDimId]);
      } else if (dateDimensionId) {
        setActiveDimensions([dateDimensionId]);
      }
      applyDatePreset("all_time");
    }
  };

  const saveFilterSettings = async () => {
    if (!reportId || isSharedView || !isEditMode) return; // Add isEditMode check
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

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
          ...(masterDimensionId && { __master_dimension_id: masterDimensionId }),
        },
        date_range_start: dateRange?.from ? dateRange.from.toISOString().split("T")[0] : null,
        date_range_end: dateRange?.to ? dateRange.to.toISOString().split("T")[0] : null,
        // FIX: Save date_range_preset to match schema
        date_range_preset: datePreset as string,
      };

      if (existingView && (existingView as any).id) {
        const { error } = await supabase
          .from("report_views")
          .update(viewData)
          .eq("id", (existingView as any).id as string);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("report_views")
          .insert({
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
        const fromDateString = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-01`;
        const toDateString = `${currentYear}-${String(currentMonth + 1).padStart(2, "0")}-${String(lastDayOfMonth).padStart(2, "0")}`;
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
        if (lastMonth < 0) { lastMonth = 11; lastMonthYear = currentYear - 1; }
        const lastDayOfMonth = new Date(lastMonthYear, lastMonth + 1, 0).getDate();
        const fromDateString = `${lastMonthYear}-${String(lastMonth + 1).padStart(2, "0")}-01`;
        const toDateString = `${lastMonthYear}-${String(lastMonth + 1).padStart(2, "0")}-${String(lastDayOfMonth).padStart(2, "0")}`;
        from = new Date(fromDateString);
        to = new Date(toDateString);
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

    setDateRange({ from, to });
    setDatePreset(preset);
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
    applyDatePreset("all_time");
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      let accountData: Dimension[] = [];
      if (accountId) {
        const { data, error } = await supabase
          .from("dimensions").select("*")
          .eq("scope", "account")
          .eq("account_id", accountId)
          .order("created_at", { ascending: false });
        if (error) throw error;
        accountData = (data || []) as Dimension[];
      }

      let customData: Dimension[] = [];
      if (reportId) {
        const { data, error } = await supabase
          .from("dimensions").select("*")
          .eq("user_id", user.id)
          .eq("scope", "custom")
          .or(`report_id.is.null,report_id.eq.${reportId}`)
          .order("created_at", { ascending: false });
        if (error) throw error;
        customData = (data || []) as Dimension[];
      } else {
        const { data, error } = await supabase
          .from("dimensions").select("*")
          .eq("user_id", user.id)
          .eq("scope", "custom")
          .is("report_id", null)
          .order("created_at", { ascending: false });
        if (error) throw error;
        customData = (data || []) as Dimension[];
      }

      const { data: globalData, error: globalError } = await supabase
        .from("dimensions").select("*")
        .eq("scope", "global")
        .order("created_at", { ascending: false });
      if (globalError) throw globalError;

      // Include all dimensions (vlookup dimensions are now included in custom data)
      const all = [
        ...(accountData || []),
        ...(customData || []),
        ...(globalData || [])
      ] as Dimension[];
      // FIX: Deduplicate by id (not by name) so newly added dimensions aren't dropped
      const seenIds = new Set<string>();
      const unique = all.filter(d => {
        if (seenIds.has(d.id)) return false;
        seenIds.add(d.id);
        return true;
      });

      console.log('[FiltersBar] loadDimensions - All unique dimensions:', unique.map(d => `${d.name} (${d.type})`));
      const filterable = unique.filter(d => d.type === "text");
      console.log('[FiltersBar] loadDimensions - After type filter (text only):', filterable.map(d => d.name));
      
      const final = (user && reportId)
        ? await filterDimensionsByFilterSettings(filterable, reportId, user.id, supabase)
        : filterable;
      
      console.log('[FiltersBar] loadDimensions - After filter settings:', final.map(d => d.name));
      setDimensions(final);
    } catch (e) {
      console.error("Error loading dimensions:", e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDimensionValues = async () => {
    if (!reportId || activeDimensions.length === 0) return;
    setIsLoadingFilters(true);
    try {
      const data = await retryWithBackoff(
        async () => {
          const { data, error } = await supabase
            .from("dimension_data")
            .select("dimension_values")
            .eq("report_id", reportId)
            .limit(10000);
          if (error) throw error;
          return data;
        },
        3,
        500
      );

      const valuesMap: Record<string, Set<string>> = {};
      data?.forEach(row => {
        const dv = row.dimension_values as Record<string, string | number | boolean>;
        activeDimensions.forEach(dimId => {
          const value = dv[dimId];
          if (value) {
            if (!valuesMap[dimId]) valuesMap[dimId] = new Set();
            const valueStr = String(value);
            valuesMap[dimId].add(valueStr);
            const mappedValue = getMappedValue(valueStr, vlookupMappings, dimId);
            if (mappedValue !== valueStr) valuesMap[dimId].add(mappedValue);
          }
        });
      });

      const valuesArray: Record<string, string[]> = {};
      Object.keys(valuesMap).forEach(dimId => {
        valuesArray[dimId] = Array.from(valuesMap[dimId]).sort();
      });
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: existingView } = await supabase
        .from("report_views")
        // FIX: Select correct date fields
        .select("id, date_range_start, date_range_end, date_range_preset")
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
          .from("report_views")
          .update(viewData)
          .eq("id", (existingView as any).id as string);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("report_views")
          .insert({
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
      <div className="border-b bg-card">
        <div className="container mx-auto px-6 py-3">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Filter className="h-4 w-4" />
              <span>Filters</span>
            </div>

            <div className="flex items-center gap-3 flex-1">
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

              {activeDimensions.map((dimId) => {
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
              })}

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
            </div>

            <div className="flex items-center gap-2 ml-auto">
              {hasActiveFilters() && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleResetFilters}
                  className="gap-2 text-muted-foreground hover:text-foreground"
                  title={`Reset ${getActiveFiltersCount()} active filter${getActiveFiltersCount() > 1 ? "s" : ""}`}
                >
                  <RotateCcw className="h-4 w-4" />
                  Reset Filters ({getActiveFiltersCount()})
                </Button>
              )}

              {activeDimensions.length > 0 && !isSharedView && isEditMode && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSettingsOpen(true)}
                  title="Edit filter dimensions"
                >
                  <Settings className="h-4 w-4" />
                </Button>
              )}
            </div>
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
        onSave={(selectedIds) => {
          // Apply to filter options (chips) and persist via existing handler
          handleDimensionsChange(selectedIds);
          setSettingsOpen(false);
        }}
      />
    </>
  );
};

export default FiltersBar;