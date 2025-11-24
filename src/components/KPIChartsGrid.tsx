"use client";

import React, { useState } from "react";
import { KPIChart } from "@/components/KPIChartFixed";

interface KPIChartsGridProps {
  reportId: string | null;
  accountId: string | null;
  filters: {
    dimensionFilters: Record<string, string[]>;
    dateRange?: { from: Date; to?: Date };
    compareEnabled?: boolean;
    compareType?: string;
    compareDateRange?: { from: Date; to?: Date };
  };
  visibilityRefreshTrigger?: number;
  onLoadingComplete?: () => void;
}

const KPIChartsGrid: React.FC<KPIChartsGridProps> = ({
  reportId,
  accountId,
  filters,
  visibilityRefreshTrigger,
  onLoadingComplete,
}) => {
  const [loaded, setLoaded] = useState(0);

  const handleChildLoaded = () => {
    const next = loaded + 1;
    setLoaded(next);
    if (next >= 4) {
      onLoadingComplete?.();
    }
  };

  const metrics = ["Clicks", "Cost", "Bookings", "Revenue"];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {metrics.map((metric) => (
        <KPIChart
          key={metric}
          reportId={reportId}
          accountId={accountId}
          filters={filters}
          visibilityRefreshTrigger={visibilityRefreshTrigger}
          onLoadingComplete={handleChildLoaded}
          initialMetric={metric}
          hideHeaderControls
        />
      ))}
    </div>
  );
};

export default KPIChartsGrid;