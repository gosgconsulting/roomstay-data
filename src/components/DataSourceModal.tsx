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
import { ColumnMappingStep } from "./ColumnMappingStep";

interface DataSourceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: string;
  accountId?: string;
}

export const DataSourceModal = ({ open, onOpenChange, reportId, accountId }: DataSourceModalProps) => {
  const [step, setStep] = useState(1);
  const [dataName, setDataName] = useState("");
  const [url, setUrl] = useState("");
  const [availableTabs, setAvailableTabs] = useState<string[]>([]);
  const [selectedTab, setSelectedTab] = useState("");
  const [headerRow, setHeaderRow] = useState("1");
  const [headers, setHeaders] = useState<string[]>([]);
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
      // Fetch headers from the sheet
      const { data: sheetsData, error: sheetsError } = await supabase.functions.invoke('fetch-google-sheets', {
        body: {
          spreadsheetId,
          tabName: selectedTab,
          range: `${headerRow}:${parseInt(headerRow) + 100}`, // Fetch header + 100 rows for preview
        },
      });

      if (sheetsError) throw sheetsError;

      if (!sheetsData?.values || sheetsData.values.length === 0) {
        throw new Error("No data found in the specified range");
      }

      const fetchedHeaders = sheetsData.values[0];
      setHeaders(fetchedHeaders);
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
    setDataName("");
    setUrl("");
    setAvailableTabs([]);
    setSelectedTab("");
    setHeaderRow("1");
    setHeaders([]);
  };

  const handleBack = () => {
    if (step === 3) {
      setStep(2);
      setHeaders([]);
    } else {
      setStep(1);
      setAvailableTabs([]);
      setSelectedTab("");
    }
  };

  const handleSaveMappings = async (mappings: any[]) => {
    const spreadsheetId = extractSpreadsheetId(url);
    if (!spreadsheetId) return;

    setIsLoading(true);
    
    try {
      // Fetch all data from the sheet (up to 300,000 rows)
      const { data: sheetsData, error: sheetsError } = await supabase.functions.invoke('fetch-google-sheets', {
        body: {
          spreadsheetId,
          tabName: selectedTab,
          range: `${headerRow}:300000`,
        },
      });

      if (sheetsError) throw sheetsError;

      if (!sheetsData?.values || sheetsData.values.length === 0) {
        throw new Error("No data found in the specified range");
      }

      const sheetHeaders = sheetsData.values[0];
      const dataRows = sheetsData.values.slice(1); // Skip header row

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

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
          column_mappings: mappings,
        })
        .select()
        .single();

      if (dbError) throw dbError;

      // Auto-create dimensions and build dimension ID map
      const dimensionIdMap: Record<string, string> = {};
      const visibleMappings = mappings.filter(m => m.visible);
      
      console.log(`[IMPORT] Processing ${visibleMappings.length} visible mappings`);
      
      for (const mapping of visibleMappings) {
        if (mapping.dimensionId === 'create_new' && mapping.newDimensionName) {
          // Create new dimension
          const { data: newDim, error: dimError } = await supabase
            .from('dimensions')
            .insert({
              user_id: user.id,
              report_id: reportId,
              data_source_id: dataSource.id,
              name: mapping.newDimensionName,
              type: mapping.newDimensionType || 'text',
            })
            .select()
            .single();
          
          if (dimError) throw dimError;
          dimensionIdMap[mapping.column] = newDim.id;
          console.log(`[IMPORT] Created new dimension "${mapping.newDimensionName}" for column "${mapping.column}"`);
        } else if (mapping.dimensionId && mapping.dimensionId !== 'none') {
          // Use existing dimension
          dimensionIdMap[mapping.column] = mapping.dimensionId;
          console.log(`[IMPORT] Mapped column "${mapping.column}" to existing dimension ${mapping.dimensionId}`);
        }
      }
      
      console.log(`[IMPORT] Successfully mapped ${Object.keys(dimensionIdMap).length} columns`);

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

      // Transform data rows to dimension_data format
      const rowsToInsert = dataRows.map((row, index) => {
        const dimensionValues: Record<string, any> = {};
        
        visibleMappings.forEach((mapping) => {
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
            
            // Log first row values for debugging
            if (index === 0) {
              console.log(`[IMPORT] Row 1 - ${mapping.column}: "${rawValue}" -> ${value} (${dimensionType})`);
            }
          } else if (!dimensionIdMap[mapping.column]) {
            if (index === 0) {
              console.warn(`[IMPORT] Column "${mapping.column}" not mapped to any dimension`);
            }
          }
        });
        
        return {
          report_id: reportId,
          data_source_id: dataSource.id,
          row_number: index + 1,
          dimension_values: dimensionValues,
        };
      });

      console.log(`[IMPORT] Prepared ${rowsToInsert.length} rows for insertion`);

      // Insert data in batches to dimension_data
      const batchSize = 500;
      for (let i = 0; i < rowsToInsert.length; i += batchSize) {
        const batch = rowsToInsert.slice(i, i + batchSize);
        const { error: insertError } = await supabase
          .from('dimension_data')
          .insert(batch);

        if (insertError) {
          console.error(`[IMPORT] Error inserting batch at index ${i}:`, insertError);
          throw insertError;
        }
      }
      
      console.log(`[IMPORT] Successfully imported ${rowsToInsert.length} rows`);

      toast({
        title: "Data source saved",
        description: `Successfully connected to ${dataName} with ${visibleMappings.length} columns and ${dataRows.length} rows`,
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
                disabled={isLoading}
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
              onSave={handleSaveMappings}
              onBack={handleBack}
              isLoading={isLoading}
              accountId={accountId}
              reportId={reportId}
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
                {isLoading ? "Fetching..." : "Next"}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
