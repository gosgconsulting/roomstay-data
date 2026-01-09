import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, RefreshCw, Eye, MousePointer, DollarSign, Percent, TrendingUp, ShoppingCart } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

// Hardcoded Brady data for December 2025 - matching the screenshot UI
const BRADY_METRICS = {
  impressions: 950800,
  clicks: 14700,
  ctr: 1.55,
  conversionRate: 3.53,
  cpc: 1.04,
  cost: 15300,
  revenue: 278600,
  roas: 18,
  costOfSale: 5.48,
  bookings: 520.50,
};

const MONTHLY_DATA = [
  { month: "Jan", value: 520000 },
  { month: "Feb", value: 380000 },
  { month: "Mar", value: 350000 },
  { month: "Apr", value: 380000 },
  { month: "May", value: 420000 },
  { month: "Jun", value: 50000 },
  { month: "Jul", value: 30000 },
  { month: "Aug", value: 80000 },
  { month: "Sep", value: 280000 },
  { month: "Oct", value: 320000 },
  { month: "Nov", value: 340000 },
  { month: "Dec", value: 260000 },
];

const REPORT_BREAKDOWN = [
  {
    report: "Metasearch",
    impressions: 27100,
    clicks: 1900,
    ctr: 7.08,
    conversionRate: 3.60,
    cpc: 1.43,
    cost: 2700,
    revenue: 35100,
    roas: 13,
    costOfSale: 7.78,
    bookings: 69,
  },
  {
    report: "SEM",
    impressions: 432100,
    clicks: 9800,
    ctr: 2.27,
    conversionRate: 3.04,
    cpc: 0.84,
    cost: 8200,
    revenue: 155600,
    roas: 19,
    costOfSale: 5.28,
    bookings: 297.50,
  },
  {
    report: "Social",
    impressions: 491600,
    clicks: 3000,
    ctr: 0.61,
    conversionRate: 5.10,
    cpc: 1.44,
    cost: 4300,
    revenue: 87900,
    roas: 20,
    costOfSale: 4.94,
    bookings: 154,
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
    return `${value}x`;
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
              <h1 className="text-xl font-semibold">Brady - December 2025</h1>
              <p className="text-sm text-muted-foreground">Pre-rendered slide with cached data</p>
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
                    ? `${kpi.value}x`
                    : formatNumber(kpi.value)}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Monthly Results Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">Monthly Results (2025)</CardTitle>
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
                    <TableCell className="text-right">{row.roas}x</TableCell>
                    <TableCell className="text-right">{row.costOfSale.toFixed(2)}%</TableCell>
                    <TableCell className="text-right">{row.bookings}</TableCell>
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
