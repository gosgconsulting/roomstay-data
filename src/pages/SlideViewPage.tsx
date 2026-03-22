import React, { useState, useEffect, useMemo, useCallback, useRef } from "react"; // v2
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, RefreshCw, Eye, MousePointer, DollarSign, Percent, TrendingUp, ShoppingCart, ArrowUpRight, ArrowDownRight, Settings2, ChevronLeft, ChevronRight, X, Sparkles, Search, Loader2, Database, Check, Share2, BookmarkPlus, Trash2 } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { SaveViewDialog } from "@/components/slides/SaveViewDialog";
import { SaveOrUpdateViewDialog } from "@/components/slides/SaveOrUpdateViewDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useSlideReportPage } from "@/hooks/useSlideReportPage";
import { useUserAccount } from "@/hooks/useUserAccount";
import { useChannelMetrics } from "@/hooks/useChannelMetrics";
import { useEditSourceModal } from "@/hooks/useEditSourceModal";
import { useDataLoadingCache } from "@/hooks/useDataLoadingCache";
import { useOverviewMetrics } from "@/hooks/useOverviewMetrics";
import { useComparisonMetrics, useChannelComparisonMetrics } from "@/hooks/useComparisonMetrics";
import { useKPICards, useReportKPICards } from "@/hooks/useKPICards";
import { useChannelChartDataFromRawRows } from "@/hooks/useChannelChartDataFromRawRows";
import { useBudgetData, useBudgetMonthlyData } from "@/hooks/useBudgetData";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { SlideReport, SlideReportConfiguration, SlideReportPivotData, SlideReportDateRange, BreakdownRow, ChannelMetrics } from "@/types/slideReports";
import { useUser } from "@/lib/auth";
import { SlideDataBrowser } from "@/components/slides/SlideDataBrowser";
import { RefreshStepIndicator, ChannelTabsList, DimensionValuesList } from "@/components/slides/EditSourceModal";
import { EditSourceModal } from "@/components/slides/EditSourceModal/EditSourceModal";
import { ShareModal } from "@/components/ShareModal";
import { ReportSidebar } from "@/components/slides/ReportSidebar";
import { FiltersRow } from "@/components/slides/FiltersRow";
import { FilterPanel } from "@/components/slides/FilterPanel";
import { DimensionSettingsModal, type DimensionSettingsMode, type DimensionSettingsModalValue } from "@/components/slides/DimensionSettingsModal";
import { useDataStudioFilters, type FilterConfigs } from "@/hooks/useDataStudioFilters";
import { ComparisonBanner } from "@/components/slides/ComparisonBanner";

import { OverviewTab } from "@/components/slides/OverviewTab";
import { ChannelTab } from "@/components/slides/ChannelTab";
import { KPICardsSection, KPICardsSkeleton } from "@/components/slides/KPICardsSection";
import { BudgetTab } from "@/components/slides/BudgetTab";
import { BookingTab } from "@/components/slides/BookingTab";
import { PriceCheckTab } from "@/components/slides/PriceCheckTab";
import { RefreshDataModal } from "@/components/slides/RefreshDataModal";
import { isWithinInterval } from "date-fns";
import { BASE_METRICS, CHANNEL_REPORT_IDS, MONTH_NAMES } from "@/constants/slideViewConstants";
import {
  buildComparisonDateRange,
  buildComparisonDateRangeFromExact,
  buildMultiMonthDateRange,
  dateRangeToSlideSelection,
  exactDateRangeFromDayPicker,
  formatDateToLocalIso,
  getCurrentMonthToDateRange,
  parseSelectedMonths,
} from "@/lib/monthUtils";
import type { AccountReportIds } from "@/lib/accountReportIds";
import { runRefreshWorkflow } from "@/lib/refreshWorkflow";
import {
  calculateDerivedMetrics,
  hasActiveFilters,
  hasActiveFiltersForChannel,
  filterRawDataRows,
  aggregateMetricsFromRows,
  calculatePercentChange,
  formatNumber,
  buildMetricNameToIdsMap,
  getMetricKeys,
  ensureMinimumChartData,
} from "@/lib/slideViewHelpers";
import type { RawDataRow, MetricData, ChartGranularity, ChartMetric } from "@/types/slideView";

// Default groupBy / breakdownBy dimension name hints per channel.
// These are resolved to actual IDs by BreakdownTableSection once dimensions load.
const DEFAULT_GROUPBY: Record<string, string> = { metasearch: 'hotel', sem: 'account', social: 'account' };
const DEFAULT_BREAKDOWNBY: Record<string, string> = { metasearch: 'link_type', sem: 'campaign', social: 'campaign' };

function buildDefaultDataStudioDateState(): {
  range: import("react-day-picker").DateRange;
  selectedYear: string;
  selectedMonth: string;
} {
  const range = getCurrentMonthToDateRange();
  const selection = dateRangeToSlideSelection(range);
  return {
    range,
    selectedYear: selection.year,
    selectedMonth: selection.month,
  };
}

function buildDefaultSlideReportDateRange(): SlideReportDateRange {
  const { range } = buildDefaultDataStudioDateState();
  return {
    year: range.to!.getFullYear(),
    month: 'Month to Date',
    from: formatDateToLocalIso(range.from!),
    to: formatDateToLocalIso(range.to!),
  };
}

// Valid breakdown/filter dimension names per channel type.
// Dimensions not in this list are excluded from the breakdown and filter dropdowns for that channel.
// metasearch: hotel-centric (no Ad Group / Campaign)
// sem: Google/Bing Ads hierarchy (Account → Campaign → Ad Group)
// social: Meta Ads hierarchy (Account → Campaign → Ad Group)
const CHANNEL_DIMENSION_NAMES: Record<string, string[]> = {
  metasearch: ['Hotel', 'Channel', 'Device', 'Link Type', 'Market'],
  sem: ['Account', 'Campaign', 'Ad Group'],
  social: ['Account', 'Campaign', 'Ad Group'],
};

export default function SlideViewPage() {
  const { accountId: urlAccountId, slideId } = useParams<{ accountId?: string; slideId?: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const { data: userData, isLoading: isUserLoading } = useUser();
  const user = userData?.user || null;
  const userLabel = user?.email?.split("@")[0] || user?.email || "user";

  const handleSignOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Sign out failed:", error);
    } finally {
      navigate("/auth", { replace: true });
    }
  }, [navigate]);

  // Resolve account from URL param or from auth context (short-entry route support).
  const { account: resolvedAccount, isLoading: isResolvingAccount } = useUserAccount();
  const accountId = urlAccountId ?? resolvedAccount?.id;

  // If this page is mounted on legacy /tools/reports routes, redirect to an account-scoped
  // URL once resolved. When mounted on index (/), keep the clean URL.
  useEffect(() => {
    const isLegacyReportsEntry =
      location.pathname === "/tools/reports" || location.pathname.startsWith("/tools/reports/");

    if (isLegacyReportsEntry && !urlAccountId && accountId && !isResolvingAccount) {
      navigate(`/tools/reports/${accountId}`, { replace: true });
    }
  }, [urlAccountId, accountId, isResolvingAccount, navigate, location.pathname]);

  // Single-view contract: Data Studio is the only report view now.
  // Any legacy /view/:slideId URL is redirected to /data-studio.
  useEffect(() => {
    if (!accountId) return;
    if (slideId || location.pathname.includes("/view/")) {
      navigate(`/tools/reports`, { replace: true });
    }
  }, [accountId, slideId, location.pathname, navigate]);
  const initialDateState = useMemo(() => buildDefaultDataStudioDateState(), []);

  const [selectedYear, setSelectedYear] = useState(initialDateState.selectedYear);
  const [selectedMonth, setSelectedMonth] = useState(initialDateState.selectedMonth);
  // These are declared here so useSlideReportPage (called below) can receive them.
  // useDataStudioFilters receives them as controlled state so it becomes the single manager.
  const [customDateRange, setCustomDateRange] = useState<import("react-day-picker").DateRange | undefined>(initialDateState.range);
  const [comparisonType, setComparisonType] = useState("none");
  const [filterValues, setFilterValues] = useState<Record<string, Record<string, string[]>>>({
    metasearch: {},
    sem: {},
    social: {},
    'price-check': {},
    booking: {},
  });
  const [selectedTab, setSelectedTab] = useState("overview");
  const [chartMetric, setChartMetric] = useState<ChartMetric>('revenue');
  const [chartGranularity, setChartGranularity] = useState<ChartGranularity>('week');
  const [priceCheckChartTimeRange, setPriceCheckChartTimeRange] = useState<'this_year' | 'last_12_months' | 'last_6_months' | 'last_3_months'>('last_6_months');
  // Per-channel breakdown table dimensions.
  // Defaults: metasearch → Hotel, sem → Account, social → Account.
  // Name hints are resolved to actual IDs by BreakdownTableSection once dimensions load.
  const [groupByDimension, setGroupByDimensionRaw] = useState<Record<string, string>>({
    metasearch: 'hotel', sem: 'account', social: 'account',
  });
  const [breakdownByDimension, setBreakdownByDimensionRaw] = useState<Record<string, string>>({
    metasearch: 'link_type', sem: 'campaign', social: 'campaign',
  });
  const setGroupByDimension = (channel: string, value: string) =>
    setGroupByDimensionRaw(prev => ({ ...prev, [channel]: value }));
  const setBreakdownByDimension = (channel: string, value: string) =>
    setBreakdownByDimensionRaw(prev => ({ ...prev, [channel]: value }));
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null);
  // filterValues, customDateRange, comparisonType are now owned by useDataStudioFilters (below).
  // filterDimensionValues is derived from rawDataRows inside useDataStudioFilters.
  const filterDimensionValues: Record<string, Record<string, string[]>> = { metasearch: {}, sem: {}, social: {} };
  const [isSaveViewDialogOpen, setIsSaveViewDialogOpen] = useState(false);
  const [isSaveOrUpdateViewDialogOpen, setIsSaveOrUpdateViewDialogOpen] = useState(false);
  const isApplyingViewRef = useRef(false); // Track when we're applying a view to avoid triggering "Unsaved"
  const [isReadOnlyMode, setIsReadOnlyMode] = useState(false); // Read-only mode when viewing shared view
  const [isEditSourceOpen, setIsEditSourceOpen] = useState(false);
  const [isDataModalOpen, setIsDataModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  // AI Summary feature removed (full removal)
  const [forecastEnabled, setForecastEnabled] = useState(false); // Forecast mode for budget table
  const [pnlModeEnabled, setPnlModeEnabled] = useState(false); // PnL mode for budget table
  const [editingBudget, setEditingBudget] = useState<{ month: string; channel: string | null } | null>(null); // { month: "November 2025", channel: "metasearch" | "sem" | "social" | null for overview }
  const [editBudgetValue, setEditBudgetValue] = useState("");

  // PnL configuration state - editable per channel
  const [pnlConfig, setPnlConfig] = useState<Record<string, {
    recurrentFee: number;
    percentCost: number;
    percentRevenue: number;
    spender: 'client' | 'agency'
  }>>({
    metasearch: { recurrentFee: 1600, percentCost: 0, percentRevenue: 0, spender: 'client' },
    sem: { recurrentFee: 2000, percentCost: 0, percentRevenue: 5, spender: 'client' },
    social: { recurrentFee: 1800, percentCost: 0, percentRevenue: 0, spender: 'client' },
  });

  // Editing state for PnL fields
  const [editingPnl, setEditingPnl] = useState<{
    month: string;
    channel: string | null;
    field: 'spender' | 'recurrentFee' | 'percentCost' | 'percentRevenue'
  } | null>(null);
  const [editPnlValue, setEditPnlValue] = useState("");
  // Initialize selectedDimensions based on available channels
  // This will be updated when accountReportIds loads
  const [selectedDimensions, setSelectedDimensions] = useState({
    metasearch: false,
    sem: false,
    social: false,
  });

  // Single report view: Data Studio only (master-report and brady routes removed in Phase B)
  const slideType = 'default' as const;
  const isDataStudioRoute = true;

  const [displayCurrency, setDisplayCurrency] = useState<'AUD' | 'USD'>('AUD');
  const audPerUsd = 1;

  // Dynamic data state (fetched from database)
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dynamicMonthlyData, setDynamicMonthlyData] = useState<any[]>([]);
  const [dynamicYearlyTotals, setDynamicYearlyTotals] = useState<Record<number, Record<string, any>>>({});


  // Check for share authentication when user is not authenticated
  const [isSharedAccess, setIsSharedAccess] = useState(false);

  // breakdownDimensions must be declared before useSlideReportPage so configuredDimensionNames
  // can be passed through to useFilteredSlideData for global-ID → report-specific-ID resolution.
  const [breakdownDimensions, setBreakdownDimensions] = useState<Record<string, Dimension[]>>({
    metasearch: [],
    sem: [],
    social: [],
  });

  const configuredDimensionNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const dims of Object.values(breakdownDimensions)) {
      for (const d of dims) {
        if (d.id && d.name) map[d.id] = d.name;
      }
    }
    return map;
  }, [breakdownDimensions]);

  // Single hook for report page: report data, display data, views, summaries, mutations, account IDs, budgets, monthly data
  const reportPage = useSlideReportPage({
    accountId,
    user,
    slideType,
    filterValues,
    filterDimensionValues,
    selectedYear,
    selectedMonth,
    customDateRange,
    selectedTab,
    comparisonType,
    groupByDimensionId: groupByDimension[selectedTab] || groupByDimension['metasearch'],
    breakdownByDimensionId: breakdownByDimension[selectedTab] || breakdownByDimension['metasearch'],
    selectedViewId,
    displayCurrency: undefined,
    audPerUsd,
    configuredDimensionNames,
  });
  const {
    slideReportId,
    setSlideReportId,
    slideReport,
    effectivePivotData,
    filteredData,
    views,
    // summaries removed in Phase B
    monthlyDataRecords,
    viewBudgets,
    accountReportIds,
    getReportIdForChannel,
    availableChannels,
    isSlideReportsLoading,
    isLoadingViews,
    isLoadingViewBudgets,
    isLoadingMonthlyData,
    isLoadingRawRows,
    isFetchingRawRows,
    createSlideReport,
    updateSlideReport,
    createView,
    updateView,
    deleteView,
  } = reportPage;
  const queryClient = useQueryClient();

  // ── Canonical Data Studio filter state ───────────────────────────────────────
  // Derive initial filter config from the loaded slide report.
  const initialFilterConfigs: FilterConfigs = useMemo(() => {
    const cfg = slideReport?.configuration;
    return {
      metasearch: { filterDimensionIds: cfg?.filterConfigs?.metasearch?.filterDimensionIds ?? [] },
      sem: { filterDimensionIds: cfg?.filterConfigs?.sem?.filterDimensionIds ?? [] },
      social: { filterDimensionIds: cfg?.filterConfigs?.social?.filterDimensionIds ?? [] },
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideReport?.configuration?.filterConfigs?.metasearch?.filterDimensionIds?.join(','),
      slideReport?.configuration?.filterConfigs?.sem?.filterDimensionIds?.join(','),
      slideReport?.configuration?.filterConfigs?.social?.filterDimensionIds?.join(',')]);

  const persistFilterConfigs = useCallback(async (next: FilterConfigs) => {
    if (!slideReportId || !user) return;
    const prevConfig = (slideReport?.configuration || {}) as any;
    const configuration = {
      ...prevConfig,
      filterConfigs: {
        ...(prevConfig.filterConfigs || {}),
        metasearch: { filterDimensionIds: next.metasearch.filterDimensionIds },
        sem: { filterDimensionIds: next.sem.filterDimensionIds },
        social: { filterDimensionIds: next.social.filterDimensionIds },
      },
    };
    try {
      await updateSlideReport.mutateAsync({ id: slideReportId, configuration } as any);
      toast({ title: 'Filter settings saved' });
    } catch {
      toast({ title: 'Failed to save filter settings', variant: 'destructive' });
    }
  }, [slideReportId, slideReport?.configuration, updateSlideReport, user]);

  const dsFilters = useDataStudioFilters({
    effectivePivotData: effectivePivotData as any,
    initialFilterConfigs,
    onPersistFilterConfigs: persistFilterConfigs,
    views,
    isReadOnly: isReadOnlyMode,
    // Pass externally-declared state so useSlideReportPage keeps working.
    externalFilterValues: filterValues,
    setExternalFilterValues: setFilterValues as any,
    externalCustomDateRange: customDateRange,
    setExternalCustomDateRange: setCustomDateRange,
    externalComparisonType: comparisonType,
    setExternalComparisonType: setComparisonType,
    selectedYear,
    setSelectedYear,
    selectedMonth,
    setSelectedMonth,
    configuredDimensionNames,
  });

  // Expose dsFilters.filterConfigs as a local alias.
  // setFilterConfigs only updates local state — does NOT persist to DB.
  // Use dsFilters.persistFilterConfigs() to both update state AND write to DB.
  const filterConfigs = dsFilters.filterConfigs;
  const setFilterConfigs = useCallback((v: Record<string, { filterDimensionIds: string[] }>) => {
    dsFilters.setFilterConfigs(v as FilterConfigs);
  }, [dsFilters]);

  // Unified handler for date popover Apply — single commit path for date + compare changes.
  const handleDateApply = useCallback((payload: {
    range: import("react-day-picker").DateRange | undefined;
    preset: string;
    compareEnabled: boolean;
    compareType: string;
  }) => {
    if (payload.preset === 'all_time') {
      dsFilters.setCustomDateRange(undefined);
      setSelectedYear('all');
      setSelectedMonth('all');
      dsFilters.setComparisonType('none');
    } else {
      dsFilters.setCustomDateRange(payload.range);
    }
    dsFilters.setComparisonType(payload.compareEnabled ? payload.compareType : 'none');
  }, [dsFilters, setSelectedYear, setSelectedMonth]);

  // Data Studio: show cached data immediately, then background-refresh from sources
  const isDataStudio = isDataStudioRoute || slideReport?.name === 'Data Studio';
  const [isDataStudioLoading, setIsDataStudioLoading] = useState(false);
  const [dataStudioRefreshStatus, setDataStudioRefreshStatus] = useState<'idle' | 'refreshing' | 'done' | 'error'>('idle');
  const dataStudioLoadDoneRef = useRef(false);

  // Data Studio: use cached data on page load — no auto-refresh from source.
  // The "Refresh Data" button triggers the full resync + pivot recompute.
  

  // Auto-open removed: report is auto-configured from data sources on first load

  // Sync selectedDimensions from accountReportIds when no saved config yet
  useEffect(() => {
    if (!accountId) {
      setSelectedDimensions({ metasearch: false, sem: false, social: false });
      return;
    }
    const hasSavedConfig = slideReport?.configuration?.selectedChannels;
    if (hasSavedConfig) return;
    setSelectedDimensions({
      metasearch: !!accountReportIds.metasearch,
      sem: !!accountReportIds.sem,
      social: !!accountReportIds.social,
    });
  }, [accountId, accountReportIds.metasearch, accountReportIds.sem, accountReportIds.social, slideReport?.configuration?.selectedChannels]);

  // Auto-configure the slide report when it has no saved configuration and accountReportIds has loaded.
  // This runs once per report load and saves a default configuration so the user doesn't need to
  // manually open the configure modal. All available channels are selected; dimensions and filters
  // are populated from the global dimensions table.
  const autoConfiguredRef = useRef<string | null>(null);
  useEffect(() => {
    const autoConfigureReport = async () => {
      if (!accountId || !user || !slideReportId) return;
      if (!accountReportIds.metasearch && !accountReportIds.sem && !accountReportIds.social) return;

      // Only auto-configure if there's no saved configuration
      const hasSavedConfig = slideReport?.configuration?.selectedChannels?.length;
      if (hasSavedConfig) return;

      // Prevent running twice for the same report
      if (autoConfiguredRef.current === slideReportId) return;
      autoConfiguredRef.current = slideReportId;

      try {
        // Load global dimensions (all types) to build default configs
        const { data: allDims } = await supabase
          .from('dimensions')
          .select('id, name, type')
          .eq('scope', 'global')
          .order('name');

        const dims = allDims || [];
        const valueDimIds = dims
          .filter(d => ['number', 'currency', 'percentage'].includes(d.type))
          .map(d => d.id);
        const textDims = dims.filter(d => d.type === 'string' || d.type === 'text');

        const validChannels: ('metasearch' | 'sem' | 'social')[] = [];
        const reportIds: Record<string, string> = {};
        if (accountReportIds.metasearch) { validChannels.push('metasearch'); reportIds.metasearch = accountReportIds.metasearch; }
        if (accountReportIds.sem) { validChannels.push('sem'); reportIds.sem = accountReportIds.sem; }
        if (accountReportIds.social) { validChannels.push('social'); reportIds.social = accountReportIds.social; }

        if (validChannels.length === 0) return;

        const channelConfigs: Record<string, { dimensionId: string | null; selectedValues: string[] }> = {};
        const breakdownConfigsAuto: Record<string, { breakdownDimensionIds: string[] }> = {};
        const filterConfigsAuto: Record<string, { filterDimensionIds: string[] }> = {};

        for (const ch of validChannels) {
          const validNames = new Set((CHANNEL_DIMENSION_NAMES[ch] || []).map(n => n.toLowerCase()));
          const channelTextDimIds = validNames.size > 0
            ? textDims.filter(d => validNames.has(d.name.toLowerCase())).map(d => d.id)
            : textDims.map(d => d.id);
          channelConfigs[ch] = { dimensionId: null, selectedValues: [] };
          breakdownConfigsAuto[ch] = { breakdownDimensionIds: channelTextDimIds };
          filterConfigsAuto[ch] = { filterDimensionIds: channelTextDimIds };
        }

        const configuration: SlideReportConfiguration = {
          selectedChannels: validChannels,
          selectedValueDimensionIds: valueDimIds,
          channelConfigs,
          breakdownConfigs: breakdownConfigsAuto,
          filterConfigs: filterConfigsAuto,
        };

        const dateRange = buildDefaultSlideReportDateRange();

        await updateSlideReport.mutateAsync({
          id: slideReportId,
          configuration,
          report_ids: reportIds,
          date_range: dateRange,
        });

        // Update local state to reflect auto-configured channels
        setSelectedDimensions({
          metasearch: !!accountReportIds.metasearch,
          sem: !!accountReportIds.sem,
          social: !!accountReportIds.social,
        });
        if (valueDimIds.length > 0) setSelectedValueDimensionIds(valueDimIds);
      } catch (err) {
        console.error('[AutoConfigure] Failed to auto-configure report:', err);
        // Non-fatal — user can still configure manually
      }
    };

    autoConfigureReport();
  }, [accountId, user, slideReportId, accountReportIds.metasearch, accountReportIds.sem, accountReportIds.social, slideReport?.configuration?.selectedChannels]);

  // Check for share authentication when user is not authenticated (moved after slideReportId declaration)
  useEffect(() => {
    if (isUserLoading) return;

    if (!user) {
      // Check if we're accessing via a share link
      const isShared = searchParams.get('shared') === 'true';
      const slug = searchParams.get('slug');

      if (isShared && slug) {
        // Check if share authentication exists in sessionStorage
        const authKey = `share_auth_${slug}`;
        const shareAuth = sessionStorage.getItem(authKey);

        if (shareAuth === "true") {
          setIsSharedAccess(true);

          // Load filters from share link if available
          const filtersKey = `share_filters_${slug}`;
          const storedFilters = sessionStorage.getItem(filtersKey);
          if (storedFilters) {
            try {
              const channelFilters = JSON.parse(storedFilters);
              // Apply filters immediately
              setFilterValues(channelFilters);
              console.log('[testing] Applied filters from share link:', channelFilters);
            } catch (error) {
              console.error('[testing] Error parsing share link filters:', error);
            }
          }

          // Load slide_report_id and account_id from share link if available
          const storedSlideReportId = sessionStorage.getItem(`share_slide_report_id_${slug}`);
          const storedAccountId = sessionStorage.getItem(`share_account_id_${slug}`);

          if (storedSlideReportId && storedAccountId) {
            // Set slide report ID if not already set
            if (!slideReportId) {
              setSlideReportId(storedSlideReportId);
            }
            // Verify accountId matches
            if (accountId !== storedAccountId) {
              console.warn('[testing] Account ID mismatch:', { accountId, storedAccountId });
            }
          }
        } else {
          // No share auth found, redirect to public share route (not /:slug alone — that collides with app paths)
          navigate(`/shared/${slug}`, { replace: true });
        }
      }
    } else {
      setIsSharedAccess(false);
    }
  }, [user, isUserLoading, searchParams, navigate, slideReportId, accountId]);

  // Check for viewId in URL params or share link on mount and when views load
  // Also check if we're accessing via a share link (shared=true)
  useEffect(() => {
    const isShared = searchParams.get('shared') === 'true';
    const slug = searchParams.get('slug');

    // If accessing via share link, enable read-only mode
    if (isShared && slug) {
      setIsReadOnlyMode(true);

      // Load filters from share link if not already loaded
      const filtersKey = `share_filters_${slug}`;
      const storedFilters = sessionStorage.getItem(filtersKey);
      if (storedFilters) {
        try {
          const channelFilters = JSON.parse(storedFilters);
          setFilterValues(channelFilters);
        } catch (error) {
          console.error('[testing] Error parsing share link filters:', error);
        }
      }

      // Legacy: Check for view_id from share link (backward compatibility)
      const shareViewId = sessionStorage.getItem(`share_view_id_${slideReportId}`);
      if (shareViewId && views.length > 0) {
        const view = views.find(v => v.id === shareViewId);
        if (view) {
          setSelectedViewId(shareViewId);
          handleApplyView(shareViewId);
          // Clear the session storage after using it
          sessionStorage.removeItem(`share_view_id_${slideReportId}`);
        }
      }
      return;
    }

    // Regular view handling (not from share link)
    const urlViewId = searchParams.get('viewId');
    const shareViewId = sessionStorage.getItem(`share_view_id_${slideReportId}`);
    const viewIdToUse = urlViewId || shareViewId;

    if (viewIdToUse && views.length > 0) {
      // Check if viewId exists in views
      const view = views.find(v => v.id === viewIdToUse);
      if (view) {
        // Apply the view (do NOT enable read-only mode for regular views)
        if (isReadOnlyMode) setIsReadOnlyMode(false);
        setSelectedViewId(viewIdToUse);
        if (selectedViewId !== viewIdToUse) {
          handleApplyView(viewIdToUse);
        }

        // Clear the session storage after using it
        if (shareViewId) {
          sessionStorage.removeItem(`share_view_id_${slideReportId}`);
        }
      } else {
        // View not found, remove from URL and session storage
        if (urlViewId) {
          const newParams = new URLSearchParams(searchParams);
          newParams.delete('viewId');
          setSearchParams(newParams, { replace: true });
        }
        if (shareViewId) {
          sessionStorage.removeItem(`share_view_id_${slideReportId}`);
        }
      }
    } else if (!viewIdToUse && isReadOnlyMode && !isShared) {
      // If viewId is removed from URL and not from share link, disable read-only mode
      setIsReadOnlyMode(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, views.length, isReadOnlyMode, slideReportId, selectedViewId]);

  // monthlyDataRecords, isLoadingMonthlyData from reportPage

  // filteredData comes from reportPage (useSlideReportPage)

  // isFetchingRawRows is true on first load AND on every date-change refetch (React Query isFetching).
  // isLoadingRawRows is only true on first load (no cached data yet).
  // Using isFetchingRawRows ensures the dim animation fires on date changes too.
  const isLoadingSlideContent = isFetchingRawRows;

  // Filter monthly data - now uses unified filteredData hook
  // Fallback to dynamicMonthlyData if no pivot data
  const filteredMonthlyData = useMemo(() => {
    // Use filtered data from hook (single source of truth)
    if (filteredData.monthlyData.length > 0) {
      return filteredData.monthlyData;
    }

    const sourceData = dynamicMonthlyData.length > 0 ? dynamicMonthlyData : [];

    if (selectedYear === 'all') {
      return sourceData;
    }
    return sourceData.filter(m => m.year === parseInt(selectedYear));
  }, [filteredData.monthlyData, dynamicMonthlyData, selectedYear]);


  const chartDateRange = useMemo(() => {
    if (customDateRange?.from) {
      return exactDateRangeFromDayPicker(customDateRange);
    }
    return buildMultiMonthDateRange(selectedYear, selectedMonth);
  }, [customDateRange, selectedYear, selectedMonth]);

  const comparisonChartDateRange = useMemo(() => {
    if (comparisonType === 'none' || !chartDateRange) return undefined;
    if (customDateRange?.from) {
      const exactRange = exactDateRangeFromDayPicker(customDateRange);
      if (!exactRange) return undefined;
      return buildComparisonDateRangeFromExact(
        { from: exactRange.start, to: exactRange.end },
        comparisonType as 'previous_period' | 'previous_year'
      );
    }
    return buildComparisonDateRange(
      selectedYear,
      selectedMonth,
      comparisonType as 'none' | 'previous_period' | 'previous_year'
    );
  }, [comparisonType, chartDateRange, customDateRange, selectedYear, selectedMonth]);

  // Extract rawRows and dimensionMaps from effectivePivotData for chart computation
  const chartRawRows = useMemo(() => {
    if (!effectivePivotData?.channels) return {};
    const result: Record<string, any[]> = {};
    for (const [ch, chData] of Object.entries(effectivePivotData.channels)) {
      result[ch] = (chData as any).rawDataRows || [];
    }
    return result;
  }, [effectivePivotData]);

  const chartDimensionMaps = useMemo(() => {
    if (!effectivePivotData?.channels) return {};
    const result: Record<string, Record<string, string>> = {};
    for (const [ch, chData] of Object.entries(effectivePivotData.channels)) {
      result[ch] = (chData as any).dimensionMap || {};
    }
    return result;
  }, [effectivePivotData]);

  // Canonical chart path: bucket raw rows inside the top date filter range.
  const { data: channelChartDataFromTable, overviewData: overviewChartDataFromTable } = useChannelChartDataFromRawRows(
    chartRawRows,
    chartDimensionMaps,
    chartDateRange,
    chartGranularity,
    chartMetric,
    filterValues,
    configuredDimensionNames
  );

  const { data: comparisonChannelChartDataFromTable } = useChannelChartDataFromRawRows(
    comparisonType !== 'none' && comparisonChartDateRange ? chartRawRows : undefined,
    chartDimensionMaps,
    comparisonChartDateRange,
    chartGranularity,
    chartMetric,
    filterValues,
    configuredDimensionNames
  );

  const effectiveOverviewChartData = useMemo(() => {
    return overviewChartDataFromTable ?? [];
  }, [overviewChartDataFromTable]);

  const effectiveChannelChartData = useMemo(() => {
    return channelChartDataFromTable ?? { metasearch: [], sem: [], social: [] };
  }, [channelChartDataFromTable]);

  const comparisonOverviewChartData = useMemo((): Array<{ label: string; value: number }> | null => {
    if (comparisonType === 'none') return null;
    if (!comparisonChannelChartDataFromTable) return null;
    const metasearch = comparisonChannelChartDataFromTable.metasearch ?? [];
    const sem = comparisonChannelChartDataFromTable.sem ?? [];
    const social = comparisonChannelChartDataFromTable.social ?? [];
    const len = Math.max(metasearch.length, sem.length, social.length);
    if (len === 0) return null;

    const result: Array<{ label: string; value: number }> = [];
    for (let i = 0; i < len; i++) {
      const label = metasearch[i]?.label ?? sem[i]?.label ?? social[i]?.label ?? '';
      const value = (metasearch[i]?.value ?? 0) + (sem[i]?.value ?? 0) + (social[i]?.value ?? 0);
      result.push({ label, value });
    }
    return result;
  }, [comparisonType, comparisonChannelChartDataFromTable]);

  const comparisonEffectiveChannelChartData = useMemo(() => {
    if (comparisonType === 'none') return null;
    return comparisonChannelChartDataFromTable ?? null;
  }, [comparisonType, comparisonChannelChartDataFromTable]);

  // Get channel totals from monthly_data table (same source as SlideDataBrowser)
  // This is the correct source of truth for the data
  const monthlyDataTotals = useMemo(() => {
    const channelTotals: Record<string, {
      impressions: number;
      clicks: number;
      cost: number;
      revenue: number;
      bookings: number;
    }> = {
      metasearch: { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 },
      sem: { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 },
      social: { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 },
    };

    if (monthlyDataRecords.length === 0) {
      return channelTotals;
    }

    // Filter records based on selected year/month
    let filteredRecords = monthlyDataRecords;

    if (selectedYear !== 'all') {
      const yearNum = parseInt(selectedYear);
      filteredRecords = filteredRecords.filter(r => r.year === yearNum);
    }

    if (selectedMonth !== 'all') {
      const months = selectedMonth.split(',').map(m => MONTH_NAMES.indexOf(m.trim()) + 1).filter(n => n > 0);
      if (months.length > 0) {
        filteredRecords = filteredRecords.filter(r => months.includes(r.month));
      }
    }

    // Aggregate metrics by channel
    filteredRecords.forEach(record => {
      const channel = record.channel.toLowerCase();
      if (channelTotals[channel] && record.metrics) {
        const metrics = record.metrics;
        channelTotals[channel].impressions += metrics.impressions || 0;
        channelTotals[channel].clicks += metrics.clicks || 0;
        channelTotals[channel].cost += metrics.cost || 0;
        channelTotals[channel].revenue += metrics.revenue || 0;
        channelTotals[channel].bookings += metrics.bookings || 0;
      }
    });

    return channelTotals;
  }, [monthlyDataRecords, selectedYear, selectedMonth]);

  // Get channel metrics using hook
  // Get comparison totals from useChannelMetrics hook (handles comparison period filtering)
  const { comparisonTotals: hookComparisonTotals } = useChannelMetrics({
    pivotData: effectivePivotData,
    selectedYear,
    selectedMonth,
    filterValues,
    filterDimensionValues,
    slideType,
    comparisonType: comparisonType as 'none' | 'previous_period' | 'previous_year',
    customDateRange,
  });

  // Get current totals - uses unified filteredData hook (single source of truth)
  const currentTotals = filteredData.channelTotals;

  // Comparison totals come exclusively from useChannelMetrics (rawDataRows-based, date-filtered).
  const comparisonTotals = hookComparisonTotals ?? null;

  // Load data from stored pivot_data when slideReport changes (uses channel data from tables when available)
  useEffect(() => {
    if (effectivePivotData) {
      const pivotData = effectivePivotData;

      // Build monthly data with per-channel breakdown
      const monthlyDataMap: Record<string, any> = {};
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

      // First, load overview monthly data as base
      if (pivotData.overview?.monthly) {
        Object.entries(pivotData.overview.monthly).forEach(([key, metrics]: [string, any]) => {
          const [year, monthNum] = key.split('-');
          const monthName = monthNames[parseInt(monthNum) - 1];
          monthlyDataMap[key] = {
            month: monthName,
            year: parseInt(year),
            revenue: metrics.revenue || 0,
            cost: metrics.cost || 0,
            impressions: metrics.impressions || 0,
            clicks: metrics.clicks || 0,
            bookings: metrics.bookings || 0,
            metasearch: 0,
            sem: 0,
            social: 0,
          };
        });
      }

      // Then, load channel-specific monthly data from channels[channel].monthly
      if (pivotData.channels) {
        for (const [channel, channelData] of Object.entries(pivotData.channels)) {
          const channelMonthly = (channelData as any).monthly;
          if (channelMonthly) {
            Object.entries(channelMonthly).forEach(([key, metrics]: [string, any]) => {
              if (!monthlyDataMap[key]) {
                const [year, monthNum] = key.split('-');
                const monthName = monthNames[parseInt(monthNum) - 1];
                monthlyDataMap[key] = {
                  month: monthName,
                  year: parseInt(year),
                  revenue: 0,
                  cost: 0,
                  impressions: 0,
                  clicks: 0,
                  bookings: 0,
                  metasearch: 0,
                  sem: 0,
                  social: 0,
                };
              }
              // Store channel-specific revenue
              monthlyDataMap[key][channel] = (metrics as any).revenue || 0;
            });
          }
        }
      }

      // Convert to array and sort
      const monthlyRevenue = Object.values(monthlyDataMap).sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return MONTH_NAMES.indexOf(a.month) - MONTH_NAMES.indexOf(b.month);
      });

      if (monthlyRevenue.length > 0) {
        setDynamicMonthlyData(monthlyRevenue);
      }

      // Load yearly totals
      if (pivotData.channels) {
        const yearlyTotals: Record<number, Record<string, any>> = {};
        for (const year of [2024, 2025, 2026]) {
          yearlyTotals[year] = {};
          for (const [channel, channelData] of Object.entries(pivotData.channels)) {
            const yearly = (channelData as any).yearly;
            if (yearly?.[String(year)]) {
              yearlyTotals[year][channel] = yearly[String(year)];
            }
          }
        }
        if (Object.values(yearlyTotals).some(y => Object.keys(y).length > 0)) {
          setDynamicYearlyTotals(yearlyTotals);
        }
      }
    }
  }, [effectivePivotData]);

  // Keep local state in sync with slideReport.configuration (and date range when report first loads)
  const lastSyncedSlideReportIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!slideReport || !slideReportId) return;
    const config = slideReport.configuration;
    if (config) {
      const filteredFilterConfigs: Record<string, FilterConfig> = {};
      const filteredBreakdownConfigs: Record<string, BreakdownConfig> = {};
      const filteredChannelConfigs: Record<string, ChannelConfig> = {};
      for (const channel of availableChannels) {
        if (config.filterConfigs?.[channel]) {
          filteredFilterConfigs[channel] = config.filterConfigs[channel];
        }
        if (config.breakdownConfigs?.[channel]) {
          filteredBreakdownConfigs[channel] = config.breakdownConfigs[channel];
        }
        if (config.channelConfigs?.[channel]) {
          filteredChannelConfigs[channel] = config.channelConfigs[channel];
        }
      }
      setFilterConfigs(filteredFilterConfigs);
      setBreakdownConfigs(filteredBreakdownConfigs);
      setChannelConfigs(filteredChannelConfigs);
      if (config.selectedChannels) {
        // Restore directly from the saved config — do NOT filter by availableChannels here.
        // availableChannels may not be resolved yet when this effect first runs (accountReportIds
        // is still loading), which would incorrectly zero-out all channels.
        // The selectedChannels memo already gates on accountReportIds, so stale IDs are safe.
        setSelectedDimensions({
          metasearch: config.selectedChannels.includes('metasearch'),
          sem: config.selectedChannels.includes('sem'),
          social: config.selectedChannels.includes('social'),
        });
      }
      if (config.selectedValueDimensionIds) {
        setSelectedValueDimensionIds(config.selectedValueDimensionIds);
      }
    }
    const isNewReport = lastSyncedSlideReportIdRef.current !== slideReportId;
    if (isNewReport) {
      lastSyncedSlideReportIdRef.current = slideReportId;
      const defaultDateState = buildDefaultDataStudioDateState();
      setSelectedYear(defaultDateState.selectedYear);
      setSelectedMonth(defaultDateState.selectedMonth);
      setCustomDateRange(defaultDateState.range);
    }
  }, [slideReport, slideReportId, availableChannels]);

  // Filter option loading is now handled by useDataStudioFilters (derived from rawDataRows in memory).

  // Tab-switch filter option loading is now handled by useDataStudioFilters (rawDataRows in memory).

  // Open modal if ?edit=true in URL
  useEffect(() => {
    if (searchParams.get('edit') === 'true') {
      setIsEditSourceOpen(true);
      setSearchParams({}, { replace: true }); // Remove the query param
    }
  }, [searchParams, setSearchParams]);

  // Step-by-step modal state (5 steps: Channels, Value Dimensions, Data Source, Breakdown, Filters)
  type ModalStep = 1 | 2 | 3 | 4 | 5;
  const [modalStep, setModalStep] = useState<ModalStep>(1);
  const [activeChannelTab, setActiveChannelTab] = useState<'metasearch' | 'sem' | 'social' | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Account-specific report IDs are loaded via getAccountReportIds and stored in accountReportIds state
  // Value dimension IDs state (for step 1 - applies to all channels)

  // Available dimensions per channel (fetched from database) - VALUE types only
  const [availableDimensions, setAvailableDimensions] = useState<Record<string, { id: string; name: string; type: string }[]>>({
    metasearch: [],
    sem: [],
    social: [],
  });
  const [loadingAvailableDimensions, setLoadingAvailableDimensions] = useState(false);

  // Dynamically extract all VALUE dimension IDs from availableDimensions
  // Falls back to empty array if dimensions aren't loaded yet
  const allAvailableValueDimensionIds = useMemo(() => {
    const allIds = new Set<string>();
    Object.values(availableDimensions).forEach(channelDims => {
      channelDims.forEach(dim => {
        // Only include VALUE type dimensions (number, currency, percentage)
        if (['number', 'currency', 'percentage'].includes(dim.type)) {
          allIds.add(dim.id);
        }
      });
    });
    return Array.from(allIds);
  }, [availableDimensions]);

  // Fallback hardcoded dimension IDs (only used if dimensions aren't loaded yet)
  // These are kept as a last resort fallback for Brady Hotels reports
  const FALLBACK_DIMENSION_IDS = [
    '89c229d9-8a6e-4d94-a0d2-a4b43b6f3fe1', // Impressions
    '1caad3eb-3d5e-405c-9df7-1c96971171c5', // Clicks
    'fb281b3f-c800-48f4-b34b-02d4f0244b07', // Cost
    '7f4cb2e9-52a3-4110-803a-58d2e7afacb5', // Revenue
    '79aeb7f7-a9c6-43cd-bd05-ff7df81babf1', // Bookings
    '8962dff5-bb0f-4ab1-ace7-e5dc5eb4fdcc', // CPC
    '3486d423-f75c-402e-8fb2-285b6e7e22ec', // Cost of sale
    'bfde7232-89ab-46ba-80ed-015a4d73bae5', // Impression Share
    'bbe9b05b-7485-4eb3-a3cc-d04f05823f63', // Leads
    'ff046f06-10ee-4420-a02f-d4089e5f75a6', // CTR
  ];

  // Use dynamic dimensions if available, otherwise fallback to hardcoded IDs
  const defaultValueDimensionIds = useMemo(() => {
    return allAvailableValueDimensionIds.length > 0
      ? allAvailableValueDimensionIds
      : FALLBACK_DIMENSION_IDS;
  }, [allAvailableValueDimensionIds]);

  const [selectedValueDimensionIds, setSelectedValueDimensionIds] = useState<string[]>([]);

  // Channel configuration state
  interface ChannelConfig {
    dimensionId: string | null;
    selectedValues: string[];
  }
  const [channelConfigs, setChannelConfigs] = useState<Record<string, ChannelConfig>>({
    metasearch: { dimensionId: null, selectedValues: [] },
    sem: { dimensionId: null, selectedValues: [] },
    social: { dimensionId: null, selectedValues: [] },
  });

  // Breakdown configuration state
  interface BreakdownConfig {
    breakdownDimensionIds: string[];
  }

  const [breakdownConfigs, setBreakdownConfigs] = useState<Record<string, BreakdownConfig>>({
    metasearch: { breakdownDimensionIds: [] },
    sem: { breakdownDimensionIds: [] },
    social: { breakdownDimensionIds: [] },
  });

  // Filter configuration state — initially empty, populated once slideReport loads (see effect below)
  interface FilterConfig {
    filterDimensionIds: string[];
  }

  const [dimensionSettingsOpen, setDimensionSettingsOpen] = useState(false);
  const [dimensionSettingsMode, setDimensionSettingsMode] = useState<DimensionSettingsMode>("filters");
  const [dimensionSettingsInitialChannel, setDimensionSettingsInitialChannel] = useState<"metasearch" | "sem" | "social">("metasearch");

  const dimensionSettingsValue: DimensionSettingsModalValue = useMemo(() => ({
    filtersByChannel: {
      metasearch: filterConfigs.metasearch?.filterDimensionIds || [],
      sem: filterConfigs.sem?.filterDimensionIds || [],
      social: filterConfigs.social?.filterDimensionIds || [],
    },
    breakdownsByChannel: {
      metasearch: breakdownConfigs.metasearch?.breakdownDimensionIds || [],
      sem: breakdownConfigs.sem?.breakdownDimensionIds || [],
      social: breakdownConfigs.social?.breakdownDimensionIds || [],
    },
  }), [filterConfigs, breakdownConfigs]);

  const persistDimensionSettings = useCallback(async (next: DimensionSettingsModalValue) => {
    const nextFilterConfigs: import('@/hooks/useDataStudioFilters').FilterConfigs = {
      metasearch: { filterDimensionIds: next.filtersByChannel.metasearch || [] },
      sem: { filterDimensionIds: next.filtersByChannel.sem || [] },
      social: { filterDimensionIds: next.filtersByChannel.social || [] },
    };
    // Update local state only — this function handles its own DB write below.
    dsFilters.setFilterConfigs(nextFilterConfigs);

    setBreakdownConfigs((prev) => ({
      ...prev,
      metasearch: { breakdownDimensionIds: next.breakdownsByChannel.metasearch || [] },
      sem: { breakdownDimensionIds: next.breakdownsByChannel.sem || [] },
      social: { breakdownDimensionIds: next.breakdownsByChannel.social || [] },
    }));

    if (!slideReportId || !user) return;
    const prevConfig = (slideReport?.configuration || {}) as any;
    const configuration = {
      ...prevConfig,
      filterConfigs: {
        ...(prevConfig.filterConfigs || {}),
        ...Object.fromEntries(
          Object.entries(nextFilterConfigs).map(([k, v]) => [k, v])
        ),
      },
      breakdownConfigs: {
        ...(prevConfig.breakdownConfigs || {}),
        metasearch: { breakdownDimensionIds: next.breakdownsByChannel.metasearch || [] },
        sem: { breakdownDimensionIds: next.breakdownsByChannel.sem || [] },
        social: { breakdownDimensionIds: next.breakdownsByChannel.social || [] },
      },
    };
    try {
      await updateSlideReport.mutateAsync({ id: slideReportId, configuration } as any);
      toast({ title: 'Settings saved', description: 'Breakdown and filter dimension settings have been saved.' });
    } catch {
      toast({ title: 'Failed to save', description: 'Could not save dimension settings.', variant: 'destructive' });
    }
  }, [slideReportId, slideReport?.configuration, updateSlideReport, user, dsFilters, setBreakdownConfigs]);

  // Dimension and value loading state
  interface Dimension {
    id: string;
    name: string;
    type: string;
  }
  const [dimensions, setDimensions] = useState<Record<string, Dimension[]>>({
    metasearch: [],
    sem: [],
    social: [],
  });
  const [dimensionValues, setDimensionValues] = useState<Record<string, string[]>>({
    metasearch: [],
    sem: [],
    social: [],
  });
  const [loadingDimensions, setLoadingDimensions] = useState<Record<string, boolean>>({
    metasearch: false,
    sem: false,
    social: false,
  });
  const [loadingValues, setLoadingValues] = useState<Record<string, boolean>>({
    metasearch: false,
    sem: false,
    social: false,
  });

  // Refresh Data Modal state - 5 steps now
  const [isRefreshModalOpen, setIsRefreshModalOpen] = useState(false);
  const [refreshStep, setRefreshStep] = useState(0); // 0 = not started, 1-5 = steps
  const [refreshStepStatus, setRefreshStepStatus] = useState<Record<number, 'pending' | 'loading' | 'complete' | 'error'>>({
    0: 'pending',
    1: 'pending',
    2: 'pending',
    3: 'pending',
    4: 'pending',
    5: 'pending',
  });
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [activeRefreshMode, setActiveRefreshMode] = useState<'full' | 'recent'>('full');
  const [refreshRowsProcessed, setRefreshRowsProcessed] = useState<number | null>(null);
  // True only after user explicitly clicks "Start Refresh" in the modal — gates the refresh useEffect.
  const [refreshPending, setRefreshPending] = useState(false);

  const [loadingBreakdownDimensions, setLoadingBreakdownDimensions] = useState<Record<string, boolean>>({
    metasearch: false,
    sem: false,
    social: false,
  });

  // Load breakdown dimensions for a channel — queries account-scoped text dimensions directly.
  // Falls back to column_mappings-based lookup if no account dimensions found.
  const loadBreakdownDimensionsForChannel = async (channel: 'metasearch' | 'sem' | 'social') => {
    setLoadingBreakdownDimensions(prev => ({ ...prev, [channel]: true }));
    try {
      const reportId = getReportIdForChannel(channel);
      if (!reportId) {
        console.warn(`[loadBreakdownDimensionsForChannel] No report ID for channel: ${channel}`);
        setBreakdownDimensions(prev => ({ ...prev, [channel]: [] }));
        return;
      }

      // Resolve account ID for this report
      const { data: reportData } = await supabase
        .from('reports')
        .select('account_id')
        .eq('id', reportId)
        .maybeSingle();

      const resolvedAccountId = reportData?.account_id || accountId;

      // Only show dimensions that are valid for this channel type.
      const channelDimNames = (CHANNEL_DIMENSION_NAMES[channel] || []).map((n) => n.toLowerCase());
      const filterToChannel = (dims: { id: string; name: string; type: string }[]) =>
        channelDimNames.length > 0
          ? dims.filter((d) => channelDimNames.includes(d.name.toLowerCase()))
          : dims;

      // Primary path: query account-scoped text dimensions directly (matches dimension_data keys)
      if (resolvedAccountId) {
        const { data: accountDims, error: accountDimError } = await supabase
          .from('dimensions')
          .select('id, name, type')
          .eq('scope', 'account')
          .eq('account_id', resolvedAccountId)
          .eq('type', 'text')
          .order('name');

        if (!accountDimError && accountDims && accountDims.length > 0) {
          setBreakdownDimensions(prev => ({ ...prev, [channel]: filterToChannel(accountDims) }));
          return;
        }
      }

      // Fallback: extract dimension IDs from column_mappings and fetch their details
      const { data: dsData } = await supabase
        .from('data_sources')
        .select('column_mappings')
        .eq('report_id', reportId)
        .limit(1)
        .maybeSingle();

      const columnMappings = Array.isArray(dsData?.column_mappings) ? dsData.column_mappings : [];
      const dimensionIds = columnMappings
        .filter((m: any) => m.dimensionId && m.dimensionId !== 'none' && m.dimensionId !== null)
        .map((m: any) => m.dimensionId);

      if (dimensionIds.length === 0) {
        setBreakdownDimensions(prev => ({ ...prev, [channel]: [] }));
        return;
      }

      const { data: dims, error: dimError } = await supabase
        .from('dimensions')
        .select('id, name, type')
        .in('id', dimensionIds)
        .eq('type', 'text')
        .order('name');

      if (dimError) {
        console.error(`Error loading breakdown dimensions for ${channel}:`, dimError);
        setBreakdownDimensions(prev => ({ ...prev, [channel]: [] }));
        return;
      }

      setBreakdownDimensions(prev => ({ ...prev, [channel]: filterToChannel(dims || []) }));
    } catch (err) {
      console.error(`Error loading breakdown dimensions for ${channel}:`, err);
      setBreakdownDimensions(prev => ({ ...prev, [channel]: [] }));
    } finally {
      setLoadingBreakdownDimensions(prev => ({ ...prev, [channel]: false }));
    }
  };

  // Breakdown table state is declared earlier (groupByDimension, breakdownByDimension) so useFilteredSlideData can use it for KPI.

  // Store breakdown totals from Breakdown Analysis table for KPI synchronization
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const handleDimensionToggle = useCallback((dimension: 'metasearch' | 'sem' | 'social') => {
    setSelectedDimensions(prev => ({
      ...prev,
      [dimension]: !prev[dimension],
    }));
  }, []);

  // Get selected channels - only include channels that are both selected AND have report IDs
  const selectedChannels = useMemo(() => {
    const channels: ('metasearch' | 'sem' | 'social')[] = [];
    // Allow channel selection even when accountReportIds hasn't loaded yet.
    // Report ID availability is validated at save time (handleSave).
    const allChannelsUnresolved = !accountReportIds.metasearch && !accountReportIds.sem && !accountReportIds.social;
    if (selectedDimensions.metasearch && (accountReportIds.metasearch || allChannelsUnresolved)) channels.push('metasearch');
    if (selectedDimensions.sem && (accountReportIds.sem || allChannelsUnresolved)) channels.push('sem');
    if (selectedDimensions.social && (accountReportIds.social || allChannelsUnresolved)) channels.push('social');
    return channels;
  }, [selectedDimensions, accountReportIds]);

  // Reset modal to step 1 when opened
  useEffect(() => {
    if (isEditSourceOpen) {
      setModalStep(1);
      setActiveChannelTab(null);
      setSearchQuery("");
      // Reset dimension loading state to ensure clean reload
      setLoadingDimensions({
        metasearch: false,
        sem: false,
        social: false,
      });
      // Cancel any ongoing dimension value loading
      if (dimensionValueAbortControllerRef.current) {
        dimensionValueAbortControllerRef.current.abort();
        dimensionValueAbortControllerRef.current = null;
      }
      setLoadingValues({
        metasearch: false,
        sem: false,
        social: false,
      });
    }
  }, [isEditSourceOpen]);

  // Initialize active channel tab when entering step 3 (Data Source)
  useEffect(() => {
    if (modalStep === 3 && selectedChannels.length > 0 && !activeChannelTab) {
      setActiveChannelTab(selectedChannels[0]);
    }
  }, [modalStep, selectedChannels, activeChannelTab]);

  // Load dimension values when activeChannelTab changes on step 4 (Data Source)
  // Now only needed if user changes the dimension dropdown (not on initial load, since we preload)
  useEffect(() => {
    if (modalStep === 3 && activeChannelTab && isEditSourceOpen) {
      const config = channelConfigs[activeChannelTab];
      const dimensionId = config?.dimensionId;

      // Only load if we don't already have values (they should be preloaded from step 2)
      const existingValues = dimensionValues[activeChannelTab] || [];
      if (dimensionId && existingValues.length === 0 && !loadingValues[activeChannelTab]) {
        // Set loading to true IMMEDIATELY before async call to prevent race condition
        setLoadingValues(prev => ({ ...prev, [activeChannelTab]: true }));
        loadValuesForDimension(activeChannelTab, dimensionId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChannelTab, modalStep, isEditSourceOpen]);

  // Ref to store loadValuesForDimension to avoid circular dependency
  const loadValuesForDimensionRef = useRef<((channel: 'metasearch' | 'sem' | 'social', dimensionId: string) => Promise<void>) | null>(null);

  // AbortController ref to cancel ongoing dimension value loading
  const dimensionValueAbortControllerRef = useRef<AbortController | null>(null);

  // Load dimensions for a channel from database (account-specific)
  const loadDimensionsForChannel = useCallback(async (channel: 'metasearch' | 'sem' | 'social') => {
    setLoadingDimensions(prev => ({ ...prev, [channel]: true }));
    try {
      // Get report ID for this channel
      const reportId = getReportIdForChannel(channel);
      if (!reportId) {
        console.warn(`[loadDimensionsForChannel] No report ID for channel: ${channel}`);
        setDimensions(prev => ({ ...prev, [channel]: [] }));
        setLoadingDimensions(prev => ({ ...prev, [channel]: false }));
        return;
      }

      // Get account ID from report
      const { data: reportData, error: reportError } = await supabase
        .from('reports')
        .select('account_id')
        .eq('id', reportId)
        .maybeSingle();

      if (reportError || !reportData?.account_id) {
        console.error(`[loadDimensionsForChannel] Error fetching report or account ID for ${channel}:`, reportError);
        setDimensions(prev => ({ ...prev, [channel]: [] }));
        setLoadingDimensions(prev => ({ ...prev, [channel]: false }));
        return;
      }

      const accountId = reportData.account_id;
      const expectedNames = CHANNEL_DIMENSION_NAMES[channel] || [];

      // Load account-specific dimensions matching the expected names
      const { data: accountDims, error: dimError } = await supabase
        .from('dimensions')
        .select('id, name, type')
        .eq('scope', 'account')
        .eq('account_id', accountId)
        .eq('type', 'text')
        .in('name', expectedNames)
        .order('name');

      if (dimError) {
        console.error(`[loadDimensionsForChannel] Error loading dimensions for ${channel}:`, dimError);
        setDimensions(prev => ({ ...prev, [channel]: [] }));
        setLoadingDimensions(prev => ({ ...prev, [channel]: false }));
        return;
      }

      // Fallback to global dimensions if no account-specific dimensions found
      let channelDims: Dimension[] = (accountDims || []) as Dimension[];

      if (channelDims.length === 0) {
        console.warn(`[loadDimensionsForChannel] No account-specific dimensions found for ${channel}, trying global...`);
        const { data: globalDims, error: globalError } = await supabase
          .from('dimensions')
          .select('id, name, type')
          .eq('scope', 'global')
          .eq('type', 'text')
          .in('name', expectedNames)
          .order('name');

        if (!globalError && globalDims) {
          channelDims = globalDims as Dimension[];
        }
      }

      // Sort dimensions to match expected order
      const sortedDims = expectedNames
        .map(name => channelDims.find(d => d.name === name))
        .filter((d): d is Dimension => d !== undefined);

      console.log(`[loadDimensionsForChannel] Loaded ${sortedDims.length} dimensions for ${channel} (account: ${accountId}):`,
        sortedDims.map(d => ({ id: d.id, name: d.name })));

      setDimensions(prev => ({ ...prev, [channel]: sortedDims }));
      setLoadingDimensions(prev => ({ ...prev, [channel]: false }));

      // Get the dimension ID to use
      let dimensionIdToLoad = channelConfigs[channel]?.dimensionId;

      // Auto-select first dimension (Hotel for metasearch, Account for others) if not already set
      if (sortedDims.length > 0 && !dimensionIdToLoad) {
        const firstDimId = sortedDims[0].id;
        dimensionIdToLoad = firstDimId;
        setChannelConfigs(prev => ({
          ...prev,
          [channel]: {
            ...prev[channel],
            dimensionId: firstDimId,
          },
        }));
      }

      // Load values for the dimension (use the determined ID directly, not from state)
      if (dimensionIdToLoad && loadValuesForDimensionRef.current) {
        await loadValuesForDimensionRef.current(channel, dimensionIdToLoad);
      }
    } catch (err) {
      console.error(`[loadDimensionsForChannel] Error loading dimensions for ${channel}:`, err);
      setDimensions(prev => ({ ...prev, [channel]: [] }));
      setLoadingDimensions(prev => ({ ...prev, [channel]: false }));
    }
  }, [getReportIdForChannel, channelConfigs]);

  // Dimension values cache
  const dimensionValuesCache = useDataLoadingCache<string[]>({ ttl: 10 * 60 * 1000 }); // 10 minutes cache

  // Load values for a dimension from stored pivot_data first, fallback to dimension_data table
  // Also uses cached/saved selected values from channelConfigs for instant display
  // Now with caching, timeout, and cancellation to improve performance and prevent hanging
  const loadValuesForDimension = useCallback(async (channel: 'metasearch' | 'sem' | 'social', dimensionId: string) => {
    // Cancel any ongoing request for this channel
    if (dimensionValueAbortControllerRef.current) {
      dimensionValueAbortControllerRef.current.abort();
    }

    // Create new AbortController for this request
    const abortController = new AbortController();
    dimensionValueAbortControllerRef.current = abortController;

    // Check cache first
    const cacheKey = `${channel}-${dimensionId}`;
    const cached = dimensionValuesCache.get(cacheKey);
    if (cached) {
      setDimensionValues(prev => ({ ...prev, [channel]: cached }));
      setLoadingValues(prev => ({ ...prev, [channel]: false }));
      return;
    }
    // FIRST: Immediately show cached selected values from saved config (instant display)
    const savedConfig = channelConfigs[channel];
    const cachedSelectedValues = savedConfig?.selectedValues || [];

    // If we have cached values and the dimension matches, show them immediately
    if (cachedSelectedValues.length > 0 && savedConfig?.dimensionId === dimensionId) {
      setDimensionValues(prev => ({ ...prev, [channel]: cachedSelectedValues }));
    }

    // Note: loading state is already set by the caller for immediate UI feedback
    // But ensure it's true just in case
    setLoadingValues(prev => ({ ...prev, [channel]: true }));

    try {
      // SECOND: Check if we have raw data rows stored in pivot_data (most comprehensive - all dimension values)
      const channelData = effectivePivotData?.channels?.[channel];

      // Try rawDataRows first - this contains ALL rows with ALL dimension values
      if (channelData?.rawDataRows && channelData.rawDataRows.length > 0) {
        const valueSet = new Set<string>();
        cachedSelectedValues.forEach(v => valueSet.add(v));

        channelData.rawDataRows.forEach((row: any) => {
          const val = row[dimensionId];
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            valueSet.add(String(val).trim());
          }
        });

        const sortedValues = Array.from(valueSet).sort();

        setDimensionValues(prev => ({ ...prev, [channel]: sortedValues }));
        setLoadingValues(prev => ({ ...prev, [channel]: false }));
        return;
      }

      // THIRD: Check pre-computed filterUniqueValues in pivot_data
      const storedFilterValues = channelData?.filterUniqueValues?.[dimensionId];

      if (storedFilterValues?.values && storedFilterValues.values.length > 0) {
        // Merge with cached selected values to ensure they're included
        const allValues = new Set([...storedFilterValues.values, ...cachedSelectedValues]);
        const sortedValues = Array.from(allValues).sort();

        setDimensionValues(prev => ({ ...prev, [channel]: sortedValues }));
        setLoadingValues(prev => ({ ...prev, [channel]: false }));
        return;
      }

      // FOURTH: Check breakdown dimension values
      const breakdowns = channelData?.breakdowns;
      if (breakdowns) {
        // Find the dimension name to look up in breakdowns
        const dimInfo = dimensions[channel]?.find(d => d.id === dimensionId);
        if (dimInfo && breakdowns[dimInfo.name]) {
          const breakdownRows = breakdowns[dimInfo.name] as Array<Record<string, any>>;
          if (breakdownRows && breakdownRows.length > 0) {
            // Extract dimension values from breakdown rows - the dimension value is stored as the first non-metric key
            const breakdownValues = breakdownRows
              .map(row => {
                // Look for the dimension value - it's the key that matches the dimension name (case-insensitive)
                const dimKey = Object.keys(row).find(k =>
                  k.toLowerCase() === dimInfo.name.toLowerCase() ||
                  k === 'name' ||
                  !['impressions', 'clicks', 'cost', 'revenue', 'bookings', 'ctr', 'conversionRate', 'cpc', 'roas', 'costOfSale'].includes(k)
                );
                return dimKey ? String(row[dimKey]) : null;
              })
              .filter((v): v is string => v !== null && v !== '');

            // Merge with cached selected values
            const allValues = new Set([...breakdownValues, ...cachedSelectedValues]);
            const sortedValues = Array.from(allValues).sort();

            setDimensionValues(prev => ({ ...prev, [channel]: sortedValues }));
            setLoadingValues(prev => ({ ...prev, [channel]: false }));
            return;
          }
        }
      }

      // FALLBACK: Fetch from dimension_data table
      const reportId = getReportIdForChannel(channel);

      if (!reportId) {
        console.error(`[loadValuesForDimension] No report ID for channel: ${channel}`);
        if (cachedSelectedValues.length === 0) {
          setDimensionValues(prev => ({ ...prev, [channel]: [] }));
        }
        setLoadingValues(prev => ({ ...prev, [channel]: false }));
        return;
      }

      // Fetch unique values from dimension_data table using pagination with timeout and limits
      const allDimData: any[] = [];
      const batchSize = 500; // Reduced from 1000 to prevent timeouts
      const maxRows = 50000; // Maximum rows to fetch to prevent infinite loops
      const timeoutMs = 30000; // 30 second timeout per batch
      let offset = 0;
      let hasMore = true;
      let consecutiveErrors = 0;
      const maxConsecutiveErrors = 3;

      while (hasMore && allDimData.length < maxRows && !abortController.signal.aborted) {
        try {
          // Create timeout promise
          const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((_, reject) => {
            setTimeout(() => reject(new Error('Request timeout')), timeoutMs);
          });

          // Race between query and timeout
          const queryPromise = supabase
            .from('dimension_data')
            .select('dimension_values')
            .eq('report_id', reportId)
            .range(offset, offset + batchSize - 1);

          let batchData: any[] | null = null;
          let dimError: any = null;

          try {
            const result = await Promise.race([
              queryPromise,
              timeoutPromise
            ]);
            batchData = result.data;
            dimError = result.error;
          } catch (timeoutErr: any) {
            if (timeoutErr.message === 'Request timeout') {
              throw timeoutErr;
            }
            throw timeoutErr;
          }

          if (abortController.signal.aborted) {
            console.log(`[loadValuesForDimension] Request cancelled for ${channel}/${dimensionId}`);
            return;
          }

          if (dimError) {
            consecutiveErrors++;
            console.error(`[loadValuesForDimension] Error fetching batch for ${channel} (attempt ${consecutiveErrors}/${maxConsecutiveErrors}):`, dimError);

            if (consecutiveErrors >= maxConsecutiveErrors) {
              console.error(`[loadValuesForDimension] Too many consecutive errors, stopping fetch`);
              break;
            }

            // Wait before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * consecutiveErrors));
            continue;
          }

          consecutiveErrors = 0; // Reset on success

          if (batchData && batchData.length > 0) {
            allDimData.push(...batchData);
            offset += batchSize;
            hasMore = batchData.length === batchSize;

            // Log progress for large datasets
            if (allDimData.length % 5000 === 0) {
              console.log(`[loadValuesForDimension] Loaded ${allDimData.length} rows for ${channel}/${dimensionId}...`);
            }
          } else {
            hasMore = false;
          }
        } catch (err: any) {
          if (abortController.signal.aborted) {
            console.log(`[loadValuesForDimension] Request cancelled for ${channel}/${dimensionId}`);
            return;
          }

          if (err.message === 'Request timeout') {
            console.warn(`[loadValuesForDimension] Timeout fetching batch at offset ${offset} for ${channel}`);
            consecutiveErrors++;

            if (consecutiveErrors >= maxConsecutiveErrors) {
              console.error(`[loadValuesForDimension] Too many timeouts, stopping fetch`);
              break;
            }

            // Try smaller batch size on timeout
            offset += Math.floor(batchSize / 2);
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }

          console.error(`[loadValuesForDimension] Unexpected error:`, err);
          consecutiveErrors++;

          if (consecutiveErrors >= maxConsecutiveErrors) {
            break;
          }
        }
      }

      if (abortController.signal.aborted) {
        return;
      }

      if (allDimData.length >= maxRows) {
        console.warn(`[loadValuesForDimension] Reached maximum row limit (${maxRows}) for ${channel}/${dimensionId}. Some values may be missing.`);
      }

      const dimData = allDimData;

      if (!dimData || dimData.length === 0) {
        console.error(`[loadValuesForDimension] No dimension_data found for ${channel} (report: ${reportId})`);
        if (cachedSelectedValues.length === 0) {
          setDimensionValues(prev => ({ ...prev, [channel]: [] }));
        }
        return;
      }

      // Extract unique values for this dimension
      const valueSet = new Set<string>();

      // Start with cached selected values to ensure they're always included
      cachedSelectedValues.forEach(v => valueSet.add(v));

      dimData.forEach((row: any) => {
        const dimValues = row.dimension_values || {};
        const val = dimValues[dimensionId];
        if (val !== undefined && val !== null && val !== '') {
          const stringVal = String(val).trim();
          if (stringVal !== '') {
            valueSet.add(stringVal);
          }
        }
      });

      // Debug logging to help diagnose dimension value loading issues
      if (valueSet.size === 0 && dimData.length > 0) {
        const sampleRow = dimData[0];
        const sampleKeys = Object.keys(sampleRow.dimension_values || {});
        console.warn(`[loadValuesForDimension] No values found for dimension ${dimensionId} in ${channel}. Sample row keys:`, sampleKeys);
        console.warn(`[loadValuesForDimension] Looking for dimension ID: ${dimensionId}`);

        // Try to find dimension by name as fallback
        const dimInfo = dimensions[channel]?.find(d => d.id === dimensionId);
        if (dimInfo) {
          console.warn(`[loadValuesForDimension] Dimension name: ${dimInfo.name}. Checking if dimension_values uses name instead of ID...`);
        }
      }

      let values = Array.from(valueSet).sort();

      // Cache the results
      dimensionValuesCache.set(cacheKey, values);

      setDimensionValues(prev => ({ ...prev, [channel]: values }));
    } catch (err: any) {
      if (abortController.signal.aborted) {
        console.log(`[loadValuesForDimension] Request cancelled for ${channel}/${dimensionId}`);
        return;
      }

      console.error(`[loadValuesForDimension] CATCH Error for ${channel}/${dimensionId}:`, err);
      if (cachedSelectedValues.length === 0) {
        setDimensionValues(prev => ({ ...prev, [channel]: [] }));
      }
    } finally {
      // Only clear loading state if this request wasn't cancelled
      if (!abortController.signal.aborted) {
        setLoadingValues(prev => ({ ...prev, [channel]: false }));
      }
      // Clear abort controller if this was the current request
      if (dimensionValueAbortControllerRef.current === abortController) {
        dimensionValueAbortControllerRef.current = null;
      }
    }
  }, [effectivePivotData, channelConfigs, dimensions, dimensionValuesCache, getReportIdForChannel]);

  // Update ref when loadValuesForDimension changes
  useEffect(() => {
    loadValuesForDimensionRef.current = loadValuesForDimension;
  }, [loadValuesForDimension]);

  // Load dimensions when entering step 2 or 3 (after Channels step)
  // Most loading is now done via preloadAllChannelData on step 1->2 transition
  // This effect is only needed as a fallback for edge cases
  useEffect(() => {
    if ((modalStep === 2 || modalStep === 3) && isEditSourceOpen) {
      selectedChannels.forEach(channel => {
        // Only load dimensions if not already loaded (preload should have already done this)
        if (dimensions[channel].length === 0 && !loadingDimensions[channel]) {
          loadDimensionsForChannel(channel);
        }

        // Only load values on step 3 if not already loaded and dimension is configured
        if (modalStep === 3 && channelConfigs[channel]?.dimensionId) {
          const existingValues = dimensionValues[channel] || [];
          if (existingValues.length === 0 && !loadingValues[channel]) {
            const dimensionId = channelConfigs[channel].dimensionId;
            setLoadingValues(prev => ({ ...prev, [channel]: true }));
            loadValuesForDimension(channel, dimensionId);
          }
        }
      });
    }
  }, [modalStep, isEditSourceOpen, selectedChannels, dimensions, loadingDimensions, channelConfigs, dimensionValues, loadingValues, loadDimensionsForChannel, loadValuesForDimension]);

  // Load breakdown dimensions when entering step 4
  useEffect(() => {
    if (modalStep === 4 && isEditSourceOpen) {
      selectedChannels.forEach(channel => {
        if (breakdownDimensions[channel].length === 0 && !loadingBreakdownDimensions[channel]) {
          loadBreakdownDimensionsForChannel(channel);
        }
      });
    }
  }, [modalStep, isEditSourceOpen, selectedChannels]);

  // Load breakdown dimensions on page load and when switching to a channel tab
  useEffect(() => {
    if (!slideReportId) return;
    const channelsToLoad = new Set(selectedChannels);
    if (selectedTab === 'metasearch' || selectedTab === 'sem' || selectedTab === 'social') {
      channelsToLoad.add(selectedTab);
    }
    channelsToLoad.forEach((channel: 'metasearch' | 'sem' | 'social') => {
      if ((breakdownDimensions[channel]?.length ?? 0) === 0 && !loadingBreakdownDimensions[channel]) {
        loadBreakdownDimensionsForChannel(channel);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideReportId, selectedChannels, selectedTab]);

  // When we have saved breakdown config IDs but loaded dimensions don't include them (e.g. ID scope mismatch),
  // fetch those dimensions by ID so Group by / Breakdown by dropdowns can show options.
  // Only dimensions valid for the channel are merged in (CHANNEL_DIMENSION_NAMES guard).
  useEffect(() => {
    const channelKeys: ('metasearch' | 'sem' | 'social')[] = ['metasearch', 'sem', 'social'];
    channelKeys.forEach(async (channel) => {
      const configIds = breakdownConfigs[channel]?.breakdownDimensionIds ?? [];
      if (configIds.length === 0) return;
      const existing = breakdownDimensions[channel] ?? [];
      const existingIds = new Set(existing.map((d) => d.id));
      const missingIds = configIds.filter((id) => !existingIds.has(id));
      if (missingIds.length === 0) return;

      const { data: dims } = await supabase
        .from('dimensions')
        .select('id, name, type')
        .in('id', missingIds);

      if (dims?.length) {
        // Only allow dimensions that are valid for this channel type.
        const validNames = new Set(
          (CHANNEL_DIMENSION_NAMES[channel] || []).map((n) => n.toLowerCase())
        );
        const channelDims = validNames.size > 0
          ? dims.filter((d: { id: string; name: string; type: string }) =>
              validNames.has(d.name.toLowerCase())
            )
          : dims;

        if (channelDims.length === 0) return;

        setBreakdownDimensions((prev) => {
          const current = prev[channel] ?? [];
          const byId = new Map(current.map((d) => [d.id, d]));
          channelDims.forEach((d: { id: string; name: string; type: string }) => byId.set(d.id, d));
          return { ...prev, [channel]: Array.from(byId.values()) };
        });
      }
    });
  }, [breakdownConfigs, breakdownDimensions]);

  // Handle dimension change
  const handleDimensionChange = (channel: 'metasearch' | 'sem' | 'social', dimensionId: string) => {
    setChannelConfigs(prev => ({
      ...prev,
      [channel]: {
        dimensionId: dimensionId === "none" ? null : dimensionId,
        selectedValues: [],
      },
    }));
    setDimensionValues(prev => ({ ...prev, [channel]: [] }));
    if (dimensionId && dimensionId !== "none") {
      loadValuesForDimension(channel, dimensionId);
    }
  };

  // Handle value toggle
  const handleValueToggle = (channel: 'metasearch' | 'sem' | 'social', value: string) => {
    setChannelConfigs(prev => {
      const current = prev[channel];
      const isSelected = current.selectedValues.includes(value);
      return {
        ...prev,
        [channel]: {
          ...current,
          selectedValues: isSelected
            ? current.selectedValues.filter(v => v !== value)
            : [...current.selectedValues, value],
        },
      };
    });
  };

  // Handle select all values
  const handleSelectAllValues = (channel: 'metasearch' | 'sem' | 'social') => {
    const allValues = dimensionValues[channel] || [];
    setChannelConfigs(prev => ({
      ...prev,
      [channel]: {
        ...prev[channel],
        selectedValues: [...allValues],
      },
    }));
  };

  // Handle deselect all values
  const handleDeselectAllValues = (channel: 'metasearch' | 'sem' | 'social') => {
    setChannelConfigs(prev => ({
      ...prev,
      [channel]: {
        ...prev[channel],
        selectedValues: [],
      },
    }));
  };

  // Handle breakdown dimension toggle
  const handleBreakdownToggle = (channel: 'metasearch' | 'sem' | 'social', dimensionId: string) => {
    setBreakdownConfigs(prev => {
      const current = prev[channel];
      const isSelected = current.breakdownDimensionIds.includes(dimensionId);
      return {
        ...prev,
        [channel]: {
          breakdownDimensionIds: isSelected
            ? current.breakdownDimensionIds.filter(id => id !== dimensionId)
            : [...current.breakdownDimensionIds, dimensionId],
        },
      };
    });
  };

  // Handle filter dimension toggle (updates filterConfigs; options are derived from rawDataRows automatically)
  const handleFilterDimensionToggle = async (channel: 'metasearch' | 'sem' | 'social', dimensionId: string) => {
    const currentConfig = filterConfigs?.[channel];
    const isSelected = currentConfig?.filterDimensionIds?.includes(dimensionId) || false;

    const next = {
      ...filterConfigs,
      [channel]: {
        filterDimensionIds: isSelected
          ? (currentConfig?.filterDimensionIds ?? []).filter(id => id !== dimensionId)
          : [...(currentConfig?.filterDimensionIds ?? []), dimensionId],
      },
    } as import('@/hooks/useDataStudioFilters').FilterConfigs;
    dsFilters.persistFilterConfigs(next);

    if (isSelected) {
      // Dimension removed — clear its selected filter values
      dsFilters.clearChannelFilter(channel, dimensionId);
      setFilterValues(prev => {
        const updated = { ...prev[channel] };
        delete updated[dimensionId];
        return { ...prev, [channel]: updated };
      });
    }
  };

  // loadFilterDimensionValues removed — filter options are derived in-memory by useDataStudioFilters.

  // Filtered values based on search query
  const filteredValues = useMemo(() => {
    if (!activeChannelTab) return [];
    const values = dimensionValues[activeChannelTab] || [];
    if (!searchQuery) return values;
    return values.filter(value =>
      value.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [activeChannelTab, dimensionValues, searchQuery]);

  // KPI names used in the slide view - these should be auto-selected
  const SLIDE_KPI_NAMES = [
    'Impressions',
    'Clicks',
    'CTR',
    'Bookings',
    'Conversion Rate',
    'CPC',
    'Cost',
    'Revenue',
    'ROAS',
    'Cost of sale',
  ];

  // Load available dimensions from database for all selected channels
  // Uses account > global precedence so account-scoped IDs (matching dimension_data) win.
  const loadAvailableDimensions = async () => {
    setLoadingAvailableDimensions(true);
    try {
      // Fetch account-scoped VALUE dimensions first (these match dimension_data keys)
      const accountDimsQuery = accountId
        ? supabase
            .from('dimensions')
            .select('id, name, type')
            .eq('scope', 'account')
            .eq('account_id', accountId)
            .in('type', ['number', 'currency', 'percentage'])
            .order('name')
        : null;

      const { data: accountDims } = accountDimsQuery
        ? await accountDimsQuery
        : { data: [] };

      // Fetch global VALUE dimensions as fallback
      const { data: globalDims, error } = await supabase
        .from('dimensions')
        .select('id, name, type')
        .eq('scope', 'global')
        .in('type', ['number', 'currency', 'percentage'])
        .order('name');

      if (error) {
        console.error('Error loading dimensions:', error);
        return;
      }

      // Merge with account-scoped taking precedence (deduplicate by name)
      const seenNames = new Set<string>();
      const dimensionList: { id: string; name: string; type: string }[] = [];
      for (const d of [...(accountDims || []), ...(globalDims || [])]) {
        if (!seenNames.has(d.name)) {
          seenNames.add(d.name);
          dimensionList.push(d);
        }
      }
      dimensionList.sort((a, b) => a.name.localeCompare(b.name));

      // Set same dimensions for all channels (value dimensions are channel-agnostic)
      setAvailableDimensions({
        metasearch: dimensionList,
        sem: dimensionList,
        social: dimensionList,
      });

      // Auto-select dimensions that match the KPIs used in the slide
      // Only if no saved configuration exists (check if current selection is default/empty)
      const currentSelected = selectedValueDimensionIds;
      const currentDefaultIds = defaultValueDimensionIds;
      const isDefaultOrEmpty = currentSelected.length === 0 ||
        (currentSelected.length === currentDefaultIds.length &&
          currentSelected.every(id => currentDefaultIds.includes(id)));

      if (isDefaultOrEmpty) {
        // Find dimension IDs that match the KPI names
        const kpiDimensionIds = dimensionList
          .filter(dim => SLIDE_KPI_NAMES.some(kpiName =>
            dim.name.toLowerCase() === kpiName.toLowerCase() ||
            dim.name.toLowerCase() === kpiName.toLowerCase().replace(' ', '')
          ))
          .map(dim => dim.id);

        if (kpiDimensionIds.length > 0) {
          setSelectedValueDimensionIds(kpiDimensionIds);
        } else if (currentSelected.length === 0) {
          // If no KPI matches found and nothing is selected, use all available VALUE dimensions
          const allValueDimIds = dimensionList
            .filter(dim => ['number', 'currency', 'percentage'].includes(dim.type))
            .map(dim => dim.id);
          if (allValueDimIds.length > 0) {
            setSelectedValueDimensionIds(allValueDimIds);
          }
        }
      }
    } catch (error) {
      console.error('Error loading available dimensions:', error);
    } finally {
      setLoadingAvailableDimensions(false);
    }
  };

  // Handle dimension selection toggle (applies to all channels)
  const handleValueDimensionToggle = (dimensionId: string) => {
    setSelectedValueDimensionIds(prev =>
      prev.includes(dimensionId)
        ? prev.filter(id => id !== dimensionId)
        : [...prev, dimensionId]
    );
  };

  // Select all available dimensions
  const handleSelectAllDimensions = () => {
    const allDimIds = availableDimensions.metasearch?.map(d => d.id) || [];
    setSelectedValueDimensionIds(allDimIds);
  };

  // Deselect all dimensions
  const handleDeselectAllDimensions = () => {
    setSelectedValueDimensionIds([]);
  };

  // loadFilterDimensionValuesAfterSave removed — useDataStudioFilters derives options automatically.

  // Navigation handlers
  const handleNext = async () => {
    if (modalStep === 1) {
      if (selectedChannels.length > 0) {
        // Keep Step 1 fast: only load the dimension *list* needed for Step 2.
        // Values are loaded later (Step 3) when a dimension is selected.
        await loadAvailableDimensions();
        setModalStep(2);
      }
      return;
    }

    if (modalStep === 2) {
      setModalStep(3);
      return;
    }

    if (modalStep === 3) {
      // Save and close — filters/breakdowns are now configured in column mapping modal
      handleSave();
      return;
    }
  };

  const handleBack = () => {
    if (modalStep === 2) {
      setModalStep(1);
    } else if (modalStep === 3) {
      setModalStep(2);
    }
  };

  const handleSave = async () => {
    if (!accountId || !user) {
      console.error('Cannot save: missing accountId or user');
      setIsEditSourceOpen(false);
      setModalStep(1);
      setActiveChannelTab(null);
      setSearchQuery("");
      return;
    }

    // Close modal immediately for better UX - save happens in background
    setIsEditSourceOpen(false);

    try {
      // Filter selectedChannels to only include channels that have report IDs
      const validSelectedChannels = selectedChannels.filter(channel => {
        const hasReportId = !!accountReportIds[channel];
        if (!hasReportId) {
          console.warn(`[handleSave] Filtering out channel ${channel} - no report ID found for this account`);
        }
        return hasReportId;
      });

      // Validate that at least one channel is selected
      if (validSelectedChannels.length === 0) {
        toast({
          title: "Error",
          description: "Please select at least one channel that has a report configured for this account.",
          variant: "destructive",
        });
        setIsEditSourceOpen(true); // Reopen modal so user can fix
        return;
      }

      // Filter channel configs, breakdown configs, and filter configs to only include valid channels
      const filteredChannelConfigs: Record<string, ChannelConfig> = {};
      const filteredBreakdownConfigs: Record<string, BreakdownConfig> = {};
      const filteredFilterConfigs: Record<string, FilterConfig> = {};

      for (const channel of validSelectedChannels) {
        if (channelConfigs[channel]) {
          filteredChannelConfigs[channel] = channelConfigs[channel];
        }
        if (breakdownConfigs[channel]) {
          filteredBreakdownConfigs[channel] = breakdownConfigs[channel];
        }
        if (filterConfigs[channel]) {
          filteredFilterConfigs[channel] = filterConfigs[channel];
        }
      }

      // Build configuration object with dimension mappings (only valid channels)
      const configuration: SlideReportConfiguration = {
        selectedChannels: validSelectedChannels,
        selectedValueDimensionIds: selectedValueDimensionIds,
        channelConfigs: filteredChannelConfigs,
        breakdownConfigs: filteredBreakdownConfigs,
        filterConfigs: filteredFilterConfigs,
      };

      // Use account-specific report IDs
      const reportIds: Record<string, string> = {};
      for (const channel of validSelectedChannels) {
        const reportId = accountReportIds[channel];
        if (!reportId) {
          // This shouldn't happen since we filtered above, but double-check
          console.error(`[handleSave] No report ID found for channel ${channel} in account ${accountId}`);
          toast({
            title: "Error",
            description: `No report found for ${channel} channel. Please ensure reports are set up for this account.`,
            variant: "destructive",
          });
          return;
        }
        reportIds[channel] = reportId;
      }

      const dateRange = buildDefaultSlideReportDateRange();

      // Save or update slide report
      if (slideReportId) {
        // Update existing slide report
        await updateSlideReport.mutateAsync({
          id: slideReportId,
          configuration,
          report_ids: reportIds,
          date_range: dateRange,
        });
      } else {
        // Create new slide report
        const reportName = 'Data Studio';
        const newReport = await createSlideReport.mutateAsync({
          name: reportName,
          account_id: accountId,
          user_id: user.id,
          configuration,
          report_ids: reportIds,
          date_range: dateRange,
        });
        setSlideReportId(newReport.id);
      }

      toast({
        title: "Configuration saved",
        description: "Your report settings have been saved. Click 'Refresh Data' to fetch updated data.",
      });

      // Filter options are derived automatically by useDataStudioFilters from rawDataRows.

    } catch (error) {
      console.error('Error saving slide report configuration:', error);
      toast({
        title: "Error",
        description: "Failed to save configuration. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Get available views (default + saved views)
  const availableViews = useMemo(() => {
    return [
      { id: null, name: 'Master' },
      ...views.map(v => ({ id: v.id, name: v.name }))
    ];
  }, [views]);

  // Save current filter configuration as a view
  const handleSaveView = useCallback(async (viewName: string) => {
    if (!slideReportId || !slideReport || !user) {
      toast({
        title: "Error",
        description: "No report selected. Please configure your report first.",
        variant: "destructive",
      });
      return;
    }

    try {
      await createView.mutateAsync({
        slide_report_id: slideReportId,
        account_id: accountId || null,
        user_id: user.id,
        name: viewName,
        selected_year: selectedYear,
        selected_month: selectedMonth,
        comparison_type: comparisonType as any,
        price_check_chart_time_range: priceCheckChartTimeRange,
        filter_values: { ...filterValues }, // Deep copy to avoid mutations
      });

      // The view will be automatically refetched by the query
      // We'll select it after the query refetches
      queryClient.invalidateQueries({ queryKey: ['views', 'list', slideReportId] });

      // Use a small delay to allow the query to refetch, then find and select the new view
      setTimeout(() => {
        const updatedViews = queryClient.getQueryData<any[]>(['views', 'list', slideReportId]) || [];

        const newView = updatedViews.find(v => v.name === viewName);
        if (newView) {
          setSelectedViewId(newView.id);
        }
      }, 300);
    } catch (error) {
      // Error toast is handled by the mutation
      console.error('Error saving view:', error);
    }
  }, [slideReportId, slideReport, user, accountId, selectedYear, selectedMonth, comparisonType, priceCheckChartTimeRange, filterValues, createView, queryClient]);

  // Update an existing view with current filter configuration
  const handleUpdateView = useCallback(async (viewId: string) => {
    if (!slideReportId || !user) return;
    try {
      await updateView.mutateAsync({
        id: viewId,
        selected_year: selectedYear,
        selected_month: selectedMonth,
        comparison_type: comparisonType as any,
        price_check_chart_time_range: priceCheckChartTimeRange,
        filter_values: { ...filterValues },
      });
      queryClient.invalidateQueries({ queryKey: ['views', 'list', slideReportId] });
    } catch (error) {
      console.error('Error updating view:', error);
    }
  }, [slideReportId, user, selectedYear, selectedMonth, comparisonType, priceCheckChartTimeRange, filterValues, updateView, queryClient]);

  // Apply a saved view (or reset to Master when viewId is null)
  const handleApplyView = useCallback((viewId: string | null) => {
    if (!slideReportId) return;

    isApplyingViewRef.current = true;

    const view = viewId ? views.find(v => v.id === viewId) ?? null : null;
    if (viewId && !view) {
      toast({
        title: 'View unavailable',
        description: 'That view could not be loaded. Try refreshing the page.',
        variant: 'destructive',
      });
      isApplyingViewRef.current = false;
      return;
    }

    setSelectedViewId(viewId);

    // Delegate filter value + date restore to the canonical hook
    dsFilters.applyView(view);

    // Chart-level settings not owned by dsFilters
    setPriceCheckChartTimeRange(view?.price_check_chart_time_range || 'last_6_months');
    if (view?.tab) setSelectedTab(view.tab);
    else if (!viewId) setSelectedTab('overview');

    // Update URL with viewId; drop stale share preview params so slug never hijacks routing on auth edge cases
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (viewId) {
          next.set('viewId', viewId);
        } else {
          next.delete('viewId');
        }
        if (!isReadOnlyMode) {
          next.delete('shared');
          next.delete('slug');
        }
        return next;
      },
      { replace: true }
    );

    setTimeout(() => {
      isApplyingViewRef.current = false;
    }, 0);
  }, [slideReportId, views, dsFilters, isReadOnlyMode, setSearchParams]);

  // ========== Refresh Data Modal handler ==========
  const handleRefreshDataWithModal = useCallback(() => {
    if (!slideReportId) {
      toast({ title: "No report", description: "Please configure your report first.", variant: "destructive" });
      return;
    }
    // Reset everything — modal opens in mode-selection state, refresh does NOT start yet.
    setRefreshStep(0);
    setRefreshPending(false);
    setRefreshRowsProcessed(null);
    setRefreshStepStatus({ 0: 'pending', 1: 'pending', 2: 'pending', 3: 'pending', 4: 'pending', 5: 'pending' });
    setRefreshError(null);
    setIsRefreshModalOpen(true);
  }, [slideReportId]);

  // Called by RefreshDataModal when user clicks "Start Refresh" with a chosen mode.
  const handleStartRefresh = useCallback((mode: 'full' | 'recent') => {
    setActiveRefreshMode(mode);
    setRefreshPending(true); // This is the only thing that triggers the refresh useEffect.
  }, []);

  // Invoke edge function with retries to handle transient "Failed to send request" errors
  const invokeWithRetry = useCallback(
    async (name: string, body: object, retries = 2): Promise<{ data: any; error: any }> => {
      let lastError: any = null;
      for (let attempt = 0; attempt <= retries; attempt++) {
        const result = await supabase.functions.invoke(name, { body });
        if (!result.error) return result;
        lastError = result.error;
        const isFetchError = lastError?.message?.includes('Failed to send') || lastError?.message?.includes('fetch');
        if (attempt < retries && isFetchError) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        return result;
      }
      return { data: null, error: lastError };
    },
    []
  );

   // When Refresh Data modal is open and step is 0: run orchestrated refresh workflow (resync + optional refresh-slide-report).
  // Data Studio: workflow resyncs only (skipRefresh), then client recomputes pivot and updates slide_reports.
  // Master Report: workflow resyncs and runs refresh-slide-report.
  useEffect(() => {
    // Only fire when the user has explicitly clicked "Start Refresh" in the modal.
    if (!refreshPending || !isRefreshModalOpen || !slideReportId || !slideReport) return;

    // Consume the pending flag immediately so this effect doesn't re-run.
    setRefreshPending(false);

    const workflowAccountId = accountId || (slideReport.account_id as string);
    if (!workflowAccountId) {
      setRefreshError('Missing account ID');
      setRefreshStepStatus((prev) => ({ ...prev, 0: 'error', 1: 'error', 2: 'error', 3: 'error', 4: 'error', 5: 'error' }));
      return;
    }

    setRefreshStep(1);
    setRefreshStepStatus((prev) => ({ ...prev, 0: 'loading', 1: 'loading' }));

    (async () => {
      try {
        const result = await runRefreshWorkflow({
          accountId: workflowAccountId,
          slideReportId,
          clearFirst: true,
          skipRefresh: isDataStudio,
          refreshMode: activeRefreshMode,
        });

        if (result.rowsProcessed != null) {
          setRefreshRowsProcessed(result.rowsProcessed);
        }

        setRefreshStepStatus((prev) => ({ ...prev, 0: 'complete', 1: 'complete' }));

        if (isDataStudio) {
          setRefreshStep(2);
          setRefreshStepStatus((prev) => ({ ...prev, 2: 'loading', 3: 'loading', 4: 'loading', 5: 'loading' }));

          // Update last_refreshed_at timestamp on the slide report
          try {
            await supabase
              .from("slide_reports")
              .update({ last_refreshed_at: new Date().toISOString() })
              .eq("id", slideReportId);
          } catch (updateErr) {
            console.warn('[RefreshData] Failed to update last_refreshed_at:', updateErr);
          }

          // Reload report: refetch canonical report data so cache has fresh dimension_data before showing complete (avoids stale Cost/KPIs).
          try {
            await queryClient.refetchQueries({ queryKey: ['data-studio-raw-rows'] });
            queryClient.invalidateQueries({ queryKey: ['data-studio-raw-rows'] });
          } catch (refetchErr) {
            console.warn('[RefreshData] Report refetch failed (data may still be stale):', refetchErr);
          }

          setRefreshStep(5);
          setRefreshStepStatus((prev) => ({ ...prev, 2: 'complete', 3: 'complete', 4: 'complete', 5: 'complete' }));

          queryClient.invalidateQueries({ queryKey: ['slide_reports', 'detail', slideReportId] });
          queryClient.invalidateQueries({ queryKey: ['slide_reports'] });
        } else {
          setRefreshStep(2);
          setRefreshStepStatus((prev) => ({
            ...prev,
            2: 'complete',
            3: 'complete',
            4: 'complete',
            5: 'complete',
          }));

          queryClient.invalidateQueries({ queryKey: ['cached-dimension-data'] });
          queryClient.invalidateQueries({ queryKey: ['channel_chart_data_from_table', slideReportId] });
          queryClient.invalidateQueries({ queryKey: ['slide_reports', 'detail', slideReportId] });
          queryClient.invalidateQueries({ queryKey: ['slide_reports'] });
          queryClient.invalidateQueries({ queryKey: ['slide_report_monthly_data', slideReportId] });
        }
      } catch (e: unknown) {
        console.error('[RefreshData]', e);
        const msg = e instanceof Error ? e.message : 'Refresh failed';
        const hint = msg.includes('Failed to send') || msg.includes('Edge Function')
          ? ' Check your connection and try again. If it persists, ensure run-refresh-workflow is deployed.'
          : '';
        setRefreshError(msg + hint);
        setRefreshStepStatus((prev) => ({ ...prev, 0: prev[0] === 'loading' ? 'error' : prev[0], 1: prev[1] === 'loading' ? 'error' : prev[1], 2: 'error', 3: 'error', 4: 'error', 5: 'error' }));
      }
    })();
  }, [refreshPending, isRefreshModalOpen, slideReportId, slideReport, selectedYear, queryClient, isDataStudio, accountId, activeRefreshMode]);

  // ========== Budget edit handlers ==========
  const handleStartEditBudget = useCallback((month: string, channel: string | null, currentBudget: number) => {
    setEditingBudget({ month, channel });
    setEditBudgetValue(String(currentBudget || 0));
  }, []);

  const handleSaveBudget = useCallback(async () => {
    if (!editingBudget || !slideReportId) return;
    // Budget save logic would go here
    setEditingBudget(null);
    setEditBudgetValue("");
  }, [editingBudget, slideReportId]);

  const handleCancelEditBudget = useCallback(() => {
    setEditingBudget(null);
    setEditBudgetValue("");
  }, []);

  // ========== PnL edit handlers ==========
  const handleStartEditPnl = useCallback((month: string, channel: string | null, field: 'spender' | 'recurrentFee' | 'percentCost' | 'percentRevenue', currentValue: string | number) => {
    setEditingPnl({ month, channel, field });
    setEditPnlValue(String(currentValue));
  }, []);

  const handleSavePnl = useCallback(() => {
    if (!editingPnl) return;
    if (editingPnl.channel && editingPnl.field !== 'spender') {
      setPnlConfig(prev => ({
        ...prev,
        [editingPnl.channel!]: {
          ...prev[editingPnl.channel!],
          [editingPnl.field]: parseFloat(editPnlValue) || 0,
        },
      }));
    }
    setEditingPnl(null);
    setEditPnlValue("");
  }, [editingPnl, editPnlValue]);

  const handleCancelEditPnl = useCallback(() => {
    setEditingPnl(null);
    setEditPnlValue("");
  }, []);

  // ========== View delete handler ==========
  const handleDeleteView = useCallback(async (viewId: string) => {
    try {
      await deleteView.mutateAsync(viewId);
      if (selectedViewId === viewId) {
        setSelectedViewId(null);
      }
      toast({ title: "View deleted" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to delete view", variant: "destructive" });
    }
  }, [deleteView, selectedViewId]);

  // ========== KPI Cards & Render Helpers ==========
  const overviewMetrics = useOverviewMetrics(currentTotals);
  const KPI_CARDS = useKPICards(overviewMetrics);
  const getReportKPICards = useReportKPICards();

  const getOverviewComparisonMetrics = useCallback(() => {
    if (!comparisonTotals || comparisonType === 'none') return null;
    const totals = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
    Object.values(comparisonTotals).forEach((ch: any) => {
      totals.impressions += ch.impressions || 0;
      totals.clicks += ch.clicks || 0;
      totals.cost += ch.cost || 0;
      totals.revenue += ch.revenue || 0;
      totals.bookings += ch.bookings || 0;
    });
    // If all base metrics are zero, there's no real comparison data
    const hasAnyCompData = totals.impressions > 0 || totals.clicks > 0 || totals.cost > 0 || totals.revenue > 0 || totals.bookings > 0;
    if (!hasAnyCompData) return null;
    const derived = calculateDerivedMetrics(totals);
    return { ...derived, label: comparisonType === 'previous_period' ? 'vs prev period' : 'vs prev year' };
  }, [comparisonTotals, comparisonType]);

  const getChannelComparisonMetrics = useCallback((channel: 'metasearch' | 'sem' | 'social') => {
    if (!comparisonTotals || comparisonType === 'none') return null;
    const ch = comparisonTotals[channel];
    if (!ch) return null;
    // If all base metrics are zero, there's no real comparison data — don't show misleading 100% changes
    const hasAnyCompData = (ch.impressions || 0) > 0 || (ch.clicks || 0) > 0 || (ch.cost || 0) > 0 || (ch.revenue || 0) > 0 || (ch.bookings || 0) > 0;
    if (!hasAnyCompData) return null;
    const derived = calculateDerivedMetrics(ch);
    return { ...derived, label: comparisonType === 'previous_period' ? 'vs prev period' : 'vs prev year' };
  }, [comparisonTotals, comparisonType]);

  const renderKPICards = useCallback((cards: any[], comparisonMetrics?: any) => {
    const enriched = cards.map((kpi: any) => {
      const formattedValue = (() => {
        if (kpi.format === 'currency') {
          if (kpi.key === 'cpc' || kpi.key === 'aov') return formatNumber(kpi.value, 'currency', undefined, 2);
          return formatNumber(kpi.value, 'currency');
        }
        if (kpi.format === 'percent') return `${kpi.value.toFixed(2)}%`;
        if (kpi.format === 'roas') return `${kpi.value.toFixed(1)}x`;
        return formatNumber(kpi.value);
      })();
      return {
        ...kpi,
        formattedValue,
        isCostMetric: ['cpc', 'cost', 'costOfSale'].includes(kpi.key),
      };
    });
    return <KPICardsSection cards={enriched} comparisonMetrics={comparisonMetrics} />;
  }, []);

  const renderKPICardsSkeleton = useCallback(() => <KPICardsSkeleton />, []);

  const renderChartSkeleton = useCallback(() => (
    <Card>
      <CardContent className="p-6">
        {/* Header row: title + two dropdowns */}
        <div className="flex items-center justify-between mb-4">
          <Skeleton className="h-4 w-24" />
          <div className="flex gap-2">
            <Skeleton className="h-8 w-[120px]" />
            <Skeleton className="h-8 w-[90px]" />
          </div>
        </div>
        {/* Y-axis labels + chart area */}
        <div className="flex gap-3 h-[250px]">
          <div className="flex flex-col justify-between pb-5 w-10">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-3 w-8" />)}
          </div>
          <div className="flex-1 flex flex-col justify-end gap-0 relative">
            {/* Simulated area chart with stacked bars of varying heights */}
            <div className="absolute inset-0 flex items-end gap-[3px] px-1">
              {[55,70,60,80,75,90,65,85,70,95,80,75].map((h, i) => (
                <Skeleton key={i} className="flex-1 rounded-t-sm animate-pulse" style={{ height: `${h}%`, animationDelay: `${i * 80}ms` }} />
              ))}
            </div>
          </div>
        </div>
        {/* X-axis labels */}
        <div className="flex gap-[3px] mt-2 pl-13">
          {[...Array(12)].map((_, i) => <Skeleton key={i} className="flex-1 h-3" />)}
        </div>
      </CardContent>
    </Card>
  ), []);

  const renderTableSkeleton = useCallback(() => (
    <Card>
      <CardContent className="p-6">
        <Skeleton className="h-5 w-40 mb-4" />
        <div className="space-y-0">
          {/* Header row */}
          <div className="flex gap-3 pb-3 border-b border-border">
            {[120, 80, 80, 60, 80, 80, 70, 80, 80, 70, 80].map((w, i) => (
              <Skeleton key={i} className="h-3" style={{ width: w, flexShrink: 0 }} />
            ))}
          </div>
          {/* Data rows */}
          {[...Array(4)].map((_, row) => (
            <div key={row} className="flex gap-3 py-3 border-b border-border">
              {[120, 80, 80, 60, 80, 80, 70, 80, 80, 70, 80].map((w, i) => (
                <Skeleton key={i} className="h-4" style={{ width: w * (0.6 + Math.random() * 0.5), flexShrink: 0, animationDelay: `${(row * 11 + i) * 40}ms` }} />
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  ), []);

  // ========== Revenue Type state ==========
  const [revenueType, setRevenueType] = useState<'booking_date' | 'checkin_date'>('booking_date');

  // ========== Budget monthly data ==========
  const budgetMonthlyData = useBudgetMonthlyData(
    effectivePivotData,
    selectedViewId,
    viewBudgets,
    selectedYear,
    false,
    () => []
  );

  // ========== AI Summary ==========
  // AI Summary feature removed (full removal)

  // ========== Loading & empty states (prevent blank page) ==========
  if (isResolvingAccount) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Loading your account…</p>
        </div>
      </div>
    );
  }

  if (user && !accountId) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>No account</CardTitle>
            <CardDescription>
              Your user is not linked to an account. Please contact your administrator or sign in with a different account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="ghost" className="px-0 text-muted-foreground hover:text-foreground" onClick={handleSignOut}>
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const hasAnyDataSource = !!(accountReportIds.metasearch || accountReportIds.sem || accountReportIds.social);
  if (accountId && !slideReportId && !isSlideReportsLoading) {
    if (hasAnyDataSource) {
      return (
        <div className="flex h-screen items-center justify-center bg-background">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Setting up Data Studio…</p>
          </div>
        </div>
      );
    }
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Get started</CardTitle>
            <CardDescription>
              Add a data source (Google Sheets or CSV) to see your Data Studio report. You can connect sources from the Data Sources page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate(accountId ? `/tools/data-sources/${accountId}` : "/tools/data-sources")}>
              <Database className="h-4 w-4 mr-2" />
              Go to Data Sources
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ========== JSX Return ==========
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Full-width fixed loading bar — gentle pulse glow across the entire top edge */}
      <div
        className={cn(
          "fixed top-0 left-0 right-0 h-[2px] z-[9999] transition-opacity duration-500",
          isLoadingSlideContent ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        style={{
          background: 'hsl(var(--primary))',
          animation: isLoadingSlideContent ? 'loading-pulse 1.8s ease-in-out infinite' : 'none',
        }}
      />

      {/* Left sidebar */}
      <ReportSidebar
        selectedTab={selectedTab}
        onTabChange={setSelectedTab}
        reportName={slideReport?.name}
        userLabel={userLabel}
        onSignOut={handleSignOut}
        onDataSources={() => navigate(accountId ? `/tools/data-sources/${accountId}` : '/tools/data-sources')}
        onDimensions={() => navigate(accountId ? `/tools/dimensions/${accountId}` : '/tools/dimensions')}
        selectedViewId={selectedViewId}
        setSelectedViewId={setSelectedViewId}
        availableViews={availableViews}
        handleApplyView={handleApplyView}
        handleDeleteView={handleDeleteView}
        setIsSaveViewDialogOpen={setIsSaveViewDialogOpen}
        setIsSaveOrUpdateViewDialogOpen={setIsSaveOrUpdateViewDialogOpen}
        isReadOnlyMode={isReadOnlyMode}
      />

      {/* Main column: topbar + content */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
      <DimensionSettingsModal
        open={dimensionSettingsOpen}
        onOpenChange={setDimensionSettingsOpen}
        mode={dimensionSettingsMode}
        initialChannel={dimensionSettingsInitialChannel}
        filterDimensions={{
          metasearch: (dimensions.metasearch || []).filter((d) => d.type === "text"),
          sem: (dimensions.sem || []).filter((d) => d.type === "text"),
          social: (dimensions.social || []).filter((d) => d.type === "text"),
        }}
        breakdownDimensions={{
          metasearch: (breakdownDimensions.metasearch || []).filter((d) => d.type === "text"),
          sem: (breakdownDimensions.sem || []).filter((d) => d.type === "text"),
          social: (breakdownDimensions.social || []).filter((d) => d.type === "text"),
        }}
        value={dimensionSettingsValue}
        onApply={persistDimensionSettings}
        disabled={isReadOnlyMode}
      />
      {/* Data Studio: subtle background refresh indicator (non-blocking) */}
      {isDataStudio && dataStudioRefreshStatus === 'refreshing' && (
        <div className="fixed top-2 right-2 z-50 flex items-center gap-2 bg-background/90 border border-border rounded-lg px-3 py-2">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Refreshing from sources…</span>
        </div>
      )}
      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Filters Row */}
        <div className="px-6 py-2 border-b">
          <FiltersRow
            selectedTab={selectedTab}
            isReadOnlyMode={isReadOnlyMode}
            selectedYear={selectedYear}
            selectedMonth={selectedMonth}
            customDateRange={customDateRange}
            comparisonType={comparisonType}
            onDateApply={handleDateApply}
            onOpenFilters={() => dsFilters.setFilterPanelOpen(true)}
            activeFilterCount={dsFilters.activeFilterCount}
            filterConfigs={dsFilters.filterConfigs}
            filterOptions={dsFilters.filterOptions}
            filterValues={filterValues}
            dimensionNames={dsFilters.filterDimensionNames}
            onToggleFilterValue={dsFilters.setChannelFilterValue}
            onClearFilter={dsFilters.clearChannelFilter}
            onResetAllFilters={dsFilters.resetFilters}
            onShare={() => setIsShareModalOpen(true)}
            onRefreshData={handleRefreshDataWithModal}
            isRefreshInProgress={isRefreshModalOpen}
            showRefreshButton={!slideReport?.configuration?.isChildReport}
          />
        </div>

        {/* Filter Panel — slides in from the right when "Filters" is clicked */}
        <FilterPanel
          open={dsFilters.filterPanelOpen}
          onOpenChange={dsFilters.setFilterPanelOpen}
          selectedTab={selectedTab}
          filterConfigs={dsFilters.filterConfigs}
          dimensionNames={dsFilters.filterDimensionNames}
          activeFilterCount={dsFilters.activeFilterCount}
          availableDimensions={{
            metasearch: (breakdownDimensions.metasearch || []).filter((d) => d.type === 'text'),
            sem: (breakdownDimensions.sem || []).filter((d) => d.type === 'text'),
            social: (breakdownDimensions.social || []).filter((d) => d.type === 'text'),
          }}
          onToggleDimension={handleFilterDimensionToggle}
          isReadOnly={isReadOnlyMode}
        />

        {/* Comparison Banner */}
        {comparisonType !== 'none' && (
          <ComparisonBanner
            comparisonType={comparisonType}
            selectedTab={selectedTab}
            selectedYear={selectedYear}
            selectedMonth={selectedMonth}
            customDateRange={customDateRange}
          />
        )}

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {/* Overview Tab */}
          <TabsContent value="overview" className="mt-0">
            <OverviewTab
              slideReportId={slideReportId}
              isSlideReportsLoading={isSlideReportsLoading}
              slideReport={slideReport}
              isLoadingData={isLoadingSlideContent}
              isLoadingMonthlyData={isLoadingMonthlyData}
              currentTotals={currentTotals}
              overviewChartData={effectiveOverviewChartData}
              comparisonChartData={comparisonOverviewChartData}
              chartMetric={chartMetric}
              setChartMetric={setChartMetric}
              chartGranularity={chartGranularity}
              setChartGranularity={setChartGranularity}
              selectedYear={selectedYear}
              selectedMonth={selectedMonth}
              isReadOnlyMode={isReadOnlyMode}
              setIsEditSourceOpen={setIsEditSourceOpen}
              renderKPICards={renderKPICards}
              renderKPICardsSkeleton={renderKPICardsSkeleton}
              renderChartSkeleton={renderChartSkeleton}
              renderTableSkeleton={renderTableSkeleton}
              getOverviewComparisonMetrics={getOverviewComparisonMetrics}
              filteredData={filteredData}
              slideType={slideType}
              KPI_CARDS={KPI_CARDS}
              comparisonTotals={comparisonTotals}
              comparisonType={comparisonType}
            />
          </TabsContent>

          {/* Channel Tabs */}
          {(['metasearch', 'sem', 'social'] as const).map(channel => (
            <TabsContent key={channel} value={channel} className="mt-0">
              <ChannelTab
                channel={channel}
                isSlideReportsLoading={isSlideReportsLoading}
                slideReportId={slideReportId}
                slideReport={slideReport}
                pivotData={effectivePivotData}
                isLoadingData={isLoadingSlideContent}
                currentTotals={currentTotals}
                channelChartData={effectiveChannelChartData}
                comparisonChannelChartData={comparisonEffectiveChannelChartData}
                chartMetric={chartMetric}
                setChartMetric={setChartMetric}
                chartGranularity={chartGranularity}
                setChartGranularity={setChartGranularity}
                groupByDimension={groupByDimension[channel] || DEFAULT_GROUPBY[channel] || 'account'}
                breakdownByDimension={breakdownByDimension[channel] || DEFAULT_BREAKDOWNBY[channel] || 'campaign'}
                expandedRow={expandedRow}
                setExpandedRow={setExpandedRow}
                setGroupByDimension={(val) => setGroupByDimension(channel, val)}
                setBreakdownByDimension={(val) => setBreakdownByDimension(channel, val)}
                selectedYear={selectedYear}
                selectedMonth={selectedMonth}
                customDateRange={customDateRange}
                filterValues={filterValues}
                filterDimensionValues={filterDimensionValues}
                breakdownDimensions={Object.fromEntries(
                  (Object.keys(breakdownDimensions) as ('metasearch' | 'sem' | 'social')[]).map((ch) => {
                    const validNames = new Set((CHANNEL_DIMENSION_NAMES[ch] || []).map((n) => n.toLowerCase()));
                    return [
                      ch,
                      validNames.size > 0
                        ? (breakdownDimensions[ch] || []).filter((d) => validNames.has(d.name.toLowerCase()))
                        : (breakdownDimensions[ch] || []),
                    ];
                  })
                ) as Record<string, { id: string; name: string; type: string }[]>}
                breakdownConfigs={breakdownConfigs}
                renderKPICards={renderKPICards}
                renderKPICardsSkeleton={renderKPICardsSkeleton}
                getReportKPICards={getReportKPICards}
                getChannelComparisonMetrics={getChannelComparisonMetrics}
                comparisonTotals={comparisonTotals}
                comparisonType={comparisonType}
                displayCurrency={undefined}
                onOpenBreakdownDimensionSettings={(ch) => {
                  setDimensionSettingsMode("breakdowns");
                  setDimensionSettingsInitialChannel(ch);
                  setDimensionSettingsOpen(true);
                }}
                configuredDimensionNames={configuredDimensionNames}
              />
            </TabsContent>
          ))}

          {/* Budget Tab */}
          <TabsContent value="budget" className="mt-0">
            <BudgetTab
              selectedYear={selectedYear}
              setSelectedYear={setSelectedYear}
              selectedViewId={selectedViewId}
              setSelectedViewId={setSelectedViewId}
              isReadOnlyMode={isReadOnlyMode}
              views={views.map(v => ({ id: v.id, name: v.name }))}
              handleApplyView={handleApplyView}
              isLoadingViewBudgets={isLoadingViewBudgets}
              isLoadingDisplayData={isLoadingSlideContent}
              budgetMonthlyData={budgetMonthlyData}
              slideReport={slideReport}
              pivotData={effectivePivotData}
              forecastEnabled={forecastEnabled}
              setForecastEnabled={setForecastEnabled}
              pnlModeEnabled={pnlModeEnabled}
              setPnlModeEnabled={setPnlModeEnabled}
              editingBudget={editingBudget}
              editBudgetValue={editBudgetValue}
              handleStartEditBudget={handleStartEditBudget}
              handleSaveBudget={handleSaveBudget}
              handleCancelEditBudget={handleCancelEditBudget}
              setEditBudgetValue={setEditBudgetValue}
              editingPnl={editingPnl}
              editPnlValue={editPnlValue}
              handleStartEditPnl={handleStartEditPnl}
              handleSavePnl={handleSavePnl}
              handleCancelEditPnl={handleCancelEditPnl}
              setEditPnlValue={setEditPnlValue}
              pnlConfig={pnlConfig}
              setPnlConfig={setPnlConfig}
            />
          </TabsContent>

          {/* Booking Tab */}
          <TabsContent value="booking" className="mt-0">
            <BookingTab accountId={accountId} />
          </TabsContent>

          {/* Price Check Tab */}
          <TabsContent value="price-check" className="mt-0">
            <PriceCheckTab
              accountId={accountId}
              chartTimeRange={priceCheckChartTimeRange}
              onChartTimeRangeChange={setPriceCheckChartTimeRange}
            />
          </TabsContent>
        </div>
      </Tabs>
      </div>{/* end main column */}

      {/* Modals */}
      <EditSourceModal
        isOpen={isEditSourceOpen}
        onOpenChange={setIsEditSourceOpen}
        handleModalClose={setIsEditSourceOpen}
        modalStep={modalStep}
        handleNext={handleNext}
        handleBack={handleBack}
        selectedDimensions={selectedDimensions}
        handleDimensionToggle={handleDimensionToggle}
        selectedChannels={selectedChannels}
        activeChannelTab={activeChannelTab}
        setActiveChannelTab={setActiveChannelTab}
        dimensions={dimensions}
        dimensionValues={dimensionValues}
        loadingDimensions={loadingDimensions}
        loadingValues={loadingValues}
        channelConfigs={channelConfigs}
        handleDimensionChange={handleDimensionChange}
        handleValueToggle={handleValueToggle}
        handleSelectAllValues={handleSelectAllValues}
        handleDeselectAllValues={handleDeselectAllValues}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        breakdownDimensions={breakdownDimensions}
        breakdownConfigs={breakdownConfigs}
        handleBreakdownToggle={handleBreakdownToggle}
        loadingBreakdownDimensions={loadingBreakdownDimensions}
        filterConfigs={filterConfigs}
        handleFilterDimensionToggle={handleFilterDimensionToggle}
        availableDimensions={availableDimensions}
        selectedValueDimensionIds={selectedValueDimensionIds}
        handleValueDimensionToggle={handleValueDimensionToggle}
        handleSelectAllDimensions={handleSelectAllDimensions}
        handleDeselectAllDimensions={handleDeselectAllDimensions}
        loadingAvailableDimensions={loadingAvailableDimensions}
      />

      <RefreshDataModal
        open={isRefreshModalOpen}
        onOpenChange={setIsRefreshModalOpen}
        slideReportId={slideReportId}
        slideReport={slideReport}
        refreshStep={refreshStep}
        setRefreshStep={setRefreshStep}
        refreshStepStatus={refreshStepStatus}
        setRefreshStepStatus={setRefreshStepStatus}
        refreshError={refreshError}
        setRefreshError={setRefreshError}
        isDataStudio={isDataStudio}
        onStartRefresh={handleStartRefresh}
        refreshMode={activeRefreshMode}
        rowsProcessed={refreshRowsProcessed}
      />

      {isDataModalOpen && slideReportId && (
        <SlideDataBrowser
          slideReportId={slideReportId}
          configuration={slideReport?.configuration as any}
          lastRefreshedAt={slideReport?.last_refreshed_at}
          reportIds={slideReport?.report_ids as any}
          pivotData={effectivePivotData}
          open={isDataModalOpen}
          onOpenChange={setIsDataModalOpen}
        />
      )}

      {isShareModalOpen && (
        <ShareModal
          open={isShareModalOpen}
          onOpenChange={setIsShareModalOpen}
          reportId={slideReportId}
          reportName={slideReport?.name || 'Report'}
          slideReportId={slideReportId}
          accountId={accountId}
          currentFilterValues={filterValues}
        />
      )}

      <SaveViewDialog
        open={isSaveViewDialogOpen}
        onOpenChange={setIsSaveViewDialogOpen}
        onSave={handleSaveView}
      />

      <SaveOrUpdateViewDialog
        open={isSaveOrUpdateViewDialogOpen}
        onOpenChange={setIsSaveOrUpdateViewDialogOpen}
        onSaveNew={() => {
          setIsSaveOrUpdateViewDialogOpen(false);
          setIsSaveViewDialogOpen(true);
        }}
        onUpdate={handleUpdateView}
        availableViews={availableViews}
        currentViewId={selectedViewId}
      />
    </div>
  );
}
