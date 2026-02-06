/**
 * Metasearch January 2026 raw rows for the Breakdown Analysis table override.
 * Data from slide_report_channel_month_data (Roomstay MCP: channel=metasearch, year=2026, month=1).
 * Used when the display-data API returns incorrect breakdowns for that period.
 * TODO: remove when root cause is fixed (see plan todo remove-jan2026-override).
 *
 * To refresh data via MCP: run
 *   SELECT data FROM slide_report_channel_month_data
 *   WHERE channel = 'metasearch' AND year = 2026 AND month = 1 LIMIT 1;
 * then fill JAN_2026_HOTEL_BREAKDOWN from data->'breakdowns'->'Hotel',
 * JAN_2026_LINK_TYPE_BREAKDOWN from data->'breakdowns'->'Link Type',
 * and JAN_2026_DIMENSION_MAP from data->'dimensionMap' (subset as needed).
 */

import { useMemo } from 'react';
import type { RawDataRow } from '@/types/slideView';

export const isMetasearchJan2026 = (
  selectedTab: string,
  selectedYear: string,
  selectedMonth: string
): boolean =>
  selectedTab === 'metasearch' &&
  selectedYear === '2026' &&
  selectedMonth === 'January';

/** Dimension IDs from slide_report_channel_month_data (metasearch Jan 2026). */
export const JAN_2026_HOTEL_DIMENSION_ID = '093ac487-dd90-4466-9972-ac51d110e91e';
export const JAN_2026_LINK_TYPE_DIMENSION_ID = '6c553ea6-e3bb-4946-bb56-069d39a3c5c0';
const HOTEL_DIMENSION_ID = JAN_2026_HOTEL_DIMENSION_ID;
const LINK_TYPE_DIMENSION_ID = JAN_2026_LINK_TYPE_DIMENSION_ID;

/** Fallback dimensions for Breakdown Analysis when using Jan 2026 override and slide has no breakdown dimensions configured. */
export const JAN_2026_BREAKDOWN_DIMENSIONS: Array<{ id: string; name: string; type: string }> = [
  { id: JAN_2026_HOTEL_DIMENSION_ID, name: 'Hotel', type: 'text' },
  { id: JAN_2026_LINK_TYPE_DIMENSION_ID, name: 'Link Type', type: 'text' },
];

/** Row shape expected by the breakdown table (DisplayDataBreakdownRow). */
export interface Jan2026BreakdownTableRow {
  name: string;
  impressions: number;
  clicks: number;
  cost: number;
  revenue: number;
  bookings: number;
  cpc?: number;
  roas?: number;
  costOfSale?: number;
}

/** Expanded row shape (breakdown-by dimension values under each group-by row). */
export interface Jan2026ExpandedRow {
  name: string;
  impressions: number;
  clicks: number;
  cost: number;
  revenue: number;
  bookings: number;
}

/**
 * Returns breakdown rows and expanded data for the Breakdown Analysis table when
 * the display-data API does not return rows for Metasearch January 2026.
 * When groupBy is Link Type dimension ID, main rows are Paid/Google Organic with hotels in expanded.
 * Otherwise main rows are by Hotel with link types in expanded.
 */
export function getJan2026BreakdownRowsForTable(groupBy?: string): {
  groupBy: string;
  rows: Jan2026BreakdownTableRow[];
  expanded?: Record<string, Jan2026ExpandedRow[]>;
} {
  const isGroupByLinkType = groupBy === JAN_2026_LINK_TYPE_DIMENSION_ID;

  if (isGroupByLinkType) {
    const rows: Jan2026BreakdownTableRow[] = JAN_2026_LINK_TYPE_BREAKDOWN.map((row) => {
      const cost = row.cost;
      const revenue = row.revenue;
      const clicks = row.clicks;
      const cpc = clicks > 0 ? cost / clicks : 0;
      const roas = cost > 0 ? revenue / cost : 0;
      const costOfSale = revenue > 0 ? (cost / revenue) * 100 : 0;
      return {
        name: row.name,
        impressions: row.impressions,
        clicks: row.clicks,
        cost,
        revenue,
        bookings: row.bookings,
        cpc,
        roas,
        costOfSale,
      };
    });
    return {
      groupBy: JAN_2026_LINK_TYPE_DIMENSION_ID,
      rows,
      expanded: getJan2026ExpandedBreakdownByLinkType(),
    };
  }

  const rows: Jan2026BreakdownTableRow[] = JAN_2026_HOTEL_BREAKDOWN.map((row) => {
    const cost = row.cost;
    const revenue = row.revenue;
    const clicks = row.clicks;
    const cpc = clicks > 0 ? cost / clicks : 0;
    const roas = cost > 0 ? revenue / cost : 0;
    const costOfSale = revenue > 0 ? (cost / revenue) * 100 : 0;
    return {
      name: row.name,
      impressions: row.impressions,
      clicks: row.clicks,
      cost,
      revenue,
      bookings: row.bookings,
      cpc,
      roas,
      costOfSale,
    };
  });
  return {
    groupBy: JAN_2026_HOTEL_DIMENSION_ID,
    rows,
    expanded: getJan2026ExpandedBreakdown(),
  };
}

/**
 * Returns per-hotel, per-link-type breakdown for Metasearch January 2026 (group by Hotel).
 * Used as apiBreakdowns.expanded so expanding a hotel row shows Paid vs Google Organic.
 */
export function getJan2026ExpandedBreakdown(): Record<string, Jan2026ExpandedRow[]> {
  return JAN_2026_EXPANDED_BY_HOTEL;
}

/**
 * Returns per-link-type, per-hotel breakdown (group by Link Type).
 * Used as apiBreakdowns.expanded so expanding Paid or Google Organic shows hotels under that link type.
 */
export function getJan2026ExpandedBreakdownByLinkType(): Record<string, Jan2026ExpandedRow[]> {
  return JAN_2026_EXPANDED_BY_LINK_TYPE;
}

/**
 * Breakdown by Hotel for Metasearch January 2026.
 * Source: slide_report_channel_month_data.data.breakdowns.Hotel (Roomstay MCP: channel=metasearch, year=2026, month=1).
 */
const JAN_2026_HOTEL_BREAKDOWN: Array<{
  name: string;
  hotel: string;
  impressions: number;
  clicks: number;
  cost: number;
  revenue: number;
  bookings: number;
}> = [
  { name: 'Brady Hotels Central Melbourne', hotel: 'Brady Hotels Central Melbourne', impressions: 12142, clicks: 764, cost: 1100.92, revenue: 20840.81, bookings: 46 },
  { name: 'Daydream Island Resort and Living Reef', hotel: 'Daydream Island Resort and Living Reef', impressions: 44496, clicks: 577, cost: 230.98, revenue: 12241.16, bookings: 17 },
  { name: 'Brady Apartment Hotel Flinders Street', hotel: 'Brady Apartment Hotel Flinders Street', impressions: 4950, clicks: 375, cost: 369.79, revenue: 11112.83, bookings: 22 },
  { name: 'Brady Hotels Jones Lane', hotel: 'Brady Hotels Jones Lane', impressions: 7582, clicks: 543, cost: 561.56, revenue: 10074.24, bookings: 31 },
  { name: 'Wildlife Retreat', hotel: 'Wildlife Retreat', impressions: 15385, clicks: 646, cost: 681.83, revenue: 10070.63, bookings: 12 },
  { name: 'Brady Apartment Hotel Hardware Lane', hotel: 'Brady Apartment Hotel Hardware Lane', impressions: 7328, clicks: 515, cost: 619.64, revenue: 9207.53, bookings: 14 },
  { name: 'Sojourn Apartment Hotel - Riddiford', hotel: 'Sojourn Apartment Hotel - Riddiford', impressions: 1902, clicks: 152, cost: 113.74, revenue: 4437.31, bookings: 12 },
  { name: 'Sojourn Apartment Hotel - Ghuznee', hotel: 'Sojourn Apartment Hotel - Ghuznee', impressions: 2300, clicks: 164, cost: 83.14, revenue: 3493.47, bookings: 16 },
];

/**
 * Breakdown by Link Type for Metasearch January 2026.
 * Source: slide_report_channel_month_data.data.breakdowns["Link Type"] (Roomstay MCP: channel=metasearch, year=2026, month=1).
 */
const JAN_2026_LINK_TYPE_BREAKDOWN: Array<{
  name: string;
  link_type: string;
  impressions: number;
  clicks: number;
  cost: number;
  revenue: number;
  bookings: number;
}> = [
  { name: 'Paid', link_type: 'Paid', impressions: 96085, clicks: 2131, cost: 3761.60, revenue: 53957.31, bookings: 108 },
  { name: 'Google Organic', link_type: 'Google Organic', impressions: 0, clicks: 1605, cost: 0, revenue: 27520.67, bookings: 62 },
];

/**
 * Per-hotel, per-link-type breakdown for January 2026 (from dimension_data, report_id = metasearch, date in Jan 2026).
 * Keys = hotel name (must match JAN_2026_HOTEL_BREAKDOWN). Value = Link Type rows for that hotel.
 */
const JAN_2026_EXPANDED_BY_HOTEL: Record<string, Jan2026ExpandedRow[]> = {
  'Brady Hotels Central Melbourne': [
    { name: 'Paid', impressions: 12142, clicks: 448, cost: 1100.92, revenue: 15031.42, bookings: 33 },
    { name: 'Google Organic', impressions: 0, clicks: 316, cost: 0, revenue: 5809.39, bookings: 13 },
  ],
  'Daydream Island Resort and Living Reef': [
    { name: 'Paid', impressions: 44496, clicks: 383, cost: 230.98, revenue: 11234.16, bookings: 14 },
    { name: 'Google Organic', impressions: 0, clicks: 194, cost: 0, revenue: 1007, bookings: 3 },
  ],
  'Brady Apartment Hotel Flinders Street': [
    { name: 'Paid', impressions: 4950, clicks: 187, cost: 369.79, revenue: 5762.19, bookings: 13 },
    { name: 'Google Organic', impressions: 0, clicks: 188, cost: 0, revenue: 5350.64, bookings: 9 },
  ],
  'Brady Hotels Jones Lane': [
    { name: 'Paid', impressions: 7582, clicks: 261, cost: 561.56, revenue: 4676.41, bookings: 17 },
    { name: 'Google Organic', impressions: 0, clicks: 282, cost: 0, revenue: 5397.83, bookings: 14 },
  ],
  'Wildlife Retreat': [
    { name: 'Paid', impressions: 15385, clicks: 432, cost: 681.83, revenue: 8583.63, bookings: 10 },
    { name: 'Google Organic', impressions: 0, clicks: 214, cost: 0, revenue: 1487, bookings: 2 },
  ],
  'Brady Apartment Hotel Hardware Lane': [
    { name: 'Paid', impressions: 7328, clicks: 276, cost: 619.64, revenue: 5587.93, bookings: 9 },
    { name: 'Google Organic', impressions: 0, clicks: 239, cost: 0, revenue: 3619.6, bookings: 5 },
  ],
  'Sojourn Apartment Hotel - Riddiford': [
    { name: 'Paid', impressions: 1902, clicks: 81, cost: 113.74, revenue: 2022.34, bookings: 6 },
    { name: 'Google Organic', impressions: 0, clicks: 71, cost: 0, revenue: 2414.97, bookings: 6 },
  ],
  'Sojourn Apartment Hotel - Ghuznee': [
    { name: 'Paid', impressions: 2300, clicks: 63, cost: 83.14, revenue: 1059.23, bookings: 6 },
    { name: 'Google Organic', impressions: 0, clicks: 101, cost: 0, revenue: 2434.24, bookings: 10 },
  ],
};

/**
 * Per-link-type, per-hotel breakdown (derived from JAN_2026_EXPANDED_BY_HOTEL).
 * Keys = link type name (Paid, Google Organic). Value = hotel rows for that link type.
 */
const JAN_2026_EXPANDED_BY_LINK_TYPE: Record<string, Jan2026ExpandedRow[]> = (() => {
  const result: Record<string, Jan2026ExpandedRow[]> = { Paid: [], 'Google Organic': [] };
  for (const [hotelName, linkRows] of Object.entries(JAN_2026_EXPANDED_BY_HOTEL)) {
    for (const row of linkRows) {
      const key = row.name as 'Paid' | 'Google Organic';
      if (result[key]) {
        result[key].push({
          name: hotelName,
          impressions: row.impressions,
          clicks: row.clicks,
          cost: row.cost,
          revenue: row.revenue,
          bookings: row.bookings,
        });
      }
    }
  }
  return result;
})();

/**
 * Dimension map (id -> name) from slide_report_channel_month_data.data.dimensionMap.
 * Subset used for Metasearch Jan 2026 breakdown table and raw rows.
 */
const JAN_2026_DIMENSION_MAP: Record<string, string> = {
  '093ac487-dd90-4466-9972-ac51d110e91e': 'Hotel',
  '6c553ea6-e3bb-4946-bb56-069d39a3c5c0': 'Link Type',
  '1caad3eb-3d5e-405c-9df7-1c96971171c5': 'Clicks',
  '89c229d9-8a6e-4d94-a0d2-a4b43b6f3fe1': 'Impressions',
  'fb281b3f-c800-48f4-b34b-02d4f0244b07': 'Cost',
  '7f4cb2e9-52a3-4110-803a-58d2e7afacb5': 'Revenue',
  '79aeb7f7-a9c6-43cd-bd05-ff7df81babf1': 'Bookings',
};

function breakdownToRawDataRows(
  hotelRows: typeof JAN_2026_HOTEL_BREAKDOWN,
  linkTypeRows: typeof JAN_2026_LINK_TYPE_BREAKDOWN
): RawDataRow[] {
  const result: RawDataRow[] = [];
  for (const row of hotelRows) {
    const obj: Record<string, unknown> = {
      [HOTEL_DIMENSION_ID]: row.hotel,
      name: row.name,
      impressions: row.impressions,
      clicks: row.clicks,
      cost: row.cost,
      revenue: row.revenue,
      bookings: row.bookings,
    };
    result.push({ dimension_values: obj, ...obj } as RawDataRow);
  }
  for (const row of linkTypeRows) {
    const obj: Record<string, unknown> = {
      [LINK_TYPE_DIMENSION_ID]: row.link_type,
      name: row.name,
      impressions: row.impressions,
      clicks: row.clicks,
      cost: row.cost,
      revenue: row.revenue,
      bookings: row.bookings,
    };
    result.push({ dimension_values: obj, ...obj } as RawDataRow);
  }
  return result;
}

const HARDCODED_RAW_DATA_ROWS = breakdownToRawDataRows(
  JAN_2026_HOTEL_BREAKDOWN,
  JAN_2026_LINK_TYPE_BREAKDOWN
);

export interface UseMetasearchJan2026RawRowsResult {
  /** Hardcoded raw rows and dimension map when Metasearch + Jan 2026 is selected; null otherwise. */
  data: { rawDataRows: RawDataRow[]; dimensionMap: Record<string, string> } | null;
  isLoading: boolean;
  /** True when Metasearch + Jan 2026 is selected. */
  isApplicable: boolean;
}

/**
 * Returns hardcoded Metasearch January 2026 raw rows and dimension map when
 * the user has selected Metasearch tab and January 2026. No fetch; data is
 * from slide_report_channel_month_data (fetched via MCP and hardcoded).
 */
export function useMetasearchJan2026RawRows(
  _slideReportId: string | null,
  selectedTab: string,
  selectedYear: string,
  selectedMonth: string
): UseMetasearchJan2026RawRowsResult {
  const applicable = isMetasearchJan2026(selectedTab, selectedYear, selectedMonth);

  const data = useMemo(() => {
    if (!applicable) return null;
    return {
      rawDataRows: HARDCODED_RAW_DATA_ROWS,
      dimensionMap: JAN_2026_DIMENSION_MAP,
    };
  }, [applicable]);

  return {
    data,
    isLoading: false,
    isApplicable: applicable,
  };
}
