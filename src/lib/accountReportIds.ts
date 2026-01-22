/**
 * Account-specific report ID lookup functions
 * 
 * This module provides functions to find account-specific report IDs for each channel
 * (metasearch, sem, social) instead of using hardcoded global report IDs.
 */

import { supabase } from "@/integrations/supabase/client";

export interface AccountReportIds {
  metasearch: string | null;
  sem: string | null;
  social: string | null;
}

// Cache for account report IDs to avoid repeated queries
const reportIdsCache = new Map<string, AccountReportIds>();

/**
 * Channel name to possible report name variations
 * Used for flexible matching when looking up reports
 */
const CHANNEL_NAME_VARIANTS: Record<string, string[]> = {
  metasearch: ['Metasearch', 'metasearch', 'Meta Search', 'meta search', 'MetaSearch', 'META SEARCH'],
  sem: ['SEM', 'sem', 'Search Engine Marketing', 'search engine marketing', 'Search Engine', 'search engine'],
  social: ['Social', 'social', 'Social Media', 'social media', 'SocialMedia', 'SOCIAL'],
};

/**
 * Find a report by channel name for a specific account
 * 
 * @param accountId - The account ID
 * @param channelName - The channel name ('metasearch', 'sem', or 'social')
 * @returns The report ID or null if not found
 */
export async function findReportByChannelName(
  accountId: string,
  channelName: 'metasearch' | 'sem' | 'social'
): Promise<string | null> {
  if (!accountId) {
    console.warn('[accountReportIds] No accountId provided');
    return null;
  }

  const variants = CHANNEL_NAME_VARIANTS[channelName] || [channelName];
  
  try {
    // Query reports table for this account
    const { data: reports, error } = await supabase
      .from('reports')
      .select('id, name')
      .eq('account_id', accountId);

    if (error) {
      console.error(`[accountReportIds] Error fetching reports for account ${accountId}:`, error);
      return null;
    }

    if (!reports || reports.length === 0) {
      console.warn(`[accountReportIds] No reports found for account ${accountId}`);
      return null;
    }

    // Log all available reports for debugging
    console.log(`[accountReportIds] Searching for ${channelName} report in account ${accountId}. Available reports:`, reports.map(r => ({ id: r.id, name: r.name })));

    // Try to find a report that matches any of the channel name variants (case-insensitive)
    const matchingReport = reports.find(report => {
      const reportName = report.name.toLowerCase().trim();
      return variants.some(variant => reportName === variant.toLowerCase().trim());
    });

    if (matchingReport) {
      console.log(`[accountReportIds] ✓ Found ${channelName} report (exact match) for account ${accountId}: ${matchingReport.id} (${matchingReport.name})`);
      return matchingReport.id;
    }

    // If no exact match, try partial matching (contains the channel name)
    const partialMatch = reports.find(report => {
      const reportName = report.name.toLowerCase();
      return variants.some(variant => reportName.includes(variant.toLowerCase()));
    });

    if (partialMatch) {
      console.log(`[accountReportIds] ✓ Found ${channelName} report (partial match) for account ${accountId}: ${partialMatch.id} (${partialMatch.name})`);
      return partialMatch.id;
    }

    // Last resort: try matching just the channel name itself (e.g., "metasearch" in "GO SG Metasearch")
    const channelOnlyMatch = reports.find(report => {
      const reportName = report.name.toLowerCase();
      return reportName.includes(channelName.toLowerCase());
    });

    if (channelOnlyMatch) {
      console.log(`[accountReportIds] ✓ Found ${channelName} report (channel name match) for account ${accountId}: ${channelOnlyMatch.id} (${channelOnlyMatch.name})`);
      return channelOnlyMatch.id;
    }

    console.warn(`[accountReportIds] ✗ No ${channelName} report found for account ${accountId}. Available reports:`, reports.map(r => r.name));
    console.warn(`[accountReportIds] Tried matching against variants:`, variants);
    return null;
  } catch (error) {
    console.error(`[accountReportIds] Error finding report for channel ${channelName}:`, error);
    return null;
  }
}

/**
 * Get all account-specific report IDs for an account
 * 
 * @param accountId - The account ID
 * @param useCache - Whether to use cached results (default: true)
 * @returns Object mapping channel names to report IDs
 */
export async function getAccountReportIds(
  accountId: string,
  useCache: boolean = true
): Promise<AccountReportIds> {
  if (!accountId) {
    console.warn('[accountReportIds] No accountId provided');
    return { metasearch: null, sem: null, social: null };
  }

  // Check cache first
  if (useCache && reportIdsCache.has(accountId)) {
    return reportIdsCache.get(accountId)!;
  }

  // Fetch all report IDs in parallel
  const [metasearchId, semId, socialId] = await Promise.all([
    findReportByChannelName(accountId, 'metasearch'),
    findReportByChannelName(accountId, 'sem'),
    findReportByChannelName(accountId, 'social'),
  ]);

  const result: AccountReportIds = {
    metasearch: metasearchId,
    sem: semId,
    social: socialId,
  };

  // Cache the result
  if (useCache) {
    reportIdsCache.set(accountId, result);
  }

  return result;
}

/**
 * Clear the cache for a specific account or all accounts
 * 
 * @param accountId - Optional account ID to clear cache for. If not provided, clears all cache.
 */
export function clearAccountReportIdsCache(accountId?: string): void {
  if (accountId) {
    reportIdsCache.delete(accountId);
  } else {
    reportIdsCache.clear();
  }
}

/**
 * Get report ID for a specific channel
 * Convenience function that wraps getAccountReportIds
 * 
 * @param accountId - The account ID
 * @param channel - The channel name
 * @returns The report ID or null
 */
export async function getAccountReportIdForChannel(
  accountId: string,
  channel: 'metasearch' | 'sem' | 'social'
): Promise<string | null> {
  const reportIds = await getAccountReportIds(accountId);
  return reportIds[channel];
}
