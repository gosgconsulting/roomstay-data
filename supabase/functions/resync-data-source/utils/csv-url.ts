/**
 * CSV URL integration functions
 * 
 * @module csv-url
 */

/**
 * Fetches data from CSV URL via the fetch-csv-url edge function
 * 
 * This function calls the fetch-csv-url edge function to retrieve data
 * from a CSV file hosted online. It handles CORS and CSV parsing.
 * 
 * @param {string} supabaseUrl - Supabase project URL
 * @param {string} supabaseAnonKey - Anonymous key for authenticating the edge function call
 * @param {string} csvUrl - URL to the CSV file
 * 
 * @returns {Promise<any[][]>} Array of rows, where each row is an array of cell values
 * 
 * @throws {Error} If the edge function call fails
 * @throws {Error} If no data is found in the CSV file
 * 
 * @example
 * const data = await fetchCSVUrlData(
 *   'https://project.supabase.co',
 *   'anon-key',
 *   'https://example.com/data.csv'
 * );
 * // Returns: [['Header1', 'Header2'], ['Value1', 'Value2'], ...]
 */
export const fetchCSVUrlData = async (
  supabaseUrl: string,
  supabaseAnonKey: string,
  csvUrl: string
): Promise<any[][]> => {
  console.log(`[RESYNC] Fetching CSV URL data:`, { csvUrl });
  
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
    let errorMessage = 'Failed to fetch CSV URL data';
    try {
      const error = JSON.parse(errorText);
      errorMessage = error.error || errorMessage;
    } catch {
      errorMessage = errorText || errorMessage;
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  
  // Check if edge function returned an error in the response body
  if (data?.error) {
    console.error('[RESYNC] Edge function returned error:', data.error);
    throw new Error(`CSV URL error: ${data.error}`);
  }

  // Check if we have data
  if (!data?.values || data.values.length === 0) {
    console.warn('[RESYNC] No data found in CSV:', { csvUrl });
    throw new Error(`No data found in the CSV file`);
  }

  console.log(`[RESYNC] Successfully fetched ${data.values.length} rows from CSV URL`);
  return data.values;
};

