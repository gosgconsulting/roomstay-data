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
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button as Button2 } from "@/components/ui/button";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface VlookupMapping {
  id?: string;
  sourceDimensionId: string;
  sourceValues: string[];
  targetDimensionId: string;
  targetDimensionName?: string;
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
  const [vlookupDimensions, setVlookupDimensions] = useState<any[]>([]);
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

      // Load existing vlookup dimensions
      const { data: vlookupDims } = await supabase
        .from('dimensions')
        .select('id, name')
        .eq('user_id', user.id)
        .eq('type', 'vlookup')
        .order('name');
      
      setVlookupDimensions(vlookupDims || []);

      // Preload dimension values using same logic as FiltersBar
      let rows: any[] = [];
      if (reportId) {
        const { data: dimData, error: dimErr } = await (supabase as any)
          .from('dimension_data')
          .select('dimension_values')
          .eq('report_id', reportId)
          .limit(10000); // Match FiltersBar limit
        if (dimErr) {
          console.error('[VLOOKUP] Error loading dimension values:', dimErr);
        } else {
          rows = dimData || [];
        }
      }
      
      const dimIds = new Set<string>(dims.filter(d => d.type !== 'date').map((d: any) => d.id));
      const valuesMap: Record<string, Set<string>> = {};
      rows.forEach((r) => {
        const dv = r.dimension_values as Record<string, any>;
        if (!dv) return;
        Object.keys(dv).forEach((k) => {
          if (!dimIds.has(k)) return;
          const val = dv[k];
          if (val === undefined || val === null || val === "") return;
          if (!valuesMap[k]) valuesMap[k] = new Set<string>();
          valuesMap[k].add(String(val));
        });
      });
      
      const optionsMap: Record<string, MultiSelectOption[]> = {};
      Object.entries(valuesMap).forEach(([k, set]) => {
        const opts = Array.from(set).sort((a, b) => a.localeCompare(b)).map(v => ({ label: v, value: v }));
        optionsMap[k] = opts;
      });
      setDimensionValueOptions(optionsMap);

      // Load existing mappings (resilient: don't fail the modal on error)
      let mappingsData: any[] | null = null;
      let mappingsErr: any = null;
      try {
        let query = (supabase as any)
          .from('dimension_mappings')
          .select('*')
          .eq('user_id', user.id);

        if (reportId) {
          query = query.eq('report_id', reportId);
        } else if (accountId) {
          query = query.eq('account_id', accountId);
        }

        const { data, error } = await query;
        mappingsData = data;
        mappingsErr = error;
      } catch (e) {
        mappingsErr = e;
      }

      if (mappingsErr) {
        console.warn('[VLOOKUP] Could not load existing mappings. Defaulting to empty row.', mappingsErr);
        setMappings([{ sourceDimensionId: '', sourceValues: [], targetDimensionId: '', targetValue: '' }]);
      } else if (mappingsData && mappingsData.length > 0) {
        setMappings(mappingsData.map((m: any) => ({
          id: m.id,
          sourceDimensionId: m.source_dimension_id || '',
          sourceValues: m.source_value ? [m.source_value] : [],
          targetDimensionId: m.target_dimension_id,
          targetDimensionName: m.target_dimension_name || '',
          targetValue: m.target_value,
        })));
      } else {
        // Start with one empty row
        setMappings([{ sourceDimensionId: '', sourceValues: [], targetDimensionId: '', targetValue: '' }]);
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
    setMappings([...mappings, { sourceDimensionId: '', sourceValues: [], targetDimensionId: '', targetValue: '' }]);
  };

  const removeRow = (index: number) => {
    setMappings(mappings.filter((_, i) => i !== index));
  };

  const updateMapping = (index: number, field: keyof VlookupMapping, value: any) => {
    const updated = [...mappings];
    updated[index] = { ...updated[index], [field]: value };
    setMappings(updated);
  };

  const createDimensionImmediately = async (dimensionName: string, index: number) => {
    try {
      console.log('Creating dimension immediately:', dimensionName);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('No user found');
        return;
      }

      // Check if dimension already exists
      console.log('Checking if dimension exists:', dimensionName);
      const { data: existingDim } = await supabase
        .from('dimensions')
        .select('id')
        .eq('name', dimensionName.trim())
        .eq('user_id', user.id)
        .eq('type', 'vlookup')
        .maybeSingle();

      if (existingDim) {
        console.log('Dimension already exists:', existingDim);
        // Dimension already exists, just update the mapping
        updateMapping(index, 'targetDimensionName', dimensionName);
        toast({
          title: "Dimension exists",
          description: `Using existing dimension "${dimensionName}"`,
        });
      } else {
        console.log('Creating new dimension:', dimensionName);
        // Create new vlookup dimension
        const { data: newDim, error: dimError } = await supabase
          .from('dimensions')
          .insert({
            name: dimensionName.trim(),
            type: 'vlookup',
            user_id: user.id,
            report_id: reportId || null,
            account_id: accountId || null,
            scope: reportId ? 'custom' : 'account'
          })
          .select('id')
          .single();

        if (dimError) {
          console.error('Error creating vlookup dimension:', dimError);
          toast({
            title: "Error",
            description: `Failed to create dimension "${dimensionName}": ${dimError.message}`,
            variant: "destructive",
          });
          return;
        }

        console.log('Dimension created successfully:', newDim);
        // Update the mapping with the new dimension name
        updateMapping(index, 'targetDimensionName', dimensionName);
        
        // Refresh the vlookup dimensions list
        const { data: updatedVlookupDims } = await supabase
          .from('dimensions')
          .select('id, name')
          .eq('user_id', user.id)
          .eq('type', 'vlookup')
          .order('name');
        
        setVlookupDimensions(updatedVlookupDims || []);

        toast({
          title: "Dimension created",
          description: `Created new dimension "${dimensionName}"`,
        });
      }

      // Close the popover
      document.body.click();
    } catch (error) {
      console.error('Error creating dimension immediately:', error);
      toast({
        title: "Error",
        description: "Failed to create dimension",
        variant: "destructive",
      });
    }
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
      console.log('[VLOOKUP-MODAL] Re-applying mappings...', { reportId, accountId });
      
      // Add timeout wrapper for edge function call
      const invokeWithTimeout = async () => {
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout after 5 minutes')), 5 * 60 * 1000)
        );
        
        const invokePromise = supabase.functions.invoke(
          'apply-vlookup-mappings',
          {
            body: { reportId, accountId }
          }
        );
        
        return Promise.race([invokePromise, timeoutPromise]) as Promise<{ data: any; error: any }>;
      };

      const { data: applyResult, error: applyError } = await invokeWithTimeout();

      console.log('[VLOOKUP-MODAL] Re-apply function response:', { applyResult, applyError });

      if (applyError) {
        console.error('[VLOOKUP-MODAL] Edge function invocation error:', applyError);
        const errorDetails = {
          message: applyError.message,
          status: applyError.status,
          context: applyError.context,
          name: applyError.name,
          full: JSON.stringify(applyError, Object.getOwnPropertyNames(applyError))
        };
        console.error('[VLOOKUP-MODAL] Full error details:', errorDetails);
        
        // Provide more specific error messages
        let errorMessage = 'Failed to send a request to the Edge Function';
        if (applyError.message?.includes('timeout') || applyError.message?.includes('Timeout')) {
          errorMessage = 'Edge function timed out. The operation may be processing a large dataset. Please try again or contact support.';
        } else if (applyError.message?.includes('network') || applyError.message?.includes('fetch')) {
          errorMessage = 'Network error connecting to edge function. Please check your connection and try again.';
        } else if (applyError.status === 404) {
          errorMessage = 'Edge function not found. Please ensure the function is deployed.';
        } else if (applyError.status === 401 || applyError.status === 403) {
          errorMessage = 'Authentication error. Please refresh the page and try again.';
        } else if (applyError.message) {
          errorMessage = applyError.message;
        }
        
        throw new Error(errorMessage);
      }
      
      if (applyResult?.success === false) {
        console.error('[VLOOKUP-MODAL] Edge function returned error:', applyResult);
        throw new Error(applyResult.error || applyResult.details || 'Unknown error from edge function');
      }
      
      toast({
        title: "Success",
        description: `Applied vlookup mappings to ${applyResult?.rowsUpdated || 0} rows. Account dimension is now available in filters.`,
      });
      
      // Trigger data refresh if callback provided
      if (onSave) {
        onSave();
      }
    } catch (error) {
      console.error('[VLOOKUP-MODAL] Error re-applying vlookup mappings:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: "Error",
        description: `Failed to re-apply vlookup mappings: ${errorMessage}`,
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
        m.sourceDimensionId && m.sourceValues && m.sourceValues.length > 0 && m.targetDimensionName && m.targetDimensionName.trim() && m.targetValue.trim()
      );

      if (validMappings.length === 0) {
        toast({
          title: "No valid mappings",
          description: "Please add at least one complete mapping",
          variant: "destructive",
        });
        return;
      }

      // Create new vlookup dimensions for unique target dimension names
      const uniqueTargetNames = [...new Set(validMappings.map(m => m.targetDimensionName!.trim()))];
      const createdDimensions: Record<string, string> = {}; // name -> id

      for (const targetName of uniqueTargetNames) {
        // Check if dimension already exists (might have been created earlier)
        const { data: existingDim } = await supabase
          .from('dimensions')
          .select('id')
          .eq('name', targetName)
          .eq('user_id', user.id)
          .eq('type', 'vlookup')
          .maybeSingle();

        if (existingDim) {
          createdDimensions[targetName] = existingDim.id;
        } else {
          // Create new vlookup dimension if it doesn't exist
          const { data: newDim, error: dimError } = await supabase
            .from('dimensions')
            .insert({
              name: targetName,
              type: 'vlookup',
              user_id: user.id,
              report_id: reportId || null,
              account_id: accountId || null,
              scope: reportId ? 'custom' : 'account'
            })
            .select('id')
            .single();

          if (dimError) {
            console.error('Error creating vlookup dimension:', dimError);
            throw new Error(`Failed to create dimension "${targetName}": ${dimError.message}`);
          }

          createdDimensions[targetName] = newDim.id;
        }
      }

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

      // Insert new mappings with created dimension IDs
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
          .from('dimension_mappings' as any)
          .insert(insertData);

        if (insertError) throw insertError;
      }

      toast({
        title: "Success",
        description: `Created ${uniqueTargetNames.length} vlookup dimension(s) and saved ${validMappings.reduce((acc, m) => acc + m.sourceValues.length, 0)} mappings`,
      });

      // Apply the mappings to dimension_data with retry logic
      console.log('[VLOOKUP] Applying mappings to dimension_data...', { reportId, accountId });
      
      let retryCount = 0;
      const maxRetries = 3;
      let applySuccess = false;
      
      while (retryCount < maxRetries && !applySuccess) {
        try {
          // Add timeout wrapper for edge function call
          const invokeWithTimeout = async () => {
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Request timeout after 5 minutes')), 5 * 60 * 1000)
            );
            
            const invokePromise = supabase.functions.invoke(
              'apply-vlookup-mappings',
              {
                body: { reportId, accountId }
              }
            );
            
            return Promise.race([invokePromise, timeoutPromise]) as Promise<{ data: any; error: any }>;
          };

          const { data: applyResult, error: applyError } = await invokeWithTimeout();

          console.log('[VLOOKUP] Apply function response:', { applyResult, applyError, attempt: retryCount + 1 });

          if (applyError) {
            const errorDetails = {
              message: applyError.message,
              status: applyError.status,
              context: applyError.context,
              name: applyError.name,
              full: JSON.stringify(applyError, Object.getOwnPropertyNames(applyError))
            };
            console.error(`[VLOOKUP] Apply attempt ${retryCount + 1} error details:`, errorDetails);
            
            // Provide more specific error messages
            let errorMessage = 'Failed to send a request to the Edge Function';
            if (applyError.message?.includes('timeout') || applyError.message?.includes('Timeout')) {
              errorMessage = 'Edge function timed out. The operation may be processing a large dataset.';
            } else if (applyError.message?.includes('network') || applyError.message?.includes('fetch')) {
              errorMessage = 'Network error connecting to edge function.';
            } else if (applyError.status === 404) {
              errorMessage = 'Edge function not found. Please ensure the function is deployed.';
            } else if (applyError.status === 401 || applyError.status === 403) {
              errorMessage = 'Authentication error. Please refresh the page.';
            } else if (applyError.message) {
              errorMessage = applyError.message;
            }
            
            throw new Error(errorMessage);
          } else if (applyResult?.success === false) {
            throw new Error(applyResult.error || 'Edge function returned error');
          } else {
            applySuccess = true;
            console.log('[VLOOKUP] Successfully applied mappings');
            toast({
              title: "Success",
              description: `Applied vlookup mappings to ${applyResult?.rowsUpdated || 0} rows. New dimensions are now available in filters.`,
            });
          }
        } catch (applyErr) {
          retryCount++;
          console.error(`[VLOOKUP] Apply attempt ${retryCount} failed:`, applyErr);
          
          if (retryCount >= maxRetries) {
            const errorMsg = applyErr instanceof Error ? applyErr.message : 'Unknown error';
            toast({
              title: "Warning",
              description: `Dimensions created and mappings saved but failed to apply after ${maxRetries} attempts: ${errorMsg}. Don't worry - your mappings are saved and will be automatically applied when you load data in the performance table.`,
              variant: "destructive",
            });
          } else {
            // Wait before retrying (exponential backoff)
            const delay = 2000 * retryCount; // Increased delay: 2s, 4s, 6s
            console.log(`[VLOOKUP] Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
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
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: "Error",
        description: `Failed to save vlookup mappings: ${errorMessage}`,
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
          <p className="text-sm text-muted-foreground mt-2">
            Map multiple values to a single dimension value. Mappings are automatically applied when data is loaded, 
            so even if the apply function fails, your mappings will still work in the performance table.
          </p>
        </DialogHeader>

        <div className="text-sm text-muted-foreground mb-4">
          Map multiple values to a single dimension value. For example, map "Hotel A", "Hotel B", "Hotel C" all to "Brady" in the Account dimension.
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="border-b">
                <th className="text-left p-2 font-medium">Source Dimension</th>
                <th className="text-left p-2 font-medium">Dimension Value</th>
                <th className="text-left p-2 font-medium">Dimension Name</th>
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
                      onValueChange={(value) => {
                        // When changing source dimension, clear previously selected values
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
                      searchPlaceholder="Search values..."
                      disabled={!mapping.sourceDimensionId || isLoading}
                    />
                  </td>
                  <td className="p-2">
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="w-full justify-between"
                        >
                          {mapping.targetDimensionName || "Type dimension name..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                        <Command>
                          <CommandInput 
                            placeholder="Type dimension name..." 
                            value={mapping.targetDimensionName || ''}
                            onValueChange={(value) => updateMapping(index, 'targetDimensionName', value)}
                          />
                          <CommandList>
                            <CommandEmpty>
                              {mapping.targetDimensionName && mapping.targetDimensionName.trim() ? (
                                <div className="p-2">
                                  <Button
                                    variant="ghost"
                                    className="w-full text-sm justify-start"
                                    onClick={async (e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      console.log('Create button clicked for:', mapping.targetDimensionName);
                                      await createDimensionImmediately(mapping.targetDimensionName, index);
                                    }}
                                  >
                                    <Plus className="mr-2 h-4 w-4" />
                                    Create "{mapping.targetDimensionName}"
                                  </Button>
                                </div>
                              ) : (
                                <div className="p-2 text-sm text-muted-foreground">
                                  Type a dimension name to create
                                </div>
                              )}
                            </CommandEmpty>
                            <CommandGroup>
                              {vlookupDimensions.map((dim) => (
                                <CommandItem
                                  key={dim.id}
                                  onSelect={() => updateMapping(index, 'targetDimensionName', dim.name)}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      mapping.targetDimensionName === dim.name ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {dim.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
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