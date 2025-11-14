import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { loadDimensionsForUser } from "@/lib/dimensionLoader";

interface VlookupMapping {
  id?: string;
  sourceValue: string;
  targetDimensionId: string;
  targetValue: string;
}

interface VlookupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId?: string;
  accountId?: string;
  onSave?: () => void;
}

export function VlookupModal({ open, onOpenChange, reportId, accountId, onSave }: VlookupModalProps) {
  const [mappings, setMappings] = useState<VlookupMapping[]>([]);
  const [dimensions, setDimensions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open, reportId]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load dimensions
      const dims = await loadDimensionsForUser(user.id, reportId);
      setDimensions(dims.filter(d => d.type !== 'date'));

      // Load existing mappings
      const query = supabase
        .from('dimension_mappings' as any)
        .select('*')
        .eq('user_id', user.id);

      if (reportId) {
        query.eq('report_id', reportId);
      } else if (accountId) {
        query.eq('account_id', accountId);
      }

      const { data, error } = await query;

      if (error) throw error;

      if (data && data.length > 0) {
        setMappings(data.map((m: any) => ({
          id: m.id,
          sourceValue: m.source_value,
          targetDimensionId: m.target_dimension_id,
          targetValue: m.target_value,
        })));
      } else {
        // Start with one empty row
        setMappings([{ sourceValue: '', targetDimensionId: '', targetValue: '' }]);
      }
    } catch (error) {
      console.error('Error loading vlookup data:', error);
      toast({
        title: "Error",
        description: "Failed to load vlookup mappings",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const addRow = () => {
    setMappings([...mappings, { sourceValue: '', targetDimensionId: '', targetValue: '' }]);
  };

  const removeRow = (index: number) => {
    setMappings(mappings.filter((_, i) => i !== index));
  };

  const updateMapping = (index: number, field: keyof VlookupMapping, value: string) => {
    const updated = [...mappings];
    updated[index] = { ...updated[index], [field]: value };
    setMappings(updated);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Filter out empty rows
      const validMappings = mappings.filter(m => 
        m.sourceValue.trim() && m.targetDimensionId && m.targetValue.trim()
      );

      // Delete existing mappings
      const deleteQuery = supabase
        .from('dimension_mappings' as any)
        .delete()
        .eq('user_id', user.id);

      if (reportId) {
        deleteQuery.eq('report_id', reportId);
      } else if (accountId) {
        deleteQuery.eq('account_id', accountId);
      }

      const { error: deleteError } = await deleteQuery;
      if (deleteError) throw deleteError;

      // Insert new mappings
      if (validMappings.length > 0) {
        const insertData = validMappings.map(m => ({
          user_id: user.id,
          report_id: reportId || null,
          account_id: accountId || null,
          source_value: m.sourceValue.trim(),
          target_dimension_id: m.targetDimensionId,
          target_value: m.targetValue.trim(),
        }));

        const { error: insertError } = await supabase
          .from('dimension_mappings' as any)
          .insert(insertData);

        if (insertError) throw insertError;
      }

      toast({
        title: "Success",
        description: `Saved ${validMappings.length} vlookup mappings`,
      });

      // Apply the mappings to dimension_data
      console.log('[VLOOKUP] Applying mappings to dimension_data...', { reportId, accountId });
      try {
        const { data: applyResult, error: applyError } = await supabase.functions.invoke(
          'apply-vlookup-mappings',
          {
            body: { reportId, accountId },
          }
        );

        console.log('[VLOOKUP] Apply function response:', { applyResult, applyError });

        if (applyError) {
          console.error('[VLOOKUP] Error applying mappings:', applyError);
          toast({
            title: "Warning",
            description: `Mappings saved but failed to apply: ${applyError.message || 'Unknown error'}`,
            variant: "destructive",
          });
        } else if (applyResult?.success === false) {
          console.error('[VLOOKUP] Apply function returned error:', applyResult.error);
          toast({
            title: "Warning",
            description: `Mappings saved but failed to apply: ${applyResult.error || 'Unknown error'}`,
            variant: "destructive",
          });
        } else {
          console.log('[VLOOKUP] Successfully applied mappings');
          toast({
            title: "Success",
            description: `Applied vlookup mappings to ${applyResult?.rowsUpdated || 0} rows`,
          });
        }
      } catch (applyErr) {
        console.error('[VLOOKUP] Error calling apply function:', applyErr);
        toast({
          title: "Warning",
          description: `Mappings saved but failed to apply: ${applyErr instanceof Error ? applyErr.message : 'Unknown error'}`,
          variant: "destructive",
        });
      }

      // Trigger data refresh if callback provided
      if (onSave) {
        onSave();
      }

      onOpenChange(false);
    } catch (error) {
      console.error('Error saving vlookup mappings:', error);
      toast({
        title: "Error",
        description: "Failed to save vlookup mappings",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Vlookup - Map Dimension Values</DialogTitle>
        </DialogHeader>

        <div className="text-sm text-muted-foreground mb-4">
          Map multiple values to a single dimension value. For example, map "Hotel A", "Hotel B", "Hotel C" all to "Brady" in the Account dimension.
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="border-b">
                <th className="text-left p-2 font-medium">Original Value</th>
                <th className="text-left p-2 font-medium">Target Dimension</th>
                <th className="text-left p-2 font-medium">Mapped Value</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((mapping, index) => (
                <tr key={index} className="border-b">
                  <td className="p-2">
                    <Input
                      value={mapping.sourceValue}
                      onChange={(e) => updateMapping(index, 'sourceValue', e.target.value)}
                      placeholder="e.g., Hotel A"
                      className="w-full"
                    />
                  </td>
                  <td className="p-2">
                    <Select
                      value={mapping.targetDimensionId}
                      onValueChange={(value) => updateMapping(index, 'targetDimensionId', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select dimension" />
                      </SelectTrigger>
                      <SelectContent>
                        {dimensions.map(dim => (
                          <SelectItem key={dim.id} value={dim.id}>
                            {dim.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-2">
                    <Input
                      value={mapping.targetValue}
                      onChange={(e) => updateMapping(index, 'targetValue', e.target.value)}
                      placeholder="e.g., Brady"
                      className="w-full"
                    />
                  </td>
                  <td className="p-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeRow(index)}
                      disabled={mappings.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-between items-center pt-4 border-t">
          <Button onClick={addRow} variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Row
          </Button>
          <div className="flex gap-2">
            <Button onClick={() => onOpenChange(false)} variant="outline">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save Mappings'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
