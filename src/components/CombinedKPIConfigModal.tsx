import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "@/hooks/use-toast";

const ALL_KPIS = [
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

interface CombinedKPIConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visibleKPIs: string[];
  onSave: (visibleKPIs: string[]) => void;
}

export const CombinedKPIConfigModal = ({
  open,
  onOpenChange,
  visibleKPIs,
  onSave
}: CombinedKPIConfigModalProps) => {
  const [selectedKPIs, setSelectedKPIs] = useState<string[]>(visibleKPIs);

  useEffect(() => {
    if (open) {
      setSelectedKPIs(visibleKPIs);
    }
  }, [open, visibleKPIs]);

  const handleToggle = (kpiId: string) => {
    setSelectedKPIs(prev =>
      prev.includes(kpiId)
        ? prev.filter(id => id !== kpiId)
        : [...prev, kpiId]
    );
  };

  const handleSelectAll = () => {
    setSelectedKPIs(ALL_KPIS.map(kpi => kpi.id));
  };

  const handleDeselectAll = () => {
    setSelectedKPIs([]);
  };

  const handleSave = () => {
    if (selectedKPIs.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one KPI",
        variant: "destructive"
      });
      return;
    }
    
    onSave(selectedKPIs);
    onOpenChange(false);
    toast({
      title: "KPI Visibility Updated",
      description: `${selectedKPIs.length} KPI${selectedKPIs.length !== 1 ? 's' : ''} selected`
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configure Visible KPIs</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-muted-foreground">
              Select which KPIs to display in the cards
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
              {ALL_KPIS.map((kpi) => (
                <div key={kpi.id} className="flex items-center space-x-2 p-2 rounded hover:bg-muted">
                  <Checkbox
                    id={kpi.id}
                    checked={selectedKPIs.includes(kpi.id)}
                    onCheckedChange={() => handleToggle(kpi.id)}
                  />
                  <Label htmlFor={kpi.id} className="flex-1 cursor-pointer">
                    {kpi.label}
                  </Label>
                </div>
              ))}
            </div>
          </ScrollArea>
          
          <p className="text-xs text-muted-foreground">
            {selectedKPIs.length} of {ALL_KPIS.length} KPIs selected
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
