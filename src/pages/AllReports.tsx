import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DashboardHeader } from "@/components/DashboardHeader";
import { MasterFilter } from "@/components/MasterFilter";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { toast } from "@/hooks/use-toast";
import { PerformanceTable } from "@/components/PerformanceTable";
import { startOfMonth, endOfMonth } from "date-fns";
import { DateRange } from "react-day-picker";

interface Report {
  id: string;
  name: string;
  account_id: string | null;
  created_at: string;
  updated_at: string;
}

export default function AllReports() {
  const navigate = useNavigate();
  const { accountId } = useParams<{ accountId?: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reports, setReports] = useState<Report[]>([]);
  const [account, setAccount] = useState<{ id: string; name: string } | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  
  // Master filter state
  const [masterFilterDimension, setMasterFilterDimension] = useState<string | null>(null);
  const [masterFilterValues, setMasterFilterValues] = useState<string[]>([]);
  const [masterFilterDateRange, setMasterFilterDateRange] = useState<DateRange | undefined>(undefined);
  const [masterFilterReportIds, setMasterFilterReportIds] = useState<string[]>([]);
  
  // Filter state for PerformanceTable
  const [filters, setFilters] = useState({
    dateRange: {
      from: startOfMonth(new Date()),
      to: endOfMonth(new Date())
    },
    datePreset: 'thisMonth',
    dimensionFilters: {},
    compareEnabled: false,
    compareType: 'previous',
    compareDateRange: undefined
  });

  // Load user session and reports on mount and when accountId changes
  useEffect(() => {
    checkAuth();
  }, [accountId]);

  const checkAuth = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) throw error;
      
      if (!session) {
        navigate('/auth');
        return;
      }
      
      setSession(session);
      
      // Load account if accountId is provided
      if (accountId) {
        const { data: accountData, error: accountError } = await supabase
          .from('accounts')
          .select('id, name')
          .eq('id', accountId)
          .eq('user_id', session.user.id)
          .single();
        
        if (accountError) {
          console.error('Error loading account:', accountError);
          toast({
            title: "Error",
            description: "Account not found. Redirecting...",
            variant: "destructive",
          });
          navigate('/');
          return;
        }
        
        if (accountData) {
          setAccount(accountData);
        }
      }
      
      // Load user's reports, filtered by accountId if provided
      let reportsQuery = supabase
        .from('reports')
        .select('*')
        .eq('user_id', session.user.id);
      
      // Filter by account if accountId is provided
      if (accountId) {
        reportsQuery = reportsQuery.eq('account_id', accountId);
      }
      
      const { data: reports, error: reportsError } = await reportsQuery
        .order('created_at', { ascending: false });

      if (reportsError) throw reportsError;

      if (reports && reports.length > 0) {
        setReports(reports);
        // Set the first report as default
        setReportId(reports[0].id);
      } else if (accountId && reports && reports.length === 0) {
        // If accountId is provided but no reports found, show message
        toast({
          title: "No Reports",
          description: `No reports found for this account.`,
        });
      }
      
    } catch (error) {
      console.error('Error loading reports:', error);
      toast({
        title: "Error",
        description: "Failed to load reports. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };


  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      navigate('/auth');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const handleFiltersChange = (newFilters: any) => {
    setFilters(newFilters);
  };

  const handleMasterFilterChange = (
    dimension: string | null, 
    values: string[],
    dateRange?: DateRange,
    reportIds?: string[],
    compareEnabled?: boolean,
    compareType?: string,
    compareDateRange?: DateRange
  ) => {
    console.log('[MASTER-FILTER] Master filter changed:', { 
      dimension, values, dateRange, reportIds, compareEnabled, compareType, compareDateRange 
    });
    setMasterFilterDimension(dimension);
    setMasterFilterValues(values);
    setMasterFilterDateRange(dateRange);
    setMasterFilterReportIds(reportIds || reports.map(r => r.id));
    
    // Update filters for PerformanceTable
    const newFilters: any = { ...filters };
    
    // Update date range if provided
    if (dateRange?.from && dateRange?.to) {
      newFilters.dateRange = dateRange;
    }
    
    // Update dimension filters if provided
    if (dimension && values.length > 0) {
      newFilters.dimensionFilters = {
        ...newFilters.dimensionFilters,
        [dimension]: values
      };
    }
    
    // Update comparison settings if provided
    if (compareEnabled !== undefined) {
      newFilters.compareEnabled = compareEnabled;
    }
    if (compareType) {
      newFilters.compareType = compareType;
    }
    if (compareDateRange) {
      newFilters.compareDateRange = compareDateRange;
    }
    
    setFilters(newFilters);
    
    // Update reportId if reportIds filter changed
    if (reportIds && reportIds.length > 0) {
      setReportId(reportIds[0]);
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
          <p className="text-muted-foreground">Loading your reports...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader
        reportId={reportId}
        accountId={accountId || undefined}
        onReportChange={(selectedReportId) => {
          setReportId(selectedReportId);
        }}
        session={session}
        onSignOut={handleSignOut}
        onRefreshData={() => {
          // Trigger table refresh
          setFilters({ ...filters });
        }}
      />
      
      {reports.length > 0 && reportId ? (
        <main className="container mx-auto px-6 py-6 space-y-8">
          {/* Master Filter */}
          <MasterFilter
            accountId={accountId}
            reports={reports}
            onFilterChange={handleMasterFilterChange}
            selectedDimension={masterFilterDimension}
            selectedValues={masterFilterValues}
            selectedDateRange={masterFilterDateRange}
            selectedReportIds={masterFilterReportIds}
          />
          
          {/* Performance Table */}
          <PerformanceTable
            reportId={reportId}
            accountId={accountId}
            filters={filters}
            onFiltersChange={handleFiltersChange}
            isSharedView={false}
          />
        </main>
      ) : (
        <main className="container mx-auto px-6 py-6">
          <div className="text-center py-12">
            <h2 className="text-2xl font-bold mb-4">No Reports Found</h2>
            <p className="text-muted-foreground mb-6">
              {accountId 
                ? `No reports found for ${account?.name || 'this account'}. Create a report to get started.`
                : "You don't have any reports yet. Create your first report to get started."}
            </p>
          </div>
        </main>
      )}
    </div>
  );
}
