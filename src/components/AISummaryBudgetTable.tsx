import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { getUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Loader2, RefreshCw, Edit2, Check, X } from "lucide-react";
import { toast } from "sonner";
import { fetchSourceData } from "@/hooks/dataSources/useSourceData";
import { cn } from "@/lib/utils";

interface DataSource {
  id: string;
  report_id: string;
  name: string;
  source_type: "google_sheets" | "csv_url";
  spreadsheet_id: string | null;
  google_sheets_url: string | null;
  csv_url: string | null;
  tab_name: string | null;
  header_row: number;
  column_mappings: any[] | null;
}

interface BudgetData {
  month: string;
  monthLabel: string;
  budget: number;
  cost: number;
  difference: number;
  revenue: number;
  roas: number;
  costOfSale: number;
}

interface AISummaryBudgetTableProps {
  aiSummaryCardId: string;
  reportId: string;
  reportName: string;
  accountId?: string;
  reportConfigs?: Record<string, any>;
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
}: AISummaryBudgetTableProps) {
  const currentYear = new Date().getFullYear();
  const [budgetData, setBudgetData] = useState<BudgetData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editingMonth, setEditingMonth] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savedBudgets, setSavedBudgets] = useState<Record<string, number>>({});

  // Fetch budgets from database
  const fetchBudgets = async () => {
    try {
      const { user } = await getUser();
      if (!user) return {};

      const { data, error } = await supabase
        .from("ai_summary_budgets")
        .select("*")
        .eq("ai_summary_card_id", aiSummaryCardId)
        .eq("report_id", reportId);

      if (error) {
        console.error("Error fetching budgets:", error);
        return {};
      }

      const budgetMap: Record<string, number> = {};
      (data || []).forEach((b: any) => {
        budgetMap[b.month_key] = Number(b.budget_amount);
      });
      return budgetMap;
    } catch (err) {
      console.error("Error fetching budgets:", err);
      return {};
    }
  };

  // Fetch metrics data from source
  const fetchMetricsData = async () => {
    try {
      const { user } = await getUser();
      if (!user) return {};

      // Fetch data source for this report
      const { data: dsData } = await supabase
        .from("data_sources")
        .select("*")
        .eq("report_id", reportId)
        .limit(1)
        .maybeSingle();

      if (!dsData) return {};

      const sourceData = await fetchSourceData(dsData as DataSource, user.id, accountId);
      if (!sourceData?.transformedRows) return {};

      // Build metric name to ID mapping
      const columnMappings = Array.isArray(dsData.column_mappings) ? dsData.column_mappings : [];
      const metricNameToIdMap: Record<string, string> = {};
      const dimIdToColumnHeader: Record<string, string> = {};
      columnMappings.forEach((m: any) => {
        if (m.dimensionName && m.dimensionId && m.dimensionId !== "none") {
          metricNameToIdMap[m.dimensionName] = m.dimensionId;
        }
        if (m.dimensionId && m.dimensionId !== "none" && m.columnHeader) {
          dimIdToColumnHeader[m.dimensionId] = m.columnHeader;
        }
      });

      // Get dimension filter config for this report
      const filterConfig = reportConfigs?.[reportId];
      let dimensionFilter: { dimensionId: string; dimensionName?: string; values: string[] } | undefined;

      if (filterConfig?.dimensionId && filterConfig.selectedValues?.length > 0) {
        // Fetch dimension name
        const { data: dimData } = await supabase
          .from("dimensions")
          .select("name")
          .eq("id", filterConfig.dimensionId)
          .maybeSingle();

        dimensionFilter = {
          dimensionId: filterConfig.dimensionId,
          dimensionName: dimData?.name,
          values: filterConfig.selectedValues,
        };
      }

      // Helper to get dimension value from row data
      const getDimensionValue = (rowData: any, dimId: string, dimName?: string): string | undefined => {
        // Try dimension ID first
        if (rowData[dimId] !== undefined && rowData[dimId] !== null && rowData[dimId] !== '') {
          return String(rowData[dimId]);
        }
        // Try dimension name
        if (dimName && rowData[dimName] !== undefined && rowData[dimName] !== null && rowData[dimName] !== '') {
          return String(rowData[dimName]);
        }
        // Try column header from mappings
        const columnHeader = dimIdToColumnHeader[dimId];
        if (columnHeader && rowData[columnHeader] !== undefined && rowData[columnHeader] !== null && rowData[columnHeader] !== '') {
          return String(rowData[columnHeader]);
        }
        return undefined;
      };

      // Aggregate metrics by month
      const monthlyMetrics: Record<string, { cost: number; revenue: number }> = {};

      sourceData.transformedRows.forEach((row: any) => {
        const rowData = row.dimension_values || row;

        // Apply dimension filter if configured
        if (dimensionFilter) {
          const filterValue = getDimensionValue(rowData, dimensionFilter.dimensionId, dimensionFilter.dimensionName);
          if (!filterValue || !dimensionFilter.values.includes(filterValue)) {
            return; // Skip this row - doesn't match filter
          }
        }

        // Find date value
        let dateValue = rowData.Date || rowData.date || rowData.Day || rowData.day;
        if (!dateValue) {
          for (const [key, val] of Object.entries(rowData)) {
            if (typeof val === "string" && val.match(/^\d{4}-\d{2}-\d{2}/)) {
              dateValue = val as string;
              break;
            }
          }
        }

        if (!dateValue) return;

        const date = new Date(dateValue);
        if (isNaN(date.getTime())) return;

        // Only include current year data
        if (date.getFullYear() !== currentYear) return;

        const monthKey = `${currentYear}-${String(date.getMonth() + 1).padStart(2, "0")}`;

        if (!monthlyMetrics[monthKey]) {
          monthlyMetrics[monthKey] = { cost: 0, revenue: 0 };
        }

        // Get Cost
        const costId = metricNameToIdMap["Cost"];
        const costValue = parseFloat(rowData[costId] || rowData["Cost"] || rowData["cost"] || 0);
        if (!isNaN(costValue)) {
          monthlyMetrics[monthKey].cost += costValue;
        }

        // Get Revenue
        const revenueId = metricNameToIdMap["Revenue"];
        const revenueValue = parseFloat(
          rowData[revenueId] || rowData["Revenue"] || rowData["revenue"] || 0
        );
        if (!isNaN(revenueValue)) {
          monthlyMetrics[monthKey].revenue += revenueValue;
        }
      });

      return monthlyMetrics;
    } catch (err) {
      console.error("Error fetching metrics:", err);
      return {};
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [budgets, metrics] = await Promise.all([fetchBudgets(), fetchMetricsData()]);
      setSavedBudgets(budgets);

      const data: BudgetData[] = MONTHS.map((m) => {
        const monthKey = `${currentYear}-${m.key}`;
        const budget = budgets[monthKey] || 0;
        const cost = metrics[monthKey]?.cost || 0;
        const revenue = metrics[monthKey]?.revenue || 0;
        const difference = budget - cost;
        const roas = cost > 0 ? revenue / cost : 0;
        const costOfSale = revenue > 0 ? (cost / revenue) * 100 : 0;

        return {
          month: monthKey,
          monthLabel: m.label,
          budget,
          cost,
          difference,
          revenue,
          roas,
          costOfSale,
        };
      });

      setBudgetData(data);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshMetrics = async () => {
    setIsRefreshing(true);
    try {
      const metrics = await fetchMetricsData();

      setBudgetData((prev) =>
        prev.map((row) => {
          const cost = metrics[row.month]?.cost || 0;
          const revenue = metrics[row.month]?.revenue || 0;
          const difference = row.budget - cost;
          const roas = cost > 0 ? revenue / cost : 0;
          const costOfSale = revenue > 0 ? (cost / revenue) * 100 : 0;

          return {
            ...row,
            cost,
            revenue,
            difference,
            roas,
            costOfSale,
          };
        })
      );

      toast.success("Metrics refreshed");
    } catch (err) {
      toast.error("Failed to refresh metrics");
    } finally {
      setIsRefreshing(false);
    }
  };

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{reportName}</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={refreshMetrics}
          disabled={isRefreshing}
        >
          {isRefreshing ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refresh Data
        </Button>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-[140px]">Date</TableHead>
              <TableHead className="text-right">Budget</TableHead>
              <TableHead className="text-right">Costs</TableHead>
              <TableHead className="text-right">Difference</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead className="text-right">ROAS</TableHead>
              <TableHead className="text-right">Cost of Sale</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {budgetData.map((row, index) => (
              <TableRow key={row.month} className={index % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                <TableCell className="font-medium">{row.monthLabel}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span>{formatCurrency(row.budget)}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => handleSetBudget(row.month, row.budget)}
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell className="text-right">{formatCurrency(row.cost)}</TableCell>
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
