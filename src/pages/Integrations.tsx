import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useComposioProxy } from '@/hooks/useComposioProxy';
import { supabase } from '@/integrations/supabase/client';
import { LogOut, Plug, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { toast } from '@/hooks/use-toast';

export default function Integrations() {
  const navigate = useNavigate();
  const { passthrough, isAuthenticated, authLoading } = useComposioProxy();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; count?: number } | null>(null);

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const data = await passthrough('/apps', 'GET') as { items?: unknown[]; [key: string]: unknown };
      const items = Array.isArray(data?.items) ? data.items : (Array.isArray(data) ? data : []);
      const count = items.length;
      setTestResult({
        ok: true,
        message: count > 0 ? `${count} apps available` : 'Connection OK (no apps list)',
        count,
      });
      toast({ title: 'Composio connected', description: count > 0 ? `${count} apps available` : 'Connection successful.' });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Connection failed';
      setTestResult({ ok: false, message });
      toast({ variant: 'destructive', title: 'Composio test failed', description: message });
    } finally {
      setTesting(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-muted flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isAuthenticated) {
    navigate('/auth');
    return null;
  }

  return (
    <div className="min-h-screen bg-muted p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Integrations</h1>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Plug className="h-5 w-5" />
              Composio
            </CardTitle>
            <CardDescription>
              Connect third-party apps (Gmail, Slack, GitHub, etc.) via Composio. Test the connection below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <Button
                onClick={handleTestConnection}
                disabled={testing}
              >
                {testing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Test Composio connection
              </Button>
              {testResult && (
                <span className="flex items-center gap-2">
                  {testResult.ok ? (
                    <Badge variant="secondary" className="gap-1">
                      <CheckCircle className="h-3.5 w-3.5" />
                      Configured
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      <XCircle className="h-3.5 w-3.5" />
                      Error
                    </Badge>
                  )}
                </span>
              )}
            </div>
            {testResult && (
              <p className={testResult.ok ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}>
                {testResult.message}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
