/**
 * Types related to dimensions and metrics
 */

/**
 * Base dimension interface
 */
export interface Dimension {
  id: string;
  name: string;
  type: 'text' | 'date' | 'number' | 'currency' | 'percentage' | 'vlookup';
  user_id?: string;
  formula?: string | null;
  is_system?: boolean;
  scope?: 'global' | 'custom' | 'account';
  report_id?: string | null;
  account_id?: string | null;
}

/**
 * Dimension with additional metadata for UI
 */
export interface DimensionWithMetadata extends Dimension {
  isVisible?: boolean;
  order?: number;
}

/**
 * KPI (Key Performance Indicator) interface
 */
export interface KPI {
  id: string;
  name: string;
  formula?: string;
  type: 'number' | 'currency' | 'percentage';
  isVisible?: boolean;
  order?: number;
}

/**
 * Available KPI names that can be calculated
 */
export const AVAILABLE_KPIS = [
  'Impressions',
  'Clicks', 
  'CTR',
  'Conversions',
  'Conversion rate',
  'CPC',
  'Cost',
  'Revenue',
  'ROAS',
  'Cost of sale'
] as const;

export type AvailableKPI = typeof AVAILABLE_KPIS[number];