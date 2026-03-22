/**
 * Functions for fetching data from CSV URLs
 */

import { supabase } from "@/integrations/supabase/client";

/**
 * Fetch data from CSV URL
 */
const fetchCSVData = async (csvUrl: string): Promise<any[][]> => {
  console.log(`[DATA-SOURCE] Fetching CSV URL data:`, { csvUrl });
  
  const { data: csvData, error: csvError } = await supabase.functions.invoke('fetch-csv-url', {
    body: {
      csvUrl,
    },
  });

  if (csvError) {
    console.error('[DATA-SOURCE] Edge function invocation error:', csvError);
    throw new Error(`Failed to fetch CSV URL data: ${csvError.message || JSON.stringify(csvError)}`);
  }

  if (csvData?.error) {
    console.error('[DATA-SOURCE] Edge function returned error:', csvData.error);
    throw new Error(`CSV URL error: ${csvData.error}`);
  }

  if (!csvData?.values || csvData.values.length === 0) {
    console.warn('[DATA-SOURCE] No data found in CSV:', { csvUrl });
    throw new Error(`No data found in the CSV file`);
  }

  console.log(`[DATA-SOURCE] Successfully fetched ${csvData.values.length} rows from CSV URL`);
  return csvData.values;
};

/**
 * Fetch headers and data rows from CSV
 */
export const fetchCSVAllData = async (
  csvUrl: string,
  headerRow: number
): Promise<{ headers: string[]; dataRows: any[][] }> => {
  const csvData = await fetchCSVData(csvUrl);
  
  if (headerRow < 1 || headerRow > csvData.length) {
    throw new Error(`Header row ${headerRow} is out of range. CSV has ${csvData.length} rows.`);
  }
  
  const headers = csvData[headerRow - 1].map((h: any) => 
    h === null || h === undefined ? '' : String(h).trim()
  );
  
  const dataRows = csvData.slice(headerRow);
  
  return { headers, dataRows };
};
