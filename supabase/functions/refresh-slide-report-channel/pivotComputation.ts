/**
 * Pivot data computation logic for slide reports
 * Ported from src/lib/slideReportPivotComputation.ts
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type {
  SlideReportPivotData,
  SlideReportConfiguration,
  SlideReportDateRange,
  ChannelMetrics,
  BreakdownRow,
} from './types.ts';
import {
  aggregateMetrics,
  calculateDerivedMetrics,
  parseDate,
  isWithinInterval,
  startOfMonth,
  endOfMonth,
  startOfYear,
  eachMonthOfInterval,
  formatMonthKey,
} from './utils.ts';

const BASE_METRICS = ['Impressions', 'Clicks', 'Cost', 'Revenue', 'Bookings'];
const YEARS_TO_COMPUTE = [2024, 2025, 2026]; // TODO: make this dynamic based on the data available

/** Max raw rows to include in channel response; above this we omit rawDataRows to avoid WORKER_LIMIT. Frontend uses pre-computed breakdowns when rawDataRows is empty. */
const MAX_RAW_DATA_ROWS = 5000;

/** Above this row count we skip monthlyBreakdowns (per-month per-breakdown) to avoid CPU time limit. Frontend falls back to all-time breakdowns when monthlyBreakdowns is empty. */
const ROW_COUNT_CPU_GUARD = 10000;

/**
 * Build metric name to dimension ID mapping for a report
 */
async function buildMetricNameToIdMap(
  supabase: ReturnType<typeof createClient>,
  reportId: string
): Promise<Record<string, string>> {
  const nameToIdMap: Record<string, string> = {};
  
  try {
    // STEP 1: Get the account_id for this report
    console.log(`[pivot] Building metric map for report ${reportId} - fetching report data`);
    const { data: reportData, error: reportError } = await supabase
      .from('reports')
      .select('account_id')
      .eq('id', reportId)
      .single();
    
    if (reportError) {
      console.error(`[pivot] Failed to fetch report ${reportId}:`, reportError);
      throw new Error(`Failed to fetch report account_id for ${reportId}: ${reportError.message}`);
    }
    
    const accountId = reportData?.account_id;
    console.log(`[pivot] Report ${reportId} has account_id: ${accountId || 'null'}`);
    
    // STEP 2: Fetch account-level dimensions first
    if (accountId) {
      console.log(`[pivot] Fetching account-level dimensions for account ${accountId}`);
      const { data: accountDimensions, error: accountDimensionsError } = await supabase
        .from('dimensions')
        .select('id, name, type')
        .eq('account_id', accountId)
        .is('report_id', null);
      
      if (accountDimensionsError) {
        console.error(`[pivot] Failed to fetch account dimensions for account ${accountId}:`, accountDimensionsError);
        throw new Error(`Failed to fetch account-level dimensions for account ${accountId}: ${accountDimensionsError.message}`);
      }
      
      if (accountDimensions) {
        accountDimensions.forEach(dim => {
          nameToIdMap[dim.name] = dim.id;
        });
        console.log(`[pivot] Loaded ${accountDimensions.length} account-level dimensions for report ${reportId}`);
      }
    }
    
    // STEP 3: Sample rows to collect dimension IDs
    console.log(`[pivot] Sampling dimension_data rows for report ${reportId}`);
    const { data: sampleRows, error: sampleRowsError } = await supabase
      .from('dimension_data')
      .select('dimension_values')
      .eq('report_id', reportId)
      .limit(20);

    if (sampleRowsError) {
      console.error(`[pivot] Failed to fetch sample rows for report ${reportId}:`, sampleRowsError);
      throw new Error(`Failed to fetch sample dimension_data rows for report ${reportId}: ${sampleRowsError.message}`);
    }

    if (!sampleRows || sampleRows.length === 0) {
      console.warn(`[pivot] No data found for report ${reportId}`);
      return nameToIdMap;
    }

    console.log(`[pivot] Found ${sampleRows.length} sample rows for report ${reportId}`);

    // Collect ALL unique dimension IDs from sampled rows
    const allDimensionIds = new Set<string>();
    sampleRows.forEach(row => {
      const rowData = row.dimension_values as Record<string, any>;
      Object.keys(rowData).forEach(id => allDimensionIds.add(id));
    });
    
    const dimensionIds = Array.from(allDimensionIds);
    console.log(`[pivot] Found ${dimensionIds.length} unique dimension IDs in sample data`);

    // STEP 4: Fetch dimension info for all IDs found in the data
    if (dimensionIds.length > 0) {
      console.log(`[pivot] Fetching dimension info for ${dimensionIds.length} dimension IDs`);
      const { data: dimensions, error: dimensionsError } = await supabase
        .from('dimensions')
        .select('id, name, type')
        .in('id', dimensionIds);

      if (dimensionsError) {
        console.error(`[pivot] Failed to fetch dimension info for report ${reportId}:`, dimensionsError);
        throw new Error(`Failed to fetch dimension info for report ${reportId}: ${dimensionsError.message}`);
      }

      if (dimensions) {
        dimensions.forEach(dim => {
          nameToIdMap[dim.name] = dim.id;
        });
        console.log(`[pivot] Added ${dimensions.length} dimensions from data to metric map`);
      }
    }

    console.log(`[pivot] Built metric map for report ${reportId}: ${Object.keys(nameToIdMap).length} dimensions`);
    return nameToIdMap;
  } catch (error: any) {
    console.error(`[pivot] Error in buildMetricNameToIdMap for report ${reportId}:`, error);
    throw error;
  }
}

/**
 * Fetch dimension data for a report - optimized for large datasets and memory usage
 * Uses smaller batch size to reduce memory footprint
 */
async function fetchDimensionDataForReport(
  supabase: ReturnType<typeof createClient>,
  reportId: string
): Promise<any[]> {
  const allRows: any[] = [];
  const batchSize = 100; // Small batches to reduce peak memory and avoid WORKER_LIMIT
  let offset = 0;
  let hasMore = true;
  let retryCount = 0;
  const maxRetries = 3;

  while (hasMore) {
    try {
      const { data, error } = await supabase
        .from('dimension_data')
        .select('dimension_values')
        .eq('report_id', reportId)
        .range(offset, offset + batchSize - 1);

      if (error) {
        if (error.message?.includes('timeout') && retryCount < maxRetries) {
          console.warn(`[pivot] Batch timeout at offset ${offset}, retrying with delay...`);
          retryCount++;
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }
        throw error;
      }

      if (data && data.length > 0) {
        // Extract dimension_values directly to avoid extra object nesting
        for (const row of data) {
          allRows.push(row.dimension_values || row);
        }
        offset += batchSize;
        hasMore = data.length === batchSize;
        retryCount = 0;
        
        // Log progress for large datasets
        if (offset % 1000 === 0) {
          console.log(`[pivot] Fetched ${offset} rows so far for report ${reportId}...`);
        }
      } else {
        hasMore = false;
      }
    } catch (err: any) {
      console.error(`[pivot] Error fetching batch at offset ${offset}:`, err);
      throw err;
    }
  }

  console.log(`[pivot] Fetched ${allRows.length} rows for report ${reportId}`);
  return allRows;
}

/**
 * Fetch dimension data filtered by date using DB-side RPC (no full table scan).
 * When dateDimId is set, calls get_dimension_data_by_report_and_date; otherwise falls back to full fetch or in-memory filter.
 * @param month - if provided, filters to that month; otherwise filters to entire year
 */
async function fetchDimensionDataFilteredByDateRpc(
  supabase: ReturnType<typeof createClient>,
  reportId: string,
  dateDimId: string | undefined,
  year: number,
  month?: number
): Promise<any[]> {
  if (!dateDimId) {
    console.warn(`[pivot] No date dimension for date filter; falling back to full fetch for report ${reportId}`);
    return month != null
      ? fetchDimensionDataForReportWithMonthFilter(supabase, reportId, undefined, year, month)
      : fetchDimensionDataForReportWithYearFilter(supabase, reportId, undefined, year);
  }
  try {
    const { data, error } = await supabase.rpc('get_dimension_data_by_report_and_date', {
      p_report_id: reportId,
      p_date_dim_id: dateDimId,
      p_year: year,
      p_month: month ?? null,
      p_max_rows: 100000,
    });
    if (error) {
      console.warn(`[pivot] RPC get_dimension_data_by_report_and_date failed (${error.message}), falling back to in-memory filter`);
      return month != null
        ? fetchDimensionDataForReportWithMonthFilter(supabase, reportId, dateDimId, year, month)
        : fetchDimensionDataForReportWithYearFilter(supabase, reportId, dateDimId, year);
    }
    const raw = Array.isArray(data) ? data : [];
    const rows = raw.map((r: any) => (r && r.dimension_values !== undefined ? r.dimension_values : r));
    console.log(`[pivot] RPC returned ${rows.length} rows for report ${reportId} (year ${year}${month != null ? ` month ${month}` : ''})`);
    return rows;
  } catch (err: any) {
    console.warn(`[pivot] RPC get_dimension_data_by_report_and_date threw:`, err?.message ?? err);
    return month != null
      ? fetchDimensionDataForReportWithMonthFilter(supabase, reportId, dateDimId, year, month)
      : fetchDimensionDataForReportWithYearFilter(supabase, reportId, dateDimId, year);
  }
}

/**
 * Fetch dimension data for a report filtered to a single year.
 * Prefers DB-side RPC when date dimension is known; otherwise streams and filters in memory.
 */
async function fetchDimensionDataForReportWithYearFilter(
  supabase: ReturnType<typeof createClient>,
  reportId: string,
  dateDimId: string | undefined,
  year: number
): Promise<any[]> {
  const allRows: any[] = [];
  const batchSize = 100;
  let offset = 0;
  let hasMore = true;
  let retryCount = 0;
  const maxRetries = 3;

  if (!dateDimId) {
    console.warn(`[pivot] No date dimension for year filter; fetching all rows for report ${reportId}`);
    return fetchDimensionDataForReport(supabase, reportId);
  }

  while (hasMore) {
    try {
      const { data, error } = await supabase
        .from('dimension_data')
        .select('dimension_values')
        .eq('report_id', reportId)
        .range(offset, offset + batchSize - 1);

      if (error) {
        if (error.message?.includes('timeout') && retryCount < maxRetries) {
          retryCount++;
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
        throw error;
      }

      if (data && data.length > 0) {
        for (const row of data) {
          const rowData = row.dimension_values || row;
          const dateValue = rowData[dateDimId];
          const rowDate = parseDate(dateValue);
          if (rowDate && rowDate.getFullYear() === year) {
            allRows.push(rowData);
          }
        }
        offset += batchSize;
        hasMore = data.length === batchSize;
        retryCount = 0;
        if (offset % 2000 === 0 && offset > 0) {
          console.log(`[pivot] Year ${year}: scanned ${offset} rows, kept ${allRows.length} so far for report ${reportId}`);
        }
      } else {
        hasMore = false;
      }
    } catch (err: any) {
      console.error(`[pivot] Error fetching batch at offset ${offset} for year ${year}:`, err);
      throw err;
    }
  }

  console.log(`[pivot] Fetched ${allRows.length} rows for report ${reportId} (year ${year})`);
  return allRows;
}

/**
 * Fetch dimension data for a report filtered to a single month.
 * Only keeps rows where date dimension is in that year-month (minimal memory and CPU per invocation).
 */
async function fetchDimensionDataForReportWithMonthFilter(
  supabase: ReturnType<typeof createClient>,
  reportId: string,
  dateDimId: string | undefined,
  year: number,
  month: number
): Promise<any[]> {
  const allRows: any[] = [];
  const batchSize = 100;
  let offset = 0;
  let hasMore = true;
  let retryCount = 0;
  const maxRetries = 3;

  if (!dateDimId) {
    console.warn(`[pivot] No date dimension for month filter; fetching all rows for report ${reportId}`);
    return fetchDimensionDataForReport(supabase, reportId);
  }

  const monthZeroBased = month - 1;
  while (hasMore) {
    try {
      const { data, error } = await supabase
        .from('dimension_data')
        .select('dimension_values')
        .eq('report_id', reportId)
        .range(offset, offset + batchSize - 1);

      if (error) {
        if (error.message?.includes('timeout') && retryCount < maxRetries) {
          retryCount++;
          await new Promise((resolve) => setTimeout(resolve, 1000));
          continue;
        }
        throw error;
      }

      if (data && data.length > 0) {
        for (const row of data) {
          const rowData = row.dimension_values || row;
          const dateValue = rowData[dateDimId];
          const rowDate = parseDate(dateValue);
          if (rowDate && rowDate.getFullYear() === year && rowDate.getMonth() === monthZeroBased) {
            allRows.push(rowData);
          }
        }
        offset += batchSize;
        hasMore = data.length === batchSize;
        retryCount = 0;
      } else {
        hasMore = false;
      }
    } catch (err: any) {
      console.error(`[pivot] Error fetching batch at offset ${offset} for ${year}-${month}:`, err);
      throw err;
    }
  }

  console.log(`[pivot] Fetched ${allRows.length} rows for report ${reportId} (${year}-${String(month).padStart(2, '0')})`);
  return allRows;
}

/**
 * Aggregate metrics from rows for a date range using the proper name-to-ID mapping
 */
function aggregateMetricsForDateRange(
  rows: any[],
  dateRange: { start: Date; end: Date },
  metricNameToIdMap: Record<string, string>,
  dimensionFilter?: { dimensionId: string; dimensionName?: string; values: string[] }
): { impressions: number; clicks: number; cost: number; revenue: number; bookings: number } {
  const metrics = aggregateMetrics(
    rows,
    BASE_METRICS,
    dateRange,
    dimensionFilter,
    metricNameToIdMap
  );

  return {
    impressions: metrics['Impressions'] || 0,
    clicks: metrics['Clicks'] || 0,
    cost: metrics['Cost'] || 0,
    revenue: metrics['Revenue'] || 0,
    bookings: metrics['Bookings'] || 0,
  };
}

/**
 * Compute breakdown data for a dimension - ALL TIME (no date filtering)
 */
function computeBreakdownAllTime(
  rows: any[],
  breakdownDimensionId: string,
  breakdownDimensionName: string,
  metricNameToIdMap: Record<string, string>,
  dimensionFilter?: { dimensionId: string; dimensionName?: string; values: string[] }
): BreakdownRow[] {
  const filteredRows = rows.filter((row) => {
    const rowData = row.dimension_values || row;
    
    if (dimensionFilter && dimensionFilter.values.length > 0) {
      const dimValue = rowData[dimensionFilter.dimensionId] || 
                     (dimensionFilter.dimensionName ? rowData[dimensionFilter.dimensionName] : undefined);
      if (dimValue === undefined) return false;
      const normalizedRowValue = String(dimValue).trim();
      const normalizedFilterValues = dimensionFilter.values.map(v => String(v).trim());
      if (!normalizedFilterValues.includes(normalizedRowValue)) return false;
    }
    
    return true;
  });

  const groupedRows: Record<string, any[]> = {};
  filteredRows.forEach((row) => {
    const rowData = row.dimension_values || row;
    const breakdownValue = rowData[breakdownDimensionId] || 
                          (breakdownDimensionName ? rowData[breakdownDimensionName] : undefined);
    const groupKey = breakdownValue !== undefined && breakdownValue !== null && breakdownValue !== '' 
      ? String(breakdownValue).trim() 
      : null;
    
    if (groupKey) {
      if (!groupedRows[groupKey]) {
        groupedRows[groupKey] = [];
      }
      groupedRows[groupKey].push(row);
    }
  });

  const breakdownRows: BreakdownRow[] = [];
  Object.entries(groupedRows).forEach(([groupValue, groupRows]) => {
    const metrics = {
      impressions: 0,
      clicks: 0,
      cost: 0,
      revenue: 0,
      bookings: 0,
    };
    
    groupRows.forEach(row => {
      const rowData = row.dimension_values || row;
      metrics.impressions += parseFloat(rowData[metricNameToIdMap['Impressions']] || rowData['Impressions'] || 0) || 0;
      metrics.clicks += parseFloat(rowData[metricNameToIdMap['Clicks']] || rowData['Clicks'] || 0) || 0;
      metrics.cost += parseFloat(rowData[metricNameToIdMap['Cost']] || rowData['Cost'] || 0) || 0;
      metrics.revenue += parseFloat(rowData[metricNameToIdMap['Revenue']] || rowData['Revenue'] || 0) || 0;
      metrics.bookings += parseFloat(rowData[metricNameToIdMap['Bookings']] || rowData['Bookings'] || 0) || 0;
    });
    
    breakdownRows.push({
      [breakdownDimensionName.toLowerCase().replace(/\s+/g, '_')]: groupValue,
      name: groupValue,
      ...metrics,
    });
  });

  breakdownRows.sort((a, b) => b.revenue - a.revenue);
  return breakdownRows;
}

/**
 * Compute breakdown data for a dimension for a specific month
 */
function computeBreakdownForMonth(
  rows: any[],
  breakdownDimensionId: string,
  breakdownDimensionName: string,
  metricNameToIdMap: Record<string, string>,
  dateRange: { start: Date; end: Date },
  dateDimensionId?: string,
  dimensionFilter?: { dimensionId: string; dimensionName?: string; values: string[] }
): BreakdownRow[] {
  const dateDimId = dateDimensionId || Object.entries(metricNameToIdMap).find(([name]) => 
    name.toLowerCase() === 'date'
  )?.[1];

  const filteredRows = rows.filter((row) => {
    const rowData = row.dimension_values || row;
    
    if (dateDimId) {
      const dateValue = rowData[dateDimId];
      if (dateValue) {
        const rowDate = parseDate(dateValue);
        if (!rowDate || !isWithinInterval(rowDate, dateRange)) {
          return false;
        }
      }
    }
    
    if (dimensionFilter && dimensionFilter.values.length > 0) {
      const dimValue = rowData[dimensionFilter.dimensionId] || 
                     (dimensionFilter.dimensionName ? rowData[dimensionFilter.dimensionName] : undefined);
      if (dimValue === undefined) return false;
      const normalizedRowValue = String(dimValue).trim();
      const normalizedFilterValues = dimensionFilter.values.map(v => String(v).trim());
      if (!normalizedFilterValues.includes(normalizedRowValue)) return false;
    }
    
    return true;
  });

  const groupedRows: Record<string, any[]> = {};
  filteredRows.forEach((row) => {
    const rowData = row.dimension_values || row;
    const breakdownValue = rowData[breakdownDimensionId] || 
                          (breakdownDimensionName ? rowData[breakdownDimensionName] : undefined);
    const groupKey = breakdownValue !== undefined && breakdownValue !== null && breakdownValue !== '' 
      ? String(breakdownValue).trim() 
      : null;
    
    if (groupKey) {
      if (!groupedRows[groupKey]) {
        groupedRows[groupKey] = [];
      }
      groupedRows[groupKey].push(row);
    }
  });

  const breakdownRows: BreakdownRow[] = [];
  Object.entries(groupedRows).forEach(([groupValue, groupRows]) => {
    const metrics = {
      impressions: 0,
      clicks: 0,
      cost: 0,
      revenue: 0,
      bookings: 0,
    };
    
    groupRows.forEach(row => {
      const rowData = row.dimension_values || row;
      metrics.impressions += parseFloat(rowData[metricNameToIdMap['Impressions']] || rowData['Impressions'] || 0) || 0;
      metrics.clicks += parseFloat(rowData[metricNameToIdMap['Clicks']] || rowData['Clicks'] || 0) || 0;
      metrics.cost += parseFloat(rowData[metricNameToIdMap['Cost']] || rowData['Cost'] || 0) || 0;
      metrics.revenue += parseFloat(rowData[metricNameToIdMap['Revenue']] || rowData['Revenue'] || 0) || 0;
      metrics.bookings += parseFloat(rowData[metricNameToIdMap['Bookings']] || rowData['Bookings'] || 0) || 0;
    });
    
    breakdownRows.push({
      [breakdownDimensionName.toLowerCase().replace(/\s+/g, '_')]: groupValue,
      name: groupValue,
      ...metrics,
    });
  });

  breakdownRows.sort((a, b) => b.revenue - a.revenue);
  return breakdownRows;
}

/**
 * Compute monthly metrics for a year
 */
function computeMonthlyMetrics(
  rows: any[],
  year: number,
  metricNameToIdMap: Record<string, string>,
  dimensionFilter?: { dimensionId: string; dimensionName?: string; values: string[] }
): Record<string, ChannelMetrics> {
  const monthlyData: Record<string, ChannelMetrics> = {};
  const startOfYearDate = startOfYear(new Date(year, 0, 1));
  const now = new Date();
  const endDate = year === now.getFullYear() ? now : new Date(year, 11, 31);
  
  const months = eachMonthOfInterval({ start: startOfYearDate, end: endDate });
  
  months.forEach((month) => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    const monthKey = formatMonthKey(month);
    
    const metrics = aggregateMetricsForDateRange(rows, { start: monthStart, end: monthEnd }, metricNameToIdMap, dimensionFilter);
    monthlyData[monthKey] = calculateDerivedMetrics(metrics);
  });

  return monthlyData;
}

/**
 * Compute monthly metrics for multiple years
 */
function computeAllMonthlyMetrics(
  rows: any[],
  years: number[],
  metricNameToIdMap: Record<string, string>,
  dimensionFilter?: { dimensionId: string; dimensionName?: string; values: string[] }
): Record<string, ChannelMetrics> {
  const allMonthlyData: Record<string, ChannelMetrics> = {};
  
  for (const year of years) {
    const yearlyMonthly = computeMonthlyMetrics(rows, year, metricNameToIdMap, dimensionFilter);
    Object.assign(allMonthlyData, yearlyMonthly);
  }

  return allMonthlyData;
}

/**
 * Compute yearly totals
 */
function computeYearlyMetrics(
  rows: any[],
  years: number[],
  metricNameToIdMap: Record<string, string>,
  dimensionFilter?: { dimensionId: string; dimensionName?: string; values: string[] }
): Record<string, ChannelMetrics> {
  const yearlyData: Record<string, ChannelMetrics> = {};
  
  for (const year of years) {
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);
    
    const metrics = aggregateMetricsForDateRange(rows, { start: yearStart, end: yearEnd }, metricNameToIdMap, dimensionFilter);
    yearlyData[String(year)] = calculateDerivedMetrics(metrics);
  }

  return yearlyData;
}

/**
 * Compute pivot data for a slide report
 */
export async function computeSlideReportPivotData(
  supabase: ReturnType<typeof createClient>,
  reportIds: Record<string, string>,
  configuration: SlideReportConfiguration,
  dateRange: SlideReportDateRange
): Promise<SlideReportPivotData> {
  console.log(`[pivot] Starting pivot data computation`, {
    channels: configuration.selectedChannels,
    reportIds: Object.keys(reportIds),
    dateRange: `${dateRange.from} to ${dateRange.to}`,
  });
  
  const fromDate = new Date(dateRange.from);
  const toDate = new Date(dateRange.to);
  const now = new Date();
  
  if (fromDate > now || toDate > now) {
    console.warn(`[pivot] Date range includes future dates. From: ${dateRange.from}, To: ${dateRange.to}`);
  }
  
  if (fromDate > toDate) {
    throw new Error(`Invalid date range: 'from' date (${dateRange.from}) is after 'to' date (${dateRange.to})`);
  }
  
  const fiveYearsAgo = new Date();
  fiveYearsAgo.setFullYear(fiveYearsAgo.getFullYear() - 5);
  if (toDate < fiveYearsAgo) {
    console.warn(`[pivot] Date range is more than 5 years in the past. From: ${dateRange.from}, To: ${dateRange.to}`);
  }
  
  console.log(`[pivot] Computing data for years: ${YEARS_TO_COMPUTE.join(', ')}`);
  
  const pivotData: SlideReportPivotData = {
    overview: {
      current: {
        impressions: 0,
        clicks: 0,
        cost: 0,
        revenue: 0,
        bookings: 0,
        ctr: 0,
        conversionRate: 0,
        cpc: 0,
        roas: 0,
        costOfSale: 0,
      },
      monthly: {},
      yearly: {},
    },
    channels: {},
    budget: {
      monthly: [],
      totals: {
        totalBudget: 0,
        totalActual: 0,
        variance: 0,
      },
    },
    computedAt: new Date().toISOString(),
  };

  const currentDateRange = {
    start: fromDate,
    end: toDate,
  };

  const overviewMonthly: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }> = {};
  const overviewYearly: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }> = {};

  const channelErrors: Array<{ channel: string; reportId: string; error: string }> = [];
  
  // Pre-check: Estimate total data size to warn about potential memory issues
  let totalEstimatedRows = 0;
  for (const channel of configuration.selectedChannels) {
    const reportId = reportIds[channel];
    if (reportId) {
      try {
        const { count } = await supabase
          .from('dimension_data')
          .select('*', { count: 'exact', head: true })
          .eq('report_id', reportId);
        totalEstimatedRows += (count || 0);
      } catch (err) {
        console.warn(`[pivot] Could not estimate row count for ${channel}:`, err);
      }
    }
  }
  
  if (totalEstimatedRows > 100000) {
    console.warn(`[pivot] Large dataset detected: ${totalEstimatedRows} total rows. This may cause memory issues.`);
  }
  
  // Process channels sequentially to reduce peak memory usage
  for (const channel of configuration.selectedChannels) {
    const reportId = reportIds[channel];
    if (!reportId) {
      console.warn(`[pivot] Skipping channel ${channel} - no report ID found`);
      continue;
    }

    try {
      console.log(`[pivot] Starting processing for channel ${channel} (reportId: ${reportId})`);
      
      // Small delay between channels to help with memory cleanup
      if (channelErrors.length > 0 || Object.keys(pivotData.channels).length > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      const channelConfig = configuration.channelConfigs[channel];
      const dimensionFilter = channelConfig?.dimensionId && channelConfig.selectedValues.length > 0
        ? {
            dimensionId: channelConfig.dimensionId,
            values: channelConfig.selectedValues,
          }
        : undefined;

      const metricNameToIdMap = await buildMetricNameToIdMap(supabase, reportId);
      console.log(`[pivot] Metric map built for channel ${channel}: ${Object.keys(metricNameToIdMap).length} dimensions`);
      
      const rows = await fetchDimensionDataForReport(supabase, reportId);
      console.log(`[pivot] Fetched ${rows.length} rows for ${channel}`);
    
      if (rows.length === 0) {
        console.warn(`[pivot] No data found for ${channel} (reportId: ${reportId}). This channel will have zero metrics.`);
      }

      const currentMetrics = aggregateMetricsForDateRange(rows, currentDateRange, metricNameToIdMap, dimensionFilter);
      const currentChannelMetrics = calculateDerivedMetrics(currentMetrics);

      const prevMonthStart = new Date(currentDateRange.start);
      prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);
      const prevMonthEnd = new Date(prevMonthStart);
      prevMonthEnd.setMonth(prevMonthEnd.getMonth() + 1);
      prevMonthEnd.setDate(0);
      
      const prevPeriodMetrics = aggregateMetricsForDateRange(
        rows, 
        { start: prevMonthStart, end: prevMonthEnd },
        metricNameToIdMap,
        dimensionFilter
      );
      const prevPeriodChannelMetrics = calculateDerivedMetrics(prevPeriodMetrics);

      const prevYearStart = new Date(currentDateRange.start);
      prevYearStart.setFullYear(prevYearStart.getFullYear() - 1);
      const prevYearEnd = new Date(currentDateRange.end);
      prevYearEnd.setFullYear(prevYearEnd.getFullYear() - 1);
      
      const prevYearMetrics = aggregateMetricsForDateRange(
        rows, 
        { start: prevYearStart, end: prevYearEnd },
        metricNameToIdMap,
        dimensionFilter
      );
      const prevYearChannelMetrics = calculateDerivedMetrics(prevYearMetrics);

      const allMonthly = computeAllMonthlyMetrics(rows, YEARS_TO_COMPUTE, metricNameToIdMap, dimensionFilter);
      console.log(`[pivot] Computed ${Object.keys(allMonthly).length} monthly data points for channel ${channel}`);
      
      const yearly = computeYearlyMetrics(rows, YEARS_TO_COMPUTE, metricNameToIdMap, dimensionFilter);
      console.log(`[pivot] Computed yearly totals for channel ${channel}: ${Object.keys(yearly).length} years`);

      const breakdowns: Record<string, BreakdownRow[]> = {};
      const breakdownConfig = configuration.breakdownConfigs?.[channel];
      
      let breakdownDimensionIds = breakdownConfig?.breakdownDimensionIds || [];
      
      if (breakdownDimensionIds.length === 0) {
        console.log(`[pivot] No breakdown dimensions configured for ${channel}, auto-detecting...`);
        const hotelId = Object.entries(metricNameToIdMap).find(([name]) => name.toLowerCase() === 'hotel')?.[1];
        const campaignId = Object.entries(metricNameToIdMap).find(([name]) => name.toLowerCase() === 'campaign')?.[1];
        const accountId = Object.entries(metricNameToIdMap).find(([name]) => name.toLowerCase() === 'account')?.[1];
        const linkTypeId = Object.entries(metricNameToIdMap).find(([name]) => name.toLowerCase() === 'link type')?.[1];
        
        if (hotelId) breakdownDimensionIds.push(hotelId);
        if (campaignId) breakdownDimensionIds.push(campaignId);
        if (accountId && !hotelId) breakdownDimensionIds.push(accountId);
        if (linkTypeId && channel === 'metasearch') breakdownDimensionIds.push(linkTypeId);
        
        console.log(`[pivot] Auto-detected breakdown dimensions for ${channel}:`, breakdownDimensionIds);
      }
    
      const breakdownDimNameMap: Record<string, string> = {};
      if (breakdownDimensionIds.length > 0) {
        for (const breakdownDimId of breakdownDimensionIds) {
          try {
            const { data: dimInfo, error: dimInfoError } = await supabase
              .from('dimensions')
              .select('name')
              .eq('id', breakdownDimId)
              .single();
            
            if (dimInfoError) {
              console.error(`[pivot] Failed to fetch dimension info for ${breakdownDimId} in channel ${channel}:`, dimInfoError);
            }
            
            const breakdownDimName = dimInfo?.name || breakdownDimId;
            breakdownDimNameMap[breakdownDimId] = breakdownDimName;
            
            breakdowns[breakdownDimName] = computeBreakdownAllTime(
              rows,
              breakdownDimId,
              breakdownDimName,
              metricNameToIdMap,
              dimensionFilter
            );
            console.log(`[pivot] Computed all-time breakdown for ${breakdownDimName}: ${breakdowns[breakdownDimName].length} rows`);
          } catch (breakdownError: any) {
            console.error(`[pivot] Error computing breakdown for dimension ${breakdownDimId} in channel ${channel}:`, breakdownError);
          }
        }
      }
    
      const monthlyBreakdowns: Record<string, Record<string, BreakdownRow[]>> = {};
      const dateDimId = Object.entries(metricNameToIdMap).find(([name]) => 
        name.toLowerCase() === 'date'
      )?.[1];
      
      for (const monthKey of Object.keys(allMonthly)) {
        const [year, month] = monthKey.split('-').map(Number);
        const monthStart = new Date(year, month - 1, 1);
        const monthEnd = new Date(year, month, 0, 23, 59, 59);
        
        monthlyBreakdowns[monthKey] = {};
        
        for (const breakdownDimId of breakdownDimensionIds) {
          const breakdownDimName = breakdownDimNameMap[breakdownDimId] || breakdownDimId;
          monthlyBreakdowns[monthKey][breakdownDimName] = computeBreakdownForMonth(
            rows,
            breakdownDimId,
            breakdownDimName,
            metricNameToIdMap,
            { start: monthStart, end: monthEnd },
            dateDimId,
            dimensionFilter
          );
        }
      }
      console.log(`[pivot] Computed monthly breakdowns for ${Object.keys(monthlyBreakdowns).length} months for channel ${channel}`);

      const filterUniqueValues: Record<string, { name: string; values: string[] }> = {};
      const filterConfig = configuration.filterConfigs?.[channel];
      const filterDimensionIds = filterConfig?.filterDimensionIds || [];
    
      if (filterDimensionIds.length > 0) {
        const { data: filterDimInfo, error: filterDimInfoError } = await supabase
          .from('dimensions')
          .select('id, name')
          .in('id', filterDimensionIds);
        
        if (filterDimInfoError) {
          console.error(`[pivot] Failed to fetch filter dimension info for channel ${channel}:`, filterDimInfoError);
          throw new Error(`Failed to fetch filter dimension info for channel ${channel}: ${filterDimInfoError.message}`);
        }
        
        const filterDimNameMap: Record<string, string> = {};
        if (filterDimInfo) {
          for (const dim of filterDimInfo) {
            filterDimNameMap[dim.id] = dim.name;
          }
        }
      
        for (const filterDimId of filterDimensionIds) {
          const uniqueValues = new Set<string>();
          
        // Process rows in chunks to reduce memory pressure
        for (let i = 0; i < rows.length; i += 1000) {
          const chunk = rows.slice(i, i + 1000);
          for (const row of chunk) {
            const value = row[filterDimId];
            if (value !== undefined && value !== null && String(value).trim() !== '') {
              uniqueValues.add(String(value).trim());
            }
          }
        }
          
          const sortedValues = Array.from(uniqueValues).sort();
          filterUniqueValues[filterDimId] = {
            name: filterDimNameMap[filterDimId] || filterDimId,
            values: sortedValues,
          };
          
          console.log(`[pivot] Computed ${sortedValues.length} unique filter values for ${filterDimNameMap[filterDimId] || filterDimId} in channel ${channel}`);
        }
      }

      const dimensionMap: Record<string, string> = {};
      Object.entries(metricNameToIdMap).forEach(([name, id]) => {
        dimensionMap[id] = name;
      });
    
      // Store all raw data rows for filtering
      const rawDataRows = rows.map(row => {
        const rowData = row.dimension_values || row;
        return { ...rowData };
      });
      
      console.log(`[pivot] Storing ${rawDataRows.length} raw data rows for ${channel} with ${Object.keys(dimensionMap).length} dimensions`);

      pivotData.channels[channel] = {
        current: currentChannelMetrics,
        previous_period: prevPeriodChannelMetrics,
        previous_year: prevYearChannelMetrics,
        monthly: allMonthly,
        yearly,
        breakdowns,
        monthlyBreakdowns,
        filterUniqueValues,
        rawDataRows, // Only included for small datasets
        dimensionMap,
      };

      for (const [monthKey, metrics] of Object.entries(allMonthly)) {
        if (!overviewMonthly[monthKey]) {
          overviewMonthly[monthKey] = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
        }
        overviewMonthly[monthKey].impressions += metrics.impressions;
        overviewMonthly[monthKey].clicks += metrics.clicks;
        overviewMonthly[monthKey].cost += metrics.cost;
        overviewMonthly[monthKey].revenue += metrics.revenue;
        overviewMonthly[monthKey].bookings += metrics.bookings;
      }

      for (const [yearKey, metrics] of Object.entries(yearly)) {
        if (!overviewYearly[yearKey]) {
          overviewYearly[yearKey] = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
        }
        overviewYearly[yearKey].impressions += metrics.impressions;
        overviewYearly[yearKey].clicks += metrics.clicks;
        overviewYearly[yearKey].cost += metrics.cost;
        overviewYearly[yearKey].revenue += metrics.revenue;
        overviewYearly[yearKey].bookings += metrics.bookings;
      }

      pivotData.overview.current.impressions += currentChannelMetrics.impressions;
      pivotData.overview.current.clicks += currentChannelMetrics.clicks;
      pivotData.overview.current.cost += currentChannelMetrics.cost;
      pivotData.overview.current.revenue += currentChannelMetrics.revenue;
      pivotData.overview.current.bookings += currentChannelMetrics.bookings;
      
      console.log(`[pivot] Successfully completed processing for channel ${channel}`);
    } catch (channelError: any) {
      const errorMessage = channelError?.message || channelError?.error_description || channelError?.details || String(channelError);
      console.error(`[pivot] Error processing channel ${channel} (reportId: ${reportId}):`, {
        error: channelError,
        message: errorMessage,
        stack: channelError?.stack,
      });
      
      channelErrors.push({
        channel,
        reportId,
        error: errorMessage,
      });
      
      console.warn(`[pivot] Continuing with other channels despite error in ${channel}`);
    }
  }
  
  if (channelErrors.length > 0) {
    const errorSummary = channelErrors.map(e => `${e.channel} (${e.reportId}): ${e.error}`).join('; ');
    console.error(`[pivot] Failed to process ${channelErrors.length} channel(s):`, channelErrors);
    throw new Error(`Failed to process ${channelErrors.length} channel(s): ${errorSummary}`);
  }

  pivotData.overview.monthly = {};
  for (const [monthKey, baseMetrics] of Object.entries(overviewMonthly)) {
    pivotData.overview.monthly[monthKey] = calculateDerivedMetrics(baseMetrics);
  }

  pivotData.overview.yearly = {};
  for (const [yearKey, baseMetrics] of Object.entries(overviewYearly)) {
    pivotData.overview.yearly[yearKey] = calculateDerivedMetrics(baseMetrics);
  }

  pivotData.overview.current = calculateDerivedMetrics({
    impressions: pivotData.overview.current.impressions,
    clicks: pivotData.overview.current.clicks,
    cost: pivotData.overview.current.cost,
    revenue: pivotData.overview.current.revenue,
    bookings: pivotData.overview.current.bookings,
  });

  const overviewPrevPeriod = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
  const overviewPrevYear = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };

  for (const channel of configuration.selectedChannels) {
    const channelData = pivotData.channels[channel];
    if (channelData?.previous_period) {
      overviewPrevPeriod.impressions += channelData.previous_period.impressions;
      overviewPrevPeriod.clicks += channelData.previous_period.clicks;
      overviewPrevPeriod.cost += channelData.previous_period.cost;
      overviewPrevPeriod.revenue += channelData.previous_period.revenue;
      overviewPrevPeriod.bookings += channelData.previous_period.bookings;
    }
    if (channelData?.previous_year) {
      overviewPrevYear.impressions += channelData.previous_year.impressions;
      overviewPrevYear.clicks += channelData.previous_year.clicks;
      overviewPrevYear.cost += channelData.previous_year.cost;
      overviewPrevYear.revenue += channelData.previous_year.revenue;
      overviewPrevYear.bookings += channelData.previous_year.bookings;
    }
  }

  pivotData.overview.previous_period = calculateDerivedMetrics(overviewPrevPeriod);
  pivotData.overview.previous_year = calculateDerivedMetrics(overviewPrevYear);

  pivotData.budget = {
    monthly: [],
    totals: {
      totalBudget: 0,
      totalActual: 0,
      variance: 0,
    },
  };

  console.log(`[pivot] Pivot data computation completed successfully for ${Object.keys(pivotData.channels).length} channel(s)`);
  return pivotData;
}

/**
 * Compute pivot data for a single channel
 * This function processes one channel and returns its data plus overview contributions
 */
export async function computeChannelPivotData(
  supabase: ReturnType<typeof createClient>,
  channel: string,
  reportId: string,
  channelConfig: SlideReportConfiguration['channelConfigs'][string] | undefined,
  breakdownConfig: SlideReportConfiguration['breakdownConfigs'][string] | undefined,
  filterConfig: SlideReportConfiguration['filterConfigs'][string] | undefined,
  currentDateRange: { start: Date; end: Date }
): Promise<{
  channelData: SlideReportPivotData['channels'][string];
  overviewContributions: {
    monthly: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }>;
    yearly: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }>;
    current: { impressions: number; clicks: number; cost: number; revenue: number; bookings: number };
  };
}> {
  console.log(`[channel-pivot] Starting processing for channel ${channel} (reportId: ${reportId})`);

  const dimensionFilter = channelConfig?.dimensionId && channelConfig.selectedValues.length > 0
    ? {
        dimensionId: channelConfig.dimensionId,
        values: channelConfig.selectedValues,
      }
    : undefined;

  const metricNameToIdMap = await buildMetricNameToIdMap(supabase, reportId);
  const dimensionNames = Object.keys(metricNameToIdMap);
  const requiredMetrics = ['Impressions', 'Clicks', 'Cost', 'Revenue', 'Bookings', 'Date'];
  const missingMetrics = requiredMetrics.filter((name) => !dimensionNames.some((n) => n.toLowerCase() === name.toLowerCase()));
  console.log(`[channel-pivot] Metric map built for channel ${channel}: ${dimensionNames.length} dimensions`);
  console.log(`[testing] channel-pivot: channel=${channel}, reportId=${reportId}, dimensionNames=${JSON.stringify(dimensionNames.slice(0, 25))}${dimensionNames.length > 25 ? '...' : ''}, missingRequiredMetrics=${JSON.stringify(missingMetrics)}`);

  const rows = await fetchDimensionDataForReport(supabase, reportId);
  console.log(`[channel-pivot] Fetched ${rows.length} rows for ${channel}`);
  console.log(`[testing] channel-pivot: channel=${channel}, reportId=${reportId}, rowCount=${rows.length}`);

  if (rows.length === 0) {
    console.warn(`[channel-pivot] No data found for ${channel} (reportId: ${reportId}). This channel will have zero metrics.`);
  }

  const currentMetrics = aggregateMetricsForDateRange(rows, currentDateRange, metricNameToIdMap, dimensionFilter);
  const currentChannelMetrics = calculateDerivedMetrics(currentMetrics);

  const prevMonthStart = new Date(currentDateRange.start);
  prevMonthStart.setMonth(prevMonthStart.getMonth() - 1);
  const prevMonthEnd = new Date(prevMonthStart);
  prevMonthEnd.setMonth(prevMonthEnd.getMonth() + 1);
  prevMonthEnd.setDate(0);
  
  const prevPeriodMetrics = aggregateMetricsForDateRange(
    rows, 
    { start: prevMonthStart, end: prevMonthEnd },
    metricNameToIdMap,
    dimensionFilter
  );
  const prevPeriodChannelMetrics = calculateDerivedMetrics(prevPeriodMetrics);

  const prevYearStart = new Date(currentDateRange.start);
  prevYearStart.setFullYear(prevYearStart.getFullYear() - 1);
  const prevYearEnd = new Date(currentDateRange.end);
  prevYearEnd.setFullYear(prevYearEnd.getFullYear() - 1);
  
  const prevYearMetrics = aggregateMetricsForDateRange(
    rows, 
    { start: prevYearStart, end: prevYearEnd },
    metricNameToIdMap,
    dimensionFilter
  );
  const prevYearChannelMetrics = calculateDerivedMetrics(prevYearMetrics);

  // Limit to date range + 1 year back to reduce CPU (avoid computing 36 months when report range is narrow)
  const rangeStart = new Date(currentDateRange.start);
  rangeStart.setFullYear(rangeStart.getFullYear() - 1);
  rangeStart.setDate(1);
  const rangeEnd = new Date(currentDateRange.end);
  const monthsInRange = eachMonthOfInterval({ start: rangeStart, end: rangeEnd });
  const yearsInRange = [...new Set(monthsInRange.map((d) => d.getFullYear()))].sort((a, b) => a - b);

  const allMonthly = computeAllMonthlyMetrics(rows, yearsInRange.length > 0 ? yearsInRange : YEARS_TO_COMPUTE, metricNameToIdMap, dimensionFilter);
  console.log(`[channel-pivot] Computed ${Object.keys(allMonthly).length} monthly data points for channel ${channel}`);

  const yearly = computeYearlyMetrics(rows, yearsInRange.length > 0 ? yearsInRange : YEARS_TO_COMPUTE, metricNameToIdMap, dimensionFilter);
  console.log(`[channel-pivot] Computed yearly totals for channel ${channel}: ${Object.keys(yearly).length} years`);

  const breakdowns: Record<string, BreakdownRow[]> = {};
  let breakdownDimensionIds = breakdownConfig?.breakdownDimensionIds || [];
  
  if (breakdownDimensionIds.length === 0) {
    console.log(`[channel-pivot] No breakdown dimensions configured for ${channel}, auto-detecting...`);
    const hotelId = Object.entries(metricNameToIdMap).find(([name]) => name.toLowerCase() === 'hotel')?.[1];
    const campaignId = Object.entries(metricNameToIdMap).find(([name]) => name.toLowerCase() === 'campaign')?.[1];
    const accountId = Object.entries(metricNameToIdMap).find(([name]) => name.toLowerCase() === 'account')?.[1];
    const linkTypeId = Object.entries(metricNameToIdMap).find(([name]) => name.toLowerCase() === 'link type')?.[1];
    
    if (hotelId) breakdownDimensionIds.push(hotelId);
    if (campaignId) breakdownDimensionIds.push(campaignId);
    if (accountId && !hotelId) breakdownDimensionIds.push(accountId);
    if (linkTypeId && channel === 'metasearch') breakdownDimensionIds.push(linkTypeId);
    
    console.log(`[channel-pivot] Auto-detected breakdown dimensions for ${channel}:`, breakdownDimensionIds);
  }

  const breakdownDimNameMap: Record<string, string> = {};
  if (breakdownDimensionIds.length > 0) {
    for (const breakdownDimId of breakdownDimensionIds) {
      try {
        const { data: dimInfo, error: dimInfoError } = await supabase
          .from('dimensions')
          .select('name')
          .eq('id', breakdownDimId)
          .single();
        
        if (dimInfoError) {
          console.error(`[channel-pivot] Failed to fetch dimension info for ${breakdownDimId} in channel ${channel}:`, dimInfoError);
        }
        
        const breakdownDimName = dimInfo?.name || breakdownDimId;
        breakdownDimNameMap[breakdownDimId] = breakdownDimName;
        
        breakdowns[breakdownDimName] = computeBreakdownAllTime(
          rows,
          breakdownDimId,
          breakdownDimName,
          metricNameToIdMap,
          dimensionFilter
        );
        console.log(`[channel-pivot] Computed all-time breakdown for ${breakdownDimName}: ${breakdowns[breakdownDimName].length} rows`);
      } catch (breakdownError: any) {
        console.error(`[channel-pivot] Error computing breakdown for dimension ${breakdownDimId} in channel ${channel}:`, breakdownError);
      }
    }
  }

  const monthlyBreakdowns: Record<string, Record<string, BreakdownRow[]>> = {};
  if (rows.length <= ROW_COUNT_CPU_GUARD) {
    const dateDimId = Object.entries(metricNameToIdMap).find(([name]) =>
      name.toLowerCase() === 'date'
    )?.[1];

    for (const monthKey of Object.keys(allMonthly)) {
      const [year, month] = monthKey.split('-').map(Number);
      const monthStart = new Date(year, month - 1, 1);
      const monthEnd = new Date(year, month, 0, 23, 59, 59);

      monthlyBreakdowns[monthKey] = {};

      for (const breakdownDimId of breakdownDimensionIds) {
        const breakdownDimName = breakdownDimNameMap[breakdownDimId] || breakdownDimId;
        monthlyBreakdowns[monthKey][breakdownDimName] = computeBreakdownForMonth(
          rows,
          breakdownDimId,
          breakdownDimName,
          metricNameToIdMap,
          { start: monthStart, end: monthEnd },
          dateDimId,
          dimensionFilter
        );
      }
    }
    console.log(`[channel-pivot] Computed monthly breakdowns for ${Object.keys(monthlyBreakdowns).length} months for channel ${channel}`);
  } else {
    console.log(`[channel-pivot] Skipping monthlyBreakdowns for ${channel} (${rows.length} rows > ${ROW_COUNT_CPU_GUARD}) to stay within CPU time limit; frontend will use all-time breakdowns`);
  }

  const filterUniqueValues: Record<string, { name: string; values: string[] }> = {};
  const filterDimensionIds = filterConfig?.filterDimensionIds || [];

  if (filterDimensionIds.length > 0) {
    const { data: filterDimInfo, error: filterDimInfoError } = await supabase
      .from('dimensions')
      .select('id, name')
      .in('id', filterDimensionIds);
    
    if (filterDimInfoError) {
      console.error(`[channel-pivot] Failed to fetch filter dimension info for channel ${channel}:`, filterDimInfoError);
      throw new Error(`Failed to fetch filter dimension info for channel ${channel}: ${filterDimInfoError.message}`);
    }
    
    const filterDimNameMap: Record<string, string> = {};
    if (filterDimInfo) {
      for (const dim of filterDimInfo) {
        filterDimNameMap[dim.id] = dim.name;
      }
    }
  
    for (const filterDimId of filterDimensionIds) {
      const uniqueValues = new Set<string>();
      
      // Process rows in chunks to reduce memory pressure
      for (let i = 0; i < rows.length; i += 1000) {
        const chunk = rows.slice(i, i + 1000);
        for (const row of chunk) {
          const value = row[filterDimId];
          if (value !== undefined && value !== null && String(value).trim() !== '') {
            uniqueValues.add(String(value).trim());
          }
        }
      }
      
      const sortedValues = Array.from(uniqueValues).sort();
      filterUniqueValues[filterDimId] = {
        name: filterDimNameMap[filterDimId] || filterDimId,
        values: sortedValues,
      };
      
      console.log(`[channel-pivot] Computed ${sortedValues.length} unique filter values for ${filterDimNameMap[filterDimId] || filterDimId} in channel ${channel}`);
    }
  }

  const dimensionMap: Record<string, string> = {};
  Object.entries(metricNameToIdMap).forEach(([name, id]) => {
    dimensionMap[id] = name;
  });

  // Store raw data rows only when under limit to avoid WORKER_LIMIT; frontend falls back to pre-computed breakdowns when empty
  let rawDataRows: any[];
  if (rows.length > MAX_RAW_DATA_ROWS) {
    rawDataRows = [];
    console.log(`[channel-pivot] Omitting rawDataRows for ${channel} (${rows.length} rows > ${MAX_RAW_DATA_ROWS}) to stay within compute limits; frontend will use pre-computed breakdowns`);
  } else {
    rawDataRows = rows.map(row => {
      const rowData = row.dimension_values || row;
      return { ...rowData };
    });
    console.log(`[channel-pivot] Storing ${rawDataRows.length} raw data rows for ${channel} with ${Object.keys(dimensionMap).length} dimensions`);
  }

  const channelData: SlideReportPivotData['channels'][string] = {
    current: currentChannelMetrics,
    previous_period: prevPeriodChannelMetrics,
    previous_year: prevYearChannelMetrics,
    monthly: allMonthly,
    yearly,
    breakdowns,
    monthlyBreakdowns,
    filterUniqueValues,
    rawDataRows,
    dimensionMap,
  };

  // Calculate overview contributions
  const overviewMonthly: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }> = {};
  const overviewYearly: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }> = {};

  for (const [monthKey, metrics] of Object.entries(allMonthly)) {
    overviewMonthly[monthKey] = {
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      cost: metrics.cost,
      revenue: metrics.revenue,
      bookings: metrics.bookings,
    };
  }

  for (const [yearKey, metrics] of Object.entries(yearly)) {
    overviewYearly[yearKey] = {
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      cost: metrics.cost,
      revenue: metrics.revenue,
      bookings: metrics.bookings,
    };
  }

  const overviewCurrent = {
    impressions: currentChannelMetrics.impressions,
    clicks: currentChannelMetrics.clicks,
    cost: currentChannelMetrics.cost,
    revenue: currentChannelMetrics.revenue,
    bookings: currentChannelMetrics.bookings,
  };

  console.log(`[channel-pivot] Successfully completed processing for channel ${channel}`);

  return {
    channelData,
    overviewContributions: {
      monthly: overviewMonthly,
      yearly: overviewYearly,
      current: overviewCurrent,
    },
  };
}

/**
 * Per-year slice: compute pivot data for a single year only (used to split load and avoid CPU timeout).
 * Fetches only rows for that year, then computes monthly/yearly/breakdowns/monthlyBreakdowns for that year.
 * Returns slice to be stored in slide_report_channel_year_data and merged by main refresh.
 */
export async function computeChannelPivotDataForYear(
  supabase: ReturnType<typeof createClient>,
  channel: string,
  reportId: string,
  year: number,
  channelConfig: SlideReportConfiguration['channelConfigs'][string] | undefined,
  breakdownConfig: SlideReportConfiguration['breakdownConfigs'][string] | undefined,
  filterConfig: SlideReportConfiguration['filterConfigs'][string] | undefined
): Promise<{
  channelDataSlice: {
    monthly: Record<string, ChannelMetrics>;
    yearly: Record<string, ChannelMetrics>;
    breakdowns: Record<string, BreakdownRow[]>;
    monthlyBreakdowns: Record<string, Record<string, BreakdownRow[]>>;
    filterUniqueValues: Record<string, { name: string; values: string[] }>;
    dimensionMap: Record<string, string>;
  };
  overviewContributions: {
    monthly: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }>;
    yearly: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }>;
    current: { impressions: number; clicks: number; cost: number; revenue: number; bookings: number };
  };
}> {
  console.log(`[channel-pivot] Starting per-year processing for channel ${channel} year ${year} (reportId: ${reportId})`);

  const dimensionFilter = channelConfig?.dimensionId && channelConfig.selectedValues.length > 0
    ? { dimensionId: channelConfig.dimensionId, values: channelConfig.selectedValues }
    : undefined;

  const metricNameToIdMap = await buildMetricNameToIdMap(supabase, reportId);
  const dateDimId = Object.entries(metricNameToIdMap).find(([name]) => name.toLowerCase() === 'date')?.[1];

  const rows = await fetchDimensionDataFilteredByDateRpc(supabase, reportId, dateDimId, year);
  console.log(`[channel-pivot] Fetched ${rows.length} rows for ${channel} year ${year}`);

  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59);
  const allMonthly = computeMonthlyMetrics(rows, year, metricNameToIdMap, dimensionFilter);
  const yearly = computeYearlyMetrics(rows, [year], metricNameToIdMap, dimensionFilter);

  let breakdownDimensionIds = breakdownConfig?.breakdownDimensionIds || [];
  if (breakdownDimensionIds.length === 0) {
    const hotelId = Object.entries(metricNameToIdMap).find(([name]) => name.toLowerCase() === 'hotel')?.[1];
    const campaignId = Object.entries(metricNameToIdMap).find(([name]) => name.toLowerCase() === 'campaign')?.[1];
    const accountId = Object.entries(metricNameToIdMap).find(([name]) => name.toLowerCase() === 'account')?.[1];
    const linkTypeId = Object.entries(metricNameToIdMap).find(([name]) => name.toLowerCase() === 'link type')?.[1];
    if (hotelId) breakdownDimensionIds.push(hotelId);
    if (campaignId) breakdownDimensionIds.push(campaignId);
    if (accountId && !hotelId) breakdownDimensionIds.push(accountId);
    if (linkTypeId && channel === 'metasearch') breakdownDimensionIds.push(linkTypeId);
  }

  const breakdowns: Record<string, BreakdownRow[]> = {};
  const breakdownDimNameMap: Record<string, string> = {};
  for (const breakdownDimId of breakdownDimensionIds) {
    const { data: dimInfo } = await supabase.from('dimensions').select('name').eq('id', breakdownDimId).single();
    const breakdownDimName = dimInfo?.name || breakdownDimId;
    breakdownDimNameMap[breakdownDimId] = breakdownDimName;
    breakdowns[breakdownDimName] = computeBreakdownAllTime(rows, breakdownDimId, breakdownDimName, metricNameToIdMap, dimensionFilter);
  }

  const monthlyBreakdowns: Record<string, Record<string, BreakdownRow[]>> = {};
  const dateDimIdForMonth = Object.entries(metricNameToIdMap).find(([name]) => name.toLowerCase() === 'date')?.[1];
  for (const monthKey of Object.keys(allMonthly)) {
    const [y, month] = monthKey.split('-').map(Number);
    const monthStart = new Date(y, month - 1, 1);
    const monthEnd = new Date(y, month, 0, 23, 59, 59);
    monthlyBreakdowns[monthKey] = {};
    for (const breakdownDimId of breakdownDimensionIds) {
      const breakdownDimName = breakdownDimNameMap[breakdownDimId] || breakdownDimId;
      monthlyBreakdowns[monthKey][breakdownDimName] = computeBreakdownForMonth(
        rows, breakdownDimId, breakdownDimName, metricNameToIdMap,
        { start: monthStart, end: monthEnd }, dateDimIdForMonth, dimensionFilter
      );
    }
  }

  const filterUniqueValues: Record<string, { name: string; values: string[] }> = {};
  const filterDimensionIds = filterConfig?.filterDimensionIds || [];
  if (filterDimensionIds.length > 0) {
    const { data: filterDimInfo } = await supabase.from('dimensions').select('id, name').in('id', filterDimensionIds);
    const filterDimNameMap: Record<string, string> = {};
    if (filterDimInfo) for (const dim of filterDimInfo) filterDimNameMap[dim.id] = dim.name;
    for (const filterDimId of filterDimensionIds) {
      const uniqueValues = new Set<string>();
      for (const row of rows) {
        const value = row[filterDimId];
        if (value !== undefined && value !== null && String(value).trim() !== '') uniqueValues.add(String(value).trim());
      }
      filterUniqueValues[filterDimId] = { name: filterDimNameMap[filterDimId] || filterDimId, values: Array.from(uniqueValues).sort() };
    }
  }

  const dimensionMap: Record<string, string> = {};
  Object.entries(metricNameToIdMap).forEach(([name, id]) => { dimensionMap[id] = name; });

  const yearMetrics = yearly[String(year)];
  const overviewCurrent = yearMetrics
    ? { impressions: yearMetrics.impressions, clicks: yearMetrics.clicks, cost: yearMetrics.cost, revenue: yearMetrics.revenue, bookings: yearMetrics.bookings }
    : { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };

  const overviewMonthly: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }> = {};
  for (const [monthKey, metrics] of Object.entries(allMonthly)) {
    overviewMonthly[monthKey] = {
      impressions: metrics.impressions, clicks: metrics.clicks, cost: metrics.cost,
      revenue: metrics.revenue, bookings: metrics.bookings,
    };
  }
  const overviewYearly: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }> = {};
  for (const [yearKey, metrics] of Object.entries(yearly)) {
    overviewYearly[yearKey] = {
      impressions: metrics.impressions, clicks: metrics.clicks, cost: metrics.cost,
      revenue: metrics.revenue, bookings: metrics.bookings,
    };
  }

  console.log(`[channel-pivot] Per-year slice completed for channel ${channel} year ${year}`);
  return {
    channelDataSlice: {
      monthly: allMonthly,
      yearly,
      breakdowns,
      monthlyBreakdowns,
      filterUniqueValues,
      dimensionMap,
    },
    overviewContributions: {
      monthly: overviewMonthly,
      yearly: overviewYearly,
      current: overviewCurrent,
    },
  };
}

/**
 * Per-month slice: compute pivot data for a single month only (minimal load per invocation).
 * Fetches only rows for that month, returns one month's monthly + monthlyBreakdowns + breakdowns.
 */
export async function computeChannelPivotDataForMonth(
  supabase: ReturnType<typeof createClient>,
  channel: string,
  reportId: string,
  year: number,
  month: number,
  channelConfig: SlideReportConfiguration['channelConfigs'][string] | undefined,
  breakdownConfig: SlideReportConfiguration['breakdownConfigs'][string] | undefined,
  filterConfig: SlideReportConfiguration['filterConfigs'][string] | undefined
): Promise<{
  channelDataSlice: {
    monthly: Record<string, ChannelMetrics>;
    yearly: Record<string, ChannelMetrics>;
    breakdowns: Record<string, BreakdownRow[]>;
    monthlyBreakdowns: Record<string, Record<string, BreakdownRow[]>>;
    filterUniqueValues: Record<string, { name: string; values: string[] }>;
    dimensionMap: Record<string, string>;
  };
  overviewContributions: {
    monthly: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }>;
    yearly: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }>;
    current: { impressions: number; clicks: number; cost: number; revenue: number; bookings: number };
  };
}> {
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;
  console.log(`[channel-pivot] Starting per-month processing for channel ${channel} ${monthKey} (reportId: ${reportId})`);

  const dimensionFilter = channelConfig?.dimensionId && channelConfig.selectedValues.length > 0
    ? { dimensionId: channelConfig.dimensionId, values: channelConfig.selectedValues }
    : undefined;

  const metricNameToIdMap = await buildMetricNameToIdMap(supabase, reportId);
  const dateDimId = Object.entries(metricNameToIdMap).find(([name]) => name.toLowerCase() === 'date')?.[1];

  const rows = await fetchDimensionDataFilteredByDateRpc(supabase, reportId, dateDimId, year, month);
  console.log(`[channel-pivot] Fetched ${rows.length} rows for ${channel} ${monthKey}`);

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0, 23, 59, 59);
  const metricsForMonth = aggregateMetricsForDateRange(rows, { start: monthStart, end: monthEnd }, metricNameToIdMap, dimensionFilter);
  const monthly: Record<string, ChannelMetrics> = { [monthKey]: calculateDerivedMetrics(metricsForMonth) };
  const yearly: Record<string, ChannelMetrics> = { [String(year)]: calculateDerivedMetrics(metricsForMonth) };

  let breakdownDimensionIds = breakdownConfig?.breakdownDimensionIds || [];
  if (breakdownDimensionIds.length === 0) {
    const hotelId = Object.entries(metricNameToIdMap).find(([name]) => name.toLowerCase() === 'hotel')?.[1];
    const campaignId = Object.entries(metricNameToIdMap).find(([name]) => name.toLowerCase() === 'campaign')?.[1];
    const accountId = Object.entries(metricNameToIdMap).find(([name]) => name.toLowerCase() === 'account')?.[1];
    const linkTypeId = Object.entries(metricNameToIdMap).find(([name]) => name.toLowerCase() === 'link type')?.[1];
    if (hotelId) breakdownDimensionIds.push(hotelId);
    if (campaignId) breakdownDimensionIds.push(campaignId);
    if (accountId && !hotelId) breakdownDimensionIds.push(accountId);
    if (linkTypeId && channel === 'metasearch') breakdownDimensionIds.push(linkTypeId);
  }

  const breakdowns: Record<string, BreakdownRow[]> = {};
  const monthlyBreakdowns: Record<string, Record<string, BreakdownRow[]>> = { [monthKey]: {} };
  const dateDimIdForMonth = dateDimId;
  for (const breakdownDimId of breakdownDimensionIds) {
    const { data: dimInfo } = await supabase.from('dimensions').select('name').eq('id', breakdownDimId).single();
    const breakdownDimName = dimInfo?.name || breakdownDimId;
    const monthBreakdown = computeBreakdownForMonth(
      rows, breakdownDimId, breakdownDimName, metricNameToIdMap,
      { start: monthStart, end: monthEnd }, dateDimIdForMonth, dimensionFilter
    );
    breakdowns[breakdownDimName] = monthBreakdown;
    monthlyBreakdowns[monthKey][breakdownDimName] = monthBreakdown;
  }

  const filterUniqueValues: Record<string, { name: string; values: string[] }> = {};
  const filterDimensionIds = filterConfig?.filterDimensionIds || [];
  if (filterDimensionIds.length > 0) {
    const { data: filterDimInfo } = await supabase.from('dimensions').select('id, name').in('id', filterDimensionIds);
    const filterDimNameMap: Record<string, string> = {};
    if (filterDimInfo) for (const dim of filterDimInfo) filterDimNameMap[dim.id] = dim.name;
    for (const filterDimId of filterDimensionIds) {
      const uniqueValues = new Set<string>();
      for (const row of rows) {
        const value = row[filterDimId];
        if (value !== undefined && value !== null && String(value).trim() !== '') uniqueValues.add(String(value).trim());
      }
      filterUniqueValues[filterDimId] = { name: filterDimNameMap[filterDimId] || filterDimId, values: Array.from(uniqueValues).sort() };
    }
  }

  const dimensionMap: Record<string, string> = {};
  Object.entries(metricNameToIdMap).forEach(([name, id]) => { dimensionMap[id] = name; });

  const overviewMonthly: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }> = {
    [monthKey]: {
      impressions: metricsForMonth.impressions, clicks: metricsForMonth.clicks, cost: metricsForMonth.cost,
      revenue: metricsForMonth.revenue, bookings: metricsForMonth.bookings,
    },
  };
  const overviewYearly: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }> = {
    [String(year)]: {
      impressions: metricsForMonth.impressions, clicks: metricsForMonth.clicks, cost: metricsForMonth.cost,
      revenue: metricsForMonth.revenue, bookings: metricsForMonth.bookings,
    },
  };
  const overviewCurrent = {
    impressions: metricsForMonth.impressions, clicks: metricsForMonth.clicks, cost: metricsForMonth.cost,
    revenue: metricsForMonth.revenue, bookings: metricsForMonth.bookings,
  };

  console.log(`[channel-pivot] Per-month slice completed for channel ${channel} ${monthKey}`);
  return {
    channelDataSlice: {
      monthly,
      yearly,
      breakdowns,
      monthlyBreakdowns,
      filterUniqueValues,
      dimensionMap,
    },
    overviewContributions: {
      monthly: overviewMonthly,
      yearly: overviewYearly,
      current: overviewCurrent,
    },
  };
}
