/**
 * Utility functions for calculating metrics from channel totals
 */

import { calculateDerivedMetrics } from './slideViewHelpers';
import type { MetricData, DerivedMetrics } from '@/types/slideView';

export interface ChannelMetrics {
  metasearch: MetricData;
  sem: MetricData;
  social: MetricData;
}

/**
 * Aggregate metrics across all channels
 */
export function aggregateChannelTotals(
  channelTotals: ChannelMetrics
): MetricData {
  return {
    impressions:
      (channelTotals.metasearch?.impressions || 0) +
      (channelTotals.sem?.impressions || 0) +
      (channelTotals.social?.impressions || 0),
    clicks:
      (channelTotals.metasearch?.clicks || 0) +
      (channelTotals.sem?.clicks || 0) +
      (channelTotals.social?.clicks || 0),
    cost:
      (channelTotals.metasearch?.cost || 0) +
      (channelTotals.sem?.cost || 0) +
      (channelTotals.social?.cost || 0),
    revenue:
      (channelTotals.metasearch?.revenue || 0) +
      (channelTotals.sem?.revenue || 0) +
      (channelTotals.social?.revenue || 0),
    bookings:
      (channelTotals.metasearch?.bookings || 0) +
      (channelTotals.sem?.bookings || 0) +
      (channelTotals.social?.bookings || 0),
  };
}

/**
 * Calculate overview metrics from channel totals
 * Returns derived metrics (CTR, conversion rate, CPC, ROAS, cost of sale)
 */
export function calculateOverviewMetrics(
  channelTotals: ChannelMetrics
): DerivedMetrics {
  const overview = aggregateChannelTotals(channelTotals);
  return calculateDerivedMetrics(overview);
}

/**
 * Calculate comparison metrics from comparison channel totals
 */
export function calculateComparisonMetrics(
  comparisonTotals: ChannelMetrics | null,
  comparisonType: 'none' | 'previous_period' | 'previous_year'
): (DerivedMetrics & { label: string }) | null {
  if (!comparisonTotals || comparisonType === 'none') {
    return null;
  }

  const overview = aggregateChannelTotals(comparisonTotals);
  const derived = calculateDerivedMetrics(overview);

  if (comparisonType === 'previous_period') {
    return {
      ...derived,
      label: 'vs Previous Period',
    };
  } else if (comparisonType === 'previous_year') {
    return {
      ...derived,
      label: 'vs Previous Year',
    };
  }

  return null;
}

/**
 * Calculate channel-specific comparison metrics
 */
export function calculateChannelComparisonMetrics(
  channel: 'metasearch' | 'sem' | 'social',
  comparisonTotals: ChannelMetrics | null,
  comparisonType: 'none' | 'previous_period' | 'previous_year'
): (DerivedMetrics & { label: string }) | null {
  if (!comparisonTotals || comparisonType === 'none') {
    return null;
  }

  const channelComparisonData = comparisonTotals[channel];
  if (!channelComparisonData) {
    return null;
  }

  const derived = calculateDerivedMetrics(channelComparisonData);

  if (comparisonType === 'previous_period') {
    return {
      ...derived,
      label: 'vs Previous Period',
    };
  } else if (comparisonType === 'previous_year') {
    return {
      ...derived,
      label: 'vs Previous Year',
    };
  }

  return null;
}

/**
 * Calculate report breakdown data from channel totals
 */
export function calculateReportBreakdown(
  channelTotals: ChannelMetrics
): Array<{ report: string } & DerivedMetrics> {
  return [
    {
      report: 'Metasearch',
      ...calculateDerivedMetrics(
        channelTotals.metasearch || {
          impressions: 0,
          clicks: 0,
          cost: 0,
          revenue: 0,
          bookings: 0,
        }
      ),
    },
    {
      report: 'SEM',
      ...calculateDerivedMetrics(
        channelTotals.sem || {
          impressions: 0,
          clicks: 0,
          cost: 0,
          revenue: 0,
          bookings: 0,
        }
      ),
    },
    {
      report: 'Social',
      ...calculateDerivedMetrics(
        channelTotals.social || {
          impressions: 0,
          clicks: 0,
          cost: 0,
          revenue: 0,
          bookings: 0,
        }
      ),
    },
  ];
}

/**
 * Calculate report total from channel totals
 */
export function calculateReportTotal(
  channelTotals: ChannelMetrics
): { report: string } & DerivedMetrics {
  const totalData = aggregateChannelTotals(channelTotals);
  return {
    report: 'Total',
    ...calculateDerivedMetrics(totalData),
  };
}
