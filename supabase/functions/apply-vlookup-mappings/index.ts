import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Max-Age': '86400',
};

Deno.serve(async (req) => {
  console.log('[VLOOKUP-APPLY] Function invoked');
  
  // Handle CORS preflight requests immediately - MUST be first
  if (req.method === 'OPTIONS') {
    console.log('[VLOOKUP-APPLY] Handling OPTIONS preflight request');
    return new Response('ok', { 
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Length': '2'
      }
    });
  }

  // DEPRECATED: apply-vlookup-mappings is retired. VLOOKUP logic is now absorbed
  // into resync-data-source. Remove this function after confirming no callers remain.
  console.warn('[VLOOKUP-APPLY] DEPRECATED: this function is retired. Use resync-data-source instead.');
  return new Response(
    JSON.stringify({ success: false, error: 'DEPRECATED: apply-vlookup-mappings is retired. Use resync-data-source.' }),
    { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );

  try {
    console.log('[VLOOKUP-APPLY] Parsing request body');
    const body = await req.json();
    const { reportId, accountId } = body;

    console.log(`[VLOOKUP-APPLY] Applying mappings for ${reportId ? 'report: ' + reportId : 'account: ' + accountId}`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Load vlookup mappings
    let query = supabase
      .from('dimension_mappings')
      .select('*');

    if (reportId) {
      query = query.eq('report_id', reportId);
    } else if (accountId) {
      query = query.eq('account_id', accountId);
    }

    const { data: mappings, error: mappingError } = await query;
    if (mappingError) throw mappingError;

    if (!mappings || mappings.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No mappings to apply',
          rowsUpdated: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all dimension_data rows
    let dataQuery = supabase
      .from('dimension_data')
      .select('id, dimension_values');

    if (reportId) {
      dataQuery = dataQuery.eq('report_id', reportId);
    } else if (accountId) {
      // Get all reports for this account
      const { data: reports } = await supabase
        .from('reports')
        .select('id')
        .eq('account_id', accountId);
      
      if (reports && reports.length > 0) {
        dataQuery = dataQuery.in('report_id', reports.map(r => r.id));
      }
    }

    const { data: rows, error: rowsError } = await dataQuery;
    if (rowsError) throw rowsError;

    if (!rows || rows.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No data rows to update',
          rowsUpdated: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Apply mappings to each row
    let updatedCount = 0;
    const updates: any[] = [];

    for (const row of rows) {
      const dimensionValues = { ...row.dimension_values };
      let hasChanges = false;

      // Apply each mapping
      for (const mapping of mappings) {
        const sourceValue = dimensionValues[mapping.source_dimension_id];
        
        if (sourceValue && String(sourceValue).toLowerCase() === String(mapping.source_value).toLowerCase()) {
          dimensionValues[mapping.target_dimension_id] = mapping.target_value;
          hasChanges = true;
        }
      }

      if (hasChanges) {
        updates.push({
          id: row.id,
          dimension_values: dimensionValues
        });
        updatedCount++;
      }
    }

    // Update rows in batches
    if (updates.length > 0) {
      const batchSize = 500;
      for (let i = 0; i < updates.length; i += batchSize) {
        const batch = updates.slice(i, i + batchSize);
        
        const { error: updateError } = await supabase
          .from('dimension_data')
          .upsert(batch, { onConflict: 'id' });

        if (updateError) {
          console.error('Error updating batch:', updateError);
          throw updateError;
        }
      }
    }

    console.log(`[VLOOKUP-APPLY] Successfully applied mappings to ${updatedCount} rows`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Applied mappings to ${updatedCount} rows`,
        rowsUpdated: updatedCount
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[VLOOKUP-APPLY] Error:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : undefined
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});