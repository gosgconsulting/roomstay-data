import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CombinedMetrics } from "@/lib/combined-analytics";

interface CombinedPerformanceTableProps {
  data: Array<{
    date: string;
    metrics: CombinedMetrics;
    reportSources: string[];
  }>;
  isLoading?: boolean;
}

export const CombinedPerformanceTable = ({ 
  data, 
  isLoading = false 
}: CombinedPerformanceTableProps) => {
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
        <CardTitle>Combined Performance by Date</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border overflow-auto max-h-[600px]">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                <TableHead className="font-semibold">Date</TableHead>
                <TableHead className="font-semibold text-right">Impressions</TableHead>
                <TableHead className="font-semibold text-right">Clicks</TableHead>
                <TableHead className="font-semibold text-right">CTR</TableHead>
                <TableHead className="font-semibold text-right">Conversions</TableHead>
                <TableHead className="font-semibold text-right">Conv. Rate</TableHead>
                <TableHead className="font-semibold text-right">Cost</TableHead>
                <TableHead className="font-semibold text-right">Revenue</TableHead>
                <TableHead className="font-semibold text-right">ROAS</TableHead>
                <TableHead className="font-semibold">Sources</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                    No data available for the selected filters
                  </TableCell>
                </TableRow>
              ) : (
                data.map((row, index) => (
                  <TableRow key={index} className="hover:bg-muted/50">
                    <TableCell className="font-medium">{row.date}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.metrics.impressions)}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.metrics.clicks)}</TableCell>
                    <TableCell className="text-right">{formatPercentage(row.metrics.ctr)}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.metrics.conversions)}</TableCell>
                    <TableCell className="text-right">{formatPercentage(row.metrics.conversionRate)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.metrics.cost)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.metrics.revenue)}</TableCell>
                    <TableCell className="text-right">{formatDecimal(row.metrics.roas)}</TableCell>
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
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
