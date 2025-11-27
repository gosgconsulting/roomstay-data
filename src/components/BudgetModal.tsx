import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { checkDimensionsHaveData } from "@/lib/dimensionUtils";
import { useUser } from "@/lib/auth";

interface Budget {
  id: string;
  dimension_name: string;
  dimension_item: string;
  // NOTE: modal still uses nested state internally;
  // saving will flatten to YYYY-MM keys.
  budget_data: Record<string, Record<string, number>>;
}

interface BudgetModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budget?: Budget | null;
  reportId?: string | null;
  accountId?: string | null;
  onSuccess?: () => void;
  // NEW: preset context from Budget Tracker cell
  presetDimensionName?: string;
  presetItemName?: string;
  // 'YYYY-MM' format
  presetYearMonth?: string;
  // NEW: initial budget value to avoid fetching from DB
  initialBudgetValue?: number | null;
}

const MONTHS = [
  { value: "1", label: "January" },
  { value: "2", label: "February" },
  { value: "3", label: "March" },
  { value: "4", label: "April" },
  { value: "5", label: "May" },
  { value: "6", label: "June" },
  { value: "7", label: "July" },
  { value: "8", label: "August" },
  { value: "9", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

export const BudgetModal = ({
  open,
  onOpenChange,
  budget,
  reportId,
  accountId,
  onSuccess,
  presetDimensionName,
  presetItemName,
  presetYearMonth,
  initialBudgetValue,
}: BudgetModalProps) => {
  const { toast } = useToast();
  const { data: userData } = useUser();
  const user = userData?.user || null;
  const [isLoading, setIsLoading] = useState(false);
  const [dimensions, setDimensions] = useState<Array<{
    id: string;
    name: string;
    displayName: string;
    accountName: string | null;
    reportName: string | null;
    reportId: string | null;
  }>>([]);
  const [dimensionHasData, setDimensionHasData] = useState<Record<string, boolean>>({});
  const [selectedDimension, setSelectedDimension] = useState<string>("");
  const [dimensionItems, setDimensionItems] = useState<string[]>([]);
  const [selectedItem, setSelectedItem] = useState<string>("");
  const [selectedYear, setSelectedYear] = useState<string>("");
  const [budgetData, setBudgetData] = useState<Record<string, Record<string, number>>>({});

  const currentYear = new Date().getFullYear();
  const availableYears = [
    { value: currentYear.toString(), label: "This year" },
    { value: (currentYear + 1).toString(), label: (currentYear + 1).toString() },
    { value: (currentYear + 2).toString(), label: (currentYear + 2).toString() },
  ];

  // Convert flat { 'YYYY-MM': value } into nested {year: {month: value}}
  const unflattenBudgetData = (flat: Record<string, number>) => {
    const nested: Record<string, Record<string, number>> = {};
    Object.entries(flat).forEach(([key, value]) => {
      const match = key.match(/^(\d{4})-(\d{2})$/);
      if (match) {
        const [, year, month] = match;
        if (!nested[year]) nested[year] = {};
        nested[year][String(parseInt(month, 10))] = value; // Remove leading zero from month
      }
    });
    return nested;
  };

  // Flatten nested {year: {month: value}} into { 'YYYY-MM': value }
  const flattenBudgetData = (nested: Record<string, Record<string, number>>) => {
    const flat: Record<string, number> = {};
    Object.entries(nested).forEach(([year, months]) => {
      Object.entries(months || {}).forEach(([m, v]) => {
        const mm = String(m).padStart(2, "0");
        flat[`${year}-${mm}`] = v;
      });
    });
    return flat;
  };

  // Load dimensions and dimension items
  useEffect(() => {
    if (open && user) {
      loadDimensions();
      if (budget) {
        // Editing existing budget
        setSelectedDimension(budget.dimension_name);
        setSelectedItem(budget.dimension_item);
        // Convert flat format to nested if needed
        const budgetDataRaw = budget.budget_data || {};
        // Check if it's flat format (has 'YYYY-MM' keys) or nested (has year keys with month objects)
        const isFlatFormat = Object.keys(budgetDataRaw).some(k => /^\d{4}-\d{2}$/.test(k));
        const nestedBudgetData = isFlatFormat 
          ? unflattenBudgetData(budgetDataRaw as unknown as Record<string, number>)
          : budgetDataRaw as Record<string, Record<string, number>>;
        setBudgetData(nestedBudgetData);
        const years = Object.keys(nestedBudgetData);
        setSelectedYear(years.length > 0 ? years[0] : currentYear.toString());
      } else {
        // Creating new budget (with presets if provided)
        setSelectedDimension(presetDimensionName || "");
        setSelectedItem(presetItemName || "");
        const presetYear = presetYearMonth?.slice(0, 4);
        setSelectedYear(presetYear || currentYear.toString());
        
        // If initialBudgetValue is provided, use it instead of fetching from DB
        if (presetYearMonth && initialBudgetValue !== undefined && initialBudgetValue !== null) {
          const presetMonth = presetYearMonth.slice(5, 7);
          const monthNum = String(parseInt(presetMonth, 10)); // Remove leading zero
          setBudgetData({
            [presetYear]: {
              [monthNum]: initialBudgetValue,
            },
          });
          console.log("[testing] Using initial budget value:", initialBudgetValue, "for", presetYearMonth);
        } else {
          setBudgetData({});
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, budget, presetDimensionName, presetItemName, presetYearMonth]);

  // Load dimension items when dimension is selected
  useEffect(() => {
    if (open && selectedDimension) {
      if (dimensions.length > 0) {
        // Only load items if dimensions are loaded (needed to find reportId)
        console.log("[testing] Loading items for dimension:", selectedDimension);
        // Only reset selected item if we're changing dimensions (not initial load with preset)
        // Preserve item if editing budget or if preset item matches current dimension
        const shouldPreserveItem = budget?.dimension_item || 
          (presetItemName && presetDimensionName === selectedDimension);
        if (!shouldPreserveItem) {
          setSelectedItem("");
        }
        loadDimensionItems(selectedDimension);
      } else {
        // If dimension is selected but dimensions aren't loaded yet, wait
        // This will be triggered again when dimensions load
        console.log("[testing] Waiting for dimensions to load before loading items");
        setDimensionItems([]);
        // Don't reset item if we have a preset or are editing
        if (!budget?.dimension_item && !presetItemName) {
          setSelectedItem("");
        }
      }
    } else {
      setDimensionItems([]);
      if (!budget?.dimension_item && !presetItemName) {
        setSelectedItem("");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedDimension, reportId, accountId, dimensions]);

  // Load existing budget data when presets are provided and item is selected
  // Skip if initialBudgetValue is provided (data already available)
  useEffect(() => {
    const hasPresets = !!(presetDimensionName && presetItemName && presetYearMonth);
    if (open && hasPresets && selectedDimension && selectedItem && user && !budget && initialBudgetValue === undefined) {
      console.log("[testing] Loading existing budget for presets:", { selectedDimension, selectedItem });
      loadExistingBudget(selectedDimension, selectedItem);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetDimensionName, presetItemName, presetYearMonth, selectedDimension, selectedItem, user, budget, initialBudgetValue]);

  const loadDimensions = async () => {
    try {
      if (!user) return;

      const dimensionsList: Array<{
        id: string;
        name: string;
        displayName: string;
        accountName: string | null;
        reportName: string | null;
        reportId: string | null;
      }> = [];
      const dimensionMap = new Map<string, {
        id: string;
        name: string;
        accountName: string | null;
        reportName: string | null;
        reportId: string | null;
      }>();

      // Load all reports for the account to get account/report context
      let reportsList: Array<{ id: string; name: string; account_id: string | null }> = [];
      if (accountId) {
        const { data: reports } = await supabase
          .from("reports")
          .select("id, name, account_id")
          .eq("account_id", accountId);
        reportsList = reports || [];
      } else if (reportId) {
        const { data: report } = await supabase
          .from("reports")
          .select("id, name, account_id")
          .eq("id", reportId)
          .single();
        if (report) {
          reportsList = [report];
        }
      }

      // Get account name
      let accountName: string | null = null;
      if (accountId) {
        const { data: account } = await supabase
          .from("accounts")
          .select("name")
          .eq("id", accountId)
          .single();
        accountName = account?.name || null;
      }

      // Load dimensions with their report and account context
      let dimensionsData: Array<{
        id: string;
        name: string;
        report_id: string | null;
        account_id: string | null;
        scope: string;
      }> = [];

      // Filter based on accountId or reportId
      if (accountId) {
        const { data: accountDims } = await supabase
          .from("dimensions")
          .select("id, name, report_id, account_id, scope")
          .eq("account_id", accountId);
        
        let allDims = [...(accountDims || [])];
        
        if (reportsList.length > 0) {
          const reportIds = reportsList.map(r => r.id);
          const { data: reportDims } = await supabase
            .from("dimensions")
            .select("id, name, report_id, account_id, scope")
            .in("report_id", reportIds);
          
          allDims = [...allDims, ...(reportDims || [])];
        }

        const uniqueDims = new Map();
        allDims.forEach(dim => {
          if (!uniqueDims.has(dim.id)) {
            uniqueDims.set(dim.id, dim);
          }
        });
        dimensionsData = Array.from(uniqueDims.values());
      } else if (reportId) {
        const { data: reportDims } = await supabase
          .from("dimensions")
          .select("id, name, report_id, account_id, scope")
          .eq("report_id", reportId);
        dimensionsData = reportDims || [];
      } else {
        const { data: customDims } = await supabase
          .from("dimensions")
          .select("id, name, report_id, account_id, scope")
          .eq("user_id", user.id)
          .eq("scope", "custom");
        dimensionsData = customDims || [];
      }

      dimensionsData?.forEach((dim) => {
        const dimId = dim.id;
        const dimName = dim.name;
        const reportIdForDim: string | null = dim.report_id;
        let reportNameForDim: string | null = null;
        let accountNameForDim: string | null = dim.account_id === accountId ? accountName : null;

        if (reportIdForDim) {
          const report = reportsList.find(r => r.id === reportIdForDim);
          reportNameForDim = report?.name || null;
          if (!accountNameForDim && report?.account_id) {
            accountNameForDim = report.account_id === accountId ? accountName : null;
          }
        } else if (dim.account_id) {
          accountNameForDim = dim.account_id === accountId ? accountName : null;
        }

        let displayName = dimName;
        if (accountNameForDim && reportNameForDim) {
          displayName = `${accountNameForDim} - ${reportNameForDim} - ${dimName}`;
        } else if (accountNameForDim) {
          displayName = `${accountNameForDim} - ${dimName}`;
        } else if (reportNameForDim) {
          displayName = `${reportNameForDim} - ${dimName}`;
        }

        const key = dimName;
        if (!dimensionMap.has(key) || (reportIdForDim && !dimensionMap.get(key)?.reportId)) {
          dimensionMap.set(key, {
            id: dimId,
            name: dimName,
            accountName: accountNameForDim,
            reportName: reportNameForDim,
            reportId: reportIdForDim,
          });
        }
      });

      dimensionsList.push(...Array.from(dimensionMap.values()).map(dim => ({
        ...dim,
        displayName: dim.accountName && dim.reportName
          ? `${dim.accountName} - ${dim.reportName} - ${dim.name}`
          : dim.accountName
          ? `${dim.accountName} - ${dim.name}`
          : dim.reportName
          ? `${dim.reportName} - ${dim.name}`
          : dim.name,
      })));

      dimensionsList.sort((a, b) => a.displayName.localeCompare(b.displayName));
      setDimensions(dimensionsList);

      if (dimensionsList.length > 0) {
        const reportIds = new Set<string>();
        dimensionsList.forEach(dim => {
          if (dim.reportId) {
            reportIds.add(dim.reportId);
          }
        });

        const hasDataMap: Record<string, boolean> = {};
        for (const reportIdToCheck of reportIds) {
          const dimsForReport = dimensionsList.filter(d => d.reportId === reportIdToCheck);
          const dimIdsForReport = dimsForReport.map(d => d.id);
          const reportHasData = await checkDimensionsHaveData(dimIdsForReport, reportIdToCheck);
          Object.assign(hasDataMap, reportHasData);
        }
        setDimensionHasData(hasDataMap);
      }
    } catch (error) {
      console.error("Error loading dimensions:", error);
      toast({
        title: "Error",
        description: "Failed to load dimensions",
        variant: "destructive",
      });
    }
  };

  const loadExistingBudget = async (dimensionName: string, itemName: string) => {
    try {
      if (!user) return;

      let query = supabase
        .from("budgets")
        .select("budget_data")
        .eq("user_id", user.id)
        .eq("dimension_name", dimensionName)
        .eq("dimension_item", itemName)
        .limit(1);

      if (accountId) query = query.eq("account_id", accountId);
      else if (reportId) query = query.eq("report_id", reportId);

      const { data: existing, error } = await query;
      if (error) {
        console.error("[testing] Error loading existing budget:", error);
        return;
      }

      if (existing && existing.length > 0) {
        const budgetDataRaw = existing[0].budget_data || {};
        // Check if it's flat format (has 'YYYY-MM' keys) or nested
        const isFlatFormat = Object.keys(budgetDataRaw).some(k => /^\d{4}-\d{2}$/.test(k));
        const nestedBudgetData = isFlatFormat 
          ? unflattenBudgetData(budgetDataRaw as unknown as Record<string, number>)
          : budgetDataRaw as Record<string, Record<string, number>>;
        
        console.log("[testing] Loaded existing budget data:", nestedBudgetData);
        setBudgetData(nestedBudgetData);
        
        // Set selected year to preset year if available, otherwise use first year in data
        if (presetYearMonth) {
          const presetYear = presetYearMonth.slice(0, 4);
          setSelectedYear(presetYear);
        } else {
          const years = Object.keys(nestedBudgetData);
          if (years.length > 0) {
            setSelectedYear(years[0]);
          }
        }
      }
    } catch (error) {
      console.error("[testing] Error loading existing budget:", error);
    }
  };

  const loadDimensionItems = async (dimensionName: string) => {
    try {
      const items = new Set<string>();
      const selectedDim = dimensions.find(d => d.name === dimensionName);
      const reportIdToUse = selectedDim?.reportId || reportId;

      console.log("[testing] loadDimensionItems:", {
        dimensionName,
        dimensionsCount: dimensions.length,
        availableDimensionNames: dimensions.map(d => d.name),
        selectedDim: selectedDim ? { id: selectedDim.id, name: selectedDim.name, reportId: selectedDim.reportId } : null,
        reportIdToUse,
        reportId,
        accountId,
      });

      if (!selectedDim && dimensions.length > 0) {
        console.warn("[testing] Dimension not found in dimensions array:", dimensionName);
      }

      if (reportIdToUse) {
        const { data, error } = await supabase
          .from("dimension_data")
          .select("dimension_values")
          .eq("report_id", reportIdToUse);

        if (error) throw error;

        console.log("[testing] dimension_data rows:", data?.length || 0);

        data?.forEach((row) => {
          const values = row.dimension_values as Record<string, unknown>;
          let value = selectedDim?.id ? values[selectedDim.id] : undefined;
          if (value === undefined || value === null) {
            value = values[dimensionName];
          }
          if (value !== null && value !== undefined && value !== "") {
            items.add(String(value));
          }
        });

        if (items.size === 0) {
          const { data: monthlyData } = await (supabase as any)
            .from("monthly_dimension_data")
            .select("dimension_values")
            .eq("report_id", reportIdToUse)
            .limit(100);

          console.log("[testing] monthly_dimension_data rows:", monthlyData?.length || 0);

          monthlyData?.forEach((row) => {
            const values = row.dimension_values as Record<string, unknown>;
            let value = selectedDim?.id ? values[selectedDim.id] : undefined;
            if (value === undefined || value === null) {
              value = values[dimensionName];
            }
            if (value !== null && value !== undefined && value !== "") {
              items.add(String(value));
            }
          });
        }
      }

      if (accountId && items.size === 0) {
        const { data: reports } = await supabase
          .from("reports")
          .select("id")
          .eq("account_id", accountId);

        console.log("[testing] account reports:", reports?.length || 0);

        if (reports && reports.length > 0) {
          const reportIds = reports.map(r => r.id);
          
          const { data: dimensionData } = await supabase
            .from("dimension_data")
            .select("dimension_values")
            .in("report_id", reportIds)
            .limit(500);

          console.log("[testing] account-level dimension_data rows:", dimensionData?.length || 0);

          dimensionData?.forEach((row) => {
            const values = row.dimension_values as Record<string, unknown>;
            let value = selectedDim?.id ? values[selectedDim.id] : undefined;
            if (value === undefined || value === null) {
              value = values[dimensionName];
            }
            if (value !== null && value !== undefined && value !== "") {
              items.add(String(value));
            }
          });
        }
      }

      console.log("[testing] total items found:", items.size);
      const sortedItems = Array.from(items).sort();
      setDimensionItems(sortedItems);
      
      // Auto-select preset item if provided and it exists in loaded items
      if (presetItemName && presetDimensionName === dimensionName && sortedItems.includes(presetItemName)) {
        console.log("[testing] Auto-selecting preset item:", presetItemName);
        setSelectedItem(presetItemName);
        // Load existing budget data for this preset only if initialBudgetValue is not provided
        if (user && !budget && initialBudgetValue === undefined) {
          loadExistingBudget(dimensionName, presetItemName);
        }
      } else if (budget?.dimension_item && budget.dimension_name === dimensionName && sortedItems.includes(budget.dimension_item)) {
        // Auto-select item when editing existing budget
        console.log("[testing] Auto-selecting budget item:", budget.dimension_item);
        setSelectedItem(budget.dimension_item);
      }
    } catch (error) {
      console.error("[testing] Error loading dimension items:", error);
      toast({
        title: "Error",
        description: "Failed to load dimension items",
        variant: "destructive",
      });
      setDimensionItems([]);
    }
  };

  const handleMonthChange = (month: string, value: string) => {
    const numValue = value === "" ? 0 : parseFloat(value);
    setBudgetData((prev) => ({
      ...prev,
      [selectedYear]: {
        ...(prev[selectedYear] || {}),
        [month]: numValue,
      },
    }));
  };

  const handleSave = async () => {
    if (!selectedDimension || !selectedItem) {
      toast({
        title: "Missing fields",
        description: "Please select a dimension and item",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      if (!user) {
        throw new Error("User not authenticated");
      }

      // Build flat YYYY-MM map for saving
      const flatBudget = flattenBudgetData(budgetData);

      // If editing existing budget via prop, update by id
      if (budget?.id) {
        const { error } = await (supabase as any)
          .from("budgets")
          .update({
            dimension_name: selectedDimension,
            dimension_item: selectedItem,
            budget_data: flatBudget,
            updated_at: new Date().toISOString(),
          })
          .eq("id", budget.id);

        if (error) throw error;

        toast({ title: "Success", description: "Budget updated successfully" });
      } else {
        // Upsert: look for existing budget record for this user + context
        let selectQuery = supabase
          .from("budgets")
          .select("id")
          .eq("user_id", user.id)
          .eq("dimension_name", selectedDimension)
          .eq("dimension_item", selectedItem)
          .limit(1);

        if (accountId) selectQuery = selectQuery.eq("account_id", accountId);
        else if (reportId) selectQuery = selectQuery.eq("report_id", reportId);

        const { data: existing, error: selErr } = await selectQuery;
        if (selErr) throw selErr;

        if (existing && existing.length > 0) {
          const { error } = await (supabase as any)
            .from("budgets")
            .update({
              budget_data: flatBudget,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing[0].id);
          if (error) throw error;

          toast({ title: "Success", description: "Budget updated successfully" });
        } else {
          const { error } = await (supabase as any)
            .from("budgets")
            .insert({
              report_id: reportId,
              account_id: accountId,
              user_id: user.id,
              dimension_name: selectedDimension,
              dimension_item: selectedItem,
              budget_data: flatBudget,
            });
          if (error) throw error;

          toast({ title: "Success", description: "Budget created successfully" });
        }
      }

      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Error saving budget:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save budget",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getMonthValue = (month: string): string => {
    const yearData = budgetData[selectedYear];
    if (!yearData) return "";
    const value = yearData[month];
    // Return empty string only if value is undefined, show 0 if value is actually 0
    return value === undefined ? "" : value.toString();
  };

  // Parse presetYearMonth to get year and month
  const presetYear = presetYearMonth ? presetYearMonth.slice(0, 4) : null;
  const presetMonth = presetYearMonth ? presetYearMonth.slice(5, 7) : null;
  const presetMonthName = presetMonth ? MONTHS.find(m => m.value === String(parseInt(presetMonth, 10)))?.label : null;
  const hasPresets = !!(presetDimensionName && presetItemName && presetYearMonth);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{budget ? "Edit Budget" : "Create New Budget"}</DialogTitle>
          <DialogDescription>
            {budget
              ? "Modify your budget settings and monthly amounts"
              : "Set up a new budget by selecting a dimension and item, then entering monthly amounts"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Step 1: Dimension Selection */}
          <div className="space-y-2">
            <Label htmlFor="dimension">Choose Budget Dimension</Label>
            <Select
              value={selectedDimension}
              onValueChange={setSelectedDimension}
              disabled={hasPresets}
            >
              <SelectTrigger id="dimension">
                <SelectValue placeholder="Select dimension (e.g., Roomstay - Diji - SEM - Account)" />
              </SelectTrigger>
              <SelectContent>
                {dimensions.map((dim) => {
                  const hasData = dim.reportId ? dimensionHasData[dim.id] : undefined;
                  return (
                    <SelectItem key={dim.id} value={dim.name}>
                      <div className="flex items-center gap-2">
                        {hasData !== undefined ? (
                          hasData ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                          ) : (
                            <AlertCircle className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          )
                        ) : (
                          <div className="h-3.5 w-3.5 flex-shrink-0" />
                        )}
                        <span>{dim.displayName}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Step 2: Item Selection */}
          {selectedDimension && (
            <div className="space-y-2">
              <Label htmlFor="item">Select Item</Label>
              <Select
                value={selectedItem}
                onValueChange={setSelectedItem}
                disabled={hasPresets || !selectedDimension || dimensionItems.length === 0}
              >
                <SelectTrigger id="item">
                  <SelectValue 
                    placeholder={
                      dimensionItems.length === 0
                        ? "No items found for this dimension"
                        : "Select item from chosen dimension"
                    } 
                  />
                </SelectTrigger>
                <SelectContent>
                  {dimensionItems.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No items available. Make sure the dimension has data in dimension_data or monthly_dimension_data tables.
                    </div>
                  ) : (
                    dimensionItems.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {dimensionItems.length === 0 && selectedDimension && (
                <p className="text-sm text-muted-foreground">
                  {!reportId && !accountId
                    ? "Note: This dimension may require a report or account context to load items."
                    : "No dimension items found. The dimension may not have any data yet."}
                </p>
              )}
            </div>
          )}

          {/* Step 3: Budget Amount Input */}
          {selectedDimension && selectedItem && (reportId || accountId) && (
            <div className="space-y-4">
              {hasPresets && presetYear && presetMonth ? (
                // Single input for preset month/year
                <div className="space-y-2">
                  <Label htmlFor="preset-budget">
                    Budget Amount for {presetMonthName} {presetYear}
                  </Label>
                  <Input
                    id="preset-budget"
                    type="number"
                    step="0.01"
                    placeholder="0"
                    value={getMonthValue(String(parseInt(presetMonth, 10)))}
                    onChange={(e) => {
                      setSelectedYear(presetYear);
                      handleMonthChange(String(parseInt(presetMonth, 10)), e.target.value);
                    }}
                    className="w-full"
                  />
                </div>
              ) : (
                // Full year-tabbed calendar for manual selection
                <div className="space-y-4">
                  <Label>Monthly Budget Amounts</Label>
                  <Tabs value={selectedYear} onValueChange={setSelectedYear}>
                    <TabsList>
                      {availableYears.map((year) => (
                        <TabsTrigger key={year.value} value={year.value}>
                          {year.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>

                    {availableYears.map((year) => (
                      <TabsContent key={year.value} value={year.value} className="mt-4">
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-4">
                            {MONTHS.map((month) => (
                              <div key={month.value} className="flex items-center gap-3">
                                <Label htmlFor={`month-${year.value}-${month.value}`} className="w-24">
                                  {month.label}
                                </Label>
                                <Input
                                  id={`month-${year.value}-${month.value}`}
                                  type="number"
                                  step="0.01"
                                  placeholder="0"
                                  value={getMonthValue(month.value)}
                                  onChange={(e) => {
                                    setSelectedYear(year.value);
                                    handleMonthChange(month.value, e.target.value);
                                  }}
                                  className="flex-1"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      </TabsContent>
                    ))}
                  </Tabs>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading || !selectedDimension || !selectedItem}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {budget ? "Update Budget" : "Create Budget"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};