import { useState, useMemo, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Database } from "lucide-react";

interface Dimension {
  id: string;
  name: string;
  type: string;
}

interface SlideDataPivotTableProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedValueDimensionIds: string[];
  availableDimensions: Record<string, Dimension[]>;
  selectedChannels: ('metasearch' | 'sem' | 'social')[];
  slideReportId?: string | null;
}

// Hardcoded data - December 2025 Brady Hotels
const ALL_MONTHLY_DATA = [
  // 2024
  { year: 2024, month: "Jan", metasearch: 0, social: 0, sem: 500000 },
  { year: 2024, month: "Feb", metasearch: 0, social: 0, sem: 450000 },
  { year: 2024, month: "Mar", metasearch: 0, social: 0, sem: 400000 },
  { year: 2024, month: "Apr", metasearch: 0, social: 0, sem: 420000 },
  { year: 2024, month: "May", metasearch: 0, social: 0, sem: 430000 },
  { year: 2024, month: "Jun", metasearch: 0, social: 0, sem: 0 },
  { year: 2024, month: "Jul", metasearch: 50000, social: 7000, sem: 0 },
  { year: 2024, month: "Aug", metasearch: 55000, social: 45000, sem: 0 },
  { year: 2024, month: "Sep", metasearch: 60000, social: 40000, sem: 250000 },
  { year: 2024, month: "Oct", metasearch: 58000, social: 55000, sem: 200000 },
  { year: 2024, month: "Nov", metasearch: 60000, social: 100000, sem: 270000 },
  { year: 2024, month: "Dec", metasearch: 32000, social: 80000, sem: 150000 },
  // 2025
  { year: 2025, month: "Jan", metasearch: 0, social: 0, sem: 614844.08 },
  { year: 2025, month: "Feb", metasearch: 0, social: 0, sem: 455783.02 },
  { year: 2025, month: "Mar", metasearch: 0, social: 0, sem: 417356.54 },
  { year: 2025, month: "Apr", metasearch: 0, social: 0, sem: 424804.64 },
  { year: 2025, month: "May", metasearch: 0, social: 0, sem: 438201.43 },
  { year: 2025, month: "Jun", metasearch: 0, social: 0, sem: 0 },
  { year: 2025, month: "Jul", metasearch: 63915.91, social: 8761.54, sem: 0 },
  { year: 2025, month: "Aug", metasearch: 61022.16, social: 51340.05, sem: 0 },
  { year: 2025, month: "Sep", metasearch: 65497.69, social: 47241.16, sem: 292391.79 },
  { year: 2025, month: "Oct", metasearch: 62790.62, social: 59499.71, sem: 203158.10 },
  { year: 2025, month: "Nov", metasearch: 62764.16, social: 107535.63, sem: 278315.94 },
  { year: 2025, month: "Dec", metasearch: 35093.16, social: 87867.77, sem: 155596.64 },
];

// December 2025 current period data
const METASEARCH_DATA = {
  impressions: 27067,
  clicks: 1915,
  cost: 2729.84,
  revenue: 35093.16,
  bookings: 70,
};

const SEM_DATA = {
  impressions: 432114,
  clicks: 9797,
  cost: 8208.69,
  revenue: 155596.64,
  bookings: 298,
};

const SOCIAL_DATA = {
  impressions: 491612,
  clicks: 3021,
  cost: 4337.01,
  revenue: 87867.77,
  bookings: 154,
};

// Breakdown data
const METASEARCH_BY_HOTEL = [
  { hotel: "Brady Hotels Central Melbourne", impressions: 11271, clicks: 735, cost: 1188.40, revenue: 13701.50, bookings: 27 },
  { hotel: "Brady Hotels Jones Lane", impressions: 6285, clicks: 496, cost: 672.99, revenue: 12588.50, bookings: 26 },
  { hotel: "Brady Apartment Hotel Flinders Street", impressions: 5158, clicks: 352, cost: 635.32, revenue: 8010.13, bookings: 13 },
  { hotel: "Brady Apartment Hotel Hardware Lane", impressions: 7295, clicks: 549, cost: 575.62, revenue: 6590.51, bookings: 15 },
];

const METASEARCH_BY_LINK_TYPE = [
  { linkType: "Paid", impressions: 30009, clicks: 1068, cost: 3072.33, revenue: 30466.99, bookings: 54 },
  { linkType: "Google Organic", impressions: 0, clicks: 1064, cost: 0, revenue: 10423.65, bookings: 27 },
];

const SEM_BY_CAMPAIGN = [
  { campaign: "Brady Hotels Central Melbourne | Search | Brand", impressions: 3248, clicks: 666, cost: 1050.91, revenue: 31932.30, bookings: 45 },
  { campaign: "Brady Group | Search | Brand", impressions: 3155, clicks: 895, cost: 1059.14, revenue: 25988.77, bookings: 52 },
  { campaign: "Brady Hotels Jones Lane | Search | Brand", impressions: 2655, clicks: 633, cost: 1047.45, revenue: 22245.90, bookings: 58 },
  { campaign: "Brady Apartment Hotel Hardware Lane | Search | Brand", impressions: 2142, clicks: 574, cost: 1038.45, revenue: 14744.00, bookings: 25 },
  { campaign: "Brady Apartment Hotel Flinders Street | Search | Brand", impressions: 2689, clicks: 604, cost: 1044.86, revenue: 14300.23, bookings: 29 },
  { campaign: "Brady Apartment Hotel Flinders Street | Performance Max", impressions: 27627, clicks: 485, cost: 229.14, revenue: 13196.13, bookings: 11 },
  { campaign: "Brady Apartment Hotel Hardware Lane | Performance Max", impressions: 65162, clicks: 935, cost: 276.58, revenue: 11338.89, bookings: 19 },
  { campaign: "Brady Hotels Central Melbourne | Performance Max", impressions: 26301, clicks: 638, cost: 274.40, revenue: 4433.15, bookings: 14 },
  { campaign: "Brady Group | Performance Max", impressions: 152199, clicks: 1992, cost: 270.84, revenue: 3548.18, bookings: 9 },
  { campaign: "Brady Hotels Jones Lane | Performance Max", impressions: 46178, clicks: 701, cost: 231.27, revenue: 2342.81, bookings: 8 },
];

const SOCIAL_BY_CAMPAIGN = [
  { campaign: "Brady Hotels Jones Lane | Sales", impressions: 27562, clicks: 275, cost: 463.60, revenue: 17751.01, bookings: 40 },
  { campaign: "Brady Apartment Hotel Flinders Street | Sales", impressions: 35164, clicks: 367, cost: 577.52, revenue: 17215.57, bookings: 33 },
  { campaign: "Brady Apartment Hotel Hardware Lane | Sales", impressions: 26685, clicks: 246, cost: 464.15, revenue: 17051.53, bookings: 22 },
  { campaign: "Brady Hotels Central Melbourne | Sales", impressions: 28129, clicks: 253, cost: 452.97, revenue: 13215.00, bookings: 23 },
  { campaign: "Brady Black Friday Sale Campaign | Daily", impressions: 10392, clicks: 58, cost: 286.40, revenue: 5973.10, bookings: 10 },
  { campaign: "Brady Hotels Central Melbourne | Boxing Day '25", impressions: 11380, clicks: 70, cost: 192.44, revenue: 5498.50, bookings: 5 },
  { campaign: "Brady Hotels Hardware Lane | Boxing Day '25", impressions: 12672, clicks: 80, cost: 192.46, revenue: 4057.48, bookings: 8 },
  { campaign: "Brady Hotels Jones Lane | Boxing Day '25", impressions: 11289, clicks: 88, cost: 194.30, revenue: 3125.43, bookings: 5 },
  { campaign: "Brady Hotels Flinders Street | Boxing Day '25", impressions: 12046, clicks: 83, cost: 192.58, revenue: 2929.15, bookings: 6 },
  { campaign: "Brady Group | Leads | Members", impressions: 10576, clicks: 127, cost: 313.50, revenue: 802.00, bookings: 1 },
];

// Calculate derived metrics
const calculateDerivedMetrics = (data: { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }) => ({
  ...data,
  ctr: data.clicks > 0 && data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0,
  conversionRate: data.clicks > 0 ? (data.bookings / data.clicks) * 100 : 0,
  cpc: data.clicks > 0 ? data.cost / data.clicks : 0,
  roas: data.cost > 0 ? data.revenue / data.cost : 0,
  costOfSale: data.revenue > 0 ? (data.cost / data.revenue) * 100 : 0,
});

// Format values based on dimension type
const formatValue = (value: number, dimensionName: string, dimensionType: string): string => {
  const normalizedName = dimensionName.toLowerCase().replace(/\s+/g, '');
  
  if (dimensionType === 'currency' || normalizedName.includes('cost') || normalizedName.includes('revenue') || normalizedName.includes('cpc')) {
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  }
  
  if (dimensionType === 'percentage' || normalizedName.includes('ctr') || normalizedName.includes('conversion') || normalizedName.includes('costofsale')) {
    return `${value.toFixed(2)}%`;
  }
  
  if (normalizedName.includes('roas')) {
    return `${value.toFixed(1)}x`;
  }
  
  // Number type
  return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
};

// Map dimension name to data field
const getDataField = (dimensionName: string): string | null => {
  const normalized = dimensionName.toLowerCase().replace(/\s+/g, '');
  
  if (normalizedName.includes('impression')) return 'impressions';
  if (normalizedName.includes('click')) return 'clicks';
  if (normalizedName.includes('cost') && !normalizedName.includes('costofsale')) return 'cost';
  if (normalizedName.includes('revenue')) return 'revenue';
  if (normalizedName.includes('booking')) return 'bookings';
  if (normalizedName.includes('ctr')) return 'ctr';
  if (normalizedName.includes('conversion')) return 'conversionRate';
  if (normalizedName.includes('cpc')) return 'cpc';
  if (normalizedName.includes('roas')) return 'roas';
  if (normalizedName.includes('costofsale')) return 'costOfSale';
  
  return null;
};

export function SlideDataPivotTable({
  open,
  onOpenChange,
  selectedValueDimensionIds,
  availableDimensions,
  selectedChannels,
  slideReportId,
}: SlideDataPivotTableProps) {
  const [activeTab, setActiveTab] = useState<"monthly" | "breakdown">("monthly");
  const [breakdownChannel, setBreakdownChannel] = useState<'metasearch' | 'sem' | 'social' | null>(
    selectedChannels.length > 0 ? selectedChannels[0] : null
  );

  // Update breakdownChannel when selectedChannels changes
  useEffect(() => {
    if (selectedChannels.length > 0) {
      if (!breakdownChannel || !selectedChannels.includes(breakdownChannel)) {
        setBreakdownChannel(selectedChannels[0]);
      }
    } else {
      setBreakdownChannel(null);
    }
  }, [selectedChannels, breakdownChannel]);

  // Get selected dimensions with their names and types
  const selectedDimensions = useMemo(() => {
    const dims = availableDimensions.metasearch || [];
    return selectedValueDimensionIds
      .map(id => dims.find(d => d.id === id))
      .filter((d): d is Dimension => d !== undefined);
  }, [selectedValueDimensionIds, availableDimensions]);

  // Generate monthly data rows
  const monthlyRows = useMemo(() => {
    const rows: Array<{
      year: number;
      month: string;
      channel: string;
      [key: string]: string | number;
    }> = [];

    // For each month in ALL_MONTHLY_DATA, create rows for each selected channel
    ALL_MONTHLY_DATA.forEach(monthData => {
      selectedChannels.forEach(channel => {
        // Get base metrics for this channel/month
        // For December 2025, use actual data; for other months, estimate from revenue
        let baseData: { impressions: number; clicks: number; cost: number; revenue: number; bookings: number };
        
        if (monthData.year === 2025 && monthData.month === "Dec") {
          // Use actual December 2025 data
          if (channel === 'metasearch') baseData = METASEARCH_DATA;
          else if (channel === 'sem') baseData = SEM_DATA;
          else if (channel === 'social') baseData = SOCIAL_DATA;
          else baseData = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
        } else {
          // Estimate from revenue (simplified - in real implementation, this would come from database)
          const revenue = monthData[channel] || 0;
          // Rough estimates based on December ratios
          const revenueRatio = revenue > 0 ? revenue / (channel === 'metasearch' ? METASEARCH_DATA.revenue : channel === 'sem' ? SEM_DATA.revenue : SOCIAL_DATA.revenue) : 0;
          
          if (channel === 'metasearch') {
            baseData = {
              impressions: Math.round(METASEARCH_DATA.impressions * revenueRatio),
              clicks: Math.round(METASEARCH_DATA.clicks * revenueRatio),
              cost: METASEARCH_DATA.cost * revenueRatio,
              revenue: revenue,
              bookings: Math.round(METASEARCH_DATA.bookings * revenueRatio),
            };
          } else if (channel === 'sem') {
            baseData = {
              impressions: Math.round(SEM_DATA.impressions * revenueRatio),
              clicks: Math.round(SEM_DATA.clicks * revenueRatio),
              cost: SEM_DATA.cost * revenueRatio,
              revenue: revenue,
              bookings: Math.round(SEM_DATA.bookings * revenueRatio),
            };
          } else {
            baseData = {
              impressions: Math.round(SOCIAL_DATA.impressions * revenueRatio),
              clicks: Math.round(SOCIAL_DATA.clicks * revenueRatio),
              cost: SOCIAL_DATA.cost * revenueRatio,
              revenue: revenue,
              bookings: Math.round(SOCIAL_DATA.bookings * revenueRatio),
            };
          }
        }

        const metrics = calculateDerivedMetrics(baseData);
        
        const row: { year: number; month: string; channel: string; [key: string]: string | number } = {
          year: monthData.year,
          month: monthData.month,
          channel: channel.charAt(0).toUpperCase() + channel.slice(1),
        };

        // Add selected dimension values
        selectedDimensions.forEach(dim => {
          const field = getDataField(dim.name);
          if (field && field in metrics) {
            row[dim.name] = metrics[field as keyof typeof metrics];
          }
        });

        rows.push(row);
      });
    });

    return rows;
  }, [selectedChannels, selectedDimensions]);

  // Generate breakdown rows
  const breakdownRows = useMemo(() => {
    if (!breakdownChannel) return [];

    const rows: Array<{ [key: string]: string | number }> = [];

    if (breakdownChannel === 'metasearch') {
      // Hotel breakdown
      METASEARCH_BY_HOTEL.forEach(item => {
        const metrics = calculateDerivedMetrics({
          impressions: item.impressions,
          clicks: item.clicks,
          cost: item.cost,
          revenue: item.revenue,
          bookings: item.bookings,
        });

        const row: { [key: string]: string | number } = {
          'Hotel': item.hotel,
        };

        selectedDimensions.forEach(dim => {
          const field = getDataField(dim.name);
          if (field && field in metrics) {
            row[dim.name] = metrics[field as keyof typeof metrics];
          }
        });

        rows.push(row);
      });
    } else if (breakdownChannel === 'sem') {
      SEM_BY_CAMPAIGN.forEach(item => {
        const metrics = calculateDerivedMetrics({
          impressions: item.impressions,
          clicks: item.clicks,
          cost: item.cost,
          revenue: item.revenue,
          bookings: item.bookings,
        });

        const row: { [key: string]: string | number } = {
          'Campaign': item.campaign,
        };

        selectedDimensions.forEach(dim => {
          const field = getDataField(dim.name);
          if (field && field in metrics) {
            row[dim.name] = metrics[field as keyof typeof metrics];
          }
        });

        rows.push(row);
      });
    } else if (breakdownChannel === 'social') {
      SOCIAL_BY_CAMPAIGN.forEach(item => {
        const metrics = calculateDerivedMetrics({
          impressions: item.impressions,
          clicks: item.clicks,
          cost: item.cost,
          revenue: item.revenue,
          bookings: item.bookings,
        });

        const row: { [key: string]: string | number } = {
          'Campaign': item.campaign,
        };

        selectedDimensions.forEach(dim => {
          const field = getDataField(dim.name);
          if (field && field in metrics) {
            row[dim.name] = metrics[field as keyof typeof metrics];
          }
        });

        rows.push(row);
      });
    }

    return rows;
  }, [breakdownChannel, selectedDimensions]);

  // Get breakdown dimension name
  const breakdownDimensionName = useMemo(() => {
    if (breakdownChannel === 'metasearch') return 'Hotel';
    if (breakdownChannel === 'sem' || breakdownChannel === 'social') return 'Campaign';
    return '';
  }, [breakdownChannel]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <DialogTitle>Pivot Table Data</DialogTitle>
          </div>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "monthly" | "breakdown")} className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="monthly">Monthly View</TabsTrigger>
            <TabsTrigger value="breakdown">Breakdown View</TabsTrigger>
          </TabsList>

          <TabsContent value="monthly" className="flex-1 flex flex-col min-h-0 mt-4">
            <ScrollArea className="flex-1 border rounded-md">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/50 z-10">
                  <TableRow>
                    <TableHead className="font-semibold min-w-[100px]">Year</TableHead>
                    <TableHead className="font-semibold min-w-[100px]">Month</TableHead>
                    <TableHead className="font-semibold min-w-[120px]">Channel</TableHead>
                    {selectedDimensions.map(dim => (
                      <TableHead key={dim.id} className="font-semibold text-right min-w-[120px]">
                        {dim.name}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthlyRows.map((row, idx) => (
                    <TableRow key={`${row.year}-${row.month}-${row.channel}-${idx}`}>
                      <TableCell className="font-medium">{row.year}</TableCell>
                      <TableCell>{row.month}</TableCell>
                      <TableCell>{row.channel}</TableCell>
                      {selectedDimensions.map(dim => {
                        const value = row[dim.name] as number | undefined;
                        return (
                          <TableCell key={dim.id} className="text-right tabular-nums">
                            {value !== undefined ? formatValue(value, dim.name, dim.type) : '-'}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="breakdown" className="flex-1 flex flex-col min-h-0 mt-4">
            {selectedChannels.length > 0 && (
              <div className="flex gap-2 mb-4">
                {selectedChannels.map(channel => (
                  <button
                    key={channel}
                    onClick={() => setBreakdownChannel(channel)}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      breakdownChannel === channel
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted hover:bg-muted/80'
                    }`}
                  >
                    {channel.charAt(0).toUpperCase() + channel.slice(1)}
                  </button>
                ))}
              </div>
            )}
            {breakdownChannel && breakdownRows.length > 0 ? (
              <ScrollArea className="flex-1 border rounded-md">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted/50 z-10">
                    <TableRow>
                      <TableHead className="font-semibold min-w-[200px]">{breakdownDimensionName}</TableHead>
                      {selectedDimensions.map(dim => (
                        <TableHead key={dim.id} className="font-semibold text-right min-w-[120px]">
                          {dim.name}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {breakdownRows.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">
                          {row[breakdownDimensionName] as string}
                        </TableCell>
                        {selectedDimensions.map(dim => {
                          const value = row[dim.name] as number | undefined;
                          return (
                            <TableCell key={dim.id} className="text-right tabular-nums">
                              {value !== undefined ? formatValue(value, dim.name, dim.type) : '-'}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                {!breakdownChannel ? 'Select a channel' : 'No breakdown data available'}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
