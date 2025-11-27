import { Fragment, useState, useRef, useEffect } from "react";
import { ChevronDown, ChevronRight, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRowName, formatValue } from "@/lib/performanceTable/formatters";
// NEW: import formatter-compatible Dimension type
import type { Dimension as FormatterDimension } from "@/lib/performanceTable/formatters";
import type { Dimension } from "@/hooks/performanceTable/usePerformanceTableDimensions";
import type { TableRow as TableRowType } from "@/hooks/performanceTable/usePerformanceTableData";
import type { FilterState } from "@/components/FiltersBar";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
// NEW: import BudgetModal for popup editing
import { BudgetModal } from "@/components/BudgetModal";
import { useUser } from "@/lib/auth";

interface TableRowProps {
  row: TableRowType;
  isExpanded: boolean;
  hasChildren: boolean;
  onToggle: () => void;
  dimensions: Dimension[];
  visibleColumns: Set<string>;
  getOrderedDimensions: () => Dimension[];
  groupByDimensions: string[];
  breakdownByDimensions: string[];
  thenByDimensions: string[];
  activeDateTab: 'day' | 'week' | 'month' | 'year';
  filters: FilterState;
  onRowClick?: (row: TableRowType) => void;
  expandedRows?: Set<string>;
  onToggleRow?: (id: string) => void;
  showBudgetColumn?: boolean;
  isEditMode?: boolean;
  reportId?: string | null;
  accountId?: string | null;
}

/**
 * Renders a single table row with expand/collapse functionality
 */
export function TableRow({
  row,
  isExpanded,
  hasChildren,
  onToggle,
  dimensions,
  visibleColumns,
  getOrderedDimensions,
  groupByDimensions,
  breakdownByDimensions,
  thenByDimensions,
  activeDateTab,
  filters,
  onRowClick,
  expandedRows,
  onToggleRow,
  showBudgetColumn = false,
  isEditMode = false,
  reportId = null,
  accountId = null,
}: TableRowProps) {
  const { data: userData } = useUser();
  const user = userData?.user || null;
  const [localBudget, setLocalBudget] = useState<number | null>(typeof (row as any)?.data?.Budget === 'number' ? (row as any).data.Budget : null);
  const [hasLoadedFromDb, setHasLoadedFromDb] = useState(false);
  // NEW: editing state and ref to focus input (kept for future inline edit use)
  const [isEditingBudget, setIsEditingBudget] = useState(false);
  const budgetInputRef = useRef<HTMLInputElement | null>(null);
  // NEW: modal state + presets
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [presetDimensionName, setPresetDimensionName] = useState<string>('');
  const [presetItemName, setPresetItemName] = useState<string>('');
  const [presetYearMonth, setPresetYearMonth] = useState<string>('');

  const handleRowClick = () => {
    if (hasChildren) {
      onToggle();
    } else if (onRowClick) {
      onRowClick(row);
    }
  };

  // Helpers to detect editable Budget cell: month view + level 1 breakdown rows
  const isBreakdownChild = row.level === 1 && !!breakdownByDimensions[0];
  const isMonthView = activeDateTab === 'month';

  const budgetDimension = dimensions.find(d => d.name === 'Budget') || { id: 'virtual-budget', name: 'Budget', type: 'currency' } as Dimension;
  // formatter-compatible version (formula is required)
  const budgetDimForFormatValue: FormatterDimension = {
    id: (budgetDimension as any).id,
    name: (budgetDimension as any).name,
    type: (budgetDimension as any).type,
    formula: (budgetDimension as any).formula ?? null,
  };

  const extractMonthKey = () => {
    // parentId like "budget-month-YYYY-MM-01"
    const parentId = (row as any).parentId as string | undefined;
    if (!parentId) return null;
    const match = parentId.match(/budget-month-(\d{4}-\d{2})/);
    return match ? match[1] : null; // YYYY-MM
  };

  const saveBudget = async (value: number) => {
    const monthYM = extractMonthKey();
    const breakdownDimId = breakdownByDimensions[0];
    const breakdownDim = breakdownDimId ? dimensions.find(d => d.id === breakdownDimId) : undefined;
    if (!monthYM || !breakdownDim) {
      toast({ title: "Cannot save", description: "Missing month or breakdown dimension", variant: "destructive" });
      return;
    }
    const monthKey = monthYM as string;

    const itemName = String(row.name).trim();

    if (!user) {
      toast({ title: "Not signed in", description: "Please log in to save budgets", variant: "destructive" });
      return;
    }
    const userId = user.id;

    // Find existing budget row for this (user, account/report, dimension_name, dimension_item)
    let query = supabase
      .from('budgets')
      .select('id, budget_data')
      .eq('user_id', userId)
      .eq('dimension_name', breakdownDim.name)
      .eq('dimension_item', itemName)
      .limit(1);

    if (accountId) query = query.eq('account_id', accountId);
    else if (reportId) query = query.eq('report_id', reportId);

    const { data: existing, error: selErr } = await query;
    if (selErr) {
      toast({ title: "Error", description: "Failed to load existing budget", variant: "destructive" });
      return;
    }

    const existingData = (existing?.[0]?.budget_data ?? {}) as Record<string, number>;
    const newBudgetData: Record<string, number> = { ...existingData, [monthKey]: value };

    if (existing && existing.length > 0) {
      const { error: updErr } = await supabase
        .from('budgets')
        .update({ budget_data: newBudgetData })
        .eq('id', existing[0].id);
      if (updErr) {
        toast({ title: "Save failed", description: "Could not update budget", variant: "destructive" });
        return;
      }
    } else {
      const payload: any = {
        user_id: userId,
        dimension_name: breakdownDim.name,
        dimension_item: itemName,
        budget_data: newBudgetData,
      };
      if (accountId) payload.account_id = accountId;
      if (reportId) payload.report_id = reportId;

      const { error: insErr } = await supabase.from('budgets').insert(payload);
      if (insErr) {
        toast({ title: "Save failed", description: "Could not create budget", variant: "destructive" });
        return;
      }
    }

    setLocalBudget(value);
    setIsEditingBudget(false);
    toast({ title: "Budget saved", description: `Saved ${formatValue(value, budgetDimForFormatValue)} for ${itemName}` });
  };

  // NEW: computed display budget
  // If we've loaded from DB, use localBudget (null means no budget, so show 0)
  // Otherwise, fall back to row.data.Budget
  const displayBudget = hasLoadedFromDb 
    ? (localBudget ?? 0) 
    : (localBudget ?? (row as any)?.data?.Budget ?? 0);
  
  // Show "Set Budget" only if we've confirmed there's no budget in DB (loaded and found null)
  // This prevents showing "Set Budget" for a budget value of 0 before we've loaded from DB
  const shouldShowSetBudget = hasLoadedFromDb && localBudget === null;

  // NEW: handle opening modal with presets and refresh after save
  const openBudgetModal = async () => {
    if (!isMonthView || !isBreakdownChild) return;

    const breakdownDimId = breakdownByDimensions[0];
    const breakdownDim = breakdownDimId ? dimensions.find(d => d.id === breakdownDimId) : undefined;
    const monthYM = extractMonthKey();
    if (!breakdownDim || !monthYM) return;

    setPresetDimensionName(breakdownDim.name);
    setPresetItemName(String((row as any).name).trim());
    setPresetYearMonth(monthYM);
    setIsBudgetModalOpen(true);
  };

  const refreshBudgetFromDb = async () => {
    const monthYM = extractMonthKey();
    const breakdownDimId = breakdownByDimensions[0];
    const breakdownDim = breakdownDimId ? dimensions.find(d => d.id === breakdownDimId) : undefined;
    const itemName = String(row.name).trim();
    if (!monthYM || !breakdownDim) return;

    if (!user) return;
    const userId = user.id;

    let query = supabase
      .from('budgets')
      .select('budget_data')
      .eq('user_id', userId)
      .eq('dimension_name', breakdownDim.name)
      .eq('dimension_item', itemName)
      .limit(1);

    if (accountId) query = query.eq('account_id', accountId);
    else if (reportId) query = query.eq('report_id', reportId);

    const { data: existing } = await query;
    const val = (existing?.[0]?.budget_data ?? {})[monthYM];
    setHasLoadedFromDb(true);
    if (typeof val === 'number') {
      setLocalBudget(val);
    } else {
      // Reset to null if no budget found (so it shows "Set Budget")
      setLocalBudget(null);
    }
  };

  // Load budget from database on mount and when relevant props change
  useEffect(() => {
    if (isMonthView && isBreakdownChild && user) {
      refreshBudgetFromDb();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMonthView, isBreakdownChild, user, reportId, accountId, breakdownByDimensions, row.name]);

  return (
    <>
      <tr
        className={cn(
          "border-b hover:bg-muted/50 transition-colors cursor-pointer",
          row.level === 1 && "bg-muted/20",
          row.level === 2 && "bg-muted/10"
        )}
        onClick={handleRowClick}
      >
        <td className="py-3 px-4" style={{ paddingLeft: `${(row as any).level * 2 + 1}rem` }}>
          <div className="flex items-center gap-2">
            {hasChildren ? (
              <div className="text-muted-foreground">
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </div>
            ) : (
              <div className="w-4" />
            )}
            <span className={cn("font-medium", (row as any).level > 0 && "font-normal")}>
              {formatRowName(
                (row as any).name,
                (row as any).level,
                groupByDimensions,
                breakdownByDimensions,
                thenByDimensions,
                dimensions.map(d => ({ ...d, formula: d.formula || null })),
                activeDateTab
              )}
            </span>
          </div>
        </td>

        {showBudgetColumn && (
          <td className="py-3 px-4 text-right">
            <div className="flex items-center justify-end">
              {isEditMode && isMonthView && isBreakdownChild && isEditingBudget ? (
                <input
                  ref={budgetInputRef}
                  type="number"
                  step="0.01"
                  className="w-28 px-2 py-1 border rounded text-right"
                  value={localBudget ?? ''}
                  placeholder="0"
                  onChange={(e) => {
                    const v = e.target.value;
                    setLocalBudget(v === '' ? null : parseFloat(v));
                  }}
                  onBlur={() => {
                    if (localBudget !== null && !isNaN(localBudget)) {
                      saveBudget(localBudget);
                    }
                    setIsEditingBudget(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && localBudget !== null && !isNaN(localBudget)) {
                      saveBudget(localBudget);
                    } else if (e.key === 'Escape') {
                      setIsEditingBudget(false);
                    }
                  }}
                />
              ) : (isMonthView && isBreakdownChild) ? (
                // NEW: clickable display; show "Set Budget" when no budget exists, opens modal
                <span
                  className={cn(
                    "select-none",
                    isEditMode && isMonthView && isBreakdownChild && "cursor-pointer",
                    shouldShowSetBudget && "text-muted-foreground underline"
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    openBudgetModal();
                  }}
                  title={isEditMode && isMonthView && isBreakdownChild ? "Click to set budget" : undefined}
                >
                  {shouldShowSetBudget ? "Set Budget" : formatValue(displayBudget, budgetDimForFormatValue)}
                </span>
              ) : null}
            </div>
          </td>
        )}

        {getOrderedDimensions()
          .filter(d => visibleColumns.has(d.id))
          .filter(d => !(showBudgetColumn && d.name === 'Budget'))
          .map((dimension) => {
            const value = (row as any).data && dimension.name in (row as any).data ? (row as any).data[dimension.name] : null;
            const change = (row as any).changeData && dimension.name in (row as any).changeData ? (row as any).changeData[dimension.name] : undefined;
            const hasComparison = (filters as any).compareEnabled && change !== undefined;
            const numValue = typeof value === 'number' ? value : parseFloat(String(value || 0));
            const isNegative = !isNaN(numValue) && numValue < 0;
            
            return (
              <td key={dimension.id} className="py-3 px-4 text-right">
                <div className="flex flex-col items-end gap-1">
                  <span className={cn(isNegative && "text-red-600")}>{formatValue(value, { ...dimension, formula: dimension.formula || null })}</span>
                  {hasComparison && (
                    <span className={cn(
                      "text-xs flex items-center gap-1",
                      (change as number) > 0 ? "text-green-600" : (change as number) < 0 ? "text-red-600" : "text-muted-foreground"
                    )}>
                      {(change as number) > 0 && <ArrowUp className="h-3 w-3" />}
                      {(change as number) < 0 && <ArrowDown className="h-3 w-3" />}
                      {(change as number) === 0 && <Minus className="h-3 w-3" />}
                      {Math.abs(change as number).toFixed(1)}%
                    </span>
                  )}
                </div>
              </td>
            );
          })}
      </tr>
      {isExpanded &&
        (row as any).children?.map((child: any) => {
          const childIsExpanded = expandedRows?.has(child.id) ?? false;
          const childHasChildren = !!(child.children && child.children.length > 0);
          return (
            <Fragment key={child.id}>
              <TableRow
                row={child}
                isExpanded={childIsExpanded}
                hasChildren={childHasChildren}
                onToggle={() => onToggleRow?.(child.id)}
                dimensions={dimensions}
                visibleColumns={visibleColumns}
                getOrderedDimensions={getOrderedDimensions}
                groupByDimensions={groupByDimensions}
                breakdownByDimensions={breakdownByDimensions}
                thenByDimensions={thenByDimensions}
                activeDateTab={activeDateTab}
                filters={filters}
                onRowClick={onRowClick}
                expandedRows={expandedRows}
                onToggleRow={onToggleRow}
                showBudgetColumn={showBudgetColumn}
                isEditMode={isEditMode}
                reportId={reportId}
                accountId={accountId}
              />
            </Fragment>
          );
        })}
      {/* NEW: BudgetModal wired with presets */}
      {isBudgetModalOpen && (
        <BudgetModal
          open={isBudgetModalOpen}
          onOpenChange={(o) => {
            setIsBudgetModalOpen(o);
            if (!o) {
              refreshBudgetFromDb();
            }
          }}
          reportId={reportId ?? null}
          accountId={accountId ?? null}
          // presets from clicked cell
          presetDimensionName={presetDimensionName}
          presetItemName={presetItemName}
          presetYearMonth={presetYearMonth}
          onSuccess={() => {
            setIsBudgetModalOpen(false);
            refreshBudgetFromDb();
          }}
        />
      )}
    </>
  );
}