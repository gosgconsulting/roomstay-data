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
import { useState } from "react";
import { FileText, ChevronLeft } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ColumnMappingStep } from "./ColumnMappingStep";
import { 
  parseValue,
  insertDataInBatches,
} from "@/lib/sync-utils";

interface CSVDataSourceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: string;
  accountId?: string;
}

export const CSVDataSourceModal = ({ open, onOpenChange, reportId, accountId }: CSVDataSourceModalProps) => {
  const [step, setStep] = useState(1);
  const [dataName, setDataName] = useState("");
  const [csvUrl, setCsvUrl] = useState("");
  const [headerRow, setHeaderRow] = useState("1");
  const [headers, setHeaders] = useState<string[]>([]);
  const [sampleDataRows, setSampleDataRows] = useState<any[][]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const validateUrl = (url: string): boolean => {
    try {
      const urlObj = new URL(url);
      return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
      return false;
    }
  };

  const handleNext = async () => {
    if (!dataName || !csvUrl) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    if (!validateUrl(csvUrl)) {
      toast({
        title: "Invalid URL",
        description: "Please provide a valid HTTP or HTTPS URL",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    
    try {
      // Fetch CSV data to get headers
      const { data: csvData, error: csvError } = await supabase.functions.invoke('fetch-csv-url', {
        body: {
          csvUrl,
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

      const fetchedHeaders = csvData.values[headerRowNum - 1];
      const sampleRows = csvData.values.slice(headerRowNum, headerRowNum + 5); // Get next 5 rows as samples
      
      setHeaders(fetchedHeaders || []);
      setSampleDataRows(sampleRows || []);
      setStep(2); // Move to mapping step
    } catch (error) {
      console.error("Error fetching CSV data:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to fetch CSV data";
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
    setCsvUrl("");
    setHeaderRow("1");
    setHeaders([]);
    setSampleDataRows([]);
  };

  const handleBack = () => {
    if (step === 2) {
      setStep(1);
      setHeaders([]);
      setSampleDataRows([]);
    }
  };

  const handleSaveMappings = async (mappings: any[]) => {
    if (!csvUrl) return;

    setIsLoading(true);
    
    try {
      // Fetch all CSV data
      const { data: csvData, error: csvError } = await supabase.functions.invoke('fetch-csv-url', {
        body: {
          csvUrl,
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

      const csvHeaders = csvData.values[headerRowNum - 1];
      const dataRows = csvData.values.slice(headerRowNum); // Skip header row

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Save data source metadata to database
      const { data: dataSource, error: dbError } = await supabase
        .from('data_sources')
        .insert({
          report_id: reportId,
          name: dataName,
          csv_url: csvUrl,
          source_type: 'csv_url',
          header_row: headerRowNum,
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

      // Transform data rows to dimension_data format
      const rowsToInsert = dataRows.map((row, index) => {
        const dimensionValues: Record<string, any> = {};
        
        visibleMappings.forEach((mapping) => {
          // Try exact match first, then normalized match (trim and case-insensitive)
          let colIndex = csvHeaders.indexOf(mapping.column);
          if (colIndex === -1) {
            const normalizedMappingCol = mapping.column.trim().toLowerCase();
            colIndex = csvHeaders.findIndex((header: string) => 
              header.trim().toLowerCase() === normalizedMappingCol
            );
          }
          
          if (colIndex !== -1 && dimensionIdMap[mapping.column]) {
            const rawValue = row[colIndex];
            const dimensionType = mapping.newDimensionType || mapping.dimensionType || 'text';
            const dateFormat = mapping.dateFormat;
            const value = parseValue(rawValue, dimensionType, dateFormat);
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

      // Insert data using utility function
      await insertDataInBatches(rowsToInsert);

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
            {step === 2 && (
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
            <FileText className="h-5 w-5 text-primary" />
            Add CSV URL Data Source
          </DialogTitle>
          <DialogDescription>
            {step === 1 
              ? "Enter your CSV URL and data name"
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
                <Label htmlFor="csvUrl">CSV URL *</Label>
                <Input
                  id="csvUrl"
                  placeholder="https://example.com/data.csv"
                  value={csvUrl}
                  onChange={(e) => setCsvUrl(e.target.value)}
                />
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
                <p className="text-xs text-muted-foreground">
                  The row number (starting from 1) that contains the column headers
                </p>
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
            />
          )}
        </div>

        {step === 1 && (
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
            <Button onClick={handleNext} disabled={isLoading}>
              {isLoading ? "Fetching..." : "Next"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

