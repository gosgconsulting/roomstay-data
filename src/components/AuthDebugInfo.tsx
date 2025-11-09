import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function AuthDebugInfo() {
  const [authInfo, setAuthInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAuthInfo();
  }, []);

  const loadAuthInfo = async () => {
    try {
      // Get session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      // Get user with fallback to session user
      let user = null;
      let userError = null;
      
      try {
        const { data: { user: fetchedUser }, error: fetchError } = await supabase.auth.getUser();
        user = fetchedUser;
        userError = fetchError;
      } catch (err) {
        console.log('[AUTH-DEBUG] getUser() failed, falling back to session user:', err);
        // Fallback to session user if getUser() fails
        if (session?.user) {
          user = session.user;
          userError = null;
        } else {
          userError = err;
        }
      }
      
      // Test direct account query
      let accountsResult = null;
      let accountsError = null;
      
      if (user) {
        try {
          const { data, error } = await supabase
            .from('accounts')
            .select('id, name, user_id')
            .eq('user_id', user.id);
          
          accountsResult = data;
          accountsError = error;
        } catch (err) {
          accountsError = err;
        }
      }

      setAuthInfo({
        session: {
          exists: !!session,
          userId: session?.user?.id,
          error: sessionError?.message
        },
        user: {
          exists: !!user,
          userId: user?.id,
          email: user?.email,
          error: userError?.message
        },
        accounts: {
          data: accountsResult,
          count: accountsResult?.length || 0,
          error: accountsError?.message
        }
      });
    } catch (error) {
      console.error('Auth debug error:', error);
    } finally {
      setLoading(false);
    }
  };

  const refreshAuth = async () => {
    setLoading(true);
    try {
      console.log('[AUTH-DEBUG] Refreshing session...');
      const { error } = await supabase.auth.refreshSession();
      if (error) {
        console.error('[AUTH-DEBUG] Session refresh error:', error);
      } else {
        console.log('[AUTH-DEBUG] Session refreshed successfully');
      }
      await loadAuthInfo();
    } catch (error) {
      console.error('[AUTH-DEBUG] Refresh error:', error);
      setLoading(false);
    }
  };

  const forceReload = async () => {
    setLoading(true);
    try {
      // Clear any cached auth state
      console.log('[AUTH-DEBUG] Force reloading auth state...');
      
      // Sign out and back in to reset auth state
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        await supabase.auth.refreshSession();
      }
      
      await loadAuthInfo();
    } catch (error) {
      console.error('[AUTH-DEBUG] Force reload error:', error);
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      await supabase.auth.signOut();
      window.location.href = '/auth';
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  if (loading) {
    return <div>Loading auth debug info...</div>;
  }

  return (
    <Card className="mb-4 border-blue-200 bg-blue-50">
      <CardHeader>
        <CardTitle className="text-blue-800">🔐 Authentication Debug Info</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <strong>Session:</strong>
          <ul className="ml-4 mt-1">
            <li>Exists: {authInfo.session.exists ? '✅' : '❌'}</li>
            <li>User ID: {authInfo.session.userId || 'None'}</li>
            {authInfo.session.error && <li className="text-red-600">Error: {authInfo.session.error}</li>}
          </ul>
        </div>
        
        <div>
          <strong>User:</strong>
          <ul className="ml-4 mt-1">
            <li>Exists: {authInfo.user.exists ? '✅' : '❌'}</li>
            <li>User ID: {authInfo.user.userId || 'None'}</li>
            <li>Email: {authInfo.user.email || 'None'}</li>
            {authInfo.user.error && <li className="text-red-600">Error: {authInfo.user.error}</li>}
          </ul>
        </div>
        
        <div>
          <strong>Accounts Query:</strong>
          <ul className="ml-4 mt-1">
            <li>Count: {authInfo.accounts.count}</li>
            {authInfo.accounts.error && <li className="text-red-600">Error: {authInfo.accounts.error}</li>}
            {authInfo.accounts.data && (
              <li>
                Accounts: 
                <ul className="ml-4">
                  {authInfo.accounts.data.map((acc: any) => (
                    <li key={acc.id}>{acc.name} ({acc.id})</li>
                  ))}
                </ul>
              </li>
            )}
          </ul>
        </div>
        
        <div className="flex gap-2 flex-wrap">
          <Button onClick={refreshAuth} variant="outline" size="sm">
            Refresh Session
          </Button>
          <Button onClick={forceReload} variant="outline" size="sm">
            Force Reload
          </Button>
          <Button onClick={loadAuthInfo} variant="outline" size="sm">
            Reload Info
          </Button>
          <Button onClick={signOut} variant="destructive" size="sm">
            Sign Out
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
