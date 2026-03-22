/**
 * Price Check Data Module
 * 
 * Fetches price parity data from the database (Price Check report dimension_data).
 * Provides utility functions for filtering and processing the data.
 */

import { supabase } from "@/integrations/supabase/client";

export interface PriceCheckDataRow {
  hotelName: string;
  date: string; // ISO date string (YYYY-MM-DD)
  priceDiffPercent: number; // Parsed percentage value (e.g., 81.69 for "81.69%")
}

// Cache for price check data
let cachedData: PriceCheckDataRow[] | null = null;
let cachedAccountId: string | null = null;

/**
 * Find dimensions by name patterns (case-insensitive)
 */
function findDimensionByName(dimensions: any[], patterns: string[]): string | null {
  for (const dim of dimensions) {
    const name = (dim.name || '').toLowerCase();
    for (const pattern of patterns) {
      if (name.includes(pattern.toLowerCase())) {
        return dim.id;
      }
    }
  }
  return null;
}

/**
 * Parse percentage value from various formats
 */
function parsePercentage(value: any): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    // Remove % sign and parse
    const cleaned = value.replace('%', '').trim();
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/**
 * Parse date value to YYYY-MM-DD format
 */
function parseDate(value: any): string | null {
  if (!value) return null;
  
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return null;
    return date.toISOString().split('T')[0];
  } catch {
    return null;
  }
}

/**
 * Load price check data from database
 */
async function loadPriceCheckData(accountId: string): Promise<PriceCheckDataRow[]> {
  // Return cached data if available for the same account
  if (cachedData && cachedAccountId === accountId) {
    return cachedData;
  }

  try {
    // Find the Price Check report for this account
    const { data: priceCheckReport, error: reportError } = await supabase
      .from('reports')
      .select('id')
      .eq('account_id', accountId)
      .eq('name', 'Price Check')
      .maybeSingle();

    if (reportError) {
      console.error('[priceCheckData] Error finding Price Check report:', reportError);
      return [];
    }

    if (!priceCheckReport) {
      console.log('[priceCheckData] No Price Check report found for account:', accountId);
      return [];
    }

    // Load dimensions for the account/report
    const { data: dimensions, error: dimError } = await supabase
      .from('dimensions')
      .select('id, name, type')
      .or(`account_id.eq.${accountId},report_id.eq.${priceCheckReport.id}`);

    if (dimError) {
      console.error('[priceCheckData] Error loading dimensions:', dimError);
      return [];
    }

    if (!dimensions || dimensions.length === 0) {
      console.log('[priceCheckData] No dimensions found');
      return [];
    }

    // Try to identify relevant dimensions
    const hotelDimensionId = findDimensionByName(dimensions, ['hotel', 'property', 'accommodation']);
    const dateDimensionId = findDimensionByName(dimensions, ['date', 'checkout', 'check-out', 'check in', 'check-in']);
    const priceDiffDimensionId = findDimensionByName(dimensions, ['price diff', 'price difference', 'price parity', 'pct', 'percentage', '%']);

    if (!hotelDimensionId || !dateDimensionId || !priceDiffDimensionId) {
      console.warn('[priceCheckData] Could not find all required dimensions:', {
        hotel: hotelDimensionId,
        date: dateDimensionId,
        priceDiff: priceDiffDimensionId,
        availableDimensions: dimensions.map(d => d.name)
      });
      return [];
    }

    // Fetch dimension_data in batches
    const allRows: PriceCheckDataRow[] = [];
    const batchSize = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data, error } = await supabase
        .from('dimension_data')
        .select('dimension_values')
        .eq('report_id', priceCheckReport.id)
        .order('row_number', { ascending: true })
        .range(offset, offset + batchSize - 1);

      if (error) {
        console.error('[priceCheckData] Error fetching dimension_data:', error);
        break;
      }

      if (data && data.length > 0) {
        // Transform dimension_data to PriceCheckDataRow format
        for (const row of data) {
          const dimensionValues = row.dimension_values as Record<string, any>;
          
          const hotelName = dimensionValues[hotelDimensionId];
          const dateValue = dimensionValues[dateDimensionId];
          const priceDiffValue = dimensionValues[priceDiffDimensionId];

          if (!hotelName || !dateValue || priceDiffValue === undefined || priceDiffValue === null) {
            continue; // Skip incomplete rows
          }

          const parsedDate = parseDate(dateValue);
          if (!parsedDate) {
            continue; // Skip rows with invalid dates
          }

          const parsedPriceDiff = parsePercentage(priceDiffValue);

          allRows.push({
            hotelName: String(hotelName),
            date: parsedDate,
            priceDiffPercent: parsedPriceDiff,
          });
        }

        offset += batchSize;
        hasMore = data.length === batchSize;
      } else {
        hasMore = false;
      }
    }

    // Cache the data
    cachedData = allRows;
    cachedAccountId = accountId;

    return allRows;
  } catch (error) {
    console.error('[priceCheckData] Error loading price check data:', error);
    return [];
  }
}


/**
 * Get all price check data (async version that requires accountId)
 */
export async function getAllPriceCheckData(accountId?: string): Promise<PriceCheckDataRow[]> {
  if (!accountId) {
    console.warn('[priceCheckData] getAllPriceCheckData called without accountId');
    return [];
  }
  return loadPriceCheckData(accountId);
}

/**
 * Get unique hotel names from the data (async version)
 */
export async function getUniqueHotels(accountId?: string): Promise<string[]> {
  const data = accountId ? await loadPriceCheckData(accountId) : [];
  const hotels = new Set<string>();
  data.forEach(row => hotels.add(row.hotelName));
  return Array.from(hotels).sort();
}

/**
 * Filter data by hotel name(s)
 * @param data - Data to filter
 * @param hotelNames - Hotel name(s) to filter by, or 'all'/'empty array' for all hotels
 */
export function filterByHotel(data: PriceCheckDataRow[], hotelNames: string | string[]): PriceCheckDataRow[] {
  if (!hotelNames || hotelNames === 'all' || (Array.isArray(hotelNames) && hotelNames.length === 0)) {
    return data;
  }
  
  const hotelsArray = Array.isArray(hotelNames) ? hotelNames : [hotelNames];
  return data.filter(row => hotelsArray.includes(row.hotelName));
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
