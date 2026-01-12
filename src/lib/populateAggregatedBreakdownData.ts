/**
 * Populate aggregated_breakdown_data table from dimension_data
 * This function aggregates data from dimension_data and stores it in aggregated_breakdown_data
 * for faster retrieval in the Data Browser.
 */

import { supabase } from "@/integrations/supabase/client";
import { SlideReportConfiguration } from "@/types/slideReports";

interface AggregatedBreakdownRow {
  report_id: string;
  channel: string;
  year: number;
  month: number;
  primary_dimension_id: string;
  primary_dimension_value: string;
  secondary_dimension_id: string | null;
  secondary_dimension_value: string | null;
  metrics: Record<string, number>;
  derived_metrics: Record<string, number>;
  row_count: number;
}

/**
 * Calculate derived metrics from base metrics
 */
function calculateDerivedMetrics(data: { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }) {
  const ctr = data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0;
  const conversionRate = data.clicks > 0 ? (data.bookings / data.clicks) * 100 : 0;
  const cpc = data.clicks > 0 ? data.cost / data.clicks : 0;
  const roas = data.cost > 0 ? data.revenue / data.cost : 0;
  const costOfSale = data.revenue > 0 ? (data.cost / data.revenue) * 100 : 0;
  
  return {
    ctr: Number(ctr.toFixed(2)),
    conversionRate: Number(conversionRate.toFixed(2)),
    cpc: Number(cpc.toFixed(2)),
    roas: Number(roas.toFixed(2)),
    costOfSale: Number(costOfSale.toFixed(2)),
  };
}

/**
 * Find date dimension ID from dimension mapping
 */
function findDateDimensionId(dimensionMapping: Record<string, { id: string; name: string; type: string }>): string | null {
  for (const [id, dim] of Object.entries(dimensionMapping)) {
    if (dim.type === 'date') {
      return id;
    }
  }
  
  for (const [id, dim] of Object.entries(dimensionMapping)) {
    const nameLower = dim.name.toLowerCase();
    if (nameLower.includes('date') || nameLower.includes('day') || nameLower === 'date') {
      return id;
    }
  }
  
  return null;
}

/**
 * Aggregate metrics from rows for a specific date range
 */
function aggregateMetricsForRows(
  rows: any[],
  dateRange: { start: Date; end: Date },
  dateDimensionId: string | null,
  dimensionMapping: Record<string, { id: string; name: string; type: string }>
): Record<string, number> {
  const result: Record<string, number> = {};
  
  // Identify all numeric dimensions (metrics)
  const numericDimensions: Record<string, string> = {}; // dimensionId -> dimensionName
  Object.entries(dimensionMapping).forEach(([id, dim]) => {
    if (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage') {
      numericDimensions[id] = dim.name;
      result[dim.name] = 0;
    }
  });

  const filteredRows = rows.filter((row) => {
    const rowData = row.dimension_values || row;
    
    let dateValue: any = null;
    if (dateDimensionId) {
      dateValue = rowData[dateDimensionId];
    } else {
      for (const [key, val] of Object.entries(rowData)) {
        if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) {
          dateValue = val;
          break;
        }
      }
    }
    
    if (!dateValue) return false;
    
    const dateStr = typeof dateValue === 'string' ? dateValue : String(dateValue);
    const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!dateMatch) return false;
    
    const rowDate = new Date(parseInt(dateMatch[1]), parseInt(dateMatch[2]) - 1, parseInt(dateMatch[3]));
    return rowDate >= dateRange.start && rowDate <= dateRange.end;
  });

  // Aggregate all numeric metrics
  filteredRows.forEach((row) => {
    const rowData = row.dimension_values || row;
    
    Object.entries(numericDimensions).forEach(([dimId, dimName]) => {
      const value = rowData[dimId];
      if (value !== undefined && value !== null) {
        const numValue = parseFloat(String(value));
        if (!isNaN(numValue)) {
          result[dimName] = (result[dimName] || 0) + numValue;
        }
      }
    });
  });

  return result;
}

/**
 * Populate aggregated breakdown data for a specific report, channel, year, and month
 */
async function populateAggregatedBreakdownDataForPeriod(
  reportId: string,
  channel: string,
  year: number,
  month: number,
  breakdownDimensionIds: string[],
  dimensionMapping: Record<string, { id: string; name: string; type: string }>,
  dateDimensionId: string | null
): Promise<number> {
  // Calculate date range for the month
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  // Fetch all dimension_data for this report and period
  const allRows: any[] = [];
  const batchSize = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from('dimension_data')
      .select('dimension_values')
      .eq('report_id', reportId)
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.error(`[populateAggregatedBreakdownData] Error fetching dimension_data:`, error);
      break;
    }

    if (data && data.length > 0) {
      // Filter by date range in memory
      const filtered = data.filter(row => {
        const dimValues = row.dimension_values as Record<string, any>;
        
        if (!dateDimensionId) {
          for (const [key, value] of Object.entries(dimValues)) {
            if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
              const dateValue = new Date(value);
              return dateValue >= startDate && dateValue <= endDate;
            }
          }
          return true;
        }
        
        const dateValue = dimValues[dateDimensionId];
        if (!dateValue) return false;
        
        const dateStr = typeof dateValue === 'string' ? dateValue : String(dateValue);
        const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!dateMatch) return false;
        
        const rowDate = new Date(parseInt(dateMatch[1]), parseInt(dateMatch[2]) - 1, parseInt(dateMatch[3]));
        return rowDate >= startDate && rowDate <= endDate;
      });
      
      allRows.push(...filtered);
      offset += batchSize;
      hasMore = data.length === batchSize;
    } else {
      hasMore = false;
    }
  }

  if (allRows.length === 0) {
    return 0; // No data to aggregate
  }

  const aggregatedRows: AggregatedBreakdownRow[] = [];

  // Process each breakdown dimension
  for (const primaryDimId of breakdownDimensionIds) {
    const primaryDim = dimensionMapping[primaryDimId];
    if (!primaryDim) continue;

    // Get other breakdown dimensions as potential secondary dimensions
    const otherBreakdowns = breakdownDimensionIds.filter(id => id !== primaryDimId);
    
    // Group by primary dimension value
    const groupedByPrimary: Record<string, any[]> = {};
    
    allRows.forEach(row => {
      const rowData = row.dimension_values || row;
      const primaryValue = rowData[primaryDimId];
      
      if (primaryValue !== undefined && primaryValue !== null) {
        const primaryStr = String(primaryValue).trim();
        if (primaryStr) {
          if (!groupedByPrimary[primaryStr]) {
            groupedByPrimary[primaryStr] = [];
          }
          groupedByPrimary[primaryStr].push(row);
        }
      }
    });

    // For each primary dimension value, aggregate with or without secondary dimension
    Object.entries(groupedByPrimary).forEach(([primaryValue, rows]) => {
      if (otherBreakdowns.length > 0) {
        // Group by secondary dimension
        const secondaryDimId = otherBreakdowns[0];
        const secondaryDim = dimensionMapping[secondaryDimId];
        
        if (secondaryDim) {
          const groupedBySecondary: Record<string, any[]> = {};
          
          rows.forEach(row => {
            const rowData = row.dimension_values || row;
            const secondaryValue = rowData[secondaryDimId];
            const secondaryStr = secondaryValue !== undefined && secondaryValue !== null 
              ? String(secondaryValue).trim() 
              : 'Uncategorized';
            
            if (!groupedBySecondary[secondaryStr]) {
              groupedBySecondary[secondaryStr] = [];
            }
            groupedBySecondary[secondaryStr].push(row);
          });

          // Create aggregated row for each secondary dimension value
          Object.entries(groupedBySecondary).forEach(([secondaryValue, secondaryRows]) => {
            const metrics = aggregateMetricsForRows(secondaryRows, { start: startDate, end: endDate }, dateDimensionId, dimensionMapping);
            
            // Calculate derived metrics from common KPIs
            const impressions = metrics['Impressions'] || metrics['impressions'] || 0;
            const clicks = metrics['Clicks'] || metrics['clicks'] || 0;
            const cost = metrics['Cost'] || metrics['cost'] || metrics['Spend'] || metrics['spend'] || 0;
            const revenue = metrics['Revenue'] || metrics['revenue'] || 0;
            const bookings = metrics['Bookings'] || metrics['bookings'] || metrics['Conversions'] || metrics['conversions'] || 0;
            
            const derivedMetrics = calculateDerivedMetrics({
              impressions,
              clicks,
              cost,
              revenue,
              bookings,
            });

            aggregatedRows.push({
              report_id: reportId,
              channel,
              year,
              month,
              primary_dimension_id: primaryDimId,
              primary_dimension_value: primaryValue,
              secondary_dimension_id: secondaryDimId,
              secondary_dimension_value: secondaryValue === 'Uncategorized' ? null : secondaryValue,
              metrics,
              derived_metrics: derivedMetrics,
              row_count: secondaryRows.length,
            });
          });
        }
      } else {
        // No secondary dimension, aggregate all rows for this primary value
        const metrics = aggregateMetricsForRows(rows, { start: startDate, end: endDate }, dateDimensionId, dimensionMapping);
        
        // Calculate derived metrics
        const impressions = metrics['Impressions'] || metrics['impressions'] || 0;
        const clicks = metrics['Clicks'] || metrics['clicks'] || 0;
        const cost = metrics['Cost'] || metrics['cost'] || metrics['Spend'] || metrics['spend'] || 0;
        const revenue = metrics['Revenue'] || metrics['revenue'] || 0;
        const bookings = metrics['Bookings'] || metrics['bookings'] || metrics['Conversions'] || metrics['conversions'] || 0;
        
        const derivedMetrics = calculateDerivedMetrics({
          impressions,
          clicks,
          cost,
          revenue,
          bookings,
        });

        aggregatedRows.push({
          report_id: reportId,
          channel,
          year,
          month,
          primary_dimension_id: primaryDimId,
          primary_dimension_value: primaryValue,
          secondary_dimension_id: null,
          secondary_dimension_value: null,
          metrics,
          derived_metrics: derivedMetrics,
          row_count: rows.length,
        });
      }
    });
  }

  // Insert aggregated rows into database (upsert to handle duplicates)
  // Delete existing rows first, then insert new ones (simpler than complex upsert with COALESCE)
  if (aggregatedRows.length > 0) {
    // Delete existing aggregated data for this period
    const { error: deleteError } = await supabase
      .from('aggregated_breakdown_data')
      .delete()
      .eq('report_id', reportId)
      .eq('channel', channel)
      .eq('year', year)
      .eq('month', month)
      .in('primary_dimension_id', breakdownDimensionIds);

    if (deleteError) {
      console.error(`[populateAggregatedBreakdownData] Error deleting existing aggregated data:`, deleteError);
      // Continue anyway - try to insert
    }

    // Insert new aggregated rows
    const { error } = await supabase
      .from('aggregated_breakdown_data')
      .insert(aggregatedRows);

    if (error) {
      console.error(`[populateAggregatedBreakdownData] Error inserting aggregated data:`, error);
      return 0;
    }

    return aggregatedRows.length;
  }

  return 0;
}

/**
 * Populate aggregated breakdown data for all years (2024-2026), months, channels, and breakdown dimensions
 */
export async function populateAggregatedBreakdownData(
  reportIds: Record<string, string>, // channel -> report_id
  configuration: SlideReportConfiguration,
  onProgress?: (progress: number, message: string) => void
): Promise<void> {
  const currentYear = new Date().getFullYear();
  const years = [2024, 2025, 2026].filter(y => y <= currentYear);
  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  
  let totalProcessed = 0;
  let totalToProcess = 0;

  // Calculate total work
  for (const channel of configuration.selectedChannels || []) {
    const breakdownConfig = configuration.breakdownConfigs?.[channel];
    if (breakdownConfig?.breakdownDimensionIds) {
      totalToProcess += years.length * months.length * breakdownConfig.breakdownDimensionIds.length;
    }
  }

  onProgress?.(0, `Starting aggregation for ${totalToProcess} combinations...`);

  for (const channel of configuration.selectedChannels || []) {
    const reportId = reportIds[channel];
    if (!reportId) continue;

    const breakdownConfig = configuration.breakdownConfigs?.[channel];
    if (!breakdownConfig?.breakdownDimensionIds || breakdownConfig.breakdownDimensionIds.length === 0) {
      continue;
    }

    // Build dimension mapping
    const { data: dimensions, error: dimError } = await supabase
      .from('dimensions')
      .select('id, name, type')
      .or(`report_id.eq.${reportId},report_id.is.null`)
      .order('name', { ascending: true });

    if (dimError || !dimensions) {
      console.error(`[populateAggregatedBreakdownData] Error fetching dimensions for ${channel}:`, dimError);
      continue;
    }

    const dimensionMapping: Record<string, { id: string; name: string; type: string }> = {};
    dimensions.forEach(dim => {
      dimensionMapping[dim.id] = { id: dim.id, name: dim.name, type: dim.type };
    });

    const dateDimensionId = findDateDimensionId(dimensionMapping);

    // Process each year and month
    for (const year of years) {
      for (const month of months) {
        const rowsInserted = await populateAggregatedBreakdownDataForPeriod(
          reportId,
          channel,
          year,
          month,
          breakdownConfig.breakdownDimensionIds,
          dimensionMapping,
          dateDimensionId
        );

        totalProcessed += breakdownConfig.breakdownDimensionIds.length;
        const progress = totalProcessed / totalToProcess;
        onProgress?.(
          progress,
          `Processed ${channel} ${year}-${month.toString().padStart(2, '0')}: ${rowsInserted} rows`
        );
      }
    }
  }

  onProgress?.(1, 'Aggregation complete!');
}
