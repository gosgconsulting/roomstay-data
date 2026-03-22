/**
 * Types for data source operations
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
  updated_at?: string;
  created_at?: string;
  last_synced_at?: string | null;
  sync_frequency?: string | null;
  sync_time?: string | null;
  sync_timezone?: string | null;
}

export interface ColumnMapping {
  column: string;
  dimensionId?: string | null;
  dimensionName?: string | null;
  visible: boolean;
  newDimensionName?: string;
  newDimensionType?: string;
  dateFormat?: string;
  dimensionType?: string;
  /** Whether this dimension should appear as a breakdown/group-by option in Data Studio */
  isBreakdown?: boolean;
}

export interface Dimension {
  id: string;
  name: string;
  type: string;
  formula?: string | null;
}

interface TransformedRow {
  id: string;
  name: string;
  level: number;
  parentId?: string;
  data: Record<string, any>;
  children?: TransformedRow[];
  compareData?: Record<string, any>;
  changeData?: Record<string, number>;
  originalDate?: string | Date;
  row_number: number;
  dimension_values: Record<string, any>;
}


export interface DimensionMappingResult {
  dimensionIdMap: Record<string, string>;
  columnIndexMap: Record<string, number>;
  createdCount: number;
}
