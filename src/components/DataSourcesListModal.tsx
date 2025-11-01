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
import { Database, Plus, Eye, Trash2, FileSpreadsheet, Edit, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { EditMappingModal } from "./EditMappingModal";
import { ViewDataModal } from "./ViewDataModal";

interface DataSource {
  id: string;
  name: string;
  google_sheets_url: string;
  spreadsheet_id: string;
  tab_name: string;
  header_row: number;
  column_mappings: any[] | null;
}

interface DataSourcesListModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: string;
  onAddNew: () => void;
  onDataSync?: () => void;
}

export const DataSourcesListModal = ({ 
  open, 
  onOpenChange, 
  reportId,
  onAddNew,
  onDataSync
}: DataSourcesListModalProps) => {
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
  const [editingDataSource, setEditingDataSource] = useState<DataSource | null>(null);
  const [viewingDataSource, setViewingDataSource] = useState<DataSource | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  useEffect(() => {
    if (open && reportId) {
      loadDataSources();
    }
  }, [open, reportId]);

  const loadDataSources = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('data_sources')
        .select('*')
        .eq('report_id', reportId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setDataSources((data || []) as DataSource[]);
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

  const handleDelete = async (dataSource: DataSource) => {
    try {
      const { error } = await supabase
        .from('data_sources')
        .delete()
        .eq('id', dataSource.id);

      if (error) throw error;

      setDataSources(dataSources.filter(ds => ds.id !== dataSource.id));
      
      toast({
        title: "Data source deleted",
        description: `Deleted "${dataSource.name}"`,
      });
    } catch (error) {
      console.error("Error deleting data source:", error);
      toast({
        title: "Error",
        description: "Failed to delete data source",
        variant: "destructive",
      });
    }
  };

  const handleView = (dataSource: DataSource) => {
    setViewingDataSource(dataSource);
    setIsViewModalOpen(true);
  };

  const handleEdit = (dataSource: DataSource) => {
    setEditingDataSource(dataSource);
    setIsEditModalOpen(true);
  };

  const handleEditSuccess = () => {
    loadDataSources();
  };

  const handleSync = async (dataSource: DataSource) => {
    setSyncingIds(prev => new Set(prev).add(dataSource.id));
    
    try {
      // First, fetch just the header to validate the sheet
      const { data: headerData, error: headerError } = await supabase.functions.invoke('fetch-google-sheets', {
        body: {
          spreadsheetId: dataSource.spreadsheet_id,
          tabName: dataSource.tab_name,
          range: `${dataSource.header_row}:${dataSource.header_row}`,
        },
      });

      if (headerError) throw headerError;
      if (!headerData?.values || headerData.values.length === 0) {
        throw new Error("Could not read sheet headers");
      }

      const sheetHeaders = headerData.values[0];

      // Now fetch all data rows (up to 300,000 rows)
      toast({
        title: "Syncing...",
        description: "Fetching data from Google Sheets...",
      });

      const { data: sheetsData, error: sheetsError } = await supabase.functions.invoke('fetch-google-sheets', {
        body: {
          spreadsheetId: dataSource.spreadsheet_id,
          tabName: dataSource.tab_name,
          range: `${dataSource.header_row + 1}:300000`,
        },
      });

      if (sheetsError) throw sheetsError;

      if (!sheetsData?.values || sheetsData.values.length === 0) {
        throw new Error("No data rows found in the sheet");
      }

      const dataRows = sheetsData.values;

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Delete ALL existing dimension_data for this source efficiently
      toast({
        title: "Syncing...",
        description: "Clearing old data...",
      });
      
      // Keep deleting until no more rows are found
      let totalDeleted = 0;
      let continueDeleting = true;
      
      while (continueDeleting) {
        // Delete in chunks of 5000 to avoid timeouts
        const { error: deleteError, count } = await supabase
          .from('dimension_data')
          .delete({ count: 'exact' })
          .eq('data_source_id', dataSource.id)
          .limit(5000);

        if (deleteError) {
          console.error('Delete error:', deleteError);
          throw new Error(`Failed to clear old data: ${deleteError.message}`);
        }
        
        // If count is returned and is less than limit, we're done
        if (count !== null && count !== undefined) {
          totalDeleted += count;
          if (count < 5000) {
            continueDeleting = false;
          }
        } else {
          // If count not available, do one more check
          const { data: checkData, error: checkError } = await supabase
            .from('dimension_data')
            .select('id', { count: 'exact', head: true })
            .eq('data_source_id', dataSource.id)
            .limit(1);
          
          if (checkError) throw checkError;
          continueDeleting = checkData && checkData.length > 0;
        }
      }

      // Build dimension ID map from current mappings
      const dimensionIdMap: Record<string, string> = {};
      const visibleMappings = (dataSource.column_mappings || []).filter((m: any) => m.visible);
      
      visibleMappings.forEach((mapping: any) => {
        if (mapping.dimensionId && mapping.dimensionId !== 'none') {
          dimensionIdMap[mapping.column] = mapping.dimensionId;
        }
      });

      // Helper function to parse values based on dimension type
      const parseValue = (value: any, dimensionType: string): any => {
        if (value === null || value === undefined || value === '') return null;
        
        // For numeric types, clean and parse the value
        if (dimensionType === 'number' || dimensionType === 'currency' || dimensionType === 'percentage') {
          const stringValue = String(value);
          // Remove currency symbols ($, €, £, etc.), commas, and spaces
          const cleanedValue = stringValue.replace(/[$€£¥,\s]/g, '');
          const numValue = parseFloat(cleanedValue);
          return isNaN(numValue) ? null : numValue;
        }
        
        // For other types, return as-is
        return value;
      };

      // Transform data
      const rowsToInsert = dataRows.map((row, index) => {
        const dimensionValues: Record<string, any> = {};
        
        visibleMappings.forEach((mapping: any) => {
          // Try exact match first, then normalized match (trim and case-insensitive)
          let colIndex = sheetHeaders.indexOf(mapping.column);
          if (colIndex === -1) {
            const normalizedMappingCol = mapping.column.trim().toLowerCase();
            colIndex = sheetHeaders.findIndex((header: string) => 
              header.trim().toLowerCase() === normalizedMappingCol
            );
          }
          
          if (colIndex !== -1 && dimensionIdMap[mapping.column]) {
            const rawValue = row[colIndex];
            const dimensionType = mapping.newDimensionType || mapping.dimensionType || 'text';
            const value = parseValue(rawValue, dimensionType);
            dimensionValues[dimensionIdMap[mapping.column]] = value;
          }
        });
        
        return {
          report_id: reportId,
          data_source_id: dataSource.id,
          row_number: index + 1,
          dimension_values: dimensionValues,
        };
      });

      // Insert in smaller batches with progress updates
      const batchSize = 1000;
      const totalBatches = Math.ceil(rowsToInsert.length / batchSize);
      
      for (let i = 0; i < rowsToInsert.length; i += batchSize) {
        const batch = rowsToInsert.slice(i, i + batchSize);
        const currentBatch = Math.floor(i / batchSize) + 1;
        
        toast({
          title: "Syncing...",
          description: `Processing batch ${currentBatch}/${totalBatches} (${Math.round((i / rowsToInsert.length) * 100)}%)`,
        });
        
        const { error: insertError } = await supabase
          .from('dimension_data')
          .insert(batch);

        if (insertError) {
          console.error(`Error inserting batch ${currentBatch}:`, insertError);
          throw new Error(`Failed at batch ${currentBatch}/${totalBatches}: ${insertError.message}`);
        }
      }

      toast({
        title: "Data synced successfully",
        description: `Synced ${dataRows.length.toLocaleString()} rows from ${dataSource.name}`,
      });
      
      // Close modal and trigger refresh
      onOpenChange(false);
      if (onDataSync) {
        onDataSync();
      }
    } catch (error) {
      console.error("Error syncing data:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to sync data";
      toast({
        title: "Sync failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setSyncingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(dataSource.id);
        return newSet;
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            Data sources
          </DialogTitle>
          <DialogDescription>
            Manage your connected data sources
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading data sources...
            </div>
          ) : dataSources.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No data sources connected yet
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Connector Type</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dataSources.map((dataSource) => (
                    <TableRow key={dataSource.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileSpreadsheet className="h-4 w-4 text-green-600" />
                          {dataSource.name}
                        </div>
                      </TableCell>
                      <TableCell>Google Sheets</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleView(dataSource)}
                            disabled={syncingIds.has(dataSource.id)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleSync(dataSource)}
                            disabled={syncingIds.has(dataSource.id)}
                          >
                            <RefreshCw className={`h-4 w-4 mr-1 ${syncingIds.has(dataSource.id) ? 'animate-spin' : ''}`} />
                            Sync
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(dataSource)}
                            disabled={syncingIds.has(dataSource.id)}
                          >
                            <Edit className="h-4 w-4 mr-1" />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(dataSource)}
                            disabled={syncingIds.has(dataSource.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Delete
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

        <div className="flex justify-start border-t pt-4">
          <Button 
            variant="outline" 
            className="gap-2 text-primary"
            onClick={onAddNew}
          >
            <Plus className="h-4 w-4" />
            ADD A DATA SOURCE
          </Button>
        </div>
      </DialogContent>

      <EditMappingModal
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        dataSource={editingDataSource}
        onSuccess={handleEditSuccess}
      />

      <ViewDataModal
        open={isViewModalOpen}
        onOpenChange={setIsViewModalOpen}
        dataSource={viewingDataSource}
      />
    </Dialog>
  );
};
