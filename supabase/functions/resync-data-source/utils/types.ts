/**
 * Type definitions for the resync-data-source edge function
 * 
 * @module types
 */

/**
 * Data source configuration interface
 * 
 * @interface DataSource
 * @property {string} id - Unique identifier for the data source
 * @property {string} name - Display name of the data source
 * @property {string} google_sheets_url - Full URL to the Google Sheets document
 * @property {string} spreadsheet_id - Extracted spreadsheet ID from the URL
 * @property {string} tab_name - Name of the sheet/tab to sync
 * @property {number} header_row - Row number where headers are located (1-based)
 * @property {ColumnMapping[] | null} column_mappings - Array of column mapping configurations
 * @property {string} [report_id] - Optional report ID this data source belongs to
 * @property {string} [sync_frequency] - Sync frequency: 'manual' | 'daily' | 'weekly' | 'monthly'
 * @property {string} [sync_time] - Time to sync (HH:mm format)
 * @property {string} [sync_timezone] - Timezone for sync time (e.g., 'Asia/Singapore')
 */
export interface DataSource {
  id: string;
  name: string;
  google_sheets_url?: string | null;
  spreadsheet_id?: string | null;
  tab_name?: string | null;
  csv_url?: string | null;
  source_type?: 'google_sheets' | 'csv_url';
  header_row: number;
  column_mappings: ColumnMapping[] | null;
  report_id?: string;
  account_id?: string;
  sync_frequency?: string;
  sync_time?: string;
  sync_timezone?: string;
}

/**
 * Column mapping configuration
 * 
 * @interface ColumnMapping
 * @property {string} column - Column name from the Google Sheet
 * @property {string | null} [dimensionId] - Legacy dimension ID (for backward compatibility)
 * @property {string | null} [dimensionName] - Dimension name (stable identifier across accounts)
 * @property {boolean} visible - Whether this column should be included in the sync
 * @property {string} [newDimensionName] - Name for a new dimension to create
 * @property {string} [newDimensionType] - Type for the new dimension: 'text' | 'number' | 'currency' | 'percentage' | 'date'
 * @property {string} [dateFormat] - Date format if type is 'date': 'auto-detect' | 'yyyy-mm-dd' | 'mm-dd-yyyy' | 'dd-mm-yyyy'
 * @property {string} [dimensionType] - Type of the dimension
 */
export interface ColumnMapping {
  column: string;
  dimensionId?: string | null;
  dimensionName?: string | null;
  visible: boolean;
  newDimensionName?: string;
  newDimensionType?: string;
  dateFormat?: string;
  dimensionType?: string;
}

/**
 * Request body for the resync-data-source edge function
 * 
 * @interface RequestBody
 * @property {string} dataSourceId - (Required) UUID of the data source to resync
 * @property {object} [updates] - Optional updates to apply to the data source before resync
 * @property {string} [updates.name] - Update the data source name
 * @property {string} [updates.google_sheets_url] - Update the Google Sheets URL (must be valid)
 * @property {string} [updates.tab_name] - Update the tab/sheet name
 * @property {number} [updates.header_row] - Update the header row number (1-based)
 * @property {string} [updates.sync_frequency] - Update sync frequency
 * @property {string} [updates.sync_time] - Update sync time (HH:mm format)
 * @property {string} [updates.sync_timezone] - Update timezone
 */
export interface RequestBody {
  dataSourceId: string;
  /**
   * 'full'   — delete all existing rows and re-insert everything (default).
   * 'recent' — delete only the last 2 months of rows and re-insert only those rows.
   *            Older historical data is preserved.
   */
  refreshMode?: 'full' | 'recent';
  updates?: {
    name?: string;
    google_sheets_url?: string;
    tab_name?: string;
    header_row?: number;
    sync_frequency?: string;
    sync_time?: string;
    sync_timezone?: string;
  };
}

/**
 * Response body from the resync-data-source edge function
 * 
 * @interface ResponseBody
 * @property {boolean} success - Whether the resync completed successfully
 * @property {number} rowsProcessed - Number of rows processed from Google Sheets
 * @property {number} dimensionsCreated - Number of new dimensions created during the sync
 * @property {string} [error] - Error message if the resync failed
 * @property {boolean} [vlookupApplied] - Whether vlookup mappings were applied after resync
 * @property {number} [vlookupRowsUpdated] - Number of rows updated with vlookup mappings
 * @property {string} [vlookupError] - Error message if vlookup application failed
 */
export interface ResponseBody {
  success: boolean;
  rowsProcessed: number;
  dimensionsCreated: number;
  error?: string;
  vlookupApplied?: boolean;
  vlookupRowsUpdated?: number;
  vlookupError?: string;
}

