/**
 * Derive `reports.channel` from a human-readable report name.
 * Order matches `supabase/migrations/20260319010000_add_reports_channel.sql` (metasearch → sem → social).
 */
export function inferReportChannelFromName(name: string): 'metasearch' | 'sem' | 'social' | null {
  const n = name.trim().toLowerCase();
  if (n.includes('metasearch')) return 'metasearch';
  if (n.includes('sem')) return 'sem';
  if (n.includes('social')) return 'social';
  return null;
}
