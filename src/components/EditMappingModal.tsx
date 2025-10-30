import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ColumnMappingStep } from "./ColumnMappingStep";

interface DataSource {
  id: string;
  name: string;
  google_sheets_url: string;
  spreadsheet_id: string;
  tab_name: string;
  header_row: number;
  column_mappings: any[] | null;
}

interface EditMappingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataSource: DataSource | null;
  onSuccess: () => void;
}

export const EditMappingModal = ({ 
  open, 
  onOpenChange, 
  dataSource,
  onSuccess 
}: EditMappingModalProps) => {
  const [headers, setHeaders] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingHeaders, setIsFetchingHeaders] = useState(false);

  useEffect(() => {
    if (open && dataSource) {
      fetchHeaders();
    }
  }, [open, dataSource]);

  const fetchHeaders = async () => {
    if (!dataSource) return;
    
    setIsFetchingHeaders(true);
    
    try {
      const { data: sheetsData, error: sheetsError } = await supabase.functions.invoke('fetch-google-sheets', {
        body: {
          spreadsheetId: dataSource.spreadsheet_id,
          tabName: dataSource.tab_name,
          range: `${dataSource.header_row}:${dataSource.header_row}`,
        },
      });

      if (sheetsError) throw sheetsError;

      if (!sheetsData?.values || sheetsData.values.length === 0) {
        throw new Error("No data found in the specified range");
      }

      setHeaders(sheetsData.values[0]);
    } catch (error) {
      console.error("Error fetching headers:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to fetch sheet headers";
      toast({
        title: "Fetch failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsFetchingHeaders(false);
    }
  };

  const handleSaveMappings = async (mappings: any[]) => {
    if (!dataSource) return;

    setIsLoading(true);
    
    try {
      // Fetch all data from the sheet (up to 300,000 rows)
      const { data: sheetsData, error: sheetsError } = await supabase.functions.invoke('fetch-google-sheets', {
        body: {
          spreadsheetId: dataSource.spreadsheet_id,
          tabName: dataSource.tab_name,
          range: `${dataSource.header_row}:300000`,
        },
      });

      if (sheetsError) throw sheetsError;

      if (!sheetsData?.values || sheetsData.values.length === 0) {
        throw new Error("No data found in the specified range");
      }

      const sheetHeaders = sheetsData.values[0];
      const dataRows = sheetsData.values.slice(1);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Update data source with new mappings
      const { error: updateError } = await supabase
        .from('data_sources')
        .update({
          column_mappings: mappings,
        })
        .eq('id', dataSource.id);

      if (updateError) throw updateError;

      // Delete existing dimension_data for this data source
      const { error: deleteError } = await supabase
        .from('dimension_data')
        .delete()
        .eq('data_source_id', dataSource.id);

      if (deleteError) throw deleteError;

      // Auto-create new dimensions and build dimension ID map
      const dimensionIdMap: Record<string, string> = {};
      const visibleMappings = mappings.filter(m => m.visible);
      
      // Fetch report_id from data_source
      const { data: dsData } = await supabase
        .from('data_sources')
        .select('report_id')
        .eq('id', dataSource.id)
        .single();
      
      const reportId = dsData?.report_id;
      
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
        } else if (mapping.dimensionId && mapping.dimensionId !== 'none') {
          // Use existing dimension
          dimensionIdMap[mapping.column] = mapping.dimensionId;
        }
      }

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

      // Transform and re-insert data with new mappings
      const rowsToInsert = dataRows.map((row, index) => {
        const dimensionValues: Record<string, any> = {};
        
        visibleMappings.forEach((mapping) => {
          const colIndex = sheetHeaders.indexOf(mapping.column);
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

      // Insert in batches to dimension_data
      const batchSize = 500;
      for (let i = 0; i < rowsToInsert.length; i += batchSize) {
        const batch = rowsToInsert.slice(i, i + batchSize);
        const { error: insertError } = await supabase
          .from('dimension_data')
          .insert(batch);

        if (insertError) throw insertError;
      }

      toast({
        title: "Mappings updated",
        description: `Successfully updated ${dataSource.name} with ${visibleMappings.length} columns and ${dataRows.length} rows`,
      });
      
      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Error updating mappings:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to update mappings";
      toast({
        title: "Update failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Edit Column Mappings
          </DialogTitle>
          <DialogDescription>
            Update the column mappings for {dataSource?.name}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {isFetchingHeaders ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading headers...
            </div>
          ) : headers.length > 0 ? (
            <ColumnMappingStep
              headers={headers}
              onSave={handleSaveMappings}
              onBack={() => onOpenChange(false)}
              isLoading={isLoading}
              existingMappings={dataSource?.column_mappings || undefined}
            />
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No headers found
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
