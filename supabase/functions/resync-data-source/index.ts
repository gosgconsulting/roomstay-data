import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0';
import type { DataSource, RequestBody, ResponseBody } from './utils/types.ts';
import { extractSpreadsheetId } from './utils/utils.ts';
import { resyncDataSource, type RefreshMode } from './utils/resync.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Resync Data Source Edge Function
 * 
 * This edge function resyncs a data source from Google Sheets, replacing all existing data
 * and recreating dimensions from scratch. It performs a complete data refresh by:
 * 1. Deleting all existing dimension_data for the data source
 * 2. Deleting custom dimensions created by the data source
 * 3. Fetching fresh data from Google Sheets
 * 4. Rebuilding dimension mappings with auto-detection
 * 5. Transforming and inserting the new data
 * 
 * @module resync-data-source
 * 
 * @requires Environment Variables:
 *   - SUPABASE_URL: The Supabase project URL
 *   - SUPABASE_SERVICE_ROLE_KEY: Service role key for database access
 *   - SUPABASE_ANON_KEY: Anonymous key for calling other edge functions
 * 
 * @requires Request Body (JSON):
 *   - dataSourceId (string, required): The UUID of the data source to resync
 *   - updates (object, optional): Optional updates to apply before resync:
 *     - name (string): Update the data source name
 *     - google_sheets_url (string): Update the Google Sheets URL (must be valid)
 *     - tab_name (string): Update the tab/sheet name
 *     - header_row (number): Update the header row number (1-based)
 *     - sync_frequency (string): Update sync frequency ('manual' | 'daily' | 'weekly' | 'monthly')
 *     - sync_time (string): Update sync time (HH:mm format)
 *     - sync_timezone (string): Update timezone (e.g., 'Asia/Singapore')
 * 
 * @returns ResponseBody:
 *   - success (boolean): Whether the resync completed successfully
 *   - rowsProcessed (number): Number of rows processed from Google Sheets
 *   - dimensionsCreated (number): Number of new dimensions created
 *   - error (string, optional): Error message if resync failed
 * 
 * @example
 * // Basic resync without updates
 * POST /functions/v1/resync-data-source
 * {
 *   "dataSourceId": "123e4567-e89b-12d3-a456-426614174000"
 * }
 * 
 * @example
 * // Resync with updates
 * POST /functions/v1/resync-data-source
 * {
 *   "dataSourceId": "123e4567-e89b-12d3-a456-426614174000",
 *   "updates": {
 *     "name": "Updated Data Source Name",
 *     "tab_name": "Sheet1",
 *     "header_row": 2
 *   }
 * }
 * 
 * @example Response (Success)
 * {
 *   "success": true,
 *   "rowsProcessed": 1500,
 *   "dimensionsCreated": 3
 * }
 * 
 * @example Response (Error)
 * {
 *   "success": false,
 *   "rowsProcessed": 0,
 *   "dimensionsCreated": 0,
 *   "error": "Invalid Google Sheets URL"
 * }
 */
Deno.serve(async (req) => {
  // Handle CORS preflight requests (204 No Content is standard for OPTIONS)
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    
    if (!supabaseUrl || !supabaseServiceKey || !supabaseAnonKey) {
      return new Response(
        JSON.stringify({ 
          success: false,
          rowsProcessed: 0,
          dimensionsCreated: 0,
          error: 'Missing required environment variables' 
        }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    let requestBody: RequestBody;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      console.error('[RESYNC] Failed to parse request body:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid request body. Expected JSON.' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    // Validate required fields
    if (!requestBody.dataSourceId) {
      return new Response(
        JSON.stringify({ error: 'dataSourceId is required' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    // Fetch data source
    const { data: dataSource, error: fetchError } = await supabase
      .from('data_sources')
      .select('*')
      .eq('id', requestBody.dataSourceId)
      .single();

    if (fetchError || !dataSource) {
      console.error('[RESYNC] Error fetching data source:', fetchError);
      return new Response(
        JSON.stringify({ error: `Data source not found: ${fetchError?.message || 'Unknown error'}` }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404 
        }
      );
    }

    // Apply optional updates if provided
    const updatedDataSource: DataSource = { ...dataSource };
    if (requestBody.updates) {
      const updates: any = {};
      
      if (requestBody.updates.name !== undefined) {
        updates.name = requestBody.updates.name;
        updatedDataSource.name = requestBody.updates.name;
      }
      
      if (requestBody.updates.google_sheets_url !== undefined) {
        updates.google_sheets_url = requestBody.updates.google_sheets_url;
        updatedDataSource.google_sheets_url = requestBody.updates.google_sheets_url;
        
        // Extract spreadsheet_id from URL if URL is updated
        const spreadsheetId = extractSpreadsheetId(requestBody.updates.google_sheets_url);
        if (spreadsheetId) {
          updates.spreadsheet_id = spreadsheetId;
          updatedDataSource.spreadsheet_id = spreadsheetId;
        } else {
          return new Response(
            JSON.stringify({ error: 'Invalid Google Sheets URL' }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 400 
            }
          );
        }
      }
      
      if (requestBody.updates.tab_name !== undefined) {
        updates.tab_name = requestBody.updates.tab_name;
        updatedDataSource.tab_name = requestBody.updates.tab_name;
      }
      
      if (requestBody.updates.header_row !== undefined) {
        updates.header_row = requestBody.updates.header_row;
        updatedDataSource.header_row = requestBody.updates.header_row;
      }
      
      if (requestBody.updates.sync_frequency !== undefined) {
        updates.sync_frequency = requestBody.updates.sync_frequency;
        updatedDataSource.sync_frequency = requestBody.updates.sync_frequency;
      }
      
      if (requestBody.updates.sync_time !== undefined) {
        updates.sync_time = requestBody.updates.sync_time;
        updatedDataSource.sync_time = requestBody.updates.sync_time;
      }
      
      if (requestBody.updates.sync_timezone !== undefined) {
        updates.sync_timezone = requestBody.updates.sync_timezone;
        updatedDataSource.sync_timezone = requestBody.updates.sync_timezone;
      }
      
      // Update data source in database
      if (Object.keys(updates).length > 0) {
        const { error: updateError } = await supabase
          .from('data_sources')
          .update(updates)
          .eq('id', requestBody.dataSourceId);

        if (updateError) {
          console.error('[RESYNC] Error updating data source:', updateError);
          return new Response(
            JSON.stringify({ error: `Failed to update data source: ${updateError.message}` }),
            { 
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              status: 500 
            }
          );
        }
      }
    }

    // Get user_id from report (required for dimension creation)
    let userId: string | null = null;
    if (updatedDataSource.report_id) {
      const { data: reportData, error: reportError } = await supabase
        .from('reports')
        .select('user_id')
        .eq('id', updatedDataSource.report_id)
        .maybeSingle();
      
      if (reportError) {
        console.error('[RESYNC] Error fetching report:', reportError);
        return new Response(
          JSON.stringify({ error: `Failed to fetch report: ${reportError.message}` }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500 
          }
        );
      }
      
      userId = reportData?.user_id || null;
    }
    
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Could not determine user_id from report' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    // Perform resync
    const refreshMode: RefreshMode = requestBody.refreshMode === 'recent' ? 'recent' : 'full';
    const result = await resyncDataSource(
      supabase,
      supabaseUrl,
      supabaseAnonKey,
      updatedDataSource,
      userId,
      refreshMode
    );

    // If resync was successful, apply vlookup mappings
    if (result.success && updatedDataSource.report_id) {
      console.log('[RESYNC] Applying vlookup mappings after successful resync...');
      try {
        const vlookupResponse = await fetch(`${supabaseUrl}/functions/v1/apply-vlookup-mappings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseAnonKey}`,
          },
          body: JSON.stringify({
            reportId: updatedDataSource.report_id,
            accountId: updatedDataSource.account_id
          }),
        });

        const vlookupResult = await vlookupResponse.json();
        
        if (vlookupResult.success) {
          console.log(`[RESYNC] Successfully applied vlookup mappings: ${vlookupResult.rowsUpdated || 0} rows updated`);
          // Add vlookup info to result
          result.vlookupApplied = true;
          result.vlookupRowsUpdated = vlookupResult.rowsUpdated || 0;
        } else {
          console.warn('[RESYNC] Failed to apply vlookup mappings:', vlookupResult.error);
          result.vlookupApplied = false;
          result.vlookupError = vlookupResult.error;
        }
      } catch (vlookupError) {
        console.error('[RESYNC] Error calling apply-vlookup-mappings:', vlookupError);
        result.vlookupApplied = false;
        result.vlookupError = vlookupError instanceof Error ? vlookupError.message : 'Unknown error';
      }
    }

    // Return response
    const statusCode = result.success ? 200 : 500;
    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: statusCode 
      }
    );

  } catch (error) {
    console.error('[RESYNC] Fatal error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ 
        success: false,
        rowsProcessed: 0,
        dimensionsCreated: 0,
        error: errorMessage 
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
