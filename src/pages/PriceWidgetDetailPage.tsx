import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Session } from "@supabase/supabase-js";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, LogOut, Hotel, Calendar, Users, DollarSign } from "lucide-react";
import { useUserAccount } from "@/hooks/useUserAccount";

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

interface ProviderPrice {
  name: string;
  price: number;
}

export default function PriceWidgetDetailPage() {
  const navigate = useNavigate();
  const { accountId: urlAccountId, widgetId } = useParams<{ accountId?: string; widgetId: string }>();
  const { account: resolvedAccount } = useUserAccount();
  const accountId = urlAccountId ?? resolvedAccount?.id ?? null;
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [widget, setWidget] = useState<PriceWidget | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Hardcoded provider prices for demo
  const hardcodedProviders: ProviderPrice[] = [
    { name: "Booking.com", price: 125.50 },
    { name: "Agoda", price: 118.00 },
    { name: "Expedia", price: 130.25 },
    { name: "Hotels.com", price: 128.75 },
    { name: "Trip.com", price: 122.00 },
    { name: "Kayak", price: 127.50 },
  ];

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (session && accountId && widgetId) {
      loadAccount();
      loadWidget();
    }
  }, [session, accountId, widgetId]);

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

  const loadWidget = async () => {
    if (!accountId || !widgetId) return;
    
    // Check if this is the hardcoded "Hotel Bangkok" widget
    if (widgetId === 'hardcoded-hotel-bangkok') {
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
      setWidget(hardcodedWidget);
      setIsLoading(false);
      return;
    }
    
    try {
      const { data, error } = await (supabase
        .from('price_widgets' as any)
        .select('*')
        .eq('id', widgetId)
        .eq('account_id', accountId)
        .single());
      
      if (error) {
        if (error.code === 'PGRST116') {
          toast({
            title: "Widget Not Found",
            description: "This widget does not exist.",
            variant: "destructive",
          });
          navigate(`/tools/price-widget`);
          return;
        }
        throw error;
      }
      
      if (!data) {
        toast({
          title: "Widget Not Found",
          description: "This widget does not exist.",
          variant: "destructive",
        });
        navigate(`/tools/price-widget`);
        return;
      }
      
      setWidget(data as unknown as PriceWidget);
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading widget:', error);
      toast({
        title: "Error",
        description: "Failed to load widget.",
        variant: "destructive",
      });
      navigate(`/tools/price-widget`);
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

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } catch {
      return dateString;
    }
  };

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(price);
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          <p className="text-muted-foreground">Loading widget...</p>
        </div>
      </div>
    );
  }

  if (!widget) {
    return null;
  }

  // Sort providers by price (lowest first)
  const sortedProviders = [...hardcodedProviders].sort((a, b) => a.price - b.price);
  const lowestPrice = sortedProviders[0]?.price || 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate(`/tools/price-widget`)}
              title="Back to widgets list"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{account?.name} - Price Widget</h1>
              {account?.description && (
                <p className="text-sm text-muted-foreground">{account.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-4">
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
        <div className="space-y-6">
          {/* Hotel Info Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Hotel className="h-5 w-5" />
                {widget.search_query}
              </CardTitle>
              <CardDescription>Hotel price comparison</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center gap-3">
                  <Calendar className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-medium">Check-in / Check-out</div>
                    <div className="text-sm text-muted-foreground">
                      {formatDate(widget.check_in_date)} - {formatDate(widget.check_out_date)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-medium">Guests</div>
                    <div className="text-sm text-muted-foreground">
                      {widget.number_of_adults} adult{widget.number_of_adults !== 1 ? 's' : ''}
                      {widget.number_of_children > 0 && `, ${widget.number_of_children} child${widget.number_of_children !== 1 ? 'ren' : ''}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <DollarSign className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="text-sm font-medium">Currency</div>
                    <div className="text-sm text-muted-foreground">{widget.currency_code}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Provider Prices Card */}
          <Card>
            <CardHeader>
              <CardTitle>Provider Prices</CardTitle>
              <CardDescription>
                Price comparison across different booking platforms
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {sortedProviders.map((provider, index) => {
                  const isLowest = provider.price === lowestPrice;
                  return (
                    <div
                      key={provider.name}
                      className={`p-4 border rounded-lg flex items-center justify-between ${
                        isLowest ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="font-medium">{provider.name}</div>
                        {isLowest && (
                          <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 px-2 py-1 rounded">
                            Best Price
                          </span>
                        )}
                      </div>
                      <div className="text-lg font-semibold">
                        {formatPrice(provider.price, widget.currency_code)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
