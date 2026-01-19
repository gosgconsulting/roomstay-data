/**
 * Price Check Data Module
 * 
 * Contains hardcoded price parity data from CSV source.
 * Provides utility functions for filtering and processing the data.
 */

import { PRICE_CHECK_DATA_RAW } from './priceCheckDataRaw';

export interface PriceCheckDataRow {
  hotelName: string;
  date: string; // ISO date string (YYYY-MM-DD)
  priceDiffPercent: number; // Parsed percentage value (e.g., 81.69 for "81.69%")
}

// Transform raw data to structured format
const PRICE_CHECK_DATA: PriceCheckDataRow[] = PRICE_CHECK_DATA_RAW.map(row => ({
  hotelName: row.hotel,
  date: row.date,
  priceDiffPercent: row.pct,
}));

/**
 * Get all price check data
 */
export function getAllPriceCheckData(): PriceCheckDataRow[] {
  return PRICE_CHECK_DATA;
}

/**
 * Get unique hotel names from the data
 */
export function getUniqueHotels(): string[] {
  const hotels = new Set<string>();
  PRICE_CHECK_DATA.forEach(row => hotels.add(row.hotelName));
  return Array.from(hotels).sort();
}

/**
 * Filter data by hotel name(s)
 * @param hotelNames - Hotel name(s) to filter by, or 'all'/'empty array' for all hotels
 */
export function filterByHotel(hotelNames: string | string[]): PriceCheckDataRow[] {
  if (!hotelNames || hotelNames === 'all' || (Array.isArray(hotelNames) && hotelNames.length === 0)) {
    return PRICE_CHECK_DATA;
  }
  
  const hotelsArray = Array.isArray(hotelNames) ? hotelNames : [hotelNames];
  return PRICE_CHECK_DATA.filter(row => hotelsArray.includes(row.hotelName));
}

/**
 * Filter data by date range
 * @param data - Data to filter
 * @param startDate - Start date (inclusive)
 * @param endDate - End date (inclusive)
 */
export function filterByDateRange(
  data: PriceCheckDataRow[],
  startDate: Date,
  endDate: Date
): PriceCheckDataRow[] {
  return data.filter(row => {
    const rowDate = new Date(row.date);
    return rowDate >= startDate && rowDate <= endDate;
  });
}

/**
 * Get date range based on time range option
 * @param timeRange - Time range option
 * @returns Object with startDate and endDate, or null for 'master'
 */
export function getDateRangeForTimeRange(
  timeRange: 'last_6_months' | 'last_12_months' | 'last_3_months' | 'this_year'
): { startDate: Date; endDate: Date } | null {

  const now = new Date();
  const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let startDate: Date;

  if (timeRange === 'last_3_months') {
    startDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  } else if (timeRange === 'last_6_months') {
    startDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  } else if (timeRange === 'last_12_months') {
    startDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  } else if (timeRange === 'this_year') {
    startDate = new Date(now.getFullYear(), 0, 1);
  } else {
    return null;
  }

  return { startDate, endDate };
}

/**
 * Group data by month for charting
 * @param data - Data to group
 * @returns Array of monthly aggregated data
 */
export function groupByMonth(data: PriceCheckDataRow[]): Array<{
  month: string; // Format: "MMM YY" (e.g., "Jan 25")
  year: number;
  monthNum: number;
  avgPriceDiff: number;
  count: number;
}> {
  const monthlyMap = new Map<string, { sum: number; count: number; year: number; monthNum: number }>();

  data.forEach(row => {
    const date = new Date(row.date);
    const year = date.getFullYear();
    const monthNum = date.getMonth() + 1;
    const key = `${year}-${monthNum}`;

    if (!monthlyMap.has(key)) {
      monthlyMap.set(key, { sum: 0, count: 0, year, monthNum });
    }

    const entry = monthlyMap.get(key)!;
    entry.sum += row.priceDiffPercent;
    entry.count += 1;
  });

  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return Array.from(monthlyMap.entries())
    .map(([key, value]) => ({
      month: `${monthNames[value.monthNum - 1]} ${value.year.toString().slice(-2)}`,
      year: value.year,
      monthNum: value.monthNum,
      avgPriceDiff: value.count > 0 ? value.sum / value.count : 0,
      count: value.count,
    }))
    .sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.monthNum - b.monthNum;
    });
}
