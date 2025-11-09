import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { ArrowLeft, Plus, Edit2, Trash2, LogOut, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { CreateAccountModal } from "@/components/CreateAccountModal";
import { migrateAllAccountsToAccountDimensions } from "@/lib/migrate-to-account-dimensions";
import { EditAccountModal } from "@/components/EditAccountModal";
import { DeleteAccountDialog } from "@/components/DeleteAccountDialog";
import { AuthDebugInfo } from "@/components/AuthDebugInfo";

interface Account {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  user_id: string;
}

export default function ReportTool() {
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
      console.log('[REPORT-TOOL] Checking authentication...');
      
      const { data: { session }, error } = await supabase.auth.getSession();
      
      console.log('[REPORT-TOOL] Session check result:', { 
        hasSession: !!session, 
        error: error?.message,
        userId: session?.user?.id 
      });
      
      if (error) {
        console.error('[REPORT-TOOL] Session error:', error);
        throw error;
      }
      
      if (!session) {
        console.log('[REPORT-TOOL] No session found, redirecting to auth');
        navigate('/auth');
        return;
      }
      
      console.log('[REPORT-TOOL] Session valid, setting session and loading accounts');
      setSession(session);
      await loadAccounts(session.user.id);
      setIsLoading(false);
    } catch (error) {
      console.error('Error checking auth:', error);
      setIsLoading(false); // Ensure loading is stopped on error
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
      console.log('[REPORT-TOOL] Loading accounts for user:', userId);
      
      // First, let's verify the user session is still valid
      let user = null;
      let userError = null;
      
      try {
        const { data: { user: fetchedUser }, error: fetchError } = await supabase.auth.getUser();
        user = fetchedUser;
        userError = fetchError;
      } catch (err) {
        console.log('[REPORT-TOOL] getUser() failed, trying session fallback:', err);
        
        // Fallback: get user from current session
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          console.log('[REPORT-TOOL] Using session user as fallback');
          user = session.user;
          userError = null;
        } else {
          console.error('[REPORT-TOOL] No session user available');
          userError = err;
        }
      }
      
      if (userError && !user) {
        console.error('[REPORT-TOOL] User session error:', userError);
        throw new Error('Session expired. Please sign in again.');
      }
      
      if (!user) {
        console.error('[REPORT-TOOL] No user found in session');
        throw new Error('Not authenticated. Please sign in again.');
      }
      
      console.log('[REPORT-TOOL] User session valid, loading accounts...');
      
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      
      console.log('[REPORT-TOOL] Accounts query result:', { 
        data: data?.length || 0, 
        error: error?.message,
        userId 
      });
      
      if (error) {
        console.error('[REPORT-TOOL] Database error:', error);
        throw error;
      }
      
      setAccounts(data || []);
      console.log('[REPORT-TOOL] Successfully loaded', data?.length || 0, 'accounts');
      
    } catch (error) {
      console.error('[REPORT-TOOL] Error loading accounts:', error);
      
      // More specific error handling
      let errorMessage = "Failed to load accounts.";
      let shouldRetry = false;
      
      if (error instanceof Error) {
        if (error.message.includes('session') || error.message.includes('authenticated')) {
          errorMessage = "Session expired. Please sign in again.";
          setTimeout(() => navigate('/auth'), 2000);
        } else if (error.message.includes('JWT') || error.message.includes('token')) {
          errorMessage = "Authentication token invalid. Please sign in again.";
          setTimeout(() => navigate('/auth'), 2000);
        } else if (error.message.includes('row-level security') || error.message.includes('RLS')) {
          errorMessage = "Authentication issue detected. Refreshing session...";
          shouldRetry = true;
        }
      }
      
      // If it's an RLS/auth issue, try refreshing the session once
      if (shouldRetry) {
        try {
          console.log('[REPORT-TOOL] Attempting session refresh...');
          const { error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError) {
            console.log('[REPORT-TOOL] Session refreshed, retrying account load...');
            // Retry loading accounts after refresh
            setTimeout(() => loadAccounts(userId), 1000);
            return;
          }
        } catch (refreshErr) {
          console.error('[REPORT-TOOL] Session refresh failed:', refreshErr);
          errorMessage = "Session refresh failed. Please sign in again.";
          setTimeout(() => navigate('/auth'), 2000);
        }
      }
      
      toast({
        title: "Error",
        description: errorMessage,
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

  const handleCreateAccount = async (name: string, description: string) => {
    if (!session) return;
    
    try {
      // Step 1: Create the account
      const { data: newAccount, error } = await supabase
        .from('accounts')
        .insert({
          name,
          description,
          user_id: session.user.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      console.log('[ACCOUNT] Created new account:', newAccount.id, newAccount.name);
      
      // Step 2: Clone all global dimensions for this account
      const { data: globalDimensions, error: dimError } = await supabase
        .from('dimensions')
        .select('name, type, formula, user_id')
        .eq('scope', 'global');
      
      if (dimError) {
        console.warn('[ACCOUNT] Could not load global dimensions for cloning:', dimError);
      } else if (globalDimensions && globalDimensions.length > 0) {
        const accountDimensions = globalDimensions.map(d => ({
          name: d.name,
          type: d.type,
          formula: d.formula,
          scope: 'account',
          account_id: newAccount.id,
          user_id: session.user.id,
        }));
        
        const { error: insertError } = await supabase
          .from('dimensions')
          .insert(accountDimensions);
        
        if (insertError) {
          console.error('[ACCOUNT] Error cloning dimensions:', insertError);
          toast({
            title: "Warning",
            description: "Account created but some dimensions could not be initialized.",
            variant: "destructive",
          });
        } else {
          console.log('[ACCOUNT] Cloned', globalDimensions.length, 'dimensions for new account');
        }
      }
      
      setAccounts([newAccount, ...accounts]);
      setShowCreateModal(false);
      toast({
        title: "Success",
        description: `Account "${name}" created successfully with ${globalDimensions?.length || 0} standard dimensions.`,
      });
    } catch (error) {
      console.error('Error creating account:', error);
      toast({
        title: "Error",
        description: "Failed to create account.",
        variant: "destructive",
      });
    }
  };

  const handleEditAccount = async (name: string, description: string) => {
    if (!selectedAccount || !session) return;
    
    try {
      const { error } = await supabase
        .from('accounts')
        .update({ name, description })
        .eq('id', selectedAccount.id);
      
      if (error) throw error;
      
      setAccounts(accounts.map(a =>
        a.id === selectedAccount.id
          ? { ...a, name, description }
          : a
      ));
      setShowEditModal(false);
      setSelectedAccount(null);
      toast({
        title: "Success",
        description: "Account updated successfully.",
      });
    } catch (error) {
      console.error('Error updating account:', error);
      toast({
        title: "Error",
        description: "Failed to update account.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteAccount = async () => {
    if (!selectedAccount) return;
    
    try {
      const { error } = await supabase
        .from('accounts')
        .delete()
        .eq('id', selectedAccount.id);
      
      if (error) throw error;
      
      setAccounts(accounts.filter(a => a.id !== selectedAccount.id));
      setShowDeleteDialog(false);
      setSelectedAccount(null);
      toast({
        title: "Success",
        description: "Account deleted successfully.",
      });
    } catch (error) {
      console.error('Error deleting account:', error);
      toast({
        title: "Error",
        description: "Failed to delete account.",
        variant: "destructive",
      });
    }
  };

  const handleSelectAccount = (account: Account) => {
    navigate(`/tools/report/${account.id}`);
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
              <h1 className="text-2xl font-bold">Report Tool</h1>
              <p className="text-sm text-muted-foreground">Select or create an account</p>
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
          {/* Temporary auth debug info */}
          <AuthDebugInfo />
          
          {/* Section Header */}
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h2 className="text-3xl font-bold mb-2">Accounts</h2>
              <p className="text-muted-foreground">Manage your report accounts</p>
            </div>
            <div className="flex gap-2">
              <Button 
                onClick={() => {
                  setIsLoading(true);
                  checkAuth();
                }} 
                variant="outline" 
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
              <Button onClick={() => setShowCreateModal(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                New Account
              </Button>
            </div>
          </div>

          {/* Accounts Grid */}
          {accounts.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {accounts.map((account) => (
                <Card
                  key={account.id}
                  className="hover:shadow-lg transition-shadow group"
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg">{account.name}</CardTitle>
                        {account.description && (
                          <CardDescription className="mt-1">{account.description}</CardDescription>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          Created {new Date(account.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex gap-2">
                      <Button
                        className="flex-1"
                        onClick={() => handleSelectAccount(account)}
                      >
                        Open
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          setSelectedAccount(account);
                          setShowEditModal(true);
                        }}
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => {
                          setSelectedAccount(account);
                          setShowDeleteDialog(true);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground mb-4">No accounts yet</p>
                <Button onClick={() => setShowCreateModal(true)}>Create Your First Account</Button>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* Modals */}
      <CreateAccountModal
        open={showCreateModal}
        onOpenChange={setShowCreateModal}
        onCreate={handleCreateAccount}
      />

      {selectedAccount && (
        <>
          <EditAccountModal
            open={showEditModal}
            onOpenChange={setShowEditModal}
            account={selectedAccount}
            onEdit={handleEditAccount}
          />
          <DeleteAccountDialog
            open={showDeleteDialog}
            onOpenChange={setShowDeleteDialog}
            accountName={selectedAccount.name}
            onDelete={handleDeleteAccount}
          />
        </>
      )}
    </div>
  );
}
