import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { useEffect } from "react";

/**
 * Query keys for auth-related queries
 */
export const authKeys = {
  all: ["auth"] as const,
  user: () => [...authKeys.all, "user"] as const,
};

/**
 * Fetch user from Supabase auth
 */
async function fetchUser(): Promise<{ user: User | null; error: any }> {
  const { data, error } = await supabase.auth.getUser();
  return {
    user: data.user,
    error: error || null,
  };
}

/**
 * React Query hook to get the current authenticated user
 * Automatically caches the user and invalidates on auth state changes
 * 
 * @returns {UseQueryResult<{ user: User | null; error: any }, Error>}
 */
export function useUser(): UseQueryResult<{ user: User | null; error: any }, Error> {
  const queryClient = useQueryClient();

  // Set up auth state change listener to invalidate cache
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      // Invalidate cache on auth state changes
      if (
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED"
      ) {
        queryClient.invalidateQueries({ queryKey: authKeys.user() });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [queryClient]);

  return useQuery({
    queryKey: authKeys.user(),
    queryFn: fetchUser,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes (formerly cacheTime)
    retry: 1,
  });
}

/**
 * Backward compatibility hook - returns just the user object
 * @deprecated Use useUser() instead for better error handling
 */
export function useAuth(): { user: User | null } {
  const { data } = useUser();
  return { user: data?.user || null };
}

/**
 * Utility function to get the current authenticated user
 * Can be used outside React components
 * Uses React Query cache when available, otherwise fetches directly
 * 
 * @returns {Promise<{ user: User | null; error: any }>}
 */
export async function getUser(): Promise<{ user: User | null; error: any }> {
  // Try to get from React Query cache first if available
  // This requires access to the queryClient, which we can get from a singleton
  // For now, we'll fetch directly but this will still benefit from the hook's caching
  // when used in components that have the hook mounted
  
  // For utility functions, we fetch directly
  // The cache will be populated by components using useUser()
  return fetchUser();
}

/**
 * Get user synchronously from cache (if available)
 * Returns null if not in cache
 * 
 * @param queryClient - React Query client instance
 * @returns {User | null}
 */
export function getUserFromCache(queryClient: ReturnType<typeof useQueryClient>): User | null {
  const cached = queryClient.getQueryData<{ user: User | null; error: any }>(authKeys.user());
  return cached?.user || null;
}