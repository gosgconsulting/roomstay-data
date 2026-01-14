/**
 * Helper functions for SlideViewPage component
 */

import { isWithinInterval } from 'date-fns';
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
    // If no values selected, it means "All" - no filter
    if (!selectedValues || selectedValues.length === 0) {
      continue;
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
 * Filter rawDataRows based on filterValues and optional dateRange
 */
export const filterRawDataRows = (
  rawDataRows: RawDataRow[],
  filterValues: Record<string, string[]>,
  dateRange?: { start: Date; end: Date }
): RawDataRow[] => {
  if (!rawDataRows || rawDataRows.length === 0) return [];

  return rawDataRows.filter((row) => {
    const rowData = row.dimension_values || row;

    // Apply date filter if provided
    if (dateRange) {
      let dateValue: unknown = null;
      // Try to find date by common field names
      dateValue =
        (rowData as Record<string, unknown>).Date ||
        (rowData as Record<string, unknown>).date ||
        (rowData as Record<string, unknown>).Day ||
        (rowData as Record<string, unknown>).day;

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
      if (!selectedValues || selectedValues.length === 0) continue; // "All" selected - no filter

      const rowValue = (rowData as Record<string, unknown>)[dimensionId];
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
export const formatNumber = (value: number, type?: string): string => {
  if (value === undefined || value === null || isNaN(value)) return '-';

  if (type === 'currency') {
    // Match SlideDataBrowser: currency with 0 decimal places
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
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
