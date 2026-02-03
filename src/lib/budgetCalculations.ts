/**
 * Utility functions for calculating budget data
 */

import { MONTH_NAMES } from '@/constants/slideViewConstants';
import { filterRawDataRows } from '@/lib/slideViewHelpers';
import type { SlideReportPivotData } from '@/types/slideReports';
import type { RawDataRow } from '@/types/slideView';

export type BudgetMonthlyRow = {
  month: string;
  metasearchBudget: number;
  semBudget: number;
  socialBudget: number;
  metasearchActual: number;
  semActual: number;
  socialActual: number;
  metasearch: number;
  sem: number;
  social: number;
};

export type ChannelBudgets = {
  metasearch: number;
  sem: number;
  social: number;
};

export type ViewBudget = {
  id: string;
  dimension_name: string;
  dimension_item: string;
  budget_data: Record<string, number | ChannelBudgets>; // Support both legacy (number) and new (ChannelBudgets) formats
};

type BreakdownRowLike = {
  name?: string;
  [k: string]: unknown;
  cost?: number;
  revenue?: number;
};

/**
 * Sum cost and revenue from breakdown rows that match the filter (first matching dimension).
 * Used when rawDataRows is empty but view/filters are applied.
 */
function sumCostRevenueFromBreakdowns(
  breakdowns: Record<string, BreakdownRowLike[]> | undefined,
  dimensionMap: Record<string, string>,
  channelFilterValues: Record<string, string[]>
): { cost: number; revenue: number } {
  if (!breakdowns || !dimensionMap || !channelFilterValues) return { cost: 0, revenue: 0 };
  for (const [dimensionId, selectedValues] of Object.entries(channelFilterValues)) {
    if (!selectedValues?.length) continue;
    const dimensionName = dimensionMap[dimensionId];
    if (!dimensionName || !breakdowns[dimensionName]) continue;
    const rows = breakdowns[dimensionName];
    const selectedSet = new Set(selectedValues.map((v) => String(v).trim()));
    const matching = rows.filter((row) => {
      const value = row.name ?? row[dimensionName] ?? row[dimensionName.toLowerCase().replace(/\s+/g, '_')];
      return value != null && selectedSet.has(String(value).trim());
    });
    if (matching.length > 0) {
      let cost = 0;
      let revenue = 0;
      matching.forEach((row) => {
        cost += Number(row.cost) || 0;
        revenue += Number(row.revenue) || 0;
      });
      return { cost, revenue };
    }
  }
  return { cost: 0, revenue: 0 };
}

/**
 * Normalizes budget value to channel-specific structure
 * Supports both legacy flat format and new channel-specific format
 */
export function normalizeBudgetValue(value: number | ChannelBudgets | null | undefined): ChannelBudgets {
  if (!value) {
    return { metasearch: 0, sem: 0, social: 0 };
  }
  
  if (typeof value === 'number') {
    // Legacy format: divide by 3 (old assumption was equal distribution)
    const perChannel = value / 3;
    return { metasearch: perChannel, sem: perChannel, social: perChannel };
  }
  
  // New format: return as-is with defaults for missing channels
  return {
    metasearch: value.metasearch || 0,
    sem: value.sem || 0,
    social: value.social || 0,
  };
}

/**
 * Calculate budget data from pivot data or view budgets
 */
export function calculateBudgetData(
  pivotData: SlideReportPivotData | null,
  selectedViewId: string | null,
  viewBudgets: ViewBudget[],
  selectedYear: string
): Array<{ month: string; budget: number; actual: number }> {
  // If a view is selected, use view budgets
  if (selectedViewId && viewBudgets.length > 0) {
    // Aggregate budgets by month from view budgets
    const monthlyBudgetMap: Record<string, { budget: number; actual: number }> = {};

    // Get actual costs from pivot_data.overview.monthly (already filtered by view)
    if (pivotData?.overview?.monthly) {
      Object.entries(pivotData.overview.monthly).forEach(([monthKey, metrics]) => {
        // monthKey format: "2025-11" -> convert to "November 2025"
        const [year, month] = monthKey.split('-');
        const monthNum = parseInt(month);
        if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
          return;
        }
        const monthName = MONTH_NAMES[monthNum - 1];
        const yearMonthKey = `${monthName} ${year}`;

        if (!monthlyBudgetMap[yearMonthKey]) {
          monthlyBudgetMap[yearMonthKey] = { budget: 0, actual: 0 };
        }
        // Use cost from overview monthly data (already filtered by view)
        monthlyBudgetMap[yearMonthKey].actual = metrics.cost || 0;
      });
    }

    // Aggregate budgets from view budgets
    viewBudgets.forEach((budget) => {
      Object.entries(budget.budget_data).forEach(([monthKey, amount]) => {
        // monthKey format: "2025-11" -> convert to "November 2025"
        const [year, month] = monthKey.split('-');
        const monthNum = parseInt(month);
        if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
          console.warn('Invalid month in budget key:', monthKey);
          return;
        }
        const monthName = MONTH_NAMES[monthNum - 1];
        const yearMonthKey = `${monthName} ${year}`;

        if (!monthlyBudgetMap[yearMonthKey]) {
          monthlyBudgetMap[yearMonthKey] = { budget: 0, actual: 0 };
        }
        monthlyBudgetMap[yearMonthKey].budget += Number(amount) || 0;
      });
    });

    let budgetDataArray = Object.entries(monthlyBudgetMap)
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => {
        // Parse "Month Year" format (e.g., "November 2025")
        const parseMonthYear = (str: string) => {
          const [monthName, year] = str.split(' ');
          const monthIndex = MONTH_NAMES.indexOf(monthName);
          return new Date(parseInt(year), monthIndex, 1);
        };
        const aDate = parseMonthYear(a.month);
        const bDate = parseMonthYear(b.month);
        return aDate.getTime() - bDate.getTime();
      });

    // Filter by selected year if not "all"
    if (selectedYear !== 'all') {
      budgetDataArray = budgetDataArray.filter((item) => {
        const [, year] = item.month.split(' ');
        return year === selectedYear;
      });
    }

    return budgetDataArray;
  }

  // Fallback to pivot_data.budget
  if (pivotData?.budget?.monthly) {
    let monthlyData = pivotData.budget.monthly.map((m) => ({
      month: m.month,
      budget: m.metasearchBudget + m.semBudget + m.socialBudget,
      actual: m.metasearchActual + m.semActual + m.socialActual,
    }));

    // Filter by selected year if not "all"
    if (selectedYear !== 'all') {
      monthlyData = monthlyData.filter((item) => {
        const [, year] = item.month.split(' ');
        return year === selectedYear;
      });
    }

    return monthlyData;
  }
  return [];
}

/**
 * Calculate budget monthly data for tables (full structure with all fields)
 */
export function calculateBudgetMonthlyData(
  pivotData: SlideReportPivotData | null,
  selectedViewId: string | null,
  viewBudgets: ViewBudget[],
  selectedYear: string,
  hasFilters: boolean,
  getFilteredRowsForChannel: (channel: string) => RawDataRow[],
  filterValues?: Record<string, Record<string, string[]>>
): BudgetMonthlyRow[] {
  // Process channel data for both Master View (no view selected) and custom views
  // Master View: process all channel data without budget data
  // Custom View: process channel data + add budget data from viewBudgets
  const isMasterView = !selectedViewId || viewBudgets.length === 0;
  
  if (isMasterView || (selectedViewId && viewBudgets.length > 0)) {
    const monthlyDataMap: Record<string, BudgetMonthlyRow> = {};

    // Get actual costs and revenue from filtered rawDataRows (when filters are applied or view is selected)
    // or from pivot_data.channels.monthly (when no filters and Master View)
    // When a view is selected, pivotData.channels.monthly might be pre-filtered, so we should use
    // getFilteredRowsForChannel to ensure we get all months that match the view
    if (pivotData?.channels) {
      ['metasearch', 'sem', 'social'].forEach((channel) => {
        const channelData = pivotData.channels[channel];

        // Skip if channel data doesn't exist (channel might not have been processed)
        if (!channelData) {
          return;
        }

        // Use filtered rows if filters are applied OR if a view is selected (view applies its own filters)
        if (hasFilters || !isMasterView) {
          // Get raw rows directly and filter by dimension filters only (not year filter)
          const rawDataRows = (channelData as any).rawDataRows || [];
          const channelFilterValues = filterValues?.[channel] || {};
          const filteredRows = filterRawDataRows(rawDataRows, channelFilterValues, undefined);

          const dimensionMap = (channelData as any).dimensionMap || {};
          const metricNameToIdMap: Record<string, string> = {};
          Object.entries(dimensionMap as Record<string, string>).forEach(
            ([dimensionId, dimensionName]) => {
              if (dimensionName && typeof dimensionName === 'string') {
                metricNameToIdMap[dimensionName] = dimensionId;
              }
            }
          );

          // When no raw rows (e.g. data from table merge), derive per-month from monthlyBreakdowns so View shows data
          if (filteredRows.length === 0) {
            const monthlyBreakdowns = (channelData as any).monthlyBreakdowns as Record<string, Record<string, BreakdownRowLike[]>> | undefined;
            const allTimeBreakdowns = (channelData as any).breakdowns as Record<string, BreakdownRowLike[]> | undefined;
            if (monthlyBreakdowns && Object.keys(monthlyBreakdowns).length > 0) {
              Object.entries(monthlyBreakdowns).forEach(([monthKey, breakdownsByDim]) => {
                const [year, month] = monthKey.split('-');
                const monthNum = parseInt(month, 10);
                if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) return;
                const monthName = MONTH_NAMES[monthNum - 1];
                const yearMonthKey = `${monthName} ${year}`;
                if (!monthlyDataMap[yearMonthKey]) {
                  monthlyDataMap[yearMonthKey] = {
                    month: yearMonthKey,
                    metasearchBudget: 0,
                    semBudget: 0,
                    socialBudget: 0,
                    metasearchActual: 0,
                    semActual: 0,
                    socialActual: 0,
                    metasearch: 0,
                    sem: 0,
                    social: 0,
                  };
                }
                const { cost, revenue } = sumCostRevenueFromBreakdowns(
                  breakdownsByDim,
                  dimensionMap as Record<string, string>,
                  channelFilterValues
                );
                if (channel === 'metasearch') {
                  monthlyDataMap[yearMonthKey].metasearchActual += cost;
                  monthlyDataMap[yearMonthKey].metasearch += revenue;
                } else if (channel === 'sem') {
                  monthlyDataMap[yearMonthKey].semActual += cost;
                  monthlyDataMap[yearMonthKey].sem += revenue;
                } else if (channel === 'social') {
                  monthlyDataMap[yearMonthKey].socialActual += cost;
                  monthlyDataMap[yearMonthKey].social += revenue;
                }
              });
            } else if (allTimeBreakdowns && Object.keys(channelFilterValues).length > 0) {
              // No monthly breakdowns: use all-time breakdowns and spread across months that have channel data
              const { cost, revenue } = sumCostRevenueFromBreakdowns(
                allTimeBreakdowns,
                dimensionMap as Record<string, string>,
                channelFilterValues
              );
              if ((cost > 0 || revenue > 0) && channelData?.monthly) {
                const monthKeys = Object.keys(channelData.monthly);
                monthKeys.forEach((monthKey) => {
                  const [y, m] = monthKey.split('-');
                  const monthName = MONTH_NAMES[parseInt(m, 10) - 1];
                  const yearMonthKey = `${monthName} ${y}`;
                  if (!monthlyDataMap[yearMonthKey]) {
                    monthlyDataMap[yearMonthKey] = {
                      month: yearMonthKey,
                      metasearchBudget: 0,
                      semBudget: 0,
                      socialBudget: 0,
                      metasearchActual: 0,
                      semActual: 0,
                      socialActual: 0,
                      metasearch: 0,
                      sem: 0,
                      social: 0,
                    };
                  }
                  const perMonth = monthKeys.length;
                  if (channel === 'metasearch') {
                    monthlyDataMap[yearMonthKey].metasearchActual += cost / perMonth;
                    monthlyDataMap[yearMonthKey].metasearch += revenue / perMonth;
                  } else if (channel === 'sem') {
                    monthlyDataMap[yearMonthKey].semActual += cost / perMonth;
                    monthlyDataMap[yearMonthKey].sem += revenue / perMonth;
                  } else if (channel === 'social') {
                    monthlyDataMap[yearMonthKey].socialActual += cost / perMonth;
                    monthlyDataMap[yearMonthKey].social += revenue / perMonth;
                  }
                });
              }
            }
          }

          // Aggregate by month from filtered rows (when we have raw rows)
          filteredRows.forEach((row: RawDataRow) => {
            const rowData = row.dimension_values || row;

            // Find date value
            let dateValue: string | undefined = (rowData as Record<string, unknown>)
              .Date as string | undefined;
            if (!dateValue) {
              dateValue = (rowData as Record<string, unknown>).date as string | undefined;
            }
            if (!dateValue) {
              dateValue = (rowData as Record<string, unknown>).Day as string | undefined;
            }
            if (!dateValue) {
              dateValue = (rowData as Record<string, unknown>).day as string | undefined;
            }
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
                const monthName = MONTH_NAMES[rowDate.getMonth()];
                const yearMonthKey = `${monthName} ${year}`;

                if (!monthlyDataMap[yearMonthKey]) {
                  monthlyDataMap[yearMonthKey] = {
                    month: yearMonthKey,
                    metasearchBudget: 0,
                    semBudget: 0,
                    socialBudget: 0,
                    metasearchActual: 0,
                    semActual: 0,
                    socialActual: 0,
                    metasearch: 0,
                    sem: 0,
                    social: 0,
                  };
                }

                // Use EXACT same extraction logic as UnifiedBreakdownTable for consistency
                // This ensures we get the same values as the breakdown table
                const costValue =
                  parseFloat(
                    String(
                      rowData[metricNameToIdMap['Cost']] || rowData['Cost'] || 0
                    ).replace(/[^0-9.-]/g, '')
                  ) || 0;
                const revenueValue =
                  parseFloat(
                    String(
                      rowData[metricNameToIdMap['Revenue']] || rowData['Revenue'] || 0
                    ).replace(/[^0-9.-]/g, '')
                  ) || 0;

                if (channel === 'metasearch') {
                  monthlyDataMap[yearMonthKey].metasearchActual += costValue;
                  monthlyDataMap[yearMonthKey].metasearch += revenueValue;
                } else if (channel === 'sem') {
                  monthlyDataMap[yearMonthKey].semActual += costValue;
                  monthlyDataMap[yearMonthKey].sem += revenueValue;
                } else if (channel === 'social') {
                  monthlyDataMap[yearMonthKey].socialActual += costValue;
                  monthlyDataMap[yearMonthKey].social += revenueValue;
                }
              }
            }
          });
        } else {
          // No filters - use pre-computed monthly data
          if (channelData?.monthly) {
            Object.entries(channelData.monthly).forEach(([monthKey, metrics]) => {
              // monthKey format: "2025-11" -> convert to "November 2025"
              const [year, month] = monthKey.split('-');
              const monthNum = parseInt(month);
              if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
                return;
              }
              const monthName = MONTH_NAMES[monthNum - 1];
              const yearMonthKey = `${monthName} ${year}`;

              // Initialize the month entry if it doesn't exist
              if (!monthlyDataMap[yearMonthKey]) {
                monthlyDataMap[yearMonthKey] = {
                  month: yearMonthKey,
                  metasearchBudget: 0,
                  semBudget: 0,
                  socialBudget: 0,
                  metasearchActual: 0,
                  semActual: 0,
                  socialActual: 0,
                  metasearch: 0,
                  sem: 0,
                  social: 0,
                };
              }

              const cost = metrics.cost || 0;
              const revenue = metrics.revenue || 0;

              // Set values for the specific channel (don't overwrite other channels' data)
              if (channel === 'metasearch') {
                monthlyDataMap[yearMonthKey].metasearchActual = cost;
                monthlyDataMap[yearMonthKey].metasearch = revenue;
              } else if (channel === 'sem') {
                monthlyDataMap[yearMonthKey].semActual = cost;
                monthlyDataMap[yearMonthKey].sem = revenue;
              } else if (channel === 'social') {
                monthlyDataMap[yearMonthKey].socialActual = cost;
                monthlyDataMap[yearMonthKey].social = revenue;
              }
            });
          }
        }
      });
    }

    // Add budgets from view budgets (only if a view is selected)
    if (!isMasterView && viewBudgets.length > 0) {
      viewBudgets.forEach((budget) => {
        Object.entries(budget.budget_data).forEach(([monthKey, amount]) => {
        const [year, month] = monthKey.split('-');
        const monthName = MONTH_NAMES[parseInt(month) - 1];
        const yearMonthKey = `${monthName} ${year}`;

        if (!monthlyDataMap[yearMonthKey]) {
          monthlyDataMap[yearMonthKey] = {
            month: yearMonthKey,
            metasearchBudget: 0,
            semBudget: 0,
            socialBudget: 0,
            metasearchActual: 0,
            semActual: 0,
            socialActual: 0,
            metasearch: 0,
            sem: 0,
            social: 0,
          };
        }

        // Aggregate budgets - budgets are stored per hotel (dimension_item)
        // Support both legacy flat format and new channel-specific format
        const channelBudgets = normalizeBudgetValue(amount);
        
        // Add channel-specific budgets
        monthlyDataMap[yearMonthKey].metasearchBudget += channelBudgets.metasearch;
        monthlyDataMap[yearMonthKey].semBudget += channelBudgets.sem;
        monthlyDataMap[yearMonthKey].socialBudget += channelBudgets.social;
        });
      });
    }

    let monthlyDataArray = Object.values(monthlyDataMap).sort((a, b) => {
      // Parse "Month Year" format (e.g., "November 2025")
      const parseMonthYear = (str: string) => {
        const [monthName, year] = str.split(' ');
        const monthIndex = MONTH_NAMES.indexOf(monthName);
        return new Date(parseInt(year), monthIndex, 1);
      };
      const aDate = parseMonthYear(a.month);
      const bDate = parseMonthYear(b.month);
      return aDate.getTime() - bDate.getTime();
    });

    // Filter by selected year if not "all"
    if (selectedYear !== 'all') {
      monthlyDataArray = monthlyDataArray.filter((item) => {
        const [, year] = item.month.split(' ');
        return year === selectedYear;
      });

      // Ensure all 12 months are present for the selected year
      // Create a map for quick lookup using full month string as key to avoid any parsing issues
      const dataMap = new Map<string, BudgetMonthlyRow>();
      monthlyDataArray.forEach(item => {
        const [monthName] = item.month.split(' ');
        // Use month name as key, but verify it matches the selected year
        const [, year] = item.month.split(' ');
        if (year === selectedYear) {
          dataMap.set(monthName, item);
        }
      });

      // Generate all 12 months for the selected year
      const allMonths: BudgetMonthlyRow[] = MONTH_NAMES.map(monthName => {
        const yearMonthKey = `${monthName} ${selectedYear}`;
        if (dataMap.has(monthName)) {
          // Return the existing data, ensuring the month string is correct
          const existingData = dataMap.get(monthName)!;
          return {
            ...existingData,
            month: yearMonthKey, // Ensure month string matches the selected year
          };
        }
        // Create empty row for missing month
        return {
          month: yearMonthKey,
          metasearchBudget: 0,
          semBudget: 0,
          socialBudget: 0,
          metasearchActual: 0,
          semActual: 0,
          socialActual: 0,
          metasearch: 0,
          sem: 0,
          social: 0,
        };
      });

      return allMonths;
    }

    return monthlyDataArray;
  }

  // Fallback to pivot_data.budget - need to add revenue data
  if (pivotData?.budget?.monthly) {
    let monthlyData: BudgetMonthlyRow[] = pivotData.budget.monthly.map((row) => {
      // Get revenue from channels data
      const [monthName, year] = row.month.split(' ');
      const monthIndex = MONTH_NAMES.indexOf(monthName);
      const monthKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;

      const metasearchRevenue =
        pivotData.channels?.metasearch?.monthly?.[monthKey]?.revenue || 0;
      const semRevenue = pivotData.channels?.sem?.monthly?.[monthKey]?.revenue || 0;
      const socialRevenue = pivotData.channels?.social?.monthly?.[monthKey]?.revenue || 0;

      return {
        ...row,
        metasearch: metasearchRevenue,
        sem: semRevenue,
        social: socialRevenue,
      };
    });

    // Filter by selected year if not "all"
    if (selectedYear !== 'all') {
      monthlyData = monthlyData.filter((item) => {
        const [, year] = item.month.split(' ');
        return year === selectedYear;
      });

      // Ensure all 12 months are present for the selected year
      // Create a map for quick lookup using full month string as key to avoid any parsing issues
      const dataMap = new Map<string, BudgetMonthlyRow>();
      monthlyData.forEach(item => {
        const [monthName] = item.month.split(' ');
        // Use month name as key, but verify it matches the selected year
        const [, year] = item.month.split(' ');
        if (year === selectedYear) {
          dataMap.set(monthName, item);
        }
      });

      // Generate all 12 months for the selected year
      const allMonths: BudgetMonthlyRow[] = MONTH_NAMES.map(monthName => {
        const yearMonthKey = `${monthName} ${selectedYear}`;
        if (dataMap.has(monthName)) {
          // Return the existing data, ensuring the month string is correct
          const existingData = dataMap.get(monthName)!;
          return {
            ...existingData,
            month: yearMonthKey, // Ensure month string matches the selected year
          };
        }
        // Create empty row for missing month
        return {
          month: yearMonthKey,
          metasearchBudget: 0,
          semBudget: 0,
          socialBudget: 0,
          metasearchActual: 0,
          semActual: 0,
          socialActual: 0,
          metasearch: 0,
          sem: 0,
          social: 0,
        };
      });

      return allMonths;
    }
    return monthlyData;
  }
  return [];
}

/**
 * Calculate profit based on PnL configuration
 * 
 * @param actualCost - The actual cost spent
 * @param revenue - The revenue generated
 * @param config - PnL configuration with spender type and fee percentages
 * @param oneOffFee - Optional one-off fee (defaults to 0)
 * @returns Calculated profit
 */
export function calculateProfit(
  actualCost: number,
  revenue: number,
  config: {
    spender: 'client' | 'agency';
    recurrentFee: number;
    percentCost: number;
    percentRevenue: number;
  },
  oneOffFee: number = 0
): number {
  const costFee = actualCost * (config.percentCost / 100);
  const revenueFee = revenue * (config.percentRevenue / 100);
  
  if (config.spender === 'agency') {
    // Agency spender: We pay the full cost (actualCost), but we get costFee as revenue from client
    // Net cost we pay = actualCost - costFee (since we get costFee back from client)
    // Profit = revenueFee + recurrentFee + oneOffFee - netCost = revenueFee + recurrentFee + oneOffFee - (actualCost - costFee)
    // Which simplifies to: revenueFee + recurrentFee + oneOffFee - actualCost + costFee
    return revenueFee + config.recurrentFee + oneOffFee - actualCost + costFee;
  } else {
    // Client spender: Client pays the cost, we only get fees
    return costFee + revenueFee + config.recurrentFee + oneOffFee;
  }
}
