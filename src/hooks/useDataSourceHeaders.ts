import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { extractSpreadsheetId } from '@/lib/sync-utils';

interface DataSource {
  id: string;
  name: string;
  google_sheets_url?: string | null;
  spreadsheet_id?: string | null;
  tab_name?: string | null;
  csv_url?: string | null;
  source_type?: 'google_sheets' | 'csv_url';
  header_row: number;
  column_mappings: any[] | null;
}

interface HeadersData {
  headers: string[];
  sampleDataRows: any[][];
}

/**
 * Custom hook to fetch headers and sample data for a data source
 */
export function useDataSourceHeaders(dataSource: DataSource | null, enabled: boolean = true) {
  const [data, setData] = useState<HeadersData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled || !dataSource) {
      return;
    }

    const fetchHeaders = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const sourceType = dataSource.source_type || 'google_sheets';

        if (sourceType === 'csv_url') {
          // Fetch CSV data
          if (!dataSource.csv_url) {
            throw new Error('CSV URL is missing');
          }

          const { data: csvData, error: csvError } = await supabase.functions.invoke('fetch-csv-url', {
            body: {
              csvUrl: dataSource.csv_url,
            },
          });

          if (csvError) throw csvError;

          if (!csvData?.values || csvData.values.length === 0) {
            throw new Error("No data found in the CSV file");
          }

          const headerRowNum = dataSource.header_row || 1;
          if (headerRowNum < 1 || headerRowNum > csvData.values.length) {
            throw new Error(`Header row ${headerRowNum} is out of range. CSV has ${csvData.values.length} rows.`);
          }

          const headers = csvData.values[headerRowNum - 1] || [];
          const sampleRows = csvData.values.slice(headerRowNum, headerRowNum + 5); // Get next 5 rows as samples

          setData({
            headers: headers.map((h: any) => h === null || h === undefined ? '' : String(h).trim()),
            sampleDataRows: sampleRows
          });
        } else {
          // Google Sheets flow
          if (!dataSource.spreadsheet_id && !dataSource.google_sheets_url) {
            throw new Error('Spreadsheet ID or URL is missing');
          }

          const spreadsheetId = dataSource.spreadsheet_id || extractSpreadsheetId(dataSource.google_sheets_url || '');
          if (!spreadsheetId) {
            throw new Error('Invalid Google Sheets URL');
          }

          if (!dataSource.tab_name) {
            throw new Error('Tab name is missing');
          }

          // Use A1 notation for header row
          // Fetch header row + sample data rows (up to 100 rows for samples)
          const headerRowNum = dataSource.header_row || 1;
          const sampleRange = `${headerRowNum}:${headerRowNum + 100}`;
          
          const { data: sheetsData, error: sheetsError } = await supabase.functions.invoke('fetch-google-sheets', {
            body: {
              spreadsheetId,
              tabName: dataSource.tab_name,
              range: sampleRange,
            },
          });

          if (sheetsError) throw sheetsError;

          if (!sheetsData?.values || sheetsData.values.length === 0) {
            throw new Error("No data found in the specified range");
          }

          const headers = sheetsData.values[0] || [];
          const sampleRows = sheetsData.values.slice(1, 6); // Get first 5 data rows as samples

          setData({
            headers: headers.map((h: any) => h === null || h === undefined ? '' : String(h).trim()),
            sampleDataRows: sampleRows
          });
        }
      } catch (err) {
        console.error('Error fetching headers:', err);
        setError(err instanceof Error ? err : new Error(String(err)));
      } finally {
        setIsLoading(false);
      }
    };

    fetchHeaders();
  }, [dataSource, enabled]);

  const refetch = async () => {
    if (!dataSource) return;
    
    setIsLoading(true);
    setError(null);

    try {
      const sourceType = dataSource.source_type || 'google_sheets';

      if (sourceType === 'csv_url') {
        // Fetch CSV data
        if (!dataSource.csv_url) {
          throw new Error('CSV URL is missing');
        }

        const { data: csvData, error: csvError } = await supabase.functions.invoke('fetch-csv-url', {
          body: {
            csvUrl: dataSource.csv_url,
          },
        });

        if (csvError) throw csvError;

        if (!csvData?.values || csvData.values.length === 0) {
          throw new Error("No data found in the CSV file");
        }

        const headerRowNum = dataSource.header_row || 1;
        if (headerRowNum < 1 || headerRowNum > csvData.values.length) {
          throw new Error(`Header row ${headerRowNum} is out of range. CSV has ${csvData.values.length} rows.`);
        }

        const headers = csvData.values[headerRowNum - 1] || [];
        const sampleRows = csvData.values.slice(headerRowNum, headerRowNum + 5); // Get next 5 rows as samples

        setData({
          headers: headers.map((h: any) => h === null || h === undefined ? '' : String(h).trim()),
          sampleDataRows: sampleRows
        });
      } else {
        // Google Sheets flow
        if (!dataSource.spreadsheet_id && !dataSource.google_sheets_url) {
          throw new Error('Spreadsheet ID or URL is missing');
        }

        const spreadsheetId = dataSource.spreadsheet_id || extractSpreadsheetId(dataSource.google_sheets_url || '');
        if (!spreadsheetId) {
          throw new Error('Invalid Google Sheets URL');
        }

        if (!dataSource.tab_name) {
          throw new Error('Tab name is missing');
        }

        // Use A1 notation for header row
        // Fetch header row + sample data rows (up to 100 rows for samples)
        const headerRowNum = dataSource.header_row || 1;
        const sampleRange = `${headerRowNum}:${headerRowNum + 100}`;
        
        const { data: sheetsData, error: sheetsError } = await supabase.functions.invoke('fetch-google-sheets', {
          body: {
            spreadsheetId,
            tabName: dataSource.tab_name,
            range: sampleRange,
          },
        });

        if (sheetsError) throw sheetsError;

        if (!sheetsData?.values || sheetsData.values.length === 0) {
          throw new Error("No data found in the specified range");
        }

        const headers = sheetsData.values[0] || [];
        const sampleRows = sheetsData.values.slice(1, 6); // Get first 5 data rows as samples

        setData({
          headers: headers.map((h: any) => h === null || h === undefined ? '' : String(h).trim()),
          sampleDataRows: sampleRows
        });
      }
    } catch (err) {
      console.error('Error refetching headers:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  return { data, isLoading, error, refetch };
}