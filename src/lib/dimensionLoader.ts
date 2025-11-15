import { supabase } from "@/integrations/supabase/client";

export interface Dimension {
  id: string;
  name: string;
  type: string;
}

/**
 * Gets the account ID from a report
 * @param reportId - The ID of the report
 * @returns Promise<string | null> - The account ID or null if not found
 */
export async function getAccountIdFromReport(reportId: string): Promise<string | null> {
  const { data: reportData } = await supabase
    .from('reports')
    .select('account_id')
    .eq('id', reportId)
    .single();
  
  return reportData?.account_id || null;
}

/**
 * Loads dimensions for a user, prioritizing by scope:
 * 1. Account-specific dimensions (highest priority)
 * 2. Custom dimensions (user-specific)
 * 3. Global dimensions (templates/fallback)
 * 4. Vlookup dimensions (special type)
 * 
 * @param userId - The ID of the user
 * @param reportId - Optional report ID to get account-specific dimensions
 * @param includeVlookup - Whether to include vlookup dimensions (default: false)
 * @returns Promise<Dimension[]> - Array of unique dimensions
 */
export async function loadDimensionsForUser(
  userId: string,
  reportId?: string,
  includeVlookup: boolean = false
): Promise<Dimension[]> {
  console.log('[testing] DimensionSelectorModal - Loading dimensions for user:', userId, 'includeVlookup:', includeVlookup);

  let accountId: string | null = null;
  let accountData: Dimension[] | null = null;

  // Load account-specific dimensions if reportId is provided
  if (reportId) {
    accountId = await getAccountIdFromReport(reportId);
    
    if (accountId) {
      const { data: accData, error: accountError } = await supabase
        .from("dimensions")
        .select("*")
        .eq("scope", "account")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false });

      if (accountError) throw accountError;
      accountData = accData as Dimension[];
      console.log('[testing] DimensionSelectorModal - Loaded account-specific dimensions:', accData?.length || 0);
    }
  }

  // Load global dimensions (templates)
  const { data: globalData, error: globalError } = await supabase
    .from("dimensions")
    .select("*")
    .eq("scope", "global")
    .order("created_at", { ascending: false });

  if (globalError) throw globalError;

  // Load user's custom dimensions
  const { data: customData, error: customError } = await supabase
    .from("dimensions")
    .select("*")
    .eq("scope", "custom")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (customError) throw customError;

  // Load vlookup dimensions if requested
  let vlookupData: Dimension[] = [];
  if (includeVlookup) {
    const { data: vlookup, error: vlookupError } = await supabase
      .from("dimensions")
      .select("*")
      .eq("type", "vlookup")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (vlookupError) throw vlookupError;
    vlookupData = vlookup as Dimension[];
  }

  // Combine all dimensions with priority: account > custom > global > vlookup
  const allDimensions = [
    ...(accountData || []),
    ...(customData || []),
    ...(globalData || []),
    ...vlookupData
  ];

  // Remove duplicates by name, keeping the first occurrence (most specific scope)
  const uniqueDimensions = allDimensions.filter((dim, index, arr) => 
    arr.findIndex(d => d.name === dim.name) === index
  );

  console.log('[testing] DimensionSelectorModal - Loaded dimensions:', {
    global: globalData?.length || 0,
    account: accountData?.length || 0,
    custom: customData?.length || 0,
    vlookup: vlookupData?.length || 0,
    total: uniqueDimensions.length
  });

  return uniqueDimensions;
}