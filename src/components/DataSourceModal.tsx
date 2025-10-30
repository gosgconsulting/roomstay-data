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
import { useState } from "react";
import { FileSpreadsheet, ChevronLeft } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface DataSourceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: string;
}

export const DataSourceModal = ({ open, onOpenChange, reportId }: DataSourceModalProps) => {
  const [step, setStep] = useState(1);
  const [dataName, setDataName] = useState("");
  const [url, setUrl] = useState("");
  const [availableTabs, setAvailableTabs] = useState<string[]>([]);
  const [selectedTab, setSelectedTab] = useState("");
  const [headerRow, setHeaderRow] = useState("1");
  const [isLoading, setIsLoading] = useState(false);

  const extractSpreadsheetId = (url: string) => {
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  };

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
        setSelectedTab(tabs[0]);
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

  const handleAdd = async () => {
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
      // Fetch all data from the sheet (up to 10,000 rows)
      const { data: sheetsData, error: sheetsError } = await supabase.functions.invoke('fetch-google-sheets', {
        body: {
          spreadsheetId,
          tabName: selectedTab,
          range: `${headerRow}:10000`,
        },
      });

      if (sheetsError) throw sheetsError;

      if (!sheetsData?.values || sheetsData.values.length === 0) {
        throw new Error("No data found in the specified range");
      }

      const headers = sheetsData.values[0];
      const dataRows = sheetsData.values.slice(1); // Skip header row

      // Save data source metadata to database
      const { data: dataSource, error: dbError } = await supabase
        .from('data_sources')
        .insert({
          report_id: reportId,
          name: dataName,
          google_sheets_url: url,
          spreadsheet_id: spreadsheetId,
          tab_name: selectedTab,
          header_row: parseInt(headerRow),
        })
        .select()
        .single();

      if (dbError) throw dbError;

      // Save all data rows to sheet_data table
      const rowsToInsert = dataRows.map((row, index) => {
        // Convert array to object with headers as keys
        const rowData: Record<string, any> = {};
        headers.forEach((header: string, colIndex: number) => {
          rowData[header] = row[colIndex] || null;
        });
        
        return {
          data_source_id: dataSource.id,
          row_number: index + 1,
          row_data: rowData,
        };
      });

      // Insert in batches to avoid payload size limits
      const batchSize = 500;
      for (let i = 0; i < rowsToInsert.length; i += batchSize) {
        const batch = rowsToInsert.slice(i, i + batchSize);
        const { error: insertError } = await supabase
          .from('sheet_data')
          .insert(batch);

        if (insertError) throw insertError;
      }

      toast({
        title: "Data source saved",
        description: `Successfully connected to ${dataName} with ${headers.length} columns and ${dataRows.length} rows`,
      });
      
      onOpenChange(false);
      resetForm();
    } catch (error) {
      console.error("Error saving data source:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to save data source";
      toast({
        title: "Save failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setStep(1);
    setDataName("");
    setUrl("");
    setAvailableTabs([]);
    setSelectedTab("");
    setHeaderRow("1");
  };

  const handleBack = () => {
    setStep(1);
    setAvailableTabs([]);
    setSelectedTab("");
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      onOpenChange(open);
      if (!open) resetForm();
    }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 2 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 -ml-2"
                onClick={handleBack}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Add Google Sheets Data Source
          </DialogTitle>
          <DialogDescription>
            {step === 1 
              ? "Enter your Google Sheets URL and data name"
              : "Select the tab and specify the header row"
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
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="tabName">Select Tab *</Label>
                <Select value={selectedTab} onValueChange={setSelectedTab}>
                  <SelectTrigger id="tabName">
                    <SelectValue placeholder="Select a tab" />
                  </SelectTrigger>
                  <SelectContent>
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
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button 
            variant="outline" 
            onClick={() => {
              onOpenChange(false);
              resetForm();
            }} 
            disabled={isLoading}
          >
            Cancel
          </Button>
          {step === 1 ? (
            <Button onClick={handleNext} disabled={isLoading}>
              {isLoading ? "Fetching..." : "Next"}
            </Button>
          ) : (
            <Button onClick={handleAdd} disabled={isLoading}>
              {isLoading ? "Connecting..." : "Add Data Source"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
