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

interface Dimension {
  id: string;
  name: string;
  type: string;
  formula: string | null;
  scope?: 'global' | 'custom' | 'account';
  account_id?: string;
}

interface Report {
  id: string;
  name: string;
  user_id?: string;
  owner_email?: string;
  is_shared?: boolean;
}

interface DashboardHeaderProps {
  reportId: string | null;
  accountId?: string;
  onReportChange: (reportId: string) => void;
  onDataSync?: () => void;
  onRefreshData?: () => void;
  session?: any;
  onSignOut?: () => Promise<void>;
  isSharedView?: boolean;
}

export const DashboardHeader = ({ reportId, onReportChange, onDataSync, onRefreshData }: DashboardHeaderProps) => {
  const [showDataSourceModal, setShowDataSourceModal] = useState(false);
  const [showDataSourcesListModal, setShowDataSourcesListModal] = useState(false);
  const [showDimensionsListModal, setShowDimensionsListModal] = useState(false);
  const [showDimensionModal, setShowDimensionModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [editingDimension, setEditingDimension] = useState<Dimension | null>(null);
  const [dimensionModalMode, setDimensionModalMode] = useState<'add' | 'edit'>('add');
  const [dimensionRefreshTrigger, setDimensionRefreshTrigger] = useState(0);
  const [reports, setReports] = useState<Report[]>([]);
  const [currentReport, setCurrentReport] = useState<Report | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdateDate, setLastUpdateDate] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

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

  // Load last update date when report changes
  useEffect(() => {
    if (reportId) {
      loadLastUpdateDate(reportId);
    }
  }, [reportId]);

  const loadLastUpdateDate = async (reportId: string) => {
    try {
      // Use data_sources table instead which is much smaller
      const { data, error } = await supabase
        .from('data_sources')
        .select('updated_at')
        .eq('report_id', reportId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error("Error loading last update date:", error);
        setLastUpdateDate(null);
        return;
      }

      if (data) {
        // Format date as YYYY-MM-DD
        const date = new Date(data.updated_at);
        setLastUpdateDate(date.toISOString().split('T')[0]);
      }
    } catch (error) {
      console.error("Error loading last update date:", error);
      setLastUpdateDate(null);
    }
  };

  const createDefaultDimensions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !reportId) return;

      console.log('[testing] Creating default dimensions for report:', reportId);

      // Get existing dimensions for this specific report
      const { data: existingDimensions } = await supabase
        .from('dimensions')
        .select('name, id')
        .eq('user_id', user.id)
        .eq('report_id', reportId);

      const existingNames = new Set(existingDimensions?.map(d => d.name) || []);
      console.log('[testing] Existing dimensions for report:', Array.from(existingNames));

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

      // Filter out dimensions that already exist and mark as system dimensions
      const missingDimensions = [
        ...defaultMetrics.filter(m => !existingNames.has(m.name)).map(m => ({ 
          ...m, 
          user_id: user.id,
          report_id: reportId,
          formula: null,
          is_system: true 
        })),
        ...formulaKPIs.filter(k => !existingNames.has(k.name)).map(k => ({ 
          ...k, 
          user_id: user.id,
          report_id: reportId,
          is_system: true 
        }))
      ];

      // Only insert if there are missing dimensions
      if (missingDimensions.length > 0) {
        console.log('[testing] Creating report-specific system dimensions:', missingDimensions.map(d => d.name));
        console.log('[testing] For report ID:', reportId);
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

  const handleRefresh = async () => {
    if (!reportId) return;
    
    setIsSyncing(true);
    
    try {
      // Get all data sources for this report
      const { data: dataSources, error: dsError } = await supabase
        .from('data_sources')
        .select('*')
        .eq('report_id', reportId);

      if (dsError) throw dsError;

      if (!dataSources || dataSources.length === 0) {
        toast({
          title: "No data sources",
          description: "Add a data source to sync data",
          variant: "destructive",
        });
        setIsSyncing(false);
        return;
      }

      toast({
        title: "Syncing data...",
        description: `Importing data from ${dataSources.length} source(s)`,
      });

      let totalRowsImported = 0;

      // Sync each data source
      for (const dataSource of dataSources) {
        try {
          // Fetch data from Google Sheets
          const { data: sheetsData, error: sheetsError } = await supabase.functions.invoke('fetch-google-sheets', {
            body: {
              spreadsheetId: dataSource.spreadsheet_id,
              tabName: dataSource.tab_name,
              range: `${dataSource.header_row + 1}:300000`,
            },
          });

          if (sheetsError) throw sheetsError;

          const sheetRows = sheetsData?.values || [];
          
          // Invoke migrate-sheet-data edge function to process the data
          const { data: migrateResult, error: migrateError } = await supabase.functions.invoke('migrate-sheet-data', {
            body: {
              dataSourceId: dataSource.id,
              reportId: reportId,
              sheetData: sheetRows,
              columnMappings: dataSource.column_mappings,
            },
          });

          if (migrateError) throw migrateError;

          if (migrateResult?.rowCount) {
            totalRowsImported += migrateResult.rowCount;
          }

          // Update the data source's updated_at timestamp
          await supabase
            .from('data_sources')
            .update({ updated_at: new Date().toISOString() })
            .eq('id', dataSource.id);

        } catch (sourceError) {
          console.error(`Error syncing data source ${dataSource.name}:`, sourceError);
          toast({
            title: "Partial sync",
            description: `Failed to sync ${dataSource.name}`,
            variant: "destructive",
          });
        }
      }

      // Refresh the last update date
      await loadLastUpdateDate(reportId);

      toast({
        title: "Refresh complete",
        description: `Successfully imported ${totalRowsImported.toLocaleString()} rows with ${dataSources.length} dimension(s)`,
      });

      // Trigger data refresh in the parent component
      onRefreshData?.();

    } catch (error) {
      console.error("Error refreshing data:", error);
      toast({
        title: "Error",
        description: "Failed to refresh data from Google Sheets",
        variant: "destructive",
      });
    } finally {
      setIsSyncing(false);
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
          {lastUpdateDate && (
            <span className="text-sm text-muted-foreground">
              Last update: {lastUpdateDate}
            </span>
          )}
          <Button 
            variant="outline" 
            className="gap-2"
            onClick={handleRefresh}
            disabled={!currentReport || isSyncing}
          >
            <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing...' : 'Refresh'}
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
              refreshTrigger={dimensionRefreshTrigger}
              reportId={reportId}
              onAddNew={() => {
                console.log('[testing] Opening add dimension modal');
                setDimensionModalMode('add');
                setEditingDimension(null);
                setShowDimensionsListModal(false);
                setShowDimensionModal(true);
              }}
              onEdit={(dimension) => {
                console.log('[testing] Opening edit dimension modal for:', dimension);
                setDimensionModalMode('edit');
                setEditingDimension(dimension);
                setShowDimensionsListModal(false);
                setShowDimensionModal(true);
              }}
            />
      
                  <DimensionModal
              open={showDimensionModal}
              onOpenChange={(open) => {
                setShowDimensionModal(open);
                if (!open) {
                  // Reopen the list modal when closing the modal
                  setShowDimensionsListModal(true);
                  setEditingDimension(null);
                }
              }}
              dimension={editingDimension}
              mode={dimensionModalMode}
              reportId={reportId}
              accountId={accountId}
              onSaved={() => {
                console.log('[testing] Dimension saved, refreshing list');
                // Trigger refresh of dimensions list
                setDimensionRefreshTrigger(prev => prev + 1);
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
