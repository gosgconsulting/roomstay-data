/**
 * KPI Cards Section Component
 * Displays KPI cards with comparison metrics and loading states
 */

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { calculatePercentChange, formatNumber } from '@/lib/slideViewHelpers';
import type { DerivedMetrics } from '@/types/slideView';

export interface KPICard {
  label: string;
  key: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  format?: 'currency' | 'percent' | 'roas';
}

export interface ComparisonMetrics {
  impressions?: number;
  clicks?: number;
  ctr?: number;
  bookings?: number;
  conversionRate?: number;
  cpc?: number;
  cost?: number;
  revenue?: number;
  roas?: number;
  costOfSale?: number;
  label?: string;
}

interface KPICardsSectionProps {
  cards: KPICard[];
  comparisonMetrics?: ComparisonMetrics | null;
  isLoading: boolean;
}

/**
 * Skeleton loader for KPI Cards
 */
export const KPICardsSkeleton = () => (
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
    {Array.from({ length: 10 }).map((_, index) => (
      <Card key={index} className="shadow-sm border-l-4 border-l-primary/60 bg-card">
        <CardContent className="p-4">
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-8 w-32 mb-2" />
          <Skeleton className="h-3 w-20" />
        </CardContent>
      </Card>
    ))}
  </div>
);

/**
 * KPI Cards Section Component
 */
export const KPICardsSection = React.memo<KPICardsSectionProps>(
  ({ cards, comparisonMetrics, isLoading }) => {
    if (isLoading) {
      return <KPICardsSkeleton />;
    }

    const stored = typeof window !== 'undefined' ? localStorage.getItem('master_report_currency') : null;
    const effectiveCurrency: 'USD' | 'AUD' = stored === 'AUD' || stored === 'USD' ? stored : 'USD';

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {cards.map((kpi) => {
          const compValue = comparisonMetrics
            ? comparisonMetrics[kpi.key as keyof ComparisonMetrics]
            : null;
          const percentChange =
            compValue !== null
              ? calculatePercentChange(kpi.value, compValue as number)
              : null;
          const isPositive = percentChange !== null && percentChange >= 0;
          // For cost metrics, lower is better
          const isCostMetric = ['cpc', 'cost', 'costOfSale'].includes(kpi.key);
          const isGood = isCostMetric ? !isPositive : isPositive;
          const compLabel = comparisonMetrics?.label;

          const formattedValue = (() => {
            if (kpi.format === 'currency') {
              if (kpi.key === 'cpc' && kpi.value < 0.01) {
                return new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: effectiveCurrency,
                  minimumFractionDigits: 4,
                  maximumFractionDigits: 4,
                }).format(kpi.value);
              }
              return formatNumber(kpi.value, 'currency', effectiveCurrency);
            }
            if (kpi.format === 'percent') {
              if (kpi.key === 'costOfSale' && kpi.value < 0.01) return `${kpi.value.toFixed(4)}%`;
              return `${kpi.value.toFixed(2)}%`;
            }
            if (kpi.format === 'roas') {
              return `${kpi.value.toFixed(1)}x`;
            }
            return formatNumber(kpi.value);
          })();

          return (
            <Card
              key={kpi.label}
              className="shadow-sm border-l-4 border-l-primary/60 bg-card"
            >
              <CardContent className="p-4">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                  {kpi.label}
                </p>
                <div className="text-2xl font-bold text-foreground">{formattedValue}</div>
                {percentChange !== null && compLabel && (
                  <div
                    className={`flex items-center gap-1 mt-1 text-xs ${isGood ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {isPositive ? (
                      <ArrowUpRight className="h-3 w-3" />
                    ) : (
                      <ArrowDownRight className="h-3 w-3" />
                    )}
                    <span>{Math.abs(percentChange).toFixed(1)}%</span>
                    <span className="text-muted-foreground">{compLabel}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }
);

KPICardsSection.displayName = 'KPICardsSection';