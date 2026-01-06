import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { DashboardHeader } from "@/components/DashboardHeader";
import { ReportsSidebar } from "@/components/ReportsSidebar";
import { ReportModal } from "@/components/ReportModal";
import { MasterReportTable } from "@/components/MasterReportTable";
import {
  MasterReportSettingsModal,
  type ChannelConfig,
} from "@/components/MasterReportSettingsModal";

import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";
import { toast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { Settings } from "lucide-react";

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

const DEFAULT_CHANNEL_CONFIG: ChannelConfig = {
  groupByDimensionId: null,
  groupByDimensionName: null,
  selectedValues: [],
  selectedMetrics: ["Cost", "Revenue", "ROAS", "Conversions"],
};

export default function AllReports() {
  const navigate = useNavigate();
  const { accountId } = useParams<{ accountId?: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reports, setReports] = useState<Report[]>([]);
  const [account, setAccount] = useState<{ id: string; name: string } | null>(
    null
  );
  const [dataSources, setDataSources] = useState<Record<string, DataSource[]>>(
    {}
  );
  const [showCreateReportModal, setShowCreateReportModal] = useState(false);

  // Channel configurations (session only)
  const [channelConfigs, setChannelConfigs] = useState<
    Record<string, ChannelConfig>
  >({});

  // Settings modal state
  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [selectedReportForSettings, setSelectedReportForSettings] =
    useState<Report | null>(null);

  // Active channel tab
  const [activeChannel, setActiveChannel] = useState<string | null>(null);

  // Initialize default configs when reports load
  useEffect(() => {
    if (reports.length > 0) {
      const initialConfigs: Record<string, ChannelConfig> = {};
      reports.forEach((report) => {
        if (!channelConfigs[report.id]) {
          initialConfigs[report.id] = { ...DEFAULT_CHANNEL_CONFIG };
        }
      });
      if (Object.keys(initialConfigs).length > 0) {
        setChannelConfigs((prev) => ({ ...prev, ...initialConfigs }));
      }
      // Set first report as active channel if none selected
      if (!activeChannel && reports.length > 0) {
        setActiveChannel(reports[0].id);
      }
    }
  }, [reports]);

  // Load user session and reports on mount and when accountId changes
  useEffect(() => {
    checkAuth();
  }, [accountId]);

  const checkAuth = async () => {
    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) throw error;

      if (!session) {
        navigate("/auth");
        return;
      }

      setSession(session);

      // Load account if accountId is provided
      if (accountId) {
        const { data: accountData, error: accountError } = await supabase
          .from("accounts")
          .select("id, name")
          .eq("id", accountId)
          .eq("user_id", session.user.id)
          .single();

        if (accountError) {
          console.error("Error loading account:", accountError);
          toast({
            title: "Error",
            description: "Account not found. Redirecting...",
            variant: "destructive",
          });
          navigate("/");
          return;
        }

        if (accountData) {
          setAccount(accountData);
        }
      }

      // Load user's reports, filtered by accountId if provided
      let reportsQuery = supabase
        .from("reports")
        .select("*")
        .eq("user_id", session.user.id);

      // Filter by account if accountId is provided
      if (accountId) {
        reportsQuery = reportsQuery.eq("account_id", accountId);
      }

      const { data: reportsData, error: reportsError } = await reportsQuery.order(
        "created_at",
        { ascending: false }
      );

      if (reportsError) throw reportsError;

      if (reportsData && reportsData.length > 0) {
        setReports(reportsData);

        // Load data sources for each report
        const dataSourcesMap: Record<string, DataSource[]> = {};

        for (const report of reportsData) {
          const { data: sources, error: sourcesError } = await supabase
            .from("data_sources")
            .select("id, name, report_id")
            .eq("report_id", report.id)
            .order("created_at", { ascending: true });

          if (!sourcesError && sources && sources.length > 0) {
            dataSourcesMap[report.id] = sources;
          }
        }

        setDataSources(dataSourcesMap);
      } else if (accountId && reportsData && reportsData.length === 0) {
        toast({
          title: "No Reports",
          description: `No reports found for this account.`,
        });
      }
    } catch (error) {
      console.error("Error loading reports:", error);
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
      navigate("/auth");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  const handleEditReport = (reportId: string) => {
    const report = reports.find((r) => r.id === reportId);
    if (report?.account_id) {
      navigate(`/tools/data/${report.account_id}?reportId=${reportId}&edit=true`);
    } else if (accountId) {
      navigate(`/tools/data/${accountId}?reportId=${reportId}&edit=true`);
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this report? This action cannot be undone."
      )
    ) {
      return;
    }

    try {
      const { error } = await supabase
        .from("reports")
        .delete()
        .eq("id", reportId);

      if (error) throw error;

      setReports((prev) => prev.filter((r) => r.id !== reportId));

      // Update active channel if deleted
      if (activeChannel === reportId) {
        const remaining = reports.filter((r) => r.id !== reportId);
        setActiveChannel(remaining.length > 0 ? remaining[0].id : null);
      }

      toast({
        title: "Success",
        description: "Report deleted successfully.",
      });
    } catch (error) {
      console.error("Error deleting report:", error);
      toast({
        title: "Error",
        description: "Failed to delete report. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleAddNewReport = () => {
    setShowCreateReportModal(true);
  };

  const openSettingsModal = (report: Report) => {
    setSelectedReportForSettings(report);
    setSettingsModalOpen(true);
  };

  const handleSaveConfig = (config: ChannelConfig) => {
    if (selectedReportForSettings) {
      setChannelConfigs((prev) => ({
        ...prev,
        [selectedReportForSettings.id]: config,
      }));
    }
  };

  const refreshData = () => {
    // Trigger re-render by updating configs
    setChannelConfigs((prev) => ({ ...prev }));
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
      <div className="min-h-screen bg-background flex w-full">
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
            reportId={null}
            accountId={accountId || undefined}
            onReportChange={(selectedReportId) => {
              if (accountId) {
                navigate(`/tools/data/${accountId}?reportId=${selectedReportId}`);
              } else {
                const selectedReport = reports.find(
                  (r) => r.id === selectedReportId
                );
                if (selectedReport?.account_id) {
                  navigate(
                    `/tools/data/${selectedReport.account_id}?reportId=${selectedReportId}`
                  );
                }
              }
            }}
            session={session}
            onSignOut={handleSignOut}
            onRefreshData={refreshData}
          />

          {reports.length > 0 ? (
            <main className="container mx-auto px-6 py-6">
              <Card className="p-6">
                {/* Header */}
                <div className="border-b pb-4 mb-6">
                  <h2 className="text-2xl font-bold text-foreground">
                    {account?.name || "Master Report"}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {reports.length} channel{reports.length !== 1 ? "s" : ""}{" "}
                    configured
                  </p>
                </div>

                {/* Channel Tabs */}
                <Tabs
                  value={activeChannel || reports[0]?.id}
                  onValueChange={setActiveChannel}
                >
                  <div className="flex items-center justify-between mb-4">
                    <TabsList>
                      {reports.map((report) => (
                        <TabsTrigger key={report.id} value={report.id}>
                          {report.name}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </div>

                  {reports.map((report) => (
                    <TabsContent key={report.id} value={report.id}>
                      {/* Channel Header with Settings */}
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-lg font-semibold">
                            {report.name}
                          </h3>
                          {channelConfigs[report.id]?.groupByDimensionName && (
                            <p className="text-sm text-muted-foreground">
                              Grouped by:{" "}
                              {channelConfigs[report.id].groupByDimensionName}
                              {channelConfigs[report.id].selectedValues.length >
                                0 && (
                                <>
                                  {" "}
                                  ({channelConfigs[report.id].selectedValues.length}{" "}
                                  values)
                                </>
                              )}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openSettingsModal(report)}
                        >
                          <Settings className="h-4 w-4 mr-2" />
                          Configure
                        </Button>
                      </div>

                      {/* Data Table with Date Tabs */}
                      <MasterReportTable
                        reportId={report.id}
                        reportName={report.name}
                        config={
                          channelConfigs[report.id] || DEFAULT_CHANNEL_CONFIG
                        }
                        accountId={accountId}
                      />
                    </TabsContent>
                  ))}
                </Tabs>
              </Card>
            </main>
          ) : (
            <main className="container mx-auto px-6 py-6">
              <div className="text-center py-12">
                <h2 className="text-2xl font-bold mb-4">No Reports Found</h2>
                <p className="text-muted-foreground mb-6">
                  {accountId
                    ? `No reports found for ${account?.name || "this account"}. Create a report to get started.`
                    : "You don't have any reports yet. Create your first report to get started."}
                </p>
                <Button onClick={handleAddNewReport}>Create Report</Button>
              </div>
            </main>
          )}
        </SidebarInset>
      </div>

      {/* Settings Modal */}
      {selectedReportForSettings && (
        <MasterReportSettingsModal
          open={settingsModalOpen}
          onOpenChange={setSettingsModalOpen}
          reportId={selectedReportForSettings.id}
          reportName={selectedReportForSettings.name}
          currentConfig={
            channelConfigs[selectedReportForSettings.id] || DEFAULT_CHANNEL_CONFIG
          }
          onSave={handleSaveConfig}
        />
      )}

      {/* Create Report Modal */}
      <ReportModal
        open={showCreateReportModal}
        onOpenChange={setShowCreateReportModal}
        title="Create Report"
        description={
          account
            ? `Create a new report for ${account.name}.`
            : "Create a new report."
        }
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
          toast({
            title: "Report created",
            description: "Your report was created successfully.",
          });
        }}
      />
    </SidebarProvider>
  );
}
