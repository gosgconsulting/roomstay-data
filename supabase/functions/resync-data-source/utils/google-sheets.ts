/**
 * Google Sheets integration functions
 * 
 * @module google-sheets
 */

/**
 * Fetches data from Google Sheets via the fetch-google-sheets edge function
 * 
 * This function calls the fetch-google-sheets edge function to retrieve data
 * from a Google Sheet. It handles large datasets by supporting range-based queries.
 * 
 * @param {string} supabaseUrl - Supabase project URL
 * @param {string} supabaseAnonKey - Anonymous key for authenticating the edge function call
 * @param {string} spreadsheetId - Google Sheets spreadsheet ID
 * @param {string} tabName - Name of the sheet/tab to fetch from
 * @param {string} range - A1 notation range (e.g., 'A1:Z100' or 'A1:Z')
 * 
 * @returns {Promise<any[][]>} Array of rows, where each row is an array of cell values
 * 
 * @throws {Error} If the edge function call fails
 * @throws {Error} If no data is found in the specified range
 * 
 * @example
 * const data = await fetchGoogleSheetsData(
 *   'https://project.supabase.co',
 *   'anon-key',
 *   'spreadsheet-id',
 *   'Sheet1',
 *   'A1:Z100'
 * );
 * // Returns: [['Header1', 'Header2'], ['Value1', 'Value2'], ...]
 */
export const fetchGoogleSheetsData = async (
  supabaseUrl: string,
  supabaseAnonKey: string,
  spreadsheetId: string,
  tabName: string,
  range: string
): Promise<any[][]> => {
  console.log(`[RESYNC] Fetching Google Sheets data:`, { spreadsheetId, tabName, range });
  
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
    let errorMessage = 'Failed to fetch Google Sheets data';
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
    throw new Error(`Google Sheets error: ${data.error}`);
  }

  // Check if we have data
  if (!data?.values || data.values.length === 0) {
    console.warn('[RESYNC] No data found in range:', { spreadsheetId, tabName, range });
    throw new Error(`No data found in the specified range: ${tabName}!${range}`);
  }

  console.log(`[RESYNC] Successfully fetched ${data.values.length} rows from Google Sheets`);
  return data.values;
};

