import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Database, Share2, Plus, Trash2, Pencil, Grid3x3, RefreshCw } from "lucide-react";
import { useState, useEffect } from "react";
import { DataSourceModal } from "./DataSourceModal";
import { DataSourcesListModal } from "./DataSourcesListModal";
import { DimensionsListModal } from "./DimensionsListModal";
import { DimensionModal } from "./DimensionModal";
import { ReportModal } from "./ReportModal";
import { ShareModal } from "./ShareModal";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Report {
  id: string;
  name: string;
  user_id?: string;
  owner_email?: string;
  is_shared?: boolean;
}

interface DashboardHeaderProps {
  reportId: string | null;
  onReportChange: (reportId: string) => void;
  onDataSync?: () => void;
}

export const DashboardHeader = ({ reportId, onReportChange, onDataSync }: DashboardHeaderProps) => {
  const [showDataSourceModal, setShowDataSourceModal] = useState(false);
  const [showDataSourcesListModal, setShowDataSourcesListModal] = useState(false);
  const [showDimensionsListModal, setShowDimensionsListModal] = useState(false);
  const [showDimensionModal, setShowDimensionModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [currentReport, setCurrentReport] = useState<Report | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load reports on mount
  useEffect(() => {
    loadReports();
  }, []);

  // Create default dimensions when reportId changes
  useEffect(() => {
    if (reportId) {
      createDefaultDimensions();
    }
  }, [reportId]);

  // Update currentReport when reportId changes
  useEffect(() => {
    if (reportId && reports.length > 0) {
      const report = reports.find(r => r.id === reportId);
      if (report) {
        setCurrentReport(report);
      }
    }
  }, [reportId, reports]);

  const createDefaultDimensions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get existing dimensions
      const { data: existingDimensions } = await supabase
        .from('dimensions')
        .select('name, id')
        .eq('user_id', user.id);

      const existingNames = new Set(existingDimensions?.map(d => d.name) || []);

      // Define all default dimensions
      const defaultMetrics = [
        { name: 'Impressions', type: 'number' },
        { name: 'Clicks', type: 'number' },
        { name: 'Revenue', type: 'currency' },
        { name: 'Cost', type: 'currency' },
        { name: 'Conversions', type: 'number' },
        { name: 'Leads', type: 'number' },
      ];

      const formulaKPIs = [
        { name: 'CTR', type: 'percentage', formula: 'Clicks / Impressions * 100' },
        { name: 'ROAS', type: 'number', formula: 'Revenue / Cost' },
        { name: 'Cost of sale', type: 'percentage', formula: 'Cost / Revenue * 100' },
        { name: 'Conversion Rate', type: 'percentage', formula: 'Conversions / Clicks * 100' },
        { name: 'CPM', type: 'currency', formula: 'Cost / Impressions * 1000' },
        { name: 'CPC', type: 'currency', formula: 'Cost / Clicks' },
        { name: 'Impression Share', type: 'percentage', formula: 'Impressions / Total Impressions * 100' },
      ];

      // Filter out dimensions that already exist
      const missingDimensions = [
        ...defaultMetrics.filter(m => !existingNames.has(m.name)).map(m => ({ ...m, user_id: user.id, formula: null })),
        ...formulaKPIs.filter(k => !existingNames.has(k.name)).map(k => ({ ...k, user_id: user.id }))
      ];

      // Only insert if there are missing dimensions
      if (missingDimensions.length > 0) {
        await supabase.from('dimensions').insert(missingDimensions);
      }
    } catch (error) {
      console.error("Error creating default dimensions:", error);
    }
  };

  const loadReports = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      // Check if user is master account
      const isMasterAccount = user.email === 'contact@gosgconsulting.com';

      if (isMasterAccount) {
        // Master account sees all reports
        const { data: allReportsData, error: allReportsError } = await supabase
          .from('reports')
          .select('*')
          .order('created_at', { ascending: false });

        if (allReportsError) {
          console.error("Error loading all reports:", allReportsError);
          throw allReportsError;
        }

        // Get all user IDs to fetch owner emails
        const userIds = [...new Set((allReportsData || []).map(r => r.user_id))];
        const { data: owners, error: ownersError } = await supabase
          .from('profiles')
          .select('id, email')
          .in('id', userIds);

        if (ownersError) {
          console.error("Error loading owner profiles:", ownersError);
        }

        const ownerMap = new Map(owners?.map(o => [o.id, o.email]) || []);
        
        const allReports = (allReportsData || []).map(report => ({
          ...report,
          owner_email: ownerMap.get(report.user_id),
          is_shared: report.user_id !== user.id,
        }));

        setReports(allReports);
        if (allReports.length > 0) {
          setCurrentReport(allReports[0]);
        }
      } else {
        // Regular user: get owned and shared reports
        // Get owned reports
        const { data: ownedReports, error: ownedError } = await supabase
          .from('reports')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (ownedError) {
          console.error("Error loading owned reports:", ownedError);
          throw ownedError;
        }

        // Get shared report IDs
        const { data: shares, error: sharesError } = await supabase
          .from('report_shares')
          .select('report_id, created_by')
          .eq('shared_with_email', user.email);

        if (sharesError) {
          console.error("Error loading shares:", sharesError);
          throw sharesError;
        }

        let sharedReportsWithOwner = [];
        
        if (shares && shares.length > 0) {
          // Get shared reports
          const sharedReportIds = shares.map(s => s.report_id);
          const { data: sharedReports, error: sharedReportsError } = await supabase
            .from('reports')
            .select('*')
            .in('id', sharedReportIds);

          if (sharedReportsError) {
            console.error("Error loading shared reports:", sharedReportsError);
          } else {
            // Get owner emails
            const ownerIds = [...new Set(shares.map(s => s.created_by))];
            const { data: owners, error: ownersError } = await supabase
              .from('profiles')
              .select('id, email')
              .in('id', ownerIds);

            if (ownersError) {
              console.error("Error loading owner profiles:", ownersError);
            }

            const ownerMap = new Map(owners?.map(o => [o.id, o.email]) || []);
            
            sharedReportsWithOwner = (sharedReports || []).map(report => {
              const share = shares.find(s => s.report_id === report.id);
              return {
                ...report,
                owner_email: share ? ownerMap.get(share.created_by) : 'Unknown',
                is_shared: true,
              };
            });
          }
        }

        const allReports = [
          ...(ownedReports || []).map(r => ({ ...r, is_shared: false })),
          ...sharedReportsWithOwner,
        ];

        setReports(allReports);
        if (allReports.length > 0) {
          setCurrentReport(allReports[0]);
        }
      }
    } catch (error) {
      console.error("Error loading reports:", error);
      toast({
        title: "Error loading reports",
        description: "Failed to load your reports",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateReport = async (name: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error("User not authenticated");
      }

      const { data, error } = await supabase
        .from('reports')
        .insert({ 
          name,
          user_id: user.id 
        })
        .select()
        .single();

      if (error) throw error;

      setReports([data, ...reports]);
      setCurrentReport(data);
      onReportChange(data.id); // Notify parent
      setShowReportModal(false);
      
      toast({
        title: "Report created",
        description: `Created "${data.name}" with default metrics`,
      });
    } catch (error) {
      console.error("Error creating report:", error);
      toast({
        title: "Error",
        description: "Failed to create report",
        variant: "destructive",
      });
    }
  };

  const handleEditReport = async (name: string) => {
    if (!editingReport) return;

    try {
      const { error } = await supabase
        .from('reports')
        .update({ name })
        .eq('id', editingReport.id);

      if (error) throw error;

      const updatedReports = reports.map(r => 
        r.id === editingReport.id ? { ...r, name } : r
      );
      setReports(updatedReports);
      
      if (currentReport?.id === editingReport.id) {
        setCurrentReport({ ...currentReport, name });
      }

      setShowReportModal(false);
      setEditingReport(null);
      
      toast({
        title: "Report updated",
        description: `Renamed to "${name}"`,
      });
    } catch (error) {
      console.error("Error updating report:", error);
      toast({
        title: "Error",
        description: "Failed to update report",
        variant: "destructive",
      });
    }
  };

  const handleDeleteReport = async (report: Report) => {
    try {
      const { error } = await supabase
        .from('reports')
        .delete()
        .eq('id', report.id);

      if (error) throw error;

      const updatedReports = reports.filter(r => r.id !== report.id);
      setReports(updatedReports);
      
      if (currentReport?.id === report.id) {
        const nextReport = updatedReports[0] || null;
        setCurrentReport(nextReport);
        if (nextReport) {
          onReportChange(nextReport.id); // Notify parent
        }
      }
      
      toast({
        title: "Report deleted",
        description: `Deleted "${report.name}"`,
      });
    } catch (error) {
      console.error("Error deleting report:", error);
      toast({
        title: "Error",
        description: "Failed to delete report",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <header className="border-b bg-card px-6 py-3 flex items-center justify-between">
        <div className="text-muted-foreground">Loading...</div>
      </header>
    );
  }

  return (
    <>
      <header className="border-b bg-card px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                {currentReport?.name || "Select Report"} <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-80 bg-background z-50">
              {reports.map((report) => (
                <DropdownMenuItem 
                  key={report.id}
                  className={`justify-between group ${report.is_shared ? 'flex-col items-start' : ''}`}
                  onSelect={(e) => e.preventDefault()}
                >
                  <div className="flex items-center justify-between w-full">
                    <span 
                      className="flex-1 cursor-pointer"
                      onClick={() => {
                        setCurrentReport(report);
                        onReportChange(report.id);
                      }}
                    >
                      {report.name}
                    </span>
                    {!report.is_shared && (
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingReport(report);
                            setShowReportModal(true);
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteReport(report);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                  {report.is_shared && report.owner_email && (
                    <span className="text-xs text-muted-foreground mt-1">
                      Owner: {report.owner_email}
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
              {reports.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem 
                className="text-primary" 
                onClick={() => {
                  setEditingReport(null);
                  setShowReportModal(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add new
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setShowDataSourcesListModal(true)}
            disabled={!currentReport}
          >
            <Database className="h-4 w-4" />
            Data sources
          </Button>

          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setShowDimensionsListModal(true)}
          >
            <Grid3x3 className="h-4 w-4" />
            Dimensions
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            className="gap-2"
            onClick={onDataSync}
            disabled={!currentReport}
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button 
            variant="outline" 
            className="gap-2"
            onClick={() => setShowShareModal(true)}
            disabled={!currentReport}
          >
            <Share2 className="h-4 w-4" />
            Share
          </Button>
        </div>
      </header>

      {currentReport && (
        <>
          <DataSourcesListModal
            open={showDataSourcesListModal}
            onOpenChange={setShowDataSourcesListModal}
            reportId={currentReport.id}
            onAddNew={() => {
              setShowDataSourcesListModal(false);
              setShowDataSourceModal(true);
            }}
            onDataSync={onDataSync}
          />
          
          <DataSourceModal
            open={showDataSourceModal}
            onOpenChange={(open) => {
              setShowDataSourceModal(open);
              if (!open) {
                // Reopen the list modal when closing the add modal
                setShowDataSourcesListModal(true);
              }
            }}
            reportId={currentReport.id}
          />
        </>
      )}

      <DimensionsListModal
        open={showDimensionsListModal}
        onOpenChange={setShowDimensionsListModal}
        onAddNew={() => {
          setShowDimensionsListModal(false);
          setShowDimensionModal(true);
        }}
      />
      
      <DimensionModal
        open={showDimensionModal}
        onOpenChange={(open) => {
          setShowDimensionModal(open);
          if (!open) {
            // Reopen the list modal when closing the add modal
            setShowDimensionsListModal(true);
          }
        }}
      />

      <ReportModal
        open={showReportModal}
        onOpenChange={(open) => {
          setShowReportModal(open);
          if (!open) setEditingReport(null);
        }}
        onSave={editingReport ? handleEditReport : handleCreateReport}
        initialName={editingReport?.name}
        title={editingReport ? "Edit Report" : "Create New Report"}
        description={editingReport ? "Update the report name" : "Enter a name for your new report"}
      />

      {currentReport && (
        <ShareModal
          reportId={currentReport.id}
          reportName={currentReport.name}
          open={showShareModal}
          onOpenChange={setShowShareModal}
        />
      )}
    </>
  );
};
