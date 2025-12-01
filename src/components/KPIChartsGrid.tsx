"use client";

import React, { useState } from "react";
import { KPIChart } from "@/components/KPIChartFixed";

interface KPIChartsGridProps {
  reportId: string | null;
  accountId: string | null;
  filters: {
    dimensionFilters: Record<string, string[]>;
    dateRange?: { from: Date; to?: Date };
    datePreset?: string;
    compareEnabled?: boolean;
    compareType?: string;
    compareDateRange?: { from: Date; to?: Date };
  };
  visibilityRefreshTrigger?: number;
  onLoadingComplete?: () => void;
  isEditMode?: boolean;
  metrics: string[]; // array of 4 metric names in order
  onMetricChange?: (index: number, metric: string) => void;
}

const KPIChartsGrid: React.FC<KPIChartsGridProps> = ({
  reportId,
  accountId,
  filters,
  visibilityRefreshTrigger,
  onLoadingComplete,
  isEditMode = false,
  metrics,
  onMetricChange,
}) => {
  const [loaded, setLoaded] = useState(0);

  const handleChildLoaded = () => {
    const next = loaded + 1;
    setLoaded(next);
    if (next >= 4) {
      onLoadingComplete?.();
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {metrics.map((metric, index) => (
        <KPIChart
          key={`${metric}-${index}`}
          reportId={reportId}
          accountId={accountId}
          filters={filters}
          visibilityRefreshTrigger={visibilityRefreshTrigger}
          onLoadingComplete={handleChildLoaded}
          initialMetric={metric}
          isEditMode={isEditMode}
          onMetricChange={(m) => onMetricChange?.(index, m)}
        />
      ))}
    </div>
  );
};

export default KPIChartsGrid;