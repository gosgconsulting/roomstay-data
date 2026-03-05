/**
 * Account-specific report ID lookup functions
 * Ported from src/lib/accountReportIds.ts
 */

// import removed: using `any` for supabase param
import type { AccountReportIds } from './types.ts';

// Type for report record from database
interface ReportRecord {
  id: string;
  name: string;
}

/**
 * Channel name to possible report name variations
 */
const CHANNEL_NAME_VARIANTS: Record<string, string[]> = {
  metasearch: ['Metasearch', 'metasearch', 'Meta Search', 'meta search', 'MetaSearch', 'META SEARCH'],
  sem: ['SEM', 'sem', 'Search Engine Marketing', 'search engine marketing', 'Search Engine', 'search engine'],
  social: ['Social', 'social', 'Social Media', 'social media', 'SocialMedia', 'SOCIAL'],
};

/**
 * Find a report by channel name for a specific account
 */
export async function findReportByChannelName(
  supabase: any,
  accountId: string,
  channelName: 'metasearch' | 'sem' | 'social'
): Promise<string | null> {
  if (!accountId) {
    console.warn('[accountReports] No accountId provided');
    return null;
  }

  const variants = CHANNEL_NAME_VARIANTS[channelName] || [channelName];
  console.log(`[testing] findReportByChannelName: channel=${channelName}, accountId=${accountId}, variants=${JSON.stringify(variants)}`);

  try {
    // Query reports table for this account
    const { data: reportsData, error } = await supabase
      .from('reports')
      .select('id, name')
      .eq('account_id', accountId);

    if (error) {
      console.error(`[accountReports] Error fetching reports for account ${accountId}:`, error);
      return null;
    }

    const reports = (reportsData || []) as ReportRecord[];

    if (reports.length === 0) {
      console.warn(`[accountReports] No reports found for account ${accountId}`);
      console.log(`[testing] findReportByChannelName: no reports for account ${accountId}, channel=${channelName} -> null`);
      return null;
    }

    const reportNames = reports.map((r) => r.name);
    console.log(`[testing] findReportByChannelName: account ${accountId} has ${reports.length} report(s), names=${JSON.stringify(reportNames)}`);

    // Try to find a report that matches any of the channel name variants (case-insensitive)
    const matchingReport = reports.find(report => {
      const reportName = report.name.toLowerCase().trim();
      return variants.some(variant => reportName === variant.toLowerCase().trim());
    });

    if (matchingReport) {
      console.log(`[accountReports] ✓ Found ${channelName} report (exact match) for account ${accountId}: ${matchingReport.id} (${matchingReport.name})`);
      return matchingReport.id;
    }

    // If no exact match, try partial matching (contains the channel name)
    const partialMatch = reports.find(report => {
      const reportName = report.name.toLowerCase();
      return variants.some(variant => reportName.includes(variant.toLowerCase()));
    });

    if (partialMatch) {
      console.log(`[accountReports] ✓ Found ${channelName} report (partial match) for account ${accountId}: ${partialMatch.id} (${partialMatch.name})`);
      return partialMatch.id;
    }

    // Last resort: try matching just the channel name itself
    const channelOnlyMatch = reports.find(report => {
      const reportName = report.name.toLowerCase();
      return reportName.includes(channelName.toLowerCase());
    });

    if (channelOnlyMatch) {
      console.log(`[accountReports] ✓ Found ${channelName} report (channel name match) for account ${accountId}: ${channelOnlyMatch.id} (${channelOnlyMatch.name})`);
      return channelOnlyMatch.id;
    }

    console.warn(`[accountReports] ✗ No ${channelName} report found for account ${accountId}`);
    console.log(`[testing] findReportByChannelName: no match for channel=${channelName}; tried variants and report names: ${JSON.stringify(reportNames)}`);
    return null;
  } catch (error) {
    console.error(`[accountReports] Error finding report for channel ${channelName}:`, error);
    return null;
  }
}

/**
 * Get all account-specific report IDs for an account
 */
export async function getAccountReportIds(
  supabase: any,
  accountId: string
): Promise<AccountReportIds> {
  if (!accountId) {
    console.warn('[accountReports] No accountId provided');
    return { metasearch: null, sem: null, social: null };
  }

  // Fetch all report IDs in parallel
  const [metasearchId, semId, socialId] = await Promise.all([
    findReportByChannelName(supabase, accountId, 'metasearch'),
    findReportByChannelName(supabase, accountId, 'sem'),
    findReportByChannelName(supabase, accountId, 'social'),
  ]);

  const result = {
    metasearch: metasearchId,
    sem: semId,
    social: socialId,
  };
  console.log(`[testing] getAccountReportIds: accountId=${accountId}, result=${JSON.stringify({ metasearch: result.metasearch ?? null, sem: result.sem ?? null, social: result.social ?? null })}`);
  return result;
}
