import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Base CORS headers
const getCorsHeaders = (req?: Request) => {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  // For preflight requests, echo back the requested headers
  if (req) {
    const requestedHeaders = req.headers.get('Access-Control-Request-Headers');
    if (requestedHeaders) {
      headers['Access-Control-Allow-Headers'] = requestedHeaders;
    } else {
      // Default headers if none requested
      headers['Access-Control-Allow-Headers'] = 'authorization, x-client-info, apikey, content-type, x-supabase-client-info';
    }
  } else {
    // For regular responses, include common headers
    headers['Access-Control-Allow-Headers'] = 'authorization, x-client-info, apikey, content-type, x-supabase-client-info';
  }

  return headers;
};

/**
 * Parse CSV content into a 2D array
 * Handles common delimiters: comma, semicolon, tab
 * Handles quoted fields and escaped quotes
 */
function parseCSV(content: string): string[][] {
  const lines: string[][] = [];
  const rows = content.split(/\r?\n/);
  
  // Detect delimiter by analyzing first few rows
  let delimiter = ',';
  if (rows.length > 0) {
    const firstRow = rows[0];
    const commaCount = (firstRow.match(/,/g) || []).length;
    const semicolonCount = (firstRow.match(/;/g) || []).length;
    const tabCount = (firstRow.match(/\t/g) || []).length;
    
    if (semicolonCount > commaCount && semicolonCount > tabCount) {
      delimiter = ';';
    } else if (tabCount > commaCount && tabCount > semicolonCount) {
      delimiter = '\t';
    }
  }
  
  for (const row of rows) {
    if (row.trim() === '') continue; // Skip empty rows
    
    const fields: string[] = [];
    let currentField = '';
    let inQuotes = false;
    
    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      const nextChar = row[i + 1];
      
      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // Escaped quote
          currentField += '"';
          i++; // Skip next quote
        } else {
          // Toggle quote state
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        // End of field
        fields.push(currentField.trim());
        currentField = '';
      } else {
        currentField += char;
      }
    }
    
    // Add last field
    fields.push(currentField.trim());
    lines.push(fields);
  }
  
  return lines;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204, 
      headers: getCorsHeaders(req) 
    });
  }

  const corsHeaders = getCorsHeaders();

  try {
    // Parse request body
    let requestBody;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      console.error('[fetch-csv-url] Failed to parse request body:', parseError);
      return new Response(
        JSON.stringify({ error: 'Invalid request body. Expected JSON.' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }
    
    const { csvUrl } = requestBody;

    if (!csvUrl || typeof csvUrl !== 'string' || csvUrl.trim() === '') {
      return new Response(
        JSON.stringify({ error: 'CSV URL is required and must be a non-empty string' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    // Validate URL format
    let urlObj: URL;
    try {
      urlObj = new URL(csvUrl);
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid URL format' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    // Only allow http and https protocols
    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
      return new Response(
        JSON.stringify({ error: 'URL must use HTTP or HTTPS protocol' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    console.log(`[fetch-csv-url] Fetching CSV from: ${csvUrl}`);

    // Fetch CSV content
    const response = await fetch(csvUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Supabase-Edge-Function/1.0)',
      },
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error(`[fetch-csv-url] HTTP error: ${response.status} ${response.statusText}`);
      return new Response(
        JSON.stringify({ 
          error: `Failed to fetch CSV: ${response.status} ${response.statusText}`,
          details: errorText.substring(0, 200) // Limit error details length
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: response.status 
        }
      );
    }

    // Get content type to verify it's CSV-like
    const contentType = response.headers.get('content-type') || '';
    const isCSVLike = contentType.includes('csv') || 
                      contentType.includes('text/plain') || 
                      contentType.includes('text/csv') ||
                      csvUrl.toLowerCase().endsWith('.csv');

    if (!isCSVLike) {
      console.warn(`[fetch-csv-url] Warning: Content-Type is ${contentType}, but proceeding anyway`);
    }

    // Read CSV content
    const csvContent = await response.text();
    
    if (!csvContent || csvContent.trim() === '') {
      return new Response(
        JSON.stringify({ error: 'CSV file is empty' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    // Parse CSV
    const values = parseCSV(csvContent);
    
    if (values.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No data rows found in CSV file' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    console.log(`[fetch-csv-url] Successfully parsed ${values.length} rows from CSV`);

    return new Response(
      JSON.stringify({ values }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('[fetch-csv-url] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});

