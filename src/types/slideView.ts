/**
 * Type definitions for SlideViewPage component
 */

export interface RawDataRow {
  dimension_values: Record<string, unknown>;
  [key: string]: unknown;
}

export interface MetricData {
  impressions: number;
  clicks: number;
  cost: number;
  revenue: number;
  bookings: number;
}

export interface DerivedMetrics extends MetricData {
  ctr: number;
  conversionRate: number;
  cpc: number;
  aov: number;
  roas: number;
  costOfSale: number;
}


export interface MonthlyDataPoint {
  year: number;
  month: string;
  metasearch: number;
  sem: number;
  social: number;
}

export type ChartTimeRange =
  | 'this_month'
  | 'this_year'
  | 'last_12_months'
  | 'last_6_months'
  | 'last_3_months';

export type ChartGranularity = 'month' | 'week' | 'day';

export type ChartMetric =
  | 'revenue'
  | 'impressions'
  | 'clicks'
  | 'cost'
  | 'bookings'
  | 'ctr'
  | 'conversionRate'
  | 'cpc'
  | 'aov'
  | 'roas'
  | 'costOfSale';

export type ComparisonType = 'none' | 'previous_period' | 'previous_year';

export type SlideType = 'master-report' | 'brady' | 'default';
