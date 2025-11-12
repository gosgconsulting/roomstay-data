import { supabase } from '@/integrations/supabase/client';
import { resyncColumnMappings, resyncReportDataSources } from './resync-dimensions';
import { syncDataSource } from './sync-utils';

/**
 * Comprehensive Metasearch resync fix utility
 * Handles the specific issues with Metasearch data source syncing
 */

export interface MetasearchFixResult {
  success: boolean;
  message: string;
  details?: any;
  rowsProcessed?: number;
  error?: string;
}

/**
 * Fix Metasearch data source specifically
 */
export async function fixMetasearchDataSource(): Promise<MetasearchFixResult> {
  try {
    console.log('[METASEARCH-FIX] Starting Metasearch resync fix...');

    // Step 1: Find Metasearch data source
    const { data: metasearchDS, error: dsError } = await supabase
      .from('data_sources')
      .select(`
        id,
        name,
        report_id,
        spreadsheet_id,
        tab_name,
        header_row,
        column_mappings,
        last_synced_at,
        google_sheets_url
      `)
      .ilike('name', '%metasearch%')
      .single();

    if (dsError || !metasearchDS) {
      return {
        success: false,
        message: 'Metasearch data source not found',
        error: dsError?.message || 'Data source not found'
      };
    }

    console.log('[METASEARCH-FIX] Found Metasearch data source:', metasearchDS.name);

    // Step 2: Get account ID from report
    const { data: report, error: reportError } = await supabase
      .from('reports')
      .select('account_id, name')
      .eq('id', metasearchDS.report_id)
      .single();

    if (reportError || !report) {
      return {
        success: false,
        message: 'Failed to get report information',
        error: reportError?.message || 'Report not found'
      };
    }

    console.log('[METASEARCH-FIX] Report:', report.name, 'Account ID:', report.account_id);

    // Step 3: Fix column mappings first
    console.log('[METASEARCH-FIX] Fixing column mappings...');
    await resyncColumnMappings(metasearchDS.id, report.account_id);

    // Step 4: Perform full resync with optimized settings for large datasets
    console.log('[METASEARCH-FIX] Starting full data resync...');
    
    const syncDataSourceObj = {
      id: metasearchDS.id,
      name: metasearchDS.name,
      google_sheets_url: metasearchDS.google_sheets_url,
      spreadsheet_id: metasearchDS.spreadsheet_id,
      tab_name: metasearchDS.tab_name,
      header_row: metasearchDS.header_row,
      column_mappings: metasearchDS.column_mappings as any,
      report_id: metasearchDS.report_id,
    };

    const syncOptions = {
      deleteExistingData: true,
      recreateDimensions: true,
      showProgress: true,
      onProgress: (message: string) => {
        console.log(`[METASEARCH-FIX] ${message}`);
      }
    };

    const syncResult = await syncDataSource(syncDataSourceObj, syncOptions);

    if (syncResult.success) {
      // Step 5: Update last_synced_at timestamp
      await supabase
        .from('data_sources')
        .update({ last_synced_at: new Date().toISOString() })
        .eq('id', metasearchDS.id);

      return {
        success: true,
        message: `Metasearch resync completed successfully`,
        details: {
          dataSourceName: metasearchDS.name,
          reportName: report.name,
          rowsProcessed: syncResult.rowsProcessed,
          dimensionsCreated: syncResult.dimensionsCreated
        },
        rowsProcessed: syncResult.rowsProcessed
      };
    } else {
      return {
        success: false,
        message: 'Sync operation failed',
        error: syncResult.error || 'Unknown sync error'
      };
    }

  } catch (error: any) {
    console.error('[METASEARCH-FIX] Error:', error);
    return {
      success: false,
      message: 'Metasearch fix failed',
      error: error.message || 'Unknown error'
    };
  }
}

/**
 * Check Metasearch data source status
 */
export async function checkMetasearchStatus(): Promise<{
  exists: boolean;
  dataSourceInfo?: any;
  reportInfo?: any;
  dataCount?: number;
  lastSync?: string | null;
}> {
  try {
    // Find Metasearch data source
    const { data: metasearchDS, error: dsError } = await supabase
      .from('data_sources')
      .select(`
        id,
        name,
        report_id,
        last_synced_at,
        column_mappings
      `)
      .ilike('name', '%metasearch%')
      .single();

    if (dsError || !metasearchDS) {
      return { exists: false };
    }

    // Get report info
    const { data: report } = await supabase
      .from('reports')
      .select('name, account_id')
      .eq('id', metasearchDS.report_id)
      .single();

    // Get data count
    const { count: dataCount } = await supabase
      .from('dimension_data')
      .select('id', { count: 'exact', head: true })
      .eq('report_id', metasearchDS.report_id);

    return {
      exists: true,
      dataSourceInfo: metasearchDS,
      reportInfo: report,
      dataCount: dataCount || 0,
      lastSync: metasearchDS.last_synced_at
    };

  } catch (error) {
    console.error('[METASEARCH-CHECK] Error:', error);
    return { exists: false };
  }
}

/**
 * Test Metasearch Google Sheets connectivity
 */
export async function testMetasearchConnectivity(): Promise<{
  success: boolean;
  message: string;
  details?: any;
}> {
  try {
    const status = await checkMetasearchStatus();
    
    if (!status.exists || !status.dataSourceInfo) {
      return {
        success: false,
        message: 'Metasearch data source not found'
      };
    }

    const dataSource = status.dataSourceInfo;

    // Test Google Sheets connectivity
    const { data: sheetsData, error: sheetsError } = await supabase.functions.invoke('fetch-google-sheets', {
      body: {
        spreadsheetId: dataSource.spreadsheet_id,
        tabName: dataSource.tab_name,
        headerRow: dataSource.header_row
      }
    });

    if (sheetsError) {
      return {
        success: false,
        message: `Google Sheets connectivity failed: ${sheetsError.message}`,
        details: sheetsError
      };
    }

    const rowCount = sheetsData?.values?.length || 0;
    const headers = rowCount > 0 ? sheetsData.values[0] : [];

    return {
      success: true,
      message: `Google Sheets connectivity successful`,
      details: {
        rowCount,
        headerCount: headers.length,
        sampleHeaders: headers.slice(0, 5)
      }
    };

  } catch (error: any) {
    return {
      success: false,
      message: `Connectivity test failed: ${error.message}`,
      details: error
    };
  }
}

// Make functions available globally for testing
if (typeof window !== 'undefined') {
  (window as any).fixMetasearchDataSource = fixMetasearchDataSource;
  (window as any).checkMetasearchStatus = checkMetasearchStatus;
  (window as any).testMetasearchConnectivity = testMetasearchConnectivity;
}
