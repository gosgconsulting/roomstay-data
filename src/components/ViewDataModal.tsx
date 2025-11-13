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
import { type DataSource } from "@/lib/sync-utils";

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
      // Get report_id and account_id from data source
      const { data: dsData, error: dsError } = await supabase
        .from('data_sources')
        .select('report_id, reports(account_id)')
        .eq('id', dataSource.id)
        .single();

      if (dsError) throw dsError;

      const reportId = dsData.report_id;
      const accountId = (dsData.reports as any)?.account_id;

      // Fetch dimensions - include both report-scoped and account-scoped dimensions
      // First, fetch all dimensions with matching IDs (regardless of scope)
      const { data: allDimensionsData, error: dimError } = await supabase
        .from('dimensions')
        .select('*')
        .in('id', dimensionIds);

      if (dimError) throw dimError;

      // Filter dimensions to include:
      // 1. Report-scoped dimensions (report_id matches)
      // 2. Account-scoped dimensions (account_id matches and report_id is null)
      // 3. Global dimensions (scope is 'global')
      const dimensionsData = (allDimensionsData || []).filter((dim: any) => {
        // If it's a report-scoped dimension, check report_id
        if (dim.report_id) {
          return dim.report_id === reportId;
        }
        // If it's an account-scoped dimension, check account_id
        if (dim.account_id) {
          return dim.account_id === accountId;
        }
        // Global dimensions are always included
        return dim.scope === 'global';
      });

      // Fetch dimension_data for this data source
      const { data, error } = await supabase
        .from('dimension_data')
        .select('*')
        .eq('data_source_id', dataSource.id)
        .order('row_number', { ascending: true })
        .limit(10000); // Limit to first 10,000 rows for display performance

      if (error) throw error;

      // Calculate formula dimensions for each row
      const processedData = data?.map(row => {
        // Handle null/undefined dimension_values
        const rawDimensionValues = row.dimension_values as Record<string, any> | null | undefined;
        const dimensionValues = rawDimensionValues ? { ...rawDimensionValues } : {};
        
        // Build a map of dimension names to values for formula calculation
        const valuesByName: Record<string, any> = {};
        dimensionsData?.forEach(dim => {
          if (!dim.formula && dimensionValues[dim.id] !== undefined && dimensionValues[dim.id] !== null) {
            valuesByName[dim.name] = dimensionValues[dim.id];
          }
        });

        // Calculate formula dimensions
        dimensionsData?.forEach(dim => {
          if (dim.formula) {
            const calculatedValue = calculateFormula(dim.formula, valuesByName, dimensionsData || []);
            dimensionValues[dim.id] = calculatedValue;
          }
        });

        return {
          ...row,
          dimension_values: dimensionValues
        };
      }) || [];

      // Debug logging
      console.log('[ViewDataModal] Fetched dimensions:', dimensionsData?.length || 0);
      console.log('[ViewDataModal] Fetched data rows:', processedData.length);
      if (processedData.length > 0) {
        console.log('[ViewDataModal] Sample row dimension_values:', processedData[0].dimension_values);
        console.log('[ViewDataModal] Sample row dimension_values keys:', Object.keys(processedData[0].dimension_values || {}));
      }

      setDimensions(dimensionsData || []);
      setDimensionData(processedData);
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

  const calculateFormula = (
    formula: string,
    data: Record<string, any>,
    dimensions: any[]
  ): number | null => {
    if (!formula) return null;
    
    try {
      let expression = formula;
      const dimensionNames = dimensions.map(d => d.name);
      const sortedNames = [...dimensionNames].sort((a, b) => b.length - a.length);
      
      for (const dimName of sortedNames) {
        if (expression.includes(dimName)) {
          const value = data[dimName] || 0;
          expression = expression.replace(
            new RegExp(`\\b${dimName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'),
            String(value)
          );
        }
      }
      
      // Handle percentage notation (e.g., "15%" becomes "0.15")
      expression = expression.replace(/(\d+(?:\.\d+)?)\s*%/g, (match, num) => {
        return `(${parseFloat(num) / 100})`;
      });
      
      // eslint-disable-next-line no-eval
      const result = eval(expression);
      
      if (!isFinite(result)) return null;
      
      return result;
    } catch (error) {
      return null;
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
                    const dimensionValues = (row.dimension_values as Record<string, any>) || {};
                    return (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium text-muted-foreground">
                          {row.row_number}
                        </TableCell>
                        {dimensions.map((dimension) => {
                          const value = dimensionValues[dimension.id];
                          // Format the value based on dimension type
                          let displayValue: string | number = '-';
                          
                          if (value !== null && value !== undefined && value !== '') {
                            try {
                              if (dimension.type === 'percentage') {
                                displayValue = `${parseFloat(String(value)).toFixed(2)}%`;
                              } else if (dimension.type === 'currency') {
                                displayValue = `$${parseFloat(String(value)).toFixed(2)}`;
                              } else if (dimension.type === 'number') {
                                displayValue = parseFloat(String(value)).toLocaleString('en-US', {
                                  minimumFractionDigits: 0,
                                  maximumFractionDigits: 2
                                });
                              } else {
                                // For text, date, etc., just convert to string
                                displayValue = String(value);
                              }
                            } catch (error) {
                              // If parsing fails, just show the raw value as string
                              displayValue = String(value);
                            }
                          }
                          
                          return (
                            <TableCell key={dimension.id}>
                              {displayValue}
                            </TableCell>
                          );
                        })}
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
