/**
 * Hook for calculating comparison metrics
 */

import { useMemo } from 'react';
import {
  calculateComparisonMetrics,
  calculateChannelComparisonMetrics,
  type ChannelMetrics,
} from '@/lib/metricsCalculations';
import type { DerivedMetrics } from '@/types/slideView';

/**
 * Calculate comparison metrics from comparison channel totals
 */
export function useComparisonMetrics(
  comparisonTotals: ChannelMetrics | null,
  comparisonType: 'none' | 'previous_period' | 'previous_year'
): (DerivedMetrics & { label: string }) | null {
  return useMemo(() => {
    return calculateComparisonMetrics(comparisonTotals, comparisonType);
  }, [comparisonTotals, comparisonType]);
}

/**
 * Calculate channel-specific comparison metrics
 */
export function useChannelComparisonMetrics(
  channel: 'metasearch' | 'sem' | 'social',
  comparisonTotals: ChannelMetrics | null,
  comparisonType: 'none' | 'previous_period' | 'previous_year'
): (DerivedMetrics & { label: string }) | null {
  return useMemo(() => {
    return calculateChannelComparisonMetrics(channel, comparisonTotals, comparisonType);
  }, [channel, comparisonTotals, comparisonType]);
}
