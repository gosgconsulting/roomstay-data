/**
 * KPI Cards — canonical presentational component.
 * Minimalist luxury style: no icons, no colored left bar.
 * Used by SlideViewPage (via renderKPICards) and KPIMetricsCards.
 */

import React from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface KPICard {
  label: string;
  key: string;
  value: number;
  /** Formatted display string (pre-formatted by caller) */
  formattedValue?: string;
  /** Percent change vs comparison period */
  percentChange?: number | null;
  /** Human label for the comparison period, e.g. "vs prev year" */
  compareLabel?: string;
  /** Whether a positive change is bad (e.g. cost metrics) */
  isCostMetric?: boolean;
  /** Legacy — ignored, kept for backward compat */
  icon?: React.ComponentType<any>;
  color?: string;
  format?: 'currency' | 'percent' | 'roas';
}

// ─── Single card ──────────────────────────────────────────────────────────────

interface KPICardItemProps {
  label: string;
  value: string;
  percentChange?: number | null;
  compareLabel?: string;
  isCostMetric?: boolean;
}

export const KPICardItem = React.memo<KPICardItemProps>(
  ({ label, value, percentChange, compareLabel, isCostMetric }) => {
    const hasComparison = percentChange !== null && percentChange !== undefined && compareLabel;
    const isPositive = (percentChange ?? 0) >= 0;
    const isGood = isCostMetric ? !isPositive : isPositive;

    return (
      <div className="bg-card border border-border rounded-lg p-4 flex flex-col gap-1.5">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest leading-none">
          {label}
        </p>
        <p className="text-2xl font-semibold text-foreground leading-tight tabular-nums">
          {value}
        </p>
        {hasComparison && (
          <p
            className={cn(
              'text-xs font-medium leading-none',
              isGood ? 'text-success' : 'text-destructive'
            )}
          >
            {isPositive ? '+' : ''}
            {percentChange!.toFixed(1)}%{' '}
            <span className="text-muted-foreground font-normal">{compareLabel}</span>
          </p>
        )}
      </div>
    );
  }
);
KPICardItem.displayName = 'KPICardItem';

// ─── Skeleton (first-load only) ───────────────────────────────────────────────

export const KPICardsSkeleton = ({ count = 10 }: { count?: number }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="bg-card border border-border rounded-lg p-4 flex flex-col gap-1.5 animate-pulse">
        <Skeleton className="h-2.5 w-16" />
        <Skeleton className="h-7 w-24" />
      </div>
    ))}
  </div>
);

// ─── Grid ─────────────────────────────────────────────────────────────────────

interface KPICardsSectionProps {
  cards: KPICard[];
  comparisonMetrics?: Record<string, number | string | undefined> | null;
  /** When true and cards exist, dims the grid instead of replacing with skeletons */
  isLoading?: boolean;
}

export const KPICardsSection = React.memo<KPICardsSectionProps>(
  ({ cards, comparisonMetrics, isLoading }) => {
    // First-load: no cards yet — show skeleton placeholders
    if (isLoading && cards.length === 0) return <KPICardsSkeleton count={10} />;

    return (
      <div className={cn(
        "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 transition-opacity duration-200",
        isLoading ? "opacity-50 pointer-events-none" : "opacity-100"
      )}>
        {cards.map((kpi) => {
          const compValue = comparisonMetrics?.[kpi.key];
          const percentChange =
            compValue != null && typeof compValue === 'number' && kpi.value !== undefined
              ? compValue !== 0
                ? ((kpi.value - compValue) / Math.abs(compValue)) * 100
                : kpi.value !== 0
                ? kpi.value > 0
                  ? 100
                  : -100
                : 0
              : null;

          const compareLabel =
            comparisonMetrics && 'label' in comparisonMetrics
              ? (comparisonMetrics.label as string)
              : undefined;

          return (
            <KPICardItem
              key={kpi.key ?? kpi.label}
              label={kpi.label}
              value={kpi.formattedValue ?? String(kpi.value)}
              percentChange={percentChange}
              compareLabel={compareLabel}
              isCostMetric={kpi.isCostMetric}
            />
          );
        })}
      </div>
    );
  }
);
KPICardsSection.displayName = 'KPICardsSection';
