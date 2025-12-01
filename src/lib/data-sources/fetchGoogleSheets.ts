/**
 * Functions for fetching data from Google Sheets
 */

import { supabase } from "@/integrations/supabase/client";

/**
 * Extract spreadsheet ID from Google Sheets URL
 */
export const extractSpreadsheetId = (url: string): string | null => {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
};

/**
 * Fetch data from Google Sheets
 */
export const fetchGoogleSheetsData = async (
  spreadsheetId: string,
  tabName: string,
  range: string
): Promise<any[][]> => {
  console.log(`[DATA-SOURCE] Fetching Google Sheets data:`, { spreadsheetId, tabName, range });
  
  const { data: sheetsData, error: sheetsError } = await supabase.functions.invoke('fetch-google-sheets', {
    body: {
      spreadsheetId,
      tabName,
      range,
    },
  });

  if (sheetsError) {
    console.error('[DATA-SOURCE] Edge function invocation error:', sheetsError);
    throw new Error(`Failed to fetch Google Sheets data: ${sheetsError.message || JSON.stringify(sheetsError)}`);
  }

  if (sheetsData?.error) {
    console.error('[DATA-SOURCE] Edge function returned error:', sheetsData.error);
    throw new Error(`Google Sheets error: ${sheetsData.error}`);
  }

  if (!sheetsData?.values || sheetsData.values.length === 0) {
    console.warn('[DATA-SOURCE] No data found in range:', { spreadsheetId, tabName, range });
    throw new Error(`No data found in the specified range: ${tabName}!${range}`);
  }

  console.log(`[DATA-SOURCE] Successfully fetched ${sheetsData.values.length} rows from Google Sheets`);
  return sheetsData.values;
};

/**
 * Fetch headers only from Google Sheets
 */
export const fetchGoogleSheetsHeaders = async (
  spreadsheetId: string,
  tabName: string,
  headerRow: number
): Promise<string[]> => {
  const headerRange = `A${headerRow}:Z${headerRow}`;
  const headerData = await fetchGoogleSheetsData(spreadsheetId, tabName, headerRange);
  
  if (!headerData || headerData.length === 0) {
    throw new Error('No header row found');
  }

  return headerData[0].map((h: any) => 
    h === null || h === undefined ? '' : String(h).trim()
  );
};

/**
 * Fetch all data from Google Sheets (headers + data rows)
 */
export const fetchGoogleSheetsAllData = async (
  spreadsheetId: string,
  tabName: string,
  headerRow: number
): Promise<{ headers: string[]; dataRows: any[][] }> => {
  const dataStartRow = headerRow + 1;
  const dataRange = `A${dataStartRow}:Z`;
  
  // Fetch headers
  const headers = await fetchGoogleSheetsHeaders(spreadsheetId, tabName, headerRow);
  
  // Fetch data rows
  let dataRows: any[][] = [];
  
  try {
    // Try to fetch all data at once
    const allData = await fetchGoogleSheetsData(spreadsheetId, tabName, dataRange);
    dataRows = allData;
  } catch (error) {
    // If single fetch fails, try chunked approach for large datasets
    console.warn('[DATA-SOURCE] Single fetch failed, using chunked approach:', error);
    const SHEET_CHUNK_SIZE = 25000;
    let startRow = dataStartRow;
    let hasMoreData = true;
    
    while (hasMoreData) {
      const endRow = startRow + SHEET_CHUNK_SIZE - 1;
      const chunkRange = `A${startRow}:Z${endRow}`;
      
      try {
        const chunkData = await fetchGoogleSheetsData(spreadsheetId, tabName, chunkRange);
        if (chunkData && chunkData.length > 0) {
          dataRows = [...dataRows, ...chunkData];
          if (chunkData.length < SHEET_CHUNK_SIZE) {
            hasMoreData = false;
          } else {
            startRow = endRow + 1;
          }
        } else {
          hasMoreData = false;
        }
      } catch (chunkError) {
        console.error('[DATA-SOURCE] Error fetching chunk:', chunkError);
        hasMoreData = false;
      }
    }
  }
  
  return { headers, dataRows };
};
