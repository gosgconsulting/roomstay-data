import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { checkDimensionsHaveData } from "@/lib/dimensionUtils";

export interface Dimension {
  id: string;
  name: string;
  type: string;
  user_id?: string;
  formula?: string | null;
  is_system?: boolean;
  scope?: 'global' | 'custom' | 'account';
  account_id?: string;
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
      const hasDataMap = await checkDimensionsHaveData(dimensionIds, reportId);
      setDimensionHasData(hasDataMap);
    } catch (error) {
      console.error('[testing] Error checking dimension data availability:', error);
    }
  }, []);

  const loadDimensions = useCallback(async () => {
    if (!reportId) return;
    
    try {
      setIsLoadingDimensions(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        console.error("User not authenticated");
        setIsLoadingDimensions(false);
        return;
      }

      // Resolve accountId if not provided
      let resolvedAccountId = accountId;
      if (!resolvedAccountId) {
        const { data: reportData } = await supabase
          .from("reports")
          .select("account_id")
          .eq("id", reportId)
          .single();
        resolvedAccountId = reportData?.account_id || null;
      }

      console.log('[testing] PerformanceTable - Loading dimensions for user:', user.id, 'account:', resolvedAccountId, 'report:', reportId);

      // 1. Load account-specific dimensions (HIGHEST PRIORITY - shared across all reports in account)
      let accountData: any[] = [];
      if (resolvedAccountId) {
        const { data, error: accountError } = await supabase
          .from("dimensions")
          .select("*")
          .eq("scope", "account")
          .eq("account_id", resolvedAccountId)
          .order("created_at", { ascending: false });

        if (accountError) {
          console.error('[testing] Error loading account dimensions:', accountError);
        } else {
          accountData = (data || []);
          console.log('[testing] PerformanceTable - Loaded account dimensions:', accountData.length);
        }
      }

      // 2. Load global dimensions (MEDIUM PRIORITY - available to all users)
      const { data: globalData, error: globalError } = await supabase
        .from("dimensions")
        .select("*")
        .eq("scope", "global")
        .order("created_at", { ascending: false });

      if (globalError) {
        console.error('[testing] Error loading global dimensions:', globalError);
      } else {
        console.log('[testing] PerformanceTable - Loaded global dimensions:', globalData?.length || 0);
      }

      // 3. Load custom dimensions for this user and report (LOWEST PRIORITY - report-specific only)
      let customData: any[] = [];
      const { data, error: customError } = await supabase
        .from("dimensions")
        .select("*")
        .eq("user_id", user.id)
        .eq("scope", "custom")
        .eq("report_id", reportId) // Only load custom dimensions for this specific report
        .order("created_at", { ascending: false });

      if (customError) {
        console.error('[testing] Error loading custom dimensions:', customError);
      } else {
        customData = (data || []);
        console.log('[testing] PerformanceTable - Loaded custom dimensions for report:', customData.length);
      }

      // Combine all dimensions with proper priority: account > global > custom
      const combinedDimensions = [
        ...(accountData || []),
        ...(globalData || []),
        ...(customData || [])
      ];

      // Deduplicate dimensions by name (keep first occurrence, which prioritizes account-scoped)
      const seenNames = new Set<string>();
      const allDimensions = combinedDimensions.filter(dim => {
        if (!dim || !dim.name || seenNames.has(dim.name)) {
          return false;
        }
        seenNames.add(dim.name);
        return true;
      });

      console.log('[testing] PerformanceTable - Final dimensions loaded:', {
        account: accountData?.length || 0,
        global: globalData?.length || 0, 
        custom: customData?.length || 0,
        total: allDimensions?.length || 0,
        accountId: resolvedAccountId
      });

      // Check if budgets exist for this account/report
      let budgetDimension = null;
      if (resolvedAccountId || reportId) {
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
          console.log('[testing] PerformanceTable - Budget dimension added (budgets exist)');
        }
      }

      // Add Budget dimension if it exists
      const finalDimensions = budgetDimension 
        ? [...allDimensions, budgetDimension]
        : allDimensions;

      // Set all dimensions (needed for Group by/Breakdown by selectors)
      const safeDimensions = finalDimensions || [];
      console.log('[testing] PerformanceTable - Setting dimensions:', safeDimensions.length);
      setDimensions(safeDimensions);
      
      // Check data availability for dimensions
      if (reportId && finalDimensions && finalDimensions.length > 0) {
        checkDataAvailability(finalDimensions.map(d => d.id), reportId);
      }
      
      // Initialize column order if not set (only for numeric dimensions)
      if (onColumnOrderInit) {
        const numericDimensions = finalDimensions.filter(d => 
          d.type === 'number' || d.type === 'currency' || d.type === 'percentage' || d.formula
        );
        const orderIds = numericDimensions.map(d => d.id);
        onColumnOrderInit(orderIds);
      }
      
      console.log('[testing] Dimensions loaded successfully for account:', resolvedAccountId, 'report:', reportId);
    } catch (error) {
      console.error("Error loading dimensions:", error);
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