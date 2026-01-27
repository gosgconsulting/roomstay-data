/**
 * Type definitions for refresh-slide-report edge function
 * Ported from src/types/slideReports.ts
 */

export interface SlideReportConfiguration {
  selectedChannels: ('metasearch' | 'sem' | 'social')[];
  selectedValueDimensionIds?: string[];
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
  parentReportId?: string;
  isChildReport?: boolean;
  childFilterSelections?: {
    metasearch: Record<string, string[]>;
    sem: Record<string, string[]>;
    social: Record<string, string[]>;
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
  [dimensionValue: string]: any;
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

export interface RawDataRow {
  [dimensionId: string]: any;
}

export interface SlideReportPivotData {
  overview: {
    current: ChannelMetrics;
    previous_period?: ChannelMetrics;
    previous_year?: ChannelMetrics;
    monthly?: Record<string, ChannelMetrics>;
    yearly?: Record<string, ChannelMetrics>;
  };
  channels: {
    [channel: string]: {
      current: ChannelMetrics;
      previous_period?: ChannelMetrics;
      previous_year?: ChannelMetrics;
      monthly: Record<string, ChannelMetrics>;
      yearly?: Record<string, ChannelMetrics>;
      breakdowns: {
        [dimensionName: string]: BreakdownRow[];
      };
      monthlyBreakdowns?: {
        [monthKey: string]: {
          [dimensionName: string]: BreakdownRow[];
        };
      };
      filterUniqueValues?: {
        [dimensionId: string]: {
          name: string;
          values: string[];
        };
      };
      rawDataRows?: RawDataRow[];
      dimensionMap?: Record<string, string>;
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
  computedAt?: string;
}

export interface SlideReportDateRange {
  year: number;
  month: string;
  from: string;
  to: string;
}

export interface MonthlyRecord {
  slide_report_id: string;
  account_id: string | null;
  year: number;
  month: number;
  channel: string;
  metrics: any;
  breakdowns: any;
  row_count: number;
  computed_at: string;
}

export interface AccountReportIds {
  metasearch: string | null;
  sem: string | null;
  social: string | null;
}
