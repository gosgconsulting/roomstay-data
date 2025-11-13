import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { QueryFunction } from "@tanstack/react-query";

interface FetchCSVHeadersParams {
  csvUrl: string;
  headerRow: number;
}

interface FetchGoogleSheetsHeadersParams {
  spreadsheetId: string;
  tabName?: string;
  headerRow: number;
}

interface HeadersResult {
  headers: string[];
  sampleDataRows: any[][];
}

/**
 * Query function to fetch CSV headers and sample data
 */
const fetchCSVHeaders: QueryFunction<
  HeadersResult,
  readonly ["data-source-headers", "csv", string, number]
> = async ({ queryKey }) => {
  const [, , csvUrl, headerRow] = queryKey;

  if (!csvUrl || csvUrl.trim() === "") {
    throw new Error("CSV URL is missing. Please edit the data source settings first.");
  }

  const { data: csvData, error: csvError } = await supabase.functions.invoke("fetch-csv-url", {
    body: {
      csvUrl,
    },
  });

  if (csvError) throw csvError;

  if (!csvData?.values || csvData.values.length === 0) {
    throw new Error("No data found in CSV file");
  }

  // Extract headers based on header_row (1-indexed)
  const headerRowIndex = (headerRow || 1) - 1;
  const headers = csvData.values[headerRowIndex] || [];

  // Get sample rows (next 5 rows after header)
  const sampleRows = csvData.values.slice(headerRowIndex + 1, headerRowIndex + 6);

  return {
    headers,
    sampleDataRows: sampleRows,
  };
};

/**
 * Query function to fetch Google Sheets headers and sample data
 */
const fetchGoogleSheetsHeaders: QueryFunction<
  HeadersResult,
  readonly ["data-source-headers", "google-sheets", string, string | undefined, number]
> = async ({ queryKey }) => {
  const [, , spreadsheetId, tabName, headerRow] = queryKey;

  if (!spreadsheetId || spreadsheetId.trim() === "") {
    throw new Error("Spreadsheet ID is missing. Please edit the data source settings first.");
  }

  const { data: sheetsData, error: sheetsError } = await supabase.functions.invoke(
    "fetch-google-sheets",
    {
      body: {
        spreadsheetId,
        tabName,
        range: `${headerRow}:${headerRow + 100}`,
      },
    }
  );

  if (sheetsError) throw sheetsError;

  if (!sheetsData?.values || sheetsData.values.length === 0) {
    throw new Error("No data found in the specified range");
  }

  const headers = sheetsData.values[0];
  const sampleRows = sheetsData.values.slice(1, 6);

  return {
    headers,
    sampleDataRows: sampleRows,
  };
};

/**
 * Hook to fetch data source headers using react-query
 */
export function useDataSourceHeaders(
  dataSource: {
    source_type?: "google_sheets" | "csv_url";
    csv_url?: string;
    spreadsheet_id?: string;
    tab_name?: string;
    header_row: number;
  } | null,
  enabled: boolean = true
) {
  const sourceType = dataSource?.source_type || "google_sheets";

  // CSV URL query
  const csvQuery = useQuery({
    queryKey: ["data-source-headers", "csv", dataSource?.csv_url || "", dataSource?.header_row || 1],
    queryFn: fetchCSVHeaders,
    enabled:
      enabled &&
      !!dataSource &&
      sourceType === "csv_url" &&
      !!dataSource.csv_url &&
      dataSource.csv_url.trim() !== "",
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  // Google Sheets query
  const sheetsQuery = useQuery({
    queryKey: [
      "data-source-headers",
      "google-sheets",
      dataSource?.spreadsheet_id || "",
      dataSource?.tab_name,
      dataSource?.header_row || 1,
    ],
    queryFn: fetchGoogleSheetsHeaders,
    enabled:
      enabled &&
      !!dataSource &&
      sourceType === "google_sheets" &&
      !!dataSource.spreadsheet_id &&
      dataSource.spreadsheet_id.trim() !== "",
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  // Return the appropriate query based on source type
  return sourceType === "csv_url" ? csvQuery : sheetsQuery;
}

