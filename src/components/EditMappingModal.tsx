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
  accountId?: string;
}

export const EditMappingModal = ({
  open,
  onOpenChange,
  dataSource,
  onSuccess,
  accountId
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
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Get report_id from data_source
      const { data: dsData, error: dsError } = await supabase
        .from('data_sources')
        .select('report_id')
        .eq('id', dataSource.id)
        .maybeSingle();
      
      if (dsError) throw dsError;
      const reportId = dsData?.report_id;

      // Create any new dimensions first
      const updatedMappings = [...mappings];
      
      for (let i = 0; i < updatedMappings.length; i++) {
        const mapping = updatedMappings[i];
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
            .maybeSingle();
          
          if (dimError) throw dimError;
          
          // Update the mapping with the new dimension ID
          if (newDim) {
            updatedMappings[i] = {
              ...mapping,
              dimensionId: newDim.id,
            };
          }
        }
      }

      // Update data source with new mappings
      const { error: updateError } = await supabase
        .from('data_sources')
        .update({
          column_mappings: updatedMappings,
        })
        .eq('id', dataSource.id);

      if (updateError) throw updateError;

      toast({
        title: "Mappings updated",
        description: `Successfully updated ${dataSource.name}. Use the Sync button to refresh the data with new mappings.`,
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
