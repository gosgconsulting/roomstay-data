// @deno-types="https://esm.sh/@supabase/supabase-js@2.77.0/dist/module/index.d.ts"
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
  source_type?: string;
  csv_url?: string;
  last_synced_at?: string;
}

// @ts-ignore - Deno global is available in Deno runtime
Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // @ts-ignore - Deno.env is available in Deno runtime
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    // @ts-ignore - Deno.env is available in Deno runtime
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    // @ts-ignore - Deno.env is available in Deno runtime
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
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
        source_type: ds.source_type || 'google_sheets',
        report_id: ds.report_id,
        last_synced_at: ds.last_synced_at || 'never'
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

        console.log(`[AUTO-SYNC] Syncing ${ds.name} using resync-data-source function...`);

        // Use the resync-data-source function instead of duplicating logic
        const resyncResponse = await fetch(`${supabaseUrl}/functions/v1/resync-data-source`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({
            dataSourceId: ds.id
          }),
        });

        const resyncResult = await resyncResponse.json();

        if (resyncResult.success) {
          // Update last_synced_at timestamp
          await supabase
            .from('data_sources')
            .update({ last_synced_at: now.toISOString() })
            .eq('id', ds.id);

          console.log(`[AUTO-SYNC] Successfully synced ${ds.name}: ${resyncResult.rowsProcessed} rows, ${resyncResult.dimensionsCreated} dimensions created`);
          syncResults.push({ 
            name: ds.name, 
            success: true, 
            rows: resyncResult.rowsProcessed,
            dimensionsCreated: resyncResult.dimensionsCreated,
            vlookupApplied: resyncResult.vlookupApplied || false,
            vlookupRowsUpdated: resyncResult.vlookupRowsUpdated || 0
          });

          // sync-report-api-data retired; report_api_data table dropped — no-op here
        } else {
          console.error(`[AUTO-SYNC] Failed to sync ${ds.name}:`, resyncResult.error);
          syncResults.push({ 
            name: ds.name, 
            success: false, 
            error: resyncResult.error 
          });
        }

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