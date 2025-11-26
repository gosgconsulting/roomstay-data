import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useState, useEffect, useRef } from "react";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { ColumnMappingStep, ColumnMappingStepRef } from "./ColumnMappingStep";
import { resyncColumnMappings } from "@/lib/resync-dimensions";
import { resyncReportViews } from "@/lib/resync-report-views";
import { useDataSourceHeaders } from "@/hooks/useDataSourceHeaders";

interface DataSource {
  id: string;
  name: string;
  source_type?: 'google_sheets' | 'csv_url';
  google_sheets_url?: string | null;
  spreadsheet_id?: string | null;
  tab_name?: string | null;
  csv_url?: string | null;
  header_row: number;
  column_mappings: any[] | null;
  report_id?: string;
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
  accountId: propAccountId
}: EditMappingModalProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [accountId, setAccountId] = useState<string | undefined>(propAccountId);
  const mappingStepRef = useRef<ColumnMappingStepRef>(null);

  // Use react-query to fetch headers
  const {
    data: headersData,
    isLoading: isFetchingHeaders,
    error: headersError,
    refetch: refetchHeaders,
  } = useDataSourceHeaders(dataSource, open && !!dataSource);

  const headers = headersData?.headers || [];
  const sampleDataRows = headersData?.sampleDataRows || [];

  useEffect(() => {
    if (open && dataSource) {
      fetchAccountId();
      resyncMappingsIfNeeded();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dataSource, propAccountId]);

  // Show error toast when headers fetch fails
  useEffect(() => {
    if (headersError && open) {
      const errorMessage =
        headersError instanceof Error ? headersError.message : "Failed to fetch headers";
      toast({
        title: "Fetch failed",
        description: errorMessage,
        variant: "destructive",
      });
    }
  }, [headersError, open]);

  // Resync column mappings with account-scoped dimensions
  const resyncMappingsIfNeeded = async () => {
    if (!dataSource || !dataSource.id) return;
    
    try {
      // Get account ID
      let actualAccountId = propAccountId;
      if (!actualAccountId && dataSource.report_id) {
        const { data: reportData } = await supabase
          .from('reports')
          .select('account_id')
          .eq('id', dataSource.report_id)
          .maybeSingle();
        actualAccountId = reportData?.account_id || undefined;
      }

      if (!actualAccountId) {
        console.log('[RESYNC] No account ID available, skipping resync');
        return;
      }

      console.log('[RESYNC] Resyncing column mappings for data source:', dataSource.name);
      await resyncColumnMappings(dataSource.id, actualAccountId);
      
      // Also resync report views if report_id exists
      if (dataSource.report_id) {
        console.log('[RESYNC] Resyncing report views for report:', dataSource.report_id);
        try {
          await resyncReportViews(dataSource.report_id, actualAccountId);
        } catch (error) {
          console.error('[RESYNC] Error resyncing report views:', error);
          // Don't block the UI if report views resync fails
        }
      }
      
      // Reload headers to get updated mappings
      await refetchHeaders();
    } catch (error) {
      console.error('[RESYNC] Error resyncing mappings:', error);
      // Don't show error to user, just log it - the edit modal will still work
    }
  };

  // Fetch accountId from report if not provided
  const fetchAccountId = async () => {
    if (propAccountId) {
      setAccountId(propAccountId);
      return;
    }

    if (!dataSource?.report_id) {
      setAccountId(undefined);
      return;
    }

    try {
      const { data: reportData, error } = await supabase
        .from('reports')
        .select('account_id')
        .eq('id', dataSource.report_id)
        .maybeSingle();

      if (error) throw error;
      setAccountId(reportData?.account_id || undefined);
    } catch (error) {
      console.error('Error fetching account ID:', error);
      setAccountId(undefined);
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
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Edit Column Mappings
          </DialogTitle>
          <DialogDescription>
            Update the column mappings for {dataSource?.name || 'this data source'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-4 min-h-0">
          {isFetchingHeaders ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading headers...
            </div>
          ) : headers.length > 0 ? (
            <ColumnMappingStep
              ref={mappingStepRef}
              headers={headers}
              sampleDataRows={sampleDataRows}
              onSave={handleSaveMappings}
              onBack={() => onOpenChange(false)}
              isLoading={isLoading}
              existingMappings={dataSource?.column_mappings || []}
              accountId={accountId}
              reportId={dataSource?.report_id || undefined}
              hideButtons={true}
            />
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No headers found
            </div>
          )}
        </div>

        {!isFetchingHeaders && headers.length > 0 && (
          <div className="flex justify-between items-center px-6 py-4 flex-shrink-0 border-t bg-background sticky bottom-0">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Back
            </Button>
            <Button 
              onClick={() => mappingStepRef.current?.save()} 
              disabled={isLoading}
            >
              {isLoading ? "Saving..." : "Save Mappings"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};