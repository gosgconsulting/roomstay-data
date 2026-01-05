import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { LogOut, BarChart3, TrendingUp, Plus, DollarSign, Rocket, ChevronRight, Trash2, Pencil } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { CreateAccountModal } from "@/components/CreateAccountModal";
import { DeleteAccountDialog } from "@/components/DeleteAccountDialog";
import { EditAccountModal } from "@/components/EditAccountModal";
import { useQueryClient } from "@tanstack/react-query";
import { authKeys } from "@/lib/auth";

interface Account {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  user_id: string;
}

interface Tool {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  getPath: (accountId: string) => string;
  available: boolean;
  badge?: string;
}

export default function Landing() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<Account | null>(null);
  const [createAccountOpen, setCreateAccountOpen] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<Account | null>(null);
  const [editAccountOpen, setEditAccountOpen] = useState(false);
  const [accountToEdit, setAccountToEdit] = useState<Account | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  // Check for account query parameter and auto-select account
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const accountParam = urlParams.get('account');
    
    if (accountParam && accounts.length > 0 && !selectedAccount) {
      const account = accounts.find(a => a.id === accountParam);
      if (account) {
        setSelectedAccount(account);
      }
    }
  }, [accounts]);

  const checkAuth = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) throw error;
      
      if (!session) {
        navigate('/auth');
        return;
      }
      
      setSession(session);
      
      // Load user's accounts
      const { data: accountsData, error: accountsError } = await supabase
        .from('accounts')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });
      
      if (accountsError) throw accountsError;
      
      setAccounts(accountsData || []);
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

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      // Invalidate React Query cache on sign out
      queryClient.invalidateQueries({ queryKey: authKeys.user() });
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
    if (!session?.user) return;
    
    try {
      const { data, error } = await supabase
        .from('accounts')
        .insert({
          user_id: session.user.id,
          name,
          description: description || null,
        })
        .select()
        .single();

      if (error) throw error;

      setAccounts(prev => [data, ...prev]);
      setCreateAccountOpen(false);
      toast({
        title: "Success",
        description: "Account created successfully.",
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

  const handleDeleteAccount = async () => {
    if (!accountToDelete) return;

    try {
      const { error } = await supabase
        .from('accounts')
        .delete()
        .eq('id', accountToDelete.id);

      if (error) throw error;

      setAccounts(prev => prev.filter(a => a.id !== accountToDelete.id));
      if (selectedAccount?.id === accountToDelete.id) {
        setSelectedAccount(null);
      }
      setDeleteAccountOpen(false);
      setAccountToDelete(null);
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

  const handleEditAccount = async (name: string, description: string) => {
    if (!accountToEdit) return;

    try {
      const { error } = await supabase
        .from('accounts')
        .update({ name, description: description || null })
        .eq('id', accountToEdit.id);

      if (error) throw error;

      setAccounts(prev => prev.map(a => 
        a.id === accountToEdit.id ? { ...a, name, description } : a
      ));
      if (selectedAccount?.id === accountToEdit.id) {
        setSelectedAccount({ ...selectedAccount, name, description });
      }
      setEditAccountOpen(false);
      setAccountToEdit(null);
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

  const tools: Tool[] = [
    {
      id: "report",
      name: "Data Studio",
      description: "Looker Studio feature for adding and managing data sources",
      icon: <BarChart3 className="h-6 w-6" />,
      getPath: (accountId: string) => `/tools/data/${accountId}`,
      available: true,
    },
    {
      id: "forecasting",
      name: "Forecasting",
      description: "Predict future trends and performance",
      icon: <TrendingUp className="h-6 w-6" />,
      getPath: (accountId: string) => `/tools/forecasting/${accountId}`,
      available: true,
    },
    {
      id: "budget",
      name: "Budget",
      description: "Manage budgets and allocations",
      icon: <DollarSign className="h-6 w-6" />,
      getPath: (accountId: string) => `/tools/budget/${accountId}`,
      available: true,
    },
    {
      id: "alerts",
      name: "Alerts",
      description: "Get notified of important changes",
      icon: <Rocket className="h-6 w-6" />,
      getPath: (accountId: string) => `#`,
      available: false,
      badge: "Soon",
    },
  ];

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
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Select a tool to get started</p>
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
        <div className="max-w-4xl mx-auto">
          {!selectedAccount ? (
            <>
              {/* Account Selection View */}
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-3xl font-bold">Select Account</h2>
                    <p className="text-muted-foreground mt-1">Choose an account to access your analytics tools</p>
                  </div>
                  <Button onClick={() => setCreateAccountOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Account
                  </Button>
                </div>
              </div>

              {accounts.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {accounts.map((account) => (
                    <Card
                      key={account.id}
                      className="hover:shadow-lg hover:border-primary/50 cursor-pointer transition-all group"
                    >
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex-1" onClick={() => setSelectedAccount(account)}>
                            <CardTitle className="text-xl group-hover:text-primary transition-colors">
                              {account.name}
                            </CardTitle>
                            {account.description && (
                              <CardDescription className="mt-2">
                                {account.description}
                              </CardDescription>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAccountToEdit(account);
                                setEditAccountOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4 text-muted-foreground" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => {
                                e.stopPropagation();
                                setAccountToDelete(account);
                                setDeleteAccountOpen(true);
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                            <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card className="text-center py-12">
                  <CardHeader>
                    <CardTitle>No Accounts Found</CardTitle>
                    <CardDescription>
                      Create your first account to start using the analytics tools
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button onClick={() => setCreateAccountOpen(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Create Account
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <>
              {/* Show both account list and tools when an account is selected */}
              <div className="space-y-8">
                {/* Account List Section */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-2xl font-bold">Accounts</h2>
                    <Button onClick={() => setCreateAccountOpen(true)} size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      Create Account
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 gap-3">
                    {accounts.map((account) => (
                      <Card
                        key={account.id}
                        className={`cursor-pointer transition-all group ${
                          selectedAccount?.id === account.id
                            ? "border-primary shadow-md"
                            : "hover:shadow-md hover:border-primary/50"
                        }`}
                        onClick={() => setSelectedAccount(account)}
                      >
                        <CardHeader className="py-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <CardTitle className={`text-base ${
                                selectedAccount?.id === account.id ? "text-primary" : ""
                              }`}>
                                {account.name}
                              </CardTitle>
                              {account.description && (
                                <CardDescription className="text-xs mt-1">
                                  {account.description}
                                </CardDescription>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAccountToEdit(account);
                                  setEditAccountOpen(true);
                                }}
                              >
                                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAccountToDelete(account);
                                  setDeleteAccountOpen(true);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                              {selectedAccount?.id === account.id && (
                                <ChevronRight className="h-4 w-4 text-primary" />
                              )}
                            </div>
                          </div>
                        </CardHeader>
                      </Card>
                    ))}
                  </div>
                </div>

                {/* Tools Section */}
                <div>
                  <div className="mb-4">
                    <h2 className="text-2xl font-bold">{selectedAccount.name}</h2>
                    <p className="text-muted-foreground mt-1">
                      {selectedAccount.description || "Select a tool to get started"}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {tools.map((tool) => (
                      <Card
                        key={tool.id}
                        className={`${
                          tool.available
                            ? "hover:shadow-lg hover:border-primary/50 cursor-pointer transition-all group"
                            : "opacity-60 cursor-not-allowed"
                        }`}
                        onClick={() => {
                          if (tool.available) {
                            navigate(tool.getPath(selectedAccount.id));
                          }
                        }}
                      >
                        <CardHeader>
                          <div className="flex items-start justify-between">
                            <div className={`p-3 rounded-lg ${tool.available ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                              {tool.icon}
                            </div>
                            {tool.badge && (
                              <Badge variant="secondary" className="text-xs">
                                {tool.badge}
                              </Badge>
                            )}
                          </div>
                          <CardTitle className="mt-4 flex items-center gap-2">
                            {tool.name}
                          </CardTitle>
                          <CardDescription>{tool.description}</CardDescription>
                        </CardHeader>
                        <CardContent>
                          {tool.available ? (
                            <Button className="w-full">
                              Open {tool.name}
                              <ChevronRight className="h-4 w-4 ml-2" />
                            </Button>
                          ) : (
                            <Button disabled className="w-full">
                              Coming Soon
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Modals */}
      <CreateAccountModal
        open={createAccountOpen}
        onOpenChange={setCreateAccountOpen}
        onCreate={handleCreateAccount}
      />

      <DeleteAccountDialog
        open={deleteAccountOpen}
        onOpenChange={setDeleteAccountOpen}
        accountName={accountToDelete?.name || ""}
        onDelete={handleDeleteAccount}
      />

      <EditAccountModal
        open={editAccountOpen}
        onOpenChange={setEditAccountOpen}
        account={accountToEdit}
        onEdit={handleEditAccount}
      />
    </div>
  );
}
