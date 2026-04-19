import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUser } from "@/lib/auth";

export interface UserAccount {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  user_id: string;
}

const ACCOUNT_QUERY_KEY = ["user-account"] as const;

async function fetchUserAccount(userId: string | undefined): Promise<{
  account: UserAccount | null;
  accounts: UserAccount[];
  allowedViewIds: string[] | null; // null = all views allowed (admin/no restriction)
  error: Error | null;
}> {
  if (!userId) {
    return { account: null, accounts: [], allowedViewIds: null, error: null };
  }

  // 1. Try accounts owned directly by this user
  const { data: ownedAccounts, error: ownedError } = await supabase
    .from("accounts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (ownedError) {
    return { account: null, accounts: [], allowedViewIds: null, error: ownedError };
  }

  if (ownedAccounts && ownedAccounts.length > 0) {
    // Owner — no view restrictions
    const accounts = ownedAccounts as UserAccount[];
    return { account: accounts[0], accounts, allowedViewIds: null, error: null };
  }

  // 2. Fall back to user_account_access (granted by admin)
  const { data: accessRows, error: accessError } = await supabase
    .from("user_account_access")
    .select("account_id")
    .eq("user_id", userId);

  if (accessError) {
    return { account: null, accounts: [], allowedViewIds: null, error: accessError };
  }

  const accountIds = (accessRows || []).map((r: any) => r.account_id);
  if (accountIds.length === 0) {
    return { account: null, accounts: [], allowedViewIds: null, error: null };
  }

  const { data: grantedAccounts, error: grantedError } = await supabase
    .from("accounts")
    .select("*")
    .in("id", accountIds)
    .order("created_at", { ascending: false });

  if (grantedError) {
    return { account: null, accounts: [], allowedViewIds: null, error: grantedError };
  }

  // 3. Fetch allowed views for this user
  const { data: viewAccessRows, error: viewAccessError } = await supabase
    .from("user_view_access")
    .select("view_id")
    .eq("user_id", userId);

  if (viewAccessError) {
    console.warn("[useUserAccount] Could not fetch view access:", viewAccessError.message);
  }

  const allowedViewIds =
    viewAccessRows && viewAccessRows.length > 0
      ? viewAccessRows.map((r: any) => r.view_id)
      : null; // null = no restriction (Master access)

  const accounts = (grantedAccounts || []) as UserAccount[];
  return { account: accounts[0] ?? null, accounts, allowedViewIds, error: null };
}

/**
 * Returns the first (primary) account for the currently logged-in user.
 * Checks both owned accounts and admin-granted access (user_account_access).
 * Also returns allowedViewIds: null means all views, array means restricted to those IDs.
 */
export function useUserAccount(): {
  account: UserAccount | null;
  accounts: UserAccount[];
  allowedViewIds: string[] | null;
  isLoading: boolean;
  error: Error | null;
} {
  const { data: userData } = useUser();
  const userId = userData?.user?.id;

  const { data, isLoading, error } = useQuery({
    queryKey: [...ACCOUNT_QUERY_KEY, userId ?? "none"],
    queryFn: () => fetchUserAccount(userId),
    enabled: !!userId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  return {
    account: data?.account ?? null,
    accounts: data?.accounts ?? [],
    allowedViewIds: data?.allowedViewIds ?? null,
    isLoading,
    error: error ?? data?.error ?? null,
  };
}
