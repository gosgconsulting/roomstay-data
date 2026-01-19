/**
 * Hook for generating KPI cards
 */

import { useMemo, useCallback } from 'react';
import { Eye, MousePointer, Percent, ShoppingCart, DollarSign, TrendingUp } from 'lucide-react';
import { calculateDerivedMetrics } from '@/lib/slideViewHelpers';
import type { MetricData, DerivedMetrics } from '@/types/slideView';

export type KPICard = {
  label: string;
  key: string;
  value: number;
  icon: typeof Eye;
  color: string;
  format?: 'percent' | 'currency' | 'roas';
};

/**
 * Generate KPI cards from metrics
 */
export function useKPICards(metrics: DerivedMetrics): KPICard[] {
  return useMemo(() => {
    return [
      {
        label: 'IMPRESSIONS',
        key: 'impressions',
        value: metrics.impressions,
        icon: Eye,
        color: 'text-pink-600',
      },
      {
        label: 'CLICKS',
        key: 'clicks',
        value: metrics.clicks,
        icon: MousePointer,
        color: 'text-purple-600',
      },
      {
        label: 'CTR',
        key: 'ctr',
        value: metrics.ctr,
        icon: Percent,
        color: 'text-purple-600',
        format: 'percent',
      },
      {
        label: 'BOOKINGS',
        key: 'bookings',
        value: metrics.bookings,
        icon: ShoppingCart,
        color: 'text-orange-600',
      },
      {
        label: 'CONVERSION RATE',
        key: 'conversionRate',
        value: metrics.conversionRate,
        icon: Percent,
        color: 'text-purple-600',
        format: 'percent',
      },
      {
        label: 'CPC',
        key: 'cpc',
        value: metrics.cpc,
        icon: DollarSign,
        color: 'text-blue-600',
        format: 'currency',
      },
      {
        label: 'COST',
        key: 'cost',
        value: metrics.cost,
        icon: DollarSign,
        color: 'text-blue-600',
        format: 'currency',
      },
      {
        label: 'REVENUE',
        key: 'revenue',
        value: metrics.revenue,
        icon: DollarSign,
        color: 'text-cyan-600',
        format: 'currency',
      },
      {
        label: 'ROAS',
        key: 'roas',
        value: metrics.roas,
        icon: TrendingUp,
        color: 'text-green-600',
        format: 'roas',
      },
      {
        label: 'COST OF SALE',
        key: 'costOfSale',
        value: metrics.costOfSale,
        icon: Percent,
        color: 'text-purple-600',
        format: 'percent',
      },
    ];
  }, [metrics]);
}

/**
 * Generate KPI cards for specific report data
 */
export function useReportKPICards() {
  return useCallback(
    (data: MetricData): KPICard[] => {
      const metrics = calculateDerivedMetrics(data);
      return [
        {
          label: 'IMPRESSIONS',
          key: 'impressions',
          value: metrics.impressions,
          icon: Eye,
          color: 'text-pink-600',
        },
        {
          label: 'CLICKS',
          key: 'clicks',
          value: metrics.clicks,
          icon: MousePointer,
          color: 'text-purple-600',
        },
        {
          label: 'CTR',
          key: 'ctr',
          value: metrics.ctr,
          icon: Percent,
          color: 'text-purple-600',
          format: 'percent',
        },
        {
          label: 'BOOKINGS',
          key: 'bookings',
          value: metrics.bookings,
          icon: ShoppingCart,
          color: 'text-orange-600',
        },
        {
          label: 'CONVERSION RATE',
          key: 'conversionRate',
          value: metrics.conversionRate,
          icon: Percent,
          color: 'text-purple-600',
          format: 'percent',
        },
        {
          label: 'CPC',
          key: 'cpc',
          value: metrics.cpc,
          icon: DollarSign,
          color: 'text-blue-600',
          format: 'currency',
        },
        {
          label: 'COST',
          key: 'cost',
          value: metrics.cost,
          icon: DollarSign,
          color: 'text-blue-600',
          format: 'currency',
        },
        {
          label: 'REVENUE',
          key: 'revenue',
          value: metrics.revenue,
          icon: DollarSign,
          color: 'text-cyan-600',
          format: 'currency',
        },
        {
          label: 'ROAS',
          key: 'roas',
          value: metrics.roas,
          icon: TrendingUp,
          color: 'text-green-600',
          format: 'roas',
        },
        {
          label: 'COST OF SALE',
          key: 'costOfSale',
          value: metrics.costOfSale,
          icon: Percent,
          color: 'text-purple-600',
          format: 'percent',
        },
      ];
    },
    []
  );
}
