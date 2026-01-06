import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useMasterReportAggregates } from "@/hooks/useMasterReportAggregates";
import type { ChannelConfig } from "./MasterReportSettingsModal";

interface MasterReportTableProps {
  reportId: string;
  reportName: string;
  config: ChannelConfig;
  accountId?: string;
}

interface AggregatedRow {
  groupValue: string;
  metrics: Record<string, number>;
}

type DateTab = "this_month" | "last_month" | "ytd";

const DATE_TAB_LABELS: Record<DateTab, string> = {
  this_month: "This Month",
  last_month: "Last Month",
  ytd: "Year to Date",
};


function formatMetricValue(metricName: string, value: number): string {
  if (value === 0 || isNaN(value)) return "-";

  switch (metricName) {
    case "Cost":
    case "Revenue":
    case "CPC":
      return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }).format(value);
    case "ROAS":
      return value.toFixed(2) + "x";
    case "CTR":
    case "Conversion Rate":
      return value.toFixed(2) + "%";
    case "Clicks":
    case "Impressions":
    case "Conversions":
      return new Intl.NumberFormat("en-US").format(Math.round(value));
    default:
      return new Intl.NumberFormat("en-US").format(value);
  }
}

export function MasterReportTable({
  reportId,
  reportName,
  config,
  accountId,
}: MasterReportTableProps) {
  const [activeTab, setActiveTab] = useState<DateTab>("this_month");

  // Use pre-aggregated data for instant loading
  const { data: aggregatedData = [], isLoading } = useMasterReportAggregates({
    reportId,
    config,
    dateTab: activeTab,
    enabled: !!reportId,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-[200px] w-full" />
      </div>
    );
  }

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DateTab)}>
      <TabsList className="mb-4">
        {(Object.keys(DATE_TAB_LABELS) as DateTab[]).map((tab) => (
          <TabsTrigger key={tab} value={tab}>
            {DATE_TAB_LABELS[tab]}
          </TabsTrigger>
        ))}
      </TabsList>

      {(Object.keys(DATE_TAB_LABELS) as DateTab[]).map((tab) => (
        <TabsContent key={tab} value={tab}>
          {aggregatedData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No data available for this period
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">
                      {config.groupByDimensionName || reportName}
                    </TableHead>
                    {config.selectedMetrics.map((metric) => (
                      <TableHead key={metric} className="text-right font-semibold">
                        {metric}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aggregatedData.map((row, idx) => (
                    <TableRow key={row.groupValue + idx}>
                      <TableCell className="font-medium">
                        {row.groupValue}
                      </TableCell>
                      {config.selectedMetrics.map((metric) => (
                        <TableCell key={metric} className="text-right">
                          {formatMetricValue(metric, row.metrics[metric] || 0)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}
