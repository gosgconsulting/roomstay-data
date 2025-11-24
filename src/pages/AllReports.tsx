import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DashboardHeader } from "@/components/DashboardHeader";
import { FiltersBar, FilterState } from "@/components/FiltersBar";
import { PerformanceTable } from "@/components/PerformanceTable";
import { LoadingToast } from "@/components/LoadingToast";
import { KPIMetricsCards } from "@/components/KPIMetricsCards";
import { KPIChart } from "@/components/KPIChart";
import { ReportsSidebar } from "@/components/ReportsSidebar";
import { ReportModal } from "@/components/ReportModal";

import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { toast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";

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
  
  // Selected reports for consolidated view
  const [selectedReportIds, setSelectedReportIds] = useState<string[]>([]);
  
  // Loading state management
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [loadingComponents, setLoadingComponents] = useState<Set<string>>(new Set());
  const [showCreateReportModal, setShowCreateReportModal] = useState(false);

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
    datePreset: "all_time",
    compareEnabled: false,
    compareType: "previous_period",
    compareDateRange: undefined,
  });

  // Load user session and reports on mount and when accountId changes
  useEffect(() => {
    checkAuth();
  }, [accountId]);

  // Initialize selected reports to all reports when reports are loaded
  useEffect(() => {
    if (reports.length > 0 && selectedReportIds.length === 0) {
      setSelectedReportIds(reports.map(r => r.id));
    }
  }, [reports]);

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

  const handleReportSelectionChange = (reportIds: string[]) => {
    console.log('[testing] AllReports - Selected reports changed:', reportIds);
    setSelectedReportIds(reportIds);
    setLoadingGeneration(prev => prev + 1);
  };

  // Get combined filters for a report
  const getCombinedFilters = (reportId: string): FilterState => {
    return reportFilters[reportId] || getDefaultFilters();
  };

  const refreshData = () => {
    console.log('[testing] AllReports - Starting comprehensive data refresh...');
    
    // Cancel previous loading by incrementing generation
    setLoadingGeneration(prev => prev + 1);
    
    // Mark consolidated components as loading
    markComponentLoading('metrics-consolidated');
    markComponentLoading('chart-consolidated');
    markComponentLoading('table-consolidated');
  };

  const handleEditReport = (reportId: string) => {
    console.log('[testing] AllReports - Edit report:', reportId);
    // Navigate to report edit page
    const report = reports.find(r => r.id === reportId);
    if (report?.account_id) {
      navigate(`/tools/report/${report.account_id}?reportId=${reportId}&edit=true`);
    } else if (accountId) {
      navigate(`/tools/report/${accountId}?reportId=${reportId}&edit=true`);
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    console.log('[testing] AllReports - Delete report:', reportId);
    
    if (!confirm('Are you sure you want to delete this report? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('reports')
        .delete()
        .eq('id', reportId);

      if (error) throw error;

      // Remove from local state
      setReports(prev => prev.filter(r => r.id !== reportId));
      setSelectedReportIds(prev => prev.filter(id => id !== reportId));
      
      toast({
        title: "Success",
        description: "Report deleted successfully.",
      });
    } catch (error) {
      console.error('Error deleting report:', error);
      toast({
        title: "Error",
        description: "Failed to delete report. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleAddNewReport = () => {
    console.log('[testing] AllReports - Add new report');
    setShowCreateReportModal(true);
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
    <SidebarProvider>
      <div className="min-h-screen bg-background flex">
        {/* Loading toast for data loading - HIDDEN: Individual components show their own loading states */}
        {/* <LoadingToast 
          isVisible={isDataLoading} 
          loadingComponents={loadingComponents}
        /> */}
        
        {/* Sidebar */}
        <ReportsSidebar
          reports={reports}
          accountId={accountId}
          onEditReport={handleEditReport}
          onDeleteReport={handleDeleteReport}
          onAddNewReport={handleAddNewReport}
        />
        
        {/* Main Content */}
        <SidebarInset className="flex-1">
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
              {/* Consolidated Analytics Section */}
              <Card className="p-6 space-y-6">
                {/* Section Header */}
                <div className="border-b pb-4">
                  <h2 className="text-2xl font-bold text-foreground">
                    {account?.name || 'All Reports'} - Consolidated Analytics
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Combined data from {reports.length} report{reports.length !== 1 ? 's' : ''}
                  </p>
                </div>
                
                {/* Filters */}
                <FiltersBar 
                  reportId={null}
                  onFiltersChange={(filters) => handleFiltersChange('consolidated', filters)}
                  isSharedView={false} 
                  accountId={accountId}
                  refreshTrigger={loadingGeneration}
                  showMasterDimensionFilter={true}
                  showReportFilter={true}
                  availableReports={reports}
                  selectedReportIds={selectedReportIds}
                  onReportSelectionChange={handleReportSelectionChange}
                />
                
                {/* KPI Metrics Cards */}
                <div className="space-y-2">
                  <h3 className="text-base font-semibold text-foreground">Analytics & Insights</h3>
                  <KPIMetricsCards
                    reportId="consolidated"
                    filters={getCombinedFilters('consolidated')}
                    accountId={accountId}
                    visibilityRefreshTrigger={loadingGeneration}
                    key={`metrics-consolidated-${loadingGeneration}`}
                    onLoadingComplete={() => markComponentLoaded('metrics-consolidated')}
                  />
                </div>
                
                {/* KPI Chart */}
                <div className="space-y-2">
                  <h3 className="text-base font-semibold text-foreground">Performance Chart</h3>
                  <KPIChart
                    reportId="consolidated"
                    filters={getCombinedFilters('consolidated')}
                    accountId={accountId}
                    dimensions={[]}
                    key={`charts-${loadingGeneration}`}
                    onLoadingComplete={() => markComponentLoaded('chart')}
                  />
                </div>
                
                {/* Performance Table */}
                <PerformanceTable 
                  reportId={null}
                  reportIds={selectedReportIds.length > 0 ? selectedReportIds : reports.map(r => r.id)}
                  filters={getCombinedFilters('consolidated')} 
                  isSharedView={false}
                  accountId={accountId}
                  onFiltersChange={(filters) => handleFiltersChange('consolidated', filters)}
                  key={`table-consolidated-${loadingGeneration}`}
                  onLoadingComplete={() => markComponentLoaded('table-consolidated')}
                  visibilityRefreshTrigger={loadingGeneration}
                />
              </Card>
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
        </SidebarInset>
      </div>

      <ReportModal
        open={showCreateReportModal}
        onOpenChange={setShowCreateReportModal}
        title="Create Report"
        description={account ? `Create a new report for ${account.name}.` : "Create a new report."}
        onSave={async (name) => {
          if (!session) return;
          const { data, error } = await supabase
            .from("reports")
            .insert({
              user_id: session.user.id,
              name,
              account_id: accountId || null,
            })
            .select("*")
            .single();

          if (error) {
            console.error("Error creating report:", error);
            toast({
              title: "Error",
              description: "Failed to create report.",
              variant: "destructive",
            });
            return;
          }

          setShowCreateReportModal(false);
          setReports((prev) => [data, ...prev]);
          toast({ title: "Report created", description: "Your report was created successfully." });
        }}
      />
    </SidebarProvider>
  );
}