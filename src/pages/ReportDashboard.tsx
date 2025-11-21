import { useState, useEffect, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { DashboardHeader } from "@/components/DashboardHeader";
import { FiltersBar, FilterState } from "@/components/FiltersBar";
import { KPIMetricsCards } from "@/components/KPIMetricsCards";
import { KPIChart } from "@/components/KPIChart";
import { PerformanceTable } from "@/components/PerformanceTable";
import { KPISettingsModal } from "@/components/KPISettingsModal";
import { LoadingToast } from "@/components/LoadingToast";
import { SystemHealthMonitor } from "@/components/SystemHealthMonitor";
import { MasterFilter } from "@/components/MasterFilter";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Session } from "@supabase/supabase-js";
import { toast } from "@/hooks/use-toast";
import { Settings, ArrowLeft } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { resyncAllDimensions } from "@/lib/resync-all-dimensions";
import { resyncReportViews } from "@/lib/resync-report-views";
import { usePerformanceTableDimensions } from "@/hooks/performanceTable/usePerformanceTableDimensions";

interface Account {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  user_id: string;
}

export default function ReportDashboard() {
  const navigate = useNavigate();
  const { accountId } = useParams<{ accountId: string }>();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [session, setSession] = useState<Session | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [loadingComponents, setLoadingComponents] = useState<Set<string>>(new Set());
  const [isSharedView, setIsSharedView] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [dataRefreshKey, setDataRefreshKey] = useState(0);
  const [visibilityRefreshTrigger, setVisibilityRefreshTrigger] = useState(0);
  const [kpiSettingsOpen, setKpiSettingsOpen] = useState(false);
  const [loadingGeneration, setLoadingGeneration] = useState(0);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isKPILoading, setIsKPILoading] = useState(false);
  const [isTableLoading, setIsTableLoading] = useState(false);
  const [reportIds, setReportIds] = useState<string[]>([]);
  const [vlookupMappings, setVlookupMappings] = useState<Record<string, any>>({});
  const [showVlookupModal, setShowVlookupModal] = useState(false);
  const [allowedReportIds, setAllowedReportIds] = useState<string[]>([]);

  // Master filter state - ensure these are properly defined
  const [selectedMasterDimension, setSelectedMasterDimension] = useState<string | null>(null);
  const [selectedMasterValues, setSelectedMasterValues] = useState<string[]>([]);

  // Load dimensions using the same hook as PerformanceTable
  const {
    dimensions,
    dimensionHasData,
    isLoadingDimensions,
    loadDimensions,
  } = usePerformanceTableDimensions({
    reportId,
    accountId: accountId || undefined,
  });
  
  // Filter state - default to this month with timezone-free date range
  const [filters, setFilters] = useState<FilterState>(() => {
    console.log('[testing] ReportDashboard - Initializing with timezone-free date range:', {
      preset: "all_time"
    });
    
    return {
      dimensionFilters: {},
      dateRange: undefined,
      datePreset: "all_time",
      compareEnabled: false,
      compareType: "previous_period",
      compareDateRange: undefined,
    };
  });

  // Track filter changes
  useEffect(() => {
    console.log('[testing] ReportDashboard - Filter state updated:', {
      dateRange: filters.dateRange,
      dateFrom: filters.dateRange?.from?.toISOString(),
      dateTo: filters.dateRange?.to?.toISOString(),
      preset: filters.datePreset,
      timestamp: new Date().toISOString()
    });
  }, [filters]);

  // Stabilize the onFiltersChange callback to prevent unnecessary re-renders
  const handleFiltersChange = useCallback((newFilters: FilterState) => {
    console.log('[testing] ReportDashboard - Filters changing:', newFilters);
    console.log('[testing] ReportDashboard - Date filter change details:', {
      oldDateRange: filters.dateRange,
      newDateRange: newFilters.dateRange,
      oldPreset: filters.datePreset,
      newPreset: newFilters.datePreset,
      dateRangeChanged: JSON.stringify(filters.dateRange) !== JSON.stringify(newFilters.dateRange),
      timestamp: new Date().toISOString()
    });
    setFilters(newFilters);
  }, [filters.dateRange, filters.datePreset]);
  
  // Track component loading states
  const markComponentLoading = (component: string) => {
    console.log('[LOADING-DEBUG] Component loading:', component);
    setLoadingComponents(prev => {
      const next = new Set(prev).add(component);
      console.log('[LOADING-DEBUG] Loading components:', Array.from(next));
      return next;
    });
    setIsDataLoading(true);
  };
  
  const markComponentLoaded = (component: string) => {
    console.log('[LOADING-DEBUG] Component loaded:', component);
    setLoadingComponents(prev => {
      const next = new Set(prev);
      next.delete(component);
      console.log('[LOADING-DEBUG] Remaining components:', Array.from(next));
      if (next.size === 0) {
        console.log('[LOADING-DEBUG] All components loaded, hiding loading toast');
        setIsDataLoading(false);
      }
      return next;
    });
  };
  
  // Reset filters and mark loading when report changes
  useEffect(() => {
    if (reportId) {
      // Cancel previous loading by incrementing generation
      setLoadingGeneration(prev => prev + 1);
      
      // Clear previous loading states immediately
      setLoadingComponents(new Set());
      setIsDataLoading(false);
      
      // Start new loading cycle
      markComponentLoading('metrics');
      markComponentLoading('chart');
      markComponentLoading('table');
      
      setFilters({
        dimensionFilters: {},
        dateRange: undefined,
        datePreset: "all_time",
        compareEnabled: false,
        compareType: "previous_period",
        compareDateRange: undefined,
      });

      // Load dimensions when reportId changes
      loadDimensions();
    }
  }, [reportId, loadDimensions]);
  
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
      setIsLoading(false); // Ensure loading is stopped on error
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
        navigate('/tools/report');
        return;
      }
      
      setAccount(data);
      
      // Load user's reports for this account
      const { data: reports, error: reportsError } = await supabase
        .from('reports')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('account_id', accountId)
        .order('created_at', { ascending: false });
      
      if (reportsError) throw reportsError;
      
      // If user has reports for this account, select the first one or the one from URL params
      if (reports && reports.length > 0) {
        const reportIdFromUrl = searchParams.get('reportId');
        const selectedReportId = reportIdFromUrl && reports.find(r => r.id === reportIdFromUrl)
          ? reportIdFromUrl
          : reports[0].id;
        
        setReportId(selectedReportId);
        
        // Resync dimensions in the background (non-blocking) with react-query cache
        resyncAllDimensions(queryClient, selectedReportId, accountId)
          .then(() => {
            console.log('[RESYNC] Dimension resync completed successfully');
          })
          .catch((error) => {
            console.error('[RESYNC] Error resyncing dimensions:', error);
            // Silently fail - resync is best-effort
          });
        
        // Also resync report views to ensure filter_dimensions includes all text dimensions
        resyncReportViews(selectedReportId, accountId)
          .then(() => {
            console.log('[RESYNC] Report views resync completed successfully');
            // Increment refresh trigger to reload filters with updated dimensions
            setVisibilityRefreshTrigger(prev => prev + 1);
          })
          .catch((error) => {
            console.error('[RESYNC] Error resyncing report views:', error);
            // Silently fail - resync is best-effort
          });
      }
      
      setIsLoading(false);
    } catch (error) {
      console.error('Error loading account:', error);
      toast({
        title: "Error",
        description: "Failed to load account.",
        variant: "destructive",
      });
      navigate('/tools/report');
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
  
  const handleReportChange = (newReportId: string) => {
    setReportId(newReportId);
    // Cancel previous loading by incrementing generation
    setLoadingGeneration(prev => prev + 1);
    
    // Clear previous loading states immediately
    setLoadingComponents(new Set());
    setIsDataLoading(false);
    
    // Start new loading cycle
    markComponentLoading('metrics');
    markComponentLoading('chart');
    markComponentLoading('table');
    setDataRefreshKey(prev => prev + 1);
  };
  
  const handleDataSync = () => {
    // Cancel previous loading by incrementing generation
    setLoadingGeneration(prev => prev + 1);
    
    // Clear previous loading states immediately
    setLoadingComponents(new Set());
    setIsDataLoading(false);
    
    // Start new loading cycle
    markComponentLoading('metrics');
    markComponentLoading('chart');
    markComponentLoading('table');
    setDataRefreshKey(prev => prev + 1);
  };
  
  const handleRefreshData = () => {
    // Cancel previous loading by incrementing generation
    setLoadingGeneration(prev => prev + 1);
    
    // Clear previous loading states immediately
    setLoadingComponents(new Set());
    setIsDataLoading(false);
    
    // Start new loading cycle
    markComponentLoading('metrics');
    markComponentLoading('chart');
    markComponentLoading('table');
    setDataRefreshKey(prev => prev + 1);
  };
  
  const handleVisibilityChange = () => {
    // Increment refresh trigger to reload filters with updated dimensions
    setVisibilityRefreshTrigger(prev => prev + 1);
  };
  
  // Handle health issues
  const handleHealthIssues = useCallback((issues: string[]) => {
    console.warn('[DASHBOARD] Health issues detected:', issues);
    // Could show a toast notification or other UI feedback here
  }, []);

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
      <DashboardHeader
        reportId={reportId}
        accountId={accountId}
        onReportChange={handleReportChange}
        onDataSync={handleDataSync}
        onRefreshData={handleRefreshData}
        onVisibilityChange={handleVisibilityChange}
        session={session}
        onSignOut={handleSignOut}
        isSharedView={false}
        allowedReportIds={allowedReportIds}
        onVlookupClick={() => setShowVlookupModal(true)}
      />

      <div className="container mx-auto p-6 space-y-6">
        <SystemHealthMonitor 
          reportId={reportId || undefined}
          onIssueDetected={handleHealthIssues}
        />

        <MasterFilter
          accountId={accountId}
          onFilterChange={handleFiltersChange}
          selectedDimension={selectedMasterDimension}
          selectedValues={selectedMasterValues}
        />

        <KPIMetricsCards
          reportId={reportId}
          accountId={accountId}
          filters={filters}
          dimensions={dimensions}
          onLoadingComplete={() => setIsKPILoading(false)}
        />

        <PerformanceTable
          reportId={reportId}
          reportIds={reportIds}
          accountId={accountId}
          filters={filters}
          onFiltersChange={handleFiltersChange}
          visibilityRefreshTrigger={visibilityRefreshTrigger}
          isSharedView={false}
          onLoadingComplete={() => setIsTableLoading(false)}
          isEditMode={isEditMode}
        />
      </div>
    </div>
  );
}