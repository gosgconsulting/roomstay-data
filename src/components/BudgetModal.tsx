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

  // Load dimensions and dimension items
  useEffect(() => {
    if (open && user) {
      loadDimensions();
      if (budget) {
        // Editing existing budget
        setSelectedDimension(budget.dimension_name);
        setSelectedItem(budget.dimension_item);
        setBudgetData(budget.budget_data || {});
        const years = Object.keys(budget.budget_data || {});
        setSelectedYear(years.length > 0 ? years[0] : currentYear.toString());
      } else {
        // Creating new budget (with presets if provided)
        setSelectedDimension(presetDimensionName || "");
        setSelectedItem(presetItemName || "");
        setBudgetData({});
        const presetYear = presetYearMonth?.slice(0, 4);
        setSelectedYear(presetYear || currentYear.toString());
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, budget, presetDimensionName, presetItemName, presetYearMonth]);

  // Load dimension items when dimension is selected
  useEffect(() => {
    if (open && selectedDimension) {
      loadDimensionItems(selectedDimension);
    } else {
      setDimensionItems([]);
      setSelectedItem("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedDimension, reportId, accountId]);

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

  const loadDimensionItems = async (dimensionName: string) => {
    try {
      const items = new Set<string>();
      const selectedDim = dimensions.find(d => d.name === dimensionName);
      const reportIdToUse = selectedDim?.reportId || reportId;

      if (reportIdToUse) {
        const { data, error } = await supabase
          .from("dimension_data")
          .select("dimension_values")
          .eq("report_id", reportIdToUse);

        if (error) throw error;

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

        if (reports && reports.length > 0) {
          const reportIds = reports.map(r => r.id);
          
          const { data: dimensionData } = await supabase
            .from("dimension_data")
            .select("dimension_values")
            .in("report_id", reportIds)
            .limit(500);

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

      setDimensionItems(Array.from(items).sort());
    } catch (error) {
      console.error("Error loading dimension items:", error);
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

  // NEW: flatten nested {year: {month: value}} into { 'YYYY-MM': value }
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
    return value === undefined || value === 0 ? "" : value.toString();
  };

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
                disabled={!selectedDimension || dimensionItems.length === 0}
              >
                <SelectTrigger id="item">
                  <SelectValue placeholder="Select item from chosen dimension" />
                </SelectTrigger>
                <SelectContent>
                  {dimensionItems.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Step 3: Year-tabbed Calendar */}
          {selectedDimension && selectedItem && (reportId || accountId) && (
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