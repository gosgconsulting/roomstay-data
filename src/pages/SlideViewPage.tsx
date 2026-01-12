import React, { useState, useEffect, useMemo } from "react";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useSlideReports, useSlideReport, useCreateSlideReport, useUpdateSlideReport, useRefreshSlideReportData } from "@/hooks/useSlideReports";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { SlideReportConfiguration, SlideReportPivotData, SlideReportDateRange } from "@/types/slideReports";
import { useUser } from "@/lib/auth";
import { fetchSourceData } from "@/hooks/dataSources/useSourceData";
import { SlideDataBrowser } from "@/components/slides/SlideDataBrowser";
import { RefreshStepIndicator, ChannelTabsList, DimensionValuesList } from "@/components/slides/EditSourceModal";

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
// Uses data from pivot_data.channels[channel].monthlyBreakdowns for month-specific data
const UnifiedBreakdownTable = ({ 
  groupBy,
  breakdownBy,
  expandedRow,
  onRowClick,
  onGroupByChange,
  onBreakdownByChange,
  availableDimensions,
  pivotData,
  selectedChannel,
  selectedYear,
  selectedMonth,
}: {
  groupBy: string;
  breakdownBy: string;
  expandedRow: string | null;
  onRowClick: (rowValue: string | null) => void;
  onGroupByChange: (value: string) => void;
  onBreakdownByChange: (value: string) => void;
  availableDimensions: { id: string; name: string; type: string }[];
  pivotData?: any;
  selectedChannel?: 'metasearch' | 'sem' | 'social' | 'overview';
  selectedYear?: string;
  selectedMonth?: string;
}) => {
  // Auto-select defaults when dimensions are available
  useEffect(() => {
    if (availableDimensions.length > 0) {
      // If current groupBy is not in available dimensions, select the first
      if (!availableDimensions.find(d => d.id === groupBy)) {
        onGroupByChange(availableDimensions[0].id);
      }
      // If current breakdownBy is not in available dimensions or same as groupBy, select a different one
      if (!availableDimensions.find(d => d.id === breakdownBy) || breakdownBy === groupBy) {
        const differentDim = availableDimensions.find(d => d.id !== groupBy);
        if (differentDim) {
          onBreakdownByChange(differentDim.id);
        }
      }
    }
  }, [availableDimensions, groupBy, breakdownBy, onGroupByChange, onBreakdownByChange]);

  // Build monthKey for filtering by selected year/month
  const monthKey = useMemo(() => {
    if (!selectedYear || selectedYear === 'all' || !selectedMonth || selectedMonth === 'all') {
      return null; // Use aggregated data
    }
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthNum = monthNames.indexOf(selectedMonth) + 1;
    return `${selectedYear}-${monthNum.toString().padStart(2, '0')}`;
  }, [selectedYear, selectedMonth]);

  // Get breakdown data from pivotData based on selected dimension and month
  const groupedData = useMemo(() => {
    if (!pivotData?.channels) return [];
    
    const groupByDim = availableDimensions.find(d => d.id === groupBy);
    const groupByName = groupByDim?.name || groupBy;
    
    // Collect breakdown data from all channels (or specific channel if selected)
    const allBreakdowns: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }> = {};
    
    const channelsToCheck = selectedChannel && selectedChannel !== 'overview' 
      ? [selectedChannel] 
      : Object.keys(pivotData.channels);
    
    for (const channel of channelsToCheck) {
      const channelData = pivotData.channels[channel];
      if (!channelData) continue;
      
      // Use monthlyBreakdowns if a specific month is selected, otherwise use aggregated breakdowns
      let breakdownData: any[] = [];
      
      if (monthKey && channelData.monthlyBreakdowns?.[monthKey]) {
        // Use month-specific breakdown data
        breakdownData = channelData.monthlyBreakdowns[monthKey][groupByName] || [];
        console.log(`[UnifiedBreakdownTable] Using monthlyBreakdowns for ${channel}/${monthKey}/${groupByName}:`, breakdownData.length, 'rows');
      } else if (channelData.breakdowns) {
        // Fall back to aggregated breakdowns
        breakdownData = channelData.breakdowns[groupByName] || [];
        console.log(`[UnifiedBreakdownTable] Using aggregated breakdowns for ${channel}/${groupByName}:`, breakdownData.length, 'rows');
      }
      
      breakdownData.forEach((row: any) => {
        const groupValue = row.name || row[groupByName.toLowerCase().replace(/\s+/g, '_')] || 'Unknown';
        if (!allBreakdowns[groupValue]) {
          allBreakdowns[groupValue] = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
        }
        allBreakdowns[groupValue].impressions += row.impressions || 0;
        allBreakdowns[groupValue].clicks += row.clicks || 0;
        allBreakdowns[groupValue].cost += row.cost || 0;
        allBreakdowns[groupValue].revenue += row.revenue || 0;
        allBreakdowns[groupValue].bookings += row.bookings || 0;
      });
    }

    // Convert to array and calculate derived metrics
    return Object.entries(allBreakdowns)
      .filter(([groupValue]) => groupValue && groupValue !== 'Unknown')
      .sort(([, a], [, b]) => b.revenue - a.revenue)
      .map(([groupValue, data]) => ({
        groupValue,
        metrics: calculateDerivedMetrics(data),
        rawData: data,
      }));
  }, [pivotData, groupBy, availableDimensions, selectedChannel, monthKey]);

  // Get breakdown data for expanded row (also uses month-specific data)
  const getExpandedBreakdownData = useMemo(() => {
    if (!expandedRow || !pivotData?.channels || !breakdownBy) return [];
    
    const breakdownByDim = availableDimensions.find(d => d.id === breakdownBy);
    const breakdownByName = breakdownByDim?.name || breakdownBy;
    
    const channelsToCheck = selectedChannel && selectedChannel !== 'overview' 
      ? [selectedChannel] 
      : Object.keys(pivotData.channels);
    
    // For now, show the breakdown data filtered by the expanded row
    // This would ideally be cross-breakdown data, but we'll show the breakdownBy dimension data
    const allBreakdowns: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }> = {};
    
    for (const channel of channelsToCheck) {
      const channelData = pivotData.channels[channel];
      if (!channelData) continue;
      
      // Use monthlyBreakdowns if a specific month is selected, otherwise use aggregated breakdowns
      let breakdownData: any[] = [];
      
      if (monthKey && channelData.monthlyBreakdowns?.[monthKey]) {
        breakdownData = channelData.monthlyBreakdowns[monthKey][breakdownByName] || [];
      } else if (channelData.breakdowns) {
        breakdownData = channelData.breakdowns[breakdownByName] || [];
      }
      
      breakdownData.forEach((row: any) => {
        const value = row.name || row[breakdownByName.toLowerCase().replace(/\s+/g, '_')] || 'Unknown';
        if (!allBreakdowns[value]) {
          allBreakdowns[value] = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
        }
        allBreakdowns[value].impressions += row.impressions || 0;
        allBreakdowns[value].clicks += row.clicks || 0;
        allBreakdowns[value].cost += row.cost || 0;
        allBreakdowns[value].revenue += row.revenue || 0;
        allBreakdowns[value].bookings += row.bookings || 0;
      });
    }
    
    return Object.entries(allBreakdowns)
      .filter(([value]) => value && value !== 'Unknown')
      .sort(([, a], [, b]) => b.revenue - a.revenue)
      .map(([value, data]) => ({
        value,
        metrics: calculateDerivedMetrics(data),
      }));
  }, [expandedRow, pivotData, breakdownBy, availableDimensions, selectedChannel, monthKey]);

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

  // Filter available dimensions to exclude currently selected for each dropdown
  const groupByOptions = availableDimensions;
  const breakdownByOptions = availableDimensions.filter(d => d.id !== groupBy);

  // Show message if no data
  if (groupedData.length === 0) {
    return (
      <div className="space-y-4">
        {/* Dropdowns */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">Group by:</Label>
            <Select value={groupBy} onValueChange={(value) => { onGroupByChange(value); onRowClick(null); }}>
              <SelectTrigger className="w-40 bg-primary text-primary-foreground">
                <SelectValue placeholder="Select dimension" />
              </SelectTrigger>
              <SelectContent>
                {groupByOptions.map(dim => (
                  <SelectItem key={dim.id} value={dim.id}>{dim.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">Breakdown by:</Label>
            <Select value={breakdownBy} onValueChange={onBreakdownByChange}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Select dimension" />
              </SelectTrigger>
              <SelectContent>
                {breakdownByOptions.map(dim => (
                  <SelectItem key={dim.id} value={dim.id}>{dim.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="text-center py-8 text-muted-foreground">
          <p>No breakdown data available.</p>
          <p className="text-sm mt-2">Configure breakdown dimensions in the Data Source modal and click "Refresh Data" to compute breakdown tables.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Dropdowns */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">Group by:</Label>
          <Select value={groupBy} onValueChange={(value) => { onGroupByChange(value); onRowClick(null); }}>
            <SelectTrigger className="w-40 bg-primary text-primary-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {groupByOptions.map(dim => (
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
              {breakdownByOptions.map(dim => (
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
            <TableHead className="w-8"></TableHead>
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
            <React.Fragment key={group.groupValue}>
              <TableRow 
                className="hover:bg-muted/50 cursor-pointer"
                onClick={() => onRowClick(expandedRow === group.groupValue ? null : group.groupValue)}
              >
                <TableCell className="w-8">
                  <ChevronRight className={cn(
                    "h-4 w-4 transition-transform",
                    expandedRow === group.groupValue && "rotate-90"
                  )} />
                </TableCell>
                <TableCell className="font-medium">{group.groupValue}</TableCell>
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
              {/* Expanded breakdown rows */}
              {expandedRow === group.groupValue && getExpandedBreakdownData.length > 0 && (
                <>
                  {getExpandedBreakdownData.map((item) => (
                    <TableRow key={`${group.groupValue}-${item.value}`} className="bg-muted/30">
                      <TableCell></TableCell>
                      <TableCell className="pl-8 text-muted-foreground">
                        <span className="text-xs uppercase mr-2">{breakdownByDim?.name}:</span>
                        {item.value}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatNumber(item.metrics.impressions)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatNumber(item.metrics.clicks)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{item.metrics.ctr.toFixed(2)}%</TableCell>
                      <TableCell className="text-right text-muted-foreground">{item.metrics.bookings.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{item.metrics.conversionRate.toFixed(2)}%</TableCell>
                      <TableCell className="text-right text-muted-foreground">${item.metrics.cpc.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">${formatNumber(item.metrics.cost)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">${formatNumber(item.metrics.revenue)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{item.metrics.roas.toFixed(1)}x</TableCell>
                      <TableCell className="text-right text-muted-foreground">{item.metrics.costOfSale.toFixed(2)}%</TableCell>
                    </TableRow>
                  ))}
                </>
              )}
            </React.Fragment>
          ))}
          {/* Totals Row */}
          <TableRow className="bg-muted/50 font-semibold border-t-2">
            <TableCell></TableCell>
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

// Channel to Report ID mapping for Brady Hotels (moved outside component to avoid hoisting issues)
const CHANNEL_REPORT_IDS: Record<string, string> = {
  metasearch: '2eff17d0-38de-4d5d-a15b-69ad13788c92',
  sem: '3b2a0e45-33be-4eec-911e-b955b951c84e',
  social: '8c2f7db9-acbd-4c59-9593-74e8953e7787',
};

export default function SlideViewPage() {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const { data: userData } = useUser();
  const user = userData?.user || null;
  // Get current month name for default
  const currentDate = new Date();
  const currentMonthName = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][currentDate.getMonth()];
  const currentYearStr = currentDate.getFullYear().toString();
  
  const [selectedYear, setSelectedYear] = useState(currentYearStr); // Default to current year
  const [selectedMonth, setSelectedMonth] = useState(currentMonthName); // Default to current month
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

  // Slide report state - moved before currentTotals so it's available
  const [slideReportId, setSlideReportId] = useState<string | null>(null);
  const { data: slideReport } = useSlideReport(slideReportId);
  const { data: slideReports, isLoading: isSlideReportsLoading } = useSlideReports(accountId || null);
  const queryClient = useQueryClient();
  const createSlideReport = useCreateSlideReport();
  const updateSlideReport = useUpdateSlideReport();
  const refreshSlideReportData = useRefreshSlideReportData();

  // Get current totals based on selected year/month from pivot_data
  const currentTotals = useMemo(() => {
    const pivotData = slideReport?.pivot_data as SlideReportPivotData | null;
    
    // Data flow verification: Log when Overview/Report tabs read from pivot_data
    if (pivotData && slideType === 'master-report') {
      console.log('[testing] Data Flow: Reading from pivot_data for currentTotals', {
        hasOverview: !!pivotData.overview,
        hasChannels: Object.keys(pivotData.channels || {}).length,
        selectedYear,
        selectedMonth,
        overviewMonthlyMonths: Object.keys(pivotData.overview?.monthly || {}).length,
      });
    }
    
    // If we have pivot_data and a specific month is selected, use monthly data
    if (pivotData?.channels && selectedMonth && selectedMonth !== 'all') {
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      const monthNum = monthNames.indexOf(selectedMonth) + 1;
      const monthKey = selectedYear !== 'all' 
        ? `${selectedYear}-${monthNum.toString().padStart(2, '0')}`
        : null;
      
      if (monthKey) {
        const channelTotals: Record<string, any> = {};
        for (const [channel, channelData] of Object.entries(pivotData.channels)) {
          const monthlyData = (channelData as any).monthly?.[monthKey];
          if (monthlyData) {
            channelTotals[channel] = monthlyData;
          } else {
            channelTotals[channel] = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
          }
        }
        return channelTotals;
      }
    }
    
    // If "All Months" is selected, use yearly totals or current data
    if (pivotData?.channels) {
      // If specific year selected, use yearly totals
      if (selectedYear !== 'all') {
        const yearNum = parseInt(selectedYear);
        const channelTotals: Record<string, any> = {};
        for (const [channel, channelData] of Object.entries(pivotData.channels)) {
          const yearlyData = (channelData as any).yearly?.[String(yearNum)];
          if (yearlyData) {
            channelTotals[channel] = yearlyData;
          } else {
            channelTotals[channel] = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
          }
        }
        return channelTotals;
      }
      // Use current totals for all years
      const channelTotals: Record<string, any> = {};
      for (const [channel, channelData] of Object.entries(pivotData.channels)) {
        channelTotals[channel] = (channelData as any).current || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
      }
      return channelTotals;
    }
    
    // Fallback to dynamic data or hardcoded
    if (slideType === 'master-report' && Object.keys(dynamicChannelTotals).length > 0) {
      return dynamicChannelTotals;
    }
    return {
      metasearch: METASEARCH_DATA,
      sem: SEM_DATA,
      social: SOCIAL_DATA,
    };
  }, [slideType, slideReport?.pivot_data, dynamicChannelTotals, dynamicYearlyTotals, selectedYear, selectedMonth]);

  // Get comparison totals based on comparison type and selected year/month
  const comparisonTotals = useMemo(() => {
    if (comparisonType === 'none') return null;
    
    const pivotData = slideReport?.pivot_data as SlideReportPivotData | null;
    if (!pivotData?.channels) return null;
    
    const channelTotals: Record<string, any> = {};
    for (const [channel, channelData] of Object.entries(pivotData.channels)) {
      if (comparisonType === 'previous_period' && (channelData as any).previous_period) {
        channelTotals[channel] = (channelData as any).previous_period;
      } else if (comparisonType === 'previous_year' && (channelData as any).previous_year) {
        channelTotals[channel] = (channelData as any).previous_year;
      } else {
        channelTotals[channel] = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
      }
    }
    return channelTotals;
  }, [comparisonType, slideReport?.pivot_data]);

  // Load data from stored pivot_data when slideReport changes
  useEffect(() => {
    if (slideReport?.pivot_data && slideType === 'master-report') {
      console.log('[testing] Loading pivot_data into UI state from slideReport');
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
      
      // Wait for slideReports to finish loading before deciding to create
      if (isSlideReportsLoading) {
        console.log('[loadOrCreateSlideReport] Waiting for slideReports to load...');
        return;
      }

      try {
        // Check if a specific reportId is passed via URL parameter
        const urlReportId = searchParams.get('reportId');
        if (urlReportId) {
          // Load the specific report from URL
          const targetReport = slideReports?.find(r => r.id === urlReportId && r.is_active);
          if (targetReport) {
            setSlideReportId(targetReport.id);
            // Load configuration from the target report
            if (targetReport.configuration) {
              const config = targetReport.configuration;
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
                setBreakdownConfigs(config.breakdownConfigs as Record<string, BreakdownConfig>);
              }
              if (config.filterConfigs) {
                setFilterConfigs(config.filterConfigs as any);
              }
            }
            // Load date range - always default to current year/month for the UI filter
            // The stored date_range is used for Edit Source modal, not for the active filter
            const currentYear = new Date().getFullYear();
            const currentMonth = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][new Date().getMonth()];
            setSelectedYear(currentYear.toString());
            setSelectedMonth(currentMonth);
            
            // Load sinceMonth/sinceYear for Edit Source modal from stored settings
            if (targetReport.date_range) {
              setSinceMonth(targetReport.date_range.month || 'January');
              setSinceYear(targetReport.date_range.year);
            } else {
              setSinceMonth('January');
              setSinceYear(currentYear);
            }
            return;
          }
        }

        // For master-report, look for the FIRST (oldest) Master Report to avoid duplicates
        if (slideType === 'master-report') {
          // Find all Master Reports and use the oldest one (first created)
          const masterReports = (slideReports || [])
            .filter(r => r.name === 'Master Report' && r.is_active)
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
          
          const masterReport = masterReports[0]; // Use the oldest one
          
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
                setBreakdownConfigs(config.breakdownConfigs as Record<string, BreakdownConfig>);
              }
              if (config.filterConfigs) {
                setFilterConfigs(config.filterConfigs as any);
              }
            }
            // Load date range - always default to current year/month for the UI filter
            const currentYear = new Date().getFullYear();
            const currentMonth = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][new Date().getMonth()];
            setSelectedYear(currentYear.toString());
            setSelectedMonth(currentMonth);
            
            // Load sinceMonth/sinceYear for Edit Source modal from stored settings
            if (masterReport.date_range) {
              setSinceMonth(masterReport.date_range.month || 'January');
              setSinceYear(masterReport.date_range.year);
            } else {
              setSinceMonth('January');
              setSinceYear(currentYear);
            }
            
            // Log if there are duplicates that should be cleaned up
            if (masterReports.length > 1) {
              console.warn(`[loadOrCreateSlideReport] Found ${masterReports.length} Master Reports for this account. Using oldest one: ${masterReport.id}`);
            }
          } else {
            // No Master Report exists - instead of creating automatically,
            // open the Edit Source wizard so user can configure first
            console.log('[loadOrCreateSlideReport] No Master Report found, opening Edit Source wizard...');
            const currentYear = new Date().getFullYear();
            setSelectedYear(currentYear.toString());
            setSelectedMonth('January');
            setSinceMonth('January');
            setSinceYear(currentYear);
            
            // Set default configuration state
            setSelectedDimensions({
              metasearch: true,
              sem: true,
              social: true,
            });
            
            // Open the Edit Source modal for initial configuration
            // The report will be created when user saves the configuration
            setIsEditSourceOpen(true);
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
              setBreakdownConfigs(config.breakdownConfigs as Record<string, BreakdownConfig>);
            }
            if (config.filterConfigs) {
              setFilterConfigs(config.filterConfigs);
            }
          }
          // Load date range - always default to current year/month for the UI filter
          const currentYear = new Date().getFullYear();
          const currentMonth = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][new Date().getMonth()];
          setSelectedYear(currentYear.toString());
          setSelectedMonth(currentMonth);
          
          // Load sinceMonth/sinceYear for Edit Source modal from stored settings
          if (existingReport.date_range) {
            setSinceMonth(existingReport.date_range.month || 'January');
            setSinceYear(existingReport.date_range.year);
          } else {
            setSinceMonth('January');
            setSinceYear(currentYear);
          }
        }
      } catch (error) {
        console.error('Error loading slide report:', error);
      }
    };

    loadOrCreateSlideReport();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, user?.id, slideReports, slideType, isSlideReportsLoading]);

  // Keep local state in sync with slideReport.configuration
  useEffect(() => {
    if (slideReport?.configuration) {
      const config = slideReport.configuration;
      // Sync filterConfigs
      if (config.filterConfigs) {
        setFilterConfigs(config.filterConfigs as any);
      }
      // Sync breakdownConfigs from saved settings
      if (config.breakdownConfigs) {
        setBreakdownConfigs(config.breakdownConfigs as Record<string, BreakdownConfig>);
      }
      // Sync channelConfigs
      if (config.channelConfigs) {
        setChannelConfigs(config.channelConfigs as any);
      }
      console.log('[testing] Synced local state with slideReport.configuration');
    }
  }, [slideReport?.configuration]);

  // Load filter dimension values and names from pivot_data (pre-computed) instead of loading from database
  useEffect(() => {
    const loadFilterValuesFromPivotData = async () => {
      const pivotData = slideReport?.pivot_data as SlideReportPivotData | null;
      const config = slideReport?.configuration as SlideReportConfiguration | null;
      
      if (!pivotData?.channels || !config?.filterConfigs) {
        console.log('[loadFilterValues] No pivot data or filter config available');
        return;
      }
      
      const updatedFilterDimensionValues: Record<string, Record<string, string[]>> = {
        metasearch: {},
        sem: {},
        social: {},
      };
      const updatedFilterDimensionNames: Record<string, Record<string, string>> = {
        metasearch: {},
        sem: {},
        social: {},
      };
      
      let hasValues = false;
      
      for (const channel of config.selectedChannels || []) {
        const channelData = pivotData.channels[channel];
        const filterConfig = config.filterConfigs?.[channel];
        
        if (!channelData || !filterConfig?.filterDimensionIds?.length) continue;
        
        // Check if we have pre-computed filter values in pivot_data
        const filterUniqueValues = (channelData as any).filterUniqueValues as Record<string, { name: string; values: string[] }> | undefined;
        
        if (filterUniqueValues) {
          // Use pre-computed values from pivot_data (fast path - no DB query needed)
          for (const filterDimId of filterConfig.filterDimensionIds) {
            const filterData = filterUniqueValues[filterDimId];
            if (filterData) {
              updatedFilterDimensionValues[channel][filterDimId] = filterData.values;
              updatedFilterDimensionNames[channel][filterDimId] = filterData.name;
              hasValues = true;
              console.log(`[loadFilterValues] Using ${filterData.values.length} pre-computed values for ${channel}/${filterData.name}`);
            }
          }
        } else {
          // Fallback: Load from database (for old reports without pre-computed values)
          console.log(`[loadFilterValues] No pre-computed filter values for ${channel}, loading from database...`);
          for (const filterDimId of filterConfig.filterDimensionIds) {
            const values = await loadFilterDimensionValues(channel, filterDimId);
            if (values.length > 0) {
              updatedFilterDimensionValues[channel][filterDimId] = values;
              hasValues = true;
            }
          }
          
          // Fetch dimension names for fallback path
          const uniqueIds = [...new Set(filterConfig.filterDimensionIds)];
          if (uniqueIds.length > 0) {
            const { data: dimensionInfo } = await supabase
              .from('dimensions')
              .select('id, name')
              .in('id', uniqueIds);
            
            if (dimensionInfo) {
              for (const dim of dimensionInfo) {
                updatedFilterDimensionNames[channel][dim.id] = dim.name;
              }
            }
          }
        }
      }
      
      if (hasValues) {
        setFilterDimensionValues(prev => ({ ...prev, ...updatedFilterDimensionValues }));
        console.log('[loadFilterValues] Filter dimension values loaded from pivot_data');
      }
      if (Object.values(updatedFilterDimensionNames).some(ch => Object.keys(ch).length > 0)) {
        setFilterDimensionNames(prev => ({ ...prev, ...updatedFilterDimensionNames }));
        console.log('[loadFilterValues] Filter dimension names loaded:', updatedFilterDimensionNames);
      }
    };

    loadFilterValuesFromPivotData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideReport?.pivot_data, slideReport?.configuration?.filterConfigs]);

  // Load filter dimension values when switching to a channel tab that has filters
  useEffect(() => {
    const loadValuesForCurrentTab = async () => {
      if (selectedTab === 'overview' || selectedTab === 'budget') return;
      
      const currentChannel = selectedTab as 'metasearch' | 'sem' | 'social';
      const savedFilterConfigs = slideReport?.configuration?.filterConfigs?.[currentChannel];
      const localFilterConfig = filterConfigs?.[currentChannel];
      const filterDimIds = savedFilterConfigs?.filterDimensionIds || localFilterConfig?.filterDimensionIds || [];
      
      if (filterDimIds.length === 0) return;
      
      // Check if values are already loaded
      const hasAllValues = filterDimIds.every(id => 
        filterDimensionValues[currentChannel]?.[id]?.length > 0
      );
      
      if (hasAllValues) {
        console.log(`[selectedTab] Filter values already loaded for ${currentChannel}`);
        return;
      }
      
      // First, try to get values from pivot_data (pre-computed)
      const pivotData = slideReport?.pivot_data as SlideReportPivotData | null;
      const channelData = pivotData?.channels?.[currentChannel];
      const filterUniqueValues = (channelData as any)?.filterUniqueValues as Record<string, { name: string; values: string[] }> | undefined;
      
      const newValues: Record<string, string[]> = {};
      const newNames: Record<string, string> = {};
      const missingDimIds: string[] = [];
      
      for (const filterDimId of filterDimIds) {
        if (filterDimensionValues[currentChannel]?.[filterDimId]?.length > 0) continue;
        
        // Check pivot_data first
        if (filterUniqueValues?.[filterDimId]) {
          newValues[filterDimId] = filterUniqueValues[filterDimId].values;
          newNames[filterDimId] = filterUniqueValues[filterDimId].name;
          console.log(`[selectedTab] Using ${filterUniqueValues[filterDimId].values.length} pre-computed values for ${filterUniqueValues[filterDimId].name}`);
        } else {
          missingDimIds.push(filterDimId);
        }
      }
      
      // Fallback: Load missing values from database
      if (missingDimIds.length > 0) {
        console.log(`[selectedTab] Loading ${missingDimIds.length} missing filter values from database for ${currentChannel}...`);
        const loadPromises: Promise<void>[] = [];
        
        for (const filterDimId of missingDimIds) {
          loadPromises.push(
            loadFilterDimensionValues(currentChannel, filterDimId).then(values => {
              newValues[filterDimId] = values;
            })
          );
        }
        
        await Promise.all(loadPromises);
      }
      
      if (Object.keys(newValues).length > 0) {
        setFilterDimensionValues(prev => ({
          ...prev,
          [currentChannel]: {
            ...prev[currentChannel],
            ...newValues,
          },
        }));
      }
      if (Object.keys(newNames).length > 0) {
        setFilterDimensionNames(prev => ({
          ...prev,
          [currentChannel]: {
            ...prev[currentChannel],
            ...newNames,
          },
        }));
      }
      console.log(`[selectedTab] Loaded filter values for ${currentChannel}:`, Object.keys(newValues));
    };

    loadValuesForCurrentTab();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTab, slideReport?.pivot_data]);

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

  // CHANNEL_REPORT_IDS is defined outside the component (line 724)
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
  // Filter values state - changed to arrays for multi-select support
  const [filterValues, setFilterValues] = useState<Record<string, Record<string, string[]>>>({
    metasearch: {},
    sem: {},
    social: {},
  });

  // Pending filter values (before Apply is clicked)
  const [pendingFilterValues, setPendingFilterValues] = useState<Record<string, Record<string, string[]>>>({
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
  
  // Filter dimension names lookup (for rendering) - channel -> dimensionId -> name
  const [filterDimensionNames, setFilterDimensionNames] = useState<Record<string, Record<string, string>>>({
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

  // Refresh Data Modal state - 5 steps now
  const [isRefreshModalOpen, setIsRefreshModalOpen] = useState(false);
  const [refreshStep, setRefreshStep] = useState(0); // 0 = not started, 1-5 = steps
  const [refreshStepStatus, setRefreshStepStatus] = useState<Record<number, 'pending' | 'loading' | 'complete' | 'error'>>({
    1: 'pending',
    2: 'pending',
    3: 'pending',
    4: 'pending',
    5: 'pending',
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
      // Reset dimension loading state to ensure clean reload
      setLoadingDimensions({
        metasearch: false,
        sem: false,
        social: false,
      });
    }
  }, [isEditSourceOpen]);

  // Initialize active channel tab when entering step 4, 5, or 6 (Data Source, Breakdown, Filters)
  useEffect(() => {
    if ((modalStep === 4 || modalStep === 5 || modalStep === 6) && selectedChannels.length > 0 && !activeChannelTab) {
      setActiveChannelTab(selectedChannels[0]);
    }
  }, [modalStep, selectedChannels, activeChannelTab]);

  // Load dimension values when activeChannelTab changes on step 4 (Data Source)
  // Now only needed if user changes the dimension dropdown (not on initial load, since we preload)
  useEffect(() => {
    if (modalStep === 4 && activeChannelTab && isEditSourceOpen) {
      const config = channelConfigs[activeChannelTab];
      const dimensionId = config?.dimensionId;
      
      // Only load if we don't already have values (they should be preloaded from step 2)
      const existingValues = dimensionValues[activeChannelTab] || [];
      if (dimensionId && existingValues.length === 0 && !loadingValues[activeChannelTab]) {
        // Set loading to true IMMEDIATELY before async call to prevent race condition
        setLoadingValues(prev => ({ ...prev, [activeChannelTab]: true }));
        console.log(`[activeChannelTab change] Loading values for ${activeChannelTab}/${dimensionId} (not preloaded)`);
        loadValuesForDimension(activeChannelTab, dimensionId);
      }
    }
  }, [activeChannelTab, modalStep, isEditSourceOpen]);

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
  // This is now synchronous since we use hardcoded dimensions
  const loadDimensionsForChannel = async (channel: 'metasearch' | 'sem' | 'social') => {
    setLoadingDimensions(prev => ({ ...prev, [channel]: true }));
    try {
      // Use hardcoded dimensions from actual report data - set immediately
      const channelDims = CHANNEL_TEXT_DIMENSIONS[channel] || [];
      setDimensions(prev => ({ ...prev, [channel]: channelDims }));
      
      // Dimensions are now loaded - set loading to false immediately
      // Value loading is handled separately with loadingValues state
      setLoadingDimensions(prev => ({ ...prev, [channel]: false }));
      
      // Get the dimension ID to use
      let dimensionIdToLoad = channelConfigs[channel]?.dimensionId;
      
      // Auto-select first dimension (Hotel for metasearch, Account for others) if not already set
      if (channelDims.length > 0 && !dimensionIdToLoad) {
        const firstDimId = channelDims[0].id;
        dimensionIdToLoad = firstDimId;
        setChannelConfigs(prev => ({
          ...prev,
          [channel]: {
            ...prev[channel],
            dimensionId: firstDimId,
          },
        }));
      }
      
      // Load values for the dimension (use the determined ID directly, not from state)
      if (dimensionIdToLoad) {
        console.log(`[loadDimensionsForChannel] Loading values for ${channel}/${dimensionIdToLoad}`);
        await loadValuesForDimension(channel, dimensionIdToLoad);
      }
    } catch (err) {
      console.error(`Error loading dimensions for ${channel}:`, err);
      setDimensions(prev => ({ ...prev, [channel]: [] }));
      setLoadingDimensions(prev => ({ ...prev, [channel]: false }));
    }
  };

  // Load values for a dimension from stored pivot_data first, fallback to dimension_data table
  // Also uses cached/saved selected values from channelConfigs for instant display
  const loadValuesForDimension = async (channel: 'metasearch' | 'sem' | 'social', dimensionId: string) => {
    console.log(`[loadValuesForDimension] START - channel: ${channel}, dimensionId: ${dimensionId}`);
    
    // FIRST: Immediately show cached selected values from saved config (instant display)
    const savedConfig = channelConfigs[channel];
    const cachedSelectedValues = savedConfig?.selectedValues || [];
    
    // If we have cached values and the dimension matches, show them immediately
    if (cachedSelectedValues.length > 0 && savedConfig?.dimensionId === dimensionId) {
      console.log(`[loadValuesForDimension] Using ${cachedSelectedValues.length} cached selected values for ${channel}/${dimensionId}`);
      setDimensionValues(prev => ({ ...prev, [channel]: cachedSelectedValues }));
    }
    
    // Note: loading state is already set by the caller for immediate UI feedback
    // But ensure it's true just in case
    setLoadingValues(prev => ({ ...prev, [channel]: true }));
    
    try {
      // SECOND: Check if we have raw data rows stored in pivot_data (most comprehensive - all dimension values)
      const pivotData = slideReport?.pivot_data as SlideReportPivotData | null;
      const channelData = pivotData?.channels?.[channel];
      
      // Try rawDataRows first - this contains ALL rows with ALL dimension values
      if (channelData?.rawDataRows && channelData.rawDataRows.length > 0) {
        console.log(`[loadValuesForDimension] Using rawDataRows (${channelData.rawDataRows.length} rows) for ${channel}/${dimensionId}`);
        
        const valueSet = new Set<string>();
        cachedSelectedValues.forEach(v => valueSet.add(v));
        
        channelData.rawDataRows.forEach((row: any) => {
          const val = row[dimensionId];
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            valueSet.add(String(val).trim());
          }
        });
        
        const sortedValues = Array.from(valueSet).sort();
        console.log(`[loadValuesForDimension] Extracted ${sortedValues.length} unique values from rawDataRows for ${channel}/${dimensionId}`);
        
        setDimensionValues(prev => ({ ...prev, [channel]: sortedValues }));
        setLoadingValues(prev => ({ ...prev, [channel]: false }));
        return;
      }
      
      // THIRD: Check pre-computed filterUniqueValues in pivot_data
      const storedFilterValues = channelData?.filterUniqueValues?.[dimensionId];
      
      if (storedFilterValues?.values && storedFilterValues.values.length > 0) {
        console.log(`[loadValuesForDimension] Using ${storedFilterValues.values.length} pre-computed values from filterUniqueValues for ${channel}/${dimensionId}`);
        
        // Merge with cached selected values to ensure they're included
        const allValues = new Set([...storedFilterValues.values, ...cachedSelectedValues]);
        const sortedValues = Array.from(allValues).sort();
        
        setDimensionValues(prev => ({ ...prev, [channel]: sortedValues }));
        setLoadingValues(prev => ({ ...prev, [channel]: false }));
        return;
      }
      
      // FOURTH: Check breakdown dimension values
      const breakdowns = channelData?.breakdowns;
      if (breakdowns) {
        // Find the dimension name to look up in breakdowns
        const dimInfo = dimensions[channel]?.find(d => d.id === dimensionId);
        if (dimInfo && breakdowns[dimInfo.name]) {
          const breakdownRows = breakdowns[dimInfo.name] as Array<Record<string, any>>;
          if (breakdownRows && breakdownRows.length > 0) {
            // Extract dimension values from breakdown rows - the dimension value is stored as the first non-metric key
            const breakdownValues = breakdownRows
              .map(row => {
                // Look for the dimension value - it's the key that matches the dimension name (case-insensitive)
                const dimKey = Object.keys(row).find(k => 
                  k.toLowerCase() === dimInfo.name.toLowerCase() || 
                  k === 'name' ||
                  !['impressions', 'clicks', 'cost', 'revenue', 'bookings', 'ctr', 'conversionRate', 'cpc', 'roas', 'costOfSale'].includes(k)
                );
                return dimKey ? String(row[dimKey]) : null;
              })
              .filter((v): v is string => v !== null && v !== '');
            
            console.log(`[loadValuesForDimension] Using ${breakdownValues.length} values from breakdowns for ${channel}/${dimensionId}`);
            
            // Merge with cached selected values
            const allValues = new Set([...breakdownValues, ...cachedSelectedValues]);
            const sortedValues = Array.from(allValues).sort();
            
            setDimensionValues(prev => ({ ...prev, [channel]: sortedValues }));
            setLoadingValues(prev => ({ ...prev, [channel]: false }));
            return;
          }
        }
      }
      
      console.log(`[loadValuesForDimension] No stored values found, falling back to dimension_data query for ${channel}/${dimensionId}`);
      
      // FALLBACK: Fetch from dimension_data table
      const reportId = CHANNEL_REPORT_IDS[channel];
      console.log(`[loadValuesForDimension] Report ID for ${channel}: ${reportId}`);
      
      if (!reportId) {
        console.error(`[loadValuesForDimension] No report ID for channel: ${channel}`);
        if (cachedSelectedValues.length === 0) {
          setDimensionValues(prev => ({ ...prev, [channel]: [] }));
        }
        return;
      }

      // Fetch unique values from dimension_data table using pagination to get ALL rows
      const allDimData: any[] = [];
      const batchSize = 1000;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        console.log(`[loadValuesForDimension] Fetching batch at offset ${offset} for ${channel}`);
        const { data: batchData, error: dimError } = await supabase
          .from('dimension_data')
          .select('dimension_values')
          .eq('report_id', reportId)
          .range(offset, offset + batchSize - 1);

        if (dimError) {
          console.error(`[loadValuesForDimension] Error fetching batch for ${channel}:`, dimError);
          if (cachedSelectedValues.length === 0) {
            setDimensionValues(prev => ({ ...prev, [channel]: [] }));
          }
          return;
        }

        if (batchData && batchData.length > 0) {
          allDimData.push(...batchData);
          offset += batchSize;
          hasMore = batchData.length === batchSize;
          console.log(`[loadValuesForDimension] Got ${batchData.length} rows, total: ${allDimData.length}`);
        } else {
          hasMore = false;
        }
      }

      const dimData = allDimData;
      console.log(`[loadValuesForDimension] Total rows fetched for ${channel}: ${dimData.length}`);

      if (!dimData || dimData.length === 0) {
        console.error(`[loadValuesForDimension] No dimension_data found for ${channel} (report: ${reportId})`);
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
      console.log(`[loadValuesForDimension] Extracted ${values.length} unique values for dimension ${dimensionId}`);
      
      // For Metasearch Hotel dimension, filter to only Brady hotels (only for brady slide, not master-report)
      if (slideType === 'brady' && channel === 'metasearch' && dimensionId === '093ac487-dd90-4466-9972-ac51d110e91e') {
        values = values.filter(v => v.startsWith('Brady'));
      }

      console.log(`[loadValuesForDimension] SUCCESS - ${values.length} values for ${channel}/${dimensionId}:`, values.slice(0, 5));
      setDimensionValues(prev => ({ ...prev, [channel]: values }));
      
      // Auto-select all Brady values for metasearch Hotel (only for brady slide, not master-report)
      if (slideType === 'brady' && channel === 'metasearch' && dimensionId === '093ac487-dd90-4466-9972-ac51d110e91e') {
        setChannelConfigs(prev => ({
          ...prev,
          [channel]: {
            ...prev[channel],
            selectedValues: values,
          },
        }));
      }
    } catch (err) {
      console.error(`[loadValuesForDimension] CATCH Error for ${channel}/${dimensionId}:`, err);
      if (cachedSelectedValues.length === 0) {
        setDimensionValues(prev => ({ ...prev, [channel]: [] }));
      }
    } finally {
      console.log(`[loadValuesForDimension] FINALLY - setting loading false for ${channel}`);
      setLoadingValues(prev => ({ ...prev, [channel]: false }));
    }
  };

  // Load dimensions when entering step 3, 4, 5, or 6 (after Date and Channels steps)
  // Most loading is now done via preloadAllChannelData on step 2->3 transition
  // This effect is only needed as a fallback for edge cases
  useEffect(() => {
    if ((modalStep === 3 || modalStep === 4 || modalStep === 5 || modalStep === 6) && isEditSourceOpen) {
      selectedChannels.forEach(channel => {
        // Only load dimensions if not already loaded (preload should have already done this)
        if (dimensions[channel].length === 0 && !loadingDimensions[channel]) {
          loadDimensionsForChannel(channel);
        }
        
        // Only load values on step 4 if not already loaded and dimension is configured
        if (modalStep === 4 && channelConfigs[channel]?.dimensionId) {
          const existingValues = dimensionValues[channel] || [];
          if (existingValues.length === 0 && !loadingValues[channel]) {
            const dimensionId = channelConfigs[channel].dimensionId;
            console.log(`[Step 4 fallback] Loading values for ${channel}/${dimensionId}`);
            setLoadingValues(prev => ({ ...prev, [channel]: true }));
            loadValuesForDimension(channel, dimensionId);
          }
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
    const currentConfig = filterConfigs?.[channel];
    const isSelected = currentConfig?.filterDimensionIds?.includes(dimensionId) || false;
    
    setFilterConfigs(prev => {
      const current = prev?.[channel] || { filterDimensionIds: [] };
      const currentIds = current.filterDimensionIds || [];
      const newFilterDimensionIds = isSelected
        ? currentIds.filter(id => id !== dimensionId)
        : [...currentIds, dimensionId];
      
      return {
        ...prev,
        [channel]: {
          filterDimensionIds: newFilterDimensionIds,
        },
      };
    });
    
    if (!isSelected) {
      // Dimension was just added, load its values using the helper function
      const values = await loadFilterDimensionValues(channel, dimensionId);
      // Store values for this specific dimension only
      setFilterDimensionValues(prev => ({
        ...prev,
        [channel]: {
          ...prev[channel],
          [dimensionId]: values, // Only values for this dimensionId
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

  // Helper function to load filter dimension values for a specific dimension
  const loadFilterDimensionValues = async (channel: 'metasearch' | 'sem' | 'social', filterDimId: string): Promise<string[]> => {
    const reportId = CHANNEL_REPORT_IDS[channel];
    if (!reportId) {
      console.warn(`[loadFilterDimensionValues] No report ID for channel: ${channel}`);
      return [];
    }

    try {
      // Fetch all rows using pagination to ensure no values are missing
      const allDimData: any[] = [];
      const batchSize = 1000;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const { data: batchData, error } = await supabase
          .from('dimension_data')
          .select('dimension_values')
          .eq('report_id', reportId)
          .range(offset, offset + batchSize - 1);
        
        if (error) {
          console.error(`[loadFilterDimensionValues] Error loading dimension_data batch for ${channel}/${filterDimId}:`, error);
          return [];
        }

        if (batchData && batchData.length > 0) {
          allDimData.push(...batchData);
          offset += batchSize;
          hasMore = batchData.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      const dimData = allDimData;

      if (!dimData || dimData.length === 0) {
        console.log(`[loadFilterDimensionValues] No dimension_data found for ${channel} (report: ${reportId})`);
        return [];
      }

      // Extract unique values only for this specific filter dimension ID
      const uniqueValues = new Set<string>();
      for (const row of dimData) {
        const rowValues = row.dimension_values as Record<string, any>;
        // Only extract values for this specific filter dimension ID
        if (rowValues && rowValues[filterDimId] !== undefined && rowValues[filterDimId] !== null) {
          const value = String(rowValues[filterDimId]).trim();
          if (value !== '') {
            uniqueValues.add(value);
          }
        }
      }

      const sortedValues = Array.from(uniqueValues).sort();
      console.log(`[loadFilterDimensionValues] Loaded ${sortedValues.length} filter values for ${channel}/${filterDimId}:`, sortedValues.slice(0, 5));
      return sortedValues;
    } catch (error) {
      console.error(`[loadFilterDimensionValues] Error loading filter values for ${channel}/${filterDimId}:`, error);
      return [];
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

  // (Removed) Preloading all channel values on Step 2 -> Step 3.
  // We now load values lazily when the user selects a dimension in Step 4 (Data Source).

  // Navigation handlers
  const handleNext = async () => {
    if (modalStep === 1) {
      // Date step -> Channels step
      setModalStep(2);
      return;
    }

    if (modalStep === 2) {
      if (selectedChannels.length > 0) {
        // Keep Step 2 fast: only load the dimension *list* needed for Step 3.
        // Values are loaded later (Step 4) when a dimension is selected.
        await loadAvailableDimensions();
        setModalStep(3);
      }
      return;
    }

    if (modalStep === 3) {
      setModalStep(4);
      return;
    }

    if (modalStep === 4) {
      setModalStep(5);
      return;
    }

    if (modalStep === 5) {
      setModalStep(6);
      return;
    }

    if (modalStep === 6) {
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

    // Close modal immediately for better UX - save happens in background
    setIsEditSourceOpen(false);

    try {
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

      console.log('[testing] Edit Source: Configuration saved successfully', {
        slideReportId: slideReportId || 'new',
        configuration: {
          selectedChannels: configuration.selectedChannels,
          hasChannelConfigs: Object.keys(configuration.channelConfigs || {}).length > 0,
          hasBreakdownConfigs: Object.keys(configuration.breakdownConfigs || {}).length > 0,
          hasFilterConfigs: Object.keys(configuration.filterConfigs || {}).length > 0,
          selectedValueDimensionIds: configuration.selectedValueDimensionIds?.length || 0,
        },
        dateRange,
        reportIds,
      });

      toast({
        title: "Configuration saved",
        description: "Your report settings have been saved. Click 'Refresh Data' to fetch updated data.",
      });

      // Load filter dimension values in background after save (don't block)
      loadFilterDimensionValuesAfterSave(selectedChannels, filterConfigs);

    } catch (error) {
      console.error('Error saving slide report configuration:', error);
      toast({
        title: "Error",
        description: "Failed to save configuration. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Background loader for filter dimension values after save
  const loadFilterDimensionValuesAfterSave = async (
    channels: ('metasearch' | 'sem' | 'social')[],
    configs: Record<string, FilterConfig>
  ) => {
    const updatedFilterDimensionValues: Record<string, Record<string, string[]>> = {};
    
    // Load all values in parallel for faster loading
    const loadPromises: Promise<void>[] = [];
    
    for (const channel of channels) {
      const filterDimIds = configs[channel]?.filterDimensionIds || [];
      if (filterDimIds.length === 0) continue;
      
      updatedFilterDimensionValues[channel] = {};
      
      for (const filterDimId of filterDimIds) {
        loadPromises.push(
          loadFilterDimensionValues(channel, filterDimId).then(values => {
            updatedFilterDimensionValues[channel][filterDimId] = values;
          })
        );
      }
    }
    
    await Promise.all(loadPromises);
    
    if (Object.keys(updatedFilterDimensionValues).length > 0) {
      setFilterDimensionValues(prev => ({ ...prev, ...updatedFilterDimensionValues }));
      console.log('[handleSave] Filter dimension values loaded in background');
    }
  };

  // Load saved configuration into modal state, including dimension values
  const loadSavedConfigurationIntoModal = async () => {
    if (!slideReport?.configuration) {
      console.log('[testing] No saved configuration found, using defaults');
      return;
    }

    const config = slideReport.configuration;
    console.log('[testing] Loading saved configuration into modal:', {
      selectedChannels: config.selectedChannels,
      hasChannelConfigs: Object.keys(config.channelConfigs || {}).length > 0,
      hasBreakdownConfigs: Object.keys(config.breakdownConfigs || {}).length > 0,
      hasFilterConfigs: Object.keys(config.filterConfigs || {}).length > 0,
    });

    // Load basic configuration
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
      setBreakdownConfigs(config.breakdownConfigs as Record<string, BreakdownConfig>);
    }
    if (config.filterConfigs) {
      setFilterConfigs(config.filterConfigs as any);
    }
    
    // Reload date range
    if (slideReport.date_range) {
      setSinceMonth(slideReport.date_range.month);
      setSinceYear(slideReport.date_range.year);
    }

    // Load dimension values for each channel's selected dimension
    for (const channel of config.selectedChannels || []) {
      const channelConfig = config.channelConfigs?.[channel];
      if (channelConfig?.dimensionId) {
        console.log(`[testing] Loading dimension values for ${channel}/${channelConfig.dimensionId}`);
        await loadValuesForDimension(channel, channelConfig.dimensionId);
      }
    }

    // Load filter dimension values for each channel using the helper function
    const updatedFilterDimensionValues: Record<string, Record<string, string[]>> = {};
    for (const channel of config.selectedChannels || []) {
      const filterConfig = config.filterConfigs?.[channel];
      if (filterConfig?.filterDimensionIds && filterConfig.filterDimensionIds.length > 0) {
        updatedFilterDimensionValues[channel] = {};
        for (const filterDimId of filterConfig.filterDimensionIds) {
          // Load values for this filter dimension using the helper function
          const values = await loadFilterDimensionValues(channel, filterDimId);
          updatedFilterDimensionValues[channel][filterDimId] = values;
        }
      }
    }
    setFilterDimensionValues(prev => ({ ...prev, ...updatedFilterDimensionValues }));

    // Load breakdown dimensions for each channel
    for (const channel of config.selectedChannels || []) {
      await loadBreakdownDimensionsForChannel(channel);
    }

    console.log('[testing] Saved configuration loaded into modal successfully');
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
        setBreakdownConfigs(config.breakdownConfigs as Record<string, BreakdownConfig>);
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

  const handleModalClose = async (open: boolean) => {
    setIsEditSourceOpen(open);
    if (open) {
      // Modal is opening - load saved configuration
      console.log('[testing] Modal opening, loading saved configuration...');
      await loadSavedConfigurationIntoModal();
    } else {
      // Modal is closing - reset state
      resetModalState();
    }
  };

  // Handle Refresh Data with step-by-step modal
  const handleRefreshDataWithModal = async () => {
    // Step 1: Verify Edit Source settings are saved before proceeding
    if (!slideReportId) {
      toast({
        title: "No configuration",
        description: "Please save your configuration in Edit Source first.",
        variant: "destructive",
      });
      return;
    }

    // Verify configuration exists and is valid
    if (!slideReport?.configuration) {
      toast({
        title: "Configuration missing",
        description: "Please save your configuration in Edit Source first.",
        variant: "destructive",
      });
      return;
    }

    if (!slideReport?.date_range) {
      toast({
        title: "Date range missing",
        description: "Please set a date range in Edit Source first.",
        variant: "destructive",
      });
      return;
    }

    console.log('[testing] Refresh Data: Starting with configuration:', {
      channels: slideReport.configuration.selectedChannels,
      hasChannelConfigs: Object.keys(slideReport.configuration.channelConfigs || {}).length > 0,
      hasBreakdownConfigs: Object.keys(slideReport.configuration.breakdownConfigs || {}).length > 0,
      hasFilterConfigs: Object.keys(slideReport.configuration.filterConfigs || {}).length > 0,
      dateRange: slideReport.date_range,
    });

    // Open modal and reset state - now with 5 clear steps
    setIsRefreshModalOpen(true);
    setRefreshStep(1);
    setRefreshError(null);
    setRefreshStepStatus({
      1: 'loading',
      2: 'pending',
      3: 'pending',
      4: 'pending',
      5: 'pending',
    });

    try {
      // Step 1: Verify settings
      console.log('[refresh] Step 1: Verifying settings...');
      setRefreshStepStatus(prev => ({ ...prev, 1: 'loading' }));
      
      const { data: latestReport, error: fetchError } = await supabase
        .from("slide_reports")
        .select("*")
        .eq("id", slideReportId)
        .single();

      if (fetchError) throw fetchError;
      if (!latestReport?.configuration || !latestReport?.date_range) {
        throw new Error("Configuration or date range not found. Please save Edit Source settings first.");
      }

      console.log('[refresh] Step 1: Settings verified');
      setRefreshStepStatus(prev => ({ ...prev, 1: 'complete', 2: 'loading' }));
      setRefreshStep(2);

      // Step 2: Compute pivot data
      console.log('[refresh] Step 2: Computing pivot data...');
      
      const config = latestReport.configuration as unknown as SlideReportConfiguration;
      const reportIdsMap = latestReport.report_ids as unknown as Record<string, string>;
      const dateRange = latestReport.date_range as unknown as SlideReportDateRange;
      
      console.log('[refresh] Step 2: Config:', {
        channels: config.selectedChannels,
        reportIds: reportIdsMap,
        dateRange,
        hasBreakdownConfigs: Object.keys(config.breakdownConfigs || {}).length > 0,
        hasFilterConfigs: Object.keys(config.filterConfigs || {}).length > 0,
      });
      
      let pivotData: any;
      try {
        const { computeSlideReportPivotData } = await import("@/lib/slideReportPivotComputation");

        pivotData = await computeSlideReportPivotData(reportIdsMap, config, dateRange);
      } catch (pivotError: any) {
        // Supabase/Postgrest errors often come through as plain objects (not Error instances)
        // and would display as "[object Object]" without normalization.
        const details =
          pivotError?.message ||
          pivotError?.error_description ||
          pivotError?.details ||
          (typeof pivotError === "string" ? pivotError : "");

        const safeJson = (() => {
          try {
            return JSON.stringify(pivotError);
          } catch {
            return "";
          }
        })();

        console.error("[refresh] Step 2: Pivot computation error:", pivotError);

        const friendly = (details || safeJson || "Unknown error").toString();
        throw new Error(`Pivot data computation failed: ${friendly}`);
      }
      
      const typedPivotData = pivotData as SlideReportPivotData;
      
      if (!typedPivotData || !typedPivotData.channels) {
        throw new Error('Pivot data computation returned invalid data');
      }
      
      console.log('[refresh] Step 2: Pivot data computed successfully', {
        channelsComputed: Object.keys(pivotData.channels),
        overviewMonthsCount: Object.keys(pivotData.overview?.monthly || {}).length,
      });
      setRefreshStepStatus(prev => ({ ...prev, 2: 'complete', 3: 'loading' }));
      setRefreshStep(3);

      // Step 3: Store monthly data in Supabase (organized by year/month)
      console.log('[refresh] Step 3: Storing monthly data to database...');
      
      // First, delete existing monthly data for this slide report
      const { error: deleteError } = await supabase
        .from("slide_report_monthly_data")
        .delete()
        .eq("slide_report_id", slideReportId);

      if (deleteError) {
        console.warn('[refresh] Error deleting old monthly data:', deleteError);
      }

      // Prepare monthly data records
      const monthlyRecords: Array<{
        slide_report_id: string;
        account_id: string | null;
        year: number;
        month: number;
        channel: string;
        metrics: any;
        breakdowns: any;
        row_count: number;
        computed_at: string;
      }> = [];

      // Store overview monthly data
      if (typedPivotData.overview?.monthly) {
        Object.entries(typedPivotData.overview.monthly).forEach(([monthKey, metrics]) => {
          const [year, month] = monthKey.split('-').map(Number);
          monthlyRecords.push({
            slide_report_id: slideReportId,
            account_id: accountId || null,
            year,
            month,
            channel: 'overview',
            metrics,
            breakdowns: {},
            row_count: 1,
            computed_at: new Date().toISOString(),
          });
        });
      }

      // Store channel-specific monthly data with breakdowns
      if (typedPivotData.channels) {
        Object.entries(typedPivotData.channels).forEach(([channel, channelData]) => {
          // Store monthly metrics for each channel
          if (channelData.monthly) {
            Object.entries(channelData.monthly).forEach(([monthKey, metrics]) => {
              const [year, month] = monthKey.split('-').map(Number);
              
              // Get monthly breakdowns for this month if available
              const monthlyBreakdowns = channelData.monthlyBreakdowns?.[monthKey] || {};
              
              monthlyRecords.push({
                slide_report_id: slideReportId,
                account_id: accountId || null,
                year,
                month,
                channel,
                metrics,
                breakdowns: monthlyBreakdowns,
                row_count: Object.keys(monthlyBreakdowns).reduce((count, key) => 
                  count + ((monthlyBreakdowns as any)[key]?.length || 0), 0),
                computed_at: new Date().toISOString(),
              });
            });
          }
        });
      }

      // Insert all monthly records in batches
      if (monthlyRecords.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < monthlyRecords.length; i += batchSize) {
          const batch = monthlyRecords.slice(i, i + batchSize);
          const { error: insertError } = await supabase
            .from("slide_report_monthly_data")
            .insert(batch);

          if (insertError) {
            console.error('[refresh] Error inserting monthly data batch:', insertError);
            // Continue with other batches even if one fails
          }
        }
        console.log(`[refresh] Stored ${monthlyRecords.length} monthly data records`);
      }

      console.log('[refresh] Step 3: Monthly data stored');
      setRefreshStepStatus(prev => ({ ...prev, 3: 'complete', 4: 'loading' }));
      setRefreshStep(4);

      // Step 4: Store breakdown and filter configurations
      console.log('[refresh] Step 4: Storing breakdown and filter configurations...');
      
      const breakdownConfigs = config.breakdownConfigs || {};
      const filterConfigs = config.filterConfigs || {};
      
      // Log breakdown and filter configurations being stored
      const breakdownCount = Object.values(breakdownConfigs).reduce(
        (sum, cfg) => sum + ((cfg as any)?.breakdownDimensionIds?.length || 0), 0
      );
      const filterCount = Object.values(filterConfigs).reduce(
        (sum, cfg) => sum + ((cfg as any)?.filterDimensionIds?.length || 0), 0
      );
      
      console.log('[refresh] Step 4: Breakdown/Filter config:', {
        breakdownCount,
        filterCount,
        breakdownConfigs,
        filterConfigs,
      });
      
      // The breakdown and filter configs are already part of the configuration
      // They will be saved in step 5 along with the pivot_data
      // Here we ensure the pivot_data includes breakdown tables for each configured breakdown dimension
      
      setRefreshStepStatus(prev => ({ ...prev, 4: 'complete', 5: 'loading' }));
      setRefreshStep(5);

      // Step 5: Update slide report and refresh UI
      console.log('[refresh] Step 5: Updating slide report and refreshing UI...');
      
      const { error: updateError } = await supabase
        .from("slide_reports")
        .update({
          pivot_data: typedPivotData as any,
          last_refreshed_at: new Date().toISOString(),
        })
        .eq("id", slideReportId);

      if (updateError) {
        throw new Error(`Failed to save pivot data: ${updateError.message}`);
      }

      // Invalidate and refetch queries
      if (slideReportId) {
        await queryClient.invalidateQueries({ 
          queryKey: ['slide_reports', 'detail', slideReportId] 
        });
        await queryClient.refetchQueries({ 
          queryKey: ['slide_reports', 'detail', slideReportId],
          type: 'active'
        });
        if (accountId) {
          await queryClient.invalidateQueries({ 
            queryKey: ['slide_reports', 'list', accountId] 
          });
        }
      }
      
      // Force reload filter dimension values from the updated pivot data
      console.log('[refresh] Reloading filter dimension values from refreshed pivot data...');
      const updatedFilterDimensionValues: Record<string, Record<string, string[]>> = {
        metasearch: {},
        sem: {},
        social: {},
      };
      const updatedFilterDimensionNames: Record<string, Record<string, string>> = {
        metasearch: {},
        sem: {},
        social: {},
      };
      
      for (const channel of config.selectedChannels || []) {
        const channelData = typedPivotData.channels?.[channel];
        const channelFilterConfig = config.filterConfigs?.[channel];
        
        if (!channelData || !channelFilterConfig?.filterDimensionIds?.length) continue;
        
        const filterUniqueValues = (channelData as any).filterUniqueValues as Record<string, { name: string; values: string[] }> | undefined;
        
        if (filterUniqueValues) {
          for (const filterDimId of channelFilterConfig.filterDimensionIds) {
            const filterData = filterUniqueValues[filterDimId];
            if (filterData) {
              updatedFilterDimensionValues[channel][filterDimId] = filterData.values;
              updatedFilterDimensionNames[channel][filterDimId] = filterData.name;
              console.log(`[refresh] Loaded ${filterData.values.length} filter values for ${channel}/${filterData.name}`);
            }
          }
        }
      }
      
      // Update filter dimension values state
      setFilterDimensionValues(prev => ({
        ...prev,
        ...updatedFilterDimensionValues,
      }));
      setFilterDimensionNames(prev => ({
        ...prev,
        ...updatedFilterDimensionNames,
      }));
      
      setRefreshStepStatus(prev => ({ ...prev, 5: 'complete' }));
      
      // Wait a moment then close modal
      await new Promise(resolve => setTimeout(resolve, 500));
      setIsRefreshModalOpen(false);
      
      const totalChannels = config.selectedChannels?.length || 0;
      
      console.log('[refresh] Complete:', {
        totalChannels,
        monthlyRecordsStored: monthlyRecords.length,
        breakdownCount,
        filterCount,
      });
      
      toast({ 
        title: "Data refreshed", 
        description: `Stored ${monthlyRecords.length} monthly records with ${breakdownCount} breakdown(s) and ${filterCount} filter(s).` 
      });
      
    } catch (error) {
      console.error("[refresh] Error:", error);
      const currentStep = refreshStep;
      setRefreshStepStatus(prev => ({ ...prev, [currentStep]: 'error' }));
      setRefreshError(error instanceof Error ? error.message : "Failed to refresh data");
      
      toast({
        title: "Refresh failed",
        description: error instanceof Error ? error.message : "Failed to refresh data. Please try again.",
        variant: "destructive",
      });
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
    // Use pivot_data if available
    const pivotData = slideReport?.pivot_data as SlideReportPivotData | null;
    if (pivotData?.channels?.[channel]) {
      const channelData = pivotData.channels[channel];
      if (comparisonType === "previous_period" && channelData.previous_period) {
        return {
          ...channelData.previous_period,
          label: "vs Previous Period",
        };
      } else if (comparisonType === "previous_year" && channelData.previous_year) {
        return {
          ...channelData.previous_year,
          label: "vs Previous Year",
        };
      }
    }
    
    // Fallback to hardcoded data
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

  // Get overview comparison metrics from pivot_data
  const getOverviewComparisonMetrics = () => {
    if (comparisonType === 'none') return null;
    
    const pivotData = slideReport?.pivot_data as SlideReportPivotData | null;
    if (pivotData?.overview) {
      if (comparisonType === "previous_period" && pivotData.overview.previous_period) {
        return {
          ...pivotData.overview.previous_period,
          label: "vs Previous Period",
        };
      } else if (comparisonType === "previous_year" && pivotData.overview.previous_year) {
        return {
          ...pivotData.overview.previous_year,
          label: "vs Previous Year",
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

  // Get the current report name
  const currentReportName = slideReport?.name || 'Master Report';

  return (
    <Tabs value={selectedTab} onValueChange={setSelectedTab} className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => navigate(`/tools/reports/${accountId}`)}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            {/* Tabs in header */}
            <TabsList>
              <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Overview</TabsTrigger>
              <TabsTrigger value="metasearch">Metasearch</TabsTrigger>
              <TabsTrigger value="sem">SEM</TabsTrigger>
              <TabsTrigger value="social">Social</TabsTrigger>
              <TabsTrigger value="budget">Budget</TabsTrigger>
            </TabsList>
            
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
      <Dialog open={isEditSourceOpen} onOpenChange={(open) => handleModalClose(open)}>
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
                <ChannelTabsList
                  selectedChannels={selectedChannels}
                  activeChannelTab={activeChannelTab}
                  setActiveChannelTab={(channel) => {
                    setActiveChannelTab(channel);
                    setSearchQuery("");
                  }}
                  getChannelBadgeCount={(channel) => channelConfigs[channel]?.selectedValues?.length || 0}
                />

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
                            <DimensionValuesList
                              values={dimensionValues[activeChannelTab] || []}
                              selectedValues={channelConfigs[activeChannelTab]?.selectedValues || []}
                              loading={loadingValues[activeChannelTab] || false}
                              onValueToggle={(value) => handleValueToggle(activeChannelTab, value)}
                              onSelectAll={() => handleSelectAllValues(activeChannelTab)}
                              onDeselectAll={() => handleDeselectAllValues(activeChannelTab)}
                            />
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

      {/* Data Browser Modal */}
      <SlideDataBrowser
        open={isDataModalOpen}
        onOpenChange={setIsDataModalOpen}
        pivotData={slideReport?.pivot_data as SlideReportPivotData | null}
        lastRefreshedAt={slideReport?.last_refreshed_at}
        configuration={slideReport?.configuration as SlideReportConfiguration | null}
        reportIds={slideReport?.report_ids as Record<string, string> | null}
        slideReportId={slideReportId}
      />

      <div className="p-6 space-y-6">
        {/* Filters Row */}
        <div className="flex items-center justify-end gap-2">
          {/* Channel Filter Dropdowns - Show when on channel tabs */}
          {selectedTab !== "overview" && selectedTab !== "budget" && (() => {
            const currentChannel = selectedTab as 'metasearch' | 'sem' | 'social';
            const savedFilterConfigs = slideReport?.configuration?.filterConfigs?.[currentChannel];
            const localFilterConfig = filterConfigs?.[currentChannel];
            const filterDimIds = savedFilterConfigs?.filterDimensionIds || localFilterConfig?.filterDimensionIds || [];
            
            if (filterDimIds.length === 0) return null;
            
            return (
              <>
                {filterDimIds.map(filterDimId => {
                  const filterDimName = filterDimensionNames[currentChannel]?.[filterDimId] 
                                     || dimensions[currentChannel]?.find(d => d.id === filterDimId)?.name
                                     || `Filter`;
                  const filterValuesList = filterDimensionValues[currentChannel]?.[filterDimId] || [];
                  const selectedFilterValues = filterValues[currentChannel]?.[filterDimId] || [];
                  const pendingValues = pendingFilterValues[currentChannel]?.[filterDimId] ?? selectedFilterValues;
                  const isAllSelected = selectedFilterValues.length === 0 || selectedFilterValues.length === filterValuesList.length;
                  const hasValues = filterValuesList.length > 0;
                  
                  return (
                    <Popover 
                      key={`filter-${currentChannel}-${filterDimId}`}
                      onOpenChange={(open) => {
                        if (open) {
                          // Initialize pending values with current selection when opening
                          setPendingFilterValues(prev => ({
                            ...prev,
                            [currentChannel]: {
                              ...prev[currentChannel],
                              [filterDimId]: selectedFilterValues,
                            },
                          }));
                        }
                      }}
                    >
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="h-9 justify-between min-w-[140px]">
                          <span className="truncate">
                            {isAllSelected 
                              ? `All ${filterDimName}` 
                              : selectedFilterValues.length === 1
                                ? selectedFilterValues[0]
                                : `${selectedFilterValues.length} selected`}
                          </span>
                          <ChevronRight className="h-4 w-4 opacity-50 rotate-90 ml-2" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[250px] p-0 bg-popover z-50" align="start">
                        <div className="p-2">
                          <div className="flex items-center justify-between mb-2">
                            <Label className="text-sm font-medium">Filter</Label>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => {
                                  setPendingFilterValues(prev => ({
                                    ...prev,
                                    [currentChannel]: {
                                      ...prev[currentChannel],
                                      [filterDimId]: [...filterValuesList],
                                    },
                                  }));
                                }}
                              >
                                All
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => {
                                  setPendingFilterValues(prev => ({
                                    ...prev,
                                    [currentChannel]: {
                                      ...prev[currentChannel],
                                      [filterDimId]: [],
                                    },
                                  }));
                                }}
                              >
                                Clear
                              </Button>
                            </div>
                          </div>
                          <ScrollArea className="h-[200px]">
                            <div className="space-y-1 p-1">
                              {hasValues ? filterValuesList.map(value => {
                                const isSelected = pendingValues.includes(value);
                                return (
                                  <div
                                    key={value}
                                    className={cn(
                                      "flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-accent text-sm",
                                      isSelected && "bg-primary text-primary-foreground"
                                    )}
                                    onClick={() => {
                                      setPendingFilterValues(prev => {
                                        const current = prev[currentChannel]?.[filterDimId] || [];
                                        const newValues = isSelected
                                          ? current.filter(v => v !== value)
                                          : [...current, value];
                                        return {
                                          ...prev,
                                          [currentChannel]: {
                                            ...prev[currentChannel],
                                            [filterDimId]: newValues,
                                          },
                                        };
                                      });
                                    }}
                                  >
                                    <Checkbox checked={isSelected} className={isSelected ? "border-primary-foreground data-[state=checked]:bg-primary-foreground data-[state=checked]:text-primary" : ""} />
                                    <span className="truncate">{value}</span>
                                  </div>
                                );
                              }) : (
                                <div className="text-center py-4 text-muted-foreground text-sm">
                                  Click "Refresh Data" to load filter values
                                </div>
                              )}
                            </div>
                          </ScrollArea>
                          <div className="border-t p-2">
                            <Button
                              size="sm"
                              className="w-full"
                              onClick={() => {
                                // Apply the pending filter values
                                setFilterValues(prev => ({
                                  ...prev,
                                  [currentChannel]: {
                                    ...prev[currentChannel],
                                    [filterDimId]: pendingValues,
                                  },
                                }));
                              }}
                            >
                              Apply
                            </Button>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  );
                })}
              </>
            );
          })()}

          {/* Date Filters - Show on all tabs except Budget */}
          {selectedTab !== "budget" && (
            <div className="flex items-center gap-2">
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
              <span>
                Comparing {selectedYear !== 'all' ? selectedYear : 'Current Period'} 
                {selectedMonth !== 'all' ? ` ${selectedMonth}` : ''} vs Previous Period
              </span>
            )}
            {comparisonType === "previous_year" && (
              <span>
                Comparing {selectedYear !== 'all' ? selectedYear : 'Current Year'} 
                {selectedMonth !== 'all' ? ` ${selectedMonth}` : ''} vs Previous Year
              </span>
            )}
          </div>
        )}

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-6">
              {/* Show setup prompt when no report exists yet */}
              {!slideReportId && !isSlideReportsLoading && (
                <div className="flex flex-col items-center justify-center py-16 space-y-4">
                  <div className="bg-primary/10 rounded-full p-4">
                    <Settings2 className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold">Configure Your Report</h3>
                  <p className="text-muted-foreground text-center max-w-md">
                    Set up your report by selecting channels, dimensions, and date range in the Edit Source wizard.
                  </p>
                  <Button onClick={() => setIsEditSourceOpen(true)} className="mt-2">
                    <Settings2 className="h-4 w-4 mr-2" />
                    Configure Report
                  </Button>
                </div>
              )}

              {/* Loading indicator */}
              {slideReportId && isLoadingData && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />
                  <span className="text-muted-foreground">Loading data from data sources...</span>
                </div>
              )}

              {slideReportId && !isLoadingData && renderKPICards(
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
                      
                      // Get comparison metrics from pivot_data overview
                      const overviewCompMetrics = getOverviewComparisonMetrics();
                      
                      return [
                        { label: "IMPRESSIONS", key: "impressions", value: derived.impressions, icon: Eye, color: "text-pink-600", comparison: overviewCompMetrics?.impressions },
                        { label: "CLICKS", key: "clicks", value: derived.clicks, icon: MousePointer, color: "text-purple-600", comparison: overviewCompMetrics?.clicks },
                        { label: "CTR", key: "ctr", value: derived.ctr, icon: Percent, color: "text-purple-600", format: "percent", comparison: overviewCompMetrics?.ctr },
                        { label: "BOOKINGS", key: "bookings", value: derived.bookings, icon: ShoppingCart, color: "text-orange-600", comparison: overviewCompMetrics?.bookings },
                        { label: "CONVERSION RATE", key: "conversionRate", value: derived.conversionRate, icon: Percent, color: "text-purple-600", format: "percent", comparison: overviewCompMetrics?.conversionRate },
                        { label: "CPC", key: "cpc", value: derived.cpc, icon: DollarSign, color: "text-blue-600", format: "currency", comparison: overviewCompMetrics?.cpc },
                        { label: "COST", key: "cost", value: derived.cost, icon: DollarSign, color: "text-blue-600", format: "currency", comparison: overviewCompMetrics?.cost },
                        { label: "REVENUE", key: "revenue", value: derived.revenue, icon: DollarSign, color: "text-cyan-600", format: "currency", comparison: overviewCompMetrics?.revenue },
                        { label: "ROAS", key: "roas", value: derived.roas, icon: TrendingUp, color: "text-green-600", format: "roas", comparison: overviewCompMetrics?.roas },
                        { label: "COST OF SALE", key: "costOfSale", value: derived.costOfSale, icon: Percent, color: "text-purple-600", format: "percent", comparison: overviewCompMetrics?.costOfSale },
                      ];
                    })()
                  : KPI_CARDS,
                getOverviewComparisonMetrics()
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
              {(() => {
                // Log filter usage for debugging
                const channel = 'metasearch';
                const activeFilters = filterValues[channel] || {};
                // Use saved configuration from slideReport
                const savedFilterConfigs = slideReport?.configuration?.filterConfigs?.[channel];
                const savedBreakdownConfigs = slideReport?.configuration?.breakdownConfigs?.[channel];
                const filterConfigsForChannel = savedFilterConfigs?.filterDimensionIds || filterConfigs[channel]?.filterDimensionIds || [];
                const breakdownConfigsForChannel = savedBreakdownConfigs?.breakdownDimensionIds || breakdownConfigs[channel]?.breakdownDimensionIds || [];
                console.log('[testing] Metasearch Tab - Filters:', {
                  filterConfigs: filterConfigsForChannel,
                  activeFilterValues: activeFilters,
                  hasPivotData: !!slideReport?.pivot_data?.channels?.[channel],
                  breakdownConfigs: breakdownConfigsForChannel,
                  usingSavedConfig: !!slideReport?.configuration,
                });
                return null;
              })()}
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
                  {(() => {
                    // Verify breakdown data exists - use saved configuration
                    const pivotData = slideReport?.pivot_data as SlideReportPivotData | null;
                    const channelData = pivotData?.channels?.metasearch;
                    const breakdownData = channelData?.breakdowns || {};
                    const savedBreakdownConfigs = slideReport?.configuration?.breakdownConfigs?.metasearch;
                    const configuredBreakdowns = savedBreakdownConfigs?.breakdownDimensionIds || breakdownConfigs.metasearch?.breakdownDimensionIds || [];
                    
                    console.log('[testing] Metasearch Breakdown Table:', {
                      hasPivotData: !!pivotData,
                      hasChannelData: !!channelData,
                      breakdownDimensions: Object.keys(breakdownData),
                      configuredBreakdowns,
                      usingSavedConfig: !!savedBreakdownConfigs,
                      availableDimensions: (breakdownDimensions.metasearch || []).filter(dim => 
                        configuredBreakdowns.includes(dim.id)
                      ).map(d => d.name),
                    });
                    
                    if (configuredBreakdowns.length === 0) {
                      return (
                        <div className="text-center py-8 text-muted-foreground">
                          <p>No breakdown dimensions configured.</p>
                          <p className="text-sm mt-2">Configure breakdown dimensions in Edit Source → Breakdown Dimensions step.</p>
                        </div>
                      );
                    }
                    
                    return (
                      <UnifiedBreakdownTable 
                        groupBy={groupByDimension}
                        breakdownBy={breakdownByDimension}
                        expandedRow={expandedRow}
                        onRowClick={setExpandedRow}
                        onGroupByChange={setGroupByDimension}
                        onBreakdownByChange={setBreakdownByDimension}
                        pivotData={slideReport?.pivot_data}
                        selectedChannel="metasearch"
                        selectedYear={selectedYear}
                        selectedMonth={selectedMonth}
                        availableDimensions={[
                          ...new Map([
                            ...(breakdownDimensions.metasearch || []).filter(dim => 
                              configuredBreakdowns.includes(dim.id)
                            ),
                          ].map(dim => [dim.id, dim])).values()
                        ]}
                      />
                    );
                  })()}
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
                    pivotData={slideReport?.pivot_data}
                    selectedChannel="sem"
                    selectedYear={selectedYear}
                    selectedMonth={selectedMonth}
                    availableDimensions={[
                      ...new Map([
                        ...(breakdownDimensions.sem || []).filter(dim => {
                          const savedBreakdownConfigs = slideReport?.configuration?.breakdownConfigs?.sem;
                          const configuredBreakdowns = savedBreakdownConfigs?.breakdownDimensionIds || breakdownConfigs.sem?.breakdownDimensionIds || [];
                          return configuredBreakdowns.includes(dim.id);
                        }),
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
                    pivotData={slideReport?.pivot_data}
                    selectedChannel="social"
                    selectedYear={selectedYear}
                    selectedMonth={selectedMonth}
                    availableDimensions={[
                      ...new Map([
                        ...(breakdownDimensions.social || []).filter(dim => {
                          const savedBreakdownConfigs = slideReport?.configuration?.breakdownConfigs?.social;
                          const configuredBreakdowns = savedBreakdownConfigs?.breakdownDimensionIds || breakdownConfigs.social?.breakdownDimensionIds || [];
                          return configuredBreakdowns.includes(dim.id);
                        }),
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

        </div>

      {/* Refresh Data Modal */}
      <Dialog open={isRefreshModalOpen} onOpenChange={(open) => !open && !refreshStep && setIsRefreshModalOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <RefreshCw className={cn("h-5 w-5 text-primary", refreshStep > 0 && refreshStep < 6 && "animate-spin")} />
              <DialogTitle>Refreshing Data</DialogTitle>
            </div>
            <DialogDescription>
              Updating your report with the latest data...
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <RefreshStepIndicator
              stepNumber={1}
              status={refreshStepStatus[1]}
              title="Verifying settings"
              description="Checking configuration and data sources"
            />
            <RefreshStepIndicator
              stepNumber={2}
              status={refreshStepStatus[2]}
              title="Computing pivot data"
              description="Aggregating metrics by year, month, and channel"
            />
            <RefreshStepIndicator
              stepNumber={3}
              status={refreshStepStatus[3]}
              title="Storing monthly data"
              description="Saving data organized by Year → Month → Channel"
            />
            <RefreshStepIndicator
              stepNumber={4}
              status={refreshStepStatus[4]}
              title="Processing breakdowns & filters"
              description="Storing breakdown tables and filter configurations"
            />
            <RefreshStepIndicator
              stepNumber={5}
              status={refreshStepStatus[5]}
              title="Updating interface"
              description="Refreshing report with latest data"
            />

            {/* Error message */}
            {refreshError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{refreshError}</p>
              </div>
            )}

            {/* All complete message */}
            {refreshStepStatus[5] === 'complete' && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <p className="text-sm text-green-700 font-medium">Data refresh complete! Browse data in the Data tab.</p>
              </div>
            )}
          </div>

          <DialogFooter>
            {refreshError ? (
              <Button onClick={() => setIsRefreshModalOpen(false)}>Close</Button>
            ) : refreshStepStatus[5] === 'complete' ? (
              <Button onClick={() => setIsRefreshModalOpen(false)} className="bg-green-600 hover:bg-green-700">
                Done
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Tabs>
  );
}
