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
  sourceDimensionId: string;
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
          sourceDimensionId: m.source_dimension_id || '',
          sourceValue: m.source_value,
          targetDimensionId: m.target_dimension_id,
          targetValue: m.target_value,
        })));
      } else {
        // Start with one empty row
        setMappings([{ sourceDimensionId: '', sourceValue: '', targetDimensionId: '', targetValue: '' }]);
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
    setMappings([...mappings, { sourceDimensionId: '', sourceValue: '', targetDimensionId: '', targetValue: '' }]);
  };

  const removeRow = (index: number) => {
    setMappings(mappings.filter((_, i) => i !== index));
  };

  const updateMapping = (index: number, field: keyof VlookupMapping, value: string) => {
    const updated = [...mappings];
    updated[index] = { ...updated[index], [field]: value };
    setMappings(updated);
  };

  const handleReapply = async () => {
    if (!reportId && !accountId) {
      toast({
        title: "Error",
        description: "No report or account selected",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      console.log('[VLOOKUP] Re-applying mappings...', { reportId, accountId });
      
      const { data: applyResult, error: applyError } = await supabase.functions.invoke(
        'apply-vlookup-mappings',
        {
          body: { reportId, accountId }
        }
      );

      console.log('[VLOOKUP] Re-apply function response:', { applyResult, applyError });

      if (applyError) {
        throw new Error(applyError.message || 'Failed to invoke edge function');
      } else if (applyResult?.success === false) {
        throw new Error(applyResult.error || 'Edge function returned error');
      } else {
        toast({
          title: "Success",
          description: `Applied vlookup mappings to ${applyResult?.rowsUpdated || 0} rows. Account dimension is now available in filters.`,
        });
        
        // Trigger data refresh if callback provided
        if (onSave) {
          onSave();
        }
      }
    } catch (error) {
      console.error('Error re-applying vlookup mappings:', error);
      toast({
        title: "Error",
        description: `Failed to re-apply vlookup mappings: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Filter out empty rows
      const validMappings = mappings.filter(m => 
        m.sourceDimensionId && m.sourceValue.trim() && m.targetDimensionId && m.targetValue.trim()
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
          source_dimension_id: m.sourceDimensionId,
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

      // Apply the mappings to dimension_data with retry logic
      console.log('[VLOOKUP] Applying mappings to dimension_data...', { reportId, accountId });
      
      let retryCount = 0;
      const maxRetries = 3;
      let applySuccess = false;
      
      while (retryCount < maxRetries && !applySuccess) {
        try {
          const { data: applyResult, error: applyError } = await supabase.functions.invoke(
            'apply-vlookup-mappings',
            {
              body: { reportId, accountId }
            }
          );

          console.log('[VLOOKUP] Apply function response:', { applyResult, applyError, attempt: retryCount + 1 });

          if (applyError) {
            throw new Error(applyError.message || 'Failed to invoke edge function');
          } else if (applyResult?.success === false) {
            throw new Error(applyResult.error || 'Edge function returned error');
          } else {
            applySuccess = true;
            console.log('[VLOOKUP] Successfully applied mappings');
            toast({
              title: "Success",
              description: `Applied vlookup mappings to ${applyResult?.rowsUpdated || 0} rows. Account dimension is now available in filters.`,
            });
          }
        } catch (applyErr) {
          retryCount++;
          console.error(`[VLOOKUP] Apply attempt ${retryCount} failed:`, applyErr);
          
          if (retryCount >= maxRetries) {
            toast({
              title: "Warning",
              description: `Mappings saved but failed to apply after ${maxRetries} attempts: ${applyErr instanceof Error ? applyErr.message : 'Unknown error'}. Try reopening the modal and saving again.`,
              variant: "destructive",
            });
          } else {
            // Wait before retrying (exponential backoff)
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
          }
        }
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
                <th className="text-left p-2 font-medium">Source Dimension</th>
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
                    <Select
                      value={mapping.sourceDimensionId}
                      onValueChange={(value) => updateMapping(index, 'sourceDimensionId', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select source" />
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
                        <SelectValue placeholder="Select target" />
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
          <div className="flex gap-2">
            <Button onClick={addRow} variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Add Row
            </Button>
            <Button onClick={handleReapply} variant="secondary" size="sm" disabled={isSaving || isLoading}>
              Re-apply Existing Mappings
            </Button>
          </div>
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
