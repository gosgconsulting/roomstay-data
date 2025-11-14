import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { ArrowLeft, LogOut } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { CreateAccountModal } from "@/components/CreateAccountModal";
import { EditAccountModal } from "@/components/EditAccountModal";
import { DeleteAccountDialog } from "@/components/DeleteAccountDialog";

interface Account {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  user_id: string;
}

export default function ForecastingTool() {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) throw error;
      
      if (!session) {
        navigate('/auth');
        return;
      }
      
      setSession(session);
      await loadAccounts(session.user.id);
      setIsLoading(false);
    } catch (error) {
      console.error('Error checking auth:', error);
      setIsLoading(false);
      toast({
        title: "Authentication Error",
        description: "Please sign in again.",
        variant: "destructive",
      });
      navigate('/auth');
    }
  };

  const loadAccounts = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      setAccounts(data || []);
    } catch (error) {
      console.error('Error loading accounts:', error);
      toast({
        title: "Error",
        description: "Failed to load accounts.",
        variant: "destructive",
      });
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      navigate('/auth');
    } catch (error) {
      console.error('Error signing out:', error);
      toast({
        title: "Error",
        description: "Failed to sign out.",
        variant: "destructive",
      });
    }
  };

  const handleAccountClick = (accountId: string) => {
    navigate(`/tools/forecasting/${accountId}`);
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate('/')}
              title="Back to tools"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">Forecasting</h1>
              <p className="text-sm text-muted-foreground">Select an account to view forecasts</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium">{session?.user?.email}</p>
              <p className="text-xs text-muted-foreground">Account</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSignOut}
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-6 py-12">
        <div className="max-w-6xl mx-auto">
          {accounts.length === 0 ? (
            <div className="text-center py-12">
              <h2 className="text-2xl font-bold mb-4">No Accounts Found</h2>
              <p className="text-muted-foreground mb-6">
                Create an account in the Report tool first to use forecasting.
              </p>
              <Button onClick={() => navigate('/tools/report')}>
                Go to Report Tool
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {accounts.map((account) => (
                <Card 
                  key={account.id} 
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => handleAccountClick(account.id)}
                >
                  <CardHeader>
                    <CardTitle>{account.name}</CardTitle>
                    <CardDescription>
                      {account.description || "No description"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      Created {new Date(account.created_at).toLocaleDateString()}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
