/**
 * Utility functions for generating API URLs
 */

/**
 * Get the base API URL (works with localhost and domain)
 */
function getBaseApiUrl(): string {
  // In browser, use current origin (works with localhost and any domain)
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  
  // Server-side fallback
  return process.env.VITE_API_BASE_URL || 'http://localhost:3000';
}

/**
 * Generate API URL for a report's API data endpoint
 * Uses the application's own domain (not Supabase URL)
 * @param reportId - The report ID
 * @returns The full API URL
 * 
 * Example:
 * - Localhost: http://localhost:3000/api/reports/{reportId}
 * - Production: https://yourdomain.com/api/reports/{reportId}
 */
export function getReportApiUrl(reportId: string): string {
  const baseUrl = getBaseApiUrl();
  return `${baseUrl}/api/reports/${reportId}`;
}
