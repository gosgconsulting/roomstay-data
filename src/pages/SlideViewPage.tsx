import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, RefreshCw, Eye, MousePointer, DollarSign, Percent, TrendingUp, ShoppingCart } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// REAL DATA from database queries - December 2025 Brady Hotels
// Dimension IDs:
// Account: 277ec940-a91b-4c95-b1e2-4a8fd5814d04
// Hotel: 093ac487-dd90-4466-9972-ac51d110e91e  
// Date: a4cb2da4-d281-4c77-969a-7b048aa91287
// Impressions: 89c229d9-8a6e-4d94-a0d2-a4b43b6f3fe1
// Clicks: 1caad3eb-3d5e-405c-9df7-1c96971171c5
// Cost: fb281b3f-c800-48f4-b34b-02d4f0244b07
// Revenue: 7f4cb2e9-52a3-4110-803a-58d2e7afacb5
// Bookings: 79aeb7f7-a9c6-43cd-bd05-ff7df81babf1

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
  { month: "Jun", value: 0 }, // Social had null
  { month: "Jul", value: 127831.82 + 8761.54 }, // Metasearch + Social
  { month: "Aug", value: 122044.32 + 51340.05 },
  { month: "Sep", value: 130995.38 + 47241.16 },
  { month: "Oct", value: 125581.24 + 59499.71 },
  { month: "Nov", value: 125528.32 + 107535.63 },
  { month: "Dec", value: 40890.64 + 20432.40 }, // December Metasearch + Social
];

// Helper functions for each report
const calculateDerivedMetrics = (data: { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }) => ({
  ...data,
  ctr: data.clicks > 0 ? (data.clicks / data.impressions) * 100 : 0,
  conversionRate: data.clicks > 0 ? (data.bookings / data.clicks) * 100 : 0,
  cpc: data.clicks > 0 ? data.cost / data.clicks : 0,
  roas: data.cost > 0 ? data.revenue / data.cost : 0,
  costOfSale: data.revenue > 0 ? (data.cost / data.revenue) * 100 : 0,
});

const REPORT_BREAKDOWN = [
  {
    report: "Metasearch",
    ...calculateDerivedMetrics(METASEARCH_DATA),
  },
  {
    report: "SEM",
    ...calculateDerivedMetrics(SEM_DATA),
  },
  {
    report: "Social",
    ...calculateDerivedMetrics(SOCIAL_DATA),
  },
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

export default function SlideViewPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();
  const [selectedYear, setSelectedYear] = useState("2025");
  const [selectedMonth, setSelectedMonth] = useState("December");
  const [selectedTab, setSelectedTab] = useState("overview");

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
        {/* Info banner */}
        <div className="text-sm text-muted-foreground">
          Breakdown tables are available on each report tab. Switch from "Overview" to a specific report to see the breakdown.
        </div>

        {/* Tabs and Filters Row */}
        <div className="flex items-center justify-between">
          <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-auto">
            <TabsList>
              <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Overview</TabsTrigger>
              <TabsTrigger value="metasearch">Metasearch</TabsTrigger>
              <TabsTrigger value="sem">SEM</TabsTrigger>
              <TabsTrigger value="social">Social</TabsTrigger>
              <TabsTrigger value="budget">Budget</TabsTrigger>
            </TabsList>
          </Tabs>

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

        {/* KPI Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {KPI_CARDS.map((kpi) => (
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
      </div>
    </div>
  );
}
