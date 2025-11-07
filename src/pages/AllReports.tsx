import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DashboardHeader } from "@/components/DashboardHeader";
import { FiltersBar, FilterState } from "@/components/FiltersBar";
import { PerformanceTable } from "@/components/PerformanceTable";
import { LoadingToast } from "@/components/LoadingToast";
import { KPIMetricsCards } from "@/components/KPIMetricsCards";
import { KPIChart } from "@/components/KPIChart";
import { MasterFilter } from "@/components/MasterFilter";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { toast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";

interface Report {
  id: string;
  name: string;
  account_id: string | null;
  created_at: string;
  updated_at: string;
}

interface DataSource {
  id: string;
  name: string;
  report_id: string;
}

export default function AllReports() {
  const navigate = useNavigate();
  const { accountId } = useParams<{ accountId?: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reports, setReports] = useState<Report[]>([]);
  const [account, setAccount] = useState<{ id: string; name: string } | null>(null);
  const [loadingGeneration, setLoadingGeneration] = useState(0);
  const [dataSources, setDataSources] = useState<Record<string, DataSource[]>>({});
  const [activeDataSources, setActiveDataSources] = useState<Record<string, string>>({});
  
  // Filter state for each report - using reportId as key
  const [reportFilters, setReportFilters] = useState<Record<string, FilterState>>({});
  
  // Master filter state
  const [masterFilterDimension, setMasterFilterDimension] = useState<string | null>(null);
  const [masterFilterValues, setMasterFilterValues] = useState<string[]>([]);
  
  // Loading state management
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [loadingComponents, setLoadingComponents] = useState<Set<string>>(new Set());

  const markComponentLoading = (component: string) => {
    console.log(`[testing] AllReports - Marking ${component} as loading`);
    setLoadingComponents(prev => new Set(prev).add(component));
    setIsDataLoading(true);
  };

  const markComponentLoaded = (component: string) => {
    console.log(`[testing] AllReports - Marking ${component} as loaded`);
    setLoadingComponents(prev => {
      const newSet = new Set(prev);
      newSet.delete(component);
      if (newSet.size === 0) {
        setIsDataLoading(false);
        console.log('[testing] AllReports - All components loaded');
      }
      return newSet;
    });
  };

  // Initialize default filters for a report
  const getDefaultFilters = (): FilterState => ({
    dimensionFilters: {},
    dateRange: undefined,
    datePreset: "this_month",
    compareEnabled: false,
    compareType: "previous_period",
    compareDateRange: undefined,
  });

  // Load user session and reports on mount and when accountId changes
  useEffect(() => {
    checkAuth();
  }, [accountId]);

  const checkAuth = async () => {
    try {
      // Mark reports as loading
      markComponentLoading('reports');
      
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) throw error;
      
      if (!session) {
        markComponentLoaded('reports');
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
          markComponentLoaded('reports');
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
        
        // Load data sources for each report
        const dataSourcesMap: Record<string, DataSource[]> = {};
        const activeDataSourceMap: Record<string, string> = {};
        
        for (const report of reports) {
          const { data: sources, error: sourcesError } = await supabase
            .from('data_sources')
            .select('id, name, report_id')
            .eq('report_id', report.id)
            .order('created_at', { ascending: true });
          
          if (!sourcesError && sources && sources.length > 0) {
            dataSourcesMap[report.id] = sources;
            activeDataSourceMap[report.id] = sources[0].id;
          }
        }
        
        setDataSources(dataSourcesMap);
        setActiveDataSources(activeDataSourceMap);
        
        // Initialize filters for each report
        const initialFilters: Record<string, FilterState> = {};
        reports.forEach(report => {
          initialFilters[report.id] = getDefaultFilters();
        });
        setReportFilters(initialFilters);
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
      markComponentLoaded('reports');
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

  const handleFiltersChange = (reportId: string, newFilters: FilterState) => {
    console.log('[testing] AllReports - Filters changing for report:', reportId, newFilters);
    setReportFilters(prev => ({
      ...prev,
      [reportId]: newFilters
    }));
  };

  const handleMasterFilterChange = (dimension: string | null, values: string[]) => {
    console.log('[MASTER-FILTER] Master filter changed:', { dimension, values });
    setMasterFilterDimension(dimension);
    setMasterFilterValues(values);
    
    // Trigger data refresh for all reports when master filter changes
    if (dimension && values.length > 0) {
      setLoadingGeneration(prev => prev + 1);
      toast({
        title: "Master Filter Applied",
        description: `Filtering all reports by ${dimension}: ${values.join(', ')}`,
      });
    } else if (!dimension) {
      setLoadingGeneration(prev => prev + 1);
      toast({
        title: "Master Filter Cleared",
        description: "All reports are now showing unfiltered data",
      });
    }
  };

  // Get combined filters for a report (report filters + master filter)
  const getCombinedFilters = (reportId: string): FilterState => {
    const reportFilter = reportFilters[reportId] || getDefaultFilters();
    
    if (!masterFilterDimension || masterFilterValues.length === 0) {
      return reportFilter;
    }

    // Add master filter to dimension filters
    const combinedDimensionFilters = {
      ...reportFilter.dimensionFilters,
      [masterFilterDimension]: masterFilterValues
    };

    return {
      ...reportFilter,
      dimensionFilters: combinedDimensionFilters
    };
  };

  const refreshData = () => {
    console.log('[testing] AllReports - Starting comprehensive data refresh...');
    
    // Cancel previous loading by incrementing generation
    setLoadingGeneration(prev => prev + 1);
    
    // Mark all components as loading
    reports.forEach(report => {
      markComponentLoading(`metrics-${report.id}`);
      markComponentLoading(`chart-${report.id}`);
      markComponentLoading(`table-${report.id}`);
    });
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
      {/* Loading toast for data loading */}
      <LoadingToast 
        isVisible={isDataLoading} 
        loadingComponents={loadingComponents}
      />
      
      <DashboardHeader 
        reportId={null} // No single report selected in consolidated view
        accountId={accountId || undefined}
        onReportChange={(selectedReportId) => {
          // Navigate back to individual report view
          if (accountId) {
            navigate(`/tools/report/${accountId}?reportId=${selectedReportId}`);
          } else {
            // If no accountId, try to find the report's account_id
            const selectedReport = reports.find(r => r.id === selectedReportId);
            if (selectedReport?.account_id) {
              navigate(`/tools/report/${selectedReport.account_id}?reportId=${selectedReportId}`);
            }
          }
        }}
        session={session}
        onSignOut={handleSignOut}
        onRefreshData={refreshData}
        // Don't set title so dropdown shows
      />
      
      {reports.length > 0 ? (
        <main className="container mx-auto px-6 py-6 space-y-8">
          {/* Master Filter */}
          <MasterFilter
            accountId={accountId}
            onFilterChange={handleMasterFilterChange}
            selectedDimension={masterFilterDimension}
            selectedValues={masterFilterValues}
          />
          
          {reports.map((report) => {
            const reportDataSources = dataSources[report.id] || [];
            const activeDataSourceId = activeDataSources[report.id];
            
            return (
              <Card key={report.id} className="p-6 space-y-4">
                {/* Report Title */}
                <div className="border-b pb-2">
                  <h2 className="text-2xl font-bold text-foreground">{report.name}</h2>
                  <p className="text-sm text-muted-foreground">
                    Last updated: {new Date(report.updated_at).toLocaleDateString()}
                  </p>
                </div>
                
                {/* Filters for this report */}
                <FiltersBar 
                  reportId={report.id} 
                  onFiltersChange={(filters) => handleFiltersChange(report.id, filters)}
                  isSharedView={false} 
                  accountId={accountId || report.account_id || undefined}
                  refreshTrigger={loadingGeneration} 
                />
                
                {/* KPI Metrics Cards */}
                <KPIMetricsCards
                  reportId={report.id}
                  filters={getCombinedFilters(report.id)}
                  accountId={accountId || report.account_id || undefined}
                  visibilityRefreshTrigger={loadingGeneration}
                  key={`metrics-${report.id}-${loadingGeneration}`}
                  onLoadingComplete={() => markComponentLoaded(`metrics-${report.id}`)}
                />
                
                {/* KPI Chart */}
                <KPIChart
                  reportId={report.id}
                  filters={getCombinedFilters(report.id)}
                  accountId={accountId || report.account_id || undefined}
                  visibilityRefreshTrigger={loadingGeneration}
                  key={`chart-${report.id}-${loadingGeneration}`}
                  onLoadingComplete={() => markComponentLoaded(`chart-${report.id}`)}
                />
                
                {/* Performance Table - shows all data sources */}
                <PerformanceTable 
                  reportId={report.id} 
                  filters={getCombinedFilters(report.id)} 
                  isSharedView={false}
                  accountId={accountId || report.account_id || undefined}
                  onFiltersChange={(filters) => handleFiltersChange(report.id, filters)}
                  key={`table-${report.id}-${loadingGeneration}`}
                  onLoadingComplete={() => markComponentLoaded(`table-${report.id}`)}
                  visibilityRefreshTrigger={loadingGeneration}
                />
              </Card>
            );
          })}
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
