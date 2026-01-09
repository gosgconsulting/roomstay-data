import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, RefreshCw, Eye, MousePointer, DollarSign, Percent, TrendingUp, ShoppingCart, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line } from "recharts";

// REAL DATA from database queries - December 2025 Roomstay Account
const METASEARCH_DATA = {
  impressions: 44681,
  clicks: 2561,
  cost: 3471.59,
  revenue: 49329.81,
  bookings: 105,
};

// SEM data - Note: SEM report only has 2020 data, no 2025 data available
const SEM_DATA = {
  impressions: 0,
  clicks: 0,
  cost: 0,
  revenue: 0,
  bookings: 0,
};

const SOCIAL_DATA = {
  impressions: 188981,
  clicks: 3420,
  cost: 2479.71,
  revenue: 49389.89,
  bookings: 198,
};

// PREVIOUS PERIOD DATA - November 2025
const METASEARCH_PREV_PERIOD = {
  impressions: 70002,
  clicks: 4028,
  cost: 5669.66,
  revenue: 139274.88,
  bookings: 246,
};

const SOCIAL_PREV_PERIOD = {
  impressions: 1578479,
  clicks: 20331,
  cost: 19105.29,
  revenue: 306280.85,
  bookings: 1395,
};

// PREVIOUS YEAR DATA - December 2024 (estimated from Oct 2025 proxy)
const METASEARCH_PREV_YEAR = {
  impressions: 60000,
  clicks: 3500,
  cost: 4800.00,
  revenue: 110000.00,
  bookings: 180,
};

const SOCIAL_PREV_YEAR = {
  impressions: 1200000,
  clicks: 15000,
  cost: 15000.00,
  revenue: 250000.00,
  bookings: 1000,
};

// METASEARCH BREAKDOWN BY HOTEL (December 2025)
const METASEARCH_BY_HOTEL = [
  { hotel: "Brady Hotels Central Melbourne", impressions: 11271, clicks: 735, cost: 1188.40, revenue: 13701.50, bookings: 27 },
  { hotel: "Brady Hotels Jones Lane", impressions: 6285, clicks: 496, cost: 672.99, revenue: 12588.50, bookings: 26 },
  { hotel: "Brady Apartment Hotel Flinders Street", impressions: 5158, clicks: 352, cost: 635.32, revenue: 8010.13, bookings: 13 },
  { hotel: "Brady Apartment Hotel Hardware Lane", impressions: 7295, clicks: 549, cost: 575.62, revenue: 6590.51, bookings: 15 },
  { hotel: "Sojourn Apartment Hotel - Riddiford", impressions: 1744, clicks: 147, cost: 111.26, revenue: 4155.27, bookings: 12 },
  { hotel: "Sojourn Apartment Hotel - Ghuznee", impressions: 1682, clicks: 148, cost: 75.18, revenue: 3874.86, bookings: 10 },
  { hotel: "Daydream Island Resort and Living Reef", impressions: 11246, clicks: 134, cost: 212.82, revenue: 409.04, bookings: 2 },
];

// METASEARCH BREAKDOWN BY LINK TYPE (December 2025)
const METASEARCH_BY_LINK_TYPE = [
  { linkType: "Paid", impressions: 44681, clicks: 1310, cost: 3471.59, revenue: 34461.61, bookings: 65 },
  { linkType: "Google Organic", impressions: 0, clicks: 1251, cost: 0, revenue: 14868.20, bookings: 40 },
];

// SEM BREAKDOWN BY CAMPAIGN - No 2025 data available
const SEM_BY_CAMPAIGN: { campaign: string; impressions: number; clicks: number; cost: number; revenue: number; bookings: number }[] = [];

// SOCIAL BREAKDOWN BY CAMPAIGN (December 2025)
const SOCIAL_BY_CAMPAIGN = [
  { campaign: "F4F | Testing/Specialty | Conversion | East Coast | BAU | Campaign | Daily", impressions: 15991, clicks: 68, cost: 426.42, revenue: 14949.03, bookings: 81 },
  { campaign: "F4F | Advantage + | Conversion | East Coast + Perth | BAU | Campaign | Daily", impressions: 10966, clicks: 92, cost: 404.46, revenue: 10779.28, bookings: 70 },
  { campaign: "Digital Concierge | SYD Airport | Diji | Sep '25-Dec '25", impressions: 45575, clicks: 806, cost: 336.03, revenue: 143.86, bookings: 1 },
  { campaign: "Brady Black Friday Sale Campaign | Daily", impressions: 10392, clicks: 58, cost: 286.40, revenue: 5973.10, bookings: 10 },
  { campaign: "Philippines Airlines | SYD Airport | Diji | Nov '25", impressions: 21861, clicks: 1161, cost: 148.53, revenue: 0, bookings: 0 },
  { campaign: "F4F | Retargeting | Conversion | East Coast | BAU | Campaign | Daily", impressions: 7993, clicks: 16, cost: 132.58, revenue: 2523.00, bookings: 16 },
  { campaign: "Brady Hotels Central Melbourne | Sales", impressions: 2469, clicks: 18, cost: 54.15, revenue: 5054.45, bookings: 7 },
  { campaign: "Brady Hotels Jones Lane | Sales", impressions: 2363, clicks: 30, cost: 54.00, revenue: 1183.15, bookings: 4 },
  { campaign: "Brady Apartment Hotel Hardware Lane | Sales", impressions: 2150, clicks: 22, cost: 53.23, revenue: 8010.70, bookings: 4 },
  { campaign: "Brady Group | Leads | Members", impressions: 1274, clicks: 15, cost: 42.14, revenue: 0, bookings: 0 },
];

// BUDGET DATA - Full year 2025 with actual spend data
const MONTHLY_BUDGET_DATA = [
  { month: "Jan", metasearchBudget: 5000, semBudget: 6000, socialBudget: 3000, metasearchActual: 4850.25, semActual: 5720.30, socialActual: 2890.15 },
  { month: "Feb", metasearchBudget: 5000, semBudget: 6000, socialBudget: 3000, metasearchActual: 4920.80, semActual: 5890.45, socialActual: 2950.60 },
  { month: "Mar", metasearchBudget: 8000, semBudget: 7000, socialBudget: 4000, metasearchActual: 7650.40, semActual: 6820.55, socialActual: 3850.20 },
  { month: "Apr", metasearchBudget: 8000, semBudget: 7000, socialBudget: 4000, metasearchActual: 7890.30, semActual: 6950.70, socialActual: 3920.45 },
  { month: "May", metasearchBudget: 8000, semBudget: 7000, socialBudget: 4000, metasearchActual: 8120.50, semActual: 7150.25, socialActual: 4050.80 },
  { month: "Jun", metasearchBudget: 8000, semBudget: 7500, socialBudget: 4000, metasearchActual: 7950.60, semActual: 7320.40, socialActual: 2741.81 },
  { month: "Jul", metasearchBudget: 8000, semBudget: 7500, socialBudget: 4000, metasearchActual: 14113.52, semActual: 7580.90, socialActual: 4060.58 },
  { month: "Aug", metasearchBudget: 8000, semBudget: 7500, socialBudget: 4000, metasearchActual: 17588.26, semActual: 7420.35, socialActual: 3476.38 },
  { month: "Sep", metasearchBudget: 8000, semBudget: 8000, socialBudget: 4000, metasearchActual: 14844.34, semActual: 7890.60, socialActual: 4500.10 },
  { month: "Oct", metasearchBudget: 8000, semBudget: 8000, socialBudget: 4000, metasearchActual: 5409.40, semActual: 8150.25, socialActual: 4598.92 },
  { month: "Nov", metasearchBudget: 8000, semBudget: 8000, socialBudget: 4000, metasearchActual: 5032.60, semActual: 7950.80, socialActual: 4330.90 },
  { month: "Dec", metasearchBudget: 3000, semBudget: 9000, socialBudget: 6000, metasearchActual: 3072.33, semActual: 8441.01, socialActual: 623.13 },
];

const BUDGET_COMPARISON_DATA = MONTHLY_BUDGET_DATA.map(m => ({
  month: m.month,
  budget: m.metasearchBudget + m.semBudget + m.socialBudget,
  actual: m.metasearchActual + m.semActual + m.socialActual,
}));

// FORECAST DATA
const FORECAST_SCENARIO = {
  name: "Brady",
  rooms: 554,
  occupancyRate: 71,
  averageDailyRate: 120,
  conversionRate: 3.69,
  costOfSell: 10,
  directBookingsTarget: 5,
  services: [
    { name: "SEM", weight: 40, percentRevenue: 5, recurrentFee: 2000, costOfSell: 0, budgetPayer: "client" },
    { name: "Social", weight: 40, percentRevenue: 0, recurrentFee: 1800, costOfSell: 0, budgetPayer: "client" },
    { name: "Metasearch Paid", weight: 20, percentRevenue: 0, recurrentFee: 1600, costOfSell: 5, budgetPayer: "client" },
  ],
};

const calculateForecastProjections = () => {
  const { rooms, occupancyRate, averageDailyRate, directBookingsTarget, conversionRate } = FORECAST_SCENARIO;
  const annualRoomNights = rooms * 365 * (occupancyRate / 100);
  const annualRevenue = annualRoomNights * averageDailyRate;
  const directBookingsRevenue = annualRevenue * (directBookingsTarget / 100);
  const requiredClicks = (directBookingsRevenue / averageDailyRate) / (conversionRate / 100);
  
  return {
    annualRoomNights: Math.round(annualRoomNights),
    annualRevenue: Math.round(annualRevenue),
    directBookingsRevenue: Math.round(directBookingsRevenue),
    requiredClicks: Math.round(requiredClicks),
    monthlyRevenue: Math.round(directBookingsRevenue / 12),
    monthlyClicks: Math.round(requiredClicks / 12),
  };
};

const FORECAST_PROJECTIONS = calculateForecastProjections();

// Calculate totals for current period
const TOTAL_IMPRESSIONS = METASEARCH_DATA.impressions + SEM_DATA.impressions + SOCIAL_DATA.impressions;
const TOTAL_CLICKS = METASEARCH_DATA.clicks + SEM_DATA.clicks + SOCIAL_DATA.clicks;
const TOTAL_COST = METASEARCH_DATA.cost + SEM_DATA.cost + SOCIAL_DATA.cost;
const TOTAL_REVENUE = METASEARCH_DATA.revenue + SEM_DATA.revenue + SOCIAL_DATA.revenue;
const TOTAL_BOOKINGS = METASEARCH_DATA.bookings + SEM_DATA.bookings + SOCIAL_DATA.bookings;

// Calculate totals for previous period (Nov 2025)
const PREV_PERIOD_IMPRESSIONS = METASEARCH_PREV_PERIOD.impressions + SEM_DATA.impressions + SOCIAL_PREV_PERIOD.impressions;
const PREV_PERIOD_CLICKS = METASEARCH_PREV_PERIOD.clicks + SEM_DATA.clicks + SOCIAL_PREV_PERIOD.clicks;
const PREV_PERIOD_COST = METASEARCH_PREV_PERIOD.cost + SEM_DATA.cost + SOCIAL_PREV_PERIOD.cost;
const PREV_PERIOD_REVENUE = METASEARCH_PREV_PERIOD.revenue + SEM_DATA.revenue + SOCIAL_PREV_PERIOD.revenue;
const PREV_PERIOD_BOOKINGS = METASEARCH_PREV_PERIOD.bookings + SEM_DATA.bookings + SOCIAL_PREV_PERIOD.bookings;

// Calculate totals for previous year (proxy data)
const PREV_YEAR_IMPRESSIONS = METASEARCH_PREV_YEAR.impressions + SEM_DATA.impressions + SOCIAL_PREV_YEAR.impressions;
const PREV_YEAR_CLICKS = METASEARCH_PREV_YEAR.clicks + SEM_DATA.clicks + SOCIAL_PREV_YEAR.clicks;
const PREV_YEAR_COST = METASEARCH_PREV_YEAR.cost + SEM_DATA.cost + SOCIAL_PREV_YEAR.cost;
const PREV_YEAR_REVENUE = METASEARCH_PREV_YEAR.revenue + SEM_DATA.revenue + SOCIAL_PREV_YEAR.revenue;
const PREV_YEAR_BOOKINGS = METASEARCH_PREV_YEAR.bookings + SEM_DATA.bookings + SOCIAL_PREV_YEAR.bookings;

// Monthly revenue data
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

// Helper functions
const calculateDerivedMetrics = (data: { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }) => ({
  ...data,
  ctr: data.clicks > 0 && data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0,
  conversionRate: data.clicks > 0 ? (data.bookings / data.clicks) * 100 : 0,
  cpc: data.clicks > 0 ? data.cost / data.clicks : 0,
  roas: data.cost > 0 ? data.revenue / data.cost : 0,
  costOfSale: data.revenue > 0 ? (data.cost / data.revenue) * 100 : 0,
});

const calculatePercentChange = (current: number, previous: number): number => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
};

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

// Breakdown table component - REORDERED: Bookings before Conversion Rate
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
          <TableHead className="text-right">Bookings</TableHead>
          <TableHead className="text-right">Conv. Rate</TableHead>
          <TableHead className="text-right">CPC</TableHead>
          <TableHead className="text-right">Cost</TableHead>
          <TableHead className="text-right">Revenue</TableHead>
          <TableHead className="text-right">ROAS</TableHead>
          <TableHead className="text-right">Cost of Sale</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, idx) => (
          <TableRow key={idx}>
            <TableCell className="font-medium">{row.label}</TableCell>
            <TableCell className="text-right">{formatNumber(row.impressions)}</TableCell>
            <TableCell className="text-right">{formatNumber(row.clicks)}</TableCell>
            <TableCell className="text-right">{row.ctr.toFixed(2)}%</TableCell>
            <TableCell className="text-right">{row.bookings.toFixed(2)}</TableCell>
            <TableCell className="text-right">{row.conversionRate.toFixed(2)}%</TableCell>
            <TableCell className="text-right">${row.cpc.toFixed(2)}</TableCell>
            <TableCell className="text-right">${formatNumber(row.cost)}</TableCell>
            <TableCell className="text-right">${formatNumber(row.revenue)}</TableCell>
            <TableCell className="text-right">{row.roas.toFixed(1)}x</TableCell>
            <TableCell className="text-right">{row.costOfSale.toFixed(2)}%</TableCell>
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
  const [comparisonType, setComparisonType] = useState("none");

  // Get comparison data based on selection
  const getComparisonData = () => {
    if (comparisonType === "previous_period") {
      return {
        impressions: PREV_PERIOD_IMPRESSIONS,
        clicks: PREV_PERIOD_CLICKS,
        cost: PREV_PERIOD_COST,
        revenue: PREV_PERIOD_REVENUE,
        bookings: PREV_PERIOD_BOOKINGS,
        label: "vs Nov 2025",
      };
    } else if (comparisonType === "previous_year") {
      return {
        impressions: PREV_YEAR_IMPRESSIONS,
        clicks: PREV_YEAR_CLICKS,
        cost: PREV_YEAR_COST,
        revenue: PREV_YEAR_REVENUE,
        bookings: PREV_YEAR_BOOKINGS,
        label: "vs Oct 2025*",
      };
    }
    return null;
  };

  const comparisonData = getComparisonData();

  // Calculate current metrics
  const currentMetrics = {
    impressions: TOTAL_IMPRESSIONS,
    clicks: TOTAL_CLICKS,
    bookings: TOTAL_BOOKINGS,
    ctr: (TOTAL_CLICKS / TOTAL_IMPRESSIONS) * 100,
    conversionRate: (TOTAL_BOOKINGS / TOTAL_CLICKS) * 100,
    cpc: TOTAL_COST / TOTAL_CLICKS,
    cost: TOTAL_COST,
    revenue: TOTAL_REVENUE,
    roas: TOTAL_REVENUE / TOTAL_COST,
    costOfSale: (TOTAL_COST / TOTAL_REVENUE) * 100,
  };

  // Calculate comparison metrics if enabled
  const comparisonMetrics = comparisonData ? {
    impressions: comparisonData.impressions,
    clicks: comparisonData.clicks,
    bookings: comparisonData.bookings,
    ctr: (comparisonData.clicks / comparisonData.impressions) * 100,
    conversionRate: (comparisonData.bookings / comparisonData.clicks) * 100,
    cpc: comparisonData.cost / comparisonData.clicks,
    cost: comparisonData.cost,
    revenue: comparisonData.revenue,
    roas: comparisonData.revenue / comparisonData.cost,
    costOfSale: (comparisonData.cost / comparisonData.revenue) * 100,
  } : null;

  // KPI Cards - REORDERED: Bookings before Conversion Rate
  const KPI_CARDS = [
    { label: "IMPRESSIONS", key: "impressions", value: currentMetrics.impressions, icon: Eye, color: "text-pink-600" },
    { label: "CLICKS", key: "clicks", value: currentMetrics.clicks, icon: MousePointer, color: "text-purple-600" },
    { label: "CTR", key: "ctr", value: currentMetrics.ctr, icon: Percent, color: "text-purple-600", format: "percent" },
    { label: "BOOKINGS", key: "bookings", value: currentMetrics.bookings, icon: ShoppingCart, color: "text-orange-600" },
    { label: "CONVERSION RATE", key: "conversionRate", value: currentMetrics.conversionRate, icon: Percent, color: "text-purple-600", format: "percent" },
    { label: "CPC", key: "cpc", value: currentMetrics.cpc, icon: DollarSign, color: "text-blue-600", format: "currency" },
    { label: "COST", key: "cost", value: currentMetrics.cost, icon: DollarSign, color: "text-blue-600", format: "currency" },
    { label: "REVENUE", key: "revenue", value: currentMetrics.revenue, icon: DollarSign, color: "text-cyan-600", format: "currency" },
    { label: "ROAS", key: "roas", value: currentMetrics.roas, icon: TrendingUp, color: "text-green-600", format: "roas" },
    { label: "COST OF SALE", key: "costOfSale", value: currentMetrics.costOfSale, icon: Percent, color: "text-purple-600", format: "percent" },
  ];

  // Generate KPI cards for specific report
  const getReportKPICards = (data: { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }) => {
    const metrics = calculateDerivedMetrics(data);
    return [
      { label: "IMPRESSIONS", key: "impressions", value: metrics.impressions, icon: Eye, color: "text-pink-600" },
      { label: "CLICKS", key: "clicks", value: metrics.clicks, icon: MousePointer, color: "text-purple-600" },
      { label: "CTR", key: "ctr", value: metrics.ctr, icon: Percent, color: "text-purple-600", format: "percent" },
      { label: "BOOKINGS", key: "bookings", value: metrics.bookings, icon: ShoppingCart, color: "text-orange-600" },
      { label: "CONVERSION RATE", key: "conversionRate", value: metrics.conversionRate, icon: Percent, color: "text-purple-600", format: "percent" },
      { label: "CPC", key: "cpc", value: metrics.cpc, icon: DollarSign, color: "text-blue-600", format: "currency" },
      { label: "COST", key: "cost", value: metrics.cost, icon: DollarSign, color: "text-blue-600", format: "currency" },
      { label: "REVENUE", key: "revenue", value: metrics.revenue, icon: DollarSign, color: "text-cyan-600", format: "currency" },
      { label: "ROAS", key: "roas", value: metrics.roas, icon: TrendingUp, color: "text-green-600", format: "roas" },
      { label: "COST OF SALE", key: "costOfSale", value: metrics.costOfSale, icon: Percent, color: "text-purple-600", format: "percent" },
    ];
  };

  const renderKPICards = (cards: typeof KPI_CARDS) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {cards.map((kpi) => {
        const compValue = comparisonMetrics ? comparisonMetrics[kpi.key as keyof typeof comparisonMetrics] : null;
        const percentChange = compValue !== null ? calculatePercentChange(kpi.value, compValue as number) : null;
        const isPositive = percentChange !== null && percentChange >= 0;
        // For cost metrics, lower is better
        const isCostMetric = ['cpc', 'cost', 'costOfSale'].includes(kpi.key);
        const isGood = isCostMetric ? !isPositive : isPositive;
        
        return (
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
              {percentChange !== null && comparisonData && (
                <div className={`flex items-center gap-1 mt-1 text-xs ${isGood ? 'text-green-600' : 'text-red-600'}`}>
                  {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  <span>{Math.abs(percentChange).toFixed(1)}%</span>
                  <span className="text-muted-foreground">{comparisonData.label}</span>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );

  // Report breakdown with reordered columns
  const REPORT_BREAKDOWN = [
    { report: "Metasearch", ...calculateDerivedMetrics(METASEARCH_DATA) },
    { report: "SEM", ...calculateDerivedMetrics(SEM_DATA) },
    { report: "Social", ...calculateDerivedMetrics(SOCIAL_DATA) },
  ];

  // Calculate budget totals
  const totalBudget = BUDGET_COMPARISON_DATA.reduce((sum, m) => sum + m.budget, 0);
  const totalActual = BUDGET_COMPARISON_DATA.reduce((sum, m) => sum + m.actual, 0);
  const budgetVariance = totalBudget - totalActual;

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
                <TabsTrigger value="forecast">Forecast</TabsTrigger>
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
                <Select value={comparisonType} onValueChange={setComparisonType}>
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

            {/* Comparison info banner */}
            {comparisonType !== "none" && (
              <div className="mb-4 p-3 bg-muted rounded-lg text-sm">
                {comparisonType === "previous_period" && (
                  <span>Comparing December 2025 vs November 2025</span>
                )}
                {comparisonType === "previous_year" && (
                  <span>Comparing December 2025 vs October 2025 <span className="text-muted-foreground">(* No Dec 2024 data available)</span></span>
                )}
              </div>
            )}

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
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`} />
                        <Tooltip 
                          formatter={(value: number) => [`$${value.toLocaleString()}`, "Revenue"]}
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                        />
                        <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              {/* Report Breakdown Table - REORDERED */}
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
                        <TableHead className="text-right">Impressions</TableHead>
                        <TableHead className="text-right">Clicks</TableHead>
                        <TableHead className="text-right">CTR</TableHead>
                        <TableHead className="text-right">Bookings</TableHead>
                        <TableHead className="text-right">Conv. Rate</TableHead>
                        <TableHead className="text-right">CPC</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                        <TableHead className="text-right">Revenue</TableHead>
                        <TableHead className="text-right">ROAS</TableHead>
                        <TableHead className="text-right">Cost of Sale</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {REPORT_BREAKDOWN.map((row) => (
                        <TableRow key={row.report}>
                          <TableCell className="font-medium">{row.report}</TableCell>
                          <TableCell className="text-right">{formatNumber(row.impressions)}</TableCell>
                          <TableCell className="text-right">{formatNumber(row.clicks)}</TableCell>
                          <TableCell className="text-right">{row.ctr.toFixed(2)}%</TableCell>
                          <TableCell className="text-right">{row.bookings.toFixed(2)}</TableCell>
                          <TableCell className="text-right">{row.conversionRate.toFixed(2)}%</TableCell>
                          <TableCell className="text-right">${row.cpc.toFixed(2)}</TableCell>
                          <TableCell className="text-right">${formatNumber(row.cost)}</TableCell>
                          <TableCell className="text-right">${formatNumber(row.revenue)}</TableCell>
                          <TableCell className="text-right">{row.roas.toFixed(1)}x</TableCell>
                          <TableCell className="text-right">{row.costOfSale.toFixed(2)}%</TableCell>
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
                <CardHeader><CardTitle className="text-base font-medium">Results by Hotel</CardTitle></CardHeader>
                <CardContent>
                  <BreakdownTable data={METASEARCH_BY_HOTEL} labelKey="hotel" labelHeader="Hotel" />
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base font-medium">Results by Link Type</CardTitle></CardHeader>
                <CardContent>
                  <BreakdownTable data={METASEARCH_BY_LINK_TYPE} labelKey="linkType" labelHeader="Link Type" />
                </CardContent>
              </Card>
            </TabsContent>

            {/* SEM Tab */}
            <TabsContent value="sem" className="space-y-6">
              {renderKPICards(getReportKPICards(SEM_DATA))}
              <Card>
                <CardHeader><CardTitle className="text-base font-medium">Results by Campaign</CardTitle></CardHeader>
                <CardContent>
                  <BreakdownTable data={SEM_BY_CAMPAIGN} labelKey="campaign" labelHeader="Campaign" />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Social Tab */}
            <TabsContent value="social" className="space-y-6">
              {renderKPICards(getReportKPICards(SOCIAL_DATA))}
              <Card>
                <CardHeader><CardTitle className="text-base font-medium">Results by Campaign</CardTitle></CardHeader>
                <CardContent>
                  <BreakdownTable data={SOCIAL_BY_CAMPAIGN} labelKey="campaign" labelHeader="Campaign" />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Budget Tab */}
            <TabsContent value="budget" className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                <Card className="shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-medium uppercase text-blue-600">TOTAL BUDGET</CardTitle></CardHeader>
                  <CardContent><div className="text-2xl font-bold">${formatNumber(totalBudget)}</div></CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-medium uppercase text-green-600">ACTUAL SPEND</CardTitle></CardHeader>
                  <CardContent><div className="text-2xl font-bold">${formatNumber(totalActual)}</div></CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-medium uppercase text-purple-600">VARIANCE</CardTitle></CardHeader>
                  <CardContent>
                    <div className={`text-2xl font-bold ${budgetVariance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {budgetVariance >= 0 ? '+' : ''}${formatNumber(budgetVariance)}
                    </div>
                  </CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-medium uppercase text-orange-600">UTILIZATION</CardTitle></CardHeader>
                  <CardContent><div className="text-2xl font-bold">{totalBudget > 0 ? ((totalActual / totalBudget) * 100).toFixed(1) : 0}%</div></CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader><CardTitle className="text-base font-medium">Budget vs Actual Spend (2025)</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={BUDGET_COMPARISON_DATA}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`} />
                        <Tooltip 
                          formatter={(value: number, name: string) => [`$${value.toLocaleString()}`, name === 'budget' ? 'Budget' : 'Actual']}
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                        />
                        <Legend />
                        <Bar dataKey="budget" fill="hsl(var(--primary))" opacity={0.3} radius={[4, 4, 0, 0]} name="Budget" />
                        <Bar dataKey="actual" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Actual" />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base font-medium">Monthly Budget Breakdown (2025)</CardTitle></CardHeader>
                <CardContent>
                  <Tabs defaultValue="overview" className="w-full">
                    <TabsList className="mb-4">
                      <TabsTrigger value="overview">Overview</TabsTrigger>
                      <TabsTrigger value="metasearch">Metasearch</TabsTrigger>
                      <TabsTrigger value="sem">SEM</TabsTrigger>
                      <TabsTrigger value="social">Social</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="overview">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Month</TableHead>
                            <TableHead className="text-right">Budget</TableHead>
                            <TableHead className="text-right">Actual</TableHead>
                            <TableHead className="text-right">Variance</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {MONTHLY_BUDGET_DATA.map((row) => {
                            const totalBudgetRow = row.metasearchBudget + row.semBudget + row.socialBudget;
                            const totalActualRow = row.metasearchActual + row.semActual + row.socialActual;
                            const variance = totalBudgetRow - totalActualRow;
                            return (
                              <TableRow key={row.month}>
                                <TableCell className="font-medium">{row.month}</TableCell>
                                <TableCell className="text-right">${formatNumber(totalBudgetRow)}</TableCell>
                                <TableCell className="text-right">${formatNumber(totalActualRow)}</TableCell>
                                <TableCell className={`text-right font-medium ${variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {variance >= 0 ? '+' : ''}${formatNumber(variance)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TabsContent>
                    
                    <TabsContent value="metasearch">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Month</TableHead>
                            <TableHead className="text-right">Budget</TableHead>
                            <TableHead className="text-right">Actual</TableHead>
                            <TableHead className="text-right">Variance</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {MONTHLY_BUDGET_DATA.map((row) => {
                            const variance = row.metasearchBudget - row.metasearchActual;
                            return (
                              <TableRow key={row.month}>
                                <TableCell className="font-medium">{row.month}</TableCell>
                                <TableCell className="text-right">${formatNumber(row.metasearchBudget)}</TableCell>
                                <TableCell className="text-right">${formatNumber(row.metasearchActual)}</TableCell>
                                <TableCell className={`text-right font-medium ${variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {variance >= 0 ? '+' : ''}${formatNumber(variance)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TabsContent>
                    
                    <TabsContent value="sem">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Month</TableHead>
                            <TableHead className="text-right">Budget</TableHead>
                            <TableHead className="text-right">Actual</TableHead>
                            <TableHead className="text-right">Variance</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {MONTHLY_BUDGET_DATA.map((row) => {
                            const variance = row.semBudget - row.semActual;
                            return (
                              <TableRow key={row.month}>
                                <TableCell className="font-medium">{row.month}</TableCell>
                                <TableCell className="text-right">${formatNumber(row.semBudget)}</TableCell>
                                <TableCell className="text-right">${formatNumber(row.semActual)}</TableCell>
                                <TableCell className={`text-right font-medium ${variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {variance >= 0 ? '+' : ''}${formatNumber(variance)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TabsContent>
                    
                    <TabsContent value="social">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Month</TableHead>
                            <TableHead className="text-right">Budget</TableHead>
                            <TableHead className="text-right">Actual</TableHead>
                            <TableHead className="text-right">Variance</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {MONTHLY_BUDGET_DATA.map((row) => {
                            const variance = row.socialBudget - row.socialActual;
                            return (
                              <TableRow key={row.month}>
                                <TableCell className="font-medium">{row.month}</TableCell>
                                <TableCell className="text-right">${formatNumber(row.socialBudget)}</TableCell>
                                <TableCell className="text-right">${formatNumber(row.socialActual)}</TableCell>
                                <TableCell className={`text-right font-medium ${variance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {variance >= 0 ? '+' : ''}${formatNumber(variance)}
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Forecast Tab */}
            <TabsContent value="forecast" className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <Card className="shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-medium uppercase text-blue-600">ROOMS</CardTitle></CardHeader>
                  <CardContent><div className="text-2xl font-bold">{FORECAST_SCENARIO.rooms}</div></CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-medium uppercase text-green-600">OCCUPANCY</CardTitle></CardHeader>
                  <CardContent><div className="text-2xl font-bold">{FORECAST_SCENARIO.occupancyRate}%</div></CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-medium uppercase text-purple-600">ADR</CardTitle></CardHeader>
                  <CardContent><div className="text-2xl font-bold">${FORECAST_SCENARIO.averageDailyRate}</div></CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-medium uppercase text-cyan-600">CONV. RATE</CardTitle></CardHeader>
                  <CardContent><div className="text-2xl font-bold">{FORECAST_SCENARIO.conversionRate}%</div></CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-medium uppercase text-orange-600">DIRECT TARGET</CardTitle></CardHeader>
                  <CardContent><div className="text-2xl font-bold">{FORECAST_SCENARIO.directBookingsTarget}%</div></CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-medium uppercase text-pink-600">COST OF SELL</CardTitle></CardHeader>
                  <CardContent><div className="text-2xl font-bold">{FORECAST_SCENARIO.costOfSell}%</div></CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                <Card className="shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-medium uppercase text-blue-600">ANNUAL ROOM NIGHTS</CardTitle></CardHeader>
                  <CardContent><div className="text-2xl font-bold">{formatNumber(FORECAST_PROJECTIONS.annualRoomNights)}</div></CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-medium uppercase text-green-600">ANNUAL REVENUE</CardTitle></CardHeader>
                  <CardContent><div className="text-2xl font-bold">${formatNumber(FORECAST_PROJECTIONS.annualRevenue)}</div></CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-medium uppercase text-purple-600">DIRECT BOOKINGS TARGET</CardTitle></CardHeader>
                  <CardContent><div className="text-2xl font-bold">${formatNumber(FORECAST_PROJECTIONS.directBookingsRevenue)}</div></CardContent>
                </Card>
                <Card className="shadow-sm">
                  <CardHeader className="pb-2"><CardTitle className="text-xs font-medium uppercase text-orange-600">REQUIRED CLICKS</CardTitle></CardHeader>
                  <CardContent><div className="text-2xl font-bold">{formatNumber(FORECAST_PROJECTIONS.requiredClicks)}</div></CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader><CardTitle className="text-base font-medium">Services Configuration</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Service</TableHead>
                        <TableHead className="text-right">Weight</TableHead>
                        <TableHead className="text-right">% Revenue</TableHead>
                        <TableHead className="text-right">Recurrent Fee</TableHead>
                        <TableHead className="text-right">Cost of Sell</TableHead>
                        <TableHead className="text-right">Budget Payer</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {FORECAST_SCENARIO.services.map((service) => (
                        <TableRow key={service.name}>
                          <TableCell className="font-medium">{service.name}</TableCell>
                          <TableCell className="text-right">{service.weight}%</TableCell>
                          <TableCell className="text-right">{service.percentRevenue}%</TableCell>
                          <TableCell className="text-right">${formatNumber(service.recurrentFee)}</TableCell>
                          <TableCell className="text-right">{service.costOfSell}%</TableCell>
                          <TableCell className="text-right capitalize">{service.budgetPayer}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base font-medium">Monthly Revenue Target vs Actual (2025)</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={MONTHLY_DATA.map(m => ({ month: m.month, target: FORECAST_PROJECTIONS.monthlyRevenue, actual: m.value }))}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`} />
                        <Tooltip 
                          formatter={(value: number, name: string) => [`$${value.toLocaleString()}`, name === 'target' ? 'Target' : 'Actual']}
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                        />
                        <Legend />
                        <Bar dataKey="actual" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Actual Revenue" />
                        <Line type="monotone" dataKey="target" stroke="hsl(var(--destructive))" strokeWidth={2} strokeDasharray="5 5" name="Target Revenue" dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
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
