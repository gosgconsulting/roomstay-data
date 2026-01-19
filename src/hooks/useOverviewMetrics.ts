/**
 * Hook for calculating overview metrics from channel totals
 */

import { useMemo } from 'react';
import { calculateOverviewMetrics, type ChannelMetrics } from '@/lib/metricsCalculations';
import type { DerivedMetrics } from '@/types/slideView';

/**
 * Calculate overview metrics from channel totals
 */
export function useOverviewMetrics(channelTotals: ChannelMetrics): DerivedMetrics {
  return useMemo(() => {
    return calculateOverviewMetrics(channelTotals);
  }, [channelTotals]);
}
