import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, RefreshCw, Eye, MousePointer, DollarSign, Percent, TrendingUp, ShoppingCart, ArrowUpRight, ArrowDownRight, Settings2, ChevronLeft, ChevronRight, X, Sparkles, Search, Loader2, Database, Check, Share2 } from "lucide-react";
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ComposedChart, Line } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useSlideReports, useSlideReport, useCreateSlideReport, useUpdateSlideReport, useRefreshSlideReportData } from "@/hooks/useSlideReports";
import { useChannelMetrics } from "@/hooks/useChannelMetrics";
import { useEditSourceModal } from "@/hooks/useEditSourceModal";
import { useDataLoadingCache } from "@/hooks/useDataLoadingCache";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { SlideReportConfiguration, SlideReportPivotData, SlideReportDateRange, BreakdownRow, ChannelMetrics } from "@/types/slideReports";
import { useUser } from "@/lib/auth";
import { fetchSourceData } from "@/hooks/dataSources/useSourceData";
import { SlideDataBrowser } from "@/components/slides/SlideDataBrowser";
import { RefreshStepIndicator, ChannelTabsList, DimensionValuesList } from "@/components/slides/EditSourceModal";
import { ShareModal } from "@/components/ShareModal";
import { isWithinInterval } from "date-fns";
import { aggregateMetrics } from "@/components/AISummaryPivotTable";
import { BASE_METRICS, CHANNEL_REPORT_IDS, MONTH_NAMES } from "@/constants/slideViewConstants";
import {
  calculateDerivedMetrics,
  hasActiveFilters,
  filterRawDataRows,
  aggregateMetricsFromRows,
  calculatePercentChange,
  formatNumber,
  buildMetricNameToIdsMap,
  getMetricKeys,
  ensureMinimumChartData,
} from "@/lib/slideViewHelpers";
import type { RawDataRow, MetricData } from "@/types/slideView";

// FORECAST DATA
// REAL DATA from database queries - December 2025 Brady Hotels Account (after resync)
// const METASEARCH_DATA = {
//   impressions: 27067,
//   clicks: 1915,
//   cost: 2729.84,
//   revenue: 35093.16,
//   bookings: 70,
// };

// SEM data - December 2025 Brady Hotels
// const SEM_DATA = {
//   impressions: 432114,
//   clicks: 9797,
//   cost: 8208.69,
//   revenue: 155596.64,
//   bookings: 298,
// };

// Social data - December 2025 Brady Hotels
// const SOCIAL_DATA = {
//   impressions: 491612,
//   clicks: 3021,
//   cost: 4337.01,
//   revenue: 87867.77,
//   bookings: 154,
// };

// PREVIOUS PERIOD DATA - November 2025 (verified from database after resync)
// const METASEARCH_PREV_PERIOD = {
//   impressions: 30662,
//   clicks: 1736,
//   cost: 2516.30,
//   revenue: 62764.16,
//   bookings: 98,
// };

// const SEM_PREV_PERIOD = {
//   impressions: 521421,
//   clicks: 11068,
//   cost: 8067.78,
//   revenue: 278315.94,
//   bookings: 444,
// };

// const SOCIAL_PREV_PERIOD = {
//   impressions: 480445,
//   clicks: 2889,
//   cost: 4330.90,
//   revenue: 107535.63,
//   bookings: 180,
// };

// PREVIOUS YEAR DATA - December 2024 (estimated from Oct 2025 proxy)
// const METASEARCH_PREV_YEAR = {
//   impressions: 60000,
//   clicks: 3500,
//   cost: 4800.00,
//   revenue: 110000.00,
//   bookings: 180,
// };

// const SOCIAL_PREV_YEAR = {
//   impressions: 1200000,
//   clicks: 15000,
//   cost: 15000.00,
//   revenue: 250000.00,
//   bookings: 1000,
// };

// HARDCODED BREAKDOWN DATA - COMMENTED OUT: Now using data from Supabase pivot_data.breakdowns
// METASEARCH BREAKDOWN BY HOTEL (December 2025) - ONLY 4 BRADY HOTELS
// const METASEARCH_BY_HOTEL = [
//   { hotel: "Brady Hotels Central Melbourne", impressions: 11271, clicks: 735, cost: 1188.40, revenue: 13701.50, bookings: 27 },
//   { hotel: "Brady Hotels Jones Lane", impressions: 6285, clicks: 496, cost: 672.99, revenue: 12588.50, bookings: 26 },
//   { hotel: "Brady Apartment Hotel Flinders Street", impressions: 5158, clicks: 352, cost: 635.32, revenue: 8010.13, bookings: 13 },
//   { hotel: "Brady Apartment Hotel Hardware Lane", impressions: 7295, clicks: 549, cost: 575.62, revenue: 6590.51, bookings: 15 },
// ];

// METASEARCH BREAKDOWN BY LINK TYPE (December 2025) - FILTERED FOR BRADY HOTELS ONLY
// const METASEARCH_BY_LINK_TYPE = [
//   { linkType: "Paid", impressions: 30009, clicks: 1068, cost: 3072.33, revenue: 30466.99, bookings: 54 },
//   { linkType: "Google Organic", impressions: 0, clicks: 1064, cost: 0, revenue: 10423.65, bookings: 27 },
// ];

// HARDCODED SEM BREAKDOWN DATA - COMMENTED OUT: Now using data from Supabase pivot_data.breakdowns
// SEM BREAKDOWN BY CAMPAIGN (December 2025) - Brady Hotels Group
// Note: This table shows the top campaigns + an "Other campaigns" row so totals match SEM_DATA.
// const SEM_BY_CAMPAIGN = [
//   { campaign: "Brady Hotels Central Melbourne | Search | Brand", impressions: 3248, clicks: 666, cost: 1050.91, revenue: 31932.30, bookings: 45 },
//   { campaign: "Brady Group | Search | Brand", impressions: 3155, clicks: 895, cost: 1059.14, revenue: 25988.77, bookings: 52 },
//   { campaign: "Brady Hotels Jones Lane | Search | Brand", impressions: 2655, clicks: 633, cost: 1047.45, revenue: 22245.90, bookings: 58 },
//   { campaign: "Brady Apartment Hotel Hardware Lane | Search | Brand", impressions: 2142, clicks: 574, cost: 1038.45, revenue: 14744.00, bookings: 25 },
//   { campaign: "Brady Apartment Hotel Flinders Street | Search | Brand", impressions: 2689, clicks: 604, cost: 1044.86, revenue: 14300.23, bookings: 29 },
//   { campaign: "Brady Apartment Hotel Flinders Street | Performance Max", impressions: 27627, clicks: 485, cost: 229.14, revenue: 13196.13, bookings: 11 },
//   { campaign: "Brady Apartment Hotel Hardware Lane | Performance Max", impressions: 65162, clicks: 935, cost: 276.58, revenue: 11338.89, bookings: 19 },
//   { campaign: "Brady Hotels Central Melbourne | Performance Max", impressions: 26301, clicks: 638, cost: 274.40, revenue: 4433.15, bookings: 14 },
//   { campaign: "Brady Group | Performance Max", impressions: 152199, clicks: 1992, cost: 270.84, revenue: 3548.18, bookings: 9 },
//   { campaign: "Brady Hotels Jones Lane | Performance Max", impressions: 46178, clicks: 701, cost: 231.27, revenue: 2342.81, bookings: 8 },
// ];

// const SEM_TOP_CAMPAIGNS_TOTAL = SEM_BY_CAMPAIGN.reduce(
//   (acc, row) => ({
//     impressions: acc.impressions + row.impressions,
//     clicks: acc.clicks + row.clicks,
//     cost: acc.cost + row.cost,
//     revenue: acc.revenue + row.revenue,
//     bookings: acc.bookings + row.bookings,
//   }),
//   { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 }
// );

// const SEM_OTHER_CAMPAIGNS = {
//   campaign: "Other campaigns",
//   impressions: Math.max(0, SEM_DATA.impressions - SEM_TOP_CAMPAIGNS_TOTAL.impressions),
//   clicks: Math.max(0, SEM_DATA.clicks - SEM_TOP_CAMPAIGNS_TOTAL.clicks),
//   cost: Math.max(0, Number((SEM_DATA.cost - SEM_TOP_CAMPAIGNS_TOTAL.cost).toFixed(2))),
//   revenue: Math.max(0, Number((SEM_DATA.revenue - SEM_TOP_CAMPAIGNS_TOTAL.revenue).toFixed(2))),
//   bookings: Math.max(0, Number((SEM_DATA.bookings - SEM_TOP_CAMPAIGNS_TOTAL.bookings).toFixed(2))),
// };

// const SEM_BY_CAMPAIGN_WITH_OTHER =
//   SEM_OTHER_CAMPAIGNS.impressions > 0 ||
//   SEM_OTHER_CAMPAIGNS.clicks > 0 ||
//   SEM_OTHER_CAMPAIGNS.cost > 0 ||
//   SEM_OTHER_CAMPAIGNS.revenue > 0 ||
//   SEM_OTHER_CAMPAIGNS.bookings > 0
//     ? [...SEM_BY_CAMPAIGN, SEM_OTHER_CAMPAIGNS]
//     : SEM_BY_CAMPAIGN;

// HARDCODED SOCIAL BREAKDOWN DATA - COMMENTED OUT: Now using data from Supabase pivot_data.breakdowns
// SOCIAL BREAKDOWN BY CAMPAIGN (December 2025) - Brady Hotels 2025 Account
// const SOCIAL_BY_CAMPAIGN = [
//   { campaign: "Brady Hotels Jones Lane | Sales", impressions: 27562, clicks: 275, cost: 463.60, revenue: 17751.01, bookings: 40 },
//   { campaign: "Brady Apartment Hotel Flinders Street | Sales", impressions: 35164, clicks: 367, cost: 577.52, revenue: 17215.57, bookings: 33 },
//   { campaign: "Brady Apartment Hotel Hardware Lane | Sales", impressions: 26685, clicks: 246, cost: 464.15, revenue: 17051.53, bookings: 22 },
//   { campaign: "Brady Hotels Central Melbourne | Sales", impressions: 28129, clicks: 253, cost: 452.97, revenue: 13215.00, bookings: 23 },
//   { campaign: "Brady Black Friday Sale Campaign | Daily", impressions: 10392, clicks: 58, cost: 286.40, revenue: 5973.10, bookings: 10 },
//   { campaign: "Brady Hotels Central Melbourne | Boxing Day '25", impressions: 11380, clicks: 70, cost: 192.44, revenue: 5498.50, bookings: 5 },
//   { campaign: "Brady Hotels Hardware Lane | Boxing Day '25", impressions: 12672, clicks: 80, cost: 192.46, revenue: 4057.48, bookings: 8 },
//   { campaign: "Brady Hotels Jones Lane | Boxing Day '25", impressions: 11289, clicks: 88, cost: 194.30, revenue: 3125.43, bookings: 5 },
//   { campaign: "Brady Hotels Flinders Street | Boxing Day '25", impressions: 12046, clicks: 83, cost: 192.58, revenue: 2929.15, bookings: 6 },
//   { campaign: "Brady Group | Leads | Members", impressions: 10576, clicks: 127, cost: 313.50, revenue: 802.00, bookings: 1 },
// ];

// const SOCIAL_TOP_CAMPAIGNS_TOTAL = SOCIAL_BY_CAMPAIGN.reduce(
//   (acc, row) => ({
//     impressions: acc.impressions + row.impressions,
//     clicks: acc.clicks + row.clicks,
//     cost: acc.cost + row.cost,
//     revenue: acc.revenue + row.revenue,
//     bookings: acc.bookings + row.bookings,
//   }),
//   { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 }
// );

// const SOCIAL_OTHER_CAMPAIGNS = {
//   campaign: "Other campaigns",
//   impressions: Math.max(0, SOCIAL_DATA.impressions - SOCIAL_TOP_CAMPAIGNS_TOTAL.impressions),
//   clicks: Math.max(0, SOCIAL_DATA.clicks - SOCIAL_TOP_CAMPAIGNS_TOTAL.clicks),
//   cost: Math.max(0, Number((SOCIAL_DATA.cost - SOCIAL_TOP_CAMPAIGNS_TOTAL.cost).toFixed(2))),
//   revenue: Math.max(0, Number((SOCIAL_DATA.revenue - SOCIAL_TOP_CAMPAIGNS_TOTAL.revenue).toFixed(2))),
//   bookings: Math.max(0, Number((SOCIAL_DATA.bookings - SOCIAL_TOP_CAMPAIGNS_TOTAL.bookings).toFixed(2))),
// };

// const SOCIAL_BY_CAMPAIGN_WITH_OTHER =
//   SOCIAL_OTHER_CAMPAIGNS.impressions > 0 ||
//   SOCIAL_OTHER_CAMPAIGNS.clicks > 0 ||
//   SOCIAL_OTHER_CAMPAIGNS.cost > 0 ||
//   SOCIAL_OTHER_CAMPAIGNS.revenue > 0 ||
//   SOCIAL_OTHER_CAMPAIGNS.bookings > 0
//     ? [...SOCIAL_BY_CAMPAIGN, SOCIAL_OTHER_CAMPAIGNS]
//     : SOCIAL_BY_CAMPAIGN;

// HARDCODED BUDGET DATA - COMMENTED OUT: Now using data from Supabase pivot_data.budget
// BUDGET DATA - All months from January 2024 to December 2026 with actual spend data (Brady Hotels ONLY - filtered)
// Data structure: { year: number, month: string, metasearchBudget: number, semBudget: number, socialBudget: number, metasearchActual: number, semActual: number, socialActual: number }
// const ALL_MONTHLY_BUDGET_DATA = [
//   // 2024
//   { year: 2024, month: "Jan", metasearchBudget: 0, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 7500, socialActual: 0 },
//   { year: 2024, month: "Feb", metasearchBudget: 0, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 7800, socialActual: 0 },
//   { year: 2024, month: "Mar", metasearchBudget: 7000, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 7700, socialActual: 0 },
//   { year: 2024, month: "Apr", metasearchBudget: 7000, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 7900, socialActual: 0 },
//   { year: 2024, month: "May", metasearchBudget: 7000, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 7900, socialActual: 0 },
//   { year: 2024, month: "Jun", metasearchBudget: 10000, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 0, socialActual: 2500 },
//   { year: 2024, month: "Jul", metasearchBudget: 10000, semBudget: 0, socialBudget: 0, metasearchActual: 6000, semActual: 0, socialActual: 3800 },
//   { year: 2024, month: "Aug", metasearchBudget: 10000, semBudget: 0, socialBudget: 0, metasearchActual: 8000, semActual: 15, socialActual: 3200 },
//   { year: 2024, month: "Sep", metasearchBudget: 18000, semBudget: 0, socialBudget: 0, metasearchActual: 7000, semActual: 8500, socialActual: 4200 },
//   { year: 2024, month: "Oct", metasearchBudget: 18000, semBudget: 0, socialBudget: 0, metasearchActual: 2500, semActual: 8000, socialActual: 4400 },
//   { year: 2024, month: "Nov", metasearchBudget: 18000, semBudget: 0, socialBudget: 0, metasearchActual: 2400, semActual: 7800, socialActual: 4100 },
//   { year: 2024, month: "Dec", metasearchBudget: 16000, semBudget: 0, socialBudget: 0, metasearchActual: 2600, semActual: 8000, socialActual: 4000 },
//   // 2025
//   { year: 2025, month: "Jan", metasearchBudget: 0, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 7921.79, socialActual: 0 },
//   { year: 2025, month: "Feb", metasearchBudget: 0, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 7969.45, socialActual: 0 },
//   { year: 2025, month: "Mar", metasearchBudget: 8000, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 7925.99, socialActual: 0 },
//   { year: 2025, month: "Apr", metasearchBudget: 8000, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 7961.28, socialActual: 0 },
//   { year: 2025, month: "May", metasearchBudget: 8000, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 7965.97, socialActual: 0 },
//   { year: 2025, month: "Jun", metasearchBudget: 12000, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 0, socialActual: 2741.81 },
//   { year: 2025, month: "Jul", metasearchBudget: 12000, semBudget: 0, socialBudget: 0, metasearchActual: 7056.76, semActual: 0, socialActual: 4060.58 },
//   { year: 2025, month: "Aug", metasearchBudget: 12000, semBudget: 0, socialBudget: 0, metasearchActual: 8794.13, semActual: 19.19, socialActual: 3476.38 },
//   { year: 2025, month: "Sep", metasearchBudget: 20000, semBudget: 0, socialBudget: 0, metasearchActual: 7422.17, semActual: 8873.84, socialActual: 4500.10 },
//   { year: 2025, month: "Oct", metasearchBudget: 20000, semBudget: 0, socialBudget: 0, metasearchActual: 2704.70, semActual: 8397.16, socialActual: 4598.92 },
//   { year: 2025, month: "Nov", metasearchBudget: 20000, semBudget: 0, socialBudget: 0, metasearchActual: 2516.30, semActual: 8067.78, socialActual: 4330.90 },
//   { year: 2025, month: "Dec", metasearchBudget: 18000, semBudget: 0, socialBudget: 0, metasearchActual: 2729.84, semActual: 8208.69, socialActual: 4337.01 },
//   // 2026
//   { year: 2026, month: "Jan", metasearchBudget: 0, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 8200, socialActual: 0 },
//   { year: 2026, month: "Feb", metasearchBudget: 0, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 8100, socialActual: 0 },
//   { year: 2026, month: "Mar", metasearchBudget: 8500, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 8000, socialActual: 0 },
//   { year: 2026, month: "Apr", metasearchBudget: 8500, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 8100, socialActual: 0 },
//   { year: 2026, month: "May", metasearchBudget: 8500, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 8100, socialActual: 0 },
//   { year: 2026, month: "Jun", metasearchBudget: 13000, semBudget: 0, socialBudget: 0, metasearchActual: 0, semActual: 0, socialActual: 3000 },
//   { year: 2026, month: "Jul", metasearchBudget: 13000, semBudget: 0, socialBudget: 0, metasearchActual: 7500, semActual: 0, socialActual: 4500 },
//   { year: 2026, month: "Aug", metasearchBudget: 13000, semBudget: 0, socialBudget: 0, metasearchActual: 9000, semActual: 20, socialActual: 3800 },
//   { year: 2026, month: "Sep", metasearchBudget: 21000, semBudget: 0, socialBudget: 0, metasearchActual: 7800, semActual: 9000, socialActual: 4800 },
//   { year: 2026, month: "Oct", metasearchBudget: 21000, semBudget: 0, socialBudget: 0, metasearchActual: 2900, semActual: 8500, socialActual: 4700 },
//   { year: 2026, month: "Nov", metasearchBudget: 21000, semBudget: 0, socialBudget: 0, metasearchActual: 2700, semActual: 8300, socialActual: 4500 },
//   { year: 2026, month: "Dec", metasearchBudget: 19000, semBudget: 0, socialBudget: 0, metasearchActual: 3000, semActual: 8400, socialActual: 4600 },
// ];

// Legacy MONTHLY_BUDGET_DATA for 2025 (for backward compatibility)
// This will be overridden in the component based on slideType
// const MONTHLY_BUDGET_DATA = ALL_MONTHLY_BUDGET_DATA
//   .filter(d => d.year === 2025)
//   .map(({ year, ...rest }) => rest);

// const BUDGET_COMPARISON_DATA = MONTHLY_BUDGET_DATA.map(m => ({
//   month: m.month,
//   budget: m.metasearchBudget + m.semBudget + m.socialBudget,
//   actual: m.metasearchActual + m.semActual + m.socialActual,
// }));

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
  filterValues,
  filterDimensionValues,
  onTotalsChange,
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
  filterValues?: Record<string, Record<string, string[]>>;
  filterDimensionValues?: Record<string, Record<string, string[]>>;
  onTotalsChange?: (totals: { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }) => void;
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
  // Applies filterValues if they are set
  const groupedData = useMemo(() => {
    if (!pivotData?.channels) return [];
    
    const groupByDim = availableDimensions.find(d => d.id === groupBy);
    const groupByName = groupByDim?.name || groupBy;
    const groupByDimId = groupByDim?.id || groupBy;
    
    // Check if filters are actually applied for the selected channel (not "All" selected)
    const hasFilters = selectedChannel && selectedChannel !== 'overview' && filterValues?.[selectedChannel]
      ? Object.entries(filterValues[selectedChannel]).some(([dimensionId, selectedValues]) => {
          if (!selectedValues || selectedValues.length === 0) {
            return false; // Empty = "All" selected = no filter
          }
          // Check if all available values are selected (also means "All" = no filter)
          const availableValues = filterDimensionValues?.[selectedChannel]?.[dimensionId] || [];
          if (availableValues.length > 0 && selectedValues.length === availableValues.length) {
            // Check if they're the same set
            const selectedSet = new Set(selectedValues);
            const availableSet = new Set(availableValues);
            if (selectedSet.size === availableSet.size && 
                [...selectedSet].every(v => availableSet.has(v))) {
              return false; // All values selected = "All" = no filter
            }
          }
          return true; // Subset selected = filter is applied
        })
      : false;
    
    // Collect breakdown data from all channels (or specific channel if selected)
    const allBreakdowns: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }> = {};
    
    const channelsToCheck = selectedChannel && selectedChannel !== 'overview' 
      ? [selectedChannel] 
      : Object.keys(pivotData.channels);
    
    for (const channel of channelsToCheck) {
      const channelData = pivotData.channels[channel];
      if (!channelData) continue;
      
      const rawDataRows = (channelData as any).rawDataRows || [];
      
      // Always use rawDataRows when available for consistency and completeness
      // This ensures we use the dynamic dimension resolution and get all data
      if (rawDataRows.length > 0) {
        const channelFilterValues = hasFilters && channel === selectedChannel 
          ? (filterValues?.[channel] || {})
          : {};
        
        // Build date range if month/year is selected
        let dateRange: { start: Date; end: Date } | undefined;
        if (monthKey) {
          const [year, monthNum] = monthKey.split('-').map(Number);
          const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
          dateRange = {
            start: new Date(year, monthNum - 1, 1),
            end: new Date(year, monthNum, 0, 23, 59, 59),
          };
        } else if (selectedYear && selectedYear !== 'all') {
          const yearNum = parseInt(selectedYear);
          dateRange = {
            start: new Date(yearNum, 0, 1),
            end: new Date(yearNum, 11, 31, 23, 59, 59),
          };
        }
        
        // Filter rows (applies date range and any filters)
        const filteredRows = filterRawDataRows(rawDataRows, channelFilterValues, dateRange);
        
        // Group by breakdown dimension and aggregate metrics
        const groupedRows: Record<string, any[]> = {};
        filteredRows.forEach((row) => {
          const rowData = row.dimension_values || row;
          const groupValue = rowData[groupByDimId] || rowData[groupByName] || 'Unknown';
          const normalizedGroupValue = String(groupValue).trim();
          
          if (normalizedGroupValue && normalizedGroupValue !== 'Unknown') {
            if (!groupedRows[normalizedGroupValue]) {
              groupedRows[normalizedGroupValue] = [];
            }
            groupedRows[normalizedGroupValue].push(row);
          }
        });
        
        // Build metricNameToIdMap from dimensionMap (reverse mapping: name -> id)
        // This matches the exact structure used in slideReportPivotComputation.ts
        const dimensionMap = (channelData as any).dimensionMap || {};
        const metricNameToIdMap: Record<string, string> = {};
        Object.entries(dimensionMap as Record<string, string>).forEach(([dimensionId, dimensionName]) => {
          if (dimensionName && typeof dimensionName === 'string') {
            metricNameToIdMap[dimensionName] = dimensionId;
          }
        });
        
        // Aggregate metrics for each group
        Object.entries(groupedRows).forEach(([groupValue, groupRows]) => {
          if (!allBreakdowns[groupValue]) {
            allBreakdowns[groupValue] = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
          }
          
          groupRows.forEach((row) => {
            const rowData = row.dimension_values || row;
            
            // Use EXACT same extraction logic as computeBreakdownAllTime/computeBreakdownForMonth
            // This ensures we get the same values as the pre-computed breakdowns
            const impressionsValue = parseFloat(rowData[metricNameToIdMap['Impressions']] || rowData['Impressions'] || 0) || 0;
            const clicksValue = parseFloat(rowData[metricNameToIdMap['Clicks']] || rowData['Clicks'] || 0) || 0;
            const costValue = parseFloat(rowData[metricNameToIdMap['Cost']] || rowData['Cost'] || 0) || 0;
            const revenueValue = parseFloat(rowData[metricNameToIdMap['Revenue']] || rowData['Revenue'] || 0) || 0;
            const bookingsValue = parseFloat(rowData[metricNameToIdMap['Bookings']] || rowData['Bookings'] || 0) || 0;
            
            allBreakdowns[groupValue].impressions += impressionsValue;
            allBreakdowns[groupValue].clicks += clicksValue;
            allBreakdowns[groupValue].cost += costValue;
            allBreakdowns[groupValue].revenue += revenueValue;
            allBreakdowns[groupValue].bookings += bookingsValue;
          });
        });
      } else {
        // Fallback: No rawDataRows available - use pre-computed breakdown data
        // Use monthlyBreakdowns if a specific month is selected, otherwise use aggregated breakdowns
        let breakdownData: any[] = [];
        
        if (monthKey && channelData.monthlyBreakdowns?.[monthKey]) {
          // Use month-specific breakdown data
          breakdownData = channelData.monthlyBreakdowns[monthKey][groupByName] || [];
        } else if (channelData.breakdowns) {
          // Fall back to aggregated breakdowns
          breakdownData = channelData.breakdowns[groupByName] || [];
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
    }

    // Convert to array and calculate derived metrics
    const result = Object.entries(allBreakdowns)
      .filter(([groupValue]) => groupValue && groupValue !== 'Unknown')
      .sort(([, a], [, b]) => b.revenue - a.revenue)
      .map(([groupValue, data]) => {
        // Ensure data has all required fields with proper types
        const cleanData = {
          impressions: Number(data.impressions) || 0,
          clicks: Number(data.clicks) || 0,
          cost: Number(data.cost) || 0,
          revenue: Number(data.revenue) || 0,
          bookings: Number(data.bookings) || 0,
        };
        
        const metrics = calculateDerivedMetrics(cleanData);
        
        return {
          groupValue,
          metrics,
          rawData: cleanData,
        };
      });
    
    return result;
  }, [pivotData, groupBy, availableDimensions, selectedChannel, monthKey, filterValues, filterDimensionValues, selectedYear]);

  // Get breakdown data for expanded row (also uses month-specific data)
  // This should show breakdown data ONLY for the expanded parent row value
  const getExpandedBreakdownData = useMemo(() => {
    if (!expandedRow || !pivotData?.channels || !breakdownBy) return [];
    
    const groupByDim = availableDimensions.find(d => d.id === groupBy);
    const groupByDimId = groupByDim?.id || groupBy;
    const groupByName = groupByDim?.name || groupBy;
    
    const breakdownByDim = availableDimensions.find(d => d.id === breakdownBy);
    const breakdownByName = breakdownByDim?.name || breakdownBy;
    const breakdownByDimId = breakdownByDim?.id || breakdownBy;
    
    const channelsToCheck = selectedChannel && selectedChannel !== 'overview' 
      ? [selectedChannel] 
      : Object.keys(pivotData.channels);
    
    // Check if filters are actually applied (not "All" selected)
    const hasFilters = selectedChannel && selectedChannel !== 'overview' && filterValues?.[selectedChannel]
      ? Object.entries(filterValues[selectedChannel]).some(([dimensionId, selectedValues]) => {
          if (!selectedValues || selectedValues.length === 0) {
            return false; // Empty = "All" selected = no filter
          }
          // Check if all available values are selected (also means "All" = no filter)
          const availableValues = filterDimensionValues?.[selectedChannel]?.[dimensionId] || [];
          if (availableValues.length > 0 && selectedValues.length === availableValues.length) {
            // Check if they're the same set
            const selectedSet = new Set(selectedValues);
            const availableSet = new Set(availableValues);
            if (selectedSet.size === availableSet.size && 
                [...selectedSet].every(v => availableSet.has(v))) {
              return false; // All values selected = "All" = no filter
            }
          }
          return true; // Subset selected = filter is applied
        })
      : false;
    
    const allBreakdowns: Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }> = {};
    
    for (const channel of channelsToCheck) {
      const channelData = pivotData.channels[channel];
      if (!channelData) continue;
      
      // Build date range if month is selected
      let dateRange: { start: Date; end: Date } | undefined;
      if (monthKey) {
        const [year, monthNum] = monthKey.split('-').map(Number);
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        dateRange = {
          start: new Date(year, monthNum - 1, 1),
          end: new Date(year, monthNum, 0, 23, 59, 59),
        };
      } else if (selectedYear && selectedYear !== 'all') {
        const yearNum = parseInt(selectedYear);
        dateRange = {
          start: new Date(yearNum, 0, 1),
          end: new Date(yearNum, 11, 31, 23, 59, 59),
        };
      }
      
      // Get raw data rows
      const rawDataRows = (channelData as any).rawDataRows || [];
      
      // Apply filters if they exist
      let filteredRows = rawDataRows;
      if (hasFilters && channel === selectedChannel) {
        const channelFilterValues = filterValues?.[channel] || {};
        filteredRows = filterRawDataRows(rawDataRows, channelFilterValues, dateRange);
      } else if (dateRange) {
        // Even without filters, apply date range if specified
        filteredRows = filterRawDataRows(rawDataRows, {}, dateRange);
      }
      
      // Filter to only rows where groupBy dimension matches expandedRow
      const rowsForExpandedRow = filteredRows.filter((row) => {
        const rowData = row.dimension_values || row;
        const rowGroupValue = rowData[groupByDimId] || rowData[groupByName];
        const normalizedRowGroupValue = String(rowGroupValue || '').trim();
        const normalizedExpandedRow = String(expandedRow).trim();
        return normalizedRowGroupValue === normalizedExpandedRow;
      });
      
      // Group by breakdownBy dimension
      const groupedRows: Record<string, any[]> = {};
      rowsForExpandedRow.forEach((row) => {
        const rowData = row.dimension_values || row;
        const breakdownValue = rowData[breakdownByDimId] || rowData[breakdownByName] || 'Unknown';
        const normalizedBreakdownValue = String(breakdownValue).trim();
        
        if (normalizedBreakdownValue && normalizedBreakdownValue !== 'Unknown') {
          if (!groupedRows[normalizedBreakdownValue]) {
            groupedRows[normalizedBreakdownValue] = [];
          }
          groupedRows[normalizedBreakdownValue].push(row);
        }
      });
      
      // Aggregate metrics for each breakdown value
      Object.entries(groupedRows).forEach(([breakdownValue, groupRows]) => {
        if (!allBreakdowns[breakdownValue]) {
          allBreakdowns[breakdownValue] = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
        }
        
        // Build metricNameToIdMap from dimensionMap (reverse mapping: name -> id)
        // This matches the exact structure used in slideReportPivotComputation.ts
        const dimensionMap = (channelData as any).dimensionMap || {};
        const metricNameToIdMap: Record<string, string> = {};
        Object.entries(dimensionMap as Record<string, string>).forEach(([dimensionId, dimensionName]) => {
          if (dimensionName && typeof dimensionName === 'string') {
            metricNameToIdMap[dimensionName] = dimensionId;
          }
        });
        
        groupRows.forEach((row) => {
          const rowData = row.dimension_values || row;
          
          // Use EXACT same extraction logic as computeBreakdownAllTime/computeBreakdownForMonth
          // This ensures we get the same values as the pre-computed breakdowns
          allBreakdowns[breakdownValue].impressions += parseFloat(rowData[metricNameToIdMap['Impressions']] || rowData['Impressions'] || 0) || 0;
          allBreakdowns[breakdownValue].clicks += parseFloat(rowData[metricNameToIdMap['Clicks']] || rowData['Clicks'] || 0) || 0;
          allBreakdowns[breakdownValue].cost += parseFloat(rowData[metricNameToIdMap['Cost']] || rowData['Cost'] || 0) || 0;
          allBreakdowns[breakdownValue].revenue += parseFloat(rowData[metricNameToIdMap['Revenue']] || rowData['Revenue'] || 0) || 0;
          allBreakdowns[breakdownValue].bookings += parseFloat(rowData[metricNameToIdMap['Bookings']] || rowData['Bookings'] || 0) || 0;
        });
      });
    }
    
    return Object.entries(allBreakdowns)
      .filter(([value]) => value && value !== 'Unknown')
      .sort(([, a], [, b]) => b.revenue - a.revenue)
      .map(([value, data]) => ({
        value,
        metrics: calculateDerivedMetrics(data),
      }));
  }, [expandedRow, pivotData, breakdownBy, availableDimensions, selectedChannel, monthKey, filterValues, filterDimensionValues, selectedYear, groupBy]);

  // Calculate totals - use rawData to ensure we're summing base metrics only
  // Then recalculate derived metrics (CPC, ROAS, Cost of Sale) from the aggregated totals
  const totals = groupedData.reduce((acc, group) => ({
    impressions: acc.impressions + (group.rawData?.impressions || group.metrics.impressions || 0),
    clicks: acc.clicks + (group.rawData?.clicks || group.metrics.clicks || 0),
    cost: acc.cost + (group.rawData?.cost || group.metrics.cost || 0),
    revenue: acc.revenue + (group.rawData?.revenue || group.metrics.revenue || 0),
    bookings: acc.bookings + (group.rawData?.bookings || group.metrics.bookings || 0),
  }), { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 });
  const totalMetrics = calculateDerivedMetrics(totals);
  
  // Expose totals to parent component for KPI cards synchronization
  useEffect(() => {
    if (onTotalsChange && selectedChannel) {
      onTotalsChange(totals);
    }
  }, [totals, onTotalsChange, selectedChannel]);
  
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
              <SelectTrigger className="w-40 bg-background border border-input">
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
            <SelectTrigger className="w-40 bg-background border border-input">
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
                <TableCell className="text-right">${group.metrics.cpc < 0.01 ? group.metrics.cpc.toFixed(4) : group.metrics.cpc.toFixed(2)}</TableCell>
                <TableCell className="text-right">{formatNumber(group.metrics.cost, 'currency')}</TableCell>
                <TableCell className="text-right">{formatNumber(group.metrics.revenue, 'currency')}</TableCell>
                <TableCell className="text-right">{group.metrics.roas.toFixed(1)}x</TableCell>
                <TableCell className="text-right">{group.metrics.costOfSale < 0.01 ? group.metrics.costOfSale.toFixed(4) : group.metrics.costOfSale.toFixed(2)}%</TableCell>
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
                      <TableCell className="text-right text-muted-foreground">${item.metrics.cpc < 0.01 ? item.metrics.cpc.toFixed(4) : item.metrics.cpc.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatNumber(item.metrics.cost, 'currency')}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatNumber(item.metrics.revenue, 'currency')}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{item.metrics.roas.toFixed(1)}x</TableCell>
                      <TableCell className="text-right text-muted-foreground">{item.metrics.costOfSale < 0.01 ? item.metrics.costOfSale.toFixed(4) : item.metrics.costOfSale.toFixed(2)}%</TableCell>
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
            <TableCell className="text-right">${totalMetrics.cpc < 0.01 ? totalMetrics.cpc.toFixed(4) : totalMetrics.cpc.toFixed(2)}</TableCell>
            <TableCell className="text-right">{formatNumber(totalMetrics.cost, 'currency')}</TableCell>
            <TableCell className="text-right">{formatNumber(totalMetrics.revenue, 'currency')}</TableCell>
            <TableCell className="text-right">{totalMetrics.roas.toFixed(1)}x</TableCell>
            <TableCell className="text-right">{totalMetrics.costOfSale < 0.01 ? totalMetrics.costOfSale.toFixed(4) : totalMetrics.costOfSale.toFixed(2)}%</TableCell>
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
            <TableCell className="text-right">{formatNumber(row.cost, 'currency')}</TableCell>
            <TableCell className="text-right">{formatNumber(row.revenue, 'currency')}</TableCell>
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
          <TableCell className="text-right">{formatNumber(totalMetrics.cost, 'currency')}</TableCell>
          <TableCell className="text-right">{formatNumber(totalMetrics.revenue, 'currency')}</TableCell>
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
  // Get current month name for default
  const currentDate = new Date();
  const currentMonthName = MONTH_NAMES[currentDate.getMonth()];
  const currentYearStr = currentDate.getFullYear().toString();
  
  const [selectedYear, setSelectedYear] = useState(currentYearStr); // Default to current year
  const [selectedMonth, setSelectedMonth] = useState(currentMonthName); // Default to current month
  const [selectedTab, setSelectedTab] = useState("overview");
  const [comparisonType, setComparisonType] = useState("none");
  const [chartTimeRange, setChartTimeRange] = useState<'this_year' | 'last_12_months' | 'last_6_months' | 'last_3_months'>('last_6_months');
  const [isEditSourceOpen, setIsEditSourceOpen] = useState(false);
  const [isDataModalOpen, setIsDataModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
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

  // Fetch real data from edge function for master-report - memoized with useCallback
  const fetchSlideReportData = useCallback(async () => {
    // TODO: Uncomment this when we have the edge function working
    // if (slideType !== 'master-report') return;
    
    // setIsLoadingData(true);
    // try {
    //   const { data, error } = await supabase.functions.invoke('get-slide-report-data', {
    //     body: {
    //       accountId,
    //       years: [2024, 2025, 2026],
    //       hotelFilter: true, // Only Brady hotels for metasearch
    //     },
    //   });

    //   if (error) {
    //     console.error('Error fetching slide report data:', error);
    //     return;
    //   }

    //   setDynamicMonthlyData(data.monthlyRevenue || []);
    //   setDynamicChannelTotals(data.channelTotals || {});
    //   setDynamicYearlyTotals(data.yearlyTotals || {});
    // } catch (err) {
    //   console.error('Error calling edge function:', err);
    // } finally {
    //   setIsLoadingData(false);
    // }
  }, [accountId, slideType]);

  // Fetch data on mount for master-report
  useEffect(() => {
    if (slideType === 'master-report' && accountId) {
      fetchSlideReportData();
    }
  }, [slideType, accountId, fetchSlideReportData]);

  // Slide report state - moved before filteredMonthlyData so it's available
  const [slideReportId, setSlideReportId] = useState<string | null>(null);
  const { data: slideReport } = useSlideReport(slideReportId);
  const { data: slideReports, isLoading: isSlideReportsLoading } = useSlideReports(accountId || null);
  const queryClient = useQueryClient();
  const createSlideReport = useCreateSlideReport();
  const updateSlideReport = useUpdateSlideReport();
  const refreshSlideReportData = useRefreshSlideReportData();

  // Monthly data from database (same source as SlideDataBrowser)
  const [monthlyDataRecords, setMonthlyDataRecords] = useState<Array<{
    id: string;
    slide_report_id: string;
    year: number;
    month: number;
    channel: string;
    metrics: ChannelMetrics;
    breakdowns: Record<string, BreakdownRow[]>;
    row_count: number;
    computed_at: string;
  }>>([]);
  const [isLoadingMonthlyData, setIsLoadingMonthlyData] = useState(false);

  // Fetch monthly data from database (same as SlideDataBrowser)
  useEffect(() => {
    if (!slideReportId) return;

    let cancelled = false;
    const fetchMonthlyData = async () => {
      setIsLoadingMonthlyData(true);
      try {
        const { data, error } = await supabase
          .from('slide_report_monthly_data')
          .select('*')
          .eq('slide_report_id', slideReportId)
          .order('year', { ascending: false })
          .order('month', { ascending: true });

        if (cancelled) return;

        if (error) {
          console.error('Error fetching monthly data:', error);
        } else {
          setMonthlyDataRecords((data as any[]) || []);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Error:', err);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingMonthlyData(false);
        }
      }
    };

    fetchMonthlyData();

    return () => {
      cancelled = true;
    };
  }, [slideReportId]);

  // Filter values state for slides page (channel -> dimensionId -> selected value)
  // Moved here so it's available for useMemo hooks
  const [filterValues, setFilterValues] = useState<Record<string, Record<string, string[]>>>({
    metasearch: {},
    sem: {},
    social: {},
  });

  // Filter dimension values state (for dropdowns) - channel -> dimensionId -> values[]
  // Moved here so it's available for useMemo hooks
  const [filterDimensionValues, setFilterDimensionValues] = useState<Record<string, Record<string, string[]>>>({
    metasearch: {},
    sem: {},
    social: {},
  });
  
  // Track loading state for filter values per dimension
  const [filterValuesLoading, setFilterValuesLoading] = useState<Record<string, Record<string, boolean>>>({
    metasearch: {},
    sem: {},
    social: {},
  });

  // Filter monthly data based on selected year - build from pivot_data
  // Applies filterValues if they are set (but not when "All" is selected)
  const filteredMonthlyData = useMemo(() => {
    const pivotData = slideReport?.pivot_data as SlideReportPivotData | null;
    
    // Check if any filters are actually applied (not "All" selected)
    const hasFilters = Object.entries(filterValues).some(([channel, channelFilters]) => {
      return Object.entries(channelFilters).some(([dimensionId, selectedValues]) => {
        if (!selectedValues || selectedValues.length === 0) {
          return false; // Empty = "All" selected = no filter
        }
        // Check if all available values are selected (also means "All" = no filter)
        const availableValues = filterDimensionValues[channel]?.[dimensionId] || [];
        if (availableValues.length > 0 && selectedValues.length === availableValues.length) {
          // Check if they're the same set
          const selectedSet = new Set(selectedValues);
          const availableSet = new Set(availableValues);
          if (selectedSet.size === availableSet.size && 
              [...selectedSet].every(v => availableSet.has(v))) {
            return false; // All values selected = "All" = no filter
          }
        }
        return true; // Subset selected = filter is applied
      });
    });
    
    // If filters are applied, filter rawDataRows and aggregate by month
    if (hasFilters && pivotData?.channels) {
      const monthlyMap = new Map<string, { year: number; month: string; metasearch: number; sem: number; social: number }>();
      
      // Aggregate from filtered rawDataRows for each channel
      for (const [channel, channelData] of Object.entries(pivotData.channels)) {
        const channelFilterValues = filterValues[channel] || {};
        const rawDataRows = (channelData as any).rawDataRows || [];
        
        // Filter rows based on filterValues (no date filter here - we want all months)
        const filteredRows = filterRawDataRows(rawDataRows, channelFilterValues);
        
        // Group by month and aggregate revenue
        filteredRows.forEach((row) => {
          const rowData = row.dimension_values || row;
          
          // Find date value
          let dateValue: any = rowData.Date || rowData.date || rowData.Day || rowData.day;
          if (!dateValue) {
            for (const [key, val] of Object.entries(rowData)) {
              if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) {
                dateValue = val;
                break;
              }
            }
          }
          
          if (dateValue) {
            const rowDate = new Date(dateValue);
            if (!isNaN(rowDate.getTime())) {
              const year = rowDate.getFullYear();
              const month = MONTH_NAMES[rowDate.getMonth()];
              const key = `${year}-${month}`;
              
              if (!monthlyMap.has(key)) {
                monthlyMap.set(key, { year, month, metasearch: 0, sem: 0, social: 0 });
              }
              
              const entry = monthlyMap.get(key)!;
              const revenue = parseFloat(String(rowData['Revenue'] || rowData['revenue'] || 0).replace(/[^0-9.-]/g, ''));
              if (!isNaN(revenue)) {
                entry[channel as 'metasearch' | 'sem' | 'social'] += revenue;
              }
            }
          }
        });
      }
      
      const result = Array.from(monthlyMap.values()).sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return MONTH_NAMES.indexOf(a.month) - MONTH_NAMES.indexOf(b.month);
      });
      
      // Filter by selectedYear if needed
      if (selectedYear !== 'all') {
        return result.filter(m => m.year === parseInt(selectedYear));
      }
      return result;
    }
    
    // No filters applied - use pre-computed monthly data
    // Build from pivot_data if available
    if (pivotData?.channels) {
      const monthlyMap = new Map<string, { year: number; month: string; metasearch: number; sem: number; social: number }>();
      
      // Collect all months from all channels
      Object.entries(pivotData.channels).forEach(([channel, channelData]) => {
        if (channelData.monthly) {
          Object.entries(channelData.monthly).forEach(([monthKey, metrics]) => {
            const [year, monthNum] = monthKey.split('-').map(Number);
            const month = MONTH_NAMES[monthNum - 1];
            const key = `${year}-${month}`;
            
            if (!monthlyMap.has(key)) {
              monthlyMap.set(key, { year, month, metasearch: 0, sem: 0, social: 0 });
            }
            
            const entry = monthlyMap.get(key)!;
            entry[channel as 'metasearch' | 'sem' | 'social'] = metrics.revenue || 0;
          });
        }
      });
      
      const result = Array.from(monthlyMap.values()).sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        return MONTH_NAMES.indexOf(a.month) - MONTH_NAMES.indexOf(b.month);
      });
      
      // Filter by selectedYear if needed
      if (selectedYear !== 'all') {
        return result.filter(m => m.year === parseInt(selectedYear));
      }
      return result;
    }
    
    // Fallback to dynamicMonthlyData or empty array
    const sourceData = slideType === 'master-report' && dynamicMonthlyData.length > 0 
      ? dynamicMonthlyData 
      : [];
    
    if (selectedYear === 'all') {
      return sourceData;
    }
      return sourceData.filter(m => m.year === parseInt(selectedYear));
  }, [slideReport?.pivot_data, slideType, dynamicMonthlyData, selectedYear, filterValues, filterDimensionValues]);

  // Get channel totals from monthly_data table (same source as SlideDataBrowser)
  // This is the correct source of truth for the data
  const monthlyDataTotals = useMemo(() => {
    const channelTotals: Record<string, {
      impressions: number;
      clicks: number;
      cost: number;
      revenue: number;
      bookings: number;
    }> = {
      metasearch: { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 },
      sem: { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 },
      social: { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 },
    };

    if (monthlyDataRecords.length === 0) {
      return channelTotals;
    }

    // Filter records based on selected year/month
    let filteredRecords = monthlyDataRecords;
    
    if (selectedYear !== 'all') {
      const yearNum = parseInt(selectedYear);
      filteredRecords = filteredRecords.filter(r => r.year === yearNum);
    }
    
    if (selectedMonth !== 'all') {
      const monthNum = MONTH_NAMES.indexOf(selectedMonth) + 1;
      filteredRecords = filteredRecords.filter(r => r.month === monthNum);
    }

    // Aggregate metrics by channel
    filteredRecords.forEach(record => {
      const channel = record.channel.toLowerCase();
      if (channelTotals[channel] && record.metrics) {
        const metrics = record.metrics;
        channelTotals[channel].impressions += metrics.impressions || 0;
        channelTotals[channel].clicks += metrics.clicks || 0;
        channelTotals[channel].cost += metrics.cost || 0;
        channelTotals[channel].revenue += metrics.revenue || 0;
        channelTotals[channel].bookings += metrics.bookings || 0;
      }
    });

    return channelTotals;
  }, [monthlyDataRecords, selectedYear, selectedMonth]);

  // Get channel metrics using hook
  const { currentTotals: hookCurrentTotals, comparisonTotals: hookComparisonTotals } = useChannelMetrics({
    pivotData: slideReport?.pivot_data as SlideReportPivotData | null,
    selectedYear,
    selectedMonth,
    filterValues,
    filterDimensionValues,
    slideType,
    dynamicChannelTotals,
    comparisonType: comparisonType as 'none' | 'previous_period' | 'previous_year',
  });

  // Get current totals based on selected year/month from pivot_data
  // Applies filterValues if they are set (but not when "All" is selected)
  // Overview tab also applies filters from individual channel tabs
  const currentTotals = useMemo(() => {
    const pivotData = slideReport?.pivot_data as SlideReportPivotData | null;
    
    // Early return if no pivot data available yet
    if (!pivotData?.channels) {
      return {
        metasearch: { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 },
        sem: { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 },
        social: { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 },
      };
    }
    
    // Check if any filters are actually applied (not "All" selected)
    // Filters now apply across all tabs including Overview
    const hasFilters = Object.entries(filterValues).some(([channel, channelFilters]) => {
      return Object.entries(channelFilters).some(([dimensionId, selectedValues]) => {
        if (!selectedValues || selectedValues.length === 0) {
          return false; // Empty = "All" selected = no filter
        }
        // Check if all available values are selected (also means "All" = no filter)
        const availableValues = filterDimensionValues[channel]?.[dimensionId] || [];
        if (availableValues.length > 0 && selectedValues.length === availableValues.length) {
          // Check if they're the same set
          const selectedSet = new Set(selectedValues);
          const availableSet = new Set(availableValues);
          if (selectedSet.size === availableSet.size && 
              [...selectedSet].every(v => availableSet.has(v))) {
            return false; // All values selected = "All" = no filter
          }
        }
        return true; // Subset selected = filter is applied
      });
    });
    
    // If filters are applied, we need to filter rawDataRows and re-aggregate
    if (hasFilters && pivotData?.channels) {
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      
      // Build date range based on selected year/month
      // Only apply date filter if a specific year or month is selected
      let dateRange: { start: Date; end: Date } | undefined;
      if (selectedMonth !== 'all' && selectedYear !== 'all') {
        const monthNum = MONTH_NAMES.indexOf(selectedMonth);
        const yearNum = parseInt(selectedYear);
        dateRange = {
          start: new Date(yearNum, monthNum, 1),
          end: new Date(yearNum, monthNum + 1, 0, 23, 59, 59),
        };
      } else if (selectedYear !== 'all') {
        const yearNum = parseInt(selectedYear);
        dateRange = {
          start: new Date(yearNum, 0, 1),
          end: new Date(yearNum, 11, 31, 23, 59, 59),
        };
      }
      // If both are 'all', don't filter by date - use all data
      
      const channelTotals: Record<string, any> = {};
      
      // Determine which channels have active filters
      const channelsWithFilters = new Set<string>();
      Object.entries(filterValues).forEach(([channel, channelFilters]) => {
        const hasChannelFilters = Object.entries(channelFilters).some(([dimensionId, selectedValues]) => {
          if (!selectedValues || selectedValues.length === 0) {
            return false; // Empty = "All" selected = no filter
          }
          // Check if all available values are selected (also means "All" = no filter)
          const availableValues = filterDimensionValues[channel]?.[dimensionId] || [];
          if (availableValues.length > 0 && selectedValues.length === availableValues.length) {
            // Check if they're the same set
            const selectedSet = new Set(selectedValues);
            const availableSet = new Set(availableValues);
            if (selectedSet.size === availableSet.size && 
                [...selectedSet].every(v => availableSet.has(v))) {
              return false; // All values selected = "All" = no filter
            }
          }
          return true; // Subset selected = filter is applied
        });
        if (hasChannelFilters) {
          channelsWithFilters.add(channel);
        }
      });
      
      for (const [channel, channelData] of Object.entries(pivotData.channels)) {
        const channelFilterValues = filterValues[channel] || {};
        const hasChannelFilters = channelsWithFilters.has(channel);
        
        // If this channel has filters, filter rawDataRows and re-aggregate
        if (hasChannelFilters) {
          const rawDataRows = (channelData as any).rawDataRows || [];
          
          // Filter rows based on filterValues and date range
          const filteredRows = filterRawDataRows(rawDataRows, channelFilterValues, dateRange);
          
          if (filteredRows.length > 0) {
          // Build dynamic metric mapping from dimensionMap
          const dimensionMap = (channelData as any).dimensionMap || {};
          const nameToIdsMap = buildMetricNameToIdsMap(dimensionMap);
          
          // Manually aggregate metrics from filtered rows
          // rawDataRows store metrics by dimension IDs, so we need to try both IDs and names
          const metrics = {
            impressions: 0,
            clicks: 0,
            cost: 0,
            revenue: 0,
            bookings: 0,
          };
          
          filteredRows.forEach((row) => {
            const rowData = row.dimension_values || row;
            
            // Helper to safely extract numeric value
            const getMetricValue = (keys: string[]): number => {
              for (const key of keys) {
                const value = rowData[key];
                if (value !== undefined && value !== null) {
                  if (typeof value === 'number') {
                    return isNaN(value) ? 0 : value;
                  }
                  const parsed = parseFloat(String(value).replace(/[^0-9.-]/g, ''));
                  if (!isNaN(parsed)) {
                    return parsed;
                  }
                }
              }
              return 0;
            };
            
            // Dynamically resolve metric keys using dimensionMap
            metrics.impressions += getMetricValue(getMetricKeys('impressions', nameToIdsMap));
            metrics.clicks += getMetricValue(getMetricKeys('clicks', nameToIdsMap));
            metrics.cost += getMetricValue(getMetricKeys('cost', nameToIdsMap));
            metrics.revenue += getMetricValue(getMetricKeys('revenue', nameToIdsMap));
            metrics.bookings += getMetricValue(getMetricKeys('bookings', nameToIdsMap));
          });
          
          channelTotals[channel] = metrics;
          } else {
            channelTotals[channel] = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
          }
        } else {
          // This channel has no filters - use pre-computed data (same logic as when no filters are applied)
          if (selectedMonth && selectedMonth !== 'all') {
            const monthNum = MONTH_NAMES.indexOf(selectedMonth) + 1;
            const monthKey = selectedYear !== 'all' 
              ? `${selectedYear}-${monthNum.toString().padStart(2, '0')}`
              : null;
            
            if (monthKey) {
              const monthlyData = (channelData as any).monthly?.[monthKey];
              if (monthlyData) {
                channelTotals[channel] = monthlyData;
              } else {
                channelTotals[channel] = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
              }
            } else {
              channelTotals[channel] = (channelData as any).current || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
            }
          } else if (selectedYear !== 'all') {
            const yearNum = parseInt(selectedYear);
            const yearlyData = (channelData as any).yearly?.[String(yearNum)];
            if (yearlyData) {
              channelTotals[channel] = yearlyData;
            } else {
              channelTotals[channel] = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
            }
          } else {
            channelTotals[channel] = (channelData as any).current || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
          }
        }
      }
      
      return channelTotals;
    }
    
    // No filters applied - use pre-computed aggregated data (fast path)
    // Only process rawDataRows when filters are applied (handled above)
    if (pivotData?.channels) {
      const channelTotals: Record<string, any> = {};
      
      // Use pre-computed data based on selected year/month (much faster than processing rawDataRows)
      if (selectedMonth !== 'all' && selectedYear !== 'all') {
        const monthNum = MONTH_NAMES.indexOf(selectedMonth) + 1;
        const monthKey = selectedYear !== 'all' 
          ? `${selectedYear}-${monthNum.toString().padStart(2, '0')}`
          : null;
        
        if (monthKey) {
          for (const [channel, channelData] of Object.entries(pivotData.channels)) {
            const monthlyData = (channelData as any).monthly?.[monthKey];
            channelTotals[channel] = monthlyData || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
          }
          return channelTotals;
        }
      }
      
      if (selectedYear !== 'all') {
        const yearNum = parseInt(selectedYear);
        for (const [channel, channelData] of Object.entries(pivotData.channels)) {
          const yearlyData = (channelData as any).yearly?.[String(yearNum)];
          channelTotals[channel] = yearlyData || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
        }
        return channelTotals;
      }
      
      // Use current totals for all years (fastest - pre-computed)
      for (const [channel, channelData] of Object.entries(pivotData.channels)) {
        channelTotals[channel] = (channelData as any).current || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
      }
      return channelTotals;
    }
    
    // Fallback to dynamic data or zeros
    if (slideType === 'master-report' && Object.keys(dynamicChannelTotals).length > 0) {
      return dynamicChannelTotals;
    }
    // Return zeros when no data is available (data should come from pivot_data)
    return {
      metasearch: { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 },
      sem: { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 },
      social: { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 },
    };
  }, [slideType, slideReport?.pivot_data, dynamicChannelTotals, dynamicYearlyTotals, selectedYear, selectedMonth, selectedTab, filterValues, filterDimensionValues, slideReport?.date_range]);

  // Get comparison totals based on comparison type and selected year/month
  // TODO: Migrate fully to useChannelMetrics hook
  const comparisonTotals = useMemo(() => {
    // Use hook result if available, otherwise fall back to legacy calculation
    if (hookComparisonTotals) {
      return hookComparisonTotals;
    }
    
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
  }, [comparisonType, slideReport?.pivot_data, hookComparisonTotals]);

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
        return MONTH_NAMES.indexOf(a.month) - MONTH_NAMES.indexOf(b.month);
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
    }
  }, [slideReport?.pivot_data, slideType]);

  useEffect(() => {
    const loadOrCreateSlideReport = async () => {
      if (!accountId || !user) return;
      
      // Wait for slideReports to finish loading before deciding to create
      if (isSlideReportsLoading) {
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
    }
  }, [slideReport?.configuration]);

  // Load filter dimension values and names from pivot_data (pre-computed) instead of loading from database
  useEffect(() => {
    const loadFilterValuesFromPivotData = async () => {
      const pivotData = slideReport?.pivot_data as SlideReportPivotData | null;
      const config = slideReport?.configuration as SlideReportConfiguration | null;
      
      if (!pivotData?.channels || !config?.filterConfigs) {
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
            }
          }
        } else {
          // Fallback: Load from database (for old reports without pre-computed values)
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
      }
      if (Object.values(updatedFilterDimensionNames).some(ch => Object.keys(ch).length > 0)) {
        setFilterDimensionNames(prev => ({ ...prev, ...updatedFilterDimensionNames }));
      }
    };

    loadFilterValuesFromPivotData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideReport?.pivot_data, slideReport?.configuration?.filterConfigs]);

  // Load filter dimension values when switching to a channel tab that has filters
  useEffect(() => {
    let cancelled = false;
    
    const loadValuesForCurrentTab = async () => {
      if (selectedTab === 'overview' || selectedTab === 'budget') return;
      if (cancelled) return;
      
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
        return;
      }
      
      // First, try to get values from pivot_data (pre-computed)
      const pivotData = slideReport?.pivot_data as SlideReportPivotData | null;
      const channelData = pivotData?.channels?.[currentChannel];
      const filterUniqueValues = (channelData as any)?.filterUniqueValues as Record<string, { name: string; values: string[] }> | undefined;
      
      const newValues: Record<string, string[]> = {};
      const newNames: Record<string, string> = {};
      const missingDimIds: string[] = [];
      
      // Also check rawDataRows as a fast fallback (in-memory, no DB query)
      const rawDataRows = (channelData as any)?.rawDataRows as any[] | undefined;
      
      for (const filterDimId of filterDimIds) {
        if (filterDimensionValues[currentChannel]?.[filterDimId]?.length > 0) continue;
        
        // FASTEST: Check pre-computed filterUniqueValues from pivot_data first
        if (filterUniqueValues?.[filterDimId]) {
          newValues[filterDimId] = filterUniqueValues[filterDimId].values;
          newNames[filterDimId] = filterUniqueValues[filterDimId].name;
        } else if (rawDataRows && rawDataRows.length > 0) {
          // FAST: Extract from rawDataRows (already in memory)
          const uniqueValues = new Set<string>();
          for (const row of rawDataRows) {
            const rowData = row.dimension_values || row;
            const value = rowData[filterDimId];
            if (value !== undefined && value !== null && String(value).trim() !== '') {
              uniqueValues.add(String(value).trim());
            }
          }
          const sortedValues = Array.from(uniqueValues).sort();
          if (sortedValues.length > 0) {
            newValues[filterDimId] = sortedValues;
            // Try to get dimension name from dimensionMap or dimensions list
            const dimName = (channelData as any)?.dimensionMap?.[filterDimId] 
              || dimensions[currentChannel]?.find(d => d.id === filterDimId)?.name
              || filterDimId;
            newNames[filterDimId] = dimName;
          } else {
            missingDimIds.push(filterDimId);
          }
        } else {
          missingDimIds.push(filterDimId);
        }
      }
      
      // SLOW: Fallback to database only if needed (load in parallel for speed)
      if (missingDimIds.length > 0 && !cancelled) {
        // Set loading state
        setFilterValuesLoading(prev => {
          const updated = { ...prev };
          if (!updated[currentChannel]) updated[currentChannel] = {};
          missingDimIds.forEach(id => {
            updated[currentChannel][id] = true;
          });
          return updated;
        });
        
        const loadPromises = missingDimIds.map(filterDimId =>
          loadFilterDimensionValues(currentChannel, filterDimId).then(values => {
            if (cancelled) return;
            if (values.length > 0) {
              newValues[filterDimId] = values;
            }
            // Clear loading state for this dimension
            if (!cancelled) {
              setFilterValuesLoading(prev => ({
                ...prev,
                [currentChannel]: {
                  ...prev[currentChannel],
                  [filterDimId]: false,
                },
              }));
            }
          })
        );
        
        await Promise.all(loadPromises);
      }
      
      if (cancelled) return;
      
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
    };

    loadValuesForCurrentTab();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTab, slideReport?.pivot_data, slideReport?.configuration?.filterConfigs]);

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


  // Pending filter values (before Apply is clicked)
  const [pendingFilterValues, setPendingFilterValues] = useState<Record<string, Record<string, string[]>>>({
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
  
  // Store breakdown totals from Breakdown Analysis table for KPI synchronization
  const [breakdownTotals, setBreakdownTotals] = useState<Record<string, { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }>>({});
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  const handleDimensionToggle = useCallback((dimension: 'metasearch' | 'sem' | 'social') => {
    setSelectedDimensions(prev => ({
      ...prev,
      [dimension]: !prev[dimension],
    }));
  }, []);

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
        loadValuesForDimension(activeChannelTab, dimensionId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        await loadValuesForDimension(channel, dimensionIdToLoad);
      }
    } catch (err) {
      console.error(`Error loading dimensions for ${channel}:`, err);
      setDimensions(prev => ({ ...prev, [channel]: [] }));
      setLoadingDimensions(prev => ({ ...prev, [channel]: false }));
    }
  };

  // Dimension values cache
  const dimensionValuesCache = useDataLoadingCache<string[]>({ ttl: 10 * 60 * 1000 }); // 10 minutes cache

  // Load values for a dimension from stored pivot_data first, fallback to dimension_data table
  // Also uses cached/saved selected values from channelConfigs for instant display
  // Now with caching to improve performance
  const loadValuesForDimension = useCallback(async (channel: 'metasearch' | 'sem' | 'social', dimensionId: string) => {
    // Check cache first
    const cacheKey = `${channel}-${dimensionId}`;
    const cached = dimensionValuesCache.get(cacheKey);
    if (cached) {
      setDimensionValues(prev => ({ ...prev, [channel]: cached }));
      setLoadingValues(prev => ({ ...prev, [channel]: false }));
      return;
    }
    // FIRST: Immediately show cached selected values from saved config (instant display)
    const savedConfig = channelConfigs[channel];
    const cachedSelectedValues = savedConfig?.selectedValues || [];
    
    // If we have cached values and the dimension matches, show them immediately
    if (cachedSelectedValues.length > 0 && savedConfig?.dimensionId === dimensionId) {
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
        const valueSet = new Set<string>();
        cachedSelectedValues.forEach(v => valueSet.add(v));
        
        channelData.rawDataRows.forEach((row: any) => {
          const val = row[dimensionId];
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            valueSet.add(String(val).trim());
          }
        });
        
        const sortedValues = Array.from(valueSet).sort();
        
        setDimensionValues(prev => ({ ...prev, [channel]: sortedValues }));
        setLoadingValues(prev => ({ ...prev, [channel]: false }));
        return;
      }
      
      // THIRD: Check pre-computed filterUniqueValues in pivot_data
      const storedFilterValues = channelData?.filterUniqueValues?.[dimensionId];
      
      if (storedFilterValues?.values && storedFilterValues.values.length > 0) {
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
            
            // Merge with cached selected values
            const allValues = new Set([...breakdownValues, ...cachedSelectedValues]);
            const sortedValues = Array.from(allValues).sort();
            
            setDimensionValues(prev => ({ ...prev, [channel]: sortedValues }));
            setLoadingValues(prev => ({ ...prev, [channel]: false }));
            return;
          }
        }
      }
      
      // FALLBACK: Fetch from dimension_data table
      const reportId = CHANNEL_REPORT_IDS[channel];
      
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
        } else {
          hasMore = false;
        }
      }

      const dimData = allDimData;

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
      
      // For Metasearch Hotel dimension, filter to only Brady hotels (only for brady slide, not master-report)
      if (slideType === 'brady' && channel === 'metasearch' && dimensionId === '093ac487-dd90-4466-9972-ac51d110e91e') {
        values = values.filter(v => v.startsWith('Brady'));
      }

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
      setLoadingValues(prev => ({ ...prev, [channel]: false }));
    }
  }, [slideReport?.pivot_data, channelConfigs, slideType, dimensions, dimensionValuesCache]);

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
            setLoadingValues(prev => ({ ...prev, [channel]: true }));
            loadValuesForDimension(channel, dimensionId);
          }
        }
      });
    }
  }, [modalStep, isEditSourceOpen, selectedChannels, dimensions, loadingDimensions, channelConfigs, dimensionValues, loadingValues, loadDimensionsForChannel, loadValuesForDimension]);

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

  // Data loading cache to prevent redundant queries
  const filterValuesCache = useDataLoadingCache<string[]>({ ttl: 10 * 60 * 1000 }); // 10 minutes cache

  // Helper function to load filter dimension values for a specific dimension
  // Optimized to use fastest available data source: rawDataRows > filterUniqueValues > database
  // Now with caching to improve performance
  const loadFilterDimensionValues = useCallback(async (channel: 'metasearch' | 'sem' | 'social', filterDimId: string): Promise<string[]> => {
    // Check cache first
    const cacheKey = `${channel}-${filterDimId}`;
    const cached = filterValuesCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const reportId = CHANNEL_REPORT_IDS[channel];
    if (!reportId) {
      console.warn(`[loadFilterDimensionValues] No report ID for channel: ${channel}`);
      return [];
    }

    try {
      // FASTEST PATH: Use rawDataRows if available (already in memory, no DB query needed)
      const pivotData = slideReport?.pivot_data as SlideReportPivotData | null;
      const channelData = pivotData?.channels?.[channel];
      const rawDataRows = (channelData as any)?.rawDataRows as any[] | undefined;
      
      if (rawDataRows && rawDataRows.length > 0) {
        const uniqueValues = new Set<string>();
        
        for (const row of rawDataRows) {
          const rowData = row.dimension_values || row;
          const value = rowData[filterDimId];
          if (value !== undefined && value !== null && String(value).trim() !== '') {
            uniqueValues.add(String(value).trim());
          }
        }
        
        const sortedValues = Array.from(uniqueValues).sort();
        return sortedValues;
      }
      
      // FAST PATH: Use pre-computed filterUniqueValues from pivot_data
      const filterUniqueValues = (channelData as any)?.filterUniqueValues as Record<string, { name: string; values: string[] }> | undefined;
      if (filterUniqueValues?.[filterDimId]) {
        return filterUniqueValues[filterDimId].values;
      }

      // SLOW PATH: Fallback to database query (only if above methods unavailable)
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

      if (allDimData.length === 0) {
        return [];
      }

      // Extract unique values only for this specific filter dimension ID
      const uniqueValues = new Set<string>();
      for (const row of allDimData) {
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
      
      // Cache the result
      filterValuesCache.set(cacheKey, sortedValues);
      
      return sortedValues;
    } catch (error) {
      console.error(`[loadFilterDimensionValues] Error loading filter values for ${channel}/${filterDimId}:`, error);
      return [];
    }
  }, [slideReport?.pivot_data, filterValuesCache]);

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
    }
  };

  // Load saved configuration into modal state, including dimension values
  const loadSavedConfigurationIntoModal = async () => {
    if (!slideReport?.configuration) {
      return;
    }

    const config = slideReport.configuration;

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
    // Note: onOpen/onClose callbacks in useEditSourceModal handle the rest
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

      setRefreshStepStatus(prev => ({ ...prev, 1: 'complete', 2: 'loading' }));
      setRefreshStep(2);

      // Step 2: Compute pivot data
      const config = latestReport.configuration as unknown as SlideReportConfiguration;
      const reportIdsMap = latestReport.report_ids as unknown as Record<string, string>;
      const dateRange = latestReport.date_range as unknown as SlideReportDateRange;
      
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
      
      setRefreshStepStatus(prev => ({ ...prev, 2: 'complete', 3: 'loading' }));
      setRefreshStep(3);

      // Step 3: Store monthly data in Supabase (organized by year/month)
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
      }

      setRefreshStepStatus(prev => ({ ...prev, 3: 'complete', 4: 'loading' }));
      setRefreshStep(4);

      // Step 4: Store breakdown and filter configurations
      const breakdownConfigs = config.breakdownConfigs || {};
      const filterConfigs = config.filterConfigs || {};
      
      // Log breakdown and filter configurations being stored
      const breakdownCount = Object.values(breakdownConfigs).reduce(
        (sum, cfg) => sum + ((cfg as any)?.breakdownDimensionIds?.length || 0), 0
      );
      const filterCount = Object.values(filterConfigs).reduce(
        (sum, cfg) => sum + ((cfg as any)?.filterDimensionIds?.length || 0), 0
      );
      
      // The breakdown and filter configs are already part of the configuration
      // They will be saved in step 5 along with the pivot_data
      // Here we ensure the pivot_data includes breakdown tables for each configured breakdown dimension
      
      setRefreshStepStatus(prev => ({ ...prev, 4: 'complete', 5: 'loading' }));
      setRefreshStep(5);

      // Step 5: Update slide report and refresh UI
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

  // Get comparison data based on selection - use comparisonTotals from pivot_data
  const comparisonData = useMemo(() => {
    if (!comparisonTotals) return null;
    
    // Aggregate comparison totals from all channels
    const overview = {
      impressions: (comparisonTotals.metasearch?.impressions || 0) + (comparisonTotals.sem?.impressions || 0) + (comparisonTotals.social?.impressions || 0),
      clicks: (comparisonTotals.metasearch?.clicks || 0) + (comparisonTotals.sem?.clicks || 0) + (comparisonTotals.social?.clicks || 0),
      cost: (comparisonTotals.metasearch?.cost || 0) + (comparisonTotals.sem?.cost || 0) + (comparisonTotals.social?.cost || 0),
      revenue: (comparisonTotals.metasearch?.revenue || 0) + (comparisonTotals.sem?.revenue || 0) + (comparisonTotals.social?.revenue || 0),
      bookings: (comparisonTotals.metasearch?.bookings || 0) + (comparisonTotals.sem?.bookings || 0) + (comparisonTotals.social?.bookings || 0),
    };
    
    if (comparisonType === "previous_period") {
      return {
        ...overview,
        label: "vs Previous Period",
      };
    } else if (comparisonType === "previous_year") {
      return {
        ...overview,
        label: "vs Previous Year",
      };
    }
    return null;
  }, [comparisonTotals, comparisonType]);

  // Calculate current metrics from currentTotals
  const currentMetrics = useMemo(() => {
    const totals = currentTotals;
    const overview = {
      impressions: (totals.metasearch?.impressions || 0) + (totals.sem?.impressions || 0) + (totals.social?.impressions || 0),
      clicks: (totals.metasearch?.clicks || 0) + (totals.sem?.clicks || 0) + (totals.social?.clicks || 0),
      cost: (totals.metasearch?.cost || 0) + (totals.sem?.cost || 0) + (totals.social?.cost || 0),
      revenue: (totals.metasearch?.revenue || 0) + (totals.sem?.revenue || 0) + (totals.social?.revenue || 0),
      bookings: (totals.metasearch?.bookings || 0) + (totals.sem?.bookings || 0) + (totals.social?.bookings || 0),
    };
    return {
      impressions: overview.impressions,
      clicks: overview.clicks,
      bookings: overview.bookings,
      ctr: overview.impressions > 0 ? (overview.clicks / overview.impressions) * 100 : 0,
      conversionRate: overview.clicks > 0 ? (overview.bookings / overview.clicks) * 100 : 0,
      cpc: overview.clicks > 0 ? overview.cost / overview.clicks : 0,
      cost: overview.cost,
      revenue: overview.revenue,
      roas: overview.cost > 0 ? overview.revenue / overview.cost : 0,
      costOfSale: overview.revenue > 0 ? (overview.cost / overview.revenue) * 100 : 0,
    };
  }, [currentTotals]);

  // Calculate comparison metrics if enabled
  const comparisonMetrics = useMemo(() => {
    if (!comparisonData) return null;
    return {
      impressions: comparisonData.impressions,
      clicks: comparisonData.clicks,
      bookings: comparisonData.bookings,
      ctr: comparisonData.impressions > 0 ? (comparisonData.clicks / comparisonData.impressions) * 100 : 0,
      conversionRate: comparisonData.clicks > 0 ? (comparisonData.bookings / comparisonData.clicks) * 100 : 0,
      cpc: comparisonData.clicks > 0 ? comparisonData.cost / comparisonData.clicks : 0,
      cost: comparisonData.cost,
      revenue: comparisonData.revenue,
      roas: comparisonData.cost > 0 ? comparisonData.revenue / comparisonData.cost : 0,
      costOfSale: comparisonData.revenue > 0 ? (comparisonData.cost / comparisonData.revenue) * 100 : 0,
    };
  }, [comparisonData]);

  // KPI Cards - REORDERED: Bookings before Conversion Rate
  const KPI_CARDS = useMemo(() => [
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
  ], [currentMetrics]);

  // Generate KPI cards for specific report - memoized with useCallback
  const getReportKPICards = useCallback((data: { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }) => {
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
  }, []);

  // Get channel-specific comparison data - memoized
  const getChannelComparisonMetrics = useCallback((channel: 'metasearch' | 'sem' | 'social') => {
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
    
    // No fallback - return null if no comparison data available
    return null;
  }, [slideReport?.pivot_data, comparisonType]);

  // Get overview comparison metrics from pivot_data - memoized
  const getOverviewComparisonMetrics = useCallback(() => {
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
  }, [slideReport?.pivot_data, comparisonType]);

  // Skeleton loader for KPI Cards - memoized
  const renderKPICardsSkeleton = useCallback(() => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {Array.from({ length: 10 }).map((_, index) => (
        <Card key={index} className="shadow-sm border-l-4 border-l-primary/60 bg-card">
          <CardContent className="p-4">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-8 w-32 mb-2" />
            <Skeleton className="h-3 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  ), []);

  // Skeleton loader for Chart - memoized
  const renderChartSkeleton = useCallback(() => (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-8 w-[150px]" />
      </CardHeader>
      <CardContent>
        <div className="h-[250px] flex items-center justify-center">
          <Skeleton className="h-full w-full" />
        </div>
      </CardContent>
    </Card>
  ), []);

  // Skeleton loader for Table - memoized
  const renderTableSkeleton = useCallback(() => (
    <Card>
      <CardHeader>
        <Skeleton className="h-5 w-48" />
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              {Array.from({ length: 11 }).map((_, index) => (
                <TableHead key={index} className={index > 0 ? "text-right" : ""}>
                  <Skeleton className="h-4 w-20" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 4 }).map((_, rowIndex) => (
              <TableRow key={rowIndex}>
                {Array.from({ length: 11 }).map((_, colIndex) => (
                  <TableCell key={colIndex} className={colIndex > 0 ? "text-right" : ""}>
                    <Skeleton className="h-4 w-16" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  ), []);

  // Memoized render function for KPI Cards
  const renderKPICards = useCallback((cards: typeof KPI_CARDS, channelCompMetrics?: ReturnType<typeof getChannelComparisonMetrics>) => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
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
          <Card key={kpi.label} className="shadow-sm border-l-4 border-l-primary/60 bg-card">
            <CardContent className="p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                {kpi.label}
              </p>
              <div className="text-2xl font-bold text-foreground">
                {kpi.format === "currency" 
                  ? kpi.key === "cpc" && kpi.value < 0.01
                    ? `$${kpi.value.toFixed(4)}`
                    : `$${formatNumber(kpi.value)}`
                  : kpi.format === "percent"
                  ? kpi.key === "costOfSale" && kpi.value < 0.01
                    ? `${kpi.value.toFixed(4)}%`
                    : `${kpi.value.toFixed(2)}%`
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
  ), [comparisonMetrics, comparisonData]);

  // Report breakdown with reordered columns - use currentTotals
  const REPORT_BREAKDOWN = useMemo(() => {
    const totals = currentTotals;
    return [
      { report: "Metasearch", ...calculateDerivedMetrics(totals.metasearch || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 }) },
      { report: "SEM", ...calculateDerivedMetrics(totals.sem || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 }) },
      { report: "Social", ...calculateDerivedMetrics(totals.social || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 }) },
    ];
  }, [currentTotals]);

  // Calculate total for all reports
  const REPORT_TOTAL = useMemo(() => {
    const totals = currentTotals;
    const totalData = {
      impressions: (totals.metasearch?.impressions || 0) + (totals.sem?.impressions || 0) + (totals.social?.impressions || 0),
      clicks: (totals.metasearch?.clicks || 0) + (totals.sem?.clicks || 0) + (totals.social?.clicks || 0),
      cost: (totals.metasearch?.cost || 0) + (totals.sem?.cost || 0) + (totals.social?.cost || 0),
      revenue: (totals.metasearch?.revenue || 0) + (totals.sem?.revenue || 0) + (totals.social?.revenue || 0),
      bookings: (totals.metasearch?.bookings || 0) + (totals.sem?.bookings || 0) + (totals.social?.bookings || 0),
    };
    return { report: "Total", ...calculateDerivedMetrics(totalData) };
  }, [currentTotals]);

  // Calculate budget totals from pivot_data.budget
  const budgetData = useMemo(() => {
    const pivotData = slideReport?.pivot_data as SlideReportPivotData | null;
    if (pivotData?.budget?.monthly) {
      return pivotData.budget.monthly.map(m => ({
        month: m.month,
        budget: m.metasearchBudget + m.semBudget + m.socialBudget,
        actual: m.metasearchActual + m.semActual + m.socialActual,
      }));
    }
    return [];
  }, [slideReport?.pivot_data]);

  // Budget monthly data for tables (full structure with all fields)
  const budgetMonthlyData = useMemo(() => {
    const pivotData = slideReport?.pivot_data as SlideReportPivotData | null;
    if (pivotData?.budget?.monthly) {
      return pivotData.budget.monthly;
    }
    return [];
  }, [slideReport?.pivot_data]);

  const totalBudget = budgetData.reduce((sum, m) => sum + m.budget, 0);
  const totalActual = budgetData.reduce((sum, m) => sum + m.actual, 0);
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
            <Button variant="outline" size="sm" onClick={() => setIsShareModalOpen(true)}>
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsDataModalOpen(true)}>
              <Database className="h-4 w-4 mr-2" />
              Data
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsEditSourceOpen(true)}>
              <Settings2 className="h-4 w-4 mr-2" />
              Edit Source
            </Button>
            {/* Only show Refresh Data button for master reports (not child reports) */}
            {!slideReport?.configuration?.isChildReport && (
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
            )}
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
        pivotData={useMemo(() => {
          const rawPivotData = slideReport?.pivot_data as SlideReportPivotData | null;
          if (!rawPivotData || !rawPivotData.channels) return rawPivotData;

          // Create a deep copy to avoid mutating the original
          const transformedPivotData: SlideReportPivotData = {
            ...rawPivotData,
            channels: { ...rawPivotData.channels },
          };

          // Transform each channel's breakdowns
          Object.keys(transformedPivotData.channels).forEach((channel) => {
            const channelData = transformedPivotData.channels[channel];
            if (!channelData.breakdowns) return;

            const breakdowns = { ...channelData.breakdowns };
            const accountBreakdown = breakdowns['Account'];
            const campaignBreakdown = breakdowns['Campaign'];

            // If both Account and Campaign exist, combine them
            if (accountBreakdown && campaignBreakdown) {
              const combinedMap = new Map<string, BreakdownRow>();

              // Extract account and campaign values
              accountBreakdown.forEach((accountRow) => {
                const accountValue = accountRow.account || accountRow.name || accountRow['Account'] || 'Unknown Account';
                
                // If there's only one account, combine it with all campaigns
                // Otherwise, use the campaign breakdown as the primary (more granular)
                if (accountBreakdown.length === 1) {
                  // Single account: combine with all campaigns
                  campaignBreakdown.forEach((campaignRow) => {
                    const campaignValue = campaignRow.campaign || campaignRow.name || campaignRow['Campaign'] || 'Unknown Campaign';
                    const combinedKey = `${accountValue} > ${campaignValue}`;
                    
                    // Use campaign metrics (more accurate) with account prefix
                    combinedMap.set(combinedKey, {
                      name: combinedKey,
                      account: accountValue,
                      campaign: campaignValue,
                      impressions: campaignRow.impressions || 0,
                      clicks: campaignRow.clicks || 0,
                      cost: campaignRow.cost || 0,
                      revenue: campaignRow.revenue || 0,
                      bookings: campaignRow.bookings || 0,
                    });
                  });
                } else {
                  // Multiple accounts: combine each account with all campaigns
                  // (This creates a cartesian product but is necessary without raw data)
                  campaignBreakdown.forEach((campaignRow) => {
                    const campaignValue = campaignRow.campaign || campaignRow.name || campaignRow['Campaign'] || 'Unknown Campaign';
                    const combinedKey = `${accountValue} > ${campaignValue}`;
                    
                    // Distribute account metrics proportionally to campaigns
                    // Simple approach: use campaign metrics with account label
                    combinedMap.set(combinedKey, {
                      name: combinedKey,
                      account: accountValue,
                      campaign: campaignValue,
                      impressions: campaignRow.impressions || 0,
                      clicks: campaignRow.clicks || 0,
                      cost: campaignRow.cost || 0,
                      revenue: campaignRow.revenue || 0,
                      bookings: campaignRow.bookings || 0,
                    });
                  });
                }
              });

              // Convert map to array and sort by revenue
              const combinedArray = Array.from(combinedMap.values()).sort((a, b) => (b.revenue || 0) - (a.revenue || 0));

              // Remove Account and Campaign, add combined
              delete breakdowns['Account'];
              delete breakdowns['Campaign'];
              breakdowns['Campaign'] = combinedArray;

              // Update channel data
              transformedPivotData.channels[channel] = {
                ...channelData,
                breakdowns,
              };

              // Also transform monthlyBreakdowns if they exist
              if (channelData.monthlyBreakdowns) {
                const monthlyBreakdowns = { ...channelData.monthlyBreakdowns };
                Object.keys(monthlyBreakdowns).forEach((monthKey) => {
                  const monthBreakdowns = { ...monthlyBreakdowns[monthKey] };
                  const monthAccount = monthBreakdowns['Account'];
                  const monthCampaign = monthBreakdowns['Campaign'];

                  if (monthAccount && monthCampaign) {
                    // Combine monthly breakdowns using same logic
                    const combinedMonthlyMap = new Map<string, BreakdownRow>();
                    
                    monthAccount.forEach((accountRow) => {
                      const accountValue = accountRow.account || accountRow.name || accountRow['Account'] || 'Unknown Account';
                      
                      // Use campaign metrics (more granular and accurate)
                      monthCampaign.forEach((campaignRow) => {
                        const campaignValue = campaignRow.campaign || campaignRow.name || campaignRow['Campaign'] || 'Unknown Campaign';
                        const combinedKey = `${accountValue} > ${campaignValue}`;
                        
                        combinedMonthlyMap.set(combinedKey, {
                          name: combinedKey,
                          account: accountValue,
                          campaign: campaignValue,
                          impressions: campaignRow.impressions || 0,
                          clicks: campaignRow.clicks || 0,
                          cost: campaignRow.cost || 0,
                          revenue: campaignRow.revenue || 0,
                          bookings: campaignRow.bookings || 0,
                        });
                      });
                    });

                    delete monthBreakdowns['Account'];
                    delete monthBreakdowns['Campaign'];
                    monthBreakdowns['Campaign'] = Array.from(combinedMonthlyMap.values()).sort(
                      (a, b) => (b.revenue || 0) - (a.revenue || 0)
                    );

                    monthlyBreakdowns[monthKey] = monthBreakdowns;
                  }
                });

                transformedPivotData.channels[channel] = {
                  ...transformedPivotData.channels[channel],
                  monthlyBreakdowns,
                };
              }
            }
          });

          return transformedPivotData;
        }, [slideReport?.pivot_data])}
        lastRefreshedAt={slideReport?.last_refreshed_at}
        configuration={slideReport?.configuration as SlideReportConfiguration | null}
        reportIds={slideReport?.report_ids as Record<string, string> | null}
        slideReportId={slideReportId}
      />

      {/* Share Modal */}
      <ShareModal
        reportId={slideReportId || ""}
        reportName="Master Report"
        open={isShareModalOpen}
        onOpenChange={setIsShareModalOpen}
        accountId={accountId}
      />

      <div className="p-6 space-y-6">
        {/* Filters Row */}
        <div className="flex items-end justify-end gap-6">
          {/* Channel Filter Dropdowns - Show when on channel tabs */}
          {selectedTab !== "overview" && selectedTab !== "budget" && (() => {
            const currentChannel = selectedTab as 'metasearch' | 'sem' | 'social';
            const savedFilterConfigs = slideReport?.configuration?.filterConfigs?.[currentChannel];
            const localFilterConfig = filterConfigs?.[currentChannel];
            const filterDimIds = savedFilterConfigs?.filterDimensionIds || localFilterConfig?.filterDimensionIds || [];
            
            if (filterDimIds.length === 0) return null;
            
            return (
              <div className="flex items-center gap-6">
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
                      onOpenChange={async (open) => {
                        if (open) {
                          // Initialize pending values with current selection when opening
                          setPendingFilterValues(prev => ({
                            ...prev,
                            [currentChannel]: {
                              ...prev[currentChannel],
                              [filterDimId]: selectedFilterValues,
                            },
                          }));
                          
                          // If values aren't loaded yet, trigger loading immediately
                          if (!hasValues && !filterValuesLoading[currentChannel]?.[filterDimId]) {
                            setFilterValuesLoading(prev => ({
                              ...prev,
                              [currentChannel]: {
                                ...prev[currentChannel],
                                [filterDimId]: true,
                              },
                            }));
                            
                            const values = await loadFilterDimensionValues(currentChannel, filterDimId);
                            if (values.length > 0) {
                              setFilterDimensionValues(prev => ({
                                ...prev,
                                [currentChannel]: {
                                  ...prev[currentChannel],
                                  [filterDimId]: values,
                                },
                              }));
                              
                              // Get dimension name
                              const pivotData = slideReport?.pivot_data as SlideReportPivotData | null;
                              const channelData = pivotData?.channels?.[currentChannel];
                              const dimName = (channelData as any)?.dimensionMap?.[filterDimId] 
                                || dimensions[currentChannel]?.find(d => d.id === filterDimId)?.name
                                || filterDimId;
                              
                              setFilterDimensionNames(prev => ({
                                ...prev,
                                [currentChannel]: {
                                  ...prev[currentChannel],
                                  [filterDimId]: dimName,
                                },
                              }));
                            }
                            
                            setFilterValuesLoading(prev => ({
                              ...prev,
                              [currentChannel]: {
                                ...prev[currentChannel],
                                [filterDimId]: false,
                              },
                            }));
                          }
                        }
                      }}
                    >
                      <PopoverTrigger asChild>
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{filterDimName}:</span>
                          <Button variant="outline" className="h-9 justify-between min-w-[140px] px-4 pt-[20px] pb-[18px]">
                            <span className="truncate">
                              {isAllSelected 
                                ? 'All'
                                : selectedFilterValues.length === 1
                                  ? selectedFilterValues[0]
                                  : `${selectedFilterValues.length} selected`}
                            </span>
                            <ChevronRight className="h-4 w-4 opacity-50 rotate-90 ml-2" />
                          </Button>
                        </div>
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
                              {(() => {
                                const isLoading = filterValuesLoading[currentChannel]?.[filterDimId];
                                
                                if (isLoading) {
                                  return (
                                    <div className="flex items-center justify-center py-8">
                                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
                                      <span className="text-sm text-muted-foreground">Loading values...</span>
                                    </div>
                                  );
                                }
                                
                                return hasValues ? filterValuesList.map(value => {
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
                              );
                              })()}
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
              </div>
            );
          })()}

          {/* Date Filters - Show on all tabs except Budget */}
          {selectedTab !== "budget" && (
            <div className="flex items-center gap-6">
              {/* Year Filter */}
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Year:</span>
                <Select value={selectedYear} onValueChange={setSelectedYear}>
                  <SelectTrigger className="w-[130px] bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Years</SelectItem>
                    <SelectItem value="2024">2024</SelectItem>
                    <SelectItem value="2025">2025</SelectItem>
                    <SelectItem value="2026">2026</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Month Filter */}
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Month:</span>
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                  <SelectTrigger className="w-[140px] bg-background">
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
              </div>
              
              {/* Comparison dropdown */}
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Compare:</span>
                <Select value={comparisonType} onValueChange={setComparisonType}>
                  <SelectTrigger className="w-[160px] bg-background">
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

              {/* Show skeletons when loading - only show if we don't have pivot_data yet or actively loading */}
              {(isSlideReportsLoading || (slideReportId && (!slideReport?.pivot_data || isLoadingData))) ? (
                renderKPICardsSkeleton()
              ) : slideReportId && slideReport?.pivot_data && Object.keys(currentTotals).length > 0 && renderKPICards(
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
              {(isSlideReportsLoading || (slideReportId && (isLoadingData || (!slideReport?.pivot_data && isLoadingMonthlyData)))) ? (
                renderChartSkeleton()
              ) : (
                <Card>
                  <CardHeader className="pb-2 flex flex-row items-center justify-between">
                    <CardTitle className="text-base font-medium">Revenue</CardTitle>
                    <Select value={chartTimeRange} onValueChange={(v) => setChartTimeRange(v as typeof chartTimeRange)}>
                      <SelectTrigger className="w-[150px] h-8 text-sm bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover z-50">
                        <SelectItem value="this_year">This Year</SelectItem>
                        <SelectItem value="last_12_months">Last 12 Months</SelectItem>
                        <SelectItem value="last_6_months">Last 6 Months</SelectItem>
                        <SelectItem value="last_3_months">Last 3 Months</SelectItem>
                      </SelectContent>
                    </Select>
                  </CardHeader>
                  <CardContent>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={(() => {
                        // Get all available monthly data
                        const pivotData = slideReport?.pivot_data as SlideReportPivotData | null;
                        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                                           'July', 'August', 'September', 'October', 'November', 'December'];
                        
                        // Build complete monthly data from pivot_data
                        let allMonthlyData: { year: number; month: string; metasearch: number; sem: number; social: number }[] = [];
                        
                        if (pivotData?.channels) {
                          const monthlyMap = new Map<string, { year: number; month: string; metasearch: number; sem: number; social: number }>();
                          
                          Object.entries(pivotData.channels).forEach(([channel, channelData]) => {
                            if (channelData.monthly) {
                              Object.entries(channelData.monthly).forEach(([monthKey, metrics]) => {
                                const [year, monthNum] = monthKey.split('-').map(Number);
                                const month = MONTH_NAMES[monthNum - 1];
                                const key = `${year}-${month}`;
                                
                                if (!monthlyMap.has(key)) {
                                  monthlyMap.set(key, { year, month, metasearch: 0, sem: 0, social: 0 });
                                }
                                
                                const entry = monthlyMap.get(key)!;
                                entry[channel as 'metasearch' | 'sem' | 'social'] = metrics.revenue || 0;
                              });
                            }
                          });
                          
                          allMonthlyData = Array.from(monthlyMap.values()).sort((a, b) => {
                            if (a.year !== b.year) return a.year - b.year;
                            return MONTH_NAMES.indexOf(a.month) - MONTH_NAMES.indexOf(b.month);
                          });
                        }
                        
                        // Apply time range filter
                        const now = new Date();
                        let filteredData = allMonthlyData;
                        
                        if (chartTimeRange === 'this_year') {
                          const currentYear = now.getFullYear();
                          filteredData = allMonthlyData.filter(m => m.year === currentYear);
                        } else if (chartTimeRange === 'last_12_months') {
                          const cutoffDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
                          filteredData = allMonthlyData.filter(m => {
                            const monthIndex = monthNames.indexOf(m.month);
                            const monthDate = new Date(m.year, monthIndex, 1);
                            return monthDate >= cutoffDate;
                          });
                        } else if (chartTimeRange === 'last_6_months') {
                          const cutoffDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
                          filteredData = allMonthlyData.filter(m => {
                            const monthIndex = monthNames.indexOf(m.month);
                            const monthDate = new Date(m.year, monthIndex, 1);
                            return monthDate >= cutoffDate;
                          });
                        } else if (chartTimeRange === 'last_3_months') {
                          const cutoffDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
                          filteredData = allMonthlyData.filter(m => {
                            const monthIndex = monthNames.indexOf(m.month);
                            const monthDate = new Date(m.year, monthIndex, 1);
                            return monthDate >= cutoffDate;
                          });
                        }
                        
                        // Ensure at least 6 months of data for meaningful chart display
                        filteredData = ensureMinimumChartData(filteredData, allMonthlyData, 6);
                        
                        return filteredData.map(m => ({ 
                          label: `${m.month.slice(0,3)} ${m.year.toString().slice(-2)}`,
                          month: m.month,
                          year: m.year,
                          total: m.metasearch + m.social + m.sem 
                        }));
                      })()}>
                        <defs>
                          <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} interval={0} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(value) => `${(value / 1000).toFixed(0)}`} />
                        <Tooltip 
                          formatter={(value: number) => [`$${value.toLocaleString()}`, "Revenue"]}
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                        />
                        <Area 
                          type="monotone" 
                          dataKey="total" 
                          stroke="#8b5cf6" 
                          strokeWidth={2}
                          fill="url(#revenueGradient)" 
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
              )}

              {/* Report Breakdown Table */}
              {(isSlideReportsLoading || (slideReportId && (isLoadingData || (!slideReport?.pivot_data && isLoadingMonthlyData)))) ? (
                renderTableSkeleton()
              ) : (
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
                        // Use monthly data from database (same source as SlideDataBrowser) for accurate data
                        const channels = ['metasearch', 'sem', 'social'];
                        const rows = channels.map(channel => {
                          // Use monthlyDataTotals which comes from slide_report_monthly_data table
                          const data = monthlyDataTotals[channel] || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 };
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
                                <TableCell className="text-right">{formatNumber(row.cost, 'currency')}</TableCell>
                                <TableCell className="text-right">{formatNumber(row.revenue, 'currency')}</TableCell>
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
                              <TableCell className="text-right">{formatNumber(totalDerived.cost, 'currency')}</TableCell>
                              <TableCell className="text-right">{formatNumber(totalDerived.revenue, 'currency')}</TableCell>
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
              )}
            </TabsContent>

            {/* Metasearch Tab */}
            <TabsContent value="metasearch" className="space-y-6">
              {isSlideReportsLoading || (slideReportId && (!slideReport?.pivot_data || isLoadingData)) ? (
                renderKPICardsSkeleton()
              ) : (
                <>
                  {(() => {
                    // Log filter usage for debugging
                    const channel = 'metasearch';
                    const activeFilters = filterValues[channel] || {};
                    // Use saved configuration from slideReport
                    const savedFilterConfigs = slideReport?.configuration?.filterConfigs?.[channel];
                    const savedBreakdownConfigs = slideReport?.configuration?.breakdownConfigs?.[channel];
                    const filterConfigsForChannel = savedFilterConfigs?.filterDimensionIds || filterConfigs[channel]?.filterDimensionIds || [];
                    const breakdownConfigsForChannel = savedBreakdownConfigs?.breakdownDimensionIds || breakdownConfigs[channel]?.breakdownDimensionIds || [];

                    return null;
                  })()}
                  {renderKPICards(getReportKPICards(breakdownTotals.metasearch || currentTotals.metasearch || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 }), getChannelComparisonMetrics('metasearch'))}
              
              {/* Monthly Revenue Chart */}
              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-base font-medium">Revenue</CardTitle>
                  <Select value={chartTimeRange} onValueChange={(v) => setChartTimeRange(v as typeof chartTimeRange)}>
                    <SelectTrigger className="w-[150px] h-8 text-sm bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      <SelectItem value="this_year">This Year</SelectItem>
                      <SelectItem value="last_12_months">Last 12 Months</SelectItem>
                      <SelectItem value="last_6_months">Last 6 Months</SelectItem>
                      <SelectItem value="last_3_months">Last 3 Months</SelectItem>
                    </SelectContent>
                  </Select>
                </CardHeader>
                <CardContent>
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={(() => {
                        const pivotData = slideReport?.pivot_data as SlideReportPivotData | null;
                        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                                           'July', 'August', 'September', 'October', 'November', 'December'];
                        
                        let allMonthlyData: { year: number; month: string; revenue: number }[] = [];
                        
                        if (pivotData?.channels?.metasearch?.monthly) {
                          Object.entries(pivotData.channels.metasearch.monthly).forEach(([monthKey, metrics]) => {
                            const [year, monthNum] = monthKey.split('-').map(Number);
                            const month = MONTH_NAMES[monthNum - 1];
                            allMonthlyData.push({ year, month, revenue: metrics.revenue || 0 });
                          });
                          allMonthlyData.sort((a, b) => a.year !== b.year ? a.year - b.year : monthNames.indexOf(a.month) - monthNames.indexOf(b.month));
                        }
                        
                        const now = new Date();
                        let filteredData = allMonthlyData;
                        
                        if (chartTimeRange === 'this_year') {
                          filteredData = allMonthlyData.filter(m => m.year === now.getFullYear());
                        } else if (chartTimeRange === 'last_12_months') {
                          const cutoffDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
                          filteredData = allMonthlyData.filter(m => new Date(m.year, MONTH_NAMES.indexOf(m.month), 1) >= cutoffDate);
                        } else if (chartTimeRange === 'last_6_months') {
                          const cutoffDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
                          filteredData = allMonthlyData.filter(m => new Date(m.year, MONTH_NAMES.indexOf(m.month), 1) >= cutoffDate);
                        } else if (chartTimeRange === 'last_3_months') {
                          const cutoffDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
                          filteredData = allMonthlyData.filter(m => new Date(m.year, MONTH_NAMES.indexOf(m.month), 1) >= cutoffDate);
                        }
                        
                        // Ensure at least 6 months of data for meaningful chart display
                        filteredData = ensureMinimumChartData(filteredData, allMonthlyData, 6);
                        
                        return filteredData.map(m => ({ 
                          month: `${m.month.slice(0,3)} ${m.year.toString().slice(-2)}`,
                          revenue: m.revenue 
                        }));
                      })()}>
                        <defs>
                          <linearGradient id="metasearchGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} interval={0} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(value) => `${(value / 1000).toFixed(0)}`} />
                        <Tooltip 
                          formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                        />
                        <Area type="monotone" dataKey="revenue" stroke="#8b5cf6" strokeWidth={2} fill="url(#metasearchGradient)" />
                      </AreaChart>
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
                        filterValues={filterValues}
                        filterDimensionValues={filterDimensionValues}
                        onTotalsChange={(totals) => setBreakdownTotals(prev => ({ ...prev, metasearch: totals }))}
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
                </>
              )}
            </TabsContent>

            {/* SEM Tab */}
            <TabsContent value="sem" className="space-y-6">
              {isSlideReportsLoading || (slideReportId && (!slideReport?.pivot_data || isLoadingData)) ? (
                renderKPICardsSkeleton()
              ) : (
                <>
                  {renderKPICards(getReportKPICards(breakdownTotals.sem || currentTotals.sem || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 }), getChannelComparisonMetrics('sem'))}
                  
                  {/* Monthly Revenue Chart */}
              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-base font-medium">Revenue</CardTitle>
                  <Select value={chartTimeRange} onValueChange={(v) => setChartTimeRange(v as typeof chartTimeRange)}>
                    <SelectTrigger className="w-[150px] h-8 text-sm bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      <SelectItem value="this_year">This Year</SelectItem>
                      <SelectItem value="last_12_months">Last 12 Months</SelectItem>
                      <SelectItem value="last_6_months">Last 6 Months</SelectItem>
                      <SelectItem value="last_3_months">Last 3 Months</SelectItem>
                    </SelectContent>
                  </Select>
                </CardHeader>
                <CardContent>
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={(() => {
                        const pivotData = slideReport?.pivot_data as SlideReportPivotData | null;
                        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                                           'July', 'August', 'September', 'October', 'November', 'December'];
                        
                        let allMonthlyData: { year: number; month: string; revenue: number }[] = [];
                        
                        if (pivotData?.channels?.sem?.monthly) {
                          Object.entries(pivotData.channels.sem.monthly).forEach(([monthKey, metrics]) => {
                            const [year, monthNum] = monthKey.split('-').map(Number);
                            const month = MONTH_NAMES[monthNum - 1];
                            allMonthlyData.push({ year, month, revenue: metrics.revenue || 0 });
                          });
                          allMonthlyData.sort((a, b) => a.year !== b.year ? a.year - b.year : monthNames.indexOf(a.month) - monthNames.indexOf(b.month));
                        }
                        
                        const now = new Date();
                        let filteredData = allMonthlyData;
                        
                        if (chartTimeRange === 'this_year') {
                          filteredData = allMonthlyData.filter(m => m.year === now.getFullYear());
                        } else if (chartTimeRange === 'last_12_months') {
                          const cutoffDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
                          filteredData = allMonthlyData.filter(m => new Date(m.year, MONTH_NAMES.indexOf(m.month), 1) >= cutoffDate);
                        } else if (chartTimeRange === 'last_6_months') {
                          const cutoffDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
                          filteredData = allMonthlyData.filter(m => new Date(m.year, MONTH_NAMES.indexOf(m.month), 1) >= cutoffDate);
                        } else if (chartTimeRange === 'last_3_months') {
                          const cutoffDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
                          filteredData = allMonthlyData.filter(m => new Date(m.year, MONTH_NAMES.indexOf(m.month), 1) >= cutoffDate);
                        }
                        
                        // Ensure at least 6 months of data for meaningful chart display
                        filteredData = ensureMinimumChartData(filteredData, allMonthlyData, 6);
                        
                        return filteredData.map(m => ({ 
                          month: `${m.month.slice(0,3)} ${m.year.toString().slice(-2)}`,
                          revenue: m.revenue 
                        }));
                      })()}>
                        <defs>
                          <linearGradient id="semGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} interval={0} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(value) => `${(value / 1000).toFixed(0)}`} />
                        <Tooltip 
                          formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                        />
                        <Area type="monotone" dataKey="revenue" stroke="#8b5cf6" strokeWidth={2} fill="url(#semGradient)" />
                      </AreaChart>
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
                    filterValues={filterValues}
                    filterDimensionValues={filterDimensionValues}
                    onTotalsChange={(totals) => setBreakdownTotals(prev => ({ ...prev, sem: totals }))}
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
                </>
              )}
            </TabsContent>

            {/* Social Tab */}
            <TabsContent value="social" className="space-y-6">
              {isSlideReportsLoading || (slideReportId && (!slideReport?.pivot_data || isLoadingData)) ? (
                renderKPICardsSkeleton()
              ) : (
                <>
                  {renderKPICards(getReportKPICards(breakdownTotals.social || currentTotals.social || { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0 }), getChannelComparisonMetrics('social'))}
                  
                  {/* Monthly Revenue Chart */}
              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-base font-medium">Revenue</CardTitle>
                  <Select value={chartTimeRange} onValueChange={(v) => setChartTimeRange(v as typeof chartTimeRange)}>
                    <SelectTrigger className="w-[150px] h-8 text-sm bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      <SelectItem value="this_year">This Year</SelectItem>
                      <SelectItem value="last_12_months">Last 12 Months</SelectItem>
                      <SelectItem value="last_6_months">Last 6 Months</SelectItem>
                      <SelectItem value="last_3_months">Last 3 Months</SelectItem>
                    </SelectContent>
                  </Select>
                </CardHeader>
                <CardContent>
                  <div className="h-[200px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={(() => {
                        const pivotData = slideReport?.pivot_data as SlideReportPivotData | null;
                        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                                           'July', 'August', 'September', 'October', 'November', 'December'];
                        
                        let allMonthlyData: { year: number; month: string; revenue: number }[] = [];
                        
                        if (pivotData?.channels?.social?.monthly) {
                          Object.entries(pivotData.channels.social.monthly).forEach(([monthKey, metrics]) => {
                            const [year, monthNum] = monthKey.split('-').map(Number);
                            const month = MONTH_NAMES[monthNum - 1];
                            allMonthlyData.push({ year, month, revenue: metrics.revenue || 0 });
                          });
                          allMonthlyData.sort((a, b) => a.year !== b.year ? a.year - b.year : monthNames.indexOf(a.month) - monthNames.indexOf(b.month));
                        }
                        
                        const now = new Date();
                        let filteredData = allMonthlyData;
                        
                        if (chartTimeRange === 'this_year') {
                          filteredData = allMonthlyData.filter(m => m.year === now.getFullYear());
                        } else if (chartTimeRange === 'last_12_months') {
                          const cutoffDate = new Date(now.getFullYear(), now.getMonth() - 11, 1);
                          filteredData = allMonthlyData.filter(m => new Date(m.year, MONTH_NAMES.indexOf(m.month), 1) >= cutoffDate);
                        } else if (chartTimeRange === 'last_6_months') {
                          const cutoffDate = new Date(now.getFullYear(), now.getMonth() - 5, 1);
                          filteredData = allMonthlyData.filter(m => new Date(m.year, MONTH_NAMES.indexOf(m.month), 1) >= cutoffDate);
                        } else if (chartTimeRange === 'last_3_months') {
                          const cutoffDate = new Date(now.getFullYear(), now.getMonth() - 2, 1);
                          filteredData = allMonthlyData.filter(m => new Date(m.year, MONTH_NAMES.indexOf(m.month), 1) >= cutoffDate);
                        }
                        
                        // Ensure at least 6 months of data for meaningful chart display
                        filteredData = ensureMinimumChartData(filteredData, allMonthlyData, 6);
                        
                        return filteredData.map(m => ({ 
                          month: `${m.month.slice(0,3)} ${m.year.toString().slice(-2)}`,
                          revenue: m.revenue 
                        }));
                      })()}>
                        <defs>
                          <linearGradient id="socialGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0.05}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} interval={0} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(value) => `${(value / 1000).toFixed(0)}`} />
                        <Tooltip 
                          formatter={(value: number) => [`$${value.toLocaleString()}`, 'Revenue']}
                          contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                        />
                        <Area type="monotone" dataKey="revenue" stroke="#8b5cf6" strokeWidth={2} fill="url(#socialGradient)" />
                      </AreaChart>
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
                    filterValues={filterValues}
                    filterDimensionValues={filterDimensionValues}
                    onTotalsChange={(totals) => setBreakdownTotals(prev => ({ ...prev, social: totals }))}
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
                </>
              )}
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
                      <ComposedChart data={budgetData}>
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
                          <ComposedChart data={filteredMonthlyData}>
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
                          {budgetMonthlyData.map((row) => {
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
                          <ComposedChart data={filteredMonthlyData.map(m => ({ month: m.month, revenue: m.metasearch }))}>
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
                          {budgetMonthlyData.map((row) => {
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
                          <ComposedChart data={filteredMonthlyData.map(m => ({ month: m.month, revenue: m.sem }))}>
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
                          {budgetMonthlyData.map((row) => {
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
                          <ComposedChart data={filteredMonthlyData.map(m => ({ month: m.month, revenue: m.social }))}>
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
                          {budgetMonthlyData.map((row) => {
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