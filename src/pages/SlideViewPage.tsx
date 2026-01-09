import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, RefreshCw, Eye, MousePointer, DollarSign, Percent, TrendingUp, ShoppingCart } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// REAL DATA from database queries - December 2025 Brady Hotels
// Metasearch December 2025 - Brady Hotels (Hotel ILIKE '%Brady%')
const METASEARCH_DATA = {
  impressions: 30009,
  clicks: 2132,
  cost: 3072.33,
  revenue: 40890.64,
  bookings: 81,
};

// SEM - Brady Hotels Group (all time since no 2025 data - from Jan-Feb 2020)
const SEM_DATA = {
  impressions: 69347,
  clicks: 6610,
  cost: 8441.01,
  revenue: 466620.41,
  bookings: 549.32,
};

// Social December 2025 - Brady Hotels 2025
const SOCIAL_DATA = {
  impressions: 47430,
  clicks: 266,
  cost: 623.13,
  revenue: 20432.40,
  bookings: 26,
};

// METASEARCH BREAKDOWN BY HOTEL (December 2025)
const METASEARCH_BY_HOTEL = [
  { hotel: "Brady Hotels Central Melbourne", impressions: 11271, clicks: 735, cost: 1188.40, revenue: 13701.50, bookings: 27 },
  { hotel: "Brady Hotels Jones Lane", impressions: 6285, clicks: 496, cost: 672.99, revenue: 12588.50, bookings: 26 },
  { hotel: "Brady Apartment Hotel Flinders Street", impressions: 5158, clicks: 352, cost: 635.32, revenue: 8010.13, bookings: 13 },
  { hotel: "Brady Apartment Hotel Hardware Lane", impressions: 7295, clicks: 549, cost: 575.62, revenue: 6590.51, bookings: 15 },
];

// METASEARCH BREAKDOWN BY LINK TYPE (December 2025)
const METASEARCH_BY_LINK_TYPE = [
  { linkType: "Paid", impressions: 30009, clicks: 1068, cost: 3072.33, revenue: 30466.99, bookings: 54 },
  { linkType: "Google Organic", impressions: 0, clicks: 1064, cost: 0, revenue: 10423.65, bookings: 27 },
];

// SEM BREAKDOWN BY CAMPAIGN (Brady Hotels Group - all time)
const SEM_BY_CAMPAIGN = [
  { campaign: "Brady Hotels - Brand - Exact", impressions: 10414, clicks: 2627, cost: 3664.83, revenue: 274026.99, bookings: 314.96 },
  { campaign: "Brady Hotels - Brand - Broad", impressions: 12291, clicks: 2028, cost: 2215.08, revenue: 111405.27, bookings: 155.72 },
  { campaign: "Brady Hotels - Generic - Broad", impressions: 30703, clicks: 1309, cost: 2361.34, revenue: 81188.14, bookings: 78.63 },
  { campaign: "Brady Hotel - GDN - Remarketing", impressions: 13645, clicks: 561, cost: 16.79, revenue: 0, bookings: 0 },
  { campaign: "Brady Hotels - Generic - Exact", impressions: 2294, clicks: 85, cost: 182.97, revenue: 0, bookings: 0 },
];

// SOCIAL BREAKDOWN BY CAMPAIGN (Brady Hotels 2025 - December 2025)
const SOCIAL_BY_CAMPAIGN = [
  { campaign: "Brady Apartment Hotel Hardware Lane | Sales", impressions: 2150, clicks: 22, cost: 53.23, revenue: 8010.70, bookings: 4 },
  { campaign: "Brady Black Friday Sale Campaign | Daily", impressions: 10392, clicks: 58, cost: 286.40, revenue: 5973.10, bookings: 10 },
  { campaign: "Brady Hotels Central Melbourne | Sales", impressions: 2469, clicks: 18, cost: 54.15, revenue: 5054.45, bookings: 7 },
  { campaign: "Brady Hotels Jones Lane | Sales", impressions: 2363, clicks: 30, cost: 54.00, revenue: 1183.15, bookings: 4 },
  { campaign: "Brady Apartment Hotel Flinders Street | Sales", impressions: 1416, clicks: 13, cost: 36.10, revenue: 211.00, bookings: 1 },
  { campaign: "Brady Group | Awareness | Daily", impressions: 20138, clicks: 14, cost: 37.44, revenue: 0, bookings: 0 },
  { campaign: "Brady Group | Leads | Members", impressions: 1274, clicks: 15, cost: 42.14, revenue: 0, bookings: 0 },
  { campaign: "Brady Apartment Hotel Hardware Lane | Traffic | Daily", impressions: 2596, clicks: 35, cost: 20.09, revenue: 0, bookings: 0 },
  { campaign: "Brady Hotels Central Melbourne | Traffic | Daily", impressions: 2284, clicks: 32, cost: 20.48, revenue: 0, bookings: 0 },
  { campaign: "Brady Apartment Hotel Flinders Street | Traffic | Daily", impressions: 2348, clicks: 29, cost: 19.10, revenue: 0, bookings: 0 },
];

// Calculate totals
const TOTAL_IMPRESSIONS = METASEARCH_DATA.impressions + SEM_DATA.impressions + SOCIAL_DATA.impressions;
const TOTAL_CLICKS = METASEARCH_DATA.clicks + SEM_DATA.clicks + SOCIAL_DATA.clicks;
const TOTAL_COST = METASEARCH_DATA.cost + SEM_DATA.cost + SOCIAL_DATA.cost;
const TOTAL_REVENUE = METASEARCH_DATA.revenue + SEM_DATA.revenue + SOCIAL_DATA.revenue;
const TOTAL_BOOKINGS = METASEARCH_DATA.bookings + SEM_DATA.bookings + SOCIAL_DATA.bookings;

// Calculated metrics
const BRADY_METRICS = {
  impressions: TOTAL_IMPRESSIONS,
  clicks: TOTAL_CLICKS,
  ctr: (TOTAL_CLICKS / TOTAL_IMPRESSIONS) * 100,
  conversionRate: (TOTAL_BOOKINGS / TOTAL_CLICKS) * 100,
  cpc: TOTAL_COST / TOTAL_CLICKS,
  cost: TOTAL_COST,
  revenue: TOTAL_REVENUE,
  roas: TOTAL_REVENUE / TOTAL_COST,
  costOfSale: (TOTAL_COST / TOTAL_REVENUE) * 100,
  bookings: TOTAL_BOOKINGS,
};

// Monthly revenue data from database queries - 2025 Brady combined
const MONTHLY_DATA = [
  { month: "Jan", value: 0 },
  { month: "Feb", value: 0 },
  { month: "Mar", value: 0 },
  { month: "Apr", value: 0 },
  { month: "May", value: 0 },
  { month: "Jun", value: 0 },
  { month: "Jul", value: 127831.82 + 8761.54 },
  { month: "Aug", value: 122044.32 + 51340.05 },
  { month: "Sep", value: 130995.38 + 47241.16 },
  { month: "Oct", value: 125581.24 + 59499.71 },
  { month: "Nov", value: 125528.32 + 107535.63 },
  { month: "Dec", value: 40890.64 + 20432.40 },
];

// Helper functions for each report
const calculateDerivedMetrics = (data: { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }) => ({
  ...data,
  ctr: data.clicks > 0 && data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0,
  conversionRate: data.clicks > 0 ? (data.bookings / data.clicks) * 100 : 0,
  cpc: data.clicks > 0 ? data.cost / data.clicks : 0,
  roas: data.cost > 0 ? data.revenue / data.cost : 0,
  costOfSale: data.revenue > 0 ? (data.cost / data.revenue) * 100 : 0,
});

const REPORT_BREAKDOWN = [
  { report: "Metasearch", ...calculateDerivedMetrics(METASEARCH_DATA) },
  { report: "SEM", ...calculateDerivedMetrics(SEM_DATA) },
  { report: "Social", ...calculateDerivedMetrics(SOCIAL_DATA) },
];

const formatNumber = (value: number, type?: string): string => {
  if (type === "currency") {
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: 1 })}`;
  }
  if (type === "percent") {
    return `${value.toFixed(2)}%`;
  }
  if (type === "roas") {
    return `${value.toFixed(1)}x`;
  }
  if (value >= 1000) {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    }
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
};

const KPI_CARDS = [
  { label: "IMPRESSIONS", value: BRADY_METRICS.impressions, icon: Eye, color: "text-pink-600" },
  { label: "CLICKS", value: BRADY_METRICS.clicks, icon: MousePointer, color: "text-purple-600" },
  { label: "CTR", value: BRADY_METRICS.ctr, icon: Percent, color: "text-purple-600", format: "percent" },
  { label: "CONVERSION RATE", value: BRADY_METRICS.conversionRate, icon: Percent, color: "text-purple-600", format: "percent" },
  { label: "CPC", value: BRADY_METRICS.cpc, icon: DollarSign, color: "text-blue-600", format: "currency" },
  { label: "COST", value: BRADY_METRICS.cost, icon: DollarSign, color: "text-blue-600", format: "currency" },
  { label: "REVENUE", value: BRADY_METRICS.revenue, icon: DollarSign, color: "text-cyan-600", format: "currency" },
  { label: "ROAS", value: BRADY_METRICS.roas, icon: TrendingUp, color: "text-green-600", format: "roas" },
  { label: "COST OF SALE", value: BRADY_METRICS.costOfSale, icon: Percent, color: "text-purple-600", format: "percent" },
  { label: "BOOKINGS", value: BRADY_METRICS.bookings, icon: ShoppingCart, color: "text-orange-600" },
];

// Breakdown table component
const BreakdownTable = ({ 
  data, 
  labelKey, 
  labelHeader 
}: { 
  data: Array<{ impressions: number; clicks: number; cost: number; revenue: number; bookings: number } & Record<string, unknown>>; 
  labelKey: string;
  labelHeader: string;
}) => {
  const rows = data.map(row => ({
    label: row[labelKey] as string,
    ...calculateDerivedMetrics(row),
  }));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{labelHeader}</TableHead>
          <TableHead className="text-right">Impressions</TableHead>
          <TableHead className="text-right">Clicks</TableHead>
          <TableHead className="text-right">CTR</TableHead>
          <TableHead className="text-right">Conv. Rate</TableHead>
          <TableHead className="text-right">CPC</TableHead>
          <TableHead className="text-right">Cost</TableHead>
          <TableHead className="text-right">Revenue</TableHead>
          <TableHead className="text-right">ROAS</TableHead>
          <TableHead className="text-right">Cost of Sale</TableHead>
          <TableHead className="text-right">Bookings</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, idx) => (
          <TableRow key={idx}>
            <TableCell className="font-medium">{row.label}</TableCell>
            <TableCell className="text-right">{formatNumber(row.impressions)}</TableCell>
            <TableCell className="text-right">{formatNumber(row.clicks)}</TableCell>
            <TableCell className="text-right">{row.ctr.toFixed(2)}%</TableCell>
            <TableCell className="text-right">{row.conversionRate.toFixed(2)}%</TableCell>
            <TableCell className="text-right">${row.cpc.toFixed(2)}</TableCell>
            <TableCell className="text-right">${formatNumber(row.cost)}</TableCell>
            <TableCell className="text-right">${formatNumber(row.revenue)}</TableCell>
            <TableCell className="text-right">{row.roas.toFixed(1)}x</TableCell>
            <TableCell className="text-right">{row.costOfSale.toFixed(2)}%</TableCell>
            <TableCell className="text-right">{row.bookings.toFixed(2)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};

export default function SlideViewPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();
  const [selectedYear, setSelectedYear] = useState("2025");
  const [selectedMonth, setSelectedMonth] = useState("December");
  const [selectedTab, setSelectedTab] = useState("overview");

  // Generate KPI cards for specific report
  const getReportKPICards = (data: { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }) => {
    const metrics = calculateDerivedMetrics(data);
    return [
      { label: "IMPRESSIONS", value: metrics.impressions, icon: Eye, color: "text-pink-600" },
      { label: "CLICKS", value: metrics.clicks, icon: MousePointer, color: "text-purple-600" },
      { label: "CTR", value: metrics.ctr, icon: Percent, color: "text-purple-600", format: "percent" },
      { label: "CONVERSION RATE", value: metrics.conversionRate, icon: Percent, color: "text-purple-600", format: "percent" },
      { label: "CPC", value: metrics.cpc, icon: DollarSign, color: "text-blue-600", format: "currency" },
      { label: "COST", value: metrics.cost, icon: DollarSign, color: "text-blue-600", format: "currency" },
      { label: "REVENUE", value: metrics.revenue, icon: DollarSign, color: "text-cyan-600", format: "currency" },
      { label: "ROAS", value: metrics.roas, icon: TrendingUp, color: "text-green-600", format: "roas" },
      { label: "COST OF SALE", value: metrics.costOfSale, icon: Percent, color: "text-purple-600", format: "percent" },
      { label: "BOOKINGS", value: metrics.bookings, icon: ShoppingCart, color: "text-orange-600" },
    ];
  };

  const renderKPICards = (cards: typeof KPI_CARDS) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {cards.map((kpi) => (
        <Card key={kpi.label} className="shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className={`text-xs font-medium uppercase ${kpi.color}`}>
              {kpi.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {kpi.format === "currency" 
                ? `$${formatNumber(kpi.value)}`
                : kpi.format === "percent"
                ? `${kpi.value.toFixed(2)}%`
                : kpi.format === "roas"
                ? `${kpi.value.toFixed(1)}x`
                : formatNumber(kpi.value)}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate(`/tools/slides/${accountId}`)}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-semibold">Brady Hotels - December 2025</h1>
              <p className="text-sm text-muted-foreground">
                Data: Metasearch (Hotel: Brady*) • SEM (Account: Brady Hotels Group) • Social (Account: Brady Hotels 2025)
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Data
          </Button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Tabs and Filters Row */}
        <div className="flex items-center justify-between">
          <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
            <div className="flex items-center justify-between mb-6">
              <TabsList>
                <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Overview</TabsTrigger>
                <TabsTrigger value="metasearch">Metasearch</TabsTrigger>
                <TabsTrigger value="sem">SEM</TabsTrigger>
                <TabsTrigger value="social">Social</TabsTrigger>
                <TabsTrigger value="budget">Budget</TabsTrigger>
              </TabsList>

              <div className="flex items-center gap-2">
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="w-[100px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2024">2024</SelectItem>
                    <SelectItem value="2025">2025</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="January">January</SelectItem>
                    <SelectItem value="February">February</SelectItem>
                    <SelectItem value="March">March</SelectItem>
                    <SelectItem value="April">April</SelectItem>
                    <SelectItem value="May">May</SelectItem>
                    <SelectItem value="June">June</SelectItem>
                    <SelectItem value="July">July</SelectItem>
                    <SelectItem value="August">August</SelectItem>
                    <SelectItem value="September">September</SelectItem>
                    <SelectItem value="October">October</SelectItem>
                    <SelectItem value="November">November</SelectItem>
                    <SelectItem value="December">December</SelectItem>
                  </SelectContent>
                </Select>
                <Select defaultValue="none">
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="No Comparison" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Comparison</SelectItem>
                    <SelectItem value="previous_period">Previous Period</SelectItem>
                    <SelectItem value="previous_year">Previous Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              {renderKPICards(KPI_CARDS)}

              {/* Monthly Results Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium">Monthly Results (2025) - Metasearch + Social Revenue</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={MONTHLY_DATA}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis 
                          dataKey="month" 
                          axisLine={false} 
                          tickLine={false}
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis 
                          axisLine={false} 
                          tickLine={false}
                          tick={{ fontSize: 12 }}
                          tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`}
                        />
                        <Tooltip 
                          formatter={(value: number) => [`$${value.toLocaleString()}`, "Revenue"]}
                          contentStyle={{ 
                            backgroundColor: 'hsl(var(--card))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '8px'
                          }}
                        />
                        <Bar 
                          dataKey="value" 
                          fill="hsl(var(--primary))" 
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Report Breakdown Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium">
                    <span className="font-semibold">Period:</span> December (Dec 1 - Dec 31, 2025)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Report</TableHead>
                        <TableHead className="text-right">Impressions ↕</TableHead>
                        <TableHead className="text-right">Clicks ↕</TableHead>
                        <TableHead className="text-right">CTR ↕</TableHead>
                        <TableHead className="text-right">Conversion rate ↕</TableHead>
                        <TableHead className="text-right">CPC ↕</TableHead>
                        <TableHead className="text-right">Cost ↕</TableHead>
                        <TableHead className="text-right">Revenue ↕</TableHead>
                        <TableHead className="text-right">ROAS ↕</TableHead>
                        <TableHead className="text-right">Cost of sale ↕</TableHead>
                        <TableHead className="text-right">Bookings ↕</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {REPORT_BREAKDOWN.map((row) => (
                        <TableRow key={row.report}>
                          <TableCell className="font-medium">{row.report}</TableCell>
                          <TableCell className="text-right">{formatNumber(row.impressions)}</TableCell>
                          <TableCell className="text-right">{formatNumber(row.clicks)}</TableCell>
                          <TableCell className="text-right">{row.ctr.toFixed(2)}%</TableCell>
                          <TableCell className="text-right">{row.conversionRate.toFixed(2)}%</TableCell>
                          <TableCell className="text-right">${row.cpc.toFixed(2)}</TableCell>
                          <TableCell className="text-right">${formatNumber(row.cost)}</TableCell>
                          <TableCell className="text-right">${formatNumber(row.revenue)}</TableCell>
                          <TableCell className="text-right">{row.roas.toFixed(1)}x</TableCell>
                          <TableCell className="text-right">{row.costOfSale.toFixed(2)}%</TableCell>
                          <TableCell className="text-right">{row.bookings.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Metasearch Tab */}
            <TabsContent value="metasearch" className="space-y-6">
              {renderKPICards(getReportKPICards(METASEARCH_DATA))}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium">Results by Hotel</CardTitle>
                </CardHeader>
                <CardContent>
                  <BreakdownTable 
                    data={METASEARCH_BY_HOTEL} 
                    labelKey="hotel" 
                    labelHeader="Hotel" 
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium">Results by Link Type</CardTitle>
                </CardHeader>
                <CardContent>
                  <BreakdownTable 
                    data={METASEARCH_BY_LINK_TYPE} 
                    labelKey="linkType" 
                    labelHeader="Link Type" 
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* SEM Tab */}
            <TabsContent value="sem" className="space-y-6">
              {renderKPICards(getReportKPICards(SEM_DATA))}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium">Results by Campaign</CardTitle>
                </CardHeader>
                <CardContent>
                  <BreakdownTable 
                    data={SEM_BY_CAMPAIGN} 
                    labelKey="campaign" 
                    labelHeader="Campaign" 
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Social Tab */}
            <TabsContent value="social" className="space-y-6">
              {renderKPICards(getReportKPICards(SOCIAL_DATA))}

              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium">Results by Campaign</CardTitle>
                </CardHeader>
                <CardContent>
                  <BreakdownTable 
                    data={SOCIAL_BY_CAMPAIGN} 
                    labelKey="campaign" 
                    labelHeader="Campaign" 
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Budget Tab */}
            <TabsContent value="budget" className="space-y-6">
              <Card>
                <CardContent className="py-10">
                  <div className="text-center text-muted-foreground">
                    Budget data will be added here
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
