/**
 * Types for get-slide-report-display-data edge function request and response.
 * Keeps frontend and backend contract in sync.
 */

import type { MetricData, MonthlyDataPoint } from './slideView';

export type ChartTimeRangeApi = 'this_year' | 'last_12_months' | 'last_6_months' | 'last_3_months';

export interface GetSlideReportDisplayDataRequest {
  slide_report_id: string;
  filter_values?: Record<string, Record<string, string[]>>;
  selected_year: string;
  selected_month: string;
  /** When set, monthly_data is returned for this chart range (so the Revenue chart has correct data). */
  chart_time_range?: ChartTimeRangeApi | null;
  group_by_dimension_id?: string | null;
  breakdown_by_dimension_id?: string | null;
  /** When set, breakdown uses only this channel's data (e.g. Metasearch tab = single-hotel scope). */
  breakdown_channel?: 'metasearch' | 'sem' | 'social' | null;
  channels?: ('metasearch' | 'sem' | 'social')[];
  comparison_type?: 'none' | 'previous_period' | 'previous_year';
}

export interface DisplayDataBreakdownRow {
  name: string;
  impressions: number;
  clicks: number;
  cost: number;
  revenue: number;
  bookings: number;
  cpc?: number;
  roas?: number;
  costOfSale?: number;
  [k: string]: unknown;
}

export interface MonthlyChannelMetricsPoint {
  year: number;
  month: string;
  metasearch: { cost: number; revenue: number };
  sem: { cost: number; revenue: number };
  social: { cost: number; revenue: number };
}

export interface GetSlideReportDisplayDataResponse {
  channel_totals: Record<string, MetricData & { cpc?: number; roas?: number; costOfSale?: number }>;
  monthly_data: MonthlyDataPoint[];
  monthly_channel_metrics?: MonthlyChannelMetricsPoint[];
  breakdowns?: {
    groupBy: string;
    rows: DisplayDataBreakdownRow[];
    expanded?: Record<string, DisplayDataBreakdownRow[]>;
  };
  /** Period the breakdowns/channel_totals apply to (match to selectedYear/selectedMonth to avoid stale breakdown). selected_month is 1-12. */
  selected_year?: string;
  selected_month?: number;
  comparison_totals?: Record<string, MetricData & { cpc?: number; roas?: number; costOfSale?: number }> | null;
  has_filters: boolean;
  channels_with_filters: string[];
  /** Source currency per channel (from data_sources.currency). Used for conversion to display currency. */
  channel_source_currency?: Record<string, string>;
}
