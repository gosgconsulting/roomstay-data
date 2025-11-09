import { supabase } from '@/integrations/supabase/client';
import type { User } from '@supabase/supabase-js';

/**
 * Robust user fetching with fallback to session user
 * This handles cases where supabase.auth.getUser() fails with "Failed to fetch"
 */
export async function getCurrentUser(): Promise<{ user: User | null; error: Error | null }> {
  try {
    // Try to get user directly first
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (user && !error) {
      return { user, error: null };
    }
    
    // If getUser() failed or returned no user, try session fallback
    console.log('[AUTH-UTILS] getUser() failed or returned no user, trying session fallback');
    
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError) {
      return { user: null, error: sessionError };
    }
    
    if (session?.user) {
      console.log('[AUTH-UTILS] Using session user as fallback');
      return { user: session.user, error: null };
    }
    
    return { user: null, error: error || new Error('No user found') };
    
  } catch (err) {
    console.error('[AUTH-UTILS] Error in getCurrentUser:', err);
    
    // Last resort: try session fallback
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        console.log('[AUTH-UTILS] Using session user as last resort fallback');
        return { user: session.user, error: null };
      }
    } catch (sessionErr) {
      console.error('[AUTH-UTILS] Session fallback also failed:', sessionErr);
    }
    
    return { user: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Check if user is authenticated with robust error handling
 */
export async function isAuthenticated(): Promise<boolean> {
  const { user } = await getCurrentUser();
  return !!user;
}

/**
 * Get current user ID with fallback handling
 */
export async function getCurrentUserId(): Promise<string | null> {
  const { user } = await getCurrentUser();
  return user?.id || null;
}
