import { supabase } from "@/integrations/supabase/client";

/**
 * Check if report has data sources
 */
export async function checkDataSources(reportId: string): Promise<{
  hasDataSources: boolean;
  hasCSVSource: boolean;
}> {
  if (!reportId) {
    return { hasDataSources: false, hasCSVSource: false };
  }
  
  try {
    console.log('[testing] Checking data sources for report:', reportId);
    
    const { data: dataSources, error } = await supabase
      .from('data_sources')
      .select('id, source_type')
      .eq('report_id', reportId);
    
    if (error) {
      console.error('Error checking data sources:', error);
      return { hasDataSources: false, hasCSVSource: false };
    }
    
    const hasData = dataSources && dataSources.length > 0;
    const hasCSV = dataSources?.some(ds => ds.source_type === 'csv_url') || false;
    
    console.log('[testing] Data sources found:', hasData ? 'Yes' : 'No');
    console.log('[testing] CSV source found:', hasCSV ? 'Yes' : 'No');
    
    return { hasDataSources: hasData, hasCSVSource: hasCSV };
  } catch (error) {
    console.error('Error checking data sources:', error);
    return { hasDataSources: false, hasCSVSource: false };
  }
}

