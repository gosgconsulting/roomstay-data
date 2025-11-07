import { supabase } from "@/integrations/supabase/client";

/**
 * Retry authentication with exponential backoff
 */
export async function retryAuth(maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[AUTH-RETRY] Attempt ${attempt}/${maxRetries}`);
      
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (!error) {
        console.log(`[AUTH-RETRY] Success on attempt ${attempt}`);
        return { data: { session }, error: null };
      }
      
      console.warn(`[AUTH-RETRY] Error on attempt ${attempt}:`, error);
      
      // If this is the last attempt, throw the error
      if (attempt === maxRetries) {
        return { data: { session: null }, error };
      }
      
      // Wait before retrying (exponential backoff)
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      console.log(`[AUTH-RETRY] Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      
    } catch (err) {
      console.error(`[AUTH-RETRY] Network error on attempt ${attempt}:`, err);
      
      if (attempt === maxRetries) {
        return { 
          data: { session: null }, 
          error: { message: `Authentication failed after ${maxRetries} attempts: ${err}` }
        };
      }
      
      // Wait before retrying
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return { 
    data: { session: null }, 
    error: { message: `Authentication failed after ${maxRetries} attempts` }
  };
}

/**
 * Retry any Supabase query with exponential backoff
 */
export async function retrySupabaseQuery<T>(
  queryFn: () => Promise<{ data: T | null; error: any }>,
  maxRetries = 3,
  operation = 'query'
): Promise<{ data: T | null; error: any }> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[SUPABASE-RETRY] ${operation} - Attempt ${attempt}/${maxRetries}`);
      
      const result = await queryFn();
      
      if (!result.error) {
        console.log(`[SUPABASE-RETRY] ${operation} - Success on attempt ${attempt}`);
        return result;
      }
      
      console.warn(`[SUPABASE-RETRY] ${operation} - Error on attempt ${attempt}:`, result.error);
      
      // If this is the last attempt, return the error
      if (attempt === maxRetries) {
        return result;
      }
      
      // Wait before retrying (exponential backoff)
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      console.log(`[SUPABASE-RETRY] ${operation} - Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      
    } catch (err) {
      console.error(`[SUPABASE-RETRY] ${operation} - Network error on attempt ${attempt}:`, err);
      
      if (attempt === maxRetries) {
        return { 
          data: null, 
          error: { message: `${operation} failed after ${maxRetries} attempts: ${err}` }
        };
      }
      
      // Wait before retrying
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return { 
    data: null, 
    error: { message: `${operation} failed after ${maxRetries} attempts` }
  };
}
