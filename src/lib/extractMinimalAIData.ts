/**
 * Extract minimal data for AI summary generation
 * Only includes selected view/tab and selected month to minimize token usage
 */

import { MONTH_NAMES } from '@/constants/slideViewConstants';
import { calculateDerivedMetrics, filterRawDataRows, buildMetricNameToIdsMap } from './slideViewHelpers';
import type { SlideReportPivotData } from '@/types/slideReports';
import type { ChannelMetrics } from '@/types/slideReports';
import type { RawDataRow } from '@/types/slideView';

export interface MinimalAIData {
  view: 'overview' | 'metasearch' | 'sem' | 'social';
  period: {
    year: number;
    month: string;
    monthKey: string; // "2026-01"
  };
  metrics: {
    [channel: string]: {
      impressions: number;
      clicks: number;
      cost: number;
      revenue: number;
      bookings: number;
      ctr: number;
      conversionRate: number;
      cpc: number;
      roas: number;
      costOfSale: number;
    };
  };
  comparison?: {
    previous_period?: ChannelMetrics;
    previous_year?: ChannelMetrics;
  };
}

/**
 * Extract minimal data for AI analysis based on selected tab and month
 * @param pivotData - Full pivot data from slide report
 * @param selectedTab - Currently selected tab (overview, metasearch, sem, social)
 * @param selectedYear - Selected year (string, e.g., "2026" or "all")
 * @param selectedMonth - Selected month (string, e.g., "January" or "all")
 * @param filterValues - Optional filter values to apply (from view or current filters)
 * @returns Minimal data structure for AI analysis, or null if no data available
 */
export function extractMinimalAIData(
  pivotData: SlideReportPivotData | null,
  selectedTab: 'overview' | 'metasearch' | 'sem' | 'social',
  selectedYear: string,
  selectedMonth: string,
  filterValues?: Record<string, Record<string, string[]>>
): MinimalAIData | null {
  if (!pivotData?.channels) {
    return null;
  }

  // If year or month is "all", we can't extract minimal data - need specific month
  if (selectedYear === 'all' || selectedMonth === 'all') {
    return null;
  }

  const year = parseInt(selectedYear);
  const monthIndex = MONTH_NAMES.indexOf(selectedMonth);
  
  if (isNaN(year) || monthIndex === -1) {
    return null;
  }

  const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`; // "2026-01"

  // Build date range for filtering
  const dateRange = {
    start: new Date(year, monthIndex, 1),
    end: new Date(year, monthIndex + 1, 0, 23, 59, 59),
  };

  const metrics: MinimalAIData['metrics'] = {};
  const comparison: MinimalAIData['comparison'] = {};

  // Check if we have filters to apply
  const hasFilters = filterValues && Object.keys(filterValues).length > 0;
  const hasAnyChannelFilters = hasFilters && Object.values(filterValues).some(
    channelFilters => channelFilters && Object.keys(channelFilters).length > 0
  );

  if (selectedTab === 'overview') {
    // For overview, aggregate all channels for the selected month
    const channels = ['metasearch', 'sem', 'social'] as const;
    let totalMetrics = {
      impressions: 0,
      clicks: 0,
      cost: 0,
      revenue: 0,
      bookings: 0,
    };

    // Aggregate metrics from all channels
    channels.forEach((channel) => {
      const channelData = pivotData.channels[channel];
      const channelFilterValues = filterValues?.[channel] || {};
      
      // If we have filters for this channel, filter raw rows and aggregate
      if (hasAnyChannelFilters && channelFilterValues && Object.keys(channelFilterValues).length > 0) {
        const rawDataRows = (channelData as any).rawDataRows || [];
        if (rawDataRows.length > 0) {
          const filteredRows = filterRawDataRows(rawDataRows, channelFilterValues, dateRange);
          
          if (filteredRows.length > 0) {
            // Build metric mapping
            const dimensionMap = (channelData as any).dimensionMap || {};
            const metricNameToIdMap: Record<string, string> = {};
            Object.entries(dimensionMap as Record<string, string>).forEach(([dimensionId, dimensionName]) => {
              if (dimensionName && typeof dimensionName === 'string') {
                metricNameToIdMap[dimensionName] = dimensionId;
              }
            });

            // Aggregate from filtered rows
            let channelMetrics = {
              impressions: 0,
              clicks: 0,
              cost: 0,
              revenue: 0,
              bookings: 0,
            };

            filteredRows.forEach((row) => {
              const rowData = row.dimension_values || row;
              const impressionsValue = parseFloat(String(rowData[metricNameToIdMap['Impressions']] || rowData['Impressions'] || 0)) || 0;
              const clicksValue = parseFloat(String(rowData[metricNameToIdMap['Clicks']] || rowData['Clicks'] || 0)) || 0;
              const costValue = parseFloat(String(rowData[metricNameToIdMap['Cost']] || rowData['Cost'] || 0)) || 0;
              const revenueValue = parseFloat(String(rowData[metricNameToIdMap['Revenue']] || rowData['Revenue'] || 0)) || 0;
              const bookingsValue = parseFloat(String(rowData[metricNameToIdMap['Bookings']] || rowData['Bookings'] || 0)) || 0;
              
              channelMetrics.impressions += impressionsValue;
              channelMetrics.clicks += clicksValue;
              channelMetrics.cost += costValue;
              channelMetrics.revenue += revenueValue;
              channelMetrics.bookings += bookingsValue;
            });

            const derived = calculateDerivedMetrics(channelMetrics);
            metrics[channel] = {
              impressions: channelMetrics.impressions,
              clicks: channelMetrics.clicks,
              cost: channelMetrics.cost,
              revenue: channelMetrics.revenue,
              bookings: channelMetrics.bookings,
              ctr: derived.ctr,
              conversionRate: derived.conversionRate,
              cpc: derived.cpc,
              roas: derived.roas,
              costOfSale: derived.costOfSale,
            };

            totalMetrics.impressions += channelMetrics.impressions;
            totalMetrics.clicks += channelMetrics.clicks;
            totalMetrics.cost += channelMetrics.cost;
            totalMetrics.revenue += channelMetrics.revenue;
            totalMetrics.bookings += channelMetrics.bookings;
          }
        }
      } else if (channelData?.monthly?.[monthKey]) {
        // No filters - use pre-computed monthly data
        const monthlyMetrics = channelData.monthly[monthKey];
        totalMetrics.impressions += monthlyMetrics.impressions || 0;
        totalMetrics.clicks += monthlyMetrics.clicks || 0;
        totalMetrics.cost += monthlyMetrics.cost || 0;
        totalMetrics.revenue += monthlyMetrics.revenue || 0;
        totalMetrics.bookings += monthlyMetrics.bookings || 0;

        // Also store individual channel metrics
        const derived = calculateDerivedMetrics(monthlyMetrics);
        metrics[channel] = {
          impressions: monthlyMetrics.impressions || 0,
          clicks: monthlyMetrics.clicks || 0,
          cost: monthlyMetrics.cost || 0,
          revenue: monthlyMetrics.revenue || 0,
          bookings: monthlyMetrics.bookings || 0,
          ctr: derived.ctr,
          conversionRate: derived.conversionRate,
          cpc: derived.cpc,
          roas: derived.roas,
          costOfSale: derived.costOfSale,
        };
      }
    });

    // Calculate derived metrics for overview totals
    const derived = calculateDerivedMetrics(totalMetrics);
    metrics.overview = {
      impressions: totalMetrics.impressions,
      clicks: totalMetrics.clicks,
      cost: totalMetrics.cost,
      revenue: totalMetrics.revenue,
      bookings: totalMetrics.bookings,
      ctr: derived.ctr,
      conversionRate: derived.conversionRate,
      cpc: derived.cpc,
      roas: derived.roas,
      costOfSale: derived.costOfSale,
    };

    // Get comparison data from overview if available
    if (pivotData.overview) {
      if (pivotData.overview.previous_period) {
        comparison.previous_period = pivotData.overview.previous_period;
      }
      if (pivotData.overview.previous_year) {
        comparison.previous_year = pivotData.overview.previous_year;
      }
    }
  } else {
    // For individual channel tabs, extract only that channel's data
    const channelData = pivotData.channels[selectedTab];
    const channelFilterValues = filterValues?.[selectedTab] || {};
    
    // If we have filters, filter raw rows and aggregate
    if (hasAnyChannelFilters && channelFilterValues && Object.keys(channelFilterValues).length > 0) {
      const rawDataRows = (channelData as any).rawDataRows || [];
      if (rawDataRows.length > 0) {
        const filteredRows = filterRawDataRows(rawDataRows, channelFilterValues, dateRange);
        
        if (filteredRows.length > 0) {
          // Build metric mapping
          const dimensionMap = (channelData as any).dimensionMap || {};
          const metricNameToIdMap: Record<string, string> = {};
          Object.entries(dimensionMap as Record<string, string>).forEach(([dimensionId, dimensionName]) => {
            if (dimensionName && typeof dimensionName === 'string') {
              metricNameToIdMap[dimensionName] = dimensionId;
            }
          });

          // Aggregate from filtered rows
          let channelMetrics = {
            impressions: 0,
            clicks: 0,
            cost: 0,
            revenue: 0,
            bookings: 0,
          };

          filteredRows.forEach((row) => {
            const rowData = row.dimension_values || row;
            const impressionsValue = parseFloat(String(rowData[metricNameToIdMap['Impressions']] || rowData['Impressions'] || 0)) || 0;
            const clicksValue = parseFloat(String(rowData[metricNameToIdMap['Clicks']] || rowData['Clicks'] || 0)) || 0;
            const costValue = parseFloat(String(rowData[metricNameToIdMap['Cost']] || rowData['Cost'] || 0)) || 0;
            const revenueValue = parseFloat(String(rowData[metricNameToIdMap['Revenue']] || rowData['Revenue'] || 0)) || 0;
            const bookingsValue = parseFloat(String(rowData[metricNameToIdMap['Bookings']] || rowData['Bookings'] || 0)) || 0;
            
            channelMetrics.impressions += impressionsValue;
            channelMetrics.clicks += clicksValue;
            channelMetrics.cost += costValue;
            channelMetrics.revenue += revenueValue;
            channelMetrics.bookings += bookingsValue;
          });

          const derived = calculateDerivedMetrics(channelMetrics);
          metrics[selectedTab] = {
            impressions: channelMetrics.impressions,
            clicks: channelMetrics.clicks,
            cost: channelMetrics.cost,
            revenue: channelMetrics.revenue,
            bookings: channelMetrics.bookings,
            ctr: derived.ctr,
            conversionRate: derived.conversionRate,
            cpc: derived.cpc,
            roas: derived.roas,
            costOfSale: derived.costOfSale,
          };
        } else {
          return null; // No data after filtering
        }
      } else {
        return null; // No raw data rows available
      }
    } else if (channelData?.monthly?.[monthKey]) {
      // No filters - use pre-computed monthly data
      const monthlyMetrics = channelData.monthly[monthKey];
      const derived = calculateDerivedMetrics(monthlyMetrics);

      metrics[selectedTab] = {
        impressions: monthlyMetrics.impressions || 0,
        clicks: monthlyMetrics.clicks || 0,
        cost: monthlyMetrics.cost || 0,
        revenue: monthlyMetrics.revenue || 0,
        bookings: monthlyMetrics.bookings || 0,
        ctr: derived.ctr,
        conversionRate: derived.conversionRate,
        cpc: derived.cpc,
        roas: derived.roas,
        costOfSale: derived.costOfSale,
      };
    } else {
      return null; // No data for this month
    }

    // Get comparison data for this channel if available
    if (channelData.previous_period) {
      comparison.previous_period = channelData.previous_period;
    }
    if (channelData.previous_year) {
      comparison.previous_year = channelData.previous_year;
    }
  }

  // Check if we have any metrics
  if (Object.keys(metrics).length === 0) {
    return null;
  }

  return {
    view: selectedTab,
    period: {
      year,
      month: selectedMonth,
      monthKey,
    },
    metrics,
    comparison: Object.keys(comparison).length > 0 ? comparison : undefined,
  };
}
