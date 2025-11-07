import { supabase } from "@/integrations/supabase/client";

/**
 * Fallback authentication method for CORS issues
 */
export async function fallbackAuth() {
  try {
    console.log('[FALLBACK-AUTH] Attempting fallback authentication...');
    
    // Try to get session with different approach
    const { data, error } = await supabase.auth.getUser();
    
    if (error) {
      console.error('[FALLBACK-AUTH] getUser failed:', error);
      
      // Try alternative session retrieval
      try {
        const sessionData = localStorage.getItem('supabase.auth.token');
        if (sessionData) {
          const parsedSession = JSON.parse(sessionData);
          console.log('[FALLBACK-AUTH] Found stored session data');
          return { session: parsedSession, error: null };
        }
      } catch (storageError) {
        console.error('[FALLBACK-AUTH] Error reading stored session:', storageError);
      }
      
      return { session: null, error };
    }
    
    console.log('[FALLBACK-AUTH] Successfully retrieved user');
    return { session: data, error: null };
    
  } catch (error) {
    console.error('[FALLBACK-AUTH] Fallback authentication failed:', error);
    return { session: null, error };
  }
}

/**
 * Clear all authentication data and force re-login
 */
export async function clearAuthAndReload() {
  try {
    console.log('[AUTH-CLEAR] Clearing all authentication data...');
    
    // Clear Supabase session
    await supabase.auth.signOut();
    
    // Clear localStorage
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('supabase.')) {
        localStorage.removeItem(key);
      }
    });
    
    // Clear sessionStorage
    Object.keys(sessionStorage).forEach(key => {
      if (key.startsWith('supabase.')) {
        sessionStorage.removeItem(key);
      }
    });
    
    console.log('[AUTH-CLEAR] Authentication data cleared');
    
    // Reload the page to start fresh
    window.location.reload();
    
  } catch (error) {
    console.error('[AUTH-CLEAR] Error clearing auth data:', error);
    // Force reload anyway
    window.location.reload();
  }
}

/**
 * Check if we're in a CORS-blocked state and suggest solutions
 */
export function checkCORSIssues() {
  const currentOrigin = window.location.origin;
  console.log('[CORS-CHECK] Current origin:', currentOrigin);
  
  const expectedOrigins = [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:8080',
    'http://localhost:8081'
  ];
  
  if (!expectedOrigins.includes(currentOrigin)) {
    console.warn('[CORS-CHECK] Unexpected origin detected:', currentOrigin);
    console.warn('[CORS-CHECK] Expected origins:', expectedOrigins);
    return {
      hasCORSIssue: true,
      currentOrigin,
      suggestedOrigins: expectedOrigins
    };
  }
  
  return {
    hasCORSIssue: false,
    currentOrigin,
    suggestedOrigins: expectedOrigins
  };
}
