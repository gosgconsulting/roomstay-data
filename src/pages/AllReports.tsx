import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DashboardHeader } from "@/components/DashboardHeader";
import { LoadingToast } from "@/components/LoadingToast";
import { MasterFilter } from "@/components/MasterFilter";
import { CombinedKPIMetricsCards } from "@/components/CombinedKPIMetricsCards";
import { CombinedPerformanceTable } from "@/components/CombinedPerformanceTable";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { toast } from "@/hooks/use-toast";
import { Card } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";
import { getCombinedAnalytics, MasterFilterState, CombinedAnalyticsData } from "@/lib/combined-analytics";
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
  
  // Master filter state
  const [masterFilterDimension, setMasterFilterDimension] = useState<string | null>(null);
  const [masterFilterValues, setMasterFilterValues] = useState<string[]>([]);
  const [masterFilterDateRange, setMasterFilterDateRange] = useState<DateRange | undefined>(undefined);
  const [masterFilterReportIds, setMasterFilterReportIds] = useState<string[]>([]);
  
  // Visibility settings
  const [visibleKPIs, setVisibleKPIs] = useState<string[]>([
    "impressions", "clicks", "ctr", "conversions", "conversionRate", "cpc", "cost", "revenue", "roas", "costOfSale"
  ]);
  const [visibleColumns, setVisibleColumns] = useState<string[]>([
    "date", "impressions", "clicks", "ctr", "conversions", "conversionRate", "cost", "revenue", "roas"
  ]);
  
  // Grouping state
  const [groupByDimensions, setGroupByDimensions] = useState<string[]>([]);
  const [breakdownDimensions, setBreakdownDimensions] = useState<string[]>([]);
  const [thenByDimensions, setThenByDimensions] = useState<string[]>([]);
  const [allDimensions, setAllDimensions] = useState<Array<{ id: string; name: string }>>([]);
  
  // Date aggregation state
  const [activeDateTab, setActiveDateTab] = useState<'day' | 'week' | 'month' | 'year'>('day');
  const [dateOrder, setDateOrder] = useState<'asc' | 'desc'>('desc');
  
  // Combined analytics data
  const [combinedData, setCombinedData] = useState<CombinedAnalyticsData | null>(null);
  const [isCombinedLoading, setIsCombinedLoading] = useState(false);

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

  // Load dimensions for grouping controls
  useEffect(() => {
    if (reports.length > 0) {
      loadDimensions();
    }
  }, [reports.length, accountId]);

  const loadDimensions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const reportIds = reports.map(r => r.id);
      let query = supabase
        .from('dimensions')
        .select('id, name, type, scope')
        .eq('type', 'text');

      if (accountId) {
        query = query.or(`account_id.eq.${accountId},scope.eq.global,report_id.in.(${reportIds.join(',')})`);
      } else if (reportIds.length > 0) {
        query = query.or(`scope.eq.global,report_id.in.(${reportIds.join(',')})`);
      }

      const { data, error } = await query.order('name');

      if (error) {
        console.error('[ALL-REPORTS] Error loading dimensions:', error);
        return;
      }

      const dimensionMap = new Map<string, { id: string; name: string }>();
      (data || []).forEach(dim => {
        if (!dim || !dim.id || !dim.name) return;
        const existing = dimensionMap.get(dim.name);
        if (!existing || 
            (dim.scope === 'account' && existing.id !== dim.id)) {
          dimensionMap.set(dim.name, { id: dim.id, name: dim.name });
        }
      });

      const uniqueDimensions = Array.from(dimensionMap.values())
        .filter(d => !['Impressions', 'Clicks', 'Conversions', 'Cost', 'Revenue', 'CTR', 'Conversion rate', 'CPC', 'ROAS', 'Cost of sale'].includes(d.name))
        .sort((a, b) => a.name.localeCompare(b.name));

      setAllDimensions(uniqueDimensions);
    } catch (error) {
      console.error('[ALL-REPORTS] Error in loadDimensions:', error);
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
    
    // Refresh combined analytics
    loadCombinedAnalytics(dimension, values, dateRange, reportIds);
  };

  const handleGroupingChange = (
    groupBy: string[],
    breakdown: string[],
    thenBy: string[]
  ) => {
    console.log('[COMBINED-GROUPING] Grouping changed:', { groupBy, breakdown, thenBy });
    setGroupByDimensions(groupBy);
    setBreakdownDimensions(breakdown);
    setThenByDimensions(thenBy);
    
    // Refresh combined analytics with new grouping
    loadCombinedAnalytics(
      masterFilterDimension,
      masterFilterValues,
      masterFilterDateRange,
      masterFilterReportIds,
      groupBy,
      breakdown,
      thenBy
    );
  };

  const loadCombinedAnalytics = async (
    dimension: string | null = masterFilterDimension, 
    values: string[] = masterFilterValues,
    dateRange?: DateRange,
    filterReportIds?: string[],
    groupBy: string[] = groupByDimensions,
    breakdown: string[] = breakdownDimensions,
    thenBy: string[] = thenByDimensions,
    dateTab: 'day' | 'week' | 'month' | 'year' = activeDateTab,
    order: 'asc' | 'desc' = dateOrder
  ) => {
    if (reports.length === 0) return;
    
    setIsCombinedLoading(true);
    try {
      const reportIds = filterReportIds && filterReportIds.length > 0 
        ? filterReportIds 
        : reports.map(r => r.id);
      
      console.log('[ALL-REPORTS] Loading combined analytics:', {
        reportIds: reportIds.length,
        dimension,
        values,
        dateRange,
        hasDateRange: !!dateRange,
        groupBy,
        breakdown,
        thenBy
      });
        
      const masterFilter: MasterFilterState = {
        mode: 'combined',
        dimension,
        values,
        dateRange: dateRange && dateRange.from && dateRange.to ? {
          from: dateRange.from,
          to: dateRange.to
        } : masterFilterDateRange && masterFilterDateRange.from && masterFilterDateRange.to ? {
          from: masterFilterDateRange.from,
          to: masterFilterDateRange.to
        } : undefined,
        reportIds,
        aggregationMethod: 'sum',
        groupByDimensions: groupBy,
        breakdownDimensions: breakdown,
        thenByDimensions: thenBy
      };
      
      const data = await getCombinedAnalytics(reportIds, masterFilter, dateTab, order);
      setCombinedData(data);
      
      toast({
        title: "Combined Analytics Loaded",
        description: `Showing aggregated data from ${reportIds.length} report(s)`,
      });
    } catch (error) {
      console.error('[COMBINED-ANALYTICS] Error loading combined analytics:', error);
      toast({
        title: "Error",
        description: "Failed to load combined analytics",
        variant: "destructive",
      });
    } finally {
      setIsCombinedLoading(false);
    }
  };

  // Load combined analytics when reports are loaded
  useEffect(() => {
    if (reports.length > 0 && !isCombinedLoading && !combinedData) {
      console.log('[ALL-REPORTS] Auto-loading combined analytics on mount');
      loadCombinedAnalytics();
    }
  }, [reports.length]);

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
        onRefreshData={() => loadCombinedAnalytics()}
      />
      
      {reports.length > 0 ? (
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
          
          {/* Combined Analytics View */}
          <div className="space-y-6">
            {isCombinedLoading ? (
              <Card className="p-12">
                <div className="flex flex-col items-center gap-4">
                  <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
                  <p className="text-muted-foreground">Loading combined analytics...</p>
                </div>
              </Card>
            ) : combinedData ? (
              <>
                <CombinedKPIMetricsCards 
                  metrics={combinedData.metrics} 
                  reportCount={masterFilterReportIds.length || reports.length}
                  visibleKPIs={visibleKPIs}
                  onVisibleKPIsChange={setVisibleKPIs}
                />
                <CombinedPerformanceTable 
                  data={combinedData.tableData}
                  visibleColumns={visibleColumns}
                  onVisibleColumnsChange={setVisibleColumns}
                  groupByDimensions={groupByDimensions}
                  breakdownDimensions={breakdownDimensions}
                  thenByDimensions={thenByDimensions}
                  allDimensions={allDimensions}
                  activeDateTab={activeDateTab}
                  onDateTabChange={(tab) => {
                    setActiveDateTab(tab);
                    loadCombinedAnalytics(undefined, undefined, undefined, undefined, undefined, undefined, undefined, tab);
                  }}
                  dateOrder={dateOrder}
                  onDateOrderChange={(order) => {
                    setDateOrder(order);
                    loadCombinedAnalytics(undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, order);
                  }}
                  accountId={accountId}
                  reportIds={reports.map(r => r.id)}
                  onGroupingChange={handleGroupingChange}
                />
              </>
            ) : (
              <Card className="p-12">
                <div className="text-center">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-lg font-semibold mb-2">No Data Available</h3>
                  <p className="text-muted-foreground">
                    {masterFilterDateRange || masterFilterDimension
                      ? "No data matches the selected filters"
                      : "Adjust filters to view combined analytics"}
                  </p>
                </div>
              </Card>
            )}
          </div>
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
