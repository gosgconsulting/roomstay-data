import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, RefreshCw, Eye, MousePointer, DollarSign, Percent, TrendingUp, ShoppingCart, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line } from "recharts";

// REAL DATA from database queries - December 2025 Brady Hotels Account (after resync)
const METASEARCH_DATA = {
  impressions: 27067,
  clicks: 1915,
  cost: 2729.84,
  revenue: 35093.16,
  bookings: 70,
};

// SEM data - December 2025 Brady Hotels
const SEM_DATA = {
  impressions: 432114,
  clicks: 9797,
  cost: 8208.69,
  revenue: 155596.64,
  bookings: 298,
};

// Social data - December 2025 Brady Hotels
const SOCIAL_DATA = {
  impressions: 491612,
  clicks: 3021,
  cost: 4337.01,
  revenue: 87867.77,
  bookings: 154,
};

// PREVIOUS PERIOD DATA - November 2025 (verified from database after resync)
const METASEARCH_PREV_PERIOD = {
  impressions: 30662,
  clicks: 1736,
  cost: 2516.30,
  revenue: 62764.16,
  bookings: 98,
};

const SEM_PREV_PERIOD = {
  impressions: 521421,
  clicks: 11068,
  cost: 8067.78,
  revenue: 278315.94,
  bookings: 444,
};

const SOCIAL_PREV_PERIOD = {
  impressions: 480445,
  clicks: 2889,
  cost: 4330.90,
  revenue: 107535.63,
  bookings: 180,
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

// METASEARCH BREAKDOWN BY HOTEL (December 2025) - ONLY 4 BRADY HOTELS
const METASEARCH_BY_HOTEL = [
  { hotel: "Brady Hotels Central Melbourne", impressions: 11271, clicks: 735, cost: 1188.40, revenue: 13701.50, bookings: 27 },
  { hotel: "Brady Hotels Jones Lane", impressions: 6285, clicks: 496, cost: 672.99, revenue: 12588.50, bookings: 26 },
  { hotel: "Brady Apartment Hotel Flinders Street", impressions: 5158, clicks: 352, cost: 635.32, revenue: 8010.13, bookings: 13 },
  { hotel: "Brady Apartment Hotel Hardware Lane", impressions: 7295, clicks: 549, cost: 575.62, revenue: 6590.51, bookings: 15 },
];

// METASEARCH BREAKDOWN BY LINK TYPE (December 2025) - FILTERED FOR BRADY HOTELS ONLY
const METASEARCH_BY_LINK_TYPE = [
  { linkType: "Paid", impressions: 30009, clicks: 1068, cost: 3072.33, revenue: 30466.99, bookings: 54 },
  { linkType: "Google Organic", impressions: 0, clicks: 1064, cost: 0, revenue: 10423.65, bookings: 27 },
];

// SEM BREAKDOWN BY CAMPAIGN (December 2025) - Brady Hotels Group
// Note: This table shows the top campaigns + an "Other campaigns" row so totals match SEM_DATA.
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

const SEM_TOP_CAMPAIGNS_TOTAL = SEM_BY_CAMPAIGN.reduce(
  (acc, row) => ({
    impressions: acc.impressions + row.impressions,
    clicks: acc.clicks + row.clicks,
    cost: acc.cost + row.cost,
    revenue: acc.revenue + row.revenue,
    bookings: acc.bookings + row.bookings,
  }),
  { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 }
);

const SEM_OTHER_CAMPAIGNS = {
  campaign: "Other campaigns",
  impressions: Math.max(0, SEM_DATA.impressions - SEM_TOP_CAMPAIGNS_TOTAL.impressions),
  clicks: Math.max(0, SEM_DATA.clicks - SEM_TOP_CAMPAIGNS_TOTAL.clicks),
  cost: Math.max(0, Number((SEM_DATA.cost - SEM_TOP_CAMPAIGNS_TOTAL.cost).toFixed(2))),
  revenue: Math.max(0, Number((SEM_DATA.revenue - SEM_TOP_CAMPAIGNS_TOTAL.revenue).toFixed(2))),
  bookings: Math.max(0, Number((SEM_DATA.bookings - SEM_TOP_CAMPAIGNS_TOTAL.bookings).toFixed(2))),
};

const SEM_BY_CAMPAIGN_WITH_OTHER =
  SEM_OTHER_CAMPAIGNS.impressions > 0 ||
  SEM_OTHER_CAMPAIGNS.clicks > 0 ||
  SEM_OTHER_CAMPAIGNS.cost > 0 ||
  SEM_OTHER_CAMPAIGNS.revenue > 0 ||
  SEM_OTHER_CAMPAIGNS.bookings > 0
    ? [...SEM_BY_CAMPAIGN, SEM_OTHER_CAMPAIGNS]
    : SEM_BY_CAMPAIGN;

// SOCIAL BREAKDOWN BY CAMPAIGN (December 2025) - Brady Hotels 2025 Account
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

const SOCIAL_TOP_CAMPAIGNS_TOTAL = SOCIAL_BY_CAMPAIGN.reduce(
  (acc, row) => ({
    impressions: acc.impressions + row.impressions,
    clicks: acc.clicks + row.clicks,
    cost: acc.cost + row.cost,
    revenue: acc.revenue + row.revenue,
    bookings: acc.bookings + row.bookings,
  }),
  { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 }
);

const SOCIAL_OTHER_CAMPAIGNS = {
  campaign: "Other campaigns",
  impressions: Math.max(0, SOCIAL_DATA.impressions - SOCIAL_TOP_CAMPAIGNS_TOTAL.impressions),
  clicks: Math.max(0, SOCIAL_DATA.clicks - SOCIAL_TOP_CAMPAIGNS_TOTAL.clicks),
  cost: Math.max(0, Number((SOCIAL_DATA.cost - SOCIAL_TOP_CAMPAIGNS_TOTAL.cost).toFixed(2))),
  revenue: Math.max(0, Number((SOCIAL_DATA.revenue - SOCIAL_TOP_CAMPAIGNS_TOTAL.revenue).toFixed(2))),
  bookings: Math.max(0, Number((SOCIAL_DATA.bookings - SOCIAL_TOP_CAMPAIGNS_TOTAL.bookings).toFixed(2))),
};

const SOCIAL_BY_CAMPAIGN_WITH_OTHER =
  SOCIAL_OTHER_CAMPAIGNS.impressions > 0 ||
  SOCIAL_OTHER_CAMPAIGNS.clicks > 0 ||
  SOCIAL_OTHER_CAMPAIGNS.cost > 0 ||
  SOCIAL_OTHER_CAMPAIGNS.revenue > 0 ||
  SOCIAL_OTHER_CAMPAIGNS.bookings > 0
    ? [...SOCIAL_BY_CAMPAIGN, SOCIAL_OTHER_CAMPAIGNS]
    : SOCIAL_BY_CAMPAIGN;

// BUDGET DATA - Full year 2025 with actual spend data from database (Brady Hotels only)
const MONTHLY_BUDGET_DATA = [
  { month: "Jan", metasearchBudget: 0, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 7921.79, socialActual: 0 },
  { month: "Feb", metasearchBudget: 0, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 7969.45, socialActual: 0 },
  { month: "Mar", metasearchBudget: 8000, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 7925.99, socialActual: 0 },
  { month: "Apr", metasearchBudget: 8000, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 7961.28, socialActual: 0 },
  { month: "May", metasearchBudget: 8000, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 7965.97, socialActual: 0 },
  { month: "Jun", metasearchBudget: 12000, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 0, socialActual: 2741.81 },
  { month: "Jul", metasearchBudget: 12000, semBudget: 0, socialBudget: 0, metasearchActual: 7056.76, semActual: 0, socialActual: 4060.58 },
  { month: "Aug", metasearchBudget: 12000, semBudget: 0, socialBudget: 0, metasearchActual: 8794.13, semActual: 19.19, socialActual: 3476.38 },
  { month: "Sep", metasearchBudget: 20000, semBudget: 0, socialBudget: 0, metasearchActual: 7422.17, semActual: 8873.84, socialActual: 4500.10 },
  { month: "Oct", metasearchBudget: 20000, semBudget: 0, socialBudget: 0, metasearchActual: 2704.70, semActual: 8397.16, socialActual: 4598.92 },
  { month: "Nov", metasearchBudget: 20000, semBudget: 0, socialBudget: 0, metasearchActual: 2516.30, semActual: 8067.78, socialActual: 4330.90 },
  { month: "Dec", metasearchBudget: 18000, semBudget: 0, socialBudget: 0, metasearchActual: 2729.84, semActual: 8208.69, socialActual: 4337.01 },
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
const PREV_PERIOD_IMPRESSIONS = METASEARCH_PREV_PERIOD.impressions + SEM_PREV_PERIOD.impressions + SOCIAL_PREV_PERIOD.impressions;
const PREV_PERIOD_CLICKS = METASEARCH_PREV_PERIOD.clicks + SEM_PREV_PERIOD.clicks + SOCIAL_PREV_PERIOD.clicks;
const PREV_PERIOD_COST = METASEARCH_PREV_PERIOD.cost + SEM_PREV_PERIOD.cost + SOCIAL_PREV_PERIOD.cost;
const PREV_PERIOD_REVENUE = METASEARCH_PREV_PERIOD.revenue + SEM_PREV_PERIOD.revenue + SOCIAL_PREV_PERIOD.revenue;
const PREV_PERIOD_BOOKINGS = METASEARCH_PREV_PERIOD.bookings + SEM_PREV_PERIOD.bookings + SOCIAL_PREV_PERIOD.bookings;

// Calculate totals for previous year (proxy data)
const PREV_YEAR_IMPRESSIONS = METASEARCH_PREV_YEAR.impressions + SEM_DATA.impressions + SOCIAL_PREV_YEAR.impressions;
const PREV_YEAR_CLICKS = METASEARCH_PREV_YEAR.clicks + SEM_DATA.clicks + SOCIAL_PREV_YEAR.clicks;
const PREV_YEAR_COST = METASEARCH_PREV_YEAR.cost + SEM_DATA.cost + SOCIAL_PREV_YEAR.cost;
const PREV_YEAR_REVENUE = METASEARCH_PREV_YEAR.revenue + SEM_DATA.revenue + SOCIAL_PREV_YEAR.revenue;
const PREV_YEAR_BOOKINGS = METASEARCH_PREV_YEAR.bookings + SEM_DATA.bookings + SOCIAL_PREV_YEAR.bookings;

// Monthly revenue data - 2025 (Metasearch + Social + SEM for Brady Hotels)
const MONTHLY_DATA = [
  { month: "Jan", metasearch: 0, social: 0, sem: 614844.08 },
  { month: "Feb", metasearch: 0, social: 0, sem: 455783.02 },
  { month: "Mar", metasearch: 0, social: 0, sem: 417356.54 },
  { month: "Apr", metasearch: 0, social: 0, sem: 424804.64 },
  { month: "May", metasearch: 0, social: 0, sem: 438201.43 },
  { month: "Jun", metasearch: 0, social: 0, sem: 0 },
  { month: "Jul", metasearch: 127831.82, social: 8761.54, sem: 0 },
  { month: "Aug", metasearch: 122044.32, social: 51340.05, sem: 84318.10 },
  { month: "Sep", metasearch: 130995.38, social: 47241.16, sem: 292391.79 },
  { month: "Oct", metasearch: 125581.24, social: 59499.71, sem: 203158.10 },
  { month: "Nov", metasearch: 125528.32, social: 107535.63, sem: 278315.94 },
  { month: "Dec", metasearch: 40890.64, social: 87867.77, sem: 155596.64 },
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

  // Calculate totals
  const totals = data.reduce((acc, row) => ({
    impressions: acc.impressions + row.impressions,
    clicks: acc.clicks + row.clicks,
    cost: acc.cost + row.cost,
    revenue: acc.revenue + row.revenue,
    bookings: acc.bookings + row.bookings,
  }), { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 });

  const totalMetrics = calculateDerivedMetrics(totals);

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
        {/* Totals Row */}
        <TableRow className="bg-muted/50 font-semibold border-t-2">
          <TableCell className="font-bold">Total</TableCell>
          <TableCell className="text-right">{formatNumber(totalMetrics.impressions)}</TableCell>
          <TableCell className="text-right">{formatNumber(totalMetrics.clicks)}</TableCell>
          <TableCell className="text-right">{totalMetrics.ctr.toFixed(2)}%</TableCell>
          <TableCell className="text-right">{totalMetrics.bookings.toFixed(2)}</TableCell>
          <TableCell className="text-right">{totalMetrics.conversionRate.toFixed(2)}%</TableCell>
          <TableCell className="text-right">${totalMetrics.cpc.toFixed(2)}</TableCell>
          <TableCell className="text-right">${formatNumber(totalMetrics.cost)}</TableCell>
          <TableCell className="text-right">${formatNumber(totalMetrics.revenue)}</TableCell>
          <TableCell className="text-right">{totalMetrics.roas.toFixed(1)}x</TableCell>
          <TableCell className="text-right">{totalMetrics.costOfSale.toFixed(2)}%</TableCell>
        </TableRow>
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

  // Calculate total for all reports
  const TOTAL_DATA = {
    impressions: METASEARCH_DATA.impressions + SEM_DATA.impressions + SOCIAL_DATA.impressions,
    clicks: METASEARCH_DATA.clicks + SEM_DATA.clicks + SOCIAL_DATA.clicks,
    cost: METASEARCH_DATA.cost + SEM_DATA.cost + SOCIAL_DATA.cost,
    revenue: METASEARCH_DATA.revenue + SEM_DATA.revenue + SOCIAL_DATA.revenue,
    bookings: METASEARCH_DATA.bookings + SEM_DATA.bookings + SOCIAL_DATA.bookings,
  };
  const REPORT_TOTAL = { report: "Total", ...calculateDerivedMetrics(TOTAL_DATA) };

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
                  <CardTitle className="text-base font-medium">Monthly Results (2025) - Metasearch + Social + SEM Revenue</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={MONTHLY_DATA.map(m => ({ month: m.month, total: m.metasearch + m.social + m.sem }))}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`} />
                        <Tooltip 
                          formatter={(value: number) => [`$${value.toLocaleString()}`, "Revenue"]}
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                        />
                        <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
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
                      {/* Total Row */}
                      <TableRow className="bg-muted/50 font-semibold border-t-2">
                        <TableCell className="font-bold">{REPORT_TOTAL.report}</TableCell>
                        <TableCell className="text-right">{formatNumber(REPORT_TOTAL.impressions)}</TableCell>
                        <TableCell className="text-right">{formatNumber(REPORT_TOTAL.clicks)}</TableCell>
                        <TableCell className="text-right">{REPORT_TOTAL.ctr.toFixed(2)}%</TableCell>
                        <TableCell className="text-right">{REPORT_TOTAL.bookings.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{REPORT_TOTAL.conversionRate.toFixed(2)}%</TableCell>
                        <TableCell className="text-right">${REPORT_TOTAL.cpc.toFixed(2)}</TableCell>
                        <TableCell className="text-right">${formatNumber(REPORT_TOTAL.cost)}</TableCell>
                        <TableCell className="text-right">${formatNumber(REPORT_TOTAL.revenue)}</TableCell>
                        <TableCell className="text-right">{REPORT_TOTAL.roas.toFixed(1)}x</TableCell>
                        <TableCell className="text-right">{REPORT_TOTAL.costOfSale.toFixed(2)}%</TableCell>
                      </TableRow>
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
                  <BreakdownTable data={SEM_BY_CAMPAIGN_WITH_OTHER} labelKey="campaign" labelHeader="Campaign" />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Social Tab */}
            <TabsContent value="social" className="space-y-6">
              {renderKPICards(getReportKPICards(SOCIAL_DATA))}
              <Card>
                <CardHeader><CardTitle className="text-base font-medium">Results by Campaign</CardTitle></CardHeader>
                <CardContent>
                  <BreakdownTable data={SOCIAL_BY_CAMPAIGN_WITH_OTHER} labelKey="campaign" labelHeader="Campaign" />
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
                      <ComposedChart data={MONTHLY_DATA.map(m => ({ month: m.month, target: FORECAST_PROJECTIONS.monthlyRevenue, actual: m.metasearch + m.social + m.sem }))}>
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
