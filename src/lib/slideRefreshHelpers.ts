/**
 * Optimized helper functions for slide report refresh
 * Reduces backend load and improves code readability
 */

import { supabase } from "@/integrations/supabase/client";
import { SlideReportPivotData, SlideReportConfiguration } from "@/types/slideReports";

/**
 * Monthly record type for database storage
 */
export type MonthlyRecord = {
  slide_report_id: string;
  account_id: string | null;
  year: number;
  month: number;
  channel: string;
  metrics: any;
  breakdowns: any;
  row_count: number;
  computed_at: string;
};

/**
 * Prepare monthly data records from pivot data
 * Optimized: Pre-computes timestamp and uses efficient loops
 * 
 * @param pivotData - The computed pivot data
 * @param slideReportId - The slide report ID
 * @param accountId - The account ID (can be null)
 * @returns Array of monthly record objects ready for database insertion
 */
export function prepareMonthlyRecords(
  pivotData: SlideReportPivotData,
  slideReportId: string,
  accountId: string | null
): MonthlyRecord[] {
  const records: MonthlyRecord[] = [];
  
  // Pre-compute timestamp once (reduces Date object creation from N to 1)
  const computedAt = new Date().toISOString();
  
  // Process overview monthly data
  if (pivotData.overview?.monthly) {
    for (const [monthKey, metrics] of Object.entries(pivotData.overview.monthly)) {
      const [year, month] = monthKey.split('-').map(Number);
      records.push({
        slide_report_id: slideReportId,
        account_id: accountId,
        year,
        month,
        channel: 'overview',
        metrics,
        breakdowns: {},
        row_count: 1,
        computed_at: computedAt,
      });
    }
  }
  
  // Process channel-specific monthly data
  if (pivotData.channels) {
    for (const [channel, channelData] of Object.entries(pivotData.channels)) {
      if (!channelData.monthly) continue;
      
      for (const [monthKey, metrics] of Object.entries(channelData.monthly)) {
        const [year, month] = monthKey.split('-').map(Number);
        const monthlyBreakdowns = channelData.monthlyBreakdowns?.[monthKey] || {};
        
        // Calculate row count efficiently in a single pass
        let rowCount = 0;
        for (const breakdownArray of Object.values(monthlyBreakdowns)) {
          if (Array.isArray(breakdownArray)) {
            rowCount += breakdownArray.length;
          }
        }
        
        records.push({
          slide_report_id: slideReportId,
          account_id: accountId,
          year,
          month,
          channel,
          metrics,
          breakdowns: monthlyBreakdowns,
          row_count: rowCount,
          computed_at: computedAt,
        });
      }
    }
  }
  
  return records;
}

/**
 * Insert monthly records in batches with proper error handling
 * Optimized: Sequential batch processing to avoid overwhelming database
 * 
 * @param records - Array of monthly records to insert
 * @param batchSize - Number of records per batch (default: 100)
 * @returns Result object with success status, inserted count, and errors
 */
export async function insertMonthlyRecordsBatched(
  records: MonthlyRecord[],
  batchSize: number = 100
): Promise<{ success: boolean; inserted: number; errors: string[] }> {
  if (records.length === 0) {
    return { success: true, inserted: 0, errors: [] };
  }
  
  const errors: string[] = [];
  let inserted = 0;
  
  // Process batches sequentially to avoid overwhelming the database
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    
    try {
      const { error } = await supabase
        .from("slide_report_monthly_data")
        .insert(batch);
      
      if (error) {
        console.error(`[refresh] Error inserting batch ${batchNumber}:`, error);
        errors.push(`Batch ${batchNumber}: ${error.message}`);
      } else {
        inserted += batch.length;
      }
    } catch (err: any) {
      const errorMsg = err?.message || String(err);
      console.error(`[refresh] Exception inserting batch ${batchNumber}:`, err);
      errors.push(`Batch ${batchNumber}: ${errorMsg}`);
    }
  }
  
  return {
    success: errors.length === 0,
    inserted,
    errors,
  };
}

/**
 * Extract filter dimension values from pivot data
 * Optimized: Single pass through channels and filter configs
 * 
 * @param pivotData - The computed pivot data
 * @param config - The slide report configuration
 * @param validChannels - Array of valid channel names
 * @returns Object containing filter dimension values and names
 */
export function extractFilterDimensionValues(
  pivotData: SlideReportPivotData,
  config: SlideReportConfiguration,
  validChannels: string[]
): {
  values: Record<string, Record<string, string[]>>;
  names: Record<string, Record<string, string>>;
} {
  const values: Record<string, Record<string, string[]>> = {
    metasearch: {},
    sem: {},
    social: {},
  };
  const names: Record<string, Record<string, string>> = {
    metasearch: {},
    sem: {},
    social: {},
  };
  
  // Single pass through channels
  for (const channel of validChannels) {
    const channelData = pivotData.channels?.[channel];
    const channelFilterConfig = config.filterConfigs?.[channel];
    
    if (!channelData || !channelFilterConfig?.filterDimensionIds?.length) continue;
    
    const filterUniqueValues = (channelData as any).filterUniqueValues as 
      Record<string, { name: string; values: string[] }> | undefined;
    
    if (filterUniqueValues) {
      for (const filterDimId of channelFilterConfig.filterDimensionIds) {
        const filterData = filterUniqueValues[filterDimId];
        if (filterData) {
          values[channel][filterDimId] = filterData.values;
          names[channel][filterDimId] = filterData.name;
        }
      }
    }
  }
  
  return { values, names };
}

/**
 * Calculate breakdown and filter configuration counts
 * Optimized: Single pass through config objects
 * 
 * @param config - The slide report configuration
 * @returns Object containing breakdown and filter counts
 */
export function calculateConfigCounts(config: SlideReportConfiguration): {
  breakdownCount: number;
  filterCount: number;
} {
  let breakdownCount = 0;
  let filterCount = 0;
  
  const breakdownConfigs = config.breakdownConfigs || {};
  const filterConfigs = config.filterConfigs || {};
  
  // Single pass through breakdown configs
  for (const cfg of Object.values(breakdownConfigs)) {
    breakdownCount += (cfg as any)?.breakdownDimensionIds?.length || 0;
  }
  
  // Single pass through filter configs
  for (const cfg of Object.values(filterConfigs)) {
    filterCount += (cfg as any)?.filterDimensionIds?.length || 0;
  }
  
  return { breakdownCount, filterCount };
}

/**
 * Normalize error message from various error types
 * Provides user-friendly error messages and handles all error formats
 * 
 * @param error - The error object (can be Error, string, or any object)
 * @returns Normalized error message string
 */
export function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message;
    
    // Provide helpful error messages for common issues
    if (msg.includes('timeout') || msg.includes('timed out')) {
      return "The data refresh took too long. This might be due to a large dataset. Please try reducing the date range or contact support.";
    }
    if (msg.includes('Pivot data computation')) {
      return `Data computation failed: ${msg.replace('Pivot data computation failed: ', '')}`;
    }
    if (msg.includes('No valid channels')) {
      return "No valid channels found. Please configure at least one channel with a report in Edit Source.";
    }
    if (msg.includes('No report found') || msg.includes('Configuration') || msg.includes('date range')) {
      return msg;
    }
    return msg;
  }
  
  if (typeof error === 'string') {
    return error;
  }
  
  if (error && typeof error === 'object') {
    const errorObj = error as any;
    return errorObj.message || errorObj.error_description || errorObj.details || JSON.stringify(error);
  }
  
  return "Failed to refresh data. Please try again.";
}
