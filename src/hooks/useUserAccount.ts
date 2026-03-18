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
  error: Error | null;
}> {
  if (!userId) {
    return { account: null, accounts: [], error: null };
  }
  const { data, error } = await supabase
    .from("accounts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    return { account: null, accounts: [], error };
  }
  const accounts = (data || []) as UserAccount[];
  const account = accounts[0] ?? null;
  return { account, accounts, error: null };
}

/**
 * Returns the first (primary) account for the currently logged-in user.
 * Used for post-login index: one account per user, no account selector.
 */
export function useUserAccount(): {
  account: UserAccount | null;
  accounts: UserAccount[];
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
    isLoading,
    error: error ?? data?.error ?? null,
  };
}
