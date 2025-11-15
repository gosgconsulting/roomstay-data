import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import MultiSelect, { MultiSelectOption } from "@/components/MultiSelect";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { loadDimensionsForUser } from "@/lib/dimensionLoader";

interface VlookupMapping {
  id?: string;
  sourceDimensionId: string;
  sourceValues: string[];
  targetDimensionName: string;
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
  const [dimensionValueOptions, setDimensionValueOptions] = useState<Record<string, MultiSelectOption[]>>({});
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

      // Load dimensions (exclude date and vlookup dimensions)
      const dims = await loadDimensionsForUser(user.id, reportId);
      const filteredDimensions = dims.filter(d => d.type !== 'date' && d.type !== 'vlookup');
      setDimensions(filteredDimensions);

      // Load dimension values for source dimensions
      if (reportId) {
        const { data: dimData, error: dimErr } = await supabase
          .from('dimension_data')
          .select('dimension_values')
          .eq('report_id', reportId)
          .limit(1000);
        
        if (!dimErr && dimData) {
          const dimIds = new Set<string>(filteredDimensions.map((d: any) => d.id));
          const valuesMap: Record<string, Set<string>> = {};
          
          dimData.forEach((row: any) => {
            const dv = row.dimension_values as Record<string, any>;
            if (!dv) return;
            
            Object.keys(dv).forEach((key) => {
              if (!dimIds.has(key)) return;
              const val = dv[key];
              if (val === undefined || val === null || val === "") return;
              if (!valuesMap[key]) valuesMap[key] = new Set<string>();
              valuesMap[key].add(String(val));
            });
          });
          
          const optionsMap: Record<string, MultiSelectOption[]> = {};
          Object.entries(valuesMap).forEach(([k, set]) => {
            optionsMap[k] = Array.from(set).sort((a, b) => a.localeCompare(b)).map(v => ({ label: v, value: v }));
          });
          setDimensionValueOptions(optionsMap);
        }
      }

      // Load existing mappings
      let query = supabase
        .from('dimension_mappings')
        .select('*')
        .eq('user_id', user.id);

      if (reportId) {
        query = query.eq('report_id', reportId);
      } else if (accountId) {
        query = query.eq('account_id', accountId);
      }

      const { data, error } = await query;

      if (error || !data || data.length === 0) {
        setMappings([{ sourceDimensionId: '', sourceValues: [], targetDimensionName: '', targetValue: '' }]);
      } else {
        setMappings(data.map((m: any) => ({
          id: m.id,
          sourceDimensionId: m.source_dimension_id || '',
          sourceValues: m.source_value ? [m.source_value] : [],
          targetDimensionName: m.target_dimension_name || '',
          targetValue: m.target_value,
        })));
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
    setMappings([...mappings, { sourceDimensionId: '', sourceValues: [], targetDimensionName: '', targetValue: '' }]);
  };

  const removeRow = (index: number) => {
    setMappings(mappings.filter((_, i) => i !== index));
  };

  const updateMapping = (index: number, field: keyof VlookupMapping, value: any) => {
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
        m.sourceDimensionId && 
        m.sourceValues && 
        m.sourceValues.length > 0 && 
        m.targetDimensionName && 
        m.targetDimensionName.trim() && 
        m.targetValue.trim()
      );

      if (validMappings.length === 0) {
        toast({
          title: "No valid mappings",
          description: "Please add at least one complete mapping",
          variant: "destructive",
        });
        return;
      }

      // Create target dimensions
      const uniqueTargetNames = [...new Set(validMappings.map(m => m.targetDimensionName!.trim()))];
      const createdDimensions: Record<string, string> = {};

      for (const targetName of uniqueTargetNames) {
        // Check if dimension already exists
        const { data: existingDim } = await supabase
          .from('dimensions')
          .select('id')
          .eq('name', targetName)
          .eq('user_id', user.id)
          .maybeSingle();

        if (existingDim) {
          createdDimensions[targetName] = existingDim.id;
        } else {
          // Create new dimension as text type
          const { data: newDim, error: dimError } = await supabase
            .from('dimensions')
            .insert({
              name: targetName,
              type: 'text',
              user_id: user.id,
              report_id: reportId || null,
              account_id: accountId || null,
              scope: reportId ? 'custom' : 'account'
            })
            .select('id')
            .single();

          if (dimError) throw dimError;
          createdDimensions[targetName] = newDim.id;
        }
      }

      // Delete existing mappings
      const deleteQuery = supabase
        .from('dimension_mappings')
        .delete()
        .eq('user_id', user.id);

      if (reportId) {
        deleteQuery.eq('report_id', reportId);
      } else if (accountId) {
        deleteQuery.eq('account_id', accountId);
      }

      await deleteQuery;

      // Insert new mappings
      if (validMappings.length > 0) {
        const insertData = validMappings.flatMap(m => {
          const targetDimensionId = createdDimensions[m.targetDimensionName!.trim()];
          return m.sourceValues.map((sv) => ({
            user_id: user.id,
            report_id: reportId || null,
            account_id: accountId || null,
            source_dimension_id: m.sourceDimensionId,
            source_value: String(sv).trim(),
            target_dimension_id: targetDimensionId,
            target_dimension_name: m.targetDimensionName!.trim(),
            target_value: m.targetValue.trim(),
          }));
        });

        const { error: insertError } = await supabase
          .from('dimension_mappings')
          .insert(insertData);

        if (insertError) throw insertError;
      }

      toast({
        title: "Success",
        description: `Created ${uniqueTargetNames.length} dimension(s) and saved ${validMappings.reduce((acc, m) => acc + m.sourceValues.length, 0)} mappings`,
      });

      // Apply mappings to data
      const { error: applyError } = await supabase.functions.invoke(
        'apply-vlookup-mappings',
        { body: { reportId, accountId } }
      );

      if (applyError) {
        console.warn('Failed to apply mappings:', applyError);
        toast({
          title: "Warning",
          description: "Dimensions created and mappings saved. Mappings will be applied when data loads.",
          variant: "destructive",
        });
      }

      if (onSave) onSave();
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
          <DialogTitle>Create Pivot Dimensions</DialogTitle>
          <p className="text-sm text-muted-foreground mt-2">
            Map multiple values to create new text dimensions for grouping and analysis.
          </p>
        </DialogHeader>

        <div className="text-sm text-muted-foreground mb-4">
          Example: Map "Hotel A", "Hotel B", "Hotel C" → "Brady" to create a new Account dimension.
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="border-b">
                <th className="text-left p-2 font-medium">Source Dimension</th>
                <th className="text-left p-2 font-medium">Values to Map</th>
                <th className="text-left p-2 font-medium">New Dimension Name</th>
                <th className="text-left p-2 font-medium">Grouped Value</th>
                <th className="w-12"></th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((mapping, index) => (
                <tr key={index} className="border-b">
                  <td className="p-2">
                    <Select
                      value={mapping.sourceDimensionId}
                      onValueChange={(value) => {
                        const updated = { ...mapping, sourceDimensionId: value, sourceValues: [] };
                        const next = [...mappings];
                        next[index] = updated;
                        setMappings(next);
                      }}
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
                    <MultiSelect
                      options={dimensionValueOptions[mapping.sourceDimensionId] || []}
                      values={mapping.sourceValues || []}
                      onChange={(vals) => updateMapping(index, 'sourceValues', vals)}
                      placeholder="Select values..."
                      disabled={!mapping.sourceDimensionId || isLoading}
                    />
                  </td>
                  <td className="p-2">
                    <Input
                      value={mapping.targetDimensionName || ''}
                      onChange={(e) => updateMapping(index, 'targetDimensionName', e.target.value)}
                      placeholder="e.g., Account"
                      className="w-full"
                    />
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
              {isSaving ? 'Saving...' : 'Create Dimensions'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}