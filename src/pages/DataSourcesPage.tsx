import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, ArrowLeft, FileSpreadsheet, RefreshCw, Trash2, Eye, Settings, Pencil, Check, X } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { DataSourceSelectionModal } from "@/components/DataSourceSelectionModal";
import { UnifiedDataSourceModal } from "@/components/UnifiedDataSourceModal";
import { ViewDataModal } from "@/components/ViewDataModal";
import { EditMappingModal } from "@/components/EditMappingModal";
import { EditDataSourceModal } from "@/components/EditDataSourceModal";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { syncDataSource } from "@/lib/sync-utils";
import { useUserAccount } from "@/hooks/useUserAccount";

interface DataSource {
  id: string;
  name: string;
  google_sheets_url?: string | null;
  spreadsheet_id?: string | null;
  tab_name?: string | null;
  csv_url?: string | null;
  source_type?: 'google_sheets' | 'csv_url';
  header_row: number;
  column_mappings: any[] | null;
  report_id?: string;
  report_name?: string;
  currency?: string | null;
  last_synced_at?: string | null;
  sync_frequency?: string | null;
  sync_time?: string | null;
  sync_timezone?: string | null;
}

interface Report {
  id: string;
  name: string;
}

export default function DataSourcesPage() {
  const { accountId: urlAccountId } = useParams<{ accountId?: string }>();
  const { account: resolvedAccount, isLoading: isResolvingAccount } = useUserAccount();
  const accountId = urlAccountId ?? resolvedAccount?.id ?? null;
  const navigate = useNavigate();
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [showDataSourceSelectionModal, setShowDataSourceSelectionModal] = useState(false);
  const [showUnifiedDataSourceModal, setShowUnifiedDataSourceModal] = useState(false);
  const [showReportSelectionModal, setShowReportSelectionModal] = useState(false);
  const [selectedSourceType, setSelectedSourceType] = useState<'google_sheets' | 'csv_url'>('google_sheets');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [viewingDataSource, setViewingDataSource] = useState<DataSource | null>(null);
  const [editingDataSource, setEditingDataSource] = useState<DataSource | null>(null);
  const [showViewDataModal, setShowViewDataModal] = useState(false);
  const [showEditMappingModal, setShowEditMappingModal] = useState(false);
  const [showEditDataSourceModal, setShowEditDataSourceModal] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingDataSource, setDeletingDataSource] = useState<DataSource | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState<string>("");
  const [isCreatingBookingReport, setIsCreatingBookingReport] = useState(false);
  const [isCreatingPriceCheckReport, setIsCreatingPriceCheckReport] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (accountId) {
      loadReports();
      loadDataSources();
    }
  }, [accountId]);

  const checkAuth = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      setSession(session);
    } catch (error) {
      console.error("Error checking auth:", error);
    }
  };

  const loadReports = async () => {
    if (!accountId) return;

    try {
      const { data, error } = await supabase
        .from('reports')
        .select('id, name')
        .eq('account_id', accountId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReports(data || []);
    } catch (error) {
      console.error("Error loading reports:", error);
      toast({
        title: "Error",
        description: "Failed to load reports",
        variant: "destructive",
      });
    }
  };

  const loadDataSources = async () => {
    if (!accountId) return;

    setIsLoading(true);
    try {
      // Get all reports for this account
      const { data: reportsData, error: reportsError } = await supabase
        .from('reports')
        .select('id, name')
        .eq('account_id', accountId);

      if (reportsError) throw reportsError;

      if (!reportsData || reportsData.length === 0) {
        setDataSources([]);
        setIsLoading(false);
        return;
      }

      const reportIds = reportsData.map(r => r.id);
      const reportMap = new Map(reportsData.map(r => [r.id, r.name]));

      // Get all data sources for these reports
      const { data, error } = await supabase
        .from('data_sources')
        .select('*')
        .in('report_id', reportIds)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Add report names to data sources
      const processedData = (data || []).map(ds => ({
        ...ds,
        column_mappings: Array.isArray(ds.column_mappings) ? ds.column_mappings : [],
        report_name: reportMap.get(ds.report_id) || 'Unknown Report'
      })) as DataSource[];

      setDataSources(processedData);
    } catch (error) {
      console.error("Error loading data sources:", error);
      toast({
        title: "Error",
        description: "Failed to load data sources",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddNew = () => {
    if (reports.length === 0) {
      toast({
        title: "No Reports",
        description: "Please create a report first before adding data sources.",
        variant: "destructive",
      });
      return;
    }
    setShowDataSourceSelectionModal(true);
  };

  const handleSourceTypeSelected = (sourceType: 'google_sheets' | 'csv_url') => {
    setSelectedSourceType(sourceType);
    setShowDataSourceSelectionModal(false);
    
    // If only one report, auto-select it
    if (reports.length === 1) {
      setSelectedReportId(reports[0].id);
      setShowUnifiedDataSourceModal(true);
    } else if (reports.length > 1) {
      // Show report selection modal
      setShowReportSelectionModal(true);
    } else {
      toast({
        title: "No Reports",
        description: "Please create a report first before adding data sources.",
        variant: "destructive",
      });
    }
  };

  const handleReportSelected = (reportId: string) => {
    setSelectedReportId(reportId);
    setShowReportSelectionModal(false);
    setShowUnifiedDataSourceModal(true);
  };

  const handleCreateBookingReport = async () => {
    if (!accountId) {
      toast({
        title: "Error",
        description: "Account ID is required to create a report",
        variant: "destructive",
      });
      return;
    }

    if (!session?.user) {
      toast({
        title: "Error",
        description: "You must be signed in to create a report",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingBookingReport(true);
    try {
      // Check if Booking report already exists
      const existingReport = reports.find(r => r.name === "Booking");
      if (existingReport) {
        toast({
          title: "Report already exists",
          description: "A Booking report already exists. Please select it from the list.",
        });
        setSelectedReportId(existingReport.id);
        setShowReportSelectionModal(false);
        setShowUnifiedDataSourceModal(true);
        setIsCreatingBookingReport(false);
        return;
      }

      const { data, error } = await supabase
        .from('reports')
        .insert({
          name: "Booking",
          user_id: session.user.id,
          account_id: accountId
        })
        .select()
        .single();

      if (error) throw error;

      // Refresh reports list
      await loadReports();
      
      // Auto-select the newly created report
      setSelectedReportId(data.id);
      setShowReportSelectionModal(false);
      setShowUnifiedDataSourceModal(true);

      toast({
        title: "Report created",
        description: "Booking report created successfully",
      });
    } catch (error) {
      console.error("Error creating Booking report:", error);
      toast({
        title: "Error",
        description: "Failed to create Booking report",
        variant: "destructive",
      });
    } finally {
      setIsCreatingBookingReport(false);
    }
  };

  const handleCreatePriceCheckReport = async () => {
    if (!accountId) {
      toast({
        title: "Error",
        description: "Account ID is required to create a report",
        variant: "destructive",
      });
      return;
    }

    if (!session?.user) {
      toast({
        title: "Error",
        description: "You must be signed in to create a report",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingPriceCheckReport(true);
    try {
      // Check if Price Check report already exists
      const existingReport = reports.find(r => r.name === "Price Check");
      if (existingReport) {
        toast({
          title: "Report already exists",
          description: "A Price Check report already exists. Please select it from the list.",
        });
        setSelectedReportId(existingReport.id);
        setShowReportSelectionModal(false);
        setShowUnifiedDataSourceModal(true);
        setIsCreatingPriceCheckReport(false);
        return;
      }

      const { data, error } = await supabase
        .from('reports')
        .insert({
          name: "Price Check",
          user_id: session.user.id,
          account_id: accountId
        })
        .select()
        .single();

      if (error) throw error;

      // Refresh reports list
      await loadReports();
      
      // Auto-select the newly created report
      setSelectedReportId(data.id);
      setShowReportSelectionModal(false);
      setShowUnifiedDataSourceModal(true);

      toast({
        title: "Report created",
        description: "Price Check report created successfully",
      });
    } catch (error) {
      console.error("Error creating Price Check report:", error);
      toast({
        title: "Error",
        description: "Failed to create Price Check report",
        variant: "destructive",
      });
    } finally {
      setIsCreatingPriceCheckReport(false);
    }
  };

  const handleDataSourceCreated = () => {
    loadDataSources();
    setShowUnifiedDataSourceModal(false);
    setSelectedReportId(null);
  };

  const handleSync = async (dataSource: DataSource) => {
    setIsSyncing(dataSource.id);
    
    try {
      toast({
        title: "Syncing data...",
        description: `Starting sync for ${dataSource.name}`,
      });

      const result = await syncDataSource(dataSource);

      if (result.success) {
        toast({
          title: "Sync complete",
          description: `Successfully synced ${result.rowsProcessed.toLocaleString()} rows from ${dataSource.name}`,
        });

        await supabase
          .from('data_sources')
          .update({ last_synced_at: new Date().toISOString() })
          .eq('id', dataSource.id);

        await loadDataSources();
      } else {
        toast({
          title: "Sync failed",
          description: result.error || "Unknown error occurred",
          variant: "destructive",
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      toast({
        title: "Sync failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSyncing(null);
    }
  };

  const handleDelete = async () => {
    if (!deletingDataSource) return;

    try {
      const { error } = await supabase
        .from('data_sources')
        .delete()
        .eq('id', deletingDataSource.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Data source deleted successfully",
      });

      await loadDataSources();
      setDeleteConfirmOpen(false);
      setDeletingDataSource(null);
    } catch (error) {
      console.error("Error deleting data source:", error);
      toast({
        title: "Error",
        description: "Failed to delete data source",
        variant: "destructive",
      });
    }
  };

  const getSourceUrl = (dataSource: DataSource): string => {
    if (dataSource.source_type === 'csv_url' && dataSource.csv_url) {
      return dataSource.csv_url;
    }
    return dataSource.google_sheets_url || '';
  };

  const handleSaveName = async (dataSourceId: string) => {
    if (!editingNameValue.trim()) {
      toast({
        title: "Error",
        description: "Name cannot be empty",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('data_sources')
        .update({ name: editingNameValue.trim() })
        .eq('id', dataSourceId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Data source name updated successfully",
      });

      setEditingNameId(null);
      setEditingNameValue("");
      await loadDataSources();
    } catch (error) {
      console.error("Error updating data source name:", error);
      toast({
        title: "Error",
        description: "Failed to update data source name",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/20">
      <div className="container mx-auto px-6 py-8">
        <div className="mb-6 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/')}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Data Sources</h1>
            <p className="text-muted-foreground mt-1">
              Manage database sources for your account
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Data Sources</CardTitle>
                <CardDescription>
                  {dataSources.length} data source{dataSources.length !== 1 ? 's' : ''} found
                </CardDescription>
              </div>
              <Button onClick={handleAddNew} className="gap-2">
                <Plus className="h-4 w-4" />
                Add Data Source
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary mx-auto"></div>
                <p className="text-sm text-muted-foreground mt-2">Loading data sources...</p>
              </div>
            ) : dataSources.length === 0 ? (
              <div className="text-center py-12">
                <FileSpreadsheet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Data Sources</h3>
                <p className="text-muted-foreground mb-4">
                  Get started by adding your first data source
                </p>
                <Button onClick={handleAddNew} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Data Source
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Report</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Last Synced</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dataSources.map((dataSource) => {
                      const sourceUrl = getSourceUrl(dataSource);
                      const currency =
                        dataSource.currency ??
                        ((dataSource.report_name || '').toLowerCase() === 'metasearch' ? 'USD' : 'AUD');

                      return (
                        <TableRow key={dataSource.id}>
                          <TableCell className="font-medium">
                            {editingNameId === dataSource.id ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="text"
                                  value={editingNameValue}
                                  onChange={(e) => setEditingNameValue(e.target.value)}
                                  className="flex-1 px-2 py-1 border rounded-md text-sm"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      handleSaveName(dataSource.id);
                                    } else if (e.key === 'Escape') {
                                      setEditingNameId(null);
                                      setEditingNameValue("");
                                    }
                                  }}
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => handleSaveName(dataSource.id)}
                                >
                                  <Check className="h-4 w-4 text-green-600" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => {
                                    setEditingNameId(null);
                                    setEditingNameValue("");
                                  }}
                                >
                                  <X className="h-4 w-4 text-red-600" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 group">
                                <span>{dataSource.name}</span>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={() => {
                                    setEditingNameId(dataSource.id);
                                    setEditingNameValue(dataSource.name);
                                  }}
                                  title="Rename"
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>{dataSource.report_name || 'Unknown'}</TableCell>
                          <TableCell>{currency}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center px-2 py-1 rounded-md bg-primary/10 text-primary text-xs font-medium">
                              {dataSource.source_type === 'csv_url' ? 'CSV URL' : 'Google Sheets'}
                            </span>
                          </TableCell>
                          <TableCell className="max-w-xs">
                            {sourceUrl ? (
                              <a
                                href={sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline truncate block"
                                title={sourceUrl}
                              >
                                {sourceUrl}
                              </a>
                            ) : (
                              <span className="text-muted-foreground">N/A</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {dataSource.last_synced_at
                              ? new Date(dataSource.last_synced_at).toLocaleString()
                              : 'Never'}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => {
                                  setViewingDataSource(dataSource);
                                  setShowViewDataModal(true);
                                }}
                                title="View Data"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => {
                                  setEditingDataSource(dataSource);
                                  setShowEditMappingModal(true);
                                }}
                                title="Edit Mapping"
                              >
                                <Settings className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleSync(dataSource)}
                                disabled={isSyncing !== null}
                                title="Sync Data"
                              >
                                <RefreshCw className={`h-4 w-4 ${isSyncing === dataSource.id ? 'animate-spin' : ''}`} />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => {
                                  setDeletingDataSource(dataSource);
                                  setDeleteConfirmOpen(true);
                                }}
                                className="text-destructive hover:text-destructive"
                                title="Delete"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modals */}
      <DataSourceSelectionModal
        open={showDataSourceSelectionModal}
        onOpenChange={setShowDataSourceSelectionModal}
        onSelectGoogleSheets={() => handleSourceTypeSelected('google_sheets')}
        onSelectCSV={() => handleSourceTypeSelected('csv_url')}
        onSelectAPI={() => {}}
      />

      {selectedReportId && (
        <UnifiedDataSourceModal
          open={showUnifiedDataSourceModal}
          onOpenChange={(open) => {
            setShowUnifiedDataSourceModal(open);
            if (!open) setSelectedReportId(null);
          }}
          reportId={selectedReportId}
          sourceType={selectedSourceType}
          onSuccess={handleDataSourceCreated}
        />
      )}

      {viewingDataSource && (
        <ViewDataModal
          open={showViewDataModal}
          onOpenChange={(open) => {
            setShowViewDataModal(open);
            if (!open) setViewingDataSource(null);
          }}
          dataSource={viewingDataSource}
        />
      )}

      {editingDataSource && (
        <>
          <EditMappingModal
            open={showEditMappingModal}
            onOpenChange={(open) => {
              setShowEditMappingModal(open);
              if (!open) {
                setEditingDataSource(null);
                loadDataSources();
              }
            }}
            dataSource={editingDataSource}
            accountId={accountId}
            onSuccess={loadDataSources}
          />
        </>
      )}

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Data Source</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingDataSource?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Report Selection Modal */}
      <Dialog open={showReportSelectionModal} onOpenChange={setShowReportSelectionModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Report</DialogTitle>
            <DialogDescription>
              Choose a report to add the data source to
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="report">Report</Label>
              <Select onValueChange={handleReportSelected}>
                <SelectTrigger id="report">
                  <SelectValue placeholder="Select a report" />
                </SelectTrigger>
                <SelectContent>
                  {reports.map((report) => (
                    <SelectItem key={report.id} value={report.id}>
                      {report.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="pt-2 border-t space-y-2">
              <Button
                variant="outline"
                className="w-full"
                onClick={handleCreateBookingReport}
                disabled={isCreatingBookingReport}
              >
                {isCreatingBookingReport ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Creating Booking Report...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Booking Report
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={handleCreatePriceCheckReport}
                disabled={isCreatingPriceCheckReport}
              >
                {isCreatingPriceCheckReport ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Creating Price Check Report...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Price Check Report
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}