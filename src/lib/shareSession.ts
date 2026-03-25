/**
 * Utilities for reading share-link data from sessionStorage.
 *
 * All keys follow the contract set in SharedReport.tsx:
 *   share_auth_${slug}                 — "true" when the share is authenticated
 *   share_data_${slug}                 — full share_links row JSON
 *   share_account_id_${slug}           — account UUID
 *   share_slide_report_id_${slug}      — slide report UUID
 *   share_locked_dimension_ids_${slug} — JSON array of locked dimension UUIDs
 *   share_filters_${slug}              — channel-based filter values JSON
 */

/**
 * Read and parse channel filter values stored for a share link.
 * Returns null if the key is absent or the stored value is not valid JSON.
 */
export function readShareFiltersFromSession(
  slug: string
): Record<string, Record<string, string[]>> | null {
  try {
    const raw = sessionStorage.getItem(`share_filters_${slug}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, Record<string, string[]>>;
  } catch {
    return null;
  }
}
