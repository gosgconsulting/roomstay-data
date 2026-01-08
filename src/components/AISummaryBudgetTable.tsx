import React, { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Edit2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  useAISummaryBudgets,
  useAISummaryBudgetMetrics,
  useAISummaryForecasts,
  aiSummaryKeys,
} from "@/hooks/useAISummaryData";

interface BudgetData {
  month: string;
  monthLabel: string;
  budget: number;
  cost: number;
  clicks: number;
  cpc: number;
  difference: number;
  revenue: number;
  roas: number;
  costOfSale: number;
  // Forecast-specific fields
  totalRevenue?: number;
  revenueShare?: number;
  estRevenue?: number;
  estRevenueShare?: number;
}

interface CachedBudgetMetrics {
  [reportKey: string]: {
    [monthKey: string]: {
      cost: number;
      revenue: number;
      clicks?: number;
    };
  };
}

interface ForecastRow {
  id: string;
  name: string;
  rooms: number;
  occupancy_rate: number;
  daily_rate: number;
}

interface AISummaryBudgetTableProps {
  aiSummaryCardId: string;
  reportId: string;
  reportName: string;
  accountId?: string;
  reportConfigs?: Record<string, any>;
  allReportIds?: string[];
  isOverview?: boolean;
  forecastEnabled?: boolean;
  onForecastEnabledChange?: (enabled: boolean) => void;
  selectedYear?: number;
}

// All months of the year
const MONTHS = [
  { key: "01", label: "January" },
  { key: "02", label: "February" },
  { key: "03", label: "March" },
  { key: "04", label: "April" },
  { key: "05", label: "May" },
  { key: "06", label: "June" },
  { key: "07", label: "July" },
  { key: "08", label: "August" },
  { key: "09", label: "September" },
  { key: "10", label: "October" },
  { key: "11", label: "November" },
  { key: "12", label: "December" },
];

export function AISummaryBudgetTable({
  aiSummaryCardId,
  reportId,
  reportName,
  accountId,
  reportConfigs,
  allReportIds,
  isOverview = false,
  forecastEnabled: externalForecastEnabled,
  onForecastEnabledChange,
  selectedYear,
}: AISummaryBudgetTableProps) {
  const currentYear = selectedYear ?? new Date().getFullYear();
  const queryClient = useQueryClient();
  
  const [editingMonth, setEditingMonth] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  
  // Forecast mode state - use external if provided, otherwise local
  const [localForecastEnabled, setLocalForecastEnabled] = useState(false);
  const forecastEnabled = externalForecastEnabled !== undefined ? externalForecastEnabled : localForecastEnabled;
  const setForecastEnabled = onForecastEnabledChange || setLocalForecastEnabled;

  // Use React Query hooks for data fetching with caching
  const reportIdsToFetch = isOverview && allReportIds ? allReportIds : [reportId];
  
  const { data: budgetsData = {}, isLoading: isLoadingBudgets } = useAISummaryBudgets(
    aiSummaryCardId,
    reportIdsToFetch,
    { enabled: !!aiSummaryCardId }
  );
  
  const { data: cachedMetrics, isLoading: isLoadingMetrics } = useAISummaryBudgetMetrics(
    aiSummaryCardId,
    { enabled: !!aiSummaryCardId }
  );
  
  const { data: forecastRows = [], isLoading: isLoadingForecasts } = useAISummaryForecasts(
    aiSummaryCardId,
    { enabled: !!aiSummaryCardId }
  );

  const isLoading = isLoadingBudgets || isLoadingMetrics || isLoadingForecasts;

  // Process cached metrics for this view
  const processedMetrics = useMemo(() => {
    if (!cachedMetrics) return {};
    
    if (isOverview && allReportIds) {
      const aggregated: Record<string, { cost: number; revenue: number; clicks?: number }> = {};
      allReportIds.forEach((rid) => {
        const reportData = cachedMetrics[rid];
        if (reportData) {
          Object.entries(reportData).forEach(([monthKey, metrics]) => {
            if (!aggregated[monthKey]) {
              aggregated[monthKey] = { cost: 0, revenue: 0, clicks: 0 };
            }
            aggregated[monthKey].cost += metrics.cost || 0;
            aggregated[monthKey].revenue += metrics.revenue || 0;
            aggregated[monthKey].clicks = (aggregated[monthKey].clicks || 0) + (metrics.clicks || 0);
          });
        }
      });
      return aggregated;
    }
    
    return cachedMetrics[reportId] || {};
  }, [cachedMetrics, isOverview, allReportIds, reportId]);

  // Build budget data using memoization instead of useEffect
  const budgetData = useMemo(() => {
    return MONTHS.map((m, index) => {
      const monthKey = `${currentYear}-${m.key}`;
      
      // Get budget for this specific report or aggregate for overview
      let budget = 0;
      if (isOverview && allReportIds) {
        // Aggregate budgets from all reports for overview
        allReportIds.forEach(rid => {
          budget += budgetsData[rid]?.[monthKey] || 0;
        });
      } else {
        // Get budget for this specific report
        budget = budgetsData[reportId]?.[monthKey] || 0;
      }
      
      const cost = processedMetrics[monthKey]?.cost || 0;
      const clicks = processedMetrics[monthKey]?.clicks || 0;
      const cpc = clicks > 0 ? cost / clicks : 0;
      const revenue = processedMetrics[monthKey]?.revenue || 0;
      const difference = budget - cost;
      const roas = cost > 0 ? revenue / cost : 0;
      const costOfSale = revenue > 0 ? (cost / revenue) * 100 : 0;

      let totalRevenue: number | undefined;
      let revenueShare: number | undefined;
      let estRevenue: number | undefined;
      let estRevenueShare: number | undefined;

      if (forecastRows.length > 0) {
        const daysInMonth = new Date(currentYear, index + 1, 0).getDate();
        totalRevenue = forecastRows.reduce((total, row) => {
          return total + row.rooms * (row.occupancy_rate / 100) * row.daily_rate * daysInMonth;
        }, 0);
        revenueShare = totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0;
        const avgRoas = cost > 0 ? revenue / cost : 1;
        estRevenue = budget * avgRoas;
        estRevenueShare = totalRevenue > 0 ? (estRevenue / totalRevenue) * 100 : 0;
      }

      return {
        month: monthKey,
        monthLabel: m.label,
        budget,
        cost,
        clicks,
        cpc,
        difference,
        revenue,
        roas,
        costOfSale,
        totalRevenue,
        revenueShare,
        estRevenue,
        estRevenueShare,
      };
    });
  }, [currentYear, budgetsData, processedMetrics, forecastRows, isOverview, allReportIds, reportId]);

  const handleSetBudget = (monthKey: string, currentBudget: number) => {
    setEditingMonth(monthKey);
    setEditValue(currentBudget.toString());
  };

  const handleSaveBudget = async () => {
    if (!editingMonth) return;

    const newBudget = parseFloat(editValue) || 0;

    try {
      const { user } = await getUser();
      if (!user) {
        toast.error("You must be logged in");
        return;
      }

      const { error } = await supabase.from("ai_summary_budgets").upsert(
        {
          user_id: user.id,
          account_id: accountId || null,
          ai_summary_card_id: aiSummaryCardId,
          report_id: reportId,
          month_key: editingMonth,
          budget_amount: newBudget,
        },
        {
          onConflict: "ai_summary_card_id,report_id,month_key",
        }
      );

      if (error) {
        console.error("Error saving budget:", error);
        toast.error("Failed to save budget");
        return;
      }

      // Invalidate cache to refetch
      queryClient.invalidateQueries({ queryKey: aiSummaryKeys.budgets(aiSummaryCardId) });

      toast.success("Budget saved");
      setEditingMonth(null);
    } catch (err) {
      toast.error("Failed to save budget");
    }
  };

  const handleCancelEdit = () => {
    setEditingMonth(null);
    setEditValue("");
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Check if forecast is available
  const hasForecastData = forecastRows.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{reportName}</h3>
        
        {/* Forecast toggle - show on all tabs if forecast data exists */}
        {hasForecastData && (
          <div className="flex items-center gap-2">
            <Switch
              id="forecast-toggle"
              checked={forecastEnabled}
              onCheckedChange={setForecastEnabled}
            />
            <Label htmlFor="forecast-toggle" className="text-sm cursor-pointer">
              Forecast Mode
            </Label>
          </div>
        )}
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[120px]">Date</TableHead>
              <TableHead className="text-right">Budget</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              {forecastEnabled && <TableHead className="text-right">CPC</TableHead>}
              {forecastEnabled ? (
                <>
                  <TableHead className="text-right">Total Revenue</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                  <TableHead className="text-right">Est. Revenue</TableHead>
                  <TableHead className="text-right">Est. Share</TableHead>
                </>
              ) : (
                <>
                  <TableHead className="text-right">Difference</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">ROAS</TableHead>
                  <TableHead className="text-right">Cost of Sale</TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {budgetData.map((row, index) => (
              <TableRow key={row.month} className={index % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                <TableCell className="font-medium">{row.monthLabel}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span>{formatCurrency(row.budget)}</span>
                    {!isOverview && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleSetBudget(row.month, row.budget)}
                      >
                        <Edit2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </TableCell>
                <TableCell className="text-right">{formatCurrency(row.cost)}</TableCell>
                {forecastEnabled && <TableCell className="text-right">{formatCurrency(row.cpc)}</TableCell>}
                {forecastEnabled ? (
                  <>
                    <TableCell className="text-right">{formatCurrency(row.totalRevenue || 0)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                    <TableCell className="text-right">{formatPercentage(row.revenueShare || 0)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.estRevenue || 0)}</TableCell>
                    <TableCell className="text-right">{formatPercentage(row.estRevenueShare || 0)}</TableCell>
                  </>
                ) : (
                  <>
                    <TableCell
                      className={cn(
                        "text-right font-medium",
                        row.difference > 0 ? "text-green-600" : row.difference < 0 ? "text-red-600" : ""
                      )}
                    >
                      {formatCurrency(row.difference)}
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(row.revenue)}</TableCell>
                    <TableCell className="text-right">{row.roas.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{formatPercentage(row.costOfSale)}</TableCell>
                  </>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Edit Budget Dialog */}
      <Dialog open={!!editingMonth} onOpenChange={(open) => !open && handleCancelEdit()}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Set Budget</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium mb-2 block">
              Budget for {budgetData.find((d) => d.month === editingMonth)?.monthLabel}
            </label>
            <Input
              type="number"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              placeholder="Enter budget amount"
              className="w-full"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancelEdit}>
              Cancel
            </Button>
            <Button onClick={handleSaveBudget}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AISummaryBudgetTable;