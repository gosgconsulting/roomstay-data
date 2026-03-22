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
  type: 'text' | 'date' | 'number' | 'currency' | 'percentage';
  user_id?: string;
  formula?: string | null; // Keep for backward compatibility
  is_system?: boolean;
  scope?: 'global' | 'custom' | 'account';
  report_id?: string | null;
  account_id?: string | null;
  conditions?: DimensionCondition[]; // Keep for backward compatibility
  formula_condition_pairs?: FormulaConditionPair[]; // New field for multiple formulas
}

