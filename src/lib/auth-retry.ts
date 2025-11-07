import { supabase } from "@/integrations/supabase/client";

/**
 * Check database connection health
 */
async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}

/**
 * Retry authentication with exponential backoff and connection health checks
 */
export async function retryAuth(maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[AUTH-RETRY] Attempt ${attempt}/${maxRetries}`);
      
      // Check database connection first
      const isConnected = await checkDatabaseConnection();
      if (!isConnected && attempt < maxRetries) {
        console.warn(`[AUTH-RETRY] Database connection check failed on attempt ${attempt}`);
        const delay = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
        console.log(`[AUTH-RETRY] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (!error) {
        console.log(`[AUTH-RETRY] Success on attempt ${attempt}`);
        return { data: { session }, error: null };
      }
      
      console.warn(`[AUTH-RETRY] Error on attempt ${attempt}:`, error);
      
      if (attempt === maxRetries) {
        return { data: { session: null }, error };
      }
      
      const delay = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
      console.log(`[AUTH-RETRY] Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      
    } catch (err) {
      console.error(`[AUTH-RETRY] Network error on attempt ${attempt}:`, err);
      
      if (attempt === maxRetries) {
        return { 
          data: { session: null }, 
          error: { message: `Authentication failed after ${maxRetries} attempts. Please check your connection and try again.` }
        };
      }
      
      const delay = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
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
      
      // Check if it's a connection timeout error
      const isTimeout = result.error?.message?.includes('timeout') || 
                       result.error?.message?.includes('544') ||
                       result.error?.code === 'PGRST301';
      
      console.warn(`[SUPABASE-RETRY] ${operation} - Error on attempt ${attempt}:`, result.error);
      
      if (attempt === maxRetries) {
        if (isTimeout) {
          return { 
            data: null, 
            error: { 
              ...result.error,
              message: 'Database connection timeout. Please try again or contact support if the issue persists.' 
            }
          };
        }
        return result;
      }
      
      // Longer delay for timeout errors
      const delay = isTimeout 
        ? Math.min(3000 * Math.pow(2, attempt - 1), 15000)
        : Math.min(1000 * Math.pow(2, attempt - 1), 5000);
      console.log(`[SUPABASE-RETRY] ${operation} - Waiting ${delay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      
    } catch (err) {
      console.error(`[SUPABASE-RETRY] ${operation} - Network error on attempt ${attempt}:`, err);
      
      if (attempt === maxRetries) {
        return { 
          data: null, 
          error: { message: `${operation} failed after ${maxRetries} attempts. Please check your connection.` }
        };
      }
      
      const delay = Math.min(2000 * Math.pow(2, attempt - 1), 10000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return { 
    data: null, 
    error: { message: `${operation} failed after ${maxRetries} attempts` }
  };
}
