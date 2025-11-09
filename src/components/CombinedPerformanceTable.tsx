import { useState } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import { CombinedMetrics } from "@/lib/combined-analytics";
import { CombinedColumnsConfigModal } from "@/components/CombinedColumnsConfigModal";

interface CombinedPerformanceTableProps {
  data: Array<{
    date: string;
    metrics: CombinedMetrics;
    reportSources: string[];
  }>;
  isLoading?: boolean;
  visibleColumns?: string[];
  onVisibleColumnsChange?: (columns: string[]) => void;
}

export const CombinedPerformanceTable = ({ 
  data, 
  isLoading = false,
  visibleColumns = ["date", "impressions", "clicks", "ctr", "conversions", "conversionRate", "cost", "revenue", "roas", "sources"],
  onVisibleColumnsChange
}: CombinedPerformanceTableProps) => {
  const [showColumnsConfig, setShowColumnsConfig] = useState(false);
  const formatNumber = (num: number): string => {
    return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
  };

  const formatCurrency = (num: number): string => {
    return `$${num.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  };

  const formatPercentage = (num: number): string => {
    return `${num.toFixed(2)}%`;
  };

  const formatDecimal = (num: number): string => {
    return num.toFixed(2);
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Combined Performance by Date</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse h-12 bg-muted rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Combined Performance by Date</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowColumnsConfig(true)}
            className="h-8 px-3 text-xs"
          >
            <Settings className="h-4 w-4 mr-1" />
            Edit Columns
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-auto max-h-[600px]">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                {visibleColumns.includes("date") && <TableHead className="font-semibold">Date</TableHead>}
                {visibleColumns.includes("impressions") && <TableHead className="font-semibold text-right">Impressions</TableHead>}
                {visibleColumns.includes("clicks") && <TableHead className="font-semibold text-right">Clicks</TableHead>}
                {visibleColumns.includes("ctr") && <TableHead className="font-semibold text-right">CTR</TableHead>}
                {visibleColumns.includes("conversions") && <TableHead className="font-semibold text-right">Conversions</TableHead>}
                {visibleColumns.includes("conversionRate") && <TableHead className="font-semibold text-right">Conv. Rate</TableHead>}
                {visibleColumns.includes("cpc") && <TableHead className="font-semibold text-right">CPC</TableHead>}
                {visibleColumns.includes("cost") && <TableHead className="font-semibold text-right">Cost</TableHead>}
                {visibleColumns.includes("revenue") && <TableHead className="font-semibold text-right">Revenue</TableHead>}
                {visibleColumns.includes("roas") && <TableHead className="font-semibold text-right">ROAS</TableHead>}
                {visibleColumns.includes("costOfSale") && <TableHead className="font-semibold text-right">Cost of Sale</TableHead>}
                {visibleColumns.includes("sources") && <TableHead className="font-semibold">Sources</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={visibleColumns.length} className="text-center text-muted-foreground py-8">
                    No data available for the selected filters
                  </TableCell>
                </TableRow>
              ) : (
                data.map((row, index) => (
                  <TableRow key={index} className="hover:bg-muted/50">
                    {visibleColumns.includes("date") && <TableCell className="font-medium">{row.date}</TableCell>}
                    {visibleColumns.includes("impressions") && <TableCell className="text-right">{formatNumber(row.metrics.impressions)}</TableCell>}
                    {visibleColumns.includes("clicks") && <TableCell className="text-right">{formatNumber(row.metrics.clicks)}</TableCell>}
                    {visibleColumns.includes("ctr") && <TableCell className="text-right">{formatPercentage(row.metrics.ctr)}</TableCell>}
                    {visibleColumns.includes("conversions") && <TableCell className="text-right">{formatNumber(row.metrics.conversions)}</TableCell>}
                    {visibleColumns.includes("conversionRate") && <TableCell className="text-right">{formatPercentage(row.metrics.conversionRate)}</TableCell>}
                    {visibleColumns.includes("cpc") && <TableCell className="text-right">{formatCurrency(row.metrics.cpc)}</TableCell>}
                    {visibleColumns.includes("cost") && <TableCell className="text-right">{formatCurrency(row.metrics.cost)}</TableCell>}
                    {visibleColumns.includes("revenue") && <TableCell className="text-right">{formatCurrency(row.metrics.revenue)}</TableCell>}
                    {visibleColumns.includes("roas") && <TableCell className="text-right">{formatDecimal(row.metrics.roas)}</TableCell>}
                    {visibleColumns.includes("costOfSale") && <TableCell className="text-right">{formatPercentage(row.metrics.costOfSale)}</TableCell>}
                    {visibleColumns.includes("sources") && (
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {row.reportSources.slice(0, 2).map((source, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {source}
                            </Badge>
                          ))}
                          {row.reportSources.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                              +{row.reportSources.length - 2}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      
      <CombinedColumnsConfigModal
        open={showColumnsConfig}
        onOpenChange={setShowColumnsConfig}
        visibleColumns={visibleColumns}
        onSave={(columns) => onVisibleColumnsChange?.(columns)}
      />
    </Card>
  );
};
