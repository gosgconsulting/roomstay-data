import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Session } from "@supabase/supabase-js";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, LogOut, Plus, Info, Hotel, Calendar, Users, DollarSign } from "lucide-react";
import { useForm } from "react-hook-form";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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

interface PriceWidgetFormData {
  search_query: string;
  check_in_date: string;
  check_out_date: string;
  number_of_adults: number;
  number_of_children: number;
  currency_code: string;
  max_crawled_hotels?: number;
}

interface ProviderPrice {
  name: string;
  price: number;
}

export default function PriceWidgetPage() {
  const navigate = useNavigate();
  const { accountId } = useParams<{ accountId: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  const form = useForm<PriceWidgetFormData>({
    defaultValues: {
      search_query: "",
      check_in_date: "",
      check_out_date: "",
      number_of_adults: 2,
      number_of_children: 0,
      currency_code: "EUR",
      max_crawled_hotels: 50,
    },
    mode: "onChange",
  });

  // Watch currency code for dynamic price formatting
  const currencyCode = form.watch("currency_code") || "EUR";

  // Hardcoded provider prices for demo
  const hardcodedProviders: ProviderPrice[] = [
    { name: "Booking.com", price: 125.50 },
    { name: "Agoda", price: 118.00 },
    { name: "Expedia", price: 130.25 },
    { name: "Hotels.com", price: 128.75 },
    { name: "Trip.com", price: 122.00 },
    { name: "Kayak", price: 127.50 },
  ];

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
    }).format(price);
  };

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (session && accountId) {
      loadAccount();
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

  const onSubmit = async (data: PriceWidgetFormData) => {
    if (!accountId) return;
    
    // Validate required fields
    if (!data.search_query?.trim()) {
      toast({
        title: "Validation Error",
        description: "Search query is required",
        variant: "destructive",
      });
      return;
    }
    if (!data.check_in_date) {
      toast({
        title: "Validation Error",
        description: "Check-in date is required",
        variant: "destructive",
      });
      return;
    }
    if (!data.check_out_date) {
      toast({
        title: "Validation Error",
        description: "Check-out date is required",
        variant: "destructive",
      });
      return;
    }
    if (!data.currency_code?.trim()) {
      toast({
        title: "Validation Error",
        description: "Currency code is required",
        variant: "destructive",
      });
      return;
    }
    
    setIsCreating(true);
    try {
      // Note: This assumes a 'price_widgets' table exists in the database
      const { data: newWidget, error } = await supabase
        .from('price_widgets')
        .insert({
          search_query: data.search_query,
          check_in_date: data.check_in_date,
          check_out_date: data.check_out_date,
          number_of_adults: data.number_of_adults,
          number_of_children: data.number_of_children,
          currency_code: data.currency_code,
          max_crawled_hotels: data.max_crawled_hotels || 50,
          account_id: accountId,
        })
        .select()
        .single();
      
      if (error) {
        // If table doesn't exist, inform user they need to create it
        if (error.code === 'PGRST116') {
          toast({
            title: "Database Setup Required",
            description: "The price_widgets table needs to be created in the database first.",
            variant: "destructive",
          });
          return;
        }
        throw error;
      }
      
      toast({
        title: "Success",
        description: "Price widget created successfully.",
      });
      
      // Reset form but stay on the same page to show results
      form.reset();
    } catch (error) {
      console.error('Error creating widget:', error);
      toast({
        title: "Error",
        description: "Failed to create price widget.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

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
    <TooltipProvider>
      <div className="min-h-screen bg-background">
        {/* Header with back button and account info */}
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
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Hotel className="h-5 w-5" />
                    Hotel price comparison
                  </CardTitle>
                  <CardDescription>Compare prices across different booking platforms</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Hotel Name Input */}
                  <FormField
                    control={form.control}
                    name="search_query"
                    rules={{ required: "Hotel name is required" }}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm font-medium">Hotel name</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Enter hotel name"
                            className="h-10"
                            required
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Form Fields Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Check-in / Check-out Dates */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        Check-in / Check-out
                      </div>
                      <div className="flex gap-3">
                        <FormField
                          control={form.control}
                          name="check_in_date"
                          rules={{ required: "Check-in date is required" }}
                          render={({ field }) => (
                            <FormItem className="flex-1">
                              <FormLabel className="text-xs text-muted-foreground">Check-in</FormLabel>
                              <FormControl>
                                <Input
                                  type="date"
                                  className="h-9 text-sm"
                                  required
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="check_out_date"
                          rules={{ required: "Check-out date is required" }}
                          render={({ field }) => (
                            <FormItem className="flex-1">
                              <FormLabel className="text-xs text-muted-foreground">Check-out</FormLabel>
                              <FormControl>
                                <Input
                                  type="date"
                                  className="h-9 text-sm"
                                  required
                                  {...field}
                                />
                              </FormControl>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    {/* Guests */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        Guests
                      </div>
                      <div className="flex gap-3">
                        <FormField
                          control={form.control}
                          name="number_of_adults"
                          rules={{ 
                            required: "Number of adults is required",
                            min: { value: 1, message: "At least 1 adult is required" }
                          }}
                          render={({ field }) => (
                            <FormItem className="flex-1">
                              <FormLabel className="text-xs text-muted-foreground">Adults</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min="1"
                                  className="h-9 text-sm"
                                  required
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                                />
                              </FormControl>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name="number_of_children"
                          rules={{ 
                            required: "Number of children is required",
                            min: { value: 0, message: "Number of children cannot be negative" }
                          }}
                          render={({ field }) => (
                            <FormItem className="flex-1">
                              <FormLabel className="text-xs text-muted-foreground">Children</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min="0"
                                  className="h-9 text-sm"
                                  required
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                />
                              </FormControl>
                              <FormMessage className="text-xs" />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>

                    {/* Currency */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        Currency
                      </div>
                      <FormField
                        control={form.control}
                        name="currency_code"
                        rules={{ required: "Currency code is required" }}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs text-muted-foreground">Currency Code</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="EUR"
                                maxLength={3}
                                className="h-9 text-sm"
                                required
                                {...field}
                                onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                              />
                            </FormControl>
                            <FormMessage className="text-xs" />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  {/* Hidden Max Crawled Hotels field - keeping for form submission but not displaying */}
                  <FormField
                    control={form.control}
                    name="max_crawled_hotels"
                    render={({ field }) => (
                      <FormItem className="hidden">
                        <FormControl>
                          <Input
                            type="number"
                            min="1"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 50)}
                            value={field.value || 50}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />

                  {/* Action Buttons */}
                  <div className="flex justify-end gap-3 pt-4 border-t">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => form.reset()}
                      disabled={isCreating}
                    >
                      Reset
                    </Button>
                    <Button type="submit" disabled={isCreating}>
                      {isCreating ? "Running..." : "Run"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Provider Prices Card */}
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle>Provider Prices</CardTitle>
                  <CardDescription>
                    Price comparison across different booking platforms
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {(() => {
                    // Sort providers by price (lowest first)
                    const sortedProviders = [...hardcodedProviders].sort((a, b) => a.price - b.price);
                    const lowestPrice = sortedProviders[0]?.price || 0;

                    return (
                      <div className="space-y-3">
                        {sortedProviders.map((provider) => {
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
                                {formatPrice(provider.price, currencyCode)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </CardContent>
              </Card>
            </form>
          </Form>
        </main>
      </div>
    </TooltipProvider>
  );
}
