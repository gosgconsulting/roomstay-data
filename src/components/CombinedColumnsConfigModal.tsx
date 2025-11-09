import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";

const ALL_COLUMNS = [
  { id: "date", label: "Date", fixed: true },
  { id: "impressions", label: "Impressions" },
  { id: "clicks", label: "Clicks" },
  { id: "ctr", label: "CTR" },
  { id: "conversions", label: "Conversions" },
  { id: "conversionRate", label: "Conversion Rate" },
  { id: "cpc", label: "CPC" },
  { id: "cost", label: "Cost" },
  { id: "revenue", label: "Revenue" },
  { id: "roas", label: "ROAS" },
  { id: "costOfSale", label: "Cost of Sale" }
];

interface CombinedColumnsConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visibleColumns: string[];
  onSave: (visibleColumns: string[]) => void;
}

export const CombinedColumnsConfigModal = ({
  open,
  onOpenChange,
  visibleColumns,
  onSave
}: CombinedColumnsConfigModalProps) => {
  const [selectedColumns, setSelectedColumns] = useState<string[]>(visibleColumns);

  useEffect(() => {
    if (open) {
      setSelectedColumns(visibleColumns);
    }
  }, [open, visibleColumns]);

  const handleToggle = (columnId: string) => {
    const column = ALL_COLUMNS.find(col => col.id === columnId);
    if (column?.fixed) return; // Can't toggle fixed columns
    
    setSelectedColumns(prev =>
      prev.includes(columnId)
        ? prev.filter(id => id !== columnId)
        : [...prev, columnId]
    );
  };

  const handleSelectAll = () => {
    setSelectedColumns(ALL_COLUMNS.map(col => col.id));
  };

  const handleDeselectAll = () => {
    const fixedColumns = ALL_COLUMNS.filter(col => col.fixed).map(col => col.id);
    setSelectedColumns(fixedColumns);
  };

  const handleSave = () => {
    const nonFixedColumns = selectedColumns.filter(id => 
      !ALL_COLUMNS.find(col => col.id === id && col.fixed)
    );
    
    if (nonFixedColumns.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one metric column",
        variant: "destructive"
      });
      return;
    }
    
    onSave(selectedColumns);
    onOpenChange(false);
    toast({
      title: "Column Visibility Updated",
      description: `${selectedColumns.length} column${selectedColumns.length !== 1 ? 's' : ''} visible`
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configure Visible Columns</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Select which columns to display in the table
            </p>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                All
              </Button>
              <Button variant="ghost" size="sm" onClick={handleDeselectAll}>
                None
              </Button>
            </div>
          </div>

          <ScrollArea className="h-[300px] pr-4">
            <div className="space-y-3">
              {ALL_COLUMNS.map((column) => (
                <div 
                  key={column.id} 
                  className={cn(
                    "flex items-center space-x-2 p-2 rounded",
                    column.fixed ? "opacity-50 bg-muted" : "hover:bg-muted"
                  )}
                >
                  <Checkbox
                    id={column.id}
                    checked={selectedColumns.includes(column.id)}
                    onCheckedChange={() => handleToggle(column.id)}
                    disabled={column.fixed}
                  />
                  <Label 
                    htmlFor={column.id} 
                    className={cn(
                      "flex-1",
                      column.fixed ? "cursor-not-allowed" : "cursor-pointer"
                    )}
                  >
                    {column.label}
                    {column.fixed && <span className="text-xs ml-2">(Always visible)</span>}
                  </Label>
                </div>
              ))}
            </div>
          </ScrollArea>
          
          <p className="text-xs text-muted-foreground">
            {selectedColumns.length} of {ALL_COLUMNS.length} columns selected
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const cn = (...classes: (string | boolean | undefined)[]) => {
  return classes.filter(Boolean).join(' ');
};
