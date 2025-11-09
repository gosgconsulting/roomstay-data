import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export const DatabaseHealthIndicator = () => {
  const [status, setStatus] = useState<'checking' | 'healthy' | 'slow' | 'error'>('checking');
  const [lastCheck, setLastCheck] = useState<number>(Date.now());
  const [retrying, setRetrying] = useState(false);

  const checkHealth = async () => {
    const startTime = Date.now();
    try {
      const { error } = await supabase.from('profiles').select('id').limit(1);
      const duration = Date.now() - startTime;
      
      if (error) {
        setStatus('error');
      } else if (duration > 5000) {
        setStatus('slow');
      } else {
        setStatus('healthy');
      }
      setLastCheck(Date.now());
    } catch {
      setStatus('error');
      setLastCheck(Date.now());
    }
  };

  const handleRetry = async () => {
    setRetrying(true);
    await checkHealth();
    setRetrying(false);
    // Reload the page if connection is restored
    if (status === 'healthy') {
      window.location.reload();
    }
  };

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  if (status === 'healthy') return null;

  return (
    <div className="fixed top-4 right-4 z-50 max-w-md">
      <Alert variant={status === 'error' ? 'destructive' : 'default'}>
        <div className="flex items-start gap-2">
          {status === 'checking' && <Loader2 className="h-4 w-4 animate-spin" />}
          {status === 'slow' && <AlertCircle className="h-4 w-4 text-yellow-600" />}
          {status === 'error' && <AlertCircle className="h-4 w-4" />}
          <div className="flex-1">
            <AlertDescription>
              {status === 'checking' && 'Checking database connection...'}
              {status === 'slow' && 'Database connection is slow. Some features may be delayed.'}
              {status === 'error' && 'Unable to connect to database. Please check your connection.'}
            </AlertDescription>
            {status === 'error' && (
              <Button 
                size="sm" 
                variant="outline" 
                className="mt-2"
                onClick={handleRetry}
                disabled={retrying}
              >
                {retrying ? (
                  <>
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    Retrying...
                  </>
                ) : (
                  'Retry Connection'
                )}
              </Button>
            )}
          </div>
        </div>
      </Alert>
    </div>
  );
};
