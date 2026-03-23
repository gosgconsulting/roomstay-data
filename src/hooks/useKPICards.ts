/**
 * Hook for generating KPI cards
 */

import { useMemo } from 'react';
import { Eye, MousePointer, Percent, ShoppingCart, DollarSign, TrendingUp, Receipt } from 'lucide-react';
import type { DerivedMetrics } from '@/types/slideView';

export type KPICard = {
  label: string;
  key: string;
  value: number;
  icon: typeof Eye;
  color: string;
  format?: 'percent' | 'currency' | 'roas';
};

/** Shared list builder — use when you already have full {@link DerivedMetrics} (e.g. Performance Model overrides). */
export function buildKPICardsFromDerivedMetrics(metrics: DerivedMetrics): KPICard[] {
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
      label: 'AOV',
      key: 'aov',
      value: metrics.aov,
      icon: Receipt,
      color: 'text-teal-600',
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
      color: 'text-success',
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
    {
      label: 'COMMISSIONS PAID',
      key: 'commissionsPaid',
      value: metrics.commissionsPaid,
      icon: DollarSign,
      color: 'text-emerald-600',
      format: 'currency',
    },
    {
      label: 'COMMISSIONS FREE',
      key: 'commissionsFree',
      value: metrics.commissionsFree,
      icon: DollarSign,
      color: 'text-teal-600',
      format: 'currency',
    },
    {
      label: 'GROSS PROFIT',
      key: 'grossProfit',
      value: metrics.grossProfit,
      icon: TrendingUp,
      color: 'text-emerald-600',
      format: 'currency',
    },
  ];
}

/**
 * Generate KPI cards from metrics
 */
export function useKPICards(metrics: DerivedMetrics): KPICard[] {
  return useMemo(() => buildKPICardsFromDerivedMetrics(metrics), [metrics]);
}
