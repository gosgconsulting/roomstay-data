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
const fetchGoogleSheetsData = async (
  spreadsheetId: string,
  tabName: string,
  range: string
): Promise<any[][]> => {
  // Validate inputs before making the request
  if (!spreadsheetId || typeof spreadsheetId !== 'string' || spreadsheetId.trim() === '') {
    const errorMsg = `Spreadsheet ID is required and must be a non-empty string. Received: ${JSON.stringify(spreadsheetId)}`;
    console.error('[DATA-SOURCE] Validation error:', errorMsg);
    throw new Error(errorMsg);
  }
  
  if (!tabName || typeof tabName !== 'string' || tabName.trim() === '') {
    const errorMsg = `Tab name is required and must be a non-empty string. Received: ${JSON.stringify(tabName)}`;
    console.error('[DATA-SOURCE] Validation error:', errorMsg);
    throw new Error(errorMsg);
  }
  
  if (!range || typeof range !== 'string' || range.trim() === '') {
    const errorMsg = `Range is required and must be a non-empty string. Received: ${JSON.stringify(range)}`;
    console.error('[DATA-SOURCE] Validation error:', errorMsg);
    throw new Error(errorMsg);
  }
  
  const requestBody = {
    spreadsheetId: spreadsheetId.trim(),
    tabName: tabName.trim(),
    range: range.trim(),
  };
  
  console.log(`[DATA-SOURCE] Fetching Google Sheets data:`, requestBody);
  
  const { data: sheetsData, error: sheetsError } = await supabase.functions.invoke('fetch-google-sheets', {
    body: requestBody,
  });
  
  // Log full response for debugging
  if (sheetsError || sheetsData?.error) {
    console.log(`[DATA-SOURCE] Request body sent:`, requestBody);
    console.log(`[DATA-SOURCE] Response data:`, sheetsData);
    console.log(`[DATA-SOURCE] Response error:`, sheetsError);
  }

  // Check for invocation error or error in response body
  if (sheetsError) {
    console.error('[DATA-SOURCE] Edge function invocation error:', sheetsError);
    console.error('[DATA-SOURCE] Error context:', sheetsError.context);
    console.error('[DATA-SOURCE] Response data (if any):', sheetsData);
    
    // Try to extract error details from multiple sources
    let errorMessage = sheetsError.message || 'Unknown error';
    let errorDetails: string[] = [];
    
    // Check if error details are in the error object
    if (sheetsError.context) {
      errorDetails.push(`Context: ${JSON.stringify(sheetsError.context)}`);
    }
    
    // Also check if error details are in the data (when edge function returns 400 with JSON body)
    // Supabase might still parse the response body into data even with an error
    if (sheetsData) {
      if (sheetsData.error) {
        errorMessage = typeof sheetsData.error === 'string' 
          ? sheetsData.error 
          : (sheetsData.error as any)?.message || errorMessage;
      }
      if (sheetsData.details) {
        errorDetails.push(`Details: ${JSON.stringify(sheetsData.details)}`);
      }
      if (sheetsData.requestParams) {
        errorDetails.push(`Request params: ${JSON.stringify(sheetsData.requestParams)}`);
      }
    }
    
    // Build comprehensive error message
    const fullError = errorDetails.length > 0 
      ? `${errorMessage} (${errorDetails.join(', ')})`
      : errorMessage;
    
    throw new Error(`Failed to fetch Google Sheets data: ${fullError}`);
  }

  // Check if edge function returned an error in the response body (even with 200 status)
  if (sheetsData?.error) {
    console.error('[DATA-SOURCE] Edge function returned error:', sheetsData.error);
    const errorDetails = sheetsData.details ? ` Details: ${JSON.stringify(sheetsData.details)}` : '';
    const requestParams = sheetsData.requestParams ? ` Request params: ${JSON.stringify(sheetsData.requestParams)}` : '';
    throw new Error(`Google Sheets error: ${sheetsData.error}${errorDetails}${requestParams}`);
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
const fetchGoogleSheetsHeaders = async (
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
  // Validate inputs
  if (!spreadsheetId || typeof spreadsheetId !== 'string' || spreadsheetId.trim() === '') {
    throw new Error('Spreadsheet ID is required and must be a non-empty string');
  }
  
  if (!tabName || typeof tabName !== 'string' || tabName.trim() === '') {
    throw new Error('Tab name is required and must be a non-empty string');
  }
  
  if (!headerRow || headerRow < 1) {
    throw new Error('Header row must be a positive integer');
  }
  
  const dataStartRow = headerRow + 1;
  const dataRange = `A${dataStartRow}:Z`;
  
  // Fetch headers
  const headers = await fetchGoogleSheetsHeaders(spreadsheetId.trim(), tabName.trim(), headerRow);
  
  // Fetch data rows
  let dataRows: any[][] = [];
  
  try {
    // Try to fetch all data at once
    const allData = await fetchGoogleSheetsData(spreadsheetId.trim(), tabName.trim(), dataRange);
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
        const chunkData = await fetchGoogleSheetsData(spreadsheetId.trim(), tabName.trim(), chunkRange);
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
