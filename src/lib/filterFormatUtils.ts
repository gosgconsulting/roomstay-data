/**
 * Filter Format Utilities
 * 
 * Handles detection and conversion between report-based and channel-based filter formats.
 * 
 * - Report-based: { "reportId1": { "dimensionId": ["value1"] }, "reportId2": {...} }
 * - Channel-based: { "metasearch": { "dimensionId": ["value1"] }, "sem": {...}, "social": {...} }
 */

export type DimensionFilters = Record<string, Record<string, string[]>>;

const CHANNEL_KEYS = ['metasearch', 'sem', 'social', 'price-check', 'booking'] as const;

/**
 * Detects if filters are in channel-based format (vs report-based format)
 */
export function isChannelBasedFormat(filters: DimensionFilters | null | undefined): boolean {
  if (!filters || typeof filters !== 'object') return false;
  
  const keys = Object.keys(filters);
  return keys.some(key => CHANNEL_KEYS.includes(key as any));
}

/**
 * Converts report-based filters to channel-based format
 * Requires a report ID to channel mapping
 */
export function convertReportToChannelFormat(
  reportBasedFilters: DimensionFilters,
  reportIdToChannel: Record<string, string>
): DimensionFilters {
  const channelFilters: DimensionFilters = {};
  
  for (const [reportId, dimFilters] of Object.entries(reportBasedFilters)) {
    const channel = reportIdToChannel[reportId];
    if (channel && dimFilters) {
      channelFilters[channel] = dimFilters;
    }
  }
  
  return channelFilters;
}

/**
 * Converts channel-based filters to report-based format
 * Requires a channel to report ID mapping
 */
export function convertChannelToReportFormat(
  channelBasedFilters: DimensionFilters,
  channelToReportId: Record<string, string>
): DimensionFilters {
  const reportFilters: DimensionFilters = {};
  
  for (const [channel, dimFilters] of Object.entries(channelBasedFilters)) {
    const reportId = channelToReportId[channel];
    if (reportId && dimFilters) {
      reportFilters[reportId] = dimFilters;
    }
  }
  
  return reportFilters;
}
