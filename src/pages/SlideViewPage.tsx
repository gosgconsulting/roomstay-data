import { useState, useEffect, useMemo } from "react";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, RefreshCw, Eye, MousePointer, DollarSign, Percent, TrendingUp, ShoppingCart, ArrowUpRight, ArrowDownRight, Settings2, ChevronLeft, ChevronRight, X, Sparkles, Search, Loader2, Database, Check } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useSlideReports, useSlideReport, useCreateSlideReport, useUpdateSlideReport, useRefreshSlideReportData } from "@/hooks/useSlideReports";
import { toast } from "@/hooks/use-toast";
import { SlideReportConfiguration, SlideReportPivotData, SlideReportDateRange } from "@/types/slideReports";
import { useUser } from "@/lib/auth";
import { fetchSourceData } from "@/hooks/dataSources/useSourceData";
import { SlideDataPivotTable } from "@/components/slides/SlideDataPivotTable";

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

// BUDGET DATA - All months from January 2024 to December 2026 with actual spend data (Brady Hotels ONLY - filtered)
// Data structure: { year: number, month: string, metasearchBudget: number, semBudget: number, socialBudget: number, metasearchActual: number, semActual: number, socialActual: number }
const ALL_MONTHLY_BUDGET_DATA = [
  // 2024
  { year: 2024, month: "Jan", metasearchBudget: 0, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 7500, socialActual: 0 },
  { year: 2024, month: "Feb", metasearchBudget: 0, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 7800, socialActual: 0 },
  { year: 2024, month: "Mar", metasearchBudget: 7000, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 7700, socialActual: 0 },
  { year: 2024, month: "Apr", metasearchBudget: 7000, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 7900, socialActual: 0 },
  { year: 2024, month: "May", metasearchBudget: 7000, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 7900, socialActual: 0 },
  { year: 2024, month: "Jun", metasearchBudget: 10000, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 0, socialActual: 2500 },
  { year: 2024, month: "Jul", metasearchBudget: 10000, semBudget: 0, socialBudget: 0, metasearchActual: 6000, semActual: 0, socialActual: 3800 },
  { year: 2024, month: "Aug", metasearchBudget: 10000, semBudget: 0, socialBudget: 0, metasearchActual: 8000, semActual: 15, socialActual: 3200 },
  { year: 2024, month: "Sep", metasearchBudget: 18000, semBudget: 0, socialBudget: 0, metasearchActual: 7000, semActual: 8500, socialActual: 4200 },
  { year: 2024, month: "Oct", metasearchBudget: 18000, semBudget: 0, socialBudget: 0, metasearchActual: 2500, semActual: 8000, socialActual: 4400 },
  { year: 2024, month: "Nov", metasearchBudget: 18000, semBudget: 0, socialBudget: 0, metasearchActual: 2400, semActual: 7800, socialActual: 4100 },
  { year: 2024, month: "Dec", metasearchBudget: 16000, semBudget: 0, socialBudget: 0, metasearchActual: 2600, semActual: 8000, socialActual: 4000 },
  // 2025
  { year: 2025, month: "Jan", metasearchBudget: 0, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 7921.79, socialActual: 0 },
  { year: 2025, month: "Feb", metasearchBudget: 0, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 7969.45, socialActual: 0 },
  { year: 2025, month: "Mar", metasearchBudget: 8000, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 7925.99, socialActual: 0 },
  { year: 2025, month: "Apr", metasearchBudget: 8000, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 7961.28, socialActual: 0 },
  { year: 2025, month: "May", metasearchBudget: 8000, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 7965.97, socialActual: 0 },
  { year: 2025, month: "Jun", metasearchBudget: 12000, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 0, socialActual: 2741.81 },
  { year: 2025, month: "Jul", metasearchBudget: 12000, semBudget: 0, socialBudget: 0, metasearchActual: 7056.76, semActual: 0, socialActual: 4060.58 },
  { year: 2025, month: "Aug", metasearchBudget: 12000, semBudget: 0, socialBudget: 0, metasearchActual: 8794.13, semActual: 19.19, socialActual: 3476.38 },
  { year: 2025, month: "Sep", metasearchBudget: 20000, semBudget: 0, socialBudget: 0, metasearchActual: 7422.17, semActual: 8873.84, socialActual: 4500.10 },
  { year: 2025, month: "Oct", metasearchBudget: 20000, semBudget: 0, socialBudget: 0, metasearchActual: 2704.70, semActual: 8397.16, socialActual: 4598.92 },
  { year: 2025, month: "Nov", metasearchBudget: 20000, semBudget: 0, socialBudget: 0, metasearchActual: 2516.30, semActual: 8067.78, socialActual: 4330.90 },
  { year: 2025, month: "Dec", metasearchBudget: 18000, semBudget: 0, socialBudget: 0, metasearchActual: 2729.84, semActual: 8208.69, socialActual: 4337.01 },
  // 2026
  { year: 2026, month: "Jan", metasearchBudget: 0, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 8200, socialActual: 0 },
  { year: 2026, month: "Feb", metasearchBudget: 0, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 8100, socialActual: 0 },
  { year: 2026, month: "Mar", metasearchBudget: 8500, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 8000, socialActual: 0 },
  { year: 2026, month: "Apr", metasearchBudget: 8500, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 8100, socialActual: 0 },
  { year: 2026, month: "May", metasearchBudget: 8500, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 8100, socialActual: 0 },
  { year: 2026, month: "Jun", metasearchBudget: 13000, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 0, socialActual: 3000 },
  { year: 2026, month: "Jul", metasearchBudget: 13000, semBudget: 0, socialBudget: 0, metasearchActual: 7500, semActual: 0, socialActual: 4500 },
  { year: 2026, month: "Aug", metasearchBudget: 13000, semBudget: 0, socialBudget: 0, metasearchActual: 9000, semActual: 20, socialActual: 3800 },
  { year: 2026, month: "Sep", metasearchBudget: 21000, semBudget: 0, socialBudget: 0, metasearchActual: 7800, semActual: 9000, socialActual: 4800 },
  { year: 2026, month: "Oct", metasearchBudget: 21000, semBudget: 0, socialBudget: 0, metasearchActual: 2900, semActual: 8500, socialActual: 4700 },
  { year: 2026, month: "Nov", metasearchBudget: 21000, semBudget: 0, socialBudget: 0, metasearchActual: 2700, semActual: 8300, socialActual: 4500 },
  { year: 2026, month: "Dec", metasearchBudget: 19000, semBudget: 0, socialBudget: 0, metasearchActual: 3000, semActual: 8400, socialActual: 4600 },
];

// Legacy MONTHLY_BUDGET_DATA for 2025 (for backward compatibility)
// This will be overridden in the component based on slideType
const MONTHLY_BUDGET_DATA = ALL_MONTHLY_BUDGET_DATA
  .filter(d => d.year === 2025)
  .map(({ year, ...rest }) => rest);

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

// Monthly revenue data - All months from January 2024 to December 2026 (Brady Hotels ONLY - filtered by account)
// Data structure: { year: number, month: string, metasearch: number, social: number, sem: number }
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
  // 2026
  { year: 2026, month: "Jan", metasearch: 0, social: 0, sem: 650000 },
  { year: 2026, month: "Feb", metasearch: 0, social: 0, sem: 480000 },
  { year: 2026, month: "Mar", metasearch: 0, social: 0, sem: 440000 },
  { year: 2026, month: "Apr", metasearch: 0, social: 0, sem: 450000 },
  { year: 2026, month: "May", metasearch: 0, social: 0, sem: 460000 },
  { year: 2026, month: "Jun", metasearch: 0, social: 0, sem: 0 },
  { year: 2026, month: "Jul", metasearch: 70000, social: 10000, sem: 0 },
  { year: 2026, month: "Aug", metasearch: 65000, social: 55000, sem: 0 },
  { year: 2026, month: "Sep", metasearch: 70000, social: 50000, sem: 300000 },
  { year: 2026, month: "Oct", metasearch: 68000, social: 62000, sem: 210000 },
  { year: 2026, month: "Nov", metasearch: 65000, social: 110000, sem: 290000 },
  { year: 2026, month: "Dec", metasearch: 38000, social: 90000, sem: 160000 },
];

// Legacy MONTHLY_DATA for 2025 (for backward compatibility with existing charts)
// This will be overridden in the component based on slideType
const MONTHLY_DATA = ALL_MONTHLY_DATA
  .filter(d => d.year === 2025)
  .map(({ year, ...rest }) => rest);

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

// Combine all breakdown data from all channels
const combineBreakdownData = () => {
  const combined: Array<{
    hotel?: string;
    linkType?: string;
    campaign?: string;
    device?: string;
    market?: string;
    impressions: number;
    clicks: number;
    cost: number;
    revenue: number;
    bookings: number;
  }> = [];

  // Add metasearch data
  METASEARCH_BY_HOTEL.forEach(row => {
    combined.push({
      hotel: row.hotel,
      impressions: row.impressions,
      clicks: row.clicks,
      cost: row.cost,
      revenue: row.revenue,
      bookings: row.bookings,
    });
  });

  METASEARCH_BY_LINK_TYPE.forEach(row => {
    combined.push({
      linkType: row.linkType,
      impressions: row.impressions,
      clicks: row.clicks,
      cost: row.cost,
      revenue: row.revenue,
      bookings: row.bookings,
    });
  });

  // Add SEM data
  SEM_BY_CAMPAIGN_WITH_OTHER.forEach(row => {
    combined.push({
      campaign: row.campaign,
      impressions: row.impressions,
      clicks: row.clicks,
      cost: row.cost,
      revenue: row.revenue,
      bookings: row.bookings,
    });
  });

  // Add Social data
  SOCIAL_BY_CAMPAIGN_WITH_OTHER.forEach(row => {
    combined.push({
      campaign: row.campaign,
      impressions: row.impressions,
      clicks: row.clicks,
      cost: row.cost,
      revenue: row.revenue,
      bookings: row.bookings,
    });
  });

  return combined;
};

// Unified breakdown table component with Group by / Breakdown by dropdowns
const UnifiedBreakdownTable = ({ 
  groupBy,
  breakdownBy,
  expandedRow,
  onRowClick,
  onGroupByChange,
  onBreakdownByChange,
  availableDimensions,
}: {
  groupBy: string;
  breakdownBy: string;
  expandedRow: string | null;
  onRowClick: (rowValue: string | null) => void;
  onGroupByChange: (value: string) => void;
  onBreakdownByChange: (value: string) => void;
  availableDimensions: { id: string; name: string; type: string }[];
}) => {
  // Memoize combined data
  const allData = useMemo(() => combineBreakdownData(), []);
  
  // Group data by the selected groupBy dimension
  const groupedData = useMemo(() => {
    const groups: Record<string, typeof allData> = {};
    
    allData.forEach(row => {
      const groupValue = row[groupBy as keyof typeof row] as string | undefined;
      if (groupValue && groupValue.trim() !== '') {
        if (!groups[groupValue]) {
          groups[groupValue] = [];
        }
        groups[groupValue].push(row);
      }
    });

    // Aggregate each group
    return Object.entries(groups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([groupValue, rows]) => {
        const aggregated = rows.reduce((acc, row) => ({
          impressions: acc.impressions + row.impressions,
          clicks: acc.clicks + row.clicks,
          cost: acc.cost + row.cost,
          revenue: acc.revenue + row.revenue,
          bookings: acc.bookings + row.bookings,
        }), { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 });

        return {
          groupValue,
          metrics: calculateDerivedMetrics(aggregated),
          rawData: rows,
        };
      });
  }, [allData, groupBy]);

  // Get breakdown data for expanded row
  const breakdownData = useMemo(() => {
    if (!expandedRow || !breakdownBy) return [];
    
    const rowData = groupedData.find(g => g.groupValue === expandedRow)?.rawData || [];
    const breakdownGroups: Record<string, typeof allData> = {};
    
    rowData.forEach(row => {
      const breakdownValue = row[breakdownBy as keyof typeof row] as string | undefined;
      if (breakdownValue && breakdownValue.trim() !== '') {
        if (!breakdownGroups[breakdownValue]) {
          breakdownGroups[breakdownValue] = [];
        }
        breakdownGroups[breakdownValue].push(row);
      }
    });

    return Object.entries(breakdownGroups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([breakdownValue, rows]) => {
        const aggregated = rows.reduce((acc, row) => ({
          impressions: acc.impressions + row.impressions,
          clicks: acc.clicks + row.clicks,
          cost: acc.cost + row.cost,
          revenue: acc.revenue + row.revenue,
          bookings: acc.bookings + row.bookings,
        }), { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 });

        return {
          breakdownValue,
          metrics: calculateDerivedMetrics(aggregated),
        };
      });
  }, [expandedRow, breakdownBy, groupedData]);

  // Calculate totals
  const totals = groupedData.reduce((acc, group) => ({
    impressions: acc.impressions + group.metrics.impressions,
    clicks: acc.clicks + group.metrics.clicks,
    cost: acc.cost + group.metrics.cost,
    revenue: acc.revenue + group.metrics.revenue,
    bookings: acc.bookings + group.metrics.bookings,
  }), { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 });
  const totalMetrics = calculateDerivedMetrics(totals);

  const groupByDim = availableDimensions.find(d => d.id === groupBy);
  const breakdownByDim = availableDimensions.find(d => d.id === breakdownBy);

  return (
    <div className="space-y-4">
      {/* Dropdowns */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">Group by:</Label>
          <Select value={groupBy} onValueChange={(value) => { onGroupByChange(value); onRowClick(null); }}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableDimensions.map(dim => (
                <SelectItem key={dim.id} value={dim.id}>{dim.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">Breakdown by:</Label>
          <Select value={breakdownBy} onValueChange={onBreakdownByChange}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableDimensions.filter(d => d.id !== groupBy).map(dim => (
                <SelectItem key={dim.id} value={dim.id}>{dim.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{groupByDim?.name || 'Group'}</TableHead>
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
          {groupedData.map((group) => (
            <>
              <TableRow 
                key={group.groupValue}
                className={cn("cursor-pointer hover:bg-muted/50", expandedRow === group.groupValue && "bg-muted")}
                onClick={() => onRowClick(expandedRow === group.groupValue ? null : group.groupValue)}
              >
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    <span>{expandedRow === group.groupValue ? '▼' : '▶'}</span>
                    <span>{group.groupValue}</span>
                  </div>
                </TableCell>
                <TableCell className="text-right">{formatNumber(group.metrics.impressions)}</TableCell>
                <TableCell className="text-right">{formatNumber(group.metrics.clicks)}</TableCell>
                <TableCell className="text-right">{group.metrics.ctr.toFixed(2)}%</TableCell>
                <TableCell className="text-right">{group.metrics.bookings.toFixed(2)}</TableCell>
                <TableCell className="text-right">{group.metrics.conversionRate.toFixed(2)}%</TableCell>
                <TableCell className="text-right">${group.metrics.cpc.toFixed(2)}</TableCell>
                <TableCell className="text-right">${formatNumber(group.metrics.cost)}</TableCell>
                <TableCell className="text-right">${formatNumber(group.metrics.revenue)}</TableCell>
                <TableCell className="text-right">{group.metrics.roas.toFixed(1)}x</TableCell>
                <TableCell className="text-right">{group.metrics.costOfSale.toFixed(2)}%</TableCell>
              </TableRow>
              {expandedRow === group.groupValue && breakdownData.length > 0 && (
                <>
                  {breakdownData.map((breakdown) => (
                    <TableRow key={`${group.groupValue}-${breakdown.breakdownValue}`} className="bg-muted/30">
                      <TableCell className="font-medium pl-8">
                        <span className="text-muted-foreground">{breakdownByDim?.name}: {breakdown.breakdownValue}</span>
                      </TableCell>
                      <TableCell className="text-right">{formatNumber(breakdown.metrics.impressions)}</TableCell>
                      <TableCell className="text-right">{formatNumber(breakdown.metrics.clicks)}</TableCell>
                      <TableCell className="text-right">{breakdown.metrics.ctr.toFixed(2)}%</TableCell>
                      <TableCell className="text-right">{breakdown.metrics.bookings.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{breakdown.metrics.conversionRate.toFixed(2)}%</TableCell>
                      <TableCell className="text-right">${breakdown.metrics.cpc.toFixed(2)}</TableCell>
                      <TableCell className="text-right">${formatNumber(breakdown.metrics.cost)}</TableCell>
                      <TableCell className="text-right">${formatNumber(breakdown.metrics.revenue)}</TableCell>
                      <TableCell className="text-right">{breakdown.metrics.roas.toFixed(1)}x</TableCell>
                      <TableCell className="text-right">{breakdown.metrics.costOfSale.toFixed(2)}%</TableCell>
                    </TableRow>
                  ))}
                </>
              )}
            </>
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
    </div>
  );
};

// Breakdown table component - REORDERED: Bookings before Conversion Rate (kept for backward compatibility)
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
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const { data: userData } = useUser();
  const user = userData?.user || null;
  const [selectedYear, setSelectedYear] = useState("2026"); // Default to latest year
  const [selectedMonth, setSelectedMonth] = useState("January"); // Default to January (latest month)
  const [selectedTab, setSelectedTab] = useState("overview");
  const [comparisonType, setComparisonType] = useState("none");
  const [isEditSourceOpen, setIsEditSourceOpen] = useState(false);
  const [isDataModalOpen, setIsDataModalOpen] = useState(false);
  const [selectedDimensions, setSelectedDimensions] = useState({
    metasearch: true,
    sem: true,
    social: true,
  });

  // Determine slide type from URL
  const slideType = location.pathname.includes('/master-report') ? 'master-report' : 
                    location.pathname.includes('/brady') ? 'brady' : 'default';

  // Dynamic data state (fetched from database)
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [dynamicMonthlyData, setDynamicMonthlyData] = useState<any[]>([]);
  const [dynamicChannelTotals, setDynamicChannelTotals] = useState<Record<string, any>>({});
  const [dynamicYearlyTotals, setDynamicYearlyTotals] = useState<Record<number, Record<string, any>>>({});

  // Fetch real data from edge function for master-report
  const fetchSlideReportData = async () => {
    if (slideType !== 'master-report') return;
    
    setIsLoadingData(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-slide-report-data', {
        body: {
          accountId,
          years: [2024, 2025, 2026],
          hotelFilter: true, // Only Brady hotels for metasearch
        },
      });

      if (error) {
        console.error('Error fetching slide report data:', error);
        return;
      }

      console.log('Fetched slide report data:', data);
      setDynamicMonthlyData(data.monthlyRevenue || []);
      setDynamicChannelTotals(data.channelTotals || {});
      setDynamicYearlyTotals(data.yearlyTotals || {});
    } catch (err) {
      console.error('Error calling edge function:', err);
    } finally {
      setIsLoadingData(false);
    }
  };

  // Fetch data on mount for master-report
  useEffect(() => {
    if (slideType === 'master-report' && accountId) {
      fetchSlideReportData();
    }
  }, [slideType, accountId]);

  // Filter monthly data based on selected year
  const filteredMonthlyData = useMemo(() => {
    const sourceData = slideType === 'master-report' && dynamicMonthlyData.length > 0 
      ? dynamicMonthlyData 
      : MONTHLY_DATA.map(m => ({ ...m, year: 2025 }));
    
    if (selectedYear === 'all') {
      return sourceData;
    }
    return sourceData.filter(m => m.year === parseInt(selectedYear));
  }, [slideType, dynamicMonthlyData, selectedYear]);

  // Get current totals based on selected year/month
  const currentTotals = useMemo(() => {
    if (slideType === 'master-report' && Object.keys(dynamicChannelTotals).length > 0) {
      // If specific year selected, use yearly totals
      if (selectedYear !== 'all') {
        const yearNum = parseInt(selectedYear);
        const yearTotals = dynamicYearlyTotals[yearNum] || {};
        return {
          metasearch: yearTotals.metasearch || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 },
          sem: yearTotals.sem || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 },
          social: yearTotals.social || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 },
        };
      }
      return dynamicChannelTotals;
    }
    // Fallback to hardcoded data
    return {
      metasearch: METASEARCH_DATA,
      sem: SEM_DATA,
      social: SOCIAL_DATA,
    };
  }, [slideType, dynamicChannelTotals, dynamicYearlyTotals, selectedYear]);

  // Slide report state
  const [slideReportId, setSlideReportId] = useState<string | null>(null);
  const { data: slideReport } = useSlideReport(slideReportId);
  const { data: slideReports } = useSlideReports(accountId || null);
  const createSlideReport = useCreateSlideReport();
  const updateSlideReport = useUpdateSlideReport();
  const refreshSlideReportData = useRefreshSlideReportData();

  // Load data from stored pivot_data when slideReport changes
  useEffect(() => {
    if (slideReport?.pivot_data && slideType === 'master-report') {
      const pivotData = slideReport.pivot_data;
      
      // Build monthly data with per-channel breakdown
      const monthlyDataMap: Record<string, any> = {};
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      
      // First, load overview monthly data as base
      if (pivotData.overview?.monthly) {
        Object.entries(pivotData.overview.monthly).forEach(([key, metrics]: [string, any]) => {
          const [year, monthNum] = key.split('-');
          const monthName = monthNames[parseInt(monthNum) - 1];
          monthlyDataMap[key] = {
            month: monthName,
            year: parseInt(year),
            revenue: metrics.revenue || 0,
            cost: metrics.cost || 0,
            impressions: metrics.impressions || 0,
            clicks: metrics.clicks || 0,
            bookings: metrics.bookings || 0,
            metasearch: 0,
            sem: 0,
            social: 0,
          };
        });
      }
      
      // Then, load channel-specific monthly data from channels[channel].monthly
      if (pivotData.channels) {
        for (const [channel, channelData] of Object.entries(pivotData.channels)) {
          const channelMonthly = (channelData as any).monthly;
          if (channelMonthly) {
            Object.entries(channelMonthly).forEach(([key, metrics]: [string, any]) => {
              if (!monthlyDataMap[key]) {
                const [year, monthNum] = key.split('-');
                const monthName = monthNames[parseInt(monthNum) - 1];
                monthlyDataMap[key] = {
                  month: monthName,
                  year: parseInt(year),
                  revenue: 0,
                  cost: 0,
                  impressions: 0,
                  clicks: 0,
                  bookings: 0,
                  metasearch: 0,
                  sem: 0,
                  social: 0,
                };
              }
              // Store channel-specific revenue
              monthlyDataMap[key][channel] = (metrics as any).revenue || 0;
            });
          }
        }
      }
      
      // Convert to array and sort
      const monthlyRevenue = Object.values(monthlyDataMap).sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return monthNames.indexOf(a.month) - monthNames.indexOf(b.month);
      });
      
      if (monthlyRevenue.length > 0) {
        setDynamicMonthlyData(monthlyRevenue);
      }
      
      // Load channel totals from current metrics
      if (pivotData.channels) {
        const channelTotals: Record<string, any> = {};
        for (const [channel, channelData] of Object.entries(pivotData.channels)) {
          channelTotals[channel] = (channelData as any).current;
        }
        if (Object.keys(channelTotals).length > 0) {
          setDynamicChannelTotals(channelTotals);
        }
        
        // Load yearly totals
        const yearlyTotals: Record<number, Record<string, any>> = {};
        for (const year of [2024, 2025, 2026]) {
          yearlyTotals[year] = {};
          for (const [channel, channelData] of Object.entries(pivotData.channels)) {
            const yearly = (channelData as any).yearly;
            if (yearly?.[String(year)]) {
              yearlyTotals[year][channel] = yearly[String(year)];
            }
          }
        }
        if (Object.values(yearlyTotals).some(y => Object.keys(y).length > 0)) {
          setDynamicYearlyTotals(yearlyTotals);
        }
      }
      
      console.log('Loaded pivot data from slideReport:', {
        monthlyCount: Object.keys(pivotData.overview?.monthly || {}).length,
        channels: Object.keys(pivotData.channels || {}),
        computedAt: (pivotData as any).computedAt,
      });
    }
  }, [slideReport?.pivot_data, slideType]);

  useEffect(() => {
    const loadOrCreateSlideReport = async () => {
      if (!accountId || !user) return;

      try {
        // For master-report, look for or create a slide report with name "Master Report"
        if (slideType === 'master-report') {
          const masterReport = slideReports?.find(r => r.name === 'Master Report' && r.is_active);
          
          if (masterReport) {
            setSlideReportId(masterReport.id);
            // Load configuration from existing report
            if (masterReport.configuration) {
              const config = masterReport.configuration;
              if (config.selectedChannels) {
                setSelectedDimensions({
                  metasearch: config.selectedChannels.includes('metasearch'),
                  sem: config.selectedChannels.includes('sem'),
                  social: config.selectedChannels.includes('social'),
                });
              }
              if (config.selectedValueDimensionIds) {
                setSelectedValueDimensionIds(config.selectedValueDimensionIds);
              }
              if (config.channelConfigs) {
                setChannelConfigs(config.channelConfigs);
              }
              if (config.breakdownConfigs) {
                setBreakdownConfigs(config.breakdownConfigs);
              }
              if (config.filterConfigs) {
                setFilterConfigs(config.filterConfigs as any);
              }
            }
            // Load date range - default to 2026 (latest year)
            if (masterReport.date_range) {
              const storedYear = masterReport.date_range.year;
              const latestYear = 2026;
              const yearToUse = storedYear >= latestYear ? storedYear : latestYear;
              setSelectedYear(yearToUse.toString());
              setSelectedMonth(masterReport.date_range.month || 'January');
              // Also set sinceMonth/sinceYear for Edit Source modal
              setSinceMonth(masterReport.date_range.month || 'January');
              setSinceYear(yearToUse);
            } else {
              // No date range stored, default to latest
              setSelectedYear('2026');
              setSelectedMonth('January');
              setSinceMonth('January');
              setSinceYear(2026);
            }
          } else {
            // Create new Master Report slide report
            const newReport = await createSlideReport.mutateAsync({
              name: 'Master Report',
              account_id: accountId,
              user_id: user.id,
              configuration: {
                selectedChannels: ['metasearch', 'sem', 'social'],
                selectedValueDimensionIds: ALL_BRADY_DIMENSIONS,
                channelConfigs: {
                  metasearch: { dimensionId: null, selectedValues: [] },
                  sem: { dimensionId: null, selectedValues: [] },
                  social: { dimensionId: null, selectedValues: [] },
                },
                breakdownConfigs: {
                  metasearch: { breakdownDimensionIds: [] },
                  sem: { breakdownDimensionIds: [] },
                  social: { breakdownDimensionIds: [] },
                },
                filterConfigs: {
                  metasearch: { filterDimensionIds: [] },
                  sem: { filterDimensionIds: [] },
                  social: { filterDimensionIds: [] },
                },
              },
              report_ids: CHANNEL_REPORT_IDS,
              date_range: {
                year: 2026,
                month: 'January',
                from: '2026-01-01',
                to: new Date().toISOString().split('T')[0], // Latest available
              },
            });
            setSlideReportId(newReport.id);
            setSelectedYear('2026');
            setSelectedMonth('January');
            setSinceMonth('January');
            setSinceYear(2026);
          }
          return;
        }
        
        // For brady or regular slides, use existing logic
        // Try to find existing slide report for this account
        // For now, we'll use the first active one or create a new one
        const existingReport = slideReports?.find(r => r.is_active);
        
        if (existingReport) {
          setSlideReportId(existingReport.id);
          // Load configuration from existing report
          if (existingReport.configuration) {
            const config = existingReport.configuration;
            if (config.selectedChannels) {
              setSelectedDimensions({
                metasearch: config.selectedChannels.includes('metasearch'),
                sem: config.selectedChannels.includes('sem'),
                social: config.selectedChannels.includes('social'),
              });
            }
            if (config.selectedValueDimensionIds) {
              setSelectedValueDimensionIds(config.selectedValueDimensionIds);
            }
            if (config.channelConfigs) {
              setChannelConfigs(config.channelConfigs);
            }
            if (config.breakdownConfigs) {
              setBreakdownConfigs(config.breakdownConfigs);
            }
            if (config.filterConfigs) {
              setFilterConfigs(config.filterConfigs);
            }
          }
          // Load date range - default to 2026 (latest year)
          if (existingReport.date_range) {
            const storedYear = existingReport.date_range.year;
            const latestYear = 2026;
            const yearToUse = storedYear >= latestYear ? storedYear : latestYear;
            setSelectedYear(yearToUse.toString());
            setSelectedMonth(existingReport.date_range.month || 'January');
            // Also set sinceMonth/sinceYear for Edit Source modal
            setSinceMonth(existingReport.date_range.month || 'January');
            setSinceYear(yearToUse);
          } else {
            // No date range stored, default to latest
            setSelectedYear('2026');
            setSelectedMonth('January');
            setSinceMonth('January');
            setSinceYear(2026);
          }
        }
      } catch (error) {
        console.error('Error loading slide report:', error);
      }
    };

    loadOrCreateSlideReport();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, user?.id, slideReports?.length, slideType]);

  // Open modal if ?edit=true in URL
  useEffect(() => {
    if (searchParams.get('edit') === 'true') {
      setIsEditSourceOpen(true);
      setSearchParams({}, { replace: true }); // Remove the query param
    }
  }, [searchParams, setSearchParams]);

  // Step-by-step modal state (6 steps now: Date, Channels, Value Dimensions, Data Source, Breakdown, Filters)
  type ModalStep = 1 | 2 | 3 | 4 | 5 | 6;
  const [modalStep, setModalStep] = useState<ModalStep>(1);
  const [activeChannelTab, setActiveChannelTab] = useState<'metasearch' | 'sem' | 'social' | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Date configuration for "Since" (Step 1)
  const [sinceMonth, setSinceMonth] = useState<string>("January");
  const [sinceYear, setSinceYear] = useState<number>(2024);

  // Channel to Report ID mapping for Brady Hotels (hardcoded)
  const CHANNEL_REPORT_IDS: Record<string, string> = {
    metasearch: '2eff17d0-38de-4d5d-a15b-69ad13788c92',
    sem: '3b2a0e45-33be-4eec-911e-b955b951c84e',
    social: '8c2f7db9-acbd-4c59-9593-74e8953e7787',
  };

  // Value dimension IDs state (for step 2 - applies to all channels)
  // Pre-selected value dimensions for Brady Hotels based on actual report data
  // Metasearch: Impressions, Clicks, Cost, Revenue, Bookings, CPC, Cost of sale, Impression Share
  // SEM: Impressions, Clicks, Cost, Revenue, Bookings
  // Social: Impressions, Clicks, Cost, Revenue, Bookings, Leads, CTR
  
  // Hardcoded value dimension IDs that exist in each Brady Hotels report
  const BRADY_METASEARCH_DIMENSIONS = [
    '89c229d9-8a6e-4d94-a0d2-a4b43b6f3fe1', // Impressions
    '1caad3eb-3d5e-405c-9df7-1c96971171c5', // Clicks
    'fb281b3f-c800-48f4-b34b-02d4f0244b07', // Cost
    '7f4cb2e9-52a3-4110-803a-58d2e7afacb5', // Revenue
    '79aeb7f7-a9c6-43cd-bd05-ff7df81babf1', // Bookings
    '8962dff5-bb0f-4ab1-ace7-e5dc5eb4fdcc', // CPC
    '3486d423-f75c-402e-8fb2-285b6e7e22ec', // Cost of sale
    'bfde7232-89ab-46ba-80ed-015a4d73bae5', // Impression Share
  ];
  
  const BRADY_SEM_DIMENSIONS = [
    '89c229d9-8a6e-4d94-a0d2-a4b43b6f3fe1', // Impressions
    '1caad3eb-3d5e-405c-9df7-1c96971171c5', // Clicks
    'fb281b3f-c800-48f4-b34b-02d4f0244b07', // Cost
    '7f4cb2e9-52a3-4110-803a-58d2e7afacb5', // Revenue
    '79aeb7f7-a9c6-43cd-bd05-ff7df81babf1', // Bookings
  ];
  
  const BRADY_SOCIAL_DIMENSIONS = [
    '89c229d9-8a6e-4d94-a0d2-a4b43b6f3fe1', // Impressions
    '1caad3eb-3d5e-405c-9df7-1c96971171c5', // Clicks
    'fb281b3f-c800-48f4-b34b-02d4f0244b07', // Cost
    '7f4cb2e9-52a3-4110-803a-58d2e7afacb5', // Revenue
    '79aeb7f7-a9c6-43cd-bd05-ff7df81babf1', // Bookings
    'bbe9b05b-7485-4eb3-a3cc-d04f05823f63', // Leads
    'ff046f06-10ee-4420-a02f-d4089e5f75a6', // CTR
  ];
  
  // Union of all hardcoded dimensions (unique IDs) - applies to all channels
  const ALL_BRADY_DIMENSIONS = [
    ...new Set([
      ...BRADY_METASEARCH_DIMENSIONS,
      ...BRADY_SEM_DIMENSIONS,
      ...BRADY_SOCIAL_DIMENSIONS,
    ])
  ];
  
  const [selectedValueDimensionIds, setSelectedValueDimensionIds] = useState<string[]>(ALL_BRADY_DIMENSIONS);

  // Available dimensions per channel (fetched from database) - VALUE types only
  const [availableDimensions, setAvailableDimensions] = useState<Record<string, { id: string; name: string; type: string }[]>>({
    metasearch: [],
    sem: [],
    social: [],
  });
  const [loadingAvailableDimensions, setLoadingAvailableDimensions] = useState(false);

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

  // Refresh Data Modal state
  const [isRefreshModalOpen, setIsRefreshModalOpen] = useState(false);
  const [refreshStep, setRefreshStep] = useState(0); // 0 = not started, 1-4 = steps
  const [refreshStepStatus, setRefreshStepStatus] = useState<Record<number, 'pending' | 'loading' | 'complete' | 'error'>>({
    1: 'pending',
    2: 'pending',
    3: 'pending',
    4: 'pending',
  });
  const [refreshError, setRefreshError] = useState<string | null>(null);

  const [breakdownDimensions, setBreakdownDimensions] = useState<Record<string, Dimension[]>>({
    metasearch: [],
    sem: [],
    social: [],
  });
  const [loadingBreakdownDimensions, setLoadingBreakdownDimensions] = useState<Record<string, boolean>>({
    metasearch: false,
    sem: false,
    social: false,
  });

  // Load breakdown dimensions from data source for a channel
  const loadBreakdownDimensionsForChannel = async (channel: 'metasearch' | 'sem' | 'social') => {
    setLoadingBreakdownDimensions(prev => ({ ...prev, [channel]: true }));
    try {
      const reportId = CHANNEL_REPORT_IDS[channel];
      if (!reportId) {
        setBreakdownDimensions(prev => ({ ...prev, [channel]: [] }));
        return;
      }

      // Fetch data source for the report
      const { data: dsData, error: dsError } = await supabase
        .from('data_sources')
        .select('column_mappings')
        .eq('report_id', reportId)
        .limit(1)
        .maybeSingle();

      if (dsError || !dsData) {
        console.error(`Error fetching data source for ${channel}:`, dsError);
        setBreakdownDimensions(prev => ({ ...prev, [channel]: [] }));
        return;
      }

      // Extract dimension IDs from column mappings
      const columnMappings = Array.isArray(dsData.column_mappings) ? dsData.column_mappings : [];
      const dimensionIds = columnMappings
        .filter((m: any) => m.dimensionId && m.dimensionId !== 'none' && m.dimensionId !== null)
        .map((m: any) => m.dimensionId);

      if (dimensionIds.length === 0) {
        setBreakdownDimensions(prev => ({ ...prev, [channel]: [] }));
        return;
      }

      // Fetch dimension details - only TEXT type for breakdown
      const { data: dims, error: dimError } = await supabase
        .from('dimensions')
        .select('id, name, type')
        .in('id', dimensionIds)
        .eq('type', 'text')
        .order('name');

      if (dimError) {
        console.error(`Error loading breakdown dimensions for ${channel}:`, dimError);
        setBreakdownDimensions(prev => ({ ...prev, [channel]: [] }));
        return;
      }

      setBreakdownDimensions(prev => ({ ...prev, [channel]: dims || [] }));
    } catch (err) {
      console.error(`Error loading breakdown dimensions for ${channel}:`, err);
      setBreakdownDimensions(prev => ({ ...prev, [channel]: [] }));
    } finally {
      setLoadingBreakdownDimensions(prev => ({ ...prev, [channel]: false }));
    }
  };

  // Combined breakdown table state
  const [groupByDimension, setGroupByDimension] = useState<string>('hotel');
  const [breakdownByDimension, setBreakdownByDimension] = useState<string>('link_type');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

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

  // Initialize active channel tab when entering step 4, 5, or 6 (Data Source, Breakdown, Filters)
  useEffect(() => {
    if ((modalStep === 4 || modalStep === 5 || modalStep === 6) && selectedChannels.length > 0 && !activeChannelTab) {
      setActiveChannelTab(selectedChannels[0]);
    }
  }, [modalStep, selectedChannels, activeChannelTab]);

  // Hardcoded TEXT dimension mappings per channel (from actual report data)
  const CHANNEL_TEXT_DIMENSIONS: Record<string, Dimension[]> = {
    metasearch: [
      { id: '093ac487-dd90-4466-9972-ac51d110e91e', name: 'Hotel', type: 'text' },
      { id: '970c0d99-7ec4-48db-893c-15957122b9cc', name: 'Channel', type: 'text' },
      { id: '6955d48a-0425-48f6-b77a-31aa11dc8eb3', name: 'Device', type: 'text' },
      { id: '6c553ea6-e3bb-4946-bb56-069d39a3c5c0', name: 'Link Type', type: 'text' },
      { id: 'febc1239-37e9-47db-bccc-77763d95c598', name: 'Market', type: 'text' },
    ],
    sem: [
      { id: '277ec940-a91b-4c95-b1e2-4a8fd5814d04', name: 'Account', type: 'text' },
      { id: '745b7d51-76be-4042-bc88-790fc53de865', name: 'Campaign', type: 'text' },
    ],
    social: [
      { id: '277ec940-a91b-4c95-b1e2-4a8fd5814d04', name: 'Account', type: 'text' },
      { id: 'b864ad95-3b65-4610-a8ef-cba9cebabf5b', name: 'Ad Group', type: 'text' },
      { id: '745b7d51-76be-4042-bc88-790fc53de865', name: 'Campaign', type: 'text' },
    ],
  };

  // Load dimensions for a channel from actual report data
  const loadDimensionsForChannel = async (channel: 'metasearch' | 'sem' | 'social') => {
    setLoadingDimensions(prev => ({ ...prev, [channel]: true }));
    try {
      // Use hardcoded dimensions from actual report data
      const channelDims = CHANNEL_TEXT_DIMENSIONS[channel] || [];
      setDimensions(prev => ({ ...prev, [channel]: channelDims }));
      
      // Auto-select first dimension (Hotel for metasearch, Account for others)
      if (channelDims.length > 0 && !channelConfigs[channel]?.dimensionId) {
        const firstDimId = channelDims[0].id;
        setChannelConfigs(prev => ({
          ...prev,
          [channel]: {
            ...prev[channel],
            dimensionId: firstDimId,
          },
        }));
        // Load values for the auto-selected dimension
        await loadValuesForDimension(channel, firstDimId);
      }
    } catch (err) {
      console.error(`Error loading dimensions for ${channel}:`, err);
      setDimensions(prev => ({ ...prev, [channel]: [] }));
    } finally {
      setLoadingDimensions(prev => ({ ...prev, [channel]: false }));
    }
  };

  // Load values for a dimension from dimension_data table (faster than fetching from source)
  // Also uses cached/saved selected values from channelConfigs for instant display
  const loadValuesForDimension = async (channel: 'metasearch' | 'sem' | 'social', dimensionId: string) => {
    // FIRST: Immediately show cached selected values from saved config (instant display)
    const savedConfig = channelConfigs[channel];
    const cachedSelectedValues = savedConfig?.selectedValues || [];
    
    // If we have cached values and the dimension matches, show them immediately
    if (cachedSelectedValues.length > 0 && savedConfig?.dimensionId === dimensionId) {
      console.log(`Using ${cachedSelectedValues.length} cached values for ${channel}/${dimensionId}`);
      setDimensionValues(prev => ({ ...prev, [channel]: cachedSelectedValues }));
    }
    
    setLoadingValues(prev => ({ ...prev, [channel]: true }));
    try {
      const reportId = CHANNEL_REPORT_IDS[channel];
      
      if (!reportId) {
        console.error(`No report ID for channel: ${channel}`);
        // Fall back to cached values if available
        if (cachedSelectedValues.length === 0) {
          setDimensionValues(prev => ({ ...prev, [channel]: [] }));
        }
        return;
      }

      // Fetch unique values from dimension_data table (much faster than fetching from source)
      const { data: dimData, error: dimError } = await supabase
        .from('dimension_data')
        .select('dimension_values')
        .eq('report_id', reportId)
        .limit(5000);

      if (dimError) {
        console.error(`Error fetching dimension_data for ${channel}:`, dimError);
        // Keep cached values if fetch fails
        if (cachedSelectedValues.length === 0) {
          setDimensionValues(prev => ({ ...prev, [channel]: [] }));
        }
        return;
      }

      if (!dimData || dimData.length === 0) {
        console.error(`No dimension_data found for ${channel} (report: ${reportId})`);
        // Keep cached values if no data found
        if (cachedSelectedValues.length === 0) {
          setDimensionValues(prev => ({ ...prev, [channel]: [] }));
        }
        return;
      }

      // Extract unique values for this dimension
      const valueSet = new Set<string>();
      
      // Start with cached selected values to ensure they're always included
      cachedSelectedValues.forEach(v => valueSet.add(v));
      
      dimData.forEach((row: any) => {
        const dimValues = row.dimension_values || {};
        const val = dimValues[dimensionId];
        if (val !== undefined && val !== null && val !== '') {
          const stringVal = String(val).trim();
          if (stringVal !== '') {
            valueSet.add(stringVal);
          }
        }
      });

      let values = Array.from(valueSet).sort();
      
      // For Metasearch Hotel dimension, filter to only Brady hotels (only for brady slide, not master-report)
      if (slideType === 'brady' && channel === 'metasearch' && dimensionId === '093ac487-dd90-4466-9972-ac51d110e91e') {
        values = values.filter(v => v.startsWith('Brady'));
      }

      console.log(`Loaded ${values.length} values for ${channel}/${dimensionId}:`, values.slice(0, 5));
      setDimensionValues(prev => ({ ...prev, [channel]: values }));
      
      // Auto-select all Brady values for metasearch Hotel (only for brady slide, not master-report)
      if (slideType === 'brady' && channel === 'metasearch' && dimensionId === '093ac487-dd90-4466-9972-ac51d110e91e') {
        setChannelConfigs(prev => ({
          ...prev,
          [channel]: {
            ...prev[channel],
            selectedValues: values, // Auto-select all 4 Brady hotels
          },
        }));
      }
    } catch (err) {
      console.error(`Error loading values for ${channel}/${dimensionId}:`, err);
      // Keep cached values on error
      if (cachedSelectedValues.length === 0) {
        setDimensionValues(prev => ({ ...prev, [channel]: [] }));
      }
    } finally {
      setLoadingValues(prev => ({ ...prev, [channel]: false }));
    }
  };

  // Load dimensions when entering step 3, 4, 5, or 6 (after Date and Channels steps)
  useEffect(() => {
    if ((modalStep === 3 || modalStep === 4 || modalStep === 5 || modalStep === 6) && isEditSourceOpen) {
      selectedChannels.forEach(channel => {
        if (dimensions[channel].length === 0 && !loadingDimensions[channel]) {
          loadDimensionsForChannel(channel);
        }
      });
    }
  }, [modalStep, isEditSourceOpen, selectedChannels]);

  // Load breakdown dimensions when entering step 5
  useEffect(() => {
    if (modalStep === 5 && isEditSourceOpen) {
      selectedChannels.forEach(channel => {
        if (breakdownDimensions[channel].length === 0 && !loadingBreakdownDimensions[channel]) {
          loadBreakdownDimensionsForChannel(channel);
        }
      });
    }
  }, [modalStep, isEditSourceOpen, selectedChannels]);

  // Load breakdown dimensions on page load for display in the table dropdowns
  useEffect(() => {
    if (slideReportId && selectedChannels.length > 0) {
      selectedChannels.forEach(channel => {
        if (breakdownDimensions[channel].length === 0 && !loadingBreakdownDimensions[channel]) {
          loadBreakdownDimensionsForChannel(channel);
        }
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideReportId, selectedChannels]);

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

  // KPI names used in the slide view - these should be auto-selected
  const SLIDE_KPI_NAMES = [
    'Impressions',
    'Clicks',
    'CTR',
    'Bookings',
    'Conversion Rate',
    'CPC',
    'Cost',
    'Revenue',
    'ROAS',
    'Cost of sale',
  ];

  // Load available dimensions from database for all selected channels
  // Only load VALUE dimensions (number, currency, percentage) - not text or date
  const loadAvailableDimensions = async () => {
    setLoadingAvailableDimensions(true);
    try {
      // Fetch global VALUE dimensions (number, currency, percentage) - these are the metrics
      const { data: dims, error } = await supabase
        .from('dimensions')
        .select('id, name, type')
        .eq('scope', 'global')
        .in('type', ['number', 'currency', 'percentage'])
        .order('name');
      
      if (error) {
        console.error('Error loading dimensions:', error);
        return;
      }

      const dimensionList = dims || [];
      
      // Set same dimensions for all channels (global value dimensions)
      setAvailableDimensions({
        metasearch: dimensionList,
        sem: dimensionList,
        social: dimensionList,
      });

      // Auto-select dimensions that match the KPIs used in the slide
      // Only if no saved configuration exists (check if current selection is default/empty)
      const currentSelected = selectedValueDimensionIds;
      const isDefaultOrEmpty = currentSelected.length === 0 || 
        (currentSelected.length === ALL_BRADY_DIMENSIONS.length && 
         currentSelected.every(id => ALL_BRADY_DIMENSIONS.includes(id)));
      
      if (isDefaultOrEmpty) {
        // Find dimension IDs that match the KPI names
        const kpiDimensionIds = dimensionList
          .filter(dim => SLIDE_KPI_NAMES.some(kpiName => 
            dim.name.toLowerCase() === kpiName.toLowerCase() ||
            dim.name.toLowerCase() === kpiName.toLowerCase().replace(' ', '')
          ))
          .map(dim => dim.id);
        
        if (kpiDimensionIds.length > 0) {
          setSelectedValueDimensionIds(kpiDimensionIds);
        }
      }
    } catch (error) {
      console.error('Error loading available dimensions:', error);
    } finally {
      setLoadingAvailableDimensions(false);
    }
  };

  // Handle dimension selection toggle (applies to all channels)
  const handleValueDimensionToggle = (dimensionId: string) => {
    setSelectedValueDimensionIds(prev => 
      prev.includes(dimensionId)
        ? prev.filter(id => id !== dimensionId)
        : [...prev, dimensionId]
    );
  };

  // Select all available dimensions
  const handleSelectAllDimensions = () => {
    const allDimIds = availableDimensions.metasearch?.map(d => d.id) || [];
    setSelectedValueDimensionIds(allDimIds);
  };

  // Deselect all dimensions
  const handleDeselectAllDimensions = () => {
    setSelectedValueDimensionIds([]);
  };

  // Navigation handlers
  const handleNext = async () => {
    if (modalStep === 1) {
      // Date step -> Channels step
      setModalStep(2);
    } else if (modalStep === 2) {
      if (selectedChannels.length > 0) {
        // Load dimensions when moving to step 3
        await loadAvailableDimensions();
        setModalStep(3);
      }
    } else if (modalStep === 3) {
      setModalStep(4);
    } else if (modalStep === 4) {
      setModalStep(5);
    } else if (modalStep === 5) {
      setModalStep(6);
    } else if (modalStep === 6) {
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
    } else if (modalStep === 5) {
      setModalStep(4);
    } else if (modalStep === 6) {
      setModalStep(5);
    }
  };

  const handleSave = async () => {
    if (!accountId || !user) {
      console.error('Cannot save: missing accountId or user');
      setIsEditSourceOpen(false);
      resetModalState();
      return;
    }

    try {
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

      // Build configuration object with dimension mappings
      const configuration: SlideReportConfiguration = {
        selectedChannels: selectedChannels,
        selectedValueDimensionIds: selectedValueDimensionIds,
        channelConfigs: channelConfigs,
        breakdownConfigs: breakdownConfigs,
        filterConfigs: filterConfigs,
      };

      // Use actual report IDs from our mapping
      const reportIds: Record<string, string> = {};
      for (const channel of selectedChannels) {
        reportIds[channel] = CHANNEL_REPORT_IDS[channel];
      }

      // Calculate date range using sinceMonth and sinceYear
      const monthNumber = new Date(`${sinceMonth} 1, ${sinceYear}`).getMonth();
      const dateRange: SlideReportDateRange = {
        year: sinceYear,
        month: sinceMonth,
        from: new Date(sinceYear, monthNumber, 1).toISOString().split('T')[0],
        to: new Date().toISOString().split('T')[0], // Current date
      };

      // Save or update slide report
      if (slideReportId) {
        // Update existing slide report
        await updateSlideReport.mutateAsync({
          id: slideReportId,
          configuration,
          report_ids: reportIds,
          date_range: dateRange,
        });
      } else {
        // Create new slide report
        const reportName = slideType === 'master-report' 
          ? 'Master Report' 
          : `Brady Hotels - Since ${sinceMonth} ${sinceYear}`;
        const newReport = await createSlideReport.mutateAsync({
          name: reportName,
          account_id: accountId,
          user_id: user.id,
          configuration,
          report_ids: reportIds,
          date_range: dateRange,
        });
        setSlideReportId(newReport.id);
      }

      // Update the display state to match the saved configuration
      setSelectedYear(sinceYear.toString());
      setSelectedMonth(sinceMonth);

      // Immediately load filter dimension values for display in the tab bar
      const updatedFilterDimensionValues: Record<string, Record<string, string[]>> = {};
      for (const channel of selectedChannels) {
        const filterDimIds = filterConfigs[channel]?.filterDimensionIds || [];
        updatedFilterDimensionValues[channel] = {};
        for (const filterDimId of filterDimIds) {
          const values = dimensionValues[channel] || [];
          if (values.length > 0) {
            updatedFilterDimensionValues[channel][filterDimId] = values;
          } else {
            // Try to load values if not already loaded
            const reportId = CHANNEL_REPORT_IDS[channel];
            if (reportId) {
              const { data: dimData } = await supabase
                .from('dimension_data')
                .select('dimension_values')
                .eq('report_id', reportId)
                .limit(1000);
              
              if (dimData && dimData.length > 0) {
                const uniqueValues = new Set<string>();
                for (const row of dimData) {
                  const rowValues = row.dimension_values as Record<string, any>;
                  if (rowValues && rowValues[filterDimId]) {
                    uniqueValues.add(String(rowValues[filterDimId]));
                  }
                }
                updatedFilterDimensionValues[channel][filterDimId] = Array.from(uniqueValues).sort();
              }
            }
          }
        }
      }
      setFilterDimensionValues(updatedFilterDimensionValues);

      toast({
        title: "Configuration saved",
        description: "Your report settings have been saved. Click 'Refresh Data' to fetch updated data.",
      });

      setIsEditSourceOpen(false);
      // Don't reset modal state - keep the current filter configs active for display
    } catch (error) {
      console.error('Error saving slide report configuration:', error);
      toast({
        title: "Error",
        description: "Failed to save configuration. Please try again.",
        variant: "destructive",
      });
      setIsEditSourceOpen(false);
    }
  };

  const resetModalState = () => {
    setModalStep(1);
    setActiveChannelTab(null);
    setSearchQuery("");
    
    // Reload from saved slideReport configuration instead of resetting to defaults
    if (slideReport?.configuration) {
      const config = slideReport.configuration;
      if (config.selectedChannels) {
        setSelectedDimensions({
          metasearch: config.selectedChannels.includes('metasearch'),
          sem: config.selectedChannels.includes('sem'),
          social: config.selectedChannels.includes('social'),
        });
      }
      if (config.selectedValueDimensionIds) {
        setSelectedValueDimensionIds(config.selectedValueDimensionIds);
      }
      if (config.channelConfigs) {
        setChannelConfigs(config.channelConfigs as any);
      }
      if (config.breakdownConfigs) {
        setBreakdownConfigs(config.breakdownConfigs as any);
      }
      if (config.filterConfigs) {
        setFilterConfigs(config.filterConfigs as any);
      }
      // Reload date range
      if (slideReport.date_range) {
        setSinceMonth(slideReport.date_range.month);
        setSinceYear(slideReport.date_range.year);
      }
    } else {
      // No saved config, reset to defaults
      setSelectedValueDimensionIds(ALL_BRADY_DIMENSIONS);
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
    }
  };

  const handleModalClose = (open: boolean) => {
    setIsEditSourceOpen(open);
    if (!open) {
      resetModalState();
    }
  };

  // Handle Refresh Data with step-by-step modal
  const handleRefreshDataWithModal = async () => {
    if (!slideReportId) {
      toast({
        title: "No configuration",
        description: "Please save your configuration in Edit Source first.",
        variant: "destructive",
      });
      return;
    }

    // Open modal and reset state
    setIsRefreshModalOpen(true);
    setRefreshStep(1);
    setRefreshError(null);
    setRefreshStepStatus({
      1: 'loading',
      2: 'pending',
      3: 'pending',
      4: 'pending',
    });

    try {
      // Step 1: Fetching from data sources
      await new Promise(resolve => setTimeout(resolve, 800)); // Simulate fetch
      setRefreshStepStatus(prev => ({ ...prev, 1: 'complete', 2: 'loading' }));
      setRefreshStep(2);

      // Step 2: Set up filters and configurations
      await new Promise(resolve => setTimeout(resolve, 600));
      setRefreshStepStatus(prev => ({ ...prev, 2: 'complete', 3: 'loading' }));
      setRefreshStep(3);

      // Step 3: Create pivot tables - this is the actual data computation
      const { computeSlideReportPivotData } = await import("@/lib/slideReportPivotComputation");
      
      if (!slideReport?.date_range) {
        throw new Error("Date range not set for slide report");
      }

      const pivotData = await computeSlideReportPivotData(
        slideReport.report_ids as unknown as Record<string, string>,
        slideReport.configuration as unknown as SlideReportConfiguration,
        slideReport.date_range as unknown as SlideReportDateRange
      );
      
      setRefreshStepStatus(prev => ({ ...prev, 3: 'complete', 4: 'loading' }));
      setRefreshStep(4);

      // Step 4: Replace data - save to database
      const { error: updateError } = await supabase
        .from("slide_reports")
        .update({
          pivot_data: pivotData as any,
          last_refreshed_at: new Date().toISOString(),
        })
        .eq("id", slideReportId);

      if (updateError) throw updateError;
      
      setRefreshStepStatus(prev => ({ ...prev, 4: 'complete' }));
      
      // Success - update local state with computed data
      // Transform pivot data to the format expected by the UI
      if (pivotData.overview.monthly) {
        const monthlyRevenue = Object.entries(pivotData.overview.monthly).map(([key, metrics]) => {
          const [year, monthNum] = key.split('-');
          const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
          return {
            month: monthNames[parseInt(monthNum) - 1],
            year: parseInt(year),
            revenue: metrics.revenue,
            cost: metrics.cost,
            impressions: metrics.impressions,
            clicks: metrics.clicks,
            bookings: metrics.bookings,
          };
        }).sort((a, b) => {
          if (a.year !== b.year) return a.year - b.year;
          const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
          return monthNames.indexOf(a.month) - monthNames.indexOf(b.month);
        });
        setDynamicMonthlyData(monthlyRevenue);
      }
      
      // Update channel totals
      const channelTotals: Record<string, any> = {};
      for (const [channel, channelData] of Object.entries(pivotData.channels)) {
        channelTotals[channel] = channelData.current;
      }
      setDynamicChannelTotals(channelTotals);
      
      // Update yearly totals
      const yearlyTotals: Record<number, Record<string, any>> = {};
      for (const year of [2024, 2025, 2026]) {
        yearlyTotals[year] = {};
        for (const [channel, channelData] of Object.entries(pivotData.channels)) {
          if (channelData.yearly?.[String(year)]) {
            yearlyTotals[year][channel] = channelData.yearly[String(year)];
          }
        }
      }
      setDynamicYearlyTotals(yearlyTotals);
      
      // Wait a moment then close modal
      await new Promise(resolve => setTimeout(resolve, 800));
      setIsRefreshModalOpen(false);
      
      toast({ 
        title: "Data refreshed", 
        description: `Pivot tables updated with ${Object.keys(pivotData.overview.monthly || {}).length} months of data.` 
      });
      
    } catch (error) {
      console.error("Error refreshing data:", error);
      const currentStep = refreshStep;
      setRefreshStepStatus(prev => ({ ...prev, [currentStep]: 'error' }));
      setRefreshError(error instanceof Error ? error.message : "Failed to refresh data");
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
            <Button variant="outline" size="sm" onClick={() => setIsDataModalOpen(true)}>
              <Database className="h-4 w-4 mr-2" />
              Data
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsEditSourceOpen(true)}>
              <Settings2 className="h-4 w-4 mr-2" />
              Edit Source
            </Button>
            <Button 
              variant="default" 
              size="sm" 
              onClick={handleRefreshDataWithModal}
              disabled={isRefreshModalOpen}
              className="bg-primary hover:bg-primary/90"
            >
              {isRefreshModalOpen ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Refresh Data
            </Button>
          </div>
        </div>
      </div>

      {/* Edit Source Modal - Step by Step */}
      <Dialog open={isEditSourceOpen} onOpenChange={handleModalClose}>
        <DialogContent className="max-w-4xl h-[85vh] max-h-[700px] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
                <DialogTitle>
                  {modalStep === 1 && "Date Range"}
                  {modalStep === 2 && "Select Channels"}
                  {modalStep === 3 && "Value Dimensions"}
                  {modalStep === 4 && "Data Source"}
                  {modalStep === 5 && "Breakdown Dimensions"}
                  {modalStep === 6 && "Filters"}
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
              {modalStep === 1 && "Set the starting date for your report data. All data from this date onwards will be included."}
              {modalStep !== 1 && "Tip: \"Breakdown by\" tables render on the specific report tab, not on Overview/Budget. After saving, select the report tab to view the breakdown."}
            </p>
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0">
            {/* Step 1: Date Range */}
            {modalStep === 1 && (
              <div className="space-y-6 py-4">
                <div className="bg-muted/30 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">
                    Select the starting point for your report. Data will be fetched from this date to the present.
                  </p>
                </div>
                
                <div className="space-y-4">
                  <Label className="text-sm font-medium">Since</Label>
                  <div className="flex items-center gap-4">
                    <Select value={sinceMonth} onValueChange={setSinceMonth}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue placeholder="Select month" />
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
                    
                    <Select value={sinceYear.toString()} onValueChange={(v) => setSinceYear(parseInt(v))}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="Select year" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2023">2023</SelectItem>
                        <SelectItem value="2024">2024</SelectItem>
                        <SelectItem value="2025">2025</SelectItem>
                        <SelectItem value="2026">2026</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="mt-4 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                    <p className="text-sm">
                      <span className="font-medium">Data range: </span>
                      {sinceMonth} {sinceYear} → Present
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Channel Selection */}
            {modalStep === 2 && (
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

            {/* Step 3: Value Dimensions - Applies to all selected channels */}
            {modalStep === 3 && (
              <div className="flex flex-col gap-4 pb-4">
                {loadingAvailableDimensions ? (
                  <div className="flex-1 flex items-center justify-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Loader2 className="h-8 w-8 animate-spin" />
                      <span>Loading dimensions...</span>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="bg-muted/30 rounded-lg p-4">
                      <p className="text-sm text-muted-foreground">
                        Select which <span className="font-medium">value dimensions</span> (metrics) to include in this slide for <span className="font-medium">all selected channels</span>. These are the numeric metrics used for calculations and aggregations.
                      </p>
                    </div>
                    
                    <div className="flex-1 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">
                          Available Value Dimensions (Metrics)
                        </Label>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleSelectAllDimensions}
                          >
                            Select All
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleDeselectAllDimensions}
                          >
                            Deselect All
                          </Button>
                        </div>
                      </div>
                      <div className="border rounded-md overflow-y-auto max-h-[280px]">
                        <div className="p-2 space-y-1">
                          {availableDimensions.metasearch?.length > 0 ? (
                            availableDimensions.metasearch.map(dim => {
                              const isSelected = selectedValueDimensionIds.includes(dim.id);
                              return (
                                <div
                                  key={dim.id}
                                  className={cn(
                                    "flex items-center gap-3 p-2 rounded cursor-pointer transition-colors",
                                    isSelected
                                      ? "bg-primary/10"
                                      : "hover:bg-muted/50"
                                  )}
                                  onClick={() => handleValueDimensionToggle(dim.id)}
                                >
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => handleValueDimensionToggle(dim.id)}
                                  />
                                  <div className="flex-1">
                                    <span className="text-sm">{dim.name}</span>
                                    <span className="ml-2 text-xs text-muted-foreground">({dim.type})</span>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <p className="text-center text-muted-foreground py-4">
                              No value dimensions available
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                  </>
                )}
              </div>
            )}

            {/* Step 4: Dimension & Value Selection (Data Source) */}
            {modalStep === 4 && (
              <div className="flex gap-4 min-h-[350px] max-h-[400px] pb-4">
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
                              Dimension
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

            {/* Step 5: Breakdown Dimensions */}
            {modalStep === 5 && (
              <div className="flex gap-4 min-h-[350px] max-h-[400px] pb-4">
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
                        {loadingBreakdownDimensions[activeChannelTab] ? (
                          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                            <Loader2 className="h-6 w-6 animate-spin mb-2" />
                            <p className="text-sm">Loading dimensions...</p>
                          </div>
                        ) : (
                          <div className="flex-1 border rounded-md overflow-y-auto" style={{ maxHeight: '250px' }}>
                            <div className="p-2 space-y-1">
                              {breakdownDimensions[activeChannelTab]?.length > 0 ? (
                                breakdownDimensions[activeChannelTab].map(dim => {
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
                                  No breakdown dimensions available
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                    </>
                  )}
                </div>
              </div>
            )}

            {/* Step 6: Filters */}
            {modalStep === 6 && (
              <div className="flex gap-4 min-h-[350px] max-h-[400px] pb-4">
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

                    </>
                  )}
                </div>
              </div>
            )}
          </ScrollArea>

          {/* Footer Navigation */}
          <div className="flex-shrink-0 flex items-center justify-between pt-4 border-t">
            <Button
              variant="outline"
              onClick={modalStep === 1 ? () => handleModalClose(false) : handleBack}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              {modalStep === 1 ? "Cancel" : "Back"}
            </Button>
            <Button
              onClick={handleNext}
              disabled={modalStep === 2 && selectedChannels.length === 0}
            >
              {modalStep === 6 ? "Save" : "Next"}
              {modalStep !== 6 && <ChevronRight className="h-4 w-4 ml-1" />}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Data Pivot Table Modal */}
      <SlideDataPivotTable
        open={isDataModalOpen}
        onOpenChange={setIsDataModalOpen}
        selectedValueDimensionIds={selectedValueDimensionIds}
        availableDimensions={availableDimensions}
        selectedChannels={selectedChannels}
        slideReportId={slideReportId}
        pivotData={slideReport?.pivot_data as SlideReportPivotData | null}
        lastRefreshedAt={slideReport?.last_refreshed_at}
      />

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

              {/* Filters - Show date filters on all tabs except Budget, dimension filters only on channel tabs */}
              {selectedTab !== "budget" && (
                <div className="flex items-center gap-2">
                  {/* Channel-specific Filter Dropdowns - Only show on individual report tabs */}
                  {selectedTab !== "overview" && (() => {
                    const currentChannel = selectedTab as 'metasearch' | 'sem' | 'social';
                    const filterDimIds = filterConfigs[currentChannel]?.filterDimensionIds || [];
                    return filterDimIds.map(filterDimId => {
                      const filterDim = dimensions[currentChannel]?.find(d => d.id === filterDimId);
                      const filterValuesList = filterDimensionValues[currentChannel]?.[filterDimId] || [];
                      
                      if (!filterDim || filterValuesList.length === 0) return null;
                      
                      return (
                        <Select
                          key={`${currentChannel}-${filterDimId}`}
                          value={filterValues[currentChannel]?.[filterDimId] || 'all'}
                          onValueChange={(value) => {
                            setFilterValues(prev => ({
                              ...prev,
                              [currentChannel]: {
                                ...prev[currentChannel],
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
                  })()}
                  
                  {/* Date Filters - Show on all tabs including Overview */}
                  <Select value={selectedYear} onValueChange={setSelectedYear}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Years</SelectItem>
                      <SelectItem value="2024">2024</SelectItem>
                      <SelectItem value="2025">2025</SelectItem>
                      <SelectItem value="2026">2026</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger className="w-[120px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Months</SelectItem>
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
                  
                  {/* Comparison dropdown - Show on all tabs except Budget */}
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
              )}
            </div>

            {/* Comparison info banner - Show on all tabs except Budget */}
            {selectedTab !== "budget" && comparisonType !== "none" && (
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
              {/* Loading indicator */}
              {isLoadingData && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />
                  <span className="text-muted-foreground">Loading data from data sources...</span>
                </div>
              )}

              {!isLoadingData && renderKPICards(
                slideType === 'master-report' && Object.keys(currentTotals).length > 0
                  ? (() => {
                      const totals = {
                        impressions: (currentTotals.metasearch?.impressions || 0) + (currentTotals.sem?.impressions || 0) + (currentTotals.social?.impressions || 0),
                        clicks: (currentTotals.metasearch?.clicks || 0) + (currentTotals.sem?.clicks || 0) + (currentTotals.social?.clicks || 0),
                        cost: (currentTotals.metasearch?.cost || 0) + (currentTotals.sem?.cost || 0) + (currentTotals.social?.cost || 0),
                        revenue: (currentTotals.metasearch?.revenue || 0) + (currentTotals.sem?.revenue || 0) + (currentTotals.social?.revenue || 0),
                        bookings: (currentTotals.metasearch?.bookings || 0) + (currentTotals.sem?.bookings || 0) + (currentTotals.social?.bookings || 0),
                      };
                      const derived = calculateDerivedMetrics(totals);
                      return [
                        { label: "IMPRESSIONS", key: "impressions", value: derived.impressions, icon: Eye, color: "text-pink-600" },
                        { label: "CLICKS", key: "clicks", value: derived.clicks, icon: MousePointer, color: "text-purple-600" },
                        { label: "CTR", key: "ctr", value: derived.ctr, icon: Percent, color: "text-purple-600", format: "percent" },
                        { label: "BOOKINGS", key: "bookings", value: derived.bookings, icon: ShoppingCart, color: "text-orange-600" },
                        { label: "CONVERSION RATE", key: "conversionRate", value: derived.conversionRate, icon: Percent, color: "text-purple-600", format: "percent" },
                        { label: "CPC", key: "cpc", value: derived.cpc, icon: DollarSign, color: "text-blue-600", format: "currency" },
                        { label: "COST", key: "cost", value: derived.cost, icon: DollarSign, color: "text-blue-600", format: "currency" },
                        { label: "REVENUE", key: "revenue", value: derived.revenue, icon: DollarSign, color: "text-cyan-600", format: "currency" },
                        { label: "ROAS", key: "roas", value: derived.roas, icon: TrendingUp, color: "text-green-600", format: "roas" },
                        { label: "COST OF SALE", key: "costOfSale", value: derived.costOfSale, icon: Percent, color: "text-purple-600", format: "percent" },
                      ];
                    })()
                  : KPI_CARDS
              )}

              {/* Monthly Results Chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium">
                    Monthly Results ({selectedYear === 'all' ? '2024-2026' : selectedYear}) - Metasearch + Social + SEM Revenue
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={filteredMonthlyData.map(m => ({ 
                        label: selectedYear === 'all' ? `${m.month} ${m.year}` : m.month,
                        month: m.month,
                        year: m.year,
                        total: m.metasearch + m.social + m.sem 
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} interval={selectedYear === 'all' ? 2 : 0} />
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

              {/* Report Breakdown Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base font-medium">
                    <span className="font-semibold">Period:</span> {selectedYear === 'all' ? 'All Years (2024-2026)' : selectedYear}
                    {selectedMonth !== 'all' ? ` - ${selectedMonth}` : ''}
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
                      {(() => {
                        // Use dynamic data for master-report, otherwise hardcoded
                        const channels = ['metasearch', 'sem', 'social'];
                        const rows = channels.map(channel => {
                          const data = currentTotals[channel] || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
                          const derived = calculateDerivedMetrics(data);
                          return {
                            report: channel.charAt(0).toUpperCase() + channel.slice(1),
                            ...derived,
                          };
                        });
                        const totals = rows.reduce((acc, row) => ({
                          impressions: acc.impressions + row.impressions,
                          clicks: acc.clicks + row.clicks,
                          cost: acc.cost + row.cost,
                          revenue: acc.revenue + row.revenue,
                          bookings: acc.bookings + row.bookings,
                        }), { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 });
                        const totalDerived = calculateDerivedMetrics(totals);

                        return (
                          <>
                            {rows.map((row) => (
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
                              <TableCell className="font-bold">Total</TableCell>
                              <TableCell className="text-right">{formatNumber(totalDerived.impressions)}</TableCell>
                              <TableCell className="text-right">{formatNumber(totalDerived.clicks)}</TableCell>
                              <TableCell className="text-right">{totalDerived.ctr.toFixed(2)}%</TableCell>
                              <TableCell className="text-right">{totalDerived.bookings.toFixed(2)}</TableCell>
                              <TableCell className="text-right">{totalDerived.conversionRate.toFixed(2)}%</TableCell>
                              <TableCell className="text-right">${totalDerived.cpc.toFixed(2)}</TableCell>
                              <TableCell className="text-right">${formatNumber(totalDerived.cost)}</TableCell>
                              <TableCell className="text-right">${formatNumber(totalDerived.revenue)}</TableCell>
                              <TableCell className="text-right">{totalDerived.roas.toFixed(1)}x</TableCell>
                              <TableCell className="text-right">{totalDerived.costOfSale.toFixed(2)}%</TableCell>
                            </TableRow>
                          </>
                        );
                      })()}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Metasearch Tab */}
            <TabsContent value="metasearch" className="space-y-6">
              {renderKPICards(getReportKPICards(currentTotals.metasearch || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 }), getChannelComparisonMetrics('metasearch'))}
              
              {/* Monthly Revenue Chart */}
              <Card>
                <CardHeader><CardTitle className="text-base font-medium">Monthly Results ({selectedYear === 'all' ? 'All Years' : selectedYear})</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={filteredMonthlyData.map(m => ({ month: m.month, revenue: m.metasearch || 0 }))}>
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

              {/* Unified Breakdown Table */}
              <Card>
                <CardHeader><CardTitle className="text-base font-medium">Breakdown Analysis</CardTitle></CardHeader>
                <CardContent>
                  <UnifiedBreakdownTable 
                    groupBy={groupByDimension}
                    breakdownBy={breakdownByDimension}
                    expandedRow={expandedRow}
                    onRowClick={setExpandedRow}
                    onGroupByChange={setGroupByDimension}
                    onBreakdownByChange={setBreakdownByDimension}
                    availableDimensions={[
                      ...new Map([
                        ...(breakdownDimensions.metasearch || []).filter(dim => 
                          breakdownConfigs.metasearch?.breakdownDimensionIds?.includes(dim.id)
                        ),
                        ...(breakdownDimensions.sem || []).filter(dim => 
                          breakdownConfigs.sem?.breakdownDimensionIds?.includes(dim.id)
                        ),
                        ...(breakdownDimensions.social || []).filter(dim => 
                          breakdownConfigs.social?.breakdownDimensionIds?.includes(dim.id)
                        ),
                      ].map(dim => [dim.id, dim])).values()
                    ]}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* SEM Tab */}
            <TabsContent value="sem" className="space-y-6">
              {renderKPICards(getReportKPICards(currentTotals.sem || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 }), getChannelComparisonMetrics('sem'))}
              
              {/* Monthly Revenue Chart */}
              <Card>
                <CardHeader><CardTitle className="text-base font-medium">Monthly Results ({selectedYear === 'all' ? 'All Years' : selectedYear})</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={filteredMonthlyData.map(m => ({ month: m.month, revenue: m.sem || 0 }))}>
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

              {/* Unified Breakdown Table */}
              <Card>
                <CardHeader><CardTitle className="text-base font-medium">Breakdown Analysis</CardTitle></CardHeader>
                <CardContent>
                  <UnifiedBreakdownTable 
                    groupBy={groupByDimension}
                    breakdownBy={breakdownByDimension}
                    expandedRow={expandedRow}
                    onRowClick={setExpandedRow}
                    onGroupByChange={setGroupByDimension}
                    onBreakdownByChange={setBreakdownByDimension}
                    availableDimensions={[
                      ...new Map([
                        ...(breakdownDimensions.metasearch || []).filter(dim => 
                          breakdownConfigs.metasearch?.breakdownDimensionIds?.includes(dim.id)
                        ),
                        ...(breakdownDimensions.sem || []).filter(dim => 
                          breakdownConfigs.sem?.breakdownDimensionIds?.includes(dim.id)
                        ),
                        ...(breakdownDimensions.social || []).filter(dim => 
                          breakdownConfigs.social?.breakdownDimensionIds?.includes(dim.id)
                        ),
                      ].map(dim => [dim.id, dim])).values()
                    ]}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* Social Tab */}
            <TabsContent value="social" className="space-y-6">
              {renderKPICards(getReportKPICards(currentTotals.social || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 }), getChannelComparisonMetrics('social'))}
              
              {/* Monthly Revenue Chart */}
              <Card>
                <CardHeader><CardTitle className="text-base font-medium">Monthly Results ({selectedYear === 'all' ? 'All Years' : selectedYear})</CardTitle></CardHeader>
                <CardContent>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={filteredMonthlyData.map(m => ({ month: m.month, revenue: m.social || 0 }))}>
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

              {/* Unified Breakdown Table */}
              <Card>
                <CardHeader><CardTitle className="text-base font-medium">Breakdown Analysis</CardTitle></CardHeader>
                <CardContent>
                  <UnifiedBreakdownTable 
                    groupBy={groupByDimension}
                    breakdownBy={breakdownByDimension}
                    expandedRow={expandedRow}
                    onRowClick={setExpandedRow}
                    onGroupByChange={setGroupByDimension}
                    onBreakdownByChange={setBreakdownByDimension}
                    availableDimensions={[
                      ...new Map([
                        ...(breakdownDimensions.metasearch || []).filter(dim => 
                          breakdownConfigs.metasearch?.breakdownDimensionIds?.includes(dim.id)
                        ),
                        ...(breakdownDimensions.sem || []).filter(dim => 
                          breakdownConfigs.sem?.breakdownDimensionIds?.includes(dim.id)
                        ),
                        ...(breakdownDimensions.social || []).filter(dim => 
                          breakdownConfigs.social?.breakdownDimensionIds?.includes(dim.id)
                        ),
                      ].map(dim => [dim.id, dim])).values()
                    ]}
                  />
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

      {/* Refresh Data Modal */}
      <Dialog open={isRefreshModalOpen} onOpenChange={(open) => !open && !refreshStep && setIsRefreshModalOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <RefreshCw className={cn("h-5 w-5 text-primary", refreshStep > 0 && refreshStep < 5 && "animate-spin")} />
              <DialogTitle>Refreshing Data</DialogTitle>
            </div>
            <DialogDescription>
              Updating your slide report with the latest data...
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Step 1: Fetching from data sources */}
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                refreshStepStatus[1] === 'complete' && "bg-green-100 text-green-700",
                refreshStepStatus[1] === 'loading' && "bg-primary/20 text-primary",
                refreshStepStatus[1] === 'error' && "bg-red-100 text-red-700",
                refreshStepStatus[1] === 'pending' && "bg-muted text-muted-foreground"
              )}>
                {refreshStepStatus[1] === 'complete' ? (
                  <Check className="h-4 w-4" />
                ) : refreshStepStatus[1] === 'loading' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : refreshStepStatus[1] === 'error' ? (
                  <span>!</span>
                ) : (
                  "1"
                )}
              </div>
              <div className="flex-1">
                <p className={cn(
                  "font-medium",
                  refreshStepStatus[1] === 'complete' && "text-green-700",
                  refreshStepStatus[1] === 'loading' && "text-foreground",
                  refreshStepStatus[1] === 'error' && "text-red-700",
                  refreshStepStatus[1] === 'pending' && "text-muted-foreground"
                )}>
                  Fetching from data sources
                </p>
                <p className="text-sm text-muted-foreground">Connecting to Google Sheets and CSV sources</p>
              </div>
            </div>

            {/* Step 2: Set up filters and configurations */}
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                refreshStepStatus[2] === 'complete' && "bg-green-100 text-green-700",
                refreshStepStatus[2] === 'loading' && "bg-primary/20 text-primary",
                refreshStepStatus[2] === 'error' && "bg-red-100 text-red-700",
                refreshStepStatus[2] === 'pending' && "bg-muted text-muted-foreground"
              )}>
                {refreshStepStatus[2] === 'complete' ? (
                  <Check className="h-4 w-4" />
                ) : refreshStepStatus[2] === 'loading' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : refreshStepStatus[2] === 'error' ? (
                  <span>!</span>
                ) : (
                  "2"
                )}
              </div>
              <div className="flex-1">
                <p className={cn(
                  "font-medium",
                  refreshStepStatus[2] === 'complete' && "text-green-700",
                  refreshStepStatus[2] === 'loading' && "text-foreground",
                  refreshStepStatus[2] === 'error' && "text-red-700",
                  refreshStepStatus[2] === 'pending' && "text-muted-foreground"
                )}>
                  Applying filters & configuration
                </p>
                <p className="text-sm text-muted-foreground">Using your saved dimension and filter settings</p>
              </div>
            </div>

            {/* Step 3: Create pivot tables */}
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                refreshStepStatus[3] === 'complete' && "bg-green-100 text-green-700",
                refreshStepStatus[3] === 'loading' && "bg-primary/20 text-primary",
                refreshStepStatus[3] === 'error' && "bg-red-100 text-red-700",
                refreshStepStatus[3] === 'pending' && "bg-muted text-muted-foreground"
              )}>
                {refreshStepStatus[3] === 'complete' ? (
                  <Check className="h-4 w-4" />
                ) : refreshStepStatus[3] === 'loading' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : refreshStepStatus[3] === 'error' ? (
                  <span>!</span>
                ) : (
                  "3"
                )}
              </div>
              <div className="flex-1">
                <p className={cn(
                  "font-medium",
                  refreshStepStatus[3] === 'complete' && "text-green-700",
                  refreshStepStatus[3] === 'loading' && "text-foreground",
                  refreshStepStatus[3] === 'error' && "text-red-700",
                  refreshStepStatus[3] === 'pending' && "text-muted-foreground"
                )}>
                  Creating pivot tables
                </p>
                <p className="text-sm text-muted-foreground">Aggregating metrics by dimensions</p>
              </div>
            </div>

            {/* Step 4: Replace data */}
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                refreshStepStatus[4] === 'complete' && "bg-green-100 text-green-700",
                refreshStepStatus[4] === 'loading' && "bg-primary/20 text-primary",
                refreshStepStatus[4] === 'error' && "bg-red-100 text-red-700",
                refreshStepStatus[4] === 'pending' && "bg-muted text-muted-foreground"
              )}>
                {refreshStepStatus[4] === 'complete' ? (
                  <Check className="h-4 w-4" />
                ) : refreshStepStatus[4] === 'loading' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : refreshStepStatus[4] === 'error' ? (
                  <span>!</span>
                ) : (
                  "4"
                )}
              </div>
              <div className="flex-1">
                <p className={cn(
                  "font-medium",
                  refreshStepStatus[4] === 'complete' && "text-green-700",
                  refreshStepStatus[4] === 'loading' && "text-foreground",
                  refreshStepStatus[4] === 'error' && "text-red-700",
                  refreshStepStatus[4] === 'pending' && "text-muted-foreground"
                )}>
                  Replacing data
                </p>
                <p className="text-sm text-muted-foreground">Saving updated data without duplicates</p>
              </div>
            </div>

            {/* Error message */}
            {refreshError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{refreshError}</p>
              </div>
            )}

            {/* All complete message */}
            {refreshStepStatus[4] === 'complete' && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <p className="text-sm text-green-700 font-medium">Data refresh complete!</p>
              </div>
            )}
          </div>

          <DialogFooter>
            {refreshError ? (
              <Button onClick={() => setIsRefreshModalOpen(false)}>Close</Button>
            ) : refreshStepStatus[4] === 'complete' ? (
              <Button onClick={() => setIsRefreshModalOpen(false)} className="bg-green-600 hover:bg-green-700">
                Done
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
