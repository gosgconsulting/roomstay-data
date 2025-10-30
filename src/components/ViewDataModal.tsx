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
  const [sheetData, setSheetData] = useState<any[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open && dataSource) {
      fetchSheetData();
    }
  }, [open, dataSource]);

  const fetchSheetData = async () => {
    if (!dataSource) return;
    
    setIsLoading(true);
    
    try {
      const { data, error } = await supabase
        .from('sheet_data')
        .select('*')
        .eq('data_source_id', dataSource.id)
        .order('row_number', { ascending: true })
        .limit(1000); // Limit to first 1000 rows for performance

      if (error) throw error;

      if (data && data.length > 0) {
        // Extract unique columns from all rows
        const allColumns = new Set<string>();
        data.forEach((row) => {
          Object.keys(row.row_data).forEach((key) => allColumns.add(key));
        });
        
        setColumns(Array.from(allColumns));
        setSheetData(data);
      } else {
        setColumns([]);
        setSheetData([]);
      }
    } catch (error) {
      console.error("Error fetching sheet data:", error);
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
            Viewing imported data from {dataSource?.tab_name}
            {sheetData.length > 0 && ` (${sheetData.length} rows)`}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading data...
            </div>
          ) : sheetData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No data found for this source
            </div>
          ) : (
            <ScrollArea className="h-[60vh] border rounded-md">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-16">#</TableHead>
                    {columns.map((column) => (
                      <TableHead key={column} className="min-w-[120px]">
                        {column}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sheetData.map((row, index) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium text-muted-foreground">
                        {row.row_number}
                      </TableCell>
                      {columns.map((column) => (
                        <TableCell key={column}>
                          {row.row_data[column] ?? '-'}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </div>

        <div className="flex justify-between items-center border-t pt-4">
          <div className="text-sm text-muted-foreground">
            {sheetData.length >= 1000 && "Showing first 1,000 rows"}
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
