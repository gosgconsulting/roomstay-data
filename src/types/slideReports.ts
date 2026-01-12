/**
 * Types for Slide Reports feature
 * Stores pre-computed pivot table data for fast loading
 */

export interface SlideReportConfiguration {
  selectedChannels: ('metasearch' | 'sem' | 'social')[];
  selectedValueDimensionIds?: string[]; // Value dimensions (metrics) that apply to all channels
  channelConfigs: {
    [channel: string]: {
      dimensionId: string | null;
      selectedValues: string[];
    };
  };
  breakdownConfigs: {
    [channel: string]: {
      breakdownDimensionIds: string[];
    };
  };
  filterConfigs: {
    [channel: string]: {
      filterDimensionIds: string[];
    };
  };
}

export interface ChannelMetrics {
  impressions: number;
  clicks: number;
  cost: number;
  revenue: number;
  bookings: number;
  ctr: number;
  conversionRate: number;
  cpc: number;
  roas: number;
  costOfSale: number;
}

export interface BreakdownRow {
  [dimensionValue: string]: any; // e.g., { hotel: "Brady Hotels Central Melbourne", impressions: 11271, ... }
  impressions: number;
  clicks: number;
  cost: number;
  revenue: number;
  bookings: number;
}

export interface MonthlyBudgetRow {
  month: string;
  metasearchBudget: number;
  semBudget: number;
  socialBudget: number;
  metasearchActual: number;
  semActual: number;
  socialActual: number;
}

// Raw data row from dimension_data - stores all dimension values per row
export interface RawDataRow {
  [dimensionId: string]: any; // e.g., { "dim-uuid-hotel": "Brady Hotels", "dim-uuid-date": "2026-01-01", ... }
}

export interface SlideReportPivotData {
  overview: {
    current: ChannelMetrics;
    previous_period?: ChannelMetrics;
    previous_year?: ChannelMetrics;
    monthly?: Record<string, ChannelMetrics>; // "2025-01", "2025-02", etc. - aggregated across all channels
    yearly?: Record<string, ChannelMetrics>; // "2024", "2025", "2026" - aggregated for each year
  };
  channels: {
    [channel: string]: {
      current: ChannelMetrics;
      previous_period?: ChannelMetrics;
      previous_year?: ChannelMetrics;
      monthly: Record<string, ChannelMetrics>; // "2025-01", "2025-02", etc.
      yearly?: Record<string, ChannelMetrics>; // "2024", "2025", "2026" - totals per year
      breakdowns: {
        [dimensionName: string]: BreakdownRow[]; // All-time breakdown data
      };
      monthlyBreakdowns?: {
        [monthKey: string]: { // "2024-01", "2024-02", etc.
          [dimensionName: string]: BreakdownRow[];
        };
      };
      // Pre-computed unique values for filter dimensions (so we don't have to load from data source)
      filterUniqueValues?: {
        [dimensionId: string]: {
          name: string; // Dimension name for display
          values: string[]; // Sorted unique values
        };
      };
      // ALL raw data rows for this channel - enables filtering without re-querying database
      // Stored per month for efficient loading
      rawDataRows?: RawDataRow[];
      // Dimension ID to name mapping for interpreting rawDataRows
      dimensionMap?: Record<string, string>; // dimensionId -> dimensionName
    };
  };
  budget: {
    monthly: MonthlyBudgetRow[];
    totals: {
      totalBudget: number;
      totalActual: number;
      variance: number;
    };
  };
  // Timestamp when data was last computed
  computedAt?: string;
}

export interface SlideReportDateRange {
  year: number;
  month: string;
  from: string; // ISO date string
  to: string; // ISO date string
}

export interface SlideReport {
  id: string;
  account_id: string;
  user_id: string;
  name: string;
  configuration: SlideReportConfiguration;
  report_ids: Record<string, string>; // channel -> report_id mapping
  pivot_data: SlideReportPivotData;
  date_range: SlideReportDateRange | null;
  created_at: string;
  updated_at: string;
  last_refreshed_at: string | null;
  description: string | null;
  is_active: boolean;
}
