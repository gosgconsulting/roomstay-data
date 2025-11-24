/**
 * Types related to dimensions and metrics
 */

/**
 * Condition for filtering dimension data
 */
export interface DimensionCondition {
  dimension_id: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'not_contains';
  value: string;
}

/**
 * Formula-condition pair for multiple formulas within a dimension
 */
export interface FormulaConditionPair {
  id: string;
  formula: string;
  conditions: DimensionCondition[];
}

/**
 * Base dimension interface
 */
export interface Dimension {
  id: string;
  name: string;
  type: 'text' | 'date' | 'number' | 'currency' | 'percentage' | 'vlookup';
  user_id?: string;
  formula?: string | null; // Keep for backward compatibility
  is_system?: boolean;
  scope?: 'global' | 'custom' | 'account';
  report_id?: string | null;
  account_id?: string | null;
  conditions?: DimensionCondition[]; // Keep for backward compatibility
  formula_condition_pairs?: FormulaConditionPair[]; // New field for multiple formulas
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