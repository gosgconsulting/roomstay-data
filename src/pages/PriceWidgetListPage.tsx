import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Session } from "@supabase/supabase-js";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, LogOut, Plus, Hotel } from "lucide-react";

interface Account {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  user_id: string;
}

interface PriceWidget {
  id?: string;
  search_query: string;
  check_in_date: string;
  check_out_date: string;
  number_of_adults: number;
  number_of_children: number;
  currency_code: string;
  max_crawled_hotels?: number;
  account_id: string;
  created_at?: string;
}

export default function PriceWidgetListPage() {
  const navigate = useNavigate();
  const { accountId } = useParams<{ accountId: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [widgets, setWidgets] = useState<PriceWidget[]>([]);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (session && accountId) {
      loadAccount();
      loadWidgets();
    }
  }, [session, accountId]);

  const checkAuth = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) throw error;
      
      if (!session) {
        navigate('/auth');
        return;
      }
      
      setSession(session);
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

  const loadAccount = async () => {
    if (!session || !accountId) return;
    
    try {
      const { data, error } = await supabase
        .from('accounts')
        .select('*')
        .eq('id', accountId)
        .eq('user_id', session.user.id)
        .single();
      
      if (error) throw error;
      
      if (!data) {
        toast({
          title: "Account Not Found",
          description: "This account does not exist or you don't have access to it.",
          variant: "destructive",
        });
        navigate('/');
        return;
      }
      
      setAccount(data);
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading account:', error);
      toast({
        title: "Error",
        description: "Failed to load account.",
        variant: "destructive",
      });
      navigate('/');
    }
  };

  const loadWidgets = async () => {
    if (!accountId) return;
    
    try {
      const { data, error } = await supabase
        .from('price_widgets')
        .select('*')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false });
      
      if (error) {
        if (error.code === 'PGRST116') {
          console.log('[testing] price_widgets table does not exist yet');
          setWidgets([]);
          return;
        }
        throw error;
      }
      
      // Add hardcoded "Hotel Bangkok" widget for UI demo
      const hardcodedWidget: PriceWidget = {
        id: 'hardcoded-hotel-bangkok',
        search_query: 'Hotel Bangkok',
        check_in_date: '2025-02-15',
        check_out_date: '2025-02-20',
        number_of_adults: 2,
        number_of_children: 0,
        currency_code: 'EUR',
        max_crawled_hotels: 50,
        account_id: accountId,
        created_at: new Date().toISOString(),
      };
      
      setWidgets([hardcodedWidget, ...(data || [])]);
    } catch (error) {
      console.error('Error loading widgets:', error);
      // Even on error, show the hardcoded widget
      const hardcodedWidget: PriceWidget = {
        id: 'hardcoded-hotel-bangkok',
        search_query: 'Hotel Bangkok',
        check_in_date: '2025-02-15',
        check_out_date: '2025-02-20',
        number_of_adults: 2,
        number_of_children: 0,
        currency_code: 'EUR',
        max_crawled_hotels: 50,
        account_id: accountId || '',
        created_at: new Date().toISOString(),
      };
      setWidgets([hardcodedWidget]);
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

  // Group widgets by hotel name (search_query)
  const widgetsByHotel = widgets.reduce((acc, widget) => {
    const hotelName = widget.search_query;
    if (!acc[hotelName]) {
      acc[hotelName] = [];
    }
    acc[hotelName].push(widget);
    return acc;
  }, {} as Record<string, PriceWidget[]>);

  const hotelNames = Object.keys(widgetsByHotel);

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          <p className="text-muted-foreground">Loading your workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(`/?account=${accountId}`)}
              title="Back to accounts"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{account?.name} - Price Widgets</h1>
              {account?.description && (
                <p className="text-sm text-muted-foreground">{account.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button
              onClick={() => navigate(`/tools/price-widget/${accountId}/create`)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Create Widget
            </Button>
            <div className="text-right">
              <p className="text-sm font-medium">{session?.user?.email}</p>
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
      
      <main className="container mx-auto px-6 py-8">
        {hotelNames.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Hotel className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No Price Widgets Yet</h3>
              <p className="text-sm text-muted-foreground mb-6 text-center">
                Create your first price widget to start monitoring hotel prices
              </p>
              <Button
                onClick={() => navigate(`/tools/price-widget/${accountId}/create`)}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                Create Widget
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Your Price Widgets</h2>
                <p className="text-sm text-muted-foreground">
                  {widgets.length} widget{widgets.length !== 1 ? 's' : ''} across {hotelNames.length} hotel{hotelNames.length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>

            {hotelNames.map((hotelName) => (
              <Card key={hotelName}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Hotel className="h-5 w-5" />
                    {hotelName}
                  </CardTitle>
                  <CardDescription>
                    {widgetsByHotel[hotelName].length} widget{widgetsByHotel[hotelName].length !== 1 ? 's' : ''} configured
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {widgetsByHotel[hotelName].map((widget) => (
                      <div
                        key={widget.id}
                        onClick={() => navigate(`/tools/price-widget/${accountId}/${widget.id}`)}
                        className="p-4 border rounded-lg hover:bg-accent cursor-pointer transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="space-y-1">
                            <div className="text-sm font-medium">
                              {widget.check_in_date} to {widget.check_out_date}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {widget.number_of_adults} adult{widget.number_of_adults !== 1 ? 's' : ''}
                              {widget.number_of_children > 0 && `, ${widget.number_of_children} child${widget.number_of_children !== 1 ? 'ren' : ''}`}
                              {' • '}
                              {widget.currency_code}
                            </div>
                          </div>
                          <Button variant="ghost" size="sm">
                            View
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
