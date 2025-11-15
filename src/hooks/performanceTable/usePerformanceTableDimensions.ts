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
}

interface UsePerformanceTableDimensionsOptions {
  reportId: string | null;
  accountId?: string;
  onColumnOrderInit?: (order: string[]) => void;
}

/**
 * Hook for loading dimensions and checking data availability in PerformanceTable
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

      console.log('[testing] PerformanceTable - Loading dimensions for user:', user.id, 'account:', accountId);

      // Load global dimensions (available to all users)
      const { data: globalData, error: globalError } = await supabase
        .from("dimensions")
        .select("*")
        .eq("scope", "global")
        .order("created_at", { ascending: false });

      if (globalError) throw globalError;

      // Load account-specific dimensions if accountId is provided
      let accountData: any[] = [];
      if (accountId) {
        const { data, error: accountError } = await supabase
          .from("dimensions")
          .select("*")
          .eq("scope", "account")
          .eq("account_id", accountId)
          .order("created_at", { ascending: false });

        if (accountError) throw accountError;
        accountData = (data || []);
      }

      // Load custom dimensions for this user (including vlookup dimensions)
      let customData: any[] = [];
      const { data, error: customError } = await supabase
        .from("dimensions")
        .select("*")
        .eq("user_id", user.id)
        .eq("scope", "custom")
        .or(`report_id.is.null,report_id.eq.${reportId}`)
        .order("created_at", { ascending: false });

      if (customError) throw customError;
      customData = (data || []);

      // Combine all dimensions with proper priority: account > custom > global
      const combinedDimensions = [
        ...(accountData || []),
        ...(customData || []), // This now includes vlookup dimensions
        ...(globalData || [])
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

      console.log('[testing] PerformanceTable - Loaded dimensions - Global:', globalData?.length || 0, 'Account:', accountData?.length || 0, 'Custom:', customData?.length || 0, 'Final:', allDimensions?.length || 0);

      // Check if budgets exist for this account/report
      let budgetDimension = null;
      if (accountId || reportId) {
        const { data: budgets, error: budgetError } = await supabase
          .from('budgets')
          .select('id')
          .or(`report_id.eq.${reportId},account_id.eq.${accountId}`)
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
            account_id: accountId,
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
      
      console.log('[testing] Dimensions loaded, waiting for loadAllViews to set visibility');
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