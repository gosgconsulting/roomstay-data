/**
 * Types for Slide Reports feature
 * Stores pre-computed pivot table data for fast loading
 */

export interface SlideReportConfiguration {
  selectedChannels: ('metasearch' | 'sem' | 'social')[];
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

export interface SlideReportPivotData {
  overview: {
    current: ChannelMetrics;
    previous_period?: ChannelMetrics;
    previous_year?: ChannelMetrics;
  };
  channels: {
    [channel: string]: {
      current: ChannelMetrics;
      previous_period?: ChannelMetrics;
      previous_year?: ChannelMetrics;
      monthly: Record<string, ChannelMetrics>; // "2025-01", "2025-02", etc.
      breakdowns: {
        [dimensionName: string]: BreakdownRow[]; // e.g., "hotel", "link_type"
      };
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
