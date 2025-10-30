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
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState, useEffect } from "react";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface DataSource {
  id: string;
  name: string;
  google_sheets_url: string;
  spreadsheet_id: string;
  tab_name: string;
  header_row: number;
  column_mappings: any[] | null;
}

interface ViewDataModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dataSource: DataSource | null;
}

export const ViewDataModal = ({ 
  open, 
  onOpenChange, 
  dataSource 
}: ViewDataModalProps) => {
  const [dimensionData, setDimensionData] = useState<any[]>([]);
  const [dimensions, setDimensions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open && dataSource) {
      fetchData();
    }
  }, [open, dataSource]);

  const fetchData = async () => {
    if (!dataSource) return;
    
    setIsLoading(true);
    
    try {
      // Get user dimensions
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Fetch dimensions mapped to this data source
      const mappings = dataSource.column_mappings || [];
      const dimensionIds = mappings
        .filter((m: any) => m.visible && m.dimensionId && m.dimensionId !== 'none')
        .map((m: any) => m.dimensionId);

      if (dimensionIds.length === 0) {
        setDimensions([]);
        setDimensionData([]);
        setIsLoading(false);
        return;
      }

      // Fetch dimension details
      const { data: dimensionsData, error: dimError } = await supabase
        .from('dimensions')
        .select('*')
        .in('id', dimensionIds)
        .eq('user_id', user.id);

      if (dimError) throw dimError;

      // Fetch dimension_data for this data source
      const { data, error } = await supabase
        .from('dimension_data')
        .select('*')
        .eq('data_source_id', dataSource.id)
        .order('row_number', { ascending: true })
        .limit(1000); // Limit to first 1000 rows for performance

      if (error) throw error;

      setDimensions(dimensionsData || []);
      setDimensionData(data || []);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[90vw] max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            {dataSource?.name}
          </DialogTitle>
          <DialogDescription>
            Viewing imported data from {dataSource?.name}
            {dimensionData.length > 0 && ` (${dimensionData.length} rows)`}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading data...
            </div>
          ) : dimensionData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No data found for this source
            </div>
          ) : (
            <ScrollArea className="h-[60vh] border rounded-md">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-16">#</TableHead>
                    {dimensions.map((dimension) => (
                      <TableHead key={dimension.id} className="min-w-[120px]">
                        {dimension.name}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dimensionData.map((row) => {
                    const dimensionValues = row.dimension_values as Record<string, any>;
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium text-muted-foreground">
                          {row.row_number}
                        </TableCell>
                        {dimensions.map((dimension) => (
                          <TableCell key={dimension.id}>
                            {dimensionValues[dimension.id] ?? '-'}
                          </TableCell>
                        ))}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </div>

        <div className="flex justify-between items-center border-t pt-4">
          <div className="text-sm text-muted-foreground">
            {dimensionData.length >= 1000 && "Showing first 1,000 rows"}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
