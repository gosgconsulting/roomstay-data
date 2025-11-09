import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useParams, useNavigate } from 'react-router-dom';

interface Account {
  id: string;
  name: string;
  user_id: string;
  created_at: string;
}

export function AccountDebugInfo() {
  const { accountId } = useParams<{ accountId: string }>();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDebugInfo();
  }, []);

  const loadDebugInfo = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user?.id || null);

      if (user) {
        // Get user's accounts
        const { data: userAccounts } = await supabase
          .from('accounts')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        setAccounts(userAccounts || []);
      }
    } catch (error) {
      console.error('Debug info error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div>Loading debug info...</div>;
  }

  return (
    <Card className="mb-4 border-yellow-200 bg-yellow-50">
      <CardHeader>
        <CardTitle className="text-yellow-800">🐛 Account Debug Info</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <strong>Current URL Account ID:</strong> {accountId || 'None'}
        </div>
        <div>
          <strong>Current User ID:</strong> {currentUser || 'Not authenticated'}
        </div>
        <div>
          <strong>Available Accounts:</strong>
          {accounts.length === 0 ? (
            <p className="text-red-600 mt-2">No accounts found for this user</p>
          ) : (
            <div className="mt-2 space-y-2">
              {accounts.map(account => (
                <div key={account.id} className="flex items-center justify-between p-2 bg-white rounded border">
                  <div>
                    <strong>{account.name}</strong>
                    <br />
                    <small className="text-gray-500">ID: {account.id}</small>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => navigate(`/tools/report/${account.id}`)}
                    variant={accountId === account.id ? "default" : "outline"}
                  >
                    {accountId === account.id ? "Current" : "Switch"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
        {accounts.length === 0 && (
          <Button onClick={() => navigate('/tools/report')} className="w-full">
            Create Your First Account
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
