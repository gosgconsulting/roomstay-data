/**
 * Canonical filter hook for Data Studio.
 *
 * Single source of truth for:
 *  - date range (customDateRange + selectedYear/selectedMonth for legacy sync)
 *  - comparison type
 *  - selected filter values per channel (applied to rows)
 *  - available filter dimension options per channel (derived from rawDataRows)
 *  - filter configuration (which dimension IDs are enabled) – mirrors slide_reports.configuration.filterConfigs
 *
 * Design rules:
 *  - Options are derived in-memory from rawDataRows only. No DB or pivot fallback.
 *  - filterValues feeds directly into useFilteredSlideData (unchanged API).
 *  - Configuration changes are persisted to slide_reports.configuration via updateSlideReport.
 *  - View application (saved view) restores selection values + date only.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { DateRange } from 'react-day-picker';
import {
  buildMultiMonthDateRange,
  dateRangeFromPreset,
  dateRangeToSlideSelection,
  getCurrentMonthToDateRange,
  slideSelectionToDateRange,
} from '@/lib/monthUtils';
import { filterRawDataRows, getRowKeysForSameNamedDimension } from '@/lib/slideViewHelpers';
import type { SlideReportConfiguration, SlideReportView } from '@/types/slideReports';

type Channel = 'metasearch' | 'sem' | 'social';

/** Options for applyView (saved view vs master reset). */
export type ApplyViewOptions = {
  /** When true, do not restore date from the view row (e.g. public share: date comes from session / share_links). */
  skipDateRestore?: boolean;
  /** After applying filter values, set date to current month-to-date (master default). Used with skipDateRestore for owner share-preview URLs. */
  applyMasterDefaultDate?: boolean;
};

/** Which dimension IDs are enabled as filter dropdowns per channel. */
export type FilterConfigs = Record<Channel, { filterDimensionIds: string[] }>;

/**
 * Selected values per channel: channel -> dimensionId -> selectedValues[].
 * 
 * ALWAYS channel-based format:
 * ```typescript
 * {
 *   metasearch: { [dimensionId]: string[] },
 *   sem: { [dimensionId]: string[] },
 *   social: { [dimensionId]: string[] }
 * }
 * ```
 * 
 * NEVER report-based format (deprecated):
 * ```typescript
 * { [reportId]: { [dimensionId]: string[] } }
 * ```
 */
export type FilterValues = Record<string, Record<string, string[]>>;

/** Options per channel: channel -> dimensionId -> sortedUniqueValues[]. */
export type FilterOptions = Record<Channel, Record<string, string[]>>;

/** Dimension name lookup: dimensionId -> name. */
export type DimensionNameMap = Record<string, string>;

// Channel-scoped dimension allowlist (mirrors CHANNEL_DIMENSION_NAMES in SlideViewPage).
const CHANNEL_FILTER_NAMES: Record<Channel, string[]> = {
  metasearch: ['Hotel', 'Channel', 'Device', 'Link Type', 'Market'],
  sem: ['Account', 'Campaign', 'Ad Group'],
  social: ['Account', 'Campaign', 'Ad Group'],
};

const EMPTY_FILTER_VALUES: FilterValues = {
  metasearch: {},
  sem: {},
  social: {},
  'price-check': {},
  booking: {},
};

const EMPTY_FILTER_OPTIONS: FilterOptions = {
  metasearch: {},
  sem: {},
  social: {},
};

/**
 * Resolve the lookup key for a filter dimension ID against rows in rawDataRows.
 *
 * Raw rows are keyed by report-specific dimension IDs. Filter configs store global
 * dimension UUIDs which are different. Resolution strategy:
 *  1. If the configured ID is directly a row key — use it as-is.
 *  2. Look up the human name for the configured ID:
 *     a. From dimensionMap (report-specific ID → name) — covers the case where the
 *        configured ID happens to match a report-specific ID.
 *     b. From configuredDimNames (global ID → name) — covers the common case where
 *        the configured ID is a global UUID not present in row keys.
 *  3. Find the row key whose name matches the human name found above.
 */
function resolveFilterDimKey(
  filterDimId: string,
  dimensionMap: Record<string, string>,
  sampleRowKeys: Set<string>,
  configuredDimNames?: Record<string, string>
): string {
  if (sampleRowKeys.has(filterDimId)) return filterDimId;

  // Get the human name for this configured ID from either source.
  const wantedName = dimensionMap[filterDimId] ?? configuredDimNames?.[filterDimId];
  if (wantedName) {
    for (const [id, name] of Object.entries(dimensionMap)) {
      if (name === wantedName && sampleRowKeys.has(id)) return id;
    }
  }
  return filterDimId;
}

/**
 * Extract sorted unique string values for a dimension ID from rawDataRows.
 * Handles global-ID ↔ report-specific-ID mismatch via name-based resolution.
 */
function extractUniqueValues(
  rows: Record<string, any>[],
  filterDimId: string,
  dimensionMap: Record<string, string>,
  configuredDimNames?: Record<string, string>
): string[] {
  if (rows.length === 0) return [];
  const combinedDimNames = configuredDimNames
    ? { ...dimensionMap, ...configuredDimNames }
    : dimensionMap;
  const keys = getRowKeysForSameNamedDimension(filterDimId, combinedDimNames);

  const unique = new Set<string>();
  for (const row of rows) {
    for (const key of keys) {
      const val = row[key];
      if (val !== undefined && val !== null) {
        const s = String(val).trim();
        if (s !== '') {
          unique.add(s);
          break;
        }
      }
    }
  }
  return Array.from(unique).sort();
}

export interface UseDataStudioFiltersParams {
  /** Effective pivot data from useSlideReportPage — provides rawDataRows + dimensionMaps. */
  effectivePivotData: {
    channels: Record<string, {
      rawDataRows?: Record<string, any>[];
      dimensionMap?: Record<string, string>;
    }>;
  } | null;
  /** Loaded from slide_reports.configuration on report change. */
  initialFilterConfigs: FilterConfigs;
  /** Called when filter config changes so caller can persist to DB. */
  onPersistFilterConfigs: (next: FilterConfigs) => void;
  /** Available views for apply-view logic. */
  views: SlideReportView[];
  /** Disabled in read-only / shared views. */
  isReadOnly?: boolean;
  /**
   * Externally-controlled filter values state.
   * When provided, the hook manages filterValues by calling these setters instead of
   * owning its own useState — allowing filterValues to be declared before useSlideReportPage.
   */
  externalFilterValues?: Record<string, Record<string, string[]>>;
  setExternalFilterValues?: (v: Record<string, Record<string, string[]>>) => void;
  /** Externally-controlled date state (must be declared before useSlideReportPage). */
  externalCustomDateRange?: import('react-day-picker').DateRange | undefined;
  setExternalCustomDateRange?: (v: import('react-day-picker').DateRange | undefined) => void;
  externalComparisonType?: string;
  setExternalComparisonType?: (v: string) => void;
  /** Year used for date selection sync. */
  selectedYear: string;
  setSelectedYear: (v: string) => void;
  selectedMonth: string;
  setSelectedMonth: (v: string) => void;
  /**
   * Flat map of globalDimensionId → humanName for all configured filter dimensions.
   * Used to resolve global IDs (stored in filterConfigs) to the row keys in rawDataRows
   * (which use report-specific IDs). Built from breakdownDimensions in the parent page.
   */
  configuredDimensionNames?: Record<string, string>;
}

export interface UseDataStudioFiltersReturn {
  /* ── Date ── */
  customDateRange: DateRange | undefined;
  setCustomDateRange: (r: DateRange | undefined) => void;
  comparisonType: string;
  setComparisonType: (v: string) => void;

  /* ── Filter config (which dims are enabled per channel) ── */
  filterConfigs: FilterConfigs;
  setFilterConfigs: (v: FilterConfigs) => void;

  /* ── Applied filter values (fed to useFilteredSlideData) ── */
  filterValues: FilterValues;
  setFilterValues: (v: FilterValues) => void;

  /* ── Available options per channel (derived from rawDataRows) ── */
  filterOptions: FilterOptions;
  filterDimensionNames: DimensionNameMap;

  /* ── Active filter count for badge ── */
  activeFilterCount: number;

  /* ── Actions ── */
  resetFilters: () => void;
  applyPreset: (preset: string) => void;
  applyView: (view: SlideReportView | null, options?: ApplyViewOptions) => void;
  setChannelFilterValue: (channel: Channel, dimensionId: string, values: string[]) => void;
  clearChannelFilter: (channel: Channel, dimensionId: string) => void;
  persistFilterConfigs: (next: FilterConfigs) => void;

  /* ── Filter panel open state ── */
  filterPanelOpen: boolean;
  setFilterPanelOpen: (v: boolean) => void;
}

export function useDataStudioFilters({
  effectivePivotData,
  initialFilterConfigs,
  onPersistFilterConfigs,
  views,
  isReadOnly = false,
  externalFilterValues,
  setExternalFilterValues,
  externalCustomDateRange,
  setExternalCustomDateRange,
  externalComparisonType,
  setExternalComparisonType,
  selectedYear,
  setSelectedYear,
  selectedMonth,
  setSelectedMonth,
  configuredDimensionNames = {},
}: UseDataStudioFiltersParams): UseDataStudioFiltersReturn {
  const [_internalCustomDateRange, _setInternalCustomDateRange] = useState<DateRange | undefined>(undefined);
  const [_internalComparisonType, _setInternalComparisonType] = useState('none');
  const [filterConfigs, setFilterConfigsRaw] = useState<FilterConfigs>(initialFilterConfigs);
  const [_internalFilterValues, _setInternalFilterValues] = useState<FilterValues>(EMPTY_FILTER_VALUES);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  // Use externally-controlled state when a setter is supplied. `undefined` is a valid controlled
  // value for customDateRange, so checking only the value would incorrectly fall back to internal
  // state and prevent the page-level owner from ever receiving the applied custom range.
  const isCustomDateRangeControlled = typeof setExternalCustomDateRange === 'function';
  const isComparisonTypeControlled = typeof setExternalComparisonType === 'function';
  const isFilterValuesControlled = typeof setExternalFilterValues === 'function';

  const customDateRange = isCustomDateRangeControlled ? externalCustomDateRange : _internalCustomDateRange;
  const setCustomDateRangeRaw = isCustomDateRangeControlled
    ? setExternalCustomDateRange
    : _setInternalCustomDateRange;
  const comparisonType = isComparisonTypeControlled ? (externalComparisonType ?? 'none') : _internalComparisonType;
  const setComparisonTypeRaw = isComparisonTypeControlled
    ? setExternalComparisonType
    : _setInternalComparisonType;
  const filterValues = isFilterValuesControlled ? (externalFilterValues ?? EMPTY_FILTER_VALUES) : _internalFilterValues;
  const setFilterValuesRaw: (v: FilterValues) => void = isFilterValuesControlled
    ? setExternalFilterValues
    : _setInternalFilterValues;

  // Sync filterConfigs when the report changes (initialFilterConfigs comes from slideReport.configuration).
  const lastInitRef = useRef<string>('');
  useEffect(() => {
    const key = JSON.stringify(initialFilterConfigs);
    if (key === lastInitRef.current) return;
    lastInitRef.current = key;
    setFilterConfigsRaw(initialFilterConfigs);
  }, [initialFilterConfigs]);

  // ── Derive filter options in-memory from rawDataRows ────────────────────────
  const filterOptions = useMemo((): FilterOptions => {
    const result: FilterOptions = { metasearch: {}, sem: {}, social: {} };
    const channels: Channel[] = ['metasearch', 'sem', 'social'];
    const optionDateRange = customDateRange?.from
      ? {
          start: customDateRange.from,
          end: new Date(
            (customDateRange.to ?? customDateRange.from).getFullYear(),
            (customDateRange.to ?? customDateRange.from).getMonth(),
            (customDateRange.to ?? customDateRange.from).getDate(),
            23, 59, 59, 999
          ),
        }
      : buildMultiMonthDateRange(selectedYear, selectedMonth);

    for (const channel of channels) {
      const channelData = effectivePivotData?.channels?.[channel];
      if (!channelData) continue;
      const rows = channelData.rawDataRows ?? [];
      const dimMap = channelData.dimensionMap ?? {};
      const combinedDimNames = configuredDimensionNames
        ? { ...dimMap, ...configuredDimensionNames }
        : dimMap;
      const enabledIds = filterConfigs[channel]?.filterDimensionIds ?? [];
      const channelFilterValues = filterValues[channel] ?? {};
      // Treat undefined as "All" (no filter), and [] as "None" (exclude all).
      // We keep [] so it properly filters out all rows for option derivation.
      const normalizedChannelFilterValues: Record<string, string[]> = Object.fromEntries(
        Object.entries(channelFilterValues).filter(([, values]) => Array.isArray(values))
      );

      for (const dimId of enabledIds) {
        // Build options for each dimension from rows filtered by all OTHER active
        // filters (and date), so options remain constrained by the view without
        // self-filtering into empty sets.
        const otherFilterValues: Record<string, string[]> = Object.fromEntries(
          Object.entries(normalizedChannelFilterValues).filter(([filterId]) => filterId !== dimId)
        );
        const scopedRows = filterRawDataRows(
          rows as any,
          otherFilterValues,
          optionDateRange ?? undefined,
          combinedDimNames
        );

        // Resolve the human name for this configured ID. It may be a global UUID not
        // present in dimMap, so fall back to configuredDimensionNames.
        const resolvedName = dimMap[dimId] ?? configuredDimensionNames[dimId];
        // Guard: skip if the resolved name is known but not valid for this channel.
        const allowedNames = new Set(
          (CHANNEL_FILTER_NAMES[channel] || []).map((n) => n.toLowerCase())
        );
        if (resolvedName && allowedNames.size > 0 && !allowedNames.has(resolvedName.toLowerCase())) continue;
        result[channel][dimId] = extractUniqueValues(scopedRows, dimId, dimMap, configuredDimensionNames);
      }
    }
    return result;
  }, [
    effectivePivotData,
    filterConfigs,
    configuredDimensionNames,
    filterValues,
    customDateRange,
    selectedYear,
    selectedMonth,
  ]);

  // ── Build a flat dimensionId -> name map from all channels ──────────────────
  // Also includes entries for configured filter dimension IDs (which may be global IDs
  // not present directly in the dimMap) by resolving their name via key-matching.
  const filterDimensionNames = useMemo((): DimensionNameMap => {
    const names: DimensionNameMap = {};
    for (const channel of ['metasearch', 'sem', 'social'] as Channel[]) {
      const channelData = effectivePivotData?.channels?.[channel];
      const dimMap = channelData?.dimensionMap ?? {};
      // Include all report-specific IDs
      Object.assign(names, dimMap);

      // Also resolve configured filter dimension IDs to their names.
      // A configured ID may be a global ID not in dimMap keys; resolve by name-match.
      const rows = channelData?.rawDataRows ?? [];
      const sampleKeys = rows.length > 0 ? new Set(Object.keys(rows[0])) : new Set<string>();
      const enabledIds = filterConfigs[channel]?.filterDimensionIds ?? [];
      for (const dimId of enabledIds) {
        if (names[dimId]) continue; // already resolved
        // Check configuredDimensionNames first (global ID → human name, built from breakdownDimensions)
        if (configuredDimensionNames[dimId]) {
          names[dimId] = configuredDimensionNames[dimId];
          continue;
        }
        // Look up by name in dimMap (report-specific ID → name)
        const directName = dimMap[dimId];
        if (directName) {
          names[dimId] = directName;
          continue;
        }
        // Try resolving the actual row key, then get its name
        const resolvedKey = resolveFilterDimKey(dimId, dimMap, sampleKeys, configuredDimensionNames);
        if (resolvedKey !== dimId && dimMap[resolvedKey]) {
          names[dimId] = dimMap[resolvedKey];
        }
      }
    }
    return names;
  }, [effectivePivotData, filterConfigs, configuredDimensionNames]);

  // ── Active filter count (dimension selections only, not date) ───────────────
  const activeFilterCount = useMemo(() => {
    let count = 0;
    for (const ch of Object.values(filterValues)) {
      for (const vals of Object.values(ch)) {
        if (vals && vals.length > 0) count++;
      }
    }
    return count;
  }, [filterValues]);

  // ── Guards ──────────────────────────────────────────────────────────────────
  const setCustomDateRange = useCallback((r: DateRange | undefined) => {
    if (isReadOnly) return;
    setCustomDateRangeRaw(r);
    if (r?.from) {
      const next = dateRangeToSlideSelection(r);
      setSelectedYear(next.year);
      setSelectedMonth(next.month);
    }
  }, [isReadOnly, setSelectedYear, setSelectedMonth]);

  const setComparisonType = useCallback((v: string) => {
    if (isReadOnly) return;
    setComparisonTypeRaw(v);
  }, [isReadOnly]);

  const setFilterValues = useCallback((v: FilterValues) => {
    if (isReadOnly) return;
    setFilterValuesRaw(v);
  }, [isReadOnly]);

  const setFilterConfigs = useCallback((v: FilterConfigs) => {
    setFilterConfigsRaw(v);
  }, []);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const resetFilters = useCallback(() => {
    if (isReadOnly) return;
    setFilterValuesRaw(EMPTY_FILTER_VALUES);
    setComparisonTypeRaw('none');
    const range = getCurrentMonthToDateRange();
    const next = dateRangeToSlideSelection(range);
    setCustomDateRangeRaw(range);
    setSelectedYear(next.year);
    setSelectedMonth(next.month);
  }, [isReadOnly, setSelectedYear, setSelectedMonth]);

  const applyPreset = useCallback((preset: string) => {
    if (isReadOnly) return;
    if (preset === 'all_time') {
      setCustomDateRangeRaw(undefined);
      setSelectedYear('all');
      setSelectedMonth('all');
      setComparisonTypeRaw('none');
      return;
    }
    const presetRange = dateRangeFromPreset(preset);
    if (presetRange) {
      setCustomDateRangeRaw(presetRange);
      const next = dateRangeToSlideSelection(presetRange);
      setSelectedYear(next.year);
      setSelectedMonth(next.month);
    }
  }, [isReadOnly, setSelectedYear, setSelectedMonth]);

  const applyView = useCallback((view: SlideReportView | null, options?: ApplyViewOptions) => {
    if (!view) {
      // Reset to master — clear filters, comparison, and date back to month-to-date.
      setFilterValuesRaw(EMPTY_FILTER_VALUES);
      setComparisonTypeRaw('none');
      if (!options?.skipDateRestore) {
        const range = getCurrentMonthToDateRange();
        const next = dateRangeToSlideSelection(range);
        setCustomDateRangeRaw(range);
        setSelectedYear(next.year);
        setSelectedMonth(next.month);
      }
      return;
    }
    const vf = view.filter_values || {};
    setFilterValuesRaw({
      metasearch: vf.metasearch || {},
      sem: vf.sem || {},
      social: vf.social || {},
      'price-check': vf['price-check'] || {},
      booking: vf.booking || {},
    });

    if (options?.applyMasterDefaultDate) {
      const range = getCurrentMonthToDateRange();
      const next = dateRangeToSlideSelection(range);
      setCustomDateRangeRaw(range);
      setSelectedYear(next.year);
      setSelectedMonth(next.month);
    } else if (!options?.skipDateRestore) {
      if (view.selected_year) setSelectedYear(view.selected_year);
      if (view.selected_month) setSelectedMonth(view.selected_month);

      // PRIORITY: Use custom_date_range if available (preserves exact dates for cross-year ranges)
      if ((view as any).custom_date_range) {
        const customRange = (view as any).custom_date_range as { from: string; to: string };
        setCustomDateRangeRaw({
          from: new Date(customRange.from),
          to: new Date(customRange.to)
        });
      } else if (view.selected_year) {
        // FALLBACK: Reconstruct from year/month (legacy views without custom_date_range)
        const restored = slideSelectionToDateRange(
          view.selected_year,
          view.selected_month || 'all'
        );
        setCustomDateRangeRaw(restored ?? undefined);
      }
    }
    
    // Always restore comparison_type from the view — including 'none', so switching
    // views doesn't silently keep a comparison active from a previous view.
    setComparisonTypeRaw(view.comparison_type ?? 'none');
  }, [setSelectedYear, setSelectedMonth]);

  const setChannelFilterValue = useCallback((
    channel: Channel,
    dimensionId: string,
    values: string[]
  ) => {
    if (isReadOnly) return;
    setFilterValuesRaw(prev => ({
      ...prev,
      [channel]: { ...prev[channel], [dimensionId]: values },
    }));
  }, [isReadOnly]);

  const clearChannelFilter = useCallback((channel: Channel, dimensionId: string) => {
    if (isReadOnly) return;
    setFilterValuesRaw(prev => {
      const next = { ...prev, [channel]: { ...prev[channel] } };
      delete next[channel][dimensionId];
      return next;
    });
  }, [isReadOnly]);

  const persistFilterConfigs = useCallback((next: FilterConfigs) => {
    setFilterConfigsRaw(next);
    onPersistFilterConfigs(next);
  }, [onPersistFilterConfigs]);

  return {
    customDateRange,
    setCustomDateRange,
    comparisonType,
    setComparisonType,
    filterConfigs,
    setFilterConfigs,
    filterValues,
    setFilterValues,
    filterOptions,
    filterDimensionNames,
    activeFilterCount,
    resetFilters,
    applyPreset,
    applyView,
    setChannelFilterValue,
    clearChannelFilter,
    persistFilterConfigs,
    filterPanelOpen,
    setFilterPanelOpen,
  };
}
