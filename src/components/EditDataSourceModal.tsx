import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState, useEffect, useCallback } from "react";
import { FileSpreadsheet, ChevronLeft, RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ColumnMappingStep } from "./ColumnMappingStep";
import { 
  syncDataSource, 
  extractSpreadsheetId, 
  fetchGoogleSheetsData,
  type DataSource as SyncDataSource,
  type SyncOptions 
} from "@/lib/sync-utils";

interface DataSource {
  id: string;
  name: string;
  google_sheets_url: string;
  spreadsheet_id: string;
  tab_name: string;
  header_row: number;
  column_mappings: any[] | null;
  report_id?: string;
}

interface EditDataSourceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataSource: DataSource | null;
  onSuccess: () => void;
  accountId?: string;
}

export const EditDataSourceModal = ({
  open,
  onOpenChange,
  dataSource,
  onSuccess,
  accountId
}: EditDataSourceModalProps) => {
  const [step, setStep] = useState(1);
  const [dataName, setDataName] = useState("");
  const [url, setUrl] = useState("");
  const [availableTabs, setAvailableTabs] = useState<string[]>([]);
  const [selectedTab, setSelectedTab] = useState("");
  const [headerRow, setHeaderRow] = useState("1");
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleDataRows, setSampleDataRows] = useState<any[][]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isResyncing, setIsResyncing] = useState(false);
  const [syncedRowsCount, setSyncedRowsCount] = useState<number | null>(null);
  const [syncedColumnsCount, setSyncedColumnsCount] = useState<number | null>(null);

  // Fetch sync statistics
  const fetchSyncStatistics = useCallback(async () => {
    if (!dataSource) return;

    try {
      // Get row count from dimension_data
      const { count: rowsCount, error: rowsError } = await supabase
        .from('dimension_data')
        .select('*', { count: 'exact', head: true })
        .eq('data_source_id', dataSource.id);

      if (rowsError) throw rowsError;
      setSyncedRowsCount(rowsCount || 0);

      // Get column count from column_mappings (visible columns)
      const columnMappings = dataSource.column_mappings || [];
      const visibleColumns = columnMappings.filter((m: any) => m.visible !== false);
      setSyncedColumnsCount(visibleColumns.length);
    } catch (error) {
      console.error("Error fetching sync statistics:", error);
      setSyncedRowsCount(null);
      setSyncedColumnsCount(null);
    }
  }, [dataSource]);

  // Initialize form with existing data source values
  useEffect(() => {
    if (open && dataSource) {
      setDataName(dataSource.name || "");
      setUrl(dataSource.google_sheets_url || "");
      setSelectedTab(dataSource.tab_name || "");
      setHeaderRow(String(dataSource.header_row || 1));
      setStep(1);
      setHeaders([]);
      setAvailableTabs([]);
      fetchSyncStatistics();
    }
  }, [open, dataSource, fetchSyncStatistics]);

  // Remove duplicate extractSpreadsheetId - now imported from sync-utils

  const handleNext = async () => {
    if (!dataName || !url) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    const spreadsheetId = extractSpreadsheetId(url);
    if (!spreadsheetId) {
      toast({
        title: "Invalid URL",
        description: "Please provide a valid Google Sheets URL",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('fetch-google-sheets', {
        body: {
          spreadsheetId,
          action: 'metadata',
        },
      });

      if (error) throw error;

      if (data?.sheets && data.sheets.length > 0) {
        const tabs = data.sheets.map((sheet: any) => sheet.title);
        setAvailableTabs(tabs);
        
        // If tab name exists in available tabs, select it; otherwise select first
        if (selectedTab && tabs.includes(selectedTab)) {
          setSelectedTab(selectedTab);
        } else {
          setSelectedTab(tabs[0]);
        }
        
        setStep(2);
      } else {
        throw new Error("No sheets found in the spreadsheet");
      }
    } catch (error) {
      console.error("Error fetching spreadsheet metadata:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to fetch spreadsheet information";
      toast({
        title: "Connection failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadHeaders = async () => {
    if (!selectedTab) {
      toast({
        title: "Missing tab",
        description: "Please select a tab",
        variant: "destructive",
      });
      return;
    }

    const spreadsheetId = extractSpreadsheetId(url);
    if (!spreadsheetId) return;

    setIsLoading(true);
    
    try {
      // Use A1 notation for header row
      // Fetch header row + sample data rows (up to 100 rows for samples)
      const headerRowNum = parseInt(headerRow) || 1;
      const sampleRange = `${headerRowNum}:${headerRowNum + 100}`;
      
      const { data: sheetsData, error: sheetsError } = await supabase.functions.invoke('fetch-google-sheets', {
        body: {
          spreadsheetId,
          tabName: selectedTab,
          range: sampleRange,
        },
      });

      if (sheetsError) throw sheetsError;

      if (!sheetsData?.values || sheetsData.values.length === 0) {
        throw new Error("No data found in the specified range");
      }

      const fetchedHeaders = sheetsData.values[0] || [];
      // Normalize headers
      const normalizedHeaders = fetchedHeaders.map((h: any) => 
        h === null || h === undefined ? '' : String(h).trim()
      );
      const sampleRows = sheetsData.values.slice(1, 6); // Get first 5 data rows as samples
      
      setHeaders(normalizedHeaders);
      setSampleDataRows(sampleRows);
      setStep(3); // Move to mapping step
    } catch (error) {
      console.error("Error fetching sheet data:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to fetch sheet data";
      toast({
        title: "Fetch failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setStep(1);
    if (dataSource) {
      setDataName(dataSource.name || "");
      setUrl(dataSource.google_sheets_url || "");
      setSelectedTab(dataSource.tab_name || "");
        setHeaderRow(String(dataSource.header_row || 1));
      }
      setAvailableTabs([]);
    setHeaders([]);
    setSampleDataRows([]);
  };

  const handleBack = () => {
    if (step === 3) {
      setStep(2);
      setHeaders([]);
    } else {
      setStep(1);
      setAvailableTabs([]);
    }
  };

  const handleSaveMappings = async (mappings: any[]) => {
    if (!dataSource) return;

    const spreadsheetId = extractSpreadsheetId(url);
    if (!spreadsheetId) return;

    setIsLoading(true);
    
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Update data source metadata
      const { error: updateError } = await supabase
        .from('data_sources')
        .update({
          name: dataName,
          google_sheets_url: url,
          spreadsheet_id: spreadsheetId,
          tab_name: selectedTab,
          header_row: parseInt(headerRow),
          column_mappings: mappings,
        })
        .eq('id', dataSource.id);

      if (updateError) throw updateError;

      toast({
        title: "Data source updated",
        description: `Successfully updated ${dataName}`,
      });
      
      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Error updating data source:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to update data source";
      toast({
        title: "Update failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResync = async () => {
    if (!dataSource) return;

    setIsResyncing(true);
    
    try {
      const spreadsheetId = extractSpreadsheetId(url);
      if (!spreadsheetId) {
        throw new Error("Invalid Google Sheets URL");
      }

      // First update the data source with current form values
      const { error: updateError } = await supabase
        .from('data_sources')
        .update({
          name: dataName,
          google_sheets_url: url,
          spreadsheet_id: spreadsheetId,
          tab_name: selectedTab,
          header_row: parseInt(headerRow),
        })
        .eq('id', dataSource.id);

      if (updateError) throw updateError;

      // Convert to sync-utils format with updated values
      const syncDataSourceObj: SyncDataSource = {
        id: dataSource.id,
        name: dataName,
        google_sheets_url: url,
        spreadsheet_id: spreadsheetId,
        tab_name: selectedTab,
        header_row: parseInt(headerRow),
        column_mappings: dataSource.column_mappings,
        report_id: dataSource.report_id,
      };

      const options: SyncOptions = {
        deleteExistingData: true,
        recreateDimensions: true,
        showProgress: true,
        onProgress: (message) => {
          console.log(`[RESYNC] ${message}`);
        }
      };

      const result = await syncDataSource(syncDataSourceObj, options);

      if (result.success) {
        toast({
          title: "Resync complete",
          description: `Successfully resynced ${result.rowsProcessed.toLocaleString()} rows and recreated ${result.dimensionsCreated} dimensions from scratch`,
        });
        
        // Refresh sync statistics
        await fetchSyncStatistics();
        
        onSuccess();
      } else {
        throw new Error(result.error || "Sync failed - check console for details");
      }
    } catch (error) {
      console.error("Error resyncing data source:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to resync data";
      toast({
        title: "Resync failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsResyncing(false);
    }
  };

  const reportId = dataSource?.report_id || '';

  return (
    <Dialog open={open} onOpenChange={(open) => {
      onOpenChange(open);
      if (!open) resetForm();
    }}>
      <DialogContent className="sm:max-w-[900px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {(step === 2 || step === 3) && (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 -ml-2"
                onClick={handleBack}
                disabled={isLoading || isResyncing}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Edit Google Sheets Data Source
          </DialogTitle>
          <DialogDescription>
            {step === 1 
              ? "Update your Google Sheets URL, name, and other settings"
              : step === 2
              ? "Select the tab and specify the header row"
              : "Map your columns to dimensions"
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {step === 1 ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="dataName">Data Name *</Label>
                <Input
                  id="dataName"
                  placeholder="e.g., Hotel Performance Data"
                  value={dataName}
                  onChange={(e) => setDataName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="url">Google Sheets URL *</Label>
                <Input
                  id="url"
                  placeholder="https://docs.google.com/spreadsheets/d/..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>

                {dataSource && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        onClick={handleResync}
                        disabled={isResyncing || isLoading}
                        className="gap-2"
                      >
                        <RefreshCw className={`h-4 w-4 ${isResyncing ? 'animate-spin' : ''}`} />
                        {isResyncing ? 'Resyncing from scratch...' : 'Resync from Scratch'}
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Completely replaces all data and recreates dimensions from current mappings
                      </span>
                    </div>
                    {(syncedRowsCount !== null || syncedColumnsCount !== null) && (
                      <div className="flex items-center gap-4 text-sm text-muted-foreground border-t pt-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">Synced:</span>
                          {syncedRowsCount !== null && (
                            <span>{syncedRowsCount.toLocaleString()} rows</span>
                          )}
                          {syncedRowsCount !== null && syncedColumnsCount !== null && (
                            <span className="mx-1">•</span>
                          )}
                          {syncedColumnsCount !== null && (
                            <span>{syncedColumnsCount} columns</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
            </>
          ) : step === 2 ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="tabName">Select Tab *</Label>
                <Select value={selectedTab} onValueChange={setSelectedTab}>
                  <SelectTrigger id="tabName" className="bg-background">
                    <SelectValue placeholder="Select a tab" />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    {availableTabs.map((tab) => (
                      <SelectItem key={tab} value={tab}>
                        {tab}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="headerRow">Header Row Number</Label>
                <Input
                  id="headerRow"
                  type="number"
                  min="1"
                  value={headerRow}
                  onChange={(e) => setHeaderRow(e.target.value)}
                />
              </div>
            </>
          ) : (
            <ColumnMappingStep
              headers={headers}
              sampleDataRows={sampleDataRows}
              onSave={handleSaveMappings}
              onBack={handleBack}
              isLoading={isLoading}
              accountId={accountId}
              reportId={reportId}
              existingMappings={dataSource?.column_mappings || []}
            />
          )}
        </div>

        {step !== 3 && (
          <div className="flex justify-end gap-3">
            <Button 
              variant="outline" 
              onClick={() => {
                onOpenChange(false);
                resetForm();
              }} 
              disabled={isLoading || isResyncing}
            >
              Cancel
            </Button>
            {step === 1 ? (
              <Button onClick={handleNext} disabled={isLoading || isResyncing}>
                {isLoading ? "Fetching..." : "Next"}
              </Button>
            ) : (
              <Button onClick={handleLoadHeaders} disabled={isLoading}>
                {isLoading ? "Fetching..." : "Load Headers & Map"}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

