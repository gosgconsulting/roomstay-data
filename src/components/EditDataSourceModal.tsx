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
import { ResyncProgressModal } from "./ResyncProgressModal";
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
  google_sheets_url?: string | null;
  spreadsheet_id?: string | null;
  tab_name?: string | null;
  csv_url?: string | null;
  source_type?: 'google_sheets' | 'csv_url';
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
  const [resyncProgress, setResyncProgress] = useState<Array<{
    id: string;
    label: string;
    status: 'pending' | 'in-progress' | 'completed' | 'error';
    detail?: string;
  }>>([]);
  const [syncedRowsCount, setSyncedRowsCount] = useState<number | null>(null);
  const [syncedColumnsCount, setSyncedColumnsCount] = useState<number | null>(null);
  const [syncFrequency, setSyncFrequency] = useState("manual");
  const [syncTime, setSyncTime] = useState("09:00");
  const [syncTimezone, setSyncTimezone] = useState("Asia/Singapore");

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
      const sourceType = dataSource.source_type || 'google_sheets';
      setUrl(sourceType === 'csv_url' ? (dataSource.csv_url || "") : (dataSource.google_sheets_url || ""));
      setSelectedTab(dataSource.tab_name || "");
      setHeaderRow(String(dataSource.header_row || 1));
      setSyncFrequency((dataSource as any).sync_frequency || "manual");
      setSyncTime((dataSource as any).sync_time?.substring(0, 5) || "09:00");
      setSyncTimezone((dataSource as any).sync_timezone || "Asia/Singapore");
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

    const sourceType = dataSource?.source_type || 'google_sheets';

    if (sourceType === 'csv_url') {
      // For CSV, validate URL and skip to header loading
      try {
        new URL(url);
      } catch {
        toast({
          title: "Invalid URL",
          description: "Please provide a valid HTTP or HTTPS URL",
          variant: "destructive",
        });
        return;
      }

      // Skip tab selection for CSV, go directly to header loading
      await handleLoadHeaders();
      return;
    }

    // Google Sheets flow
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
    const sourceType = dataSource?.source_type || 'google_sheets';

    if (sourceType === 'google_sheets') {
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
    }

    setIsLoading(true);
    
    try {
      let fetchedHeaders: any[] = [];
      let sampleRows: any[][] = [];

      if (sourceType === 'csv_url') {
        // Fetch CSV data
        const { data: csvData, error: csvError } = await supabase.functions.invoke('fetch-csv-url', {
          body: {
            csvUrl: url,
          },
        });

        if (csvError) throw csvError;

        if (!csvData?.values || csvData.values.length === 0) {
          throw new Error("No data found in the CSV file");
        }

        const headerRowNum = parseInt(headerRow) || 1;
        if (headerRowNum < 1 || headerRowNum > csvData.values.length) {
          throw new Error(`Header row ${headerRowNum} is out of range. CSV has ${csvData.values.length} rows.`);
        }

        fetchedHeaders = csvData.values[headerRowNum - 1] || [];
        sampleRows = csvData.values.slice(headerRowNum, headerRowNum + 5); // Get next 5 rows as samples
      } else {
        // Google Sheets flow
        const spreadsheetId = extractSpreadsheetId(url);
        if (!spreadsheetId) return;

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

        fetchedHeaders = sheetsData.values[0] || [];
        sampleRows = sheetsData.values.slice(1, 6); // Get first 5 data rows as samples
      }

      // Normalize headers
      const normalizedHeaders = fetchedHeaders.map((h: any) => 
        h === null || h === undefined ? '' : String(h).trim()
      );
      
      setHeaders(normalizedHeaders);
      setSampleDataRows(sampleRows);
      setStep(3); // Move to mapping step
    } catch (error) {
      console.error("Error fetching data:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to fetch data";
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
      const sourceType = dataSource.source_type || 'google_sheets';
      setUrl(sourceType === 'csv_url' ? (dataSource.csv_url || "") : (dataSource.google_sheets_url || ""));
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

    const sourceType = dataSource.source_type || 'google_sheets';
    const updateData: any = {
      name: dataName,
      header_row: parseInt(headerRow),
      column_mappings: mappings,
      sync_frequency: syncFrequency,
      sync_time: syncTime,
      sync_timezone: syncTimezone,
    };

    if (sourceType === 'csv_url') {
      updateData.csv_url = url;
      updateData.source_type = 'csv_url';
    } else {
      const spreadsheetId = extractSpreadsheetId(url);
      if (!spreadsheetId) return;
      updateData.google_sheets_url = url;
      updateData.spreadsheet_id = spreadsheetId;
      updateData.tab_name = selectedTab;
      updateData.source_type = 'google_sheets';
    }

    setIsLoading(true);
    
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Update data source metadata
      const { error: updateError } = await supabase
        .from('data_sources')
        .update(updateData)
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

  const handleSaveSettings = async () => {
    if (!dataSource) return;

    const sourceType = dataSource.source_type || 'google_sheets';
    const updateData: any = {
      name: dataName,
      header_row: parseInt(headerRow),
      sync_frequency: syncFrequency,
      sync_time: syncTime,
      sync_timezone: syncTimezone,
    };

    if (sourceType === 'csv_url') {
      try {
        new URL(url);
      } catch {
        toast({
          title: "Invalid URL",
          description: "Please provide a valid HTTP or HTTPS URL",
          variant: "destructive",
        });
        return;
      }
      updateData.csv_url = url;
      updateData.source_type = 'csv_url';
    } else {
      const spreadsheetId = extractSpreadsheetId(url);
      if (!spreadsheetId) {
        toast({
          title: "Invalid URL",
          description: "Please provide a valid Google Sheets URL",
          variant: "destructive",
        });
        return;
      }
      updateData.google_sheets_url = url;
      updateData.spreadsheet_id = spreadsheetId;
      updateData.tab_name = selectedTab;
      updateData.source_type = 'google_sheets';
    }

    setIsLoading(true);
    
    try {
      const { error: updateError } = await supabase
        .from('data_sources')
        .update(updateData)
        .eq('id', dataSource.id);

      if (updateError) throw updateError;

      toast({
        title: "Settings saved",
        description: "Auto-sync settings have been updated successfully",
      });
      
      onSuccess();
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Error saving settings:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to save settings";
      toast({
        title: "Save failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResync = async () => {
    if (!dataSource) return;

    // Initialize progress steps
    setResyncProgress([
      { id: 'fetch', label: 'Fetching data from source', status: 'in-progress', detail: 'Downloading data...' },
      { id: 'delete', label: 'Clearing existing data', status: 'pending' },
      { id: 'dimensions', label: 'Creating dimensions', status: 'pending' },
      { id: 'insert', label: 'Importing data', status: 'pending' },
      { id: 'vlookup', label: 'Applying vlookup mappings', status: 'pending' },
    ]);
    
    setIsResyncing(true);
    
    try {
      const sourceType = dataSource.source_type || 'google_sheets';
      const updateData: any = {
        name: dataName,
        header_row: parseInt(headerRow),
        sync_frequency: syncFrequency,
        sync_time: syncTime,
        sync_timezone: syncTimezone,
      };

      if (sourceType === 'csv_url') {
        try {
          new URL(url);
        } catch {
          throw new Error("Invalid CSV URL");
        }
        updateData.csv_url = url;
        updateData.source_type = 'csv_url';
      } else {
        const spreadsheetId = extractSpreadsheetId(url);
        if (!spreadsheetId) {
          throw new Error("Invalid Google Sheets URL");
        }
        updateData.google_sheets_url = url;
        updateData.spreadsheet_id = spreadsheetId;
        updateData.tab_name = selectedTab;
        updateData.source_type = 'google_sheets';
      }

      // First update the data source with current form values
      const { error: updateError } = await supabase
        .from('data_sources')
        .update(updateData)
        .eq('id', dataSource.id);

      if (updateError) throw updateError;

      // Mark fetch as completed
      setResyncProgress(prev => prev.map(step => 
        step.id === 'fetch' 
          ? { ...step, status: 'completed', detail: 'Data fetched successfully' }
          : step.id === 'delete' 
          ? { ...step, status: 'in-progress', detail: 'Removing old data...' }
          : step
      ));

      // Convert to sync-utils format with updated values
      const syncDataSourceObj: SyncDataSource = {
        id: dataSource.id,
        name: dataName,
        header_row: parseInt(headerRow),
        column_mappings: dataSource.column_mappings,
        report_id: dataSource.report_id,
        source_type: sourceType,
      };

      if (sourceType === 'csv_url') {
        syncDataSourceObj.csv_url = url;
      } else {
        const spreadsheetId = extractSpreadsheetId(url);
        if (!spreadsheetId) throw new Error("Invalid Google Sheets URL");
        syncDataSourceObj.google_sheets_url = url;
        syncDataSourceObj.spreadsheet_id = spreadsheetId;
        syncDataSourceObj.tab_name = selectedTab;
      }

      const options: SyncOptions = {
        deleteExistingData: true,
        recreateDimensions: true,
        showProgress: true,
        onProgress: (message) => {
          console.log(`[RESYNC] ${message}`);
          
          // Update progress based on messages
          if (message.includes('Deleting')) {
            setResyncProgress(prev => prev.map(step => 
              step.id === 'delete' ? { ...step, status: 'in-progress', detail: message } : step
            ));
          } else if (message.includes('Deleted')) {
            setResyncProgress(prev => prev.map(step => 
              step.id === 'delete' 
                ? { ...step, status: 'completed', detail: 'Old data removed' }
                : step.id === 'dimensions'
                ? { ...step, status: 'in-progress', detail: 'Setting up dimensions...' }
                : step
            ));
          } else if (message.includes('dimension')) {
            setResyncProgress(prev => prev.map(step => 
              step.id === 'dimensions' ? { ...step, status: 'in-progress', detail: message } : step
            ));
          } else if (message.includes('Inserting batch')) {
            setResyncProgress(prev => prev.map(step => 
              step.id === 'dimensions' && step.status !== 'completed'
                ? { ...step, status: 'completed', detail: 'Dimensions created' }
                : step.id === 'insert'
                ? { ...step, status: 'in-progress', detail: message }
                : step
            ));
          }
        }
      };

      const result = await syncDataSource(syncDataSourceObj, options);

      if (result.success) {
        // Mark insert as completed
        setResyncProgress(prev => prev.map(step => 
          step.id === 'insert' 
            ? { ...step, status: 'completed', detail: `${result.rowsProcessed.toLocaleString()} rows imported` }
            : step
        ));

        // Handle vlookup step based on actual result
        if (result.vlookupApplied !== undefined) {
          // Mark vlookup as in-progress first
          setResyncProgress(prev => prev.map(step => 
            step.id === 'vlookup' 
              ? { ...step, status: 'in-progress', detail: 'Applying mappings...' }
              : step
          ));

          // Wait a bit to show the step
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Mark vlookup based on actual result
          if (result.vlookupApplied) {
            setResyncProgress(prev => prev.map(step => 
              step.id === 'vlookup' 
                ? { 
                    ...step, 
                    status: 'completed', 
                    detail: `Applied to ${result.vlookupRowsUpdated?.toLocaleString() || 0} rows` 
                  }
                : step
            ));
          } else {
            // Vlookup failed but resync succeeded
            setResyncProgress(prev => prev.map(step => 
              step.id === 'vlookup' 
                ? { 
                    ...step, 
                    status: 'error', 
                    detail: result.vlookupError || 'Failed to apply mappings' 
                  }
                : step
            ));
            console.warn('[RESYNC] Vlookup application failed:', result.vlookupError);
          }
        } else {
          // No vlookup step if no mappings exist or report_id is missing
          setResyncProgress(prev => prev.map(step => 
            step.id === 'vlookup' 
              ? { ...step, status: 'completed', detail: 'No mappings to apply' }
              : step
          ));
        }

        // Wait to show completion
        await new Promise(resolve => setTimeout(resolve, 1000));

        const vlookupMessage = result.vlookupApplied 
          ? ` Applied vlookup mappings to ${result.vlookupRowsUpdated?.toLocaleString() || 0} rows.`
          : result.vlookupError 
            ? ` Note: Vlookup mappings could not be applied (${result.vlookupError}). Mappings will still work when data is loaded.`
            : '';

        toast({
          title: "Resync complete",
          description: `Successfully resynced ${result.rowsProcessed.toLocaleString()} rows and recreated ${result.dimensionsCreated} dimensions from scratch.${vlookupMessage}`,
        });
        
        // Refresh sync statistics
        await fetchSyncStatistics();
        
        onSuccess();
        onOpenChange(false);
        resetForm();
      } else {
        throw new Error(result.error || "Sync failed - check console for details");
      }
    } catch (error) {
      console.error("Error resyncing data source:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to resync data";
      
      // Mark current step as error
      setResyncProgress(prev => prev.map(step => 
        step.status === 'in-progress' 
          ? { ...step, status: 'error', detail: errorMessage }
          : step
      ));
      
      // Wait to show error
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      toast({
        title: "Resync failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsResyncing(false);
      // Clear progress after a delay
      setTimeout(() => setResyncProgress([]), 3000);
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
            {dataSource?.source_type === 'csv_url' ? 'Edit CSV URL Data Source' : 'Edit Google Sheets Data Source'}
          </DialogTitle>
          <DialogDescription>
            {step === 1 
              ? dataSource?.source_type === 'csv_url' 
                ? "Update your CSV URL, name, and other settings"
                : "Update your Google Sheets URL, name, and other settings"
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
                <Label htmlFor="url">
                  {dataSource?.source_type === 'csv_url' ? 'CSV URL *' : 'Google Sheets URL *'}
                </Label>
                <Input
                  id="url"
                  placeholder={dataSource?.source_type === 'csv_url' 
                    ? "https://example.com/data.csv" 
                    : "https://docs.google.com/spreadsheets/d/..."}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                />
              </div>

              <div className="space-y-4 border-t pt-4">
                <h3 className="text-sm font-semibold">Auto-Sync Settings</h3>
                
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="syncFrequency">Sync Frequency</Label>
                    <Select value={syncFrequency} onValueChange={setSyncFrequency}>
                      <SelectTrigger id="syncFrequency" className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        <SelectItem value="manual">Manual</SelectItem>
                        <SelectItem value="daily">Daily</SelectItem>
                        <SelectItem value="weekly">Weekly (Sundays)</SelectItem>
                        <SelectItem value="monthly">Monthly (1st)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="syncTime">Sync Time (UTC)</Label>
                    <Input
                      id="syncTime"
                      type="time"
                      value={syncTime}
                      onChange={(e) => setSyncTime(e.target.value)}
                      disabled={syncFrequency === 'manual'}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="syncTimezone">Timezone</Label>
                    <Select value={syncTimezone} onValueChange={setSyncTimezone} disabled={syncFrequency === 'manual'}>
                      <SelectTrigger id="syncTimezone" className="bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background z-50">
                        <SelectItem value="Asia/Singapore">SGT (Singapore)</SelectItem>
                        <SelectItem value="America/New_York">EST (New York)</SelectItem>
                        <SelectItem value="America/Los_Angeles">PST (Los Angeles)</SelectItem>
                        <SelectItem value="Europe/London">GMT (London)</SelectItem>
                        <SelectItem value="Europe/Paris">CET (Paris)</SelectItem>
                        <SelectItem value="Asia/Tokyo">JST (Tokyo)</SelectItem>
                        <SelectItem value="Australia/Sydney">AEST (Sydney)</SelectItem>
                        <SelectItem value="UTC">UTC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                {syncFrequency !== 'manual' && (
                  <p className="text-xs text-muted-foreground">
                    Data will automatically sync {syncFrequency} at {syncTime} {syncTimezone}
                  </p>
                )}
              </div>

                {dataSource && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-3">
                      <Button
                        onClick={handleSaveSettings}
                        disabled={isResyncing || isLoading}
                        className="gap-2"
                      >
                        Save Settings
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleResync}
                        disabled={isResyncing || isLoading}
                        className="gap-2"
                      >
                        <RefreshCw className={`h-4 w-4 ${isResyncing ? 'animate-spin' : ''}`} />
                        {isResyncing ? 'Resyncing...' : 'Resync from Scratch'}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <strong>Save Settings:</strong> Updates auto-sync and other settings without changing data. <strong>Resync:</strong> Replaces all data and recreates dimensions.
                    </p>
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
              {dataSource?.source_type !== 'csv_url' && (
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
              )}

              <div className="space-y-2">
                <Label htmlFor="headerRow">Header Row Number</Label>
                <Input
                  id="headerRow"
                  type="number"
                  min="1"
                  value={headerRow}
                  onChange={(e) => setHeaderRow(e.target.value)}
                />
                {dataSource?.source_type === 'csv_url' && (
                  <p className="text-xs text-muted-foreground">
                    The row number (starting from 1) that contains the column headers
                  </p>
                )}
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
      
      <ResyncProgressModal 
        open={isResyncing && resyncProgress.length > 0} 
        steps={resyncProgress}
      />
    </Dialog>
  );
};

