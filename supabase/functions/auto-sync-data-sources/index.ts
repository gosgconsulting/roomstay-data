import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DataSource {
  id: string;
  name: string;
  google_sheets_url: string;
  spreadsheet_id: string;
  tab_name: string;
  header_row: number;
  column_mappings: any[];
  report_id: string;
  sync_frequency: string;
  sync_time: string;
  sync_timezone: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('[AUTO-SYNC] Starting auto-sync check...');

    // Get current time in UTC
    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();
    const currentDay = now.getUTCDay(); // 0 = Sunday, 6 = Saturday
    const currentDate = now.getUTCDate();

    console.log(`[AUTO-SYNC] Current UTC time: ${currentHour}:${currentMinute}, Day: ${currentDay}, Date: ${currentDate}`);

    // Get all data sources that need syncing
    const { data: dataSources, error: fetchError } = await supabase
      .from('data_sources')
      .select('*')
      .neq('sync_frequency', 'manual');

    if (fetchError) {
      console.error('[AUTO-SYNC] Error fetching data sources:', fetchError);
      throw fetchError;
    }

    if (!dataSources || dataSources.length === 0) {
      console.log('[AUTO-SYNC] No data sources configured for auto-sync');
      return new Response(
        JSON.stringify({ message: 'No data sources to sync' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[AUTO-SYNC] Found ${dataSources.length} data sources with auto-sync enabled`);
    console.log(`[AUTO-SYNC] Data sources details:`, 
      dataSources.map((ds: DataSource) => ({
        id: ds.id,
        name: ds.name,
        sync_frequency: ds.sync_frequency,
        sync_time: ds.sync_time,
        sync_timezone: ds.sync_timezone,
        source_type: (ds as any).source_type || 'google_sheets',
        report_id: ds.report_id,
        last_synced_at: (ds as any).last_synced_at || 'never'
      }))
    );

    const syncResults = [];

    for (const ds of dataSources as DataSource[]) {
      try {
        // Convert sync time to UTC based on timezone
        const [syncHour, syncMinute] = ds.sync_time.split(':').map(Number);
        
        // Calculate if sync should run based on frequency
        let shouldSync = false;
        
        if (ds.sync_frequency === 'daily') {
          // Daily: check if current time matches sync time (within 15-minute window)
          shouldSync = currentHour === syncHour && Math.abs(currentMinute - syncMinute) < 15;
        } else if (ds.sync_frequency === 'weekly') {
          // Weekly: Sunday at sync time
          shouldSync = currentDay === 0 && currentHour === syncHour && Math.abs(currentMinute - syncMinute) < 15;
        } else if (ds.sync_frequency === 'monthly') {
          // Monthly: 1st of month at sync time
          shouldSync = currentDate === 1 && currentHour === syncHour && Math.abs(currentMinute - syncMinute) < 15;
        }

        if (!shouldSync) {
          console.log(`[AUTO-SYNC] Skipping ${ds.name} - not scheduled for this time`);
          continue;
        }

        console.log(`[AUTO-SYNC] Syncing ${ds.name}...`);

        // Determine source type and fetch data accordingly
        const sourceType = ds.source_type || 'google_sheets'; // Default to google_sheets for backward compatibility
        let headers: any[] = [];
        let dataRows: any[][] = [];

        if (sourceType === 'csv_url') {
          // Fetch data from CSV URL
          if (!ds.csv_url) {
            console.error(`[AUTO-SYNC] CSV URL missing for ${ds.name}`);
            continue;
          }

          const { data: csvData, error: csvError } = await supabase.functions.invoke('fetch-csv-url', {
            body: {
              csvUrl: ds.csv_url,
            },
          });

          if (csvError) {
            console.error(`[AUTO-SYNC] Error fetching CSV for ${ds.name}:`, csvError);
            continue;
          }

          if (!csvData?.values || csvData.values.length === 0) {
            console.log(`[AUTO-SYNC] No data found for ${ds.name}`);
            continue;
          }

          // Extract headers from the specified header row
          const headerRowNum = ds.header_row || 1;
          if (headerRowNum < 1 || headerRowNum > csvData.values.length) {
            console.error(`[AUTO-SYNC] Header row ${headerRowNum} out of range for ${ds.name}`);
            continue;
          }

          headers = csvData.values[headerRowNum - 1];
          dataRows = csvData.values.slice(headerRowNum);
        } else {
          // Fetch data from Google Sheets
          if (!ds.spreadsheet_id || !ds.tab_name) {
            console.error(`[AUTO-SYNC] Spreadsheet ID or tab name missing for ${ds.name}`);
            continue;
          }

          const { data: sheetsData, error: sheetsError } = await supabase.functions.invoke('fetch-google-sheets', {
            body: {
              spreadsheetId: ds.spreadsheet_id,
              tabName: ds.tab_name,
              range: `${ds.header_row}:1000000`,
            },
          });

          if (sheetsError) {
            console.error(`[AUTO-SYNC] Error fetching Google Sheets for ${ds.name}:`, sheetsError);
            continue;
          }

          if (!sheetsData?.values || sheetsData.values.length === 0) {
            console.log(`[AUTO-SYNC] No data found for ${ds.name}`);
            continue;
          }

          headers = sheetsData.values[0];
          dataRows = sheetsData.values.slice(1);
        }

        // Delete existing data for this data source
        const { error: deleteError } = await supabase
          .from('dimension_data')
          .delete()
          .eq('data_source_id', ds.id);

        if (deleteError) throw deleteError;

        // Process and insert data
        const columnMappings = ds.column_mappings || [];
        const visibleMappings = columnMappings.filter((m: any) => m.visible !== false);
        
        let rowsInserted = 0;
        // Adaptive batch sizing based on dataset size to prevent statement timeouts
        let batchSize: number;
        if (dataRows.length > 100000) {
          batchSize = 250; // Very large datasets: smaller batches
        } else if (dataRows.length > 50000) {
          batchSize = 400; // Large datasets: medium batches
        } else if (dataRows.length > 10000) {
          batchSize = 600; // Medium datasets: larger batches
        } else {
          batchSize = 1000; // Small datasets: standard batches
        }

        console.log(`[AUTO-SYNC] Using adaptive batch size: ${batchSize} for ${dataRows.length} rows`);

        for (let i = 0; i < dataRows.length; i += batchSize) {
          const batch = dataRows.slice(i, i + batchSize);
          const rowsToInsert = batch.map((row: any[]) => {
            const dimensionValues: any = {};

            visibleMappings.forEach((mapping: any) => {
              const colIndex = headers.indexOf(mapping.sourceColumn);
              if (colIndex !== -1) {
                const rawValue = row[colIndex];
                dimensionValues[mapping.dimensionId] = rawValue || '';
              }
            });

            return {
              report_id: ds.report_id,
              data_source_id: ds.id,
              dimension_values: dimensionValues,
            };
          });

          const { error: insertError } = await supabase
            .from('dimension_data')
            .insert(rowsToInsert);

          if (insertError) throw insertError;
          rowsInserted += rowsToInsert.length;
        }

        // Update last_synced_at timestamp
        await supabase
          .from('data_sources')
          .update({ last_synced_at: now.toISOString() })
          .eq('id', ds.id);

        console.log(`[AUTO-SYNC] Successfully synced ${ds.name}: ${rowsInserted} rows`);
        syncResults.push({ name: ds.name, success: true, rows: rowsInserted });

      } catch (error) {
        console.error(`[AUTO-SYNC] Error syncing ${ds.name}:`, error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        syncResults.push({ name: ds.name, success: false, error: errorMessage });
      }
    }

    return new Response(
      JSON.stringify({ 
        message: 'Auto-sync completed',
        results: syncResults
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[AUTO-SYNC] Fatal error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
