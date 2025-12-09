import React, { useState, useEffect } from "react";
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

// DataSource interface removed - no longer fetching from source directly

interface BudgetData {
  month: string;
  monthLabel: string;
  budget: number;
  cost: number;
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
}: AISummaryBudgetTableProps) {
  const currentYear = new Date().getFullYear();
  const [budgetData, setBudgetData] = useState<BudgetData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [editingMonth, setEditingMonth] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savedBudgets, setSavedBudgets] = useState<Record<string, number>>({});
  
  // Forecast mode state (only for Overview)
  const [forecastEnabled, setForecastEnabled] = useState(false);
  const [forecastRows, setForecastRows] = useState<ForecastRow[]>([]);

  // Fetch budgets from database
  const fetchBudgets = async () => {
    try {
      const { user } = await getUser();
      if (!user) return {};

      // For overview, fetch budgets for all reports
      const reportIdsToFetch = isOverview && allReportIds ? allReportIds : [reportId];
      
      const { data, error } = await supabase
        .from("ai_summary_budgets")
        .select("*")
        .eq("ai_summary_card_id", aiSummaryCardId)
        .in("report_id", reportIdsToFetch);

      if (error) {
        console.error("Error fetching budgets:", error);
        return {};
      }

      // Aggregate budgets by month (sum across all reports for overview)
      const budgetMap: Record<string, number> = {};
      (data || []).forEach((b: any) => {
        const amount = Number(b.budget_amount);
        budgetMap[b.month_key] = (budgetMap[b.month_key] || 0) + amount;
      });
      return budgetMap;
    } catch (err) {
      console.error("Error fetching budgets:", err);
      return {};
    }
  };

  // Fetch cached metrics from database
  const fetchCachedMetrics = async (): Promise<Record<string, { cost: number; revenue: number }> | null> => {
    try {
      const { data, error } = await supabase
        .from("ai_summary_cards")
        .select("cached_budget_data")
        .eq("id", aiSummaryCardId)
        .maybeSingle();

      if (error) {
        console.error("Error fetching cached budget data:", error);
        return null;
      }
      
      if (!data?.cached_budget_data) {
        console.log("No cached_budget_data found for card:", aiSummaryCardId);
        return null;
      }

      const cachedData = data.cached_budget_data as CachedBudgetMetrics;
      
      // For overview, aggregate all report data
      if (isOverview && allReportIds) {
        const aggregated: Record<string, { cost: number; revenue: number }> = {};
        allReportIds.forEach((rid) => {
          const reportData = cachedData[rid];
          if (reportData) {
            Object.entries(reportData).forEach(([monthKey, metrics]) => {
              if (!aggregated[monthKey]) {
                aggregated[monthKey] = { cost: 0, revenue: 0 };
              }
              aggregated[monthKey].cost += metrics.cost || 0;
              aggregated[monthKey].revenue += metrics.revenue || 0;
            });
          }
        });
        return aggregated;
      }

      // For individual report, return that report's data directly using reportId prop
      const reportMetrics = cachedData[reportId];
      if (!reportMetrics) {
        console.log("No cached metrics found for report:", reportId, "Available keys:", Object.keys(cachedData));
        return null;
      }
      
      return reportMetrics;
    } catch (err) {
      console.error("Error fetching cached metrics:", err);
      return null;
    }
  };

  // Save metrics to cache
  const saveCachedMetrics = async (
    metrics: Record<string, { cost: number; revenue: number }>,
    forReportId: string
  ) => {
    try {
      // First fetch existing cache
      const { data: existingData } = await supabase
        .from("ai_summary_cards")
        .select("cached_budget_data")
        .eq("id", aiSummaryCardId)
        .maybeSingle();

      const existingCache = (existingData?.cached_budget_data as CachedBudgetMetrics) || {};
      
      // Update cache for this report
      const updatedCache = {
        ...existingCache,
        [forReportId]: metrics,
      };

      const { error } = await supabase
        .from("ai_summary_cards")
        .update({ cached_budget_data: updatedCache })
        .eq("id", aiSummaryCardId);

      if (error) {
        console.error("Error saving cached metrics:", error);
      }
    } catch (err) {
      console.error("Error saving cached metrics:", err);
    }
  };

  // Fetch forecast rows for this card
  const fetchForecasts = async () => {
    try {
      const { data, error } = await supabase
        .from("ai_summary_forecasts")
        .select("*")
        .eq("ai_summary_card_id", aiSummaryCardId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching forecasts:", error);
        return [];
      }

      return (data || []).map((row: any) => ({
        id: row.id,
        name: row.name,
        rooms: row.rooms,
        occupancy_rate: row.occupancy_rate,
        daily_rate: row.daily_rate,
      }));
    } catch (err) {
      console.error("Error fetching forecasts:", err);
      return [];
    }
  };

  // Calculate monthly total revenue from forecast settings
  const calculateMonthlyTotalRevenue = (monthIndex: number): number => {
    // Get days in month (monthIndex is 0-indexed, but we use 1-indexed for the month)
    const daysInMonth = new Date(currentYear, monthIndex + 1, 0).getDate();
    
    return forecastRows.reduce((total, row) => {
      const revenue = row.rooms * (row.occupancy_rate / 100) * row.daily_rate * daysInMonth;
      return total + revenue;
    }, 0);
  };

  // Build budget data array from metrics
  const buildBudgetData = (
    budgets: Record<string, number>,
    metrics: Record<string, { cost: number; revenue: number }>,
    forecasts: ForecastRow[]
  ): BudgetData[] => {
    return MONTHS.map((m, index) => {
      const monthKey = `${currentYear}-${m.key}`;
      const budget = budgets[monthKey] || 0;
      const cost = metrics[monthKey]?.cost || 0;
      const revenue = metrics[monthKey]?.revenue || 0;
      const difference = budget - cost;
      const roas = cost > 0 ? revenue / cost : 0;
      const costOfSale = revenue > 0 ? (cost / revenue) * 100 : 0;

      // Calculate forecast-specific fields if we have forecast data
      let totalRevenue: number | undefined;
      let revenueShare: number | undefined;
      let estRevenue: number | undefined;
      let estRevenueShare: number | undefined;

      if (forecasts.length > 0) {
        const daysInMonth = new Date(currentYear, index + 1, 0).getDate();
        totalRevenue = forecasts.reduce((total, row) => {
          return total + row.rooms * (row.occupancy_rate / 100) * row.daily_rate * daysInMonth;
        }, 0);
        
        // Revenue Share = actual revenue / total forecasted revenue
        revenueShare = totalRevenue > 0 ? (revenue / totalRevenue) * 100 : 0;
        
        // Est. Revenue = budget * ROAS (estimated revenue based on budget spent)
        // Using average ROAS from actual data if available, otherwise default to 1
        const avgRoas = cost > 0 ? revenue / cost : 1;
        estRevenue = budget * avgRoas;
        
        // Est. Revenue Share = estimated revenue / total forecasted revenue
        estRevenueShare = totalRevenue > 0 ? (estRevenue / totalRevenue) * 100 : 0;
      }

      return {
        month: monthKey,
        monthLabel: m.label,
        budget,
        cost,
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
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Fetch budgets, cached metrics, and forecasts
      const [budgets, cachedMetrics, forecasts] = await Promise.all([
        fetchBudgets(),
        fetchCachedMetrics(),
        isOverview ? fetchForecasts() : Promise.resolve([]),
      ]);
      
      setSavedBudgets(budgets);
      setForecastRows(forecasts);

      // Always use cached data - refresh happens at parent level
      const data = buildBudgetData(budgets, cachedMetrics || {}, forecasts);
      setBudgetData(data);
    } finally {
      setIsLoading(false);
    }
  };

  // Removed refreshMetrics - refresh happens at parent level via handleRefreshPivotData

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

      // Upsert the budget
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

      // Update local state
      setSavedBudgets((prev) => ({ ...prev, [editingMonth]: newBudget }));
      setBudgetData((prev) =>
        prev.map((row) => {
          if (row.month === editingMonth) {
            const difference = newBudget - row.cost;
            return { ...row, budget: newBudget, difference };
          }
          return row;
        })
      );

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

  useEffect(() => {
    loadData();
  }, [aiSummaryCardId, reportId]);

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
        
        {/* Forecast toggle - only show on Overview if forecast data exists */}
        {isOverview && hasForecastData && (
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
              {forecastEnabled && isOverview ? (
                <>
                  <TableHead className="text-right">Total Revenue</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Revenue Share</TableHead>
                  <TableHead className="text-right">Est. Revenue</TableHead>
                  <TableHead className="text-right">Est. Rev. Share</TableHead>
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
                {forecastEnabled && isOverview ? (
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
