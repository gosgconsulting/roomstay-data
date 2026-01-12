import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, RefreshCw, Eye, MousePointer, DollarSign, Percent, TrendingUp, ShoppingCart, ArrowUpRight, ArrowDownRight, Settings2, ChevronLeft, ChevronRight, X, Sparkles, Search, Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

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

// BUDGET DATA - Full year 2025 with actual spend data from database (Brady Hotels ONLY - filtered)
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

// Monthly revenue data - 2025 (Brady Hotels ONLY - filtered by account)
const MONTHLY_DATA = [
  { month: "Jan", metasearch: 0, social: 0, sem: 614844.08 },
  { month: "Feb", metasearch: 0, social: 0, sem: 455783.02 },
  { month: "Mar", metasearch: 0, social: 0, sem: 417356.54 },
  { month: "Apr", metasearch: 0, social: 0, sem: 424804.64 },
  { month: "May", metasearch: 0, social: 0, sem: 438201.43 },
  { month: "Jun", metasearch: 0, social: 0, sem: 0 },
  { month: "Jul", metasearch: 63915.91, social: 8761.54, sem: 0 },
  { month: "Aug", metasearch: 61022.16, social: 51340.05, sem: 0 },
  { month: "Sep", metasearch: 65497.69, social: 47241.16, sem: 292391.79 },
  { month: "Oct", metasearch: 62790.62, social: 59499.71, sem: 203158.10 },
  { month: "Nov", metasearch: 62764.16, social: 107535.63, sem: 278315.94 },
  { month: "Dec", metasearch: 35093.16, social: 87867.77, sem: 155596.64 },
];

// Monthly revenue data by channel for individual charts
const MONTHLY_METASEARCH_DATA = MONTHLY_DATA.map(m => ({ month: m.month, revenue: m.metasearch }));
const MONTHLY_SEM_DATA = MONTHLY_DATA.map(m => ({ month: m.month, revenue: m.sem }));
const MONTHLY_SOCIAL_DATA = MONTHLY_DATA.map(m => ({ month: m.month, revenue: m.social }));

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
  const [isEditSourceOpen, setIsEditSourceOpen] = useState(false);
  const [selectedDimensions, setSelectedDimensions] = useState({
    metasearch: true,
    sem: true,
    social: true,
  });

  // Step-by-step modal state
  type ModalStep = 1 | 2 | 3 | 4;
  const [modalStep, setModalStep] = useState<ModalStep>(1);
  const [activeChannelTab, setActiveChannelTab] = useState<'metasearch' | 'sem' | 'social' | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Channel configuration state
  interface ChannelConfig {
    dimensionId: string | null;
    selectedValues: string[];
  }
  const [channelConfigs, setChannelConfigs] = useState<Record<string, ChannelConfig>>({
    metasearch: { dimensionId: null, selectedValues: [] },
    sem: { dimensionId: null, selectedValues: [] },
    social: { dimensionId: null, selectedValues: [] },
  });

  // Breakdown configuration state
  interface BreakdownConfig {
    breakdownDimensionIds: string[];
  }
  const [breakdownConfigs, setBreakdownConfigs] = useState<Record<string, BreakdownConfig>>({
    metasearch: { breakdownDimensionIds: [] },
    sem: { breakdownDimensionIds: [] },
    social: { breakdownDimensionIds: [] },
  });

  // Filter configuration state
  interface FilterConfig {
    filterDimensionIds: string[];
  }
  const [filterConfigs, setFilterConfigs] = useState<Record<string, FilterConfig>>({
    metasearch: { filterDimensionIds: [] },
    sem: { filterDimensionIds: [] },
    social: { filterDimensionIds: [] },
  });

  // Filter values state for slides page (channel -> dimensionId -> selected value)
  const [filterValues, setFilterValues] = useState<Record<string, Record<string, string>>>({
    metasearch: {},
    sem: {},
    social: {},
  });

  // Filter dimension values state (for dropdowns) - channel -> dimensionId -> values[]
  const [filterDimensionValues, setFilterDimensionValues] = useState<Record<string, Record<string, string[]>>>({
    metasearch: {},
    sem: {},
    social: {},
  });

  // Dimension and value loading state
  interface Dimension {
    id: string;
    name: string;
    type: string;
  }
  const [dimensions, setDimensions] = useState<Record<string, Dimension[]>>({
    metasearch: [],
    sem: [],
    social: [],
  });
  const [dimensionValues, setDimensionValues] = useState<Record<string, string[]>>({
    metasearch: [],
    sem: [],
    social: [],
  });
  const [loadingDimensions, setLoadingDimensions] = useState<Record<string, boolean>>({
    metasearch: false,
    sem: false,
    social: false,
  });
  const [loadingValues, setLoadingValues] = useState<Record<string, boolean>>({
    metasearch: false,
    sem: false,
    social: false,
  });

  // Available breakdown dimensions (hardcoded for now, can be loaded dynamically)
  const availableBreakdownDimensions: Dimension[] = [
    { id: 'channel', name: 'Channel', type: 'text' },
    { id: 'device', name: 'Device', type: 'text' },
    { id: 'hotel', name: 'Hotel', type: 'text' },
    { id: 'link_type', name: 'Link Type', type: 'text' },
    { id: 'market', name: 'Market', type: 'text' },
  ];

  const handleDimensionToggle = (dimension: 'metasearch' | 'sem' | 'social') => {
    setSelectedDimensions(prev => ({
      ...prev,
      [dimension]: !prev[dimension],
    }));
  };

  // Get selected channels
  const selectedChannels = useMemo(() => {
    const channels: ('metasearch' | 'sem' | 'social')[] = [];
    if (selectedDimensions.metasearch) channels.push('metasearch');
    if (selectedDimensions.sem) channels.push('sem');
    if (selectedDimensions.social) channels.push('social');
    return channels;
  }, [selectedDimensions]);

  // Reset modal to step 1 when opened
  useEffect(() => {
    if (isEditSourceOpen) {
      setModalStep(1);
      setActiveChannelTab(null);
      setSearchQuery("");
    }
  }, [isEditSourceOpen]);

  // Initialize active channel tab when entering step 2, 3, or 4
  useEffect(() => {
    if ((modalStep === 2 || modalStep === 3 || modalStep === 4) && selectedChannels.length > 0 && !activeChannelTab) {
      setActiveChannelTab(selectedChannels[0]);
    }
  }, [modalStep, selectedChannels, activeChannelTab]);

  // Load dimensions for a channel (placeholder - can be connected to real data)
  const loadDimensionsForChannel = async (channel: 'metasearch' | 'sem' | 'social') => {
    setLoadingDimensions(prev => ({ ...prev, [channel]: true }));
    try {
      // TODO: Connect to real data source
      // For now, return placeholder dimensions
      const placeholderDimensions: Dimension[] = [
        { id: 'hotel', name: 'Hotel', type: 'text' },
        { id: 'campaign', name: 'Campaign', type: 'text' },
        { id: 'device', name: 'Device', type: 'text' },
        { id: 'market', name: 'Market', type: 'text' },
      ];
      setDimensions(prev => ({ ...prev, [channel]: placeholderDimensions }));
    } catch (err) {
      console.error(`Error loading dimensions for ${channel}:`, err);
      setDimensions(prev => ({ ...prev, [channel]: [] }));
    } finally {
      setLoadingDimensions(prev => ({ ...prev, [channel]: false }));
    }
  };

  // Load values for a dimension
  const loadValuesForDimension = async (channel: 'metasearch' | 'sem' | 'social', dimensionId: string) => {
    setLoadingValues(prev => ({ ...prev, [channel]: true }));
    try {
      // TODO: Connect to real data source using supabase function
      // For now, return placeholder values
      const placeholderValues = [
        'Brady Hotels Central Melbourne',
        'Brady Hotels Jones Lane',
        'Brady Apartment Hotel Flinders Street',
        'Brady Apartment Hotel Hardware Lane',
        'Sojourn Apartment Hotel - Ghuznee',
      ];
      setDimensionValues(prev => ({ ...prev, [channel]: placeholderValues }));
    } catch (err) {
      console.error(`Error loading values for ${channel}/${dimensionId}:`, err);
      setDimensionValues(prev => ({ ...prev, [channel]: [] }));
    } finally {
      setLoadingValues(prev => ({ ...prev, [channel]: false }));
    }
  };

  // Load dimensions when entering step 2 or step 4
  useEffect(() => {
    if ((modalStep === 2 || modalStep === 4) && isEditSourceOpen) {
      selectedChannels.forEach(channel => {
        if (dimensions[channel].length === 0 && !loadingDimensions[channel]) {
          loadDimensionsForChannel(channel);
        }
      });
    }
  }, [modalStep, isEditSourceOpen, selectedChannels]);

  // Handle dimension change
  const handleDimensionChange = (channel: 'metasearch' | 'sem' | 'social', dimensionId: string) => {
    setChannelConfigs(prev => ({
      ...prev,
      [channel]: {
        dimensionId: dimensionId === "none" ? null : dimensionId,
        selectedValues: [],
      },
    }));
    setDimensionValues(prev => ({ ...prev, [channel]: [] }));
    if (dimensionId && dimensionId !== "none") {
      loadValuesForDimension(channel, dimensionId);
    }
  };

  // Handle value toggle
  const handleValueToggle = (channel: 'metasearch' | 'sem' | 'social', value: string) => {
    setChannelConfigs(prev => {
      const current = prev[channel];
      const isSelected = current.selectedValues.includes(value);
      return {
        ...prev,
        [channel]: {
          ...current,
          selectedValues: isSelected
            ? current.selectedValues.filter(v => v !== value)
            : [...current.selectedValues, value],
        },
      };
    });
  };

  // Handle select all values
  const handleSelectAllValues = (channel: 'metasearch' | 'sem' | 'social') => {
    const allValues = dimensionValues[channel] || [];
    setChannelConfigs(prev => ({
      ...prev,
      [channel]: {
        ...prev[channel],
        selectedValues: [...allValues],
      },
    }));
  };

  // Handle deselect all values
  const handleDeselectAllValues = (channel: 'metasearch' | 'sem' | 'social') => {
    setChannelConfigs(prev => ({
      ...prev,
      [channel]: {
        ...prev[channel],
        selectedValues: [],
      },
    }));
  };

  // Handle breakdown dimension toggle
  const handleBreakdownToggle = (channel: 'metasearch' | 'sem' | 'social', dimensionId: string) => {
    setBreakdownConfigs(prev => {
      const current = prev[channel];
      const isSelected = current.breakdownDimensionIds.includes(dimensionId);
      return {
        ...prev,
        [channel]: {
          breakdownDimensionIds: isSelected
            ? current.breakdownDimensionIds.filter(id => id !== dimensionId)
            : [...current.breakdownDimensionIds, dimensionId],
        },
      };
    });
  };

  // Handle filter dimension toggle
  const handleFilterDimensionToggle = async (channel: 'metasearch' | 'sem' | 'social', dimensionId: string) => {
    const currentConfig = filterConfigs[channel];
    const isSelected = currentConfig?.filterDimensionIds.includes(dimensionId);
    
    setFilterConfigs(prev => {
      const current = prev[channel];
      const newFilterDimensionIds = isSelected
        ? current.filterDimensionIds.filter(id => id !== dimensionId)
        : [...current.filterDimensionIds, dimensionId];
      
      return {
        ...prev,
        [channel]: {
          filterDimensionIds: newFilterDimensionIds,
        },
      };
    });
    
    if (!isSelected) {
      // Dimension was just added, load its values
      await loadValuesForDimension(channel, dimensionId);
      const values = dimensionValues[channel] || [];
      // Store values for this specific dimension
      setFilterDimensionValues(prev => ({
        ...prev,
        [channel]: {
          ...prev[channel],
          [dimensionId]: values,
        },
      }));
    } else {
      // Dimension was removed, clear its values and selected filter
      setFilterDimensionValues(prev => {
        const updated = { ...prev[channel] };
        delete updated[dimensionId];
        return {
          ...prev,
          [channel]: updated,
        };
      });
      setFilterValues(prev => {
        const updated = { ...prev[channel] };
        delete updated[dimensionId];
        return {
          ...prev,
          [channel]: updated,
        };
      });
    }
  };

  // Filtered values based on search query
  const filteredValues = useMemo(() => {
    if (!activeChannelTab) return [];
    const values = dimensionValues[activeChannelTab] || [];
    if (!searchQuery) return values;
    return values.filter(value =>
      value.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [activeChannelTab, dimensionValues, searchQuery]);

  // Navigation handlers
  const handleNext = () => {
    if (modalStep === 1) {
      if (selectedChannels.length > 0) {
        setModalStep(2);
      }
    } else if (modalStep === 2) {
      setModalStep(3);
    } else if (modalStep === 3) {
      setModalStep(4);
    } else if (modalStep === 4) {
      // Save and close
      handleSave();
    }
  };

  const handleBack = () => {
    if (modalStep === 2) {
      setModalStep(1);
    } else if (modalStep === 3) {
      setModalStep(2);
    } else if (modalStep === 4) {
      setModalStep(3);
    }
  };

  const handleSave = async () => {
    // TODO: Save configurations to database or state
    console.log('Saving configurations:', { channelConfigs, breakdownConfigs, filterConfigs });
    // Load filter dimension values for all configured filters
    for (const channel of selectedChannels) {
      const filterDimIds = filterConfigs[channel]?.filterDimensionIds || [];
      for (const filterDimId of filterDimIds) {
        await loadValuesForDimension(channel, filterDimId);
        const values = dimensionValues[channel] || [];
        setFilterDimensionValues(prev => ({
          ...prev,
          [channel]: {
            ...prev[channel],
            [filterDimId]: values,
          },
        }));
      }
    }
    setIsEditSourceOpen(false);
    resetModalState();
  };

  const resetModalState = () => {
    setModalStep(1);
    setActiveChannelTab(null);
    setSearchQuery("");
    setChannelConfigs({
      metasearch: { dimensionId: null, selectedValues: [] },
      sem: { dimensionId: null, selectedValues: [] },
      social: { dimensionId: null, selectedValues: [] },
    });
    setBreakdownConfigs({
      metasearch: { breakdownDimensionIds: [] },
      sem: { breakdownDimensionIds: [] },
      social: { breakdownDimensionIds: [] },
    });
    setFilterConfigs({
      metasearch: { filterDimensionIds: [] },
      sem: { filterDimensionIds: [] },
      social: { filterDimensionIds: [] },
    });
  };

  const handleModalClose = (open: boolean) => {
    setIsEditSourceOpen(open);
    if (!open) {
      resetModalState();
    }
  };

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

  // Get channel-specific comparison data
  const getChannelComparisonMetrics = (channel: 'metasearch' | 'sem' | 'social') => {
    if (comparisonType === "previous_period") {
      const prevData = channel === 'metasearch' ? METASEARCH_PREV_PERIOD 
                     : channel === 'sem' ? SEM_PREV_PERIOD 
                     : SOCIAL_PREV_PERIOD;
      return {
        ...calculateDerivedMetrics(prevData),
        label: "vs Nov 2025",
      };
    } else if (comparisonType === "previous_year") {
      // For SEM, we have 2024 data; for Metasearch and Social, use estimates
      if (channel === 'sem') {
        const prevData = { impressions: 1510246, clicks: 9796, cost: 8198.31, revenue: 354741.72, bookings: 675 };
        return {
          ...calculateDerivedMetrics(prevData),
          label: "vs Dec 2024",
        };
      } else if (channel === 'metasearch') {
        return {
          ...calculateDerivedMetrics(METASEARCH_PREV_YEAR),
          label: "vs Dec 2024*",
        };
      } else {
        return {
          ...calculateDerivedMetrics(SOCIAL_PREV_YEAR),
          label: "vs Dec 2024*",
        };
      }
    }
    return null;
  };

  const renderKPICards = (cards: typeof KPI_CARDS, channelCompMetrics?: ReturnType<typeof getChannelComparisonMetrics>) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
      {cards.map((kpi) => {
        // Use channel-specific comparison if provided, otherwise fall back to global
        const effectiveCompMetrics = channelCompMetrics !== undefined ? channelCompMetrics : comparisonMetrics;
        const compValue = effectiveCompMetrics ? effectiveCompMetrics[kpi.key as keyof typeof effectiveCompMetrics] : null;
        const percentChange = compValue !== null ? calculatePercentChange(kpi.value, compValue as number) : null;
        const isPositive = percentChange !== null && percentChange >= 0;
        // For cost metrics, lower is better
        const isCostMetric = ['cpc', 'cost', 'costOfSale'].includes(kpi.key);
        const isGood = isCostMetric ? !isPositive : isPositive;
        const compLabel = channelCompMetrics?.label || comparisonData?.label;
        
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
              {percentChange !== null && compLabel && (
                <div className={`flex items-center gap-1 mt-1 text-xs ${isGood ? 'text-green-600' : 'text-red-600'}`}>
                  {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                  <span>{Math.abs(percentChange).toFixed(1)}%</span>
                  <span className="text-muted-foreground">{compLabel}</span>
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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setIsEditSourceOpen(true)}>
              <Settings2 className="h-4 w-4 mr-2" />
              Edit Source
            </Button>
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh Data
            </Button>
          </div>
        </div>
      </div>

      {/* Edit Source Modal - Step by Step */}
      <Dialog open={isEditSourceOpen} onOpenChange={handleModalClose}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
                <DialogTitle>
                  {modalStep === 1 && "Select Channels"}
                  {modalStep === 2 && "Select Dimension"}
                  {modalStep === 3 && "Breakdown Dimensions"}
                  {modalStep === 4 && "Filters"}
                </DialogTitle>
            </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleModalClose(false)}
                className="h-6 w-6"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Tip: "Breakdown by" tables render on the specific report tab, not on Overview/Budget. After saving, select the report tab to view the breakdown.
            </p>
          </DialogHeader>

          <div className="flex-1 min-h-0">
            {/* Step 1: Channel Selection */}
            {modalStep === 1 && (
              <div className="space-y-4">
            <div className="space-y-3">
              <div 
                    className={cn(
                      "flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors",
                  selectedDimensions.metasearch ? 'border-primary bg-primary/5' : 'border-border'
                    )}
                onClick={() => handleDimensionToggle('metasearch')}
              >
                <Checkbox 
                  checked={selectedDimensions.metasearch}
                  onCheckedChange={() => handleDimensionToggle('metasearch')}
                  className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
                <span className="font-medium">Metasearch</span>
              </div>
              <div 
                    className={cn(
                      "flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors",
                  selectedDimensions.sem ? 'border-primary bg-primary/5' : 'border-border'
                    )}
                onClick={() => handleDimensionToggle('sem')}
              >
                <Checkbox 
                  checked={selectedDimensions.sem}
                  onCheckedChange={() => handleDimensionToggle('sem')}
                  className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
                <span className="font-medium">SEM</span>
              </div>
              <div 
                    className={cn(
                      "flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors",
                  selectedDimensions.social ? 'border-primary bg-primary/5' : 'border-border'
                    )}
                onClick={() => handleDimensionToggle('social')}
              >
                <Checkbox 
                  checked={selectedDimensions.social}
                  onCheckedChange={() => handleDimensionToggle('social')}
                  className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
                <span className="font-medium">Social</span>
              </div>
            </div>
          </div>
            )}

            {/* Step 2: Dimension & Value Selection */}
            {modalStep === 2 && (
              <div className="flex h-[400px] gap-4">
                {/* Left: Channel tabs */}
                <div className="w-48 border-r pr-4">
                  <ScrollArea className="h-full">
                    <div className="space-y-1">
                      {selectedChannels.map(channel => {
                        const config = channelConfigs[channel];
                        const valueCount = config?.selectedValues.length || 0;
                        return (
                          <button
                            key={channel}
                            className={cn(
                              "w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between",
                              activeChannelTab === channel
                                ? "bg-primary text-primary-foreground"
                                : "hover:bg-muted"
                            )}
                            onClick={() => {
                              setActiveChannelTab(channel);
                              setSearchQuery("");
                            }}
                          >
                            <span className="truncate capitalize">
                              {channel}
                              {valueCount > 0 && (
                                <span className="ml-1 text-xs opacity-70">
                                  ({valueCount})
                                </span>
                              )}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>

                {/* Right: Dimension selector */}
                <div className="flex-1 flex flex-col gap-4">
                  {activeChannelTab && (
                    <>
                      {loadingDimensions[activeChannelTab] ? (
                        <div className="flex-1 flex items-center justify-center">
                          <div className="flex flex-col items-center gap-2 text-muted-foreground">
                            <Loader2 className="h-8 w-8 animate-spin" />
                            <span>Loading dimensions...</span>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div>
                            <Label className="text-sm font-medium mb-2 block">
                              Select Dimension
                            </Label>
                            <Select
                              value={channelConfigs[activeChannelTab]?.dimensionId || ""}
                              onValueChange={value => handleDimensionChange(activeChannelTab, value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Choose a dimension..." />
                              </SelectTrigger>
                              <SelectContent>
                                {dimensions[activeChannelTab]?.map(dim => (
                                  <SelectItem key={dim.id} value={dim.id}>
                                    {dim.name}
                                  </SelectItem>
                                ))}
                                {(!dimensions[activeChannelTab] || dimensions[activeChannelTab].length === 0) && (
                                  <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                                    No dimensions available
                                  </div>
                                )}
                              </SelectContent>
                            </Select>
                          </div>

                          {channelConfigs[activeChannelTab]?.dimensionId && (
                            <>
                              <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                  placeholder="Search values..."
                                  value={searchQuery}
                                  onChange={e => setSearchQuery(e.target.value)}
                                  className="pl-9"
                                />
                              </div>

                              {filteredValues.length > 0 && (
                                <div className="flex gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleSelectAllValues(activeChannelTab)}
                                    className="flex-1"
                                  >
                                    Select All
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDeselectAllValues(activeChannelTab)}
                                    className="flex-1"
                                  >
                                    Deselect All
                                  </Button>
                                </div>
                              )}

                              <ScrollArea className="flex-1 border rounded-md">
                                <div className="p-2 space-y-1">
                                  {filteredValues.length > 0 ? (
                                    filteredValues.map(value => (
                                      <div
                                        key={value}
                                        className={cn(
                                          "flex items-center gap-3 p-2 rounded cursor-pointer transition-colors",
                                          channelConfigs[activeChannelTab]?.selectedValues.includes(value)
                                            ? "bg-primary/10"
                                            : "hover:bg-muted/50"
                                        )}
                                        onClick={() => handleValueToggle(activeChannelTab, value)}
                                      >
                                        <Checkbox
                                          checked={channelConfigs[activeChannelTab]?.selectedValues.includes(value) || false}
                                          onCheckedChange={() => handleValueToggle(activeChannelTab, value)}
                                        />
                                        <span className="text-sm">{value}</span>
                                      </div>
                                    ))
                                  ) : loadingValues[activeChannelTab] ? (
                                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                                      <Loader2 className="h-6 w-6 animate-spin mb-2" />
                                      <p className="text-sm">Loading dimension values...</p>
                                    </div>
                                  ) : (
                                    <p className="text-center text-muted-foreground py-4">
                                      No values found.
                                    </p>
                                  )}
                                </div>
                              </ScrollArea>
                            </>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Step 3: Breakdown Dimensions */}
            {modalStep === 3 && (
              <div className="flex h-[400px] gap-4">
                {/* Left: Channel tabs */}
                <div className="w-48 border-r pr-4">
                  <ScrollArea className="h-full">
                    <div className="space-y-1">
                      {selectedChannels.map(channel => {
                        const breakdownCount = breakdownConfigs[channel]?.breakdownDimensionIds?.length || 0;
                        return (
                          <button
                            key={channel}
                            className={cn(
                              "w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between",
                              activeChannelTab === channel
                                ? "bg-primary text-primary-foreground"
                                : "hover:bg-muted"
                            )}
                            onClick={() => setActiveChannelTab(channel)}
                          >
                            <span className="truncate capitalize">{channel}</span>
                            {breakdownCount > 0 && (
                              <span className="text-xs opacity-70">{breakdownCount}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>

                {/* Right: Breakdown dimension selector */}
                <div className="flex-1 flex flex-col gap-4">
                  {activeChannelTab && (
                    <>
                      <div className="bg-muted/30 rounded-lg p-4 mb-2">
                        <p className="text-sm text-muted-foreground">
                          Select dimensions to break down this report's data. Each selected dimension will create a separate breakdown table.
                        </p>
                      </div>
                      
                      <div>
                        <Label className="text-sm font-medium mb-2 block">
                          Breakdown Dimensions
                        </Label>
                        <ScrollArea className="h-[250px] border rounded-md">
                          <div className="p-2 space-y-1">
                            {availableBreakdownDimensions.length > 0 ? (
                              availableBreakdownDimensions.map(dim => {
                                const isSelected = breakdownConfigs[activeChannelTab]?.breakdownDimensionIds?.includes(dim.id) || false;
                                return (
                                  <div
                                    key={dim.id}
                                    className={cn(
                                      "flex items-center gap-3 p-2 rounded cursor-pointer transition-colors",
                                      isSelected
                                        ? "bg-primary/10"
                                        : "hover:bg-muted/50"
                                    )}
                                    onClick={() => handleBreakdownToggle(activeChannelTab, dim.id)}
                                  >
                                    <Checkbox
                                      checked={isSelected}
                                      onCheckedChange={() => handleBreakdownToggle(activeChannelTab, dim.id)}
                                    />
                                    <span className="text-sm">{dim.name}</span>
                                  </div>
                                );
                              })
                            ) : (
                              <p className="text-center text-muted-foreground py-4">
                                No dimensions available
                              </p>
                            )}
                          </div>
                        </ScrollArea>
                      </div>

                      {(breakdownConfigs[activeChannelTab]?.breakdownDimensionIds?.length || 0) > 0 && (
                        <div className="mt-2 p-4 bg-primary/5 rounded-lg border border-primary/20">
                          <p className="text-sm font-medium mb-2">
                            Selected ({breakdownConfigs[activeChannelTab]?.breakdownDimensionIds?.length || 0}):
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {breakdownConfigs[activeChannelTab]?.breakdownDimensionIds?.map(dimId => {
                              const dim = availableBreakdownDimensions.find(d => d.id === dimId);
                              return dim ? (
                                <span key={dimId} className="px-2 py-1 bg-primary/10 rounded text-xs">
                                  {dim.name}
                                </span>
                              ) : null;
                            })}
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            A separate breakdown table will be created for each dimension.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Step 4: Filters */}
            {modalStep === 4 && (
              <div className="flex h-[400px] gap-4">
                {/* Left: Channel tabs */}
                <div className="w-48 border-r pr-4">
                  <ScrollArea className="h-full">
                    <div className="space-y-1">
                      {selectedChannels.map(channel => {
                        const filterCount = filterConfigs[channel]?.filterDimensionIds?.length || 0;
                        return (
                          <button
                            key={channel}
                            className={cn(
                              "w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center justify-between",
                              activeChannelTab === channel
                                ? "bg-primary text-primary-foreground"
                                : "hover:bg-muted"
                            )}
                            onClick={() => setActiveChannelTab(channel)}
                          >
                            <span className="truncate capitalize">{channel}</span>
                            {filterCount > 0 && (
                              <span className="text-xs opacity-70">{filterCount}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </div>

                {/* Right: Filter dimension selector */}
                <div className="flex-1 flex flex-col gap-4">
                  {activeChannelTab && (
                    <>
                      <div className="bg-muted/30 rounded-lg p-4 mb-2">
                        <p className="text-sm text-muted-foreground">
                          Select dimensions to use as filters for this report. Each selected dimension will create a filter dropdown that appears before the date dropdowns on the slides page.
                        </p>
                      </div>
                      
                      <div>
                        <Label className="text-sm font-medium mb-2 block">
                          Filter Dimensions
                        </Label>
                        {loadingDimensions[activeChannelTab] ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading dimensions...
                          </div>
                        ) : (
                          <ScrollArea className="h-[250px] border rounded-md">
                            <div className="p-2 space-y-1">
                              {dimensions[activeChannelTab]?.length > 0 ? (
                                dimensions[activeChannelTab].map(dim => {
                                  const isSelected = filterConfigs[activeChannelTab]?.filterDimensionIds?.includes(dim.id) || false;
                                  return (
                                    <div
                                      key={dim.id}
                                      className={cn(
                                        "flex items-center gap-3 p-2 rounded cursor-pointer transition-colors",
                                        isSelected
                                          ? "bg-primary/10"
                                          : "hover:bg-muted/50"
                                      )}
                                      onClick={() => handleFilterDimensionToggle(activeChannelTab, dim.id)}
                                    >
                                      <Checkbox
                                        checked={isSelected}
                                        onCheckedChange={() => handleFilterDimensionToggle(activeChannelTab, dim.id)}
                                      />
                                      <span className="text-sm">{dim.name}</span>
                                    </div>
                                  );
                                })
                              ) : (
                                <p className="text-center text-muted-foreground py-4">
                                  No dimensions available
                                </p>
                              )}
                            </div>
                          </ScrollArea>
                        )}
                      </div>

                      {(filterConfigs[activeChannelTab]?.filterDimensionIds?.length || 0) > 0 && (
                        <div className="mt-2 p-4 bg-primary/5 rounded-lg border border-primary/20">
                          <p className="text-sm font-medium mb-2">
                            Selected ({filterConfigs[activeChannelTab]?.filterDimensionIds?.length || 0}):
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {filterConfigs[activeChannelTab]?.filterDimensionIds?.map(dimId => {
                              const dim = dimensions[activeChannelTab]?.find(d => d.id === dimId);
                              return dim ? (
                                <span key={dimId} className="px-2 py-1 bg-primary/10 rounded text-xs">
                                  {dim.name}
                                </span>
                              ) : null;
                            })}
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            A filter dropdown will appear on the slides page for each selected dimension.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer Navigation */}
          <div className="flex items-center justify-between pt-4 border-t">
            <Button
              variant="outline"
              onClick={modalStep === 1 ? () => handleModalClose(false) : handleBack}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              {modalStep === 1 ? "Cancel" : "Back"}
            </Button>
            <Button
              onClick={handleNext}
              disabled={modalStep === 1 && selectedChannels.length === 0}
            >
              {modalStep === 4 ? "Save" : "Next"}
              {modalStep !== 4 && <ChevronRight className="h-4 w-4 ml-1" />}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
                {/* Filter Dropdowns */}
                {selectedChannels.flatMap(channel => {
                  const filterDimIds = filterConfigs[channel]?.filterDimensionIds || [];
                  return filterDimIds.map(filterDimId => {
                    const filterDim = dimensions[channel]?.find(d => d.id === filterDimId);
                    const filterValuesList = filterDimensionValues[channel]?.[filterDimId] || [];
                    
                    if (!filterDim || filterValuesList.length === 0) return null;
                    
                    return (
                      <Select
                        key={`${channel}-${filterDimId}`}
                        value={filterValues[channel]?.[filterDimId] || 'all'}
                        onValueChange={(value) => {
                          setFilterValues(prev => ({
                            ...prev,
                            [channel]: {
                              ...prev[channel],
                              [filterDimId]: value === 'all' ? '' : value,
                            },
                          }));
                        }}
                      >
                        <SelectTrigger className="w-[150px]">
                          <SelectValue placeholder={filterDim.name} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All {filterDim.name}</SelectItem>
                          {filterValuesList.map(value => (
                            <SelectItem key={value} value={value}>
                              {value}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    );
                  }).filter(Boolean);
                })}
                
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
              {renderKPICards(getReportKPICards(METASEARCH_DATA), getChannelComparisonMetrics('metasearch'))}
              
              {/* Monthly Revenue Chart */}
              <Card>
                <CardHeader><CardTitle className="text-base font-medium">Monthly Results (2025)</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={MONTHLY_METASEARCH_DATA}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`} />
                        <Tooltip 
                          formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                        />
                        <Bar dataKey="revenue" fill="#8b5cf6" name="Metasearch Revenue" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

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
              {renderKPICards(getReportKPICards(SEM_DATA), getChannelComparisonMetrics('sem'))}
              
              {/* Monthly Revenue Chart */}
              <Card>
                <CardHeader><CardTitle className="text-base font-medium">Monthly Results (2025)</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={MONTHLY_SEM_DATA}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`} />
                        <Tooltip 
                          formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                        />
                        <Bar dataKey="revenue" fill="#8b5cf6" name="SEM Revenue" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base font-medium">Results by Campaign</CardTitle></CardHeader>
                <CardContent>
                  <BreakdownTable data={SEM_BY_CAMPAIGN_WITH_OTHER} labelKey="campaign" labelHeader="Campaign" />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Social Tab */}
            <TabsContent value="social" className="space-y-6">
              {renderKPICards(getReportKPICards(SOCIAL_DATA), getChannelComparisonMetrics('social'))}
              
              {/* Monthly Revenue Chart */}
              <Card>
                <CardHeader><CardTitle className="text-base font-medium">Monthly Results (2025)</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={MONTHLY_SOCIAL_DATA}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`} />
                        <Tooltip 
                          formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                        />
                        <Bar dataKey="revenue" fill="#8b5cf6" name="Social Revenue" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>

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
                      {/* Overview Revenue Chart */}
                      <div className="h-[250px] mb-6">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={MONTHLY_DATA}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`} />
                            <Tooltip 
                              formatter={(value: number) => [`$${value.toLocaleString()}`, '']}
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                            />
                            <Legend />
                            <Bar dataKey="metasearch" stackId="a" fill="#10b981" name="Metasearch" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="sem" stackId="a" fill="#3b82f6" name="SEM" radius={[0, 0, 0, 0]} />
                            <Bar dataKey="social" stackId="a" fill="#8b5cf6" name="Social" radius={[4, 4, 0, 0]} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
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
                      {/* Metasearch Revenue Chart */}
                      <div className="h-[250px] mb-6">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={MONTHLY_METASEARCH_DATA}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`} />
                            <Tooltip 
                              formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                            />
                            <Bar dataKey="revenue" fill="#10b981" name="Metasearch Revenue" radius={[4, 4, 0, 0]} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
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
                      {/* SEM Revenue Chart */}
                      <div className="h-[250px] mb-6">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={MONTHLY_SEM_DATA}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`} />
                            <Tooltip 
                              formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                            />
                            <Bar dataKey="revenue" fill="#3b82f6" name="SEM Revenue" radius={[4, 4, 0, 0]} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
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
                      {/* Social Revenue Chart */}
                      <div className="h-[250px] mb-6">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={MONTHLY_SOCIAL_DATA}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} tickFormatter={(value) => `$${(value / 1000).toFixed(0)}K`} />
                            <Tooltip 
                              formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                            />
                            <Bar dataKey="revenue" fill="#8b5cf6" name="Social Revenue" radius={[4, 4, 0, 0]} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
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

          </Tabs>
        </div>
      </div>
    </div>
  );
}
