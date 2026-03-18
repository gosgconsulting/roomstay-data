import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, BarChart3, TrendingUp, ChevronRight, Presentation } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { authKeys } from "@/lib/auth";
import { useUser } from "@/lib/auth";
import { useUserAccount } from "@/hooks/useUserAccount";

interface Tool {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  getPath: (accountId: string) => string;
  available: boolean;
}

const tools: Tool[] = [
  {
    id: "reports",
    name: "Reports",
    description: "Pre-rendered data snapshots for fast performance",
    icon: <Presentation className="h-6 w-6" />,
    getPath: () => `/tools/reports`,
    available: true,
  },
  {
    id: "forecast",
    name: "Forecast",
    description: "Forecasting and scenario planning",
    icon: <TrendingUp className="h-6 w-6" />,
    getPath: () => `/tools/forecasting`,
    available: true,
  },
  {
    id: "price-widget",
    name: "Price Widget",
    description: "Price monitoring and comparison tools",
    icon: <BarChart3 className="h-6 w-6" />,
    getPath: () => `/tools/price-widget`,
    available: true,
  },
];

export default function Landing() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: userData } = useUser();
  const { account, isLoading: accountLoading } = useUserAccount();
  const session = userData?.user;

  useEffect(() => {
    if (userData && !userData.user && !userData.error) return;
    if (userData && !userData.user) {
      navigate("/auth");
      return;
    }
  }, [userData, navigate]);

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      queryClient.invalidateQueries({ queryKey: authKeys.user() });
      navigate("/auth");
    } catch (error) {
      console.error("Error signing out:", error);
      toast({
        title: "Error",
        description: "Failed to sign out.",
        variant: "destructive",
      });
    }
  };

  if (!session) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (accountLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!account) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
        <header className="border-b">
          <div className="container mx-auto px-6 py-4 flex items-center justify-between">
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <div className="flex items-center gap-4">
              <p className="text-sm font-medium">{session?.email}</p>
              <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sign out">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>
        <main className="container mx-auto px-6 py-12">
          <div className="max-w-md mx-auto text-center">
            <p className="text-muted-foreground">
              No account linked. Contact support to set up your account.
            </p>
            <Button variant="outline" className="mt-4" onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <header className="border-b">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-sm text-muted-foreground">Select a tool to get started</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium">{session?.email}</p>
              <p className="text-xs text-muted-foreground">{account.name}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-6 py-12">
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h2 className="text-2xl font-bold">{account.name}</h2>
            <p className="text-muted-foreground mt-1">Select a tool to get started</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {tools.map((tool) => (
              <Card
                key={tool.id}
                className={
                  tool.available
                    ? "hover:shadow-lg hover:border-primary/50 cursor-pointer transition-all group"
                    : "opacity-60 cursor-not-allowed"
                }
                onClick={() => {
                  if (tool.available) {
                    navigate(tool.getPath(account.id));
                  }
                }}
              >
                <CardHeader>
                  <div
                    className={`p-3 rounded-lg w-fit ${
                      tool.available ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {tool.icon}
                  </div>
                  <CardTitle className="mt-4 flex items-center gap-2">{tool.name}</CardTitle>
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
      </main>
    </div>
  );
}
