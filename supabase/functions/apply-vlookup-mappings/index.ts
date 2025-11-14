import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VlookupMapping {
  source_value: string;
  target_dimension_id: string;
  target_value: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { reportId, accountId } = await req.json();

    if (!reportId && !accountId) {
      throw new Error('Either reportId or accountId is required');
    }

    console.log(`[VLOOKUP-APPLY] Starting to apply mappings for report: ${reportId}, account: ${accountId}`);

    // Get the user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.error('[VLOOKUP-APPLY] No authorization header provided');
      throw new Error('No authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      console.error('[VLOOKUP-APPLY] User authentication failed:', userError);
      throw new Error('Unauthorized');
    }

    console.log(`[VLOOKUP-APPLY] Authenticated user: ${user.id}`);

    // Load vlookup mappings
    let mappingsQuery = supabase
      .from('dimension_mappings')
      .select('*')
      .eq('user_id', user.id);

    if (reportId) {
      mappingsQuery = mappingsQuery.eq('report_id', reportId);
    } else if (accountId) {
      mappingsQuery = mappingsQuery.eq('account_id', accountId);
    }

    const { data: mappings, error: mappingsError } = await mappingsQuery;
    if (mappingsError) {
      console.error('[VLOOKUP-APPLY] Error loading mappings:', mappingsError);
      throw mappingsError;
    }

    if (!mappings || mappings.length === 0) {
      console.log('[VLOOKUP-APPLY] No mappings found');
      return new Response(
        JSON.stringify({ success: true, message: 'No mappings to apply', rowsUpdated: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[VLOOKUP-APPLY] Found ${mappings.length} mappings to apply`);

    // Group mappings by target dimension
    const mappingsByTargetDimension = new Map<string, VlookupMapping[]>();
    for (const mapping of mappings) {
      const targetId = mapping.target_dimension_id;
      if (!mappingsByTargetDimension.has(targetId)) {
        mappingsByTargetDimension.set(targetId, []);
      }
      mappingsByTargetDimension.get(targetId)!.push({
        source_value: mapping.source_value,
        target_dimension_id: mapping.target_dimension_id,
        target_value: mapping.target_value,
      });
    }

    // For each target dimension, find the source dimension and apply mappings
    let totalRowsUpdated = 0;

    for (const [targetDimensionId, dimMappings] of mappingsByTargetDimension.entries()) {
      console.log(`[VLOOKUP-APPLY] Processing ${dimMappings.length} mappings for target dimension: ${targetDimensionId}`);

      // Get target dimension details
      const { data: targetDimension, error: targetDimError } = await supabase
        .from('dimensions')
        .select('name, type')
        .eq('id', targetDimensionId)
        .single();

      if (targetDimError || !targetDimension) {
        console.error(`[VLOOKUP-APPLY] Could not find target dimension ${targetDimensionId}`);
        continue;
      }

      console.log(`[VLOOKUP-APPLY] Target dimension: ${targetDimension.name} (${targetDimension.type})`);

      // Load dimension_data rows for this report
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
          const reportIds = reports.map(r => r.id);
          dataQuery = dataQuery.in('report_id', reportIds);
        }
      }

      const { data: dimensionDataRows, error: dataError } = await dataQuery;
      if (dataError) {
        console.error('[VLOOKUP-APPLY] Error loading dimension_data:', dataError);
        continue;
      }

      if (!dimensionDataRows || dimensionDataRows.length === 0) {
        console.log('[VLOOKUP-APPLY] No dimension_data rows found');
        continue;
      }

      console.log(`[VLOOKUP-APPLY] Processing ${dimensionDataRows.length} dimension_data rows`);

      // Find which dimension contains the source values by checking the first few rows
      const sourceDimensionId = findSourceDimensionId(dimensionDataRows, dimMappings);
      if (!sourceDimensionId) {
        console.warn('[VLOOKUP-APPLY] Could not identify source dimension for mappings');
        continue;
      }

      console.log(`[VLOOKUP-APPLY] Identified source dimension ID: ${sourceDimensionId}`);

      // Create a lookup map for fast matching
      const lookupMap = new Map<string, string>();
      for (const mapping of dimMappings) {
        lookupMap.set(mapping.source_value.toLowerCase().trim(), mapping.target_value);
      }

      // Process rows in batches
      const batchSize = 500;
      let updatedCount = 0;

      for (let i = 0; i < dimensionDataRows.length; i += batchSize) {
        const batch = dimensionDataRows.slice(i, i + batchSize);
        const updates = [];

        for (const row of batch) {
          const dimensionValues = row.dimension_values as Record<string, any>;
          const sourceValue = dimensionValues[sourceDimensionId];

          if (sourceValue) {
            const normalizedSource = String(sourceValue).toLowerCase().trim();
            const targetValue = lookupMap.get(normalizedSource);

            if (targetValue) {
              // Inject or update the target dimension
              const updatedValues = {
                ...dimensionValues,
                [targetDimensionId]: targetValue,
              };

              updates.push({
                id: row.id,
                dimension_values: updatedValues,
              });
            }
          }
        }

        // Batch update
        if (updates.length > 0) {
          for (const update of updates) {
            const { error: updateError } = await supabase
              .from('dimension_data')
              .update({ dimension_values: update.dimension_values })
              .eq('id', update.id);

            if (updateError) {
              console.error(`[VLOOKUP-APPLY] Error updating row ${update.id}:`, updateError);
            } else {
              updatedCount++;
            }
          }

          console.log(`[VLOOKUP-APPLY] Updated batch of ${updates.length} rows`);
        }
      }

      totalRowsUpdated += updatedCount;
      console.log(`[VLOOKUP-APPLY] Updated ${updatedCount} rows for target dimension ${targetDimension.name}`);
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Applied vlookup mappings to ${totalRowsUpdated} rows`,
        rowsUpdated: totalRowsUpdated 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('[VLOOKUP-APPLY] Error:', errorMessage);
    console.error('[VLOOKUP-APPLY] Stack:', errorStack);
    console.error('[VLOOKUP-APPLY] Full error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: errorMessage,
        details: errorStack
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

/**
 * Find the source dimension ID by checking which dimension contains the source values
 */
function findSourceDimensionId(
  rows: Array<{ dimension_values: Record<string, any> }>,
  mappings: VlookupMapping[]
): string | null {
  const sourceValues = new Set(mappings.map(m => m.source_value.toLowerCase().trim()));
  
  // Get all dimension IDs from the first row
  if (rows.length === 0) return null;
  const firstRow = rows[0].dimension_values;
  const dimensionIds = Object.keys(firstRow);

  // Check each dimension to see if it contains the source values
  for (const dimId of dimensionIds) {
    let matchCount = 0;
    
    // Check first 100 rows for matches
    for (let i = 0; i < Math.min(100, rows.length); i++) {
      const value = rows[i].dimension_values[dimId];
      if (value && sourceValues.has(String(value).toLowerCase().trim())) {
        matchCount++;
      }
    }

    // If we found at least one match, this is likely the source dimension
    if (matchCount > 0) {
      console.log(`[VLOOKUP-APPLY] Found ${matchCount} matches in dimension ${dimId}`);
      return dimId;
    }
  }

  return null;
}
