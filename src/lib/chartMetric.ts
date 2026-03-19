import { formatNumber } from '@/lib/slideViewHelpers';
import type { ChartMetric } from '@/types/slideView';

type ChartMetricFormat = 'number' | 'currency' | 'percent' | 'roas';

export const CHART_METRIC_OPTIONS: Array<{ value: ChartMetric; label: string }> = [
  { value: 'revenue', label: 'Revenue' },
  { value: 'impressions', label: 'Impressions' },
  { value: 'clicks', label: 'Clicks' },
  { value: 'cost', label: 'Cost' },
  { value: 'bookings', label: 'Bookings' },
  { value: 'ctr', label: 'CTR' },
  { value: 'conversionRate', label: 'Conversion Rate' },
  { value: 'cpc', label: 'CPC' },
  { value: 'aov', label: 'AOV' },
  { value: 'roas', label: 'ROAS' },
  { value: 'costOfSale', label: 'Cost of Sale' },
];

const CHART_METRIC_FORMATS: Record<ChartMetric, ChartMetricFormat> = {
  revenue: 'currency',
  impressions: 'number',
  clicks: 'number',
  cost: 'currency',
  bookings: 'number',
  ctr: 'percent',
  conversionRate: 'percent',
  cpc: 'currency',
  aov: 'currency',
  roas: 'roas',
  costOfSale: 'percent',
};

export function getChartMetricLabel(metric: ChartMetric): string {
  return CHART_METRIC_OPTIONS.find((option) => option.value === metric)?.label ?? 'Revenue';
}

export function formatChartMetricValue(
  value: number,
  metric: ChartMetric,
  displayCurrency?: 'AUD' | 'USD'
): string {
  const format = CHART_METRIC_FORMATS[metric];
  if (format === 'currency') {
    return formatNumber(value, 'currency', displayCurrency);
  }
  if (format === 'percent') {
    return `${value.toFixed(2)}%`;
  }
  if (format === 'roas') {
    return `${value.toFixed(2)}x`;
  }
  return formatNumber(value);
}
