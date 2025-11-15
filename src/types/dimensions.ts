/**
 * Types related to dimensions and metrics
 */

/**
 * Base dimension interface
 */
export interface Dimension {
  id: string;
  name: string;
  type: string;
  user_id?: string;
  formula?: string | null;
  is_system?: boolean;
  scope?: 'global' | 'custom' | 'account';
}

/**
 * Extended interface for selected dimensions that includes granularity
 */
export interface SelectedDimension {
  id: string;
  granularity?: string;
  instanceId: string; // Unique ID for each instance of a dimension
  displayName?: string; // Custom display name for the dimension
}

/**
 * Date granularity options
 */
export type DateGranularity = 'none' | 'day' | 'week' | 'month' | 'year' | 'forecast' | 'forecast_historical';

/**
 * Dimension data from the API
 */
export interface DimensionData {
  id: string;
  user_id: string;
  dimension_values: Record<string, string>;
  created_at: string;
}