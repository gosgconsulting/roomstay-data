/**
 * Utility functions for converting report names to URL-safe slugs and vice versa
 */

/**
 * Convert a report name to a URL-safe slug
 * - Lowercase
 * - Replace spaces with hyphens
 * - Remove special characters
 * - Trim hyphens from start/end
 * 
 * @param name - The report name
 * @returns URL-safe slug
 * 
 * Examples:
 * - "Brady" -> "brady"
 * - "My Report" -> "my-report"
 * - "Report #1" -> "report-1"
 */
export function reportNameToSlug(name: string): string {
  if (!name) return '';
  
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with hyphens
    .replace(/[^\w\-]/g, '')        // Remove special characters except hyphens
    .replace(/-+/g, '-')            // Replace multiple hyphens with single hyphen
    .replace(/^-+|-+$/g, '');       // Trim hyphens from start/end
}

/**
 * Find a report by its slug (case-insensitive name matching)
 * This function handles the reverse lookup: slug -> report name -> report
 * 
 * Note: If multiple reports have the same name, this returns the first match.
 * Users should ensure report names are unique for predictable URL routing.
 * 
 * @param slug - The URL slug
 * @param reports - Array of reports to search
 * @returns The matching report or null
 */
export function findReportBySlug(slug: string, reports: Array<{ id: string; name: string }>): { id: string; name: string; account_id?: string | null } | null {
  if (!slug || !reports || reports.length === 0) return null;
  
  // Decode the slug (handle URL encoding)
  const decodedSlug = decodeURIComponent(slug).toLowerCase();
  
  // Try exact match first (case-insensitive)
  let report = reports.find(r => 
    reportNameToSlug(r.name).toLowerCase() === decodedSlug
  );
  
  // If no exact match, try partial match (in case of URL encoding issues)
  if (!report) {
    report = reports.find(r => 
      r.name.toLowerCase().replace(/\s+/g, '-') === decodedSlug
    );
  }
  
  return report || null;
}

/**
 * Get the report URL path using the report name
 * @param reportName - The report name
 * @returns URL path like "/tools/report/brady"
 */
export function getReportUrl(reportName: string): string {
  const slug = reportNameToSlug(reportName);
  return `/tools/report/${slug}`;
}

/**
 * Get the report URL path with a specific summary ID
 * @param reportName - The report name
 * @param summaryId - The AI summary card ID (optional)
 * @returns URL path like "/tools/report/brady" or "/tools/report/brady?summary=summaryId"
 */
export function getReportUrlWithSummary(reportName: string, summaryId?: string): string {
  const baseUrl = getReportUrl(reportName);
  if (summaryId) {
    return `${baseUrl}?summary=${summaryId}`;
  }
  return baseUrl;
}
