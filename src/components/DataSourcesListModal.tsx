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
import { EditDataSourceModal } from "./EditDataSourceModal";
import { 
  syncDataSource, 
  fetchGoogleSheetsData,
  parseValue,
  parseDate,
  insertDataInBatches,
  detectNewColumns,
  type DataSource as SyncDataSource,
  type SyncOptions 
} from "@/lib/sync-utils";
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
  accountId?: string;
}

export const DataSourcesListModal = ({
  open,
  onOpenChange,
  reportId,
  onAddNew,
  onDataSync,
  accountId
}: DataSourcesListModalProps) => {
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [syncingIds, setSyncingIds] = useState<Set<string>>(new Set());
    const [editingDataSource, setEditingDataSource] = useState<DataSource | null>(null);
    const [viewingDataSource, setViewingDataSource] = useState<DataSource | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isEditDataSourceModalOpen, setIsEditDataSourceModalOpen] = useState(false);
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
      setIsEditModalOpen(true); // Edit button opens mapping modal
    };

    const handleEditDataSource = (dataSource: DataSource) => {
      setEditingDataSource(dataSource);
      setIsEditDataSourceModalOpen(true); // Sync button opens edit data source modal
    };

    const handleEditSuccess = () => {
      loadDataSources();
      setIsEditDataSourceModalOpen(false);
    };

    const handleSync = async (dataSource: DataSource) => {
      setSyncingIds(prev => new Set(prev).add(dataSource.id));
      
      try {
        console.log(`[REFRESH] Starting refresh for data source: ${dataSource.name}`);
        
        // Validate required fields
        if (!dataSource.spreadsheet_id || dataSource.spreadsheet_id.trim() === '') {
          throw new Error('Spreadsheet ID is missing');
        }
        
        if (!dataSource.header_row || dataSource.header_row < 1) {
          throw new Error('Header row must be at least 1');
        }
        
        // First, fetch just the header to validate the sheet
        // Use A1 notation: A{row}:Z{row} for header row (Z is column 26, should be enough for headers)
        // If more columns needed, we can expand later
        const headerRange = `A${dataSource.header_row}:Z${dataSource.header_row}`;
        const { data: headerData, error: headerError } = await supabase.functions.invoke('fetch-google-sheets', {
          body: {
            spreadsheetId: dataSource.spreadsheet_id.trim(),
            tabName: dataSource.tab_name?.trim() || undefined, // Use undefined if empty/null
            range: headerRange,
          },
        });

      if (headerError) {
        console.error('[REFRESH] Header fetch error:', headerError);
        console.error('[REFRESH] Error details:', {
          spreadsheetId: dataSource.spreadsheet_id,
          tabName: dataSource.tab_name,
          headerRow: dataSource.header_row,
          headerRange
        });
        throw new Error(headerError.message || `Failed to fetch sheet headers: ${headerError}`);
      }
      if (!headerData?.values || headerData.values.length === 0) {
        throw new Error("Could not read sheet headers");
      }

        let sheetHeaders = headerData.values[0];
        console.log(`[REFRESH] Found ${sheetHeaders.length} columns in sheet:`, sheetHeaders);
        
        // Normalize headers - convert to strings and handle empty values
        // Keep original length for index matching with data rows
        sheetHeaders = sheetHeaders.map((header: any) => 
          header === null || header === undefined ? '' : String(header).trim()
        );

        // Detect new columns and update column_mappings using utility
        const { newColumns, updatedMappings } = await detectNewColumns(sheetHeaders, dataSource);
        
        // Update local dataSource object if new columns were found
        if (newColumns.length > 0) {
          dataSource.column_mappings = updatedMappings;
        }

        // Fetch all data rows - no limit, fetch all available data
        // Use A1 notation: A{startRow}:Z for data rows (Google Sheets API supports up to 10 million rows)
        const startRow = dataSource.header_row + 1;
        const dataRange = `A${startRow}:Z`;
        
        toast({
          title: "Syncing...",
          description: "Fetching data from Google Sheets...",
        });

        const { data: sheetsData, error: sheetsError } = await supabase.functions.invoke('fetch-google-sheets', {
          body: {
            spreadsheetId: dataSource.spreadsheet_id.trim(),
            tabName: dataSource.tab_name?.trim() || undefined, // Use undefined if empty/null
            range: dataRange,
          },
        });

      if (sheetsError) {
        console.error('[REFRESH] Data fetch error:', sheetsError);
        throw new Error(sheetsError.message || 'Failed to fetch sheet data');
      }

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

        // Build dimension ID map from current mappings and validate against sheet headers
        // Use a map that tracks both original column name and current sheet header index
        const dimensionIdMap: Record<string, string> = {}; // Maps original column name -> dimension ID
        const columnIndexMap: Record<string, number> = {}; // Maps original column name -> current sheet index
        const visibleMappings = (dataSource.column_mappings || []).filter((m: any) => m.visible);
        
        console.log(`[REFRESH] Processing ${visibleMappings.length} visible mappings`);
        console.log(`[REFRESH] Sheet headers (${sheetHeaders.length}):`, sheetHeaders);
        
        // Create a normalized header map for fast lookup (case-insensitive, trimmed)
        const normalizedHeaderMap = new Map<string, number>();
        sheetHeaders.forEach((header: string, index: number) => {
          if (header && header.trim()) {
            const normalized = header.trim().toLowerCase();
            // If multiple headers have the same normalized name, keep the first one
            if (!normalizedHeaderMap.has(normalized)) {
              normalizedHeaderMap.set(normalized, index);
            }
          }
        });
        
        visibleMappings.forEach((mapping: any) => {
          if (mapping.dimensionId && mapping.dimensionId !== 'none') {
            // Find column by name (exact match first, then normalized match)
            let colIndex = -1;
            
            // Try exact match first
            colIndex = sheetHeaders.indexOf(mapping.column);
            
            // If not found, try normalized match
            if (colIndex === -1) {
              const normalizedMappingCol = mapping.column.trim().toLowerCase();
              colIndex = normalizedHeaderMap.get(normalizedMappingCol) ?? -1;
            }
            
            if (colIndex !== -1) {
              dimensionIdMap[mapping.column] = mapping.dimensionId;
              columnIndexMap[mapping.column] = colIndex;
              console.log(`[REFRESH] Mapped "${mapping.column}" (index ${colIndex}) -> dimension ${mapping.dimensionId}`);
            } else {
              console.warn(`[REFRESH] Column "${mapping.column}" not found in sheet headers - will be skipped`);
            }
          }
        });
        
        console.log(`[REFRESH] Successfully mapped ${Object.keys(dimensionIdMap).length} columns`);

              // Use parseDate and parseValue from sync-utils (remove duplicate implementations)

        // Transform data with detailed logging for first row
        // Handle rows that might have different lengths than headers (columns added/removed/reordered)
        const rowsToInsert = dataRows.map((row, index) => {
          const dimensionValues: Record<string, any> = {};
          
          // Safety check: ensure row is an array
          if (!Array.isArray(row)) {
            console.warn(`[REFRESH] Row ${index + 1} is not an array, skipping`);
            return null;
          }
          
          visibleMappings.forEach((mapping: any) => {
            // Use the pre-computed column index map for efficient lookup
            const colIndex = columnIndexMap[mapping.column];
            
            // Only process if column exists in sheet and is mapped
            if (colIndex !== undefined && colIndex >= 0 && dimensionIdMap[mapping.column]) {
              // Handle rows that might be shorter than headers (some columns might be missing)
              // or longer (extra data that we'll ignore)
              // Check if row has enough columns for this index
              if (colIndex < row.length) {
                const rawValue = row[colIndex];
                
                // Process value (even if it's empty string, null, etc.)
                const dimensionType = mapping.newDimensionType || mapping.dimensionType || 'text';
                const dateFormat = mapping.dateFormat;
                const value = parseValue(rawValue, dimensionType, dateFormat);
                
                // Only add if value is not null (null values are optional)
                if (value !== null) {
                  dimensionValues[dimensionIdMap[mapping.column]] = value;
                }
                
                // Log first row values for debugging
                if (index === 0) {
                  console.log(`[REFRESH] Row 1 - ${mapping.column} (col ${colIndex}): "${rawValue}" -> ${value} (${dimensionType})`);
                }
              } else if (index === 0) {
                // Log missing columns in first row for debugging
                console.warn(`[REFRESH] Row 1 - Column "${mapping.column}" (expected at index ${colIndex}) not found in row data (row has ${row.length} columns, headers have ${sheetHeaders.length})`);
              }
            }
          });
          
          return {
            report_id: reportId,
            data_source_id: dataSource.id,
            row_number: index + 1,
            dimension_values: dimensionValues,
          };
        }).filter((row): row is NonNullable<typeof row> => row !== null); // Remove any null rows from invalid data

      console.log(`[REFRESH] Prepared ${rowsToInsert.length} rows for insertion`);
      
      // Insert in smaller batches with progress updates
        // Insert data using utility function
        await insertDataInBatches(rowsToInsert, (message) => {
          toast({
            title: "Syncing...",
            description: message,
          });
        });
      
      console.log(`[REFRESH] Successfully imported all ${rowsToInsert.length} rows`);

        const successMessage = newColumns.length > 0
          ? `Successfully imported ${dataRows.length.toLocaleString()} rows. ${newColumns.length} new column(s) detected and added to mappings.`
          : `Successfully imported ${dataRows.length.toLocaleString()} rows with ${Object.keys(dimensionIdMap).length} dimensions`;
        
        toast({
          title: "Refresh complete",
          description: successMessage,
        });
      
        console.log(`[REFRESH] Refresh completed for "${dataSource.name}"`);
        
        // Reload data sources to show updated column mappings
        await loadDataSources();
        
        // Close modal and trigger refresh
        onOpenChange(false);
        if (onDataSync) {
          onDataSync();
        }
    } catch (error) {
      console.error("[REFRESH] Error syncing data source:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to refresh data";
      toast({
        title: "Refresh failed",
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
                      <TableCell>
                        <a
                          href={dataSource.google_sheets_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline cursor-pointer"
                        >
                          Google Sheets
                        </a>
                      </TableCell>
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
                              onClick={() => handleEditDataSource(dataSource)}
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

        <EditDataSourceModal
          open={isEditDataSourceModalOpen}
          onOpenChange={setIsEditDataSourceModalOpen}
          dataSource={editingDataSource}
          onSuccess={handleEditSuccess}
          accountId={accountId}
        />

        <EditMappingModal
          open={isEditModalOpen}
          onOpenChange={setIsEditModalOpen}
          dataSource={editingDataSource}
          onSuccess={handleEditSuccess}
          accountId={accountId}
        />

        <ViewDataModal
          open={isViewModalOpen}
          onOpenChange={setIsViewModalOpen}
          dataSource={viewingDataSource}
        />
      </Dialog>
    );
  };
