import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // DEPRECATED: migrate-sheet-data is a one-time migration function (sheet_data → dimension_data).
  // Migration is complete. Remove this function after confirming sheet_data table is dropped (Phase 9).
  console.warn('[MIGRATE-SHEET-DATA] DEPRECATED: one-time migration is complete. This function is retired.');
  return new Response(
    JSON.stringify({ success: false, error: 'DEPRECATED: migrate-sheet-data is retired. Migration from sheet_data to dimension_data is complete.' }),
    { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting migration of existing sheet_data...');

    // Fetch all data sources with their mappings
    const { data: dataSources, error: dsError } = await supabase
      .from('data_sources')
      .select('id, column_mappings');

    if (dsError) {
      console.error('Error fetching data sources:', dsError);
      throw dsError;
    }

    if (!dataSources || dataSources.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No data sources found to migrate' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch all dimensions
    const { data: dimensions, error: dimError } = await supabase
      .from('dimensions')
      .select('*');

    if (dimError) {
      console.error('Error fetching dimensions:', dimError);
      throw dimError;
    }

    let totalUpdated = 0;

    // Process each data source
    for (const dataSource of dataSources) {
      console.log(`Processing data source: ${dataSource.id}`);

      // Fetch all sheet_data for this data source
      const { data: sheetData, error: sheetError } = await supabase
        .from('sheet_data')
        .select('*')
        .eq('data_source_id', dataSource.id);

      if (sheetError) {
        console.error(`Error fetching sheet data for ${dataSource.id}:`, sheetError);
        continue;
      }

      if (!sheetData || sheetData.length === 0) {
        console.log(`No sheet data found for ${dataSource.id}`);
        continue;
      }

      // Update each row to include mapped dimension names
      for (const row of sheetData) {
        const updatedRowData = { ...row.row_data };
        let hasChanges = false;

        // For each column mapping, add the mapped dimension name
        if (dataSource.column_mappings) {
          for (const mapping of dataSource.column_mappings) {
            if (mapping.dimensionId && mapping.dimensionId !== 'none' && mapping.visible) {
              const dimension = dimensions?.find(d => d.id === mapping.dimensionId);
              if (dimension) {
                const originalValue = updatedRowData[mapping.column];
                // Only add if dimension name doesn't already exist
                if (originalValue !== undefined && updatedRowData[dimension.name] === undefined) {
                  updatedRowData[dimension.name] = originalValue;
                  hasChanges = true;
                }
              }
            }
          }
        }

        // Update the row if there are changes
        if (hasChanges) {
          const { error: updateError } = await supabase
            .from('sheet_data')
            .update({ row_data: updatedRowData })
            .eq('id', row.id);

          if (updateError) {
            console.error(`Error updating row ${row.id}:`, updateError);
          } else {
            totalUpdated++;
          }
        }
      }
    }

    console.log(`Migration complete. Updated ${totalUpdated} rows.`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully migrated ${totalUpdated} rows`,
        dataSources: dataSources.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Migration error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
