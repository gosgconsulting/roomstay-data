/**
 * Helper functions for SlideViewPage component
 */

import { isWithinInterval } from 'date-fns';
import { MONTH_NAMES } from '@/constants/slideViewConstants';
import { parseNumericValue } from '@/lib/parseNumericValue';
import type {
  RawDataRow,
  MetricData,
  DerivedMetrics,
} from '@/types/slideView';

/**
 * Parse an ISO date string (YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss) into a local Date.
 * Using new Date(isoString) treats date-only strings as UTC midnight, which shifts the
 * date by one day in negative-UTC-offset timezones. This function always produces a
 * local-midnight Date so that comparisons with range boundaries (also local midnight) are correct.
 */
function parseLocalDateString(value: string): Date | null {
  const dateOnly = String(value).substring(0, 10);
  const parts = dateOnly.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * When one channel has multiple data sources, the same logical column (e.g. Hotel) can be
 * stored under different dimension UUIDs. Filter options and filter matching must read
 * every key that shares the same display name in dimensionIdToName.
 */
export function getRowKeysForSameNamedDimension(
  filterDimId: string,
  dimensionIdToName: Record<string, string>
): string[] {
  const keys = new Set<string>();
  keys.add(filterDimId);
  const human = dimensionIdToName[filterDimId]?.trim();
  if (!human) return [...keys];
  const target = human.toLowerCase();
  for (const [id, name] of Object.entries(dimensionIdToName)) {
    if (name && name.trim().toLowerCase() === target) keys.add(id);
  }
  return [...keys];
}

/** First non-empty text value among all keys that map to the same dimension name as filterDimId. */
export function readRowTextDimensionValue(
  rowData: Record<string, unknown>,
  filterDimId: string,
  dimensionIdToName: Record<string, string>
): string | undefined {
  for (const key of getRowKeysForSameNamedDimension(filterDimId, dimensionIdToName)) {
    const v = rowData[key];
    if (v !== undefined && v !== null) {
      const s = String(v).trim();
      if (s !== '') return s;
    }
  }
  const human = dimensionIdToName[filterDimId];
  if (human) {
    const v = rowData[human];
    if (v !== undefined && v !== null) {
      const s = String(v).trim();
      if (s !== '') return s;
    }
  }
  return undefined;
}

/**
 * Calculate derived metrics from base metric data
 */
export const calculateDerivedMetrics = (
  data: MetricData
): DerivedMetrics => {
  // Ensure all values are numbers
  const impressions = Number(data.impressions) || 0;
  const clicks = Number(data.clicks) || 0;
  const cost = Number(data.cost) || 0;
  const revenue = Number(data.revenue) || 0;
  const bookings = Number(data.bookings) || 0;

  const cpc = clicks > 0 ? cost / clicks : 0;
  const aov = bookings > 0 ? revenue / bookings : 0;
  const roas = cost > 0 ? revenue / cost : 0;
  const costOfSale = revenue > 0 ? (cost / revenue) * 100 : 0;

  return {
    impressions,
    clicks,
    cost,
    revenue,
    bookings,
    ctr: clicks > 0 && impressions > 0 ? (clicks / impressions) * 100 : 0,
    conversionRate: clicks > 0 ? (bookings / clicks) * 100 : 0,
    cpc,
    aov,
    roas,
    costOfSale,
  };
};

/**
 * Check if filters are actually applied (not "All" selected)
 * @deprecated Use hasActiveFiltersForChannel for channel-specific checks or hasAnyActiveFilters for multi-channel checks
 */
export const hasActiveFilters = (
  filterValues: Record<string, string[]>
): boolean => {
  // If no filter values at all, no filters are applied
  if (!filterValues || Object.keys(filterValues).length === 0) {
    return false;
  }

  // Check each filter dimension
  for (const [, selectedValues] of Object.entries(filterValues)) {
    // If selectedValues is null/undefined, filter is not set - no filter
    if (!selectedValues) {
      continue;
    }
    
    // If empty array, it's an active filter that filters out everything
    if (selectedValues.length === 0) {
      return true; // Empty array is an active filter (shows zero data)
    }

    // If we have selected values that are a subset, filter is applied
    return true;
  }

  // No active filters found
  return false;
};

/**
 * True when this channel has at least one dimension with a non-empty selection.
 * Empty arrays mean "None" (exclude all) and do not count as positive filters.
 * Used with {@link hasAnyPositiveFilters} for the Exclusive Channel rule.
 */
const hasPositiveFiltersForChannel = (
  channelFilterValues: Record<string, string[]>
): boolean => {
  if (!channelFilterValues || Object.keys(channelFilterValues).length === 0) {
    return false;
  }
  for (const [, selectedValues] of Object.entries(channelFilterValues)) {
    if (selectedValues && selectedValues.length > 0) {
      return true;
    }
  }
  return false;
};

/**
 * Check if any channel has POSITIVE active filters (selections with >0 items)
 * Used to trigger the Exclusive Channel rule (zeroing out unfiltered channels)
 */
export const hasAnyPositiveFilters = (
  filterValues: Record<string, Record<string, string[]>>
): boolean => {
  if (!filterValues || Object.keys(filterValues).length === 0) {
    return false;
  }
  for (const channelFilters of Object.values(filterValues)) {
    if (hasPositiveFiltersForChannel(channelFilters)) {
      return true;
    }
  }
  return false;
};

/**
 * Check if a specific channel has active filters (including "None" / empty array)
 * Centralized filter detection logic for single channel
 * 
 * @param channelFilterValues - Filter values for the channel (dimensionId -> selectedValues[])
 * @returns true if channel has active filters, false otherwise
 */
export const hasActiveFiltersForChannel = (
  channelFilterValues: Record<string, string[]>
): boolean => {
  // If no filter values at all, no filters are applied
  if (!channelFilterValues || Object.keys(channelFilterValues).length === 0) {
    return false;
  }

  // Check each filter dimension
  for (const [, selectedValues] of Object.entries(channelFilterValues)) {
    // If selectedValues is null/undefined, filter is not set - no filter
    if (!selectedValues) {
      continue;
    }
    
    // Empty array means explicitly "None" (exclude all data). It IS an active filter.
    if (selectedValues.length === 0) {
      return true;
    }

    // Explicit selection is always a filter
    return true;
  }

  // No active filters found
  return false;
};

/**
 * Check if any channel has active filters across all channels
 * Multi-channel version of filter detection
 * 
 * @param filterValues - Filter values by channel (channel -> dimensionId -> selectedValues[])
 * @returns true if any channel has active filters, false otherwise
 */
export const hasAnyActiveFilters = (
  filterValues: Record<string, Record<string, string[]>>
): boolean => {
  if (!filterValues || Object.keys(filterValues).length === 0) {
    return false;
  }

  // Check each channel
  for (const channelFilters of Object.values(filterValues)) {
    if (hasActiveFiltersForChannel(channelFilters)) {
      return true;
    }
  }

  return false;
};

/**
 * Get set of channels that have active filters
 * Used to optimize data processing (only filter channels that need it)
 * 
 * @param filterValues - Filter values by channel (channel -> dimensionId -> selectedValues[])
 * @returns Set of channel names that have active filters
 */
export const getChannelsWithFilters = (
  filterValues: Record<string, Record<string, string[]>>
): Set<string> => {
  const channelsWithFilters = new Set<string>();

  if (!filterValues || Object.keys(filterValues).length === 0) {
    return channelsWithFilters;
  }

  // Check each channel
  for (const [channel, channelFilters] of Object.entries(filterValues)) {
    if (hasActiveFiltersForChannel(channelFilters)) {
      channelsWithFilters.add(channel);
    }
  }

  return channelsWithFilters;
};

/**
 * Filter rawDataRows based on filterValues and optional dateRange.
 * filterValues is dimensionId -> selectedValues[].
 * If dimensionIdToName is provided, also tries rowData[dimensionName] when rowData[dimensionId] is missing
 * so filtering works whether dimension_data uses id or name as key (e.g. "Link Type").
 */
export const filterRawDataRows = (
  rawDataRows: RawDataRow[],
  filterValues: Record<string, string[]>,
  dateRange?: { start: Date; end: Date },
  dimensionIdToName?: Record<string, string>
): RawDataRow[] => {
  if (!rawDataRows || rawDataRows.length === 0) return [];

  // Pre-resolve filter dimension IDs: when a filter references a global dimension ID
  // that doesn't exist in the raw row data, resolve it to the report-specific ID
  // by matching dimension names. This avoids per-row overhead.
  const resolvedFilterValues: Record<string, string[]> = {};
  if (Object.keys(filterValues).length > 0 && dimensionIdToName) {
    const sampleRow = rawDataRows[0];
    const sampleData = (sampleRow?.dimension_values || sampleRow) as Record<string, unknown>;
    // Build reverse map: dimensionName -> report-specific dimensionId (present in data)
    const nameToDataId = new Map<string, string>();
    for (const [dimId, dimName] of Object.entries(dimensionIdToName)) {
      if (dimId in sampleData) {
        nameToDataId.set(dimName, dimId);
      }
    }
    for (const [filterId, values] of Object.entries(filterValues)) {
      if (filterId in sampleData) {
        // Direct match — use as-is
        resolvedFilterValues[filterId] = values;
      } else {
        // Try to resolve via dimension name
        const filterDimName = dimensionIdToName[filterId];
        if (filterDimName && nameToDataId.has(filterDimName)) {
          resolvedFilterValues[nameToDataId.get(filterDimName)!] = values;
        } else {
          // Keep original — will cause row exclusion if truly absent
          resolvedFilterValues[filterId] = values;
        }
      }
    }
  } else {
    Object.assign(resolvedFilterValues, filterValues);
  }

  return rawDataRows.filter((row) => {
    const rowData = row.dimension_values || row;
    const rowDataRecord = rowData as Record<string, unknown>;

    // Apply date filter if provided
    if (dateRange) {
      let dateValue: unknown = null;
      dateValue =
        rowDataRecord.Date ||
        rowDataRecord.date ||
        rowDataRecord.Day ||
        rowDataRecord.day;

      // Search for date pattern
      if (!dateValue) {
        for (const [key, val] of Object.entries(rowData)) {
          if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) {
            dateValue = val;
            break;
          }
        }
      }

      if (dateValue) {
        const rowDate = parseLocalDateString(dateValue as string);
        if (rowDate === null || !isWithinInterval(rowDate, dateRange)) {
          return false;
        }
      }
      // If no date field is found, pass the row through — we cannot determine its date
      // so we include it rather than silently dropping data.
    }

    // Apply dimension filters (using resolved IDs)
    for (const [dimensionId, selectedValues] of Object.entries(resolvedFilterValues)) {
      // If filter is not set (undefined/null), skip (show all)
      if (!selectedValues) continue;

      // Empty array means explicitly "None" (exclude all data), so fail immediately.
      if (selectedValues.length === 0) {
        return false;
      }

      let rowValue: unknown;
      if (dimensionIdToName && Object.keys(dimensionIdToName).length > 0) {
        rowValue = readRowTextDimensionValue(rowDataRecord, dimensionId, dimensionIdToName);
      } else {
        rowValue = rowDataRecord[dimensionId];
      }
      if (rowValue === undefined || rowValue === null) {
        return false; // Row doesn't have this dimension
      }

      const normalizedRowValue = String(rowValue).trim();
      const normalizedFilterValues = selectedValues.map((v) => String(v).trim());

      if (!normalizedFilterValues.includes(normalizedRowValue)) {
        return false; // Row value doesn't match any selected filter value
      }
    }

    return true;
  });
};

/**
 * Aggregate metrics from filtered rawDataRows
 */
export const aggregateMetricsFromRows = (
  filteredRows: RawDataRow[],
  metricIds: {
    impressions: string;
    clicks: string;
    cost: string;
    revenue: string;
    bookings: string;
  }
): MetricData => {
  const result: MetricData = {
    impressions: 0,
    clicks: 0,
    cost: 0,
    revenue: 0,
    bookings: 0,
  };

  filteredRows.forEach((row) => {
    const rowData = row.dimension_values || row;
    const data = rowData as Record<string, unknown>;

    result.impressions += parseNumericValue(data[metricIds.impressions] ?? data['Impressions']);
    result.clicks += parseNumericValue(data[metricIds.clicks] ?? data['Clicks']);
    result.cost += parseNumericValue(data[metricIds.cost] ?? data['Cost']);
    result.revenue += parseNumericValue(data[metricIds.revenue] ?? data['Revenue']);
    result.bookings += parseNumericValue(data[metricIds.bookings] ?? data['Bookings']);
  });

  return result;
};

/**
 * Calculate percent change between current and previous values
 */
export const calculatePercentChange = (
  current: number,
  previous: number
): number => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

/**
 * Format number based on type (currency, percent, roas, etc.)
 */
export const formatNumber = (
  value: number,
  type?: string,
  currency?: 'USD' | 'AUD',
  /** For type 'currency': max decimal places (default 0). e.g. 2 for CPC. */
  currencyMaxFractionDigits?: number
): string => {
  if (value === undefined || value === null || isNaN(value)) return '-';

  if (type === 'currency') {
    const stored = typeof window !== 'undefined' ? localStorage.getItem('master_report_currency') : null;
    const effectiveCurrency: 'USD' | 'AUD' = currency ?? (stored === 'AUD' || stored === 'USD' ? stored : 'USD');

    const maxFrac = currencyMaxFractionDigits ?? 0;
    const minFrac = maxFrac > 0 ? maxFrac : 0;
    if (effectiveCurrency === 'AUD') {
      // Explicit "AU$" prefix for AUD (not "$" or "A$")
      const numberPart = new Intl.NumberFormat('en-AU', {
        minimumFractionDigits: minFrac,
        maximumFractionDigits: maxFrac,
        useGrouping: true,
      }).format(value);
      return `$${numberPart}`;
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: effectiveCurrency,
      minimumFractionDigits: minFrac,
      maximumFractionDigits: maxFrac,
    }).format(value);
  }
  if (type === 'percent' || type === 'percentage') {
    return `${value.toFixed(2)}%`;
  }
  if (type === 'roas') {
    return `${value.toFixed(1)}x`;
  }
  // For regular numbers, use whole numbers (no decimals)
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
  }).format(Math.round(value));
};

/**
 * Builds a mapping from metric names to dimension IDs using the dimensionMap
 */
export const buildMetricNameToIdsMap = (
  dimensionMap: Record<string, string> | undefined
): Record<string, string[]> => {
  if (!dimensionMap) return {};

  const nameToIds: Record<string, string[]> = {};

  Object.entries(dimensionMap).forEach(([dimensionId, dimensionName]) => {
    if (!dimensionName) return;

    const normalizedName = dimensionName.toLowerCase().trim();

    // Map common metric name variations to standard names (report sources may use different labels)
    const metricVariations: Record<string, string[]> = {
      impressions: ['impressions', 'impression'],
      clicks: ['clicks', 'click'],
      cost: ['cost', 'spend', 'amount spent', 'total cost', 'ad spend', 'ad cost', 'total spend', 'cost (usd)', 'cost (aud)', 'spend (usd)', 'spend (aud)'],
      revenue: ['revenue', 'conversion value', 'purchase value'],
      bookings: ['bookings', 'conversions', 'conversion'],
    };

    for (const [standardName, variations] of Object.entries(metricVariations)) {
      if (
        variations.some(
          (v) => normalizedName === v
        )
      ) {
        if (!nameToIds[standardName]) {
          nameToIds[standardName] = [];
        }
        nameToIds[standardName].push(dimensionId);
        if (!nameToIds[dimensionName]) {
          nameToIds[dimensionName] = [];
        }
        nameToIds[dimensionName].push(dimensionId);
        if (!nameToIds[normalizedName]) {
          nameToIds[normalizedName] = [];
        }
        nameToIds[normalizedName].push(dimensionId);
        break;
      }
    }
  });

  return nameToIds;
};

/**
 * Read a single metric value from a row using the same key resolution as aggregateRowsToMetrics.
 * Use this when row keys are dimension IDs and the dimension may be named e.g. "Cost", "Spend", "Total cost".
 */
export function getMetricValueFromRow(
  rowData: Record<string, unknown>,
  metricName: string,
  nameToIdsMap: Record<string, string[]>
): number {
  const keys = getMetricKeys(metricName, nameToIdsMap);
  for (const key of keys) {
    const v = rowData[key];
    if (v !== undefined && v !== null) return parseNumericValue(v);
  }
  return 0;
}

/**
 * Get all possible keys (names + IDs) for a metric
 * IMPORTANT: Order matters! Check dimension IDs first (like computation does), then dimension names
 */
export const getMetricKeys = (
  metricName: string,
  nameToIdsMap: Record<string, string[]>
): string[] => {
  const keys: string[] = [];
  const seenKeys = new Set<string>();

  // PRIORITY 1: Get all dimension IDs for this metric (check both lowercase and original case)
  // This matches the computation logic: rowData[metricNameToIdMap['Cost']] (dimension ID first)
  const dimensionIds = new Set<string>();
  const idsFromLowercase = nameToIdsMap[metricName.toLowerCase()] || [];
  const idsFromOriginal = nameToIdsMap[metricName] || [];
  [...idsFromLowercase, ...idsFromOriginal].forEach((id) =>
    dimensionIds.add(id)
  );

  // Add dimension IDs FIRST (highest priority)
  dimensionIds.forEach((id) => {
    if (!seenKeys.has(id)) {
      keys.push(id);
      seenKeys.add(id);
    }
  });

  // PRIORITY 2: Add dimension names that map to this metric's dimension IDs
  // This matches the computation fallback: rowData['Cost'] (dimension name as fallback)
  Object.entries(nameToIdsMap).forEach(([name, ids]) => {
    // If any of this name's IDs match our metric's dimension IDs, include the name
    if (ids.some((id) => dimensionIds.has(id))) {
      if (!seenKeys.has(name)) {
        keys.push(name); // Add the original dimension name (e.g., "Cost", "Revenue")
        seenKeys.add(name);
      }
    }
  });

  // PRIORITY 3: Add metric name variations as final fallback
  const variations = [
    metricName,
    metricName.toLowerCase(),
    metricName.charAt(0).toUpperCase() + metricName.slice(1).toLowerCase(),
  ];
  variations.forEach((v) => {
    if (!seenKeys.has(v)) {
      keys.push(v);
      seenKeys.add(v);
    }
  });

  return keys;
};

/**
 * Canonical metric aggregation from raw dimension_data rows.
 *
 * Uses buildMetricNameToIdsMap + getMetricKeys so dimension name matching is
 * case-insensitive and handles all known variations (cost/spend/amount spent, etc.).
 * This is the single source of truth for reading metric values from raw rows —
 * use this instead of inline metricNameToIdMap['Cost'] patterns.
 */
export function aggregateRowsToMetrics(
  rows: Array<{ dimension_values?: Record<string, unknown> } | Record<string, unknown>>,
  dimensionMap: Record<string, string>
): { impressions: number; clicks: number; cost: number; revenue: number; bookings: number } {
  const metrics = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
  if (rows.length === 0) return metrics;

  const nameToIdsMap = buildMetricNameToIdsMap(dimensionMap);

  const getVal = (rowData: Record<string, unknown>, keys: string[]): number => {
    for (const key of keys) {
      const v = rowData[key];
      if (v !== undefined && v !== null) return parseNumericValue(v);
    }
    return 0;
  };

  const impressionsKeys = getMetricKeys('impressions', nameToIdsMap);
  const clicksKeys = getMetricKeys('clicks', nameToIdsMap);
  const costKeys = getMetricKeys('cost', nameToIdsMap);
  const revenueKeys = getMetricKeys('revenue', nameToIdsMap);
  const bookingsKeys = getMetricKeys('bookings', nameToIdsMap);

  for (const row of rows) {
    const rowData = ((row as any).dimension_values || row) as Record<string, unknown>;
    metrics.impressions += getVal(rowData, impressionsKeys);
    metrics.clicks += getVal(rowData, clicksKeys);
    metrics.cost += getVal(rowData, costKeys);
    metrics.revenue += getVal(rowData, revenueKeys);
    metrics.bookings += getVal(rowData, bookingsKeys);
  }

  return metrics;
}

/**
 * Ensure chart data has at least 6 months for meaningful display
 * If filtered data has less than 6 months, expands to show more historical data
 */
export const ensureMinimumChartData = <T extends { year: number; month: string }>(
  filteredData: T[],
  allData: T[],
  minMonths = 6
): T[] => {
  if (filteredData.length === 0) return filteredData;
  
  // If we already have at least minMonths, return as is
  if (filteredData.length >= minMonths) return filteredData;
  
  // Get the most recent month from filtered data
  const mostRecentMonth = filteredData[filteredData.length - 1];
  const mostRecentDate = new Date(
    mostRecentMonth.year,
    MONTH_NAMES.indexOf(mostRecentMonth.month),
    1
  );
  
  // Calculate cutoff to get at least minMonths
  const minCutoffDate = new Date(
    mostRecentDate.getFullYear(),
    mostRecentDate.getMonth() - (minMonths - 1),
    1
  );
  
  // Expand filtered data to include at least minMonths
  const expandedData = allData.filter((m) => {
    const monthDate = new Date(m.year, MONTH_NAMES.indexOf(m.month), 1);
    return monthDate >= minCutoffDate && monthDate <= mostRecentDate;
  });
  
  // Use expanded data if it has more months, otherwise use original filtered data
  if (expandedData.length >= minMonths) {
    return expandedData;
  }
  
  // If we still don't have minMonths, show all available data up to the most recent
  const allUpToRecent = allData.filter((m) => {
    const monthDate = new Date(m.year, MONTH_NAMES.indexOf(m.month), 1);
    return monthDate <= mostRecentDate;
  });
  
  // Take last minMonths available (or all if less than minMonths)
  return allUpToRecent.slice(-minMonths);
};
