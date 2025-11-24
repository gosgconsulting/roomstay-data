import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { checkDimensionsHaveData } from "@/lib/dimensionUtils";
import type { DimensionCondition } from "@/types/dimensions";

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
}

interface UsePerformanceTableDimensionsOptions {
  reportId: string | null;
  accountId?: string;
  onColumnOrderInit?: (order: string[]) => void;
}

/**
 * Hook for loading dimensions and checking data availability in PerformanceTable
 * Priority: Account dimensions (shared across account) > Global dimensions > Custom dimensions (report-specific)
 */
export function usePerformanceTableDimensions({
  reportId,
  accountId,
  onColumnOrderInit,
}: UsePerformanceTableDimensionsOptions) {
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
      // Set all dimensions as having data to prevent UI issues
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
    
    try {
      setIsLoadingDimensions(true);
      console.log('[DIMENSIONS] Starting dimension loading for report:', reportId);
      
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        console.error("[DIMENSIONS] User not authenticated");
        setIsLoadingDimensions(false);
        return;
      }

      // Resolve accountId if not provided
      let resolvedAccountId = accountId;
      if (!resolvedAccountId) {
        try {
          const { data: reportData, error: reportError } = await supabase
            .from("reports")
            .select("account_id")
            .eq("id", reportId)
            .single();
          
          if (reportError) {
            console.warn('[DIMENSIONS] Error fetching report account_id:', reportError);
          } else {
            resolvedAccountId = reportData?.account_id || null;
          }
        } catch (reportFetchError) {
          console.warn('[DIMENSIONS] Error resolving account ID:', reportFetchError);
        }
      }

      console.log('[DIMENSIONS] Loading dimensions for user:', user.id, 'account:', resolvedAccountId, 'report:', reportId);

      // Initialize arrays for different dimension types
      let accountData: any[] = [];
      let globalData: any[] = [];
      let customData: any[] = [];

      // 1. Load account-specific dimensions (HIGHEST PRIORITY - shared across all reports in account)
      if (resolvedAccountId) {
        try {
          const { data, error: accountError } = await supabase
            .from("dimensions")
            .select("*")
            .eq("scope", "account")
            .eq("account_id", resolvedAccountId)
            .order("created_at", { ascending: false });

          if (accountError) {
            console.error('[DIMENSIONS] Error loading account dimensions:', accountError);
          } else {
            accountData = (data || []);
            console.log('[DIMENSIONS] Loaded account dimensions:', accountData.length);
          }
        } catch (accountLoadError) {
          console.error('[DIMENSIONS] Exception loading account dimensions:', accountLoadError);
        }
      }

      // 2. Load global dimensions (MEDIUM PRIORITY - available to all users)
      try {
        const { data, error: globalError } = await supabase
          .from("dimensions")
          .select("*")
          .eq("scope", "global")
          .order("created_at", { ascending: false });

        if (globalError) {
          console.error('[DIMENSIONS] Error loading global dimensions:', globalError);
        } else {
          globalData = (data || []);
          console.log('[DIMENSIONS] Loaded global dimensions:', globalData.length);
        }
      } catch (globalLoadError) {
        console.error('[DIMENSIONS] Exception loading global dimensions:', globalLoadError);
      }

      // 3. Load custom dimensions for this user and report (LOWEST PRIORITY - report-specific only)
      try {
        const { data, error: customError } = await supabase
          .from("dimensions")
          .select("*")
          .eq("user_id", user.id)
          .eq("scope", "custom")
          .eq("report_id", reportId) // Only load custom dimensions for this specific report
          .order("created_at", { ascending: false });

        if (customError) {
          console.error('[DIMENSIONS] Error loading custom dimensions:', customError);
        } else {
          customData = (data || []);
          console.log('[DIMENSIONS] Loaded custom dimensions for report:', customData.length);
        }
      } catch (customLoadError) {
        console.error('[DIMENSIONS] Exception loading custom dimensions:', customLoadError);
      }

      // Combine all dimensions with proper priority: account > global > custom
      const combinedDimensions = [
        ...accountData,
        ...globalData,
        ...customData
      ].map(d => ({
        ...d,
        conditions: (Array.isArray(d.conditions) ? d.conditions : []) as unknown as DimensionCondition[]
      }));

      // Deduplicate dimensions by name (keep first occurrence, which prioritizes account-scoped)
      const seenNames = new Set<string>();
      const allDimensions = combinedDimensions.filter(dim => {
        if (!dim || !dim.name || seenNames.has(dim.name.toLowerCase().trim())) {
          return false;
        }
        seenNames.add(dim.name.toLowerCase().trim());
        return true;
      });

      console.log('[DIMENSIONS] Final dimensions loaded:', {
        account: accountData.length,
        global: globalData.length, 
        custom: customData.length,
        total: allDimensions.length,
        accountId: resolvedAccountId
      });

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
      const finalDimensions = budgetDimension 
        ? [...allDimensions, budgetDimension]
        : allDimensions;

      // Ensure we have at least some basic dimensions
      if (finalDimensions.length === 0) {
        console.warn('[DIMENSIONS] No dimensions loaded! This might cause issues.');
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

      // Set all dimensions (needed for Group by/Breakdown by selectors)
      console.log('[DIMENSIONS] Setting dimensions:', finalDimensions.length);
      setDimensions(finalDimensions);
      
      // Check data availability for dimensions (with error handling)
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
  }, [reportId, accountId, checkDataAvailability, onColumnOrderInit]);

  return {
    dimensions,
    dimensionHasData,
    isLoadingDimensions,
    loadDimensions,
  };
}