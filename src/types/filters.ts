/**
 * Shared filter types used across the application.
 * Extracted from legacy FiltersBar component for reuse in PerformanceTable.
 */

export interface FilterState {
  dimensionFilters: Record<string, string[]>;
  dateRange?: { from: Date; to?: Date };
  datePreset?: string;
  compareEnabled?: boolean;
  compareType?: string;
  compareDateRange?: { from: Date; to?: Date };
}
