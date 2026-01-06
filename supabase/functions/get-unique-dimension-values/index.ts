// @ts-ignore - Deno resolves remote module imports at runtime
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.77.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE, PATCH',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

type RequestBody = {
  reportId?: string;
  reportIds?: string[];
  dimensionId: string;
  dimensionName?: string;
  limit?: number;
};

// Helper function to extract spreadsheet ID from Google Sheets URL
function extractSpreadsheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

// Helper function to parse value based on dimension type
function parseValue(rawValue: any, dimensionType: string, dateFormat?: string): any {
  if (rawValue === null || rawValue === undefined || rawValue === '') {
    return null;
  }

  const str = String(rawValue).trim();
  if (str === '') return null;

  switch (dimensionType) {
    case 'date':
      // Try to parse date - basic implementation
      if (dateFormat) {
        // Simple date parsing - can be enhanced
        const date = new Date(str);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      }
      return str;
    case 'currency':
    case 'number':
      const num = parseFloat(str.replace(/[^0-9.-]/g, ''));
      return isNaN(num) ? str : num;
    case 'percentage':
      const pct = parseFloat(str.replace(/[^0-9.-]/g, ''));
      return isNaN(pct) ? str : pct;
    default:
      return str;
  }
}

// Fetch data from Google Sheets
async function fetchGoogleSheetsData(
  supabaseUrl: string,
  supabaseAnonKey: string,
  spreadsheetId: string,
  tabName: string,
  range: string
): Promise<any[][]> {
  const functionUrl = `${supabaseUrl}/functions/v1/fetch-google-sheets`;
  
  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({
      spreadsheetId,
      tabName,
      range,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch Google Sheets: ${errorText}`);
  }

  const data = await response.json();
  if (data?.error) {
    throw new Error(`Google Sheets error: ${data.error}`);
  }

  return data.values || [];
}

// Fetch data from CSV URL
async function fetchCSVData(
  supabaseUrl: string,
  supabaseAnonKey: string,
  csvUrl: string
): Promise<any[][]> {
  const functionUrl = `${supabaseUrl}/functions/v1/fetch-csv-url`;
  
  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({
      csvUrl,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch CSV: ${errorText}`);
  }

  const data = await response.json();
  if (data?.error) {
    throw new Error(`CSV error: ${data.error}`);
  }

  return data.values || [];
}

// @ts-ignore - Deno global is provided by the Edge Functions runtime
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: RequestBody = await req.json();
    const { reportId, reportIds, dimensionId, dimensionName: nameInput, limit = 1000 } = body || {};

    console.log('[get-unique-dimension-values] Request:', { reportId, dimensionId, dimensionName: nameInput, limit });

    if (!dimensionId) {
      return new Response(JSON.stringify({ error: 'dimensionId is required', values: [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!reportId && (!reportIds || reportIds.length === 0)) {
      return new Response(JSON.stringify({ error: 'reportId or reportIds is required', values: [] }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // @ts-ignore - Deno env is available in the Edge Functions runtime
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    // @ts-ignore - Deno env is available in the Edge Functions runtime
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    // @ts-ignore - Deno env is available in the Edge Functions runtime
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Build candidate dimension IDs from the selected dimension and any same-name dimensions
    const candidateIds = new Set<string>();
    candidateIds.add(dimensionId);

    // Get the dimension name from input or by looking up the selected dimension id
    let dimName = nameInput?.trim();
    if (!dimName) {
      const { data: dimRow } = await supabase
        .from('dimensions')
        .select('name')
        .eq('id', dimensionId)
        .limit(1)
        .maybeSingle();

      if (dimRow?.name) {
        dimName = String(dimRow.name);
      }
    }

    // If we have a name, fetch all dimensions with that same name and add their IDs as candidates
    if (dimName) {
      const { data: sameNameDims } = await supabase
        .from('dimensions')
        .select('id, name')
        .ilike('name', dimName);

      (sameNameDims || []).forEach((d: any) => {
        if (d?.id) candidateIds.add(String(d.id));
      });
    }

    console.log('[get-unique-dimension-values] Candidate dimension IDs:', Array.from(candidateIds));

    // Build report filter
    const targetReportIds = reportId ? [reportId] : (reportIds || []);
    const ids = Array.from(candidateIds);
    
    // NEW APPROACH: Load data directly from data sources instead of dimension_data table
    // This ensures we use the current tab_name and get fresh data
    const uniqueValues = new Set<string>();

    // Only try to load from sources if we have the anon key (needed to call other edge functions)
    if (supabaseAnonKey) {
      // Fetch data sources for all reports
      const { data: dataSources, error: dsError } = await supabase
        .from('data_sources')
        .select('*')
        .in('report_id', targetReportIds);

      if (dsError) {
        console.error('[get-unique-dimension-values] Error fetching data sources:', dsError);
        // Fallback to dimension_data table if data source fetch fails
        console.log('[get-unique-dimension-values] Falling back to dimension_data table');
      } else if (dataSources && dataSources.length > 0) {
        console.log(`[get-unique-dimension-values] Found ${dataSources.length} data source(s), loading from source...`);

        // Process each data source
        for (const dataSource of dataSources) {
          try {
            let headers: string[] = [];
            let dataRows: any[][] = [];

            // Load data based on source type
            if (dataSource.source_type === 'csv_url') {
              if (!dataSource.csv_url) {
                console.warn(`[get-unique-dimension-values] CSV URL missing for data source ${dataSource.id}`);
                continue;
              }

              const csvData = await fetchCSVData(supabaseUrl, supabaseAnonKey, dataSource.csv_url);
              if (csvData && csvData.length > 0) {
                const headerRow = (dataSource.header_row || 1) - 1;
                headers = csvData[headerRow]?.map((h: any) => String(h || '').trim()) || [];
                dataRows = csvData.slice(headerRow + 1);
              }
            } else {
              // Google Sheets
              if (!dataSource.tab_name || (!dataSource.spreadsheet_id && !dataSource.google_sheets_url)) {
                console.warn(`[get-unique-dimension-values] Missing tab_name or spreadsheet_id for data source ${dataSource.id}`);
                continue;
              }

              const spreadsheetId = dataSource.spreadsheet_id || extractSpreadsheetId(dataSource.google_sheets_url || '');
              if (!spreadsheetId) {
                console.warn(`[get-unique-dimension-values] Could not extract spreadsheet ID for data source ${dataSource.id}`);
                continue;
              }

              // Fetch headers
              const headerRow = dataSource.header_row || 1;
              const headerRange = `A${headerRow}:Z${headerRow}`;
              const headerData = await fetchGoogleSheetsData(supabaseUrl, supabaseAnonKey, spreadsheetId, dataSource.tab_name, headerRange);
              headers = headerData[0]?.map((h: any) => String(h || '').trim()) || [];

              // Fetch data rows (limit to first 50000 rows for performance)
              const dataStartRow = headerRow + 1;
              const dataRange = `A${dataStartRow}:Z${dataStartRow + 50000}`;
              dataRows = await fetchGoogleSheetsData(supabaseUrl, supabaseAnonKey, spreadsheetId, dataSource.tab_name, dataRange);
            }

            if (headers.length === 0 || dataRows.length === 0) {
              console.warn(`[get-unique-dimension-values] No data found for data source ${dataSource.id}`);
              continue;
            }

            // Build column index map
            const columnIndexMap: Record<string, number> = {};
            headers.forEach((header, index) => {
              if (header) {
                columnIndexMap[header] = index;
              }
            });

            // Get column mappings
            const mappings = Array.isArray(dataSource.column_mappings) ? dataSource.column_mappings : [];
            const visibleMappings = mappings.filter((m: any) => m.visible);

            // Find columns mapped to our target dimension IDs
            const targetColumns: string[] = [];
            visibleMappings.forEach((mapping: any) => {
              if (mapping.dimensionId && ids.includes(mapping.dimensionId)) {
                if (mapping.column && columnIndexMap[mapping.column] !== undefined) {
                  targetColumns.push(mapping.column);
                }
              }
            });

            if (targetColumns.length === 0) {
              console.warn(`[get-unique-dimension-values] No columns mapped to target dimensions for data source ${dataSource.id}`);
              continue;
            }

            // Get dimension types for parsing
            const { data: dimensionsData } = await supabase
              .from('dimensions')
              .select('id, type')
              .in('id', ids);

            const dimensionTypeMap: Record<string, string> = {};
            if (dimensionsData) {
              dimensionsData.forEach((dim: any) => {
                dimensionTypeMap[dim.id] = dim.type;
              });
            }

            // Extract unique values from data rows
            for (const row of dataRows) {
              if (!Array.isArray(row)) continue;

              for (const column of targetColumns) {
                const colIndex = columnIndexMap[column];
                if (colIndex === undefined || colIndex < 0 || colIndex >= row.length) continue;

                const rawValue = row[colIndex];
                if (rawValue === null || rawValue === undefined || rawValue === '') continue;

                // Find the dimension ID for this column
                const mapping = visibleMappings.find((m: any) => m.column === column);
                if (!mapping || !mapping.dimensionId || !ids.includes(mapping.dimensionId)) continue;

                const dimensionType = mapping.newDimensionType || mapping.dimensionType || dimensionTypeMap[mapping.dimensionId] || 'text';
                const value = parseValue(rawValue, dimensionType, mapping.dateFormat);
                
                if (value !== null && value !== undefined) {
                  const str = String(value).trim();
                  if (str !== '') {
                    uniqueValues.add(str);
                    if (uniqueValues.size >= limit) break;
                  }
                }
              }

              if (uniqueValues.size >= limit) break;
            }

            console.log(`[get-unique-dimension-values] Extracted ${uniqueValues.size} unique values from data source ${dataSource.id}`);
          } catch (sourceError) {
            console.error(`[get-unique-dimension-values] Error processing data source ${dataSource.id}:`, sourceError);
            // Continue with next data source
          }
        }
      }
    } else {
      console.log('[get-unique-dimension-values] SUPABASE_ANON_KEY not available, using dimension_data table');
    }

    // Fallback to dimension_data table if no data sources found or if we didn't get enough values
    if (uniqueValues.size === 0) {
      console.log('[get-unique-dimension-values] No values from sources, falling back to dimension_data table');
      
      const maxRows = 50000;
      const { data, error } = await supabase
        .from('dimension_data')
        .select('dimension_values')
        .in('report_id', targetReportIds)
        .limit(maxRows);

      if (!error && data) {
        for (const row of data) {
          const dv = (row as any).dimension_values || {};
          for (const id of ids) {
            const val = dv?.[id];
            if (val !== undefined && val !== null) {
              const str = String(val).trim();
              if (str !== '') {
                uniqueValues.add(str);
                if (uniqueValues.size >= limit) break;
              }
            }
          }
          if (uniqueValues.size >= limit) break;
        }
      }
    }

    let values = Array.from(uniqueValues);
    // Sort alphabetically and apply limit
    values.sort((a, b) => String(a).localeCompare(String(b)));
    if (typeof limit === 'number' && limit > 0) {
      values = values.slice(0, limit);
    }

    console.log(`[get-unique-dimension-values] Returning ${values.length} unique values`);

    return new Response(JSON.stringify({ values }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[get-unique-dimension-values] Error:', message);
    return new Response(JSON.stringify({ error: message, values: [] }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
