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

interface UsePerformanceTableDimensionsRobustOptions {
  reportId: string | null;
  accountId?: string;
  onColumnOrderInit?: (order: string[]) => void;
}

export function usePerformanceTableDimensionsRobust({
  reportId,
  accountId,
  onColumnOrderInit,
}: UsePerformanceTableDimensionsRobustOptions) {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [dimensionHasData, setDimensionHasData] = useState<Record<string, boolean>>({});
  const [isLoadingDimensions, setIsLoadingDimensions] = useState(true);
  const [dimensionError, setDimensionError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Robust dimension loading with multiple strategies
  const loadDimensionsWithFallbacks = useCallback(async (reportId: string, userId: string, resolvedAccountId?: string) => {
    const strategies = [
      // Strategy 1: Load all dimension types (preferred)
      async () => {
        console.log('[ROBUST-DIMS] Trying comprehensive dimension loading');
        const queries = [];
        
        // Account dimensions
        if (resolvedAccountId) {
          queries.push(
            supabase
              .from("dimensions")
              .select("*")
              .eq("scope", "account")
              .eq("account_id", resolvedAccountId)
          );
        }
        
        // Global dimensions
        queries.push(
          supabase
            .from("dimensions")
            .select("*")
            .eq("scope", "global")
        );
        
        // Custom dimensions
        queries.push(
          supabase
            .from("dimensions")
            .select("*")
            .eq("user_id", userId)
            .eq("scope", "custom")
            .eq("report_id", reportId)
        );
        
        const results = await Promise.allSettled(queries);
        const allDimensions: any[] = [];
        
        results.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value.data) {
            allDimensions.push(...result.value.data);
          } else if (result.status === 'rejected') {
            console.warn(`[ROBUST-DIMS] Query ${index} failed:`, result.reason);
          }
        });
        
        return allDimensions;
      },
      
      // Strategy 2: Load only global and custom dimensions
      async () => {
        console.log('[ROBUST-DIMS] Trying global + custom dimension loading');
        const [globalResult, customResult] = await Promise.allSettled([
          supabase.from("dimensions").select("*").eq("scope", "global"),
          supabase.from("dimensions").select("*").eq("user_id", userId).eq("scope", "custom")
        ]);
        
        const dimensions: any[] = [];
        if (globalResult.status === 'fulfilled' && globalResult.value.data) {
          dimensions.push(...globalResult.value.data);
        }
        if (customResult.status === 'fulfilled' && customResult.value.data) {
          dimensions.push(...customResult.value.data);
        }
        
        return dimensions;
      },
      
      // Strategy 3: Load only global dimensions
      async () => {
        console.log('[ROBUST-DIMS] Trying global-only dimension loading');
        const { data, error } = await supabase
          .from("dimensions")
          .select("*")
          .eq("scope", "global");
        
        if (error) throw error;
        return data || [];
      },
      
      // Strategy 4: Create fallback dimensions
      async () => {
        console.log('[ROBUST-DIMS] Creating fallback dimensions');
        return [
          {
            id: 'fallback-date',
            name: 'Date',
            type: 'date',
            scope: 'fallback',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'fallback-impressions',
            name: 'Impressions',
            type: 'number',
            scope: 'fallback',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'fallback-clicks',
            name: 'Clicks',
            type: 'number',
            scope: 'fallback',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'fallback-cost',
            name: 'Cost',
            type: 'currency',
            scope: 'fallback',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
        ];
      }
    ];

    let lastError: Error | null = null;
    
    for (let i = 0; i < strategies.length; i++) {
      try {
        const result = await strategies[i]();
        console.log(`[ROBUST-DIMS] Strategy ${i + 1} succeeded with ${result.length} dimensions`);
        return result;
      } catch (error) {
        console.warn(`[ROBUST-DIMS] Strategy ${i + 1} failed:`, error);
        lastError = error as Error;
        
        // Add delay between strategies
        if (i < strategies.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
    
    throw lastError || new Error('All dimension loading strategies failed');
  }, []);

  // Check data availability with error handling
  const checkDataAvailability = useCallback(async (dimensionIds: string[], reportId: string) => {
    try {
      console.log('[ROBUST-DIMS] Checking data availability for', dimensionIds.length, 'dimensions');
      const hasDataMap = await checkDimensionsHaveData(dimensionIds, reportId);
      console.log('[ROBUST-DIMS] Data availability results:', hasDataMap);
      setDimensionHasData(hasDataMap);
    } catch (error) {
      console.error('[ROBUST-DIMS] Error checking dimension data availability:', error);
      // Set all dimensions as having data to prevent UI issues
      const fallbackMap = dimensionIds.reduce((acc, id) => ({ ...acc, [id]: true }), {});
      setDimensionHasData(fallbackMap);
    }
  }, []);

  // Main dimension loading function
  const loadDimensions = useCallback(async () => {
    if (!reportId) {
      console.log('[ROBUST-DIMS] No reportId provided, skipping dimension loading');
      setIsLoadingDimensions(false);
      return;
    }
    
    try {
      setIsLoadingDimensions(true);
      setDimensionError(null);
      console.log('[ROBUST-DIMS] Starting robust dimension loading for report:', reportId);
      
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error("User not authenticated");
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
          
          if (!reportError && reportData) {
            resolvedAccountId = reportData.account_id || undefined;
          }
        } catch (reportFetchError) {
          console.warn('[ROBUST-DIMS] Error resolving account ID:', reportFetchError);
        }
      }

      console.log('[ROBUST-DIMS] Loading dimensions for user:', user.id, 'account:', resolvedAccountId, 'report:', reportId);

      // Load dimensions with fallback strategies
      const rawDimensions = await loadDimensionsWithFallbacks(reportId, user.id, resolvedAccountId);
      
      // Deduplicate dimensions by name (keep first occurrence)
      const seenNames = new Set<string>();
      const uniqueDimensions = rawDimensions.filter(dim => {
        if (!dim || !dim.name || seenNames.has(dim.name.toLowerCase().trim())) {
          return false;
        }
        seenNames.add(dim.name.toLowerCase().trim());
        return true;
      });

      console.log('[ROBUST-DIMS] Final dimensions loaded:', {
        total: uniqueDimensions.length,
        byScope: uniqueDimensions.reduce((acc, d) => {
          acc[d.scope || 'unknown'] = (acc[d.scope || 'unknown'] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        accountId: resolvedAccountId
      });

      // Check for budgets and add virtual budget dimension if needed
      let budgetDimension = null;
      if (resolvedAccountId || reportId) {
        try {
          const { data: budgets, error: budgetError } = await supabase
            .from('budgets')
            .select('id')
            .or(`report_id.eq.${reportId},account_id.eq.${resolvedAccountId}`)
            .limit(1);

          if (!budgetError && budgets && budgets.length > 0) {
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
            console.log('[ROBUST-DIMS] Budget dimension added');
          }
        } catch (budgetCheckError) {
          console.warn('[ROBUST-DIMS] Error checking for budgets:', budgetCheckError);
        }
      }

      // Add Budget dimension if it exists
      const finalDimensions = budgetDimension 
        ? [...uniqueDimensions, budgetDimension]
        : uniqueDimensions;

      // Ensure we have at least some basic dimensions
      if (finalDimensions.length === 0) {
        console.warn('[ROBUST-DIMS] No dimensions loaded! Using fallback dimensions.');
        const fallbackDimensions = await loadDimensionsWithFallbacks(reportId, user.id, resolvedAccountId);
        finalDimensions.push(...fallbackDimensions);
      }

      // Set dimensions
      console.log('[ROBUST-DIMS] Setting dimensions:', finalDimensions.length);
      setDimensions(finalDimensions);
      
      // Check data availability
      if (reportId && finalDimensions.length > 0) {
        await checkDataAvailability(finalDimensions.map(d => d.id), reportId);
      }
      
      // Initialize column order
      if (onColumnOrderInit) {
        try {
          const numericDimensions = finalDimensions.filter(d => 
            d.type === 'number' || d.type === 'currency' || d.type === 'percentage' || d.formula
          );
          const orderIds = numericDimensions.map(d => d.id);
          onColumnOrderInit(orderIds);
          console.log('[ROBUST-DIMS] Initialized column order with', orderIds.length, 'numeric dimensions');
        } catch (columnOrderError) {
          console.error('[ROBUST-DIMS] Error initializing column order:', columnOrderError);
        }
      }
      
      setRetryCount(0); // Reset retry count on success
      console.log('[ROBUST-DIMS] Dimensions loaded successfully');
      
    } catch (error) {
      console.error("[ROBUST-DIMS] Error loading dimensions:", error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Implement retry logic for transient errors
      if (retryCount < 2 && (
        errorMessage.includes('network') || 
        errorMessage.includes('timeout') || 
        errorMessage.includes('fetch')
      )) {
        console.log(`[ROBUST-DIMS] Retrying... (attempt ${retryCount + 1})`);
        setRetryCount(prev => prev + 1);
        setTimeout(() => loadDimensions(), 1000 * (retryCount + 1));
        return;
      }
      
      setDimensionError(errorMessage);
      setDimensions([]);
      setDimensionHasData({});
    } finally {
      setIsLoadingDimensions(false);
    }
  }, [reportId, accountId, loadDimensionsWithFallbacks, checkDataAvailability, onColumnOrderInit, retryCount]);

  return {
    dimensions,
    dimensionHasData,
    isLoadingDimensions,
    dimensionError,
    retryCount,
    loadDimensions,
  };
}