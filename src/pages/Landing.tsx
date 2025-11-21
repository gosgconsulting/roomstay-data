import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { LogOut, BarChart3, TrendingUp, Plus, DollarSign, Rocket } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

interface Account {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
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
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);

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

  const tools: Tool[] = [
    {
      id: "report",
      name: "Reports",
      description: "Analyze performance metrics and KPIs",
      icon: <BarChart3 className="h-5 w-5" />,
      getPath: (accountId: string) => `/tools/report/${accountId}`,
      available: true,
    },
    {
      id: "forecasting",
      name: "Forecasting",
      description: "Predict future trends and performance",
      icon: <TrendingUp className="h-5 w-5" />,
      getPath: (accountId: string) => `/tools/forecasting/${accountId}`,
      available: true,
    },
    {
      id: "budget",
      name: "Budget",
      description: "Manage budgets and allocations",
      icon: <DollarSign className="h-5 w-5" />,
      getPath: (accountId: string) => `/tools/budget/${accountId}`,
      available: true,
    },
    {
      id: "alerts",
      name: "Alerts",
      description: "Get notified of important changes",
      icon: <Rocket className="h-5 w-5" />,
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
        <div className="max-w-6xl mx-auto">
          {/* Welcome Section */}
          <div className="mb-12">
            <h2 className="text-3xl font-bold mb-2">Welcome to Analytics</h2>
            <p className="text-muted-foreground">Select an account to access your tools</p>
          </div>

          {accounts.length > 0 ? (
            <div className="space-y-6">
              {accounts.map((account) => (
                <Card key={account.id} className="overflow-hidden">
                  <CardHeader className="bg-muted/50 pb-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-xl">{account.name}</CardTitle>
                        {account.description && (
                          <CardDescription className="mt-1">
                            {account.description}
                          </CardDescription>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      {tools.map((tool) => (
                        <Card
                          key={tool.id}
                          className={`relative ${
                            tool.available
                              ? "hover:shadow-md hover:border-primary/50 cursor-pointer transition-all"
                              : "opacity-60 cursor-not-allowed"
                          }`}
                          onClick={() => {
                            if (tool.available) {
                              navigate(tool.getPath(account.id));
                            }
                          }}
                        >
                          <CardHeader className="pb-3">
                            <div className="flex items-center gap-3">
                              <div className={`${tool.available ? "text-primary" : "text-muted-foreground"}`}>
                                {tool.icon}
                              </div>
                              <div className="flex-1">
                                <CardTitle className="text-base flex items-center gap-2">
                                  {tool.name}
                                  {tool.badge && (
                                    <Badge variant="secondary" className="text-xs">
                                      {tool.badge}
                                    </Badge>
                                  )}
                                </CardTitle>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent className="pb-4 pt-0">
                            <p className="text-xs text-muted-foreground">
                              {tool.description}
                            </p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </CardContent>
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
                <Button onClick={() => {
                  // TODO: Add create account modal
                  toast({
                    title: "Coming Soon",
                    description: "Account creation will be available soon.",
                  });
                }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Account
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
