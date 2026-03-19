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
import { useDataSourceHeaders } from "@/hooks/useDataSourceHeaders";
import { useUser } from "@/lib/auth";

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
  const { data: userData } = useUser();
  const user = userData?.user || null;
  const [isLoading, setIsLoading] = useState(false);
  const [accountId, setAccountId] = useState<string | undefined>(propAccountId);
  const [enrichedMappings, setEnrichedMappings] = useState<any[] | null>(null);
  const mappingStepRef = useRef<ColumnMappingStepRef>(null);

  const {
    data: headersData,
    isLoading: isFetchingHeaders,
    error: headersError,
  } = useDataSourceHeaders(dataSource, open && !!dataSource);

  const headers = headersData?.headers || [];
  const sampleDataRows = headersData?.sampleDataRows || [];

  // Reset on close
  useEffect(() => {
    if (!open) {
      setEnrichedMappings(null);
    }
  }, [open]);

  // Resolve accountId for dimension loading in ColumnMappingStep
  useEffect(() => {
    if (!open || !dataSource) return;

    const resolve = async () => {
      let resolvedAccountId = propAccountId;

      if (!resolvedAccountId && dataSource.report_id) {
        const { data: reportData } = await supabase
          .from('reports')
          .select('account_id')
          .eq('id', dataSource.report_id)
          .maybeSingle();
        resolvedAccountId = reportData?.account_id || undefined;
      }

      setAccountId(resolvedAccountId);
    };

    resolve();
  }, [open, dataSource, propAccountId]);

  useEffect(() => {
    if (!open) return;

    const existingMappings: any[] = Array.isArray(dataSource?.column_mappings)
      ? dataSource!.column_mappings
      : [];

    const cleaned = existingMappings.map(({ isFilter: _removed, ...m }) => m);

    setEnrichedMappings(cleaned);
  }, [open, dataSource]);

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

  const handleSaveMappings = async (mappings: any[]) => {
    if (!dataSource) return;

    setIsLoading(true);

    try {
      if (!user) throw new Error("User not authenticated");

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
          const dimensionData = {
            user_id: user.id,
            report_id: reportId,
            data_source_id: dataSource.id,
            name: mapping.newDimensionName,
            type: mapping.newDimensionType || 'text',
            scope: 'custom',
          };

          const { data: newDim, error: dimError } = await supabase
            .from('dimensions')
            .insert(dimensionData)
            .select()
            .maybeSingle();

          if (dimError) throw dimError;

          if (newDim) {
            updatedMappings[i] = {
              ...mapping,
              dimensionId: newDim.id,
              dimensionName: newDim.name,
              newDimensionName: undefined,
              newDimensionType: undefined,
            };
          }
        }
      }

      const userModifiedMappings = updatedMappings.map(({ isFilter: _removed, ...mapping }) => ({
        ...mapping,
        user_modified: true,
      }));

      const { error: updateError } = await supabase
        .from('data_sources')
        .update({ column_mappings: userModifiedMappings })
        .eq('id', dataSource.id);

      if (updateError) throw updateError;

      toast({
        title: "Mappings saved",
        description: `${dataSource.name} column mappings updated. Use Sync to refresh data.`,
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

  const isReady = !isFetchingHeaders && headers.length > 0 && enrichedMappings !== null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[980px] max-h-[92vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="flex-shrink-0 px-6 pt-6 pb-4 border-b">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold">
                Column Mappings
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground">
                {dataSource?.name} — map each column to a dimension and control visibility.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {isFetchingHeaders || enrichedMappings === null ? (
            <div className="text-center py-12 text-muted-foreground">
              <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-primary mx-auto mb-3" />
              <p className="text-sm">Loading column data…</p>
            </div>
          ) : headers.length > 0 ? (
            <ColumnMappingStep
              ref={mappingStepRef}
              headers={headers}
              sampleDataRows={sampleDataRows}
              onSave={handleSaveMappings}
              onBack={() => onOpenChange(false)}
              isLoading={isLoading}
              existingMappings={enrichedMappings}
              accountId={accountId}
              reportId={dataSource?.report_id || undefined}
              hideButtons={true}
            />
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <FileSpreadsheet className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No columns found in this data source.</p>
            </div>
          )}
        </div>

        {isReady && (
          <div className="flex justify-between items-center px-6 py-4 flex-shrink-0 border-t bg-background gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => mappingStepRef.current?.save()}
              disabled={isLoading}
              className="min-w-[120px]"
            >
              {isLoading ? "Saving…" : "Save Mappings"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
