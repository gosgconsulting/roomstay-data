/**
 * Helper functions for SlideViewPage component
 */

import { isWithinInterval } from 'date-fns';
import { MONTH_NAMES } from '@/constants/slideViewConstants';
import type {
  RawDataRow,
  MetricData,
  DerivedMetrics,
} from '@/types/slideView';

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
    roas,
    costOfSale,
  };
};

/**
 * Check if filters are actually applied (not "All" selected)
 * @deprecated Use hasActiveFiltersForChannel for channel-specific checks or hasAnyActiveFilters for multi-channel checks
 */
export const hasActiveFilters = (
  filterValues: Record<string, string[]>,
  availableValues?: Record<string, string[]>
): boolean => {
  // If no filter values at all, no filters are applied
  if (!filterValues || Object.keys(filterValues).length === 0) {
    return false;
  }

  // Check each filter dimension
  for (const [dimensionId, selectedValues] of Object.entries(filterValues)) {
    // If selectedValues is null/undefined, filter is not set - no filter
    if (!selectedValues) {
      continue;
    }
    
    // If empty array, it's an active filter that filters out everything
    if (selectedValues.length === 0) {
      return true; // Empty array is an active filter (shows zero data)
    }

    // If we have available values, check if all are selected (means "All" - no filter)
    if (availableValues?.[dimensionId]) {
      const allAvailableValues = availableValues[dimensionId];
      // If selected values equals all available values, it's "All" - no filter
      if (selectedValues.length === allAvailableValues.length) {
        // Double-check: are they the same set?
        const selectedSet = new Set(selectedValues);
        const allSet = new Set(allAvailableValues);
        if (
          selectedSet.size === allSet.size &&
          [...selectedSet].every((v) => allSet.has(v))
        ) {
          continue; // This is "All" - no filter
        }
      }
    }

    // If we have selected values that are a subset, filter is applied
    return true;
  }

  // No active filters found
  return false;
};

/**
 * Check if a specific channel has active filters (not "All" selected)
 * Centralized filter detection logic for single channel
 * 
 * @param channelFilterValues - Filter values for the channel (dimensionId -> selectedValues[])
 * @param channelAvailableValues - Available filter values for the channel (dimensionId -> availableValues[])
 * @returns true if channel has active filters, false otherwise
 */
export const hasActiveFiltersForChannel = (
  channelFilterValues: Record<string, string[]>,
  channelAvailableValues?: Record<string, string[]>
): boolean => {
  // If no filter values at all, no filters are applied
  if (!channelFilterValues || Object.keys(channelFilterValues).length === 0) {
    return false;
  }

  // Check each filter dimension
  for (const [dimensionId, selectedValues] of Object.entries(channelFilterValues)) {
    // If selectedValues is null/undefined, filter is not set - no filter
    if (!selectedValues) {
      continue;
    }
    
    // If empty array, it's an active filter that filters out everything
    if (selectedValues.length === 0) {
      return true; // Empty array is an active filter (shows zero data)
    }

    // If we have available values, check if all are selected (means "All" - no filter)
    if (channelAvailableValues?.[dimensionId]) {
      const allAvailableValues = channelAvailableValues[dimensionId];
      // If selected values equals all available values, it's "All" - no filter
      if (selectedValues.length === allAvailableValues.length) {
        // Double-check: are they the same set?
        const selectedSet = new Set(selectedValues);
        const allSet = new Set(allAvailableValues);
        if (
          selectedSet.size === allSet.size &&
          [...selectedSet].every((v) => allSet.has(v))
        ) {
          continue; // This is "All" - no filter
        }
      }
    }

    // If we have selected values that are a subset, filter is applied
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
 * @param filterDimensionValues - Available filter values by channel (channel -> dimensionId -> availableValues[])
 * @returns true if any channel has active filters, false otherwise
 */
export const hasAnyActiveFilters = (
  filterValues: Record<string, Record<string, string[]>>,
  filterDimensionValues?: Record<string, Record<string, string[]>>
): boolean => {
  if (!filterValues || Object.keys(filterValues).length === 0) {
    return false;
  }

  // Check each channel
  for (const [channel, channelFilters] of Object.entries(filterValues)) {
    const channelAvailableValues = filterDimensionValues?.[channel];
    if (hasActiveFiltersForChannel(channelFilters, channelAvailableValues)) {
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
 * @param filterDimensionValues - Available filter values by channel (channel -> dimensionId -> availableValues[])
 * @returns Set of channel names that have active filters
 */
export const getChannelsWithFilters = (
  filterValues: Record<string, Record<string, string[]>>,
  filterDimensionValues?: Record<string, Record<string, string[]>>
): Set<string> => {
  const channelsWithFilters = new Set<string>();

  if (!filterValues || Object.keys(filterValues).length === 0) {
    return channelsWithFilters;
  }

  // Check each channel
  for (const [channel, channelFilters] of Object.entries(filterValues)) {
    const channelAvailableValues = filterDimensionValues?.[channel];
    if (hasActiveFiltersForChannel(channelFilters, channelAvailableValues)) {
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
        const rowDate = new Date(dateValue as string);
        if (isNaN(rowDate.getTime()) || !isWithinInterval(rowDate, dateRange)) {
          return false;
        }
      }
    }

    // Apply dimension filters
    for (const [dimensionId, selectedValues] of Object.entries(filterValues)) {
      // If filter is explicitly set to empty array, filter out all rows (show zero data)
      if (selectedValues && selectedValues.length === 0) {
        return false; // Explicitly empty = no matches = zero data
      }
      
      // If filter is not set (undefined/null), skip (show all)
      if (!selectedValues) continue;

      // Try dimension ID first; then dimension name when data is keyed by name (e.g. "Link Type")
      let rowValue: unknown = rowDataRecord[dimensionId];
      if ((rowValue === undefined || rowValue === null) && dimensionIdToName?.[dimensionId]) {
        rowValue = rowDataRecord[dimensionIdToName[dimensionId]];
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

    // Aggregate each metric by its dimension ID
    const impressions = parseFloat(
      String(
        data[metricIds.impressions] || data['Impressions'] || 0
      ).replace(/[^0-9.-]/g, '')
    );
    const clicks = parseFloat(
      String(data[metricIds.clicks] || data['Clicks'] || 0).replace(
        /[^0-9.-]/g,
        ''
      )
    );
    const cost = parseFloat(
      String(data[metricIds.cost] || data['Cost'] || 0).replace(
        /[^0-9.-]/g,
        ''
      )
    );
    const revenue = parseFloat(
      String(data[metricIds.revenue] || data['Revenue'] || 0).replace(
        /[^0-9.-]/g,
        ''
      )
    );
    const bookings = parseFloat(
      String(data[metricIds.bookings] || data['Bookings'] || 0).replace(
        /[^0-9.-]/g,
        ''
      )
    );

    if (!isNaN(impressions)) result.impressions += impressions;
    if (!isNaN(clicks)) result.clicks += clicks;
    if (!isNaN(cost)) result.cost += cost;
    if (!isNaN(revenue)) result.revenue += revenue;
    if (!isNaN(bookings)) result.bookings += bookings;
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

    // Use correct locale for each currency for correct prefix
    const currencyLocale =
      effectiveCurrency === 'AUD' ? 'en-AU' : 'en-US';

    return new Intl.NumberFormat(currencyLocale, {
      style: 'currency',
      currency: effectiveCurrency,
      minimumFractionDigits: 0,
      maximumFractionDigits: currencyMaxFractionDigits ?? 0,
    }).format(value);
  }
  if (type === 'percent' || type === 'percentage') {
    return `${value.toFixed(2)}%`;
  }
  if (type === 'roas') {
    return `${value.toFixed(1)}x`;
  }
  // For regular numbers, use 2 decimal places (matching SlideDataBrowser)
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2,
  }).format(value);
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

    // Map common metric name variations to standard names
    const metricVariations: Record<string, string[]> = {
      impressions: ['impressions', 'impression'],
      clicks: ['clicks', 'click'],
      cost: ['cost', 'spend', 'amount spent'],
      revenue: ['revenue', 'conversion value', 'purchase value'],
      bookings: ['bookings', 'conversions', 'conversion'],
    };

    for (const [standardName, variations] of Object.entries(metricVariations)) {
      if (
        variations.some(
          (v) => normalizedName.includes(v) || v.includes(normalizedName)
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