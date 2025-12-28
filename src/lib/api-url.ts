/**
 * Utility functions for generating API URLs
 */

/**
 * Get the Supabase URL from environment or client config
 */
function getSupabaseUrl(): string {
  // Try to get from environment variable first
  if (typeof window !== 'undefined' && (window as any).ENV?.SUPABASE_URL) {
    return (window as any).ENV.SUPABASE_URL;
  }
  
  // Fallback to hardcoded URL from client config
  return "https://zcxxwpwheevwavdcgfht.supabase.co";
}

/**
 * Generate API URL for a report's API data endpoint
 * @param reportId - The report ID
 * @returns The full API URL
 */
export function getReportApiUrl(reportId: string): string {
  const supabaseUrl = getSupabaseUrl();
  return `${supabaseUrl}/functions/v1/get-report-api-data?reportId=${reportId}`;
}
