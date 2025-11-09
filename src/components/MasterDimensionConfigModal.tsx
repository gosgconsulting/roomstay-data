import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Dimension {
  id: string;
  name: string;
  type: string;
  scope: string;
}

interface MasterDimensionConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId?: string;
  currentMasterDimension: string | null;
  onSave: (dimensionId: string | null) => void;
}

export const MasterDimensionConfigModal = ({
  open,
  onOpenChange,
  accountId,
  currentMasterDimension,
  onSave
}: MasterDimensionConfigModalProps) => {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [selectedDimension, setSelectedDimension] = useState<string | null>(currentMasterDimension);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      loadDimensions();
      setSelectedDimension(currentMasterDimension);
    }
  }, [open, currentMasterDimension]);

  const loadDimensions = async () => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from('dimensions')
        .select('id, name, type, scope')
        .eq('type', 'text')
        .in('scope', ['global', 'account']);

      if (accountId) {
        query = query.or(`account_id.eq.${accountId},scope.eq.global`);
      } else {
        query = query.eq('scope', 'global');
      }

      const { data, error } = await query.order('name');

      if (error) throw error;

      const dimensionMap = new Map<string, Dimension>();
      (data || []).forEach(dim => {
        if (!dim || !dim.id || !dim.name || !dim.type || !dim.scope) return;
        const existing = dimensionMap.get(dim.name);
        if (!existing || (dim.scope === 'account' && existing.scope === 'global')) {
          dimensionMap.set(dim.name, dim);
        }
      });

      const uniqueDimensions = Array.from(dimensionMap.values()).sort((a, b) => 
        a.name.localeCompare(b.name)
      );
      setDimensions(uniqueDimensions);
    } catch (error) {
      console.error('[MASTER-DIM-CONFIG] Error loading dimensions:', error);
      toast({
        title: "Error",
        description: "Failed to load dimensions",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = () => {
    onSave(selectedDimension);
    onOpenChange(false);
    toast({
      title: "Master Dimension Updated",
      description: selectedDimension 
        ? `Master dimension set to ${dimensions.find(d => d.id === selectedDimension)?.name}`
        : "Master dimension cleared"
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Configure Master Dimension</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            Select the dimension to use for grouping and analyzing data across all reports.
          </p>
          
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="animate-pulse h-10 bg-muted rounded"></div>
              ))}
            </div>
          ) : (
            <RadioGroup value={selectedDimension || ""} onValueChange={setSelectedDimension}>
              <div className="flex items-center space-x-2 p-2 rounded hover:bg-muted">
                <RadioGroupItem value="" id="none" />
                <Label htmlFor="none" className="flex-1 cursor-pointer">
                  None (No master dimension)
                </Label>
              </div>
              {dimensions.map((dimension) => (
                <div key={dimension.id} className="flex items-center space-x-2 p-2 rounded hover:bg-muted">
                  <RadioGroupItem value={dimension.id} id={dimension.id} />
                  <Label htmlFor={dimension.id} className="flex-1 cursor-pointer">
                    {dimension.name}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          )}
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
