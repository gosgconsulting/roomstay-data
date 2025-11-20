import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useState, useEffect } from "react";
import { FileSpreadsheet, RefreshCw, Pencil, Eye, Trash2, Plus } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { EditMappingModal } from "./EditMappingModal";
import { ViewDataModal } from "./ViewDataModal";
import { DataSourceSelectionModal } from "./DataSourceSelectionModal";
import { UnifiedDataSourceModal } from "./UnifiedDataSourceModal";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "./ui/alert-dialog";
import { syncDataSource } from "@/lib/sync-utils";
import { SyncModeModal } from "./SyncModeModal";

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
  last_synced_at?: string | null;
}

interface DataSourcesListModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: string;
  accountId?: string;
  onAddNew: () => void;
  onDataSync?: () => void;
  onRefreshData?: () => void;
}

export const DataSourcesListModal = ({
  open,
  onOpenChange,
  reportId,
  accountId,
  onAddNew,
  onDataSync,
  onRefreshData
}: DataSourcesListModalProps) => {
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState<string | null>(null);
  const [editingDataSource, setEditingDataSource] = useState<DataSource | null>(null);
  const [viewingDataSource, setViewingDataSource] = useState<DataSource | null>(null);
  const [showEditMappingModal, setShowEditMappingModal] = useState(false);
  const [showViewDataModal, setShowViewDataModal] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletingDataSource, setDeletingDataSource] = useState<DataSource | null>(null);

  // Unified modal states
  const [showDataSourceSelectionModal, setShowDataSourceSelectionModal] = useState(false);
  const [showUnifiedDataSourceModal, setShowUnifiedDataSourceModal] = useState(false);
  const [selectedSourceType, setSelectedSourceType] = useState<'google_sheets' | 'csv_url'>('google_sheets');

  // NEW: Sync modal state
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [syncTarget, setSyncTarget] = useState<DataSource | null>(null);
  const [syncTotalRows, setSyncTotalRows] = useState<number>(0);

  useEffect(() => {
    if (open && reportId) {
      loadDataSources();
    }
  }, [open, reportId]);

  const loadDataSources = async () => {
    if (!reportId) return;
    
    setIsLoading(true);
    
    try {
      const { data, error } = await supabase
        .from('data_sources')
        .select('*')
        .eq('report_id', reportId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Ensure column_mappings is always an array
      const processedData = (data || []).map(ds => ({
        ...ds,
        column_mappings: Array.isArray(ds.column_mappings) ? ds.column_mappings : []
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

  // NEW: Open sync modal and load stats
  const openSyncModal = async (dataSource: DataSource) => {
    setSyncTarget(dataSource);
    setSyncModalOpen(true);

    // Fetch total rows for display
    try {
      const { count, error } = await supabase
        .from('dimension_data')
        .select('id', { count: 'exact', head: true })
        .eq('data_source_id', dataSource.id);

      if (!error && typeof count === 'number') {
        setSyncTotalRows(count);
      } else {
        setSyncTotalRows(0);
      }
    } catch {
      setSyncTotalRows(0);
    }
  };

  // NEW: Handle modal sync with schedule + mode
  const handleModalSync = async (
    mode: 'incremental' | 'full',
    schedule: { enabled: boolean; frequency: 'manual' | 'daily' | 'weekly' | 'monthly'; time?: string | null; timezone?: string | null }
  ) => {
    if (!syncTarget) return;

    setIsSyncing(syncTarget.id);

    try {
      // Save auto-sync schedule to data source
      const { error: scheduleError } = await supabase
        .from('data_sources')
        .update({
          sync_frequency: schedule.enabled ? schedule.frequency : 'manual',
          sync_time: schedule.enabled ? (schedule.time || null) : null,
          sync_timezone: schedule.enabled ? (schedule.timezone || null) : null,
        })
        .eq('id', syncTarget.id);

      if (scheduleError) {
        toast({
          title: "Schedule update warning",
          description: "Could not update auto sync schedule. Proceeding to sync.",
          variant: "destructive",
        });
      }

      // Inform user
      toast({
        title: "Syncing data...",
        description: `Starting ${mode === 'incremental' ? 'incremental' : 'full'} sync for ${syncTarget.name}`,
      });

      // Run sync according to mode
      const result = await syncDataSource(syncTarget, {
        deleteExistingData: mode === 'full',
        recreateDimensions: mode === 'full',
        showProgress: true,
      });

      if (result.success) {
        toast({
          title: "Sync complete",
          description: `Successfully synced ${result.rowsProcessed.toLocaleString()} rows from ${syncTarget.name}`,
        });

        // Update last_synced_at
        await supabase
          .from('data_sources')
          .update({ last_synced_at: new Date().toISOString() })
          .eq('id', syncTarget.id);

        // Refresh list and parent
        await loadDataSources();
        if (onDataSync) onDataSync();
        if (onRefreshData) setTimeout(() => onRefreshData(), 500);

        // Close modal
        setSyncModalOpen(false);
        setSyncTarget(null);
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
        
        // Update last_synced_at timestamp
        await supabase
          .from('data_sources')
          .update({ 
            last_synced_at: new Date().toISOString()
          })
          .eq('id', dataSource.id);
        
        // Refresh the list
        await loadDataSources();
        
        // Notify parent components
        if (onDataSync) {
          onDataSync();
        }
        
        // Also trigger component refresh
        if (onRefreshData) {
          // Use a delay to ensure data is fully committed and indexed
          setTimeout(() => {
            onRefreshData();
          }, 500);
        }
      } else {
        toast({
          title: "Sync failed",
          description: result.error || "Unknown error occurred",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error syncing data source:", error);
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
      // First delete all dimension_data for this data source
      const { error: deleteDataError } = await supabase
        .from('dimension_data')
        .delete()
        .eq('data_source_id', deletingDataSource.id);

      if (deleteDataError) throw deleteDataError;

      // Then delete the data source itself
      const { error: deleteSourceError } = await supabase
        .from('data_sources')
        .delete()
        .eq('id', deletingDataSource.id);

      if (deleteSourceError) throw deleteSourceError;

      toast({
        title: "Data source deleted",
        description: `Successfully deleted ${deletingDataSource.name} and all its data`,
      });
      
      // Refresh the list
      await loadDataSources();
      
      // Notify parent components
      if (onDataSync) {
        onDataSync();
      }
      
      // Also trigger component refresh
      if (onRefreshData) {
        // Use a delay to ensure data is fully committed and indexed
        setTimeout(() => {
          onRefreshData();
        }, 500);
      }
    } catch (error) {
      console.error("Error deleting data source:", error);
      toast({
        title: "Error",
        description: "Failed to delete data source",
        variant: "destructive",
      });
    } finally {
      setDeleteConfirmOpen(false);
      setDeletingDataSource(null);
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return "Never";
    
    try {
      const date = new Date(dateString);
      return date.toLocaleString();
    } catch (e) {
      return "Invalid date";
    }
  };

  const getSourceTypeLabel = (dataSource: DataSource) => {
    if (dataSource.source_type === 'csv_url') {
      return 'CSV URL';
    }
    return 'Google Sheets';
  };

  const handleSourceTypeSelect = (sourceType: 'google_sheets' | 'csv_url') => {
    setSelectedSourceType(sourceType);
    setShowDataSourceSelectionModal(false);
    setShowUnifiedDataSourceModal(true);
  };

  const handleDataSourceSuccess = () => {
    setShowUnifiedDataSourceModal(false);
    loadDataSources(); // Refresh the data sources list
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[900px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              Data Sources
            </DialogTitle>
            <DialogDescription>
              Manage data sources for this report
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading data sources...
              </div>
            ) : dataSources.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No data sources found. Add a data source to get started.
              </div>
            ) : (
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Last Synced</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dataSources.map((dataSource) => (
                      <TableRow key={dataSource.id}>
                        <TableCell className="font-medium">{dataSource.name}</TableCell>
                        <TableCell>{getSourceTypeLabel(dataSource)}</TableCell>
                        <TableCell>{formatDate(dataSource.last_synced_at)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
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
                              title="Edit Mappings"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => openSyncModal(dataSource)}
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
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button onClick={() => setShowDataSourceSelectionModal(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Data Source
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Data Source Selection Modal */}
      <DataSourceSelectionModal
        open={showDataSourceSelectionModal}
        onOpenChange={setShowDataSourceSelectionModal}
        onSelectGoogleSheets={() => handleSourceTypeSelect('google_sheets')}
        onSelectCSV={() => handleSourceTypeSelect('csv_url')}
        onSelectAPI={() => {
          toast({
            title: "Coming soon",
            description: "API data source integration is on the roadmap.",
          });
        }}
      />

      {/* Unified Data Source Modal */}
      <UnifiedDataSourceModal
        open={showUnifiedDataSourceModal}
        onOpenChange={setShowUnifiedDataSourceModal}
        reportId={reportId}
        sourceType={selectedSourceType}
        onSuccess={handleDataSourceSuccess}
      />

      {/* Edit Mapping Modal */}
      <EditMappingModal
        open={showEditMappingModal}
        onOpenChange={setShowEditMappingModal}
        dataSource={editingDataSource}
        onSuccess={() => {
          loadDataSources();
          if (onDataSync) onDataSync();
        }}
        accountId={accountId}
      />

      {/* View Data Modal */}
      <ViewDataModal
        open={showViewDataModal}
        onOpenChange={setShowViewDataModal}
        dataSource={viewingDataSource}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the data source "{deletingDataSource?.name}" and all its data.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* NEW: Sync Mode Modal */}
      <SyncModeModal
        open={syncModalOpen}
        onOpenChange={(o) => setSyncModalOpen(o)}
        onSync={handleModalSync}
        isLoading={isSyncing !== null}
        lastSyncTime={syncTarget?.last_synced_at ?? null}
        totalRows={syncTotalRows}
      />
    </>
  );
};