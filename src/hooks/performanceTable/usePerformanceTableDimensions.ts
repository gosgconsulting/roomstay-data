import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { checkDimensionsHaveData } from "@/lib/dimensionUtils";
import { getAccountIdFromReport, loadDimensionsForUser } from "@/lib/dimensionLoader";
import type { DimensionCondition, FormulaConditionPair } from "@/types/dimensions";
import { useUser } from "@/lib/auth";

export interface Dimension {
  id: string;
  name: string;
  type: string;
  user_id?: string;
  formula?: string | null;
  is_system?: boolean;
  scope?: 'global' | 'custom' | 'account';
  account_id?: string;
  conditions?: DimensionCondition[];
  formula_condition_pairs?: FormulaConditionPair[];
  [key: string]: unknown;
}

interface UsePerformanceTableDimensionsOptions {
  reportId: string | null;
  accountId?: string;
  onColumnOrderInit?: (order: string[]) => void;
}

/**
 * Hook for loading dimensions and checking data availability in PerformanceTable.
 * Uses canonical dimension loading (account > custom > global) via loadDimensionsForUser.
 */
export function usePerformanceTableDimensions({
  reportId,
  accountId,
  onColumnOrderInit,
}: UsePerformanceTableDimensionsOptions) {
  const { data: userData } = useUser();
  const user = userData?.user || null;
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [dimensionHasData, setDimensionHasData] = useState<Record<string, boolean>>({});
  const [isLoadingDimensions, setIsLoadingDimensions] = useState(true);

  const checkDataAvailability = useCallback(async (dimensionIds: string[], reportId: string) => {
    try {
      console.log('[DIMENSIONS] Checking data availability for', dimensionIds.length, 'dimensions');
      const hasDataMap = await checkDimensionsHaveData(dimensionIds, reportId);
      console.log('[DIMENSIONS] Data availability results:', hasDataMap);
      setDimensionHasData(hasDataMap);
    } catch (error) {
      console.error('[DIMENSIONS] Error checking dimension data availability:', error);
      const fallbackMap = dimensionIds.reduce((acc, id) => ({ ...acc, [id]: true }), {});
      setDimensionHasData(fallbackMap);
    }
  }, []);

  const loadDimensions = useCallback(async () => {
    if (!reportId) {
      console.log('[DIMENSIONS] No reportId provided, skipping dimension loading');
      setIsLoadingDimensions(false);
      return;
    }
    if (!user) {
      console.error("[DIMENSIONS] User not authenticated");
      setIsLoadingDimensions(false);
      return;
    }

    try {
      setIsLoadingDimensions(true);
      console.log('[DIMENSIONS] Loading dimensions for report:', reportId);

      const resolvedAccountId = accountId ?? (await getAccountIdFromReport(reportId));
      const baseRows = await loadDimensionsForUser(user.id, reportId, {
        accountId: resolvedAccountId ?? undefined,
      });
      const allDimensions = baseRows.map((d) => ({
        ...d,
        conditions: (Array.isArray(d.conditions) ? d.conditions : []) as unknown as DimensionCondition[],
      })) as Dimension[];

      console.log('[DIMENSIONS] Canonical dimensions loaded:', allDimensions.length, 'accountId:', resolvedAccountId);

      // Check if budgets exist for this account/report
      let budgetDimension = null;
      if (resolvedAccountId || reportId) {
        try {
          const { data: budgets, error: budgetError } = await supabase
            .from('budgets')
            .select('id')
            .or(`report_id.eq.${reportId},account_id.eq.${resolvedAccountId}`)
            .limit(1);

          if (!budgetError && budgets && budgets.length > 0) {
            // Create a virtual Budget dimension
            budgetDimension = {
              id: 'virtual-budget',
              name: 'Budget',
              type: 'currency',
              scope: 'virtual',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              formula: null,
              user_id: user.id,
              account_id: resolvedAccountId,
              report_id: reportId,
              data_source_id: null
            };
            console.log('[DIMENSIONS] Budget dimension added (budgets exist)');
          }
        } catch (budgetCheckError) {
          console.warn('[DIMENSIONS] Error checking for budgets:', budgetCheckError);
        }
      }

      // Add Budget dimension if it exists
      const allDimensionsWithBudget = budgetDimension 
        ? [...allDimensions, budgetDimension]
        : allDimensions;

      // Per user memory: all text and date dimensions should be displayed
      // regardless of whether they currently contain data.
      // Do NOT filter by data availability - show ALL dimensions
      let finalDimensions = allDimensionsWithBudget;
      
      console.log('[DIMENSIONS] Skipping data availability filter - showing all dimensions:', finalDimensions.length);

      // NEW: Ensure essential KPI metrics are present even if the filter excluded them
      const essentialKPIs = [
        'Impressions', 'Clicks', 'Conversions', 'Bookings', 'Conversion Rate',
        'CPC', 'Cost', 'Revenue', 'ROAS', 'Cost of sale'
      ];
      const existingNames = new Set(finalDimensions.map(d => d.name.toLowerCase()));
      const byNameMap = new Map(allDimensionsWithBudget.map(d => [d.name.toLowerCase(), d]));
      essentialKPIs.forEach(kpiName => {
        const key = kpiName.toLowerCase();
        if (!existingNames.has(key) && byNameMap.has(key)) {
          finalDimensions.push(byNameMap.get(key)!);
          existingNames.add(key);
        }
      });

      // Ensure we have at least some basic dimensions
      if (finalDimensions.length === 0) {
        console.warn('[DIMENSIONS] No dimensions with data found! Using fallback.');
        // Create a fallback dimension to prevent complete failure
        const fallbackDimension = {
          id: 'fallback-dimension',
          name: 'Data',
          type: 'text',
          scope: 'fallback',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          formula: null,
          user_id: user.id,
          account_id: resolvedAccountId,
          report_id: reportId,
          data_source_id: null
        };
        finalDimensions.push(fallbackDimension);
        console.log('[DIMENSIONS] Added fallback dimension to prevent complete failure');
      }

      // Set filtered dimensions (only those with data for this report)
      console.log('[DIMENSIONS] Setting filtered dimensions:', finalDimensions.length);
      setDimensions(finalDimensions);
      
      // Check data availability for final dimensions (for UI indicators)
      if (reportId && finalDimensions.length > 0) {
        try {
          await checkDataAvailability(finalDimensions.map(d => d.id), reportId);
        } catch (dataCheckError) {
          console.error('[DIMENSIONS] Error checking data availability:', dataCheckError);
          // Continue without data availability info
        }
      }
      
      // Initialize column order if not set (only for numeric dimensions)
      if (onColumnOrderInit) {
        try {
          const numericDimensions = finalDimensions.filter(d => 
            d.type === 'number' || d.type === 'currency' || d.type === 'percentage' || d.formula
          );
          const orderIds = numericDimensions.map(d => d.id);
          onColumnOrderInit(orderIds);
          console.log('[DIMENSIONS] Initialized column order with', orderIds.length, 'numeric dimensions');
        } catch (columnOrderError) {
          console.error('[DIMENSIONS] Error initializing column order:', columnOrderError);
        }
      }
      
      console.log('[DIMENSIONS] Dimensions loaded successfully for account:', resolvedAccountId, 'report:', reportId);
    } catch (error) {
      console.error("[DIMENSIONS] Error loading dimensions:", error);
      // Set empty dimensions to prevent undefined errors
      setDimensions([]);
      setDimensionHasData({});
    } finally {
      setIsLoadingDimensions(false);
    }
  }, [reportId, accountId, checkDataAvailability, onColumnOrderInit, user]);

  return {
    dimensions,
    dimensionHasData,
    isLoadingDimensions,
    loadDimensions,
  };
}