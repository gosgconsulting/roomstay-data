import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { loadDimensionsForUser } from "@/lib/dimensionLoader";
import { Checkbox } from "@/components/ui/checkbox";

interface ClusterMapping {
  sourceValues: string[];
  clusterName: string;
}

interface ClusterDimensionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId?: string;
  accountId?: string;
  onSave?: () => void;
}

export function ClusterDimensionModal({ open, onOpenChange, reportId, accountId, onSave }: ClusterDimensionModalProps) {
  const [clusterDimensionName, setClusterDimensionName] = useState("");
  const [sourceDimensionId, setSourceDimensionId] = useState("");
  const [clusterMappings, setClusterMappings] = useState<ClusterMapping[]>([{ sourceValues: [], clusterName: "" }]);
  const [dimensions, setDimensions] = useState<any[]>([]);
  const [sourceValues, setSourceValues] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingValues, setIsLoadingValues] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      loadDimensions();
    }
  }, [open, reportId]);

  useEffect(() => {
    if (sourceDimensionId) {
      loadSourceValues();
    }
  }, [sourceDimensionId]);

  const loadDimensions = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const dims = await loadDimensionsForUser(user.id, reportId);
      setDimensions(dims.filter(d => d.type !== 'date'));
    } catch (error) {
      console.error('Error loading dimensions:', error);
      toast({
        title: "Error",
        description: "Failed to load dimensions",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadSourceValues = async () => {
    setIsLoadingValues(true);
    try {
      if (!reportId) return;

      // Get the dimension name from the selected dimension
      const selectedDim = dimensions.find(d => d.id === sourceDimensionId);
      if (!selectedDim) return;

      // Fetch unique values for this dimension from dimension_data
      const { data, error } = await supabase
        .from('dimension_data')
        .select('dimension_values')
        .eq('report_id', reportId)
        .limit(10000);

      if (error) throw error;

      // Extract unique values for the selected dimension
      const values = new Set<string>();
      data?.forEach((row: any) => {
        const value = row.dimension_values?.[sourceDimensionId];
        if (value && value !== '' && value !== null) {
          values.add(String(value));
        }
      });

      const sortedValues = Array.from(values).sort();
      setSourceValues(sortedValues);
    } catch (error) {
      console.error('Error loading source values:', error);
      toast({
        title: "Error",
        description: "Failed to load dimension values",
        variant: "destructive",
      });
    } finally {
      setIsLoadingValues(false);
    }
  };

  const addClusterMapping = () => {
    setClusterMappings([...clusterMappings, { sourceValues: [], clusterName: "" }]);
  };

  const removeClusterMapping = (index: number) => {
    setClusterMappings(clusterMappings.filter((_, i) => i !== index));
  };

  const updateClusterMapping = (index: number, field: keyof ClusterMapping, value: any) => {
    const updated = [...clusterMappings];
    updated[index] = { ...updated[index], [field]: value };
    setClusterMappings(updated);
  };

  const toggleSourceValue = (mappingIndex: number, value: string) => {
    const updated = [...clusterMappings];
    const currentValues = updated[mappingIndex].sourceValues;
    
    if (currentValues.includes(value)) {
      updated[mappingIndex].sourceValues = currentValues.filter(v => v !== value);
    } else {
      updated[mappingIndex].sourceValues = [...currentValues, value];
    }
    
    setClusterMappings(updated);
  };

  const handleSave = async () => {
    if (!clusterDimensionName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a cluster dimension name",
        variant: "destructive",
      });
      return;
    }

    if (!sourceDimensionId) {
      toast({
        title: "Error",
        description: "Please select a source dimension",
        variant: "destructive",
      });
      return;
    }

    if (clusterMappings.length === 0 || !clusterMappings.some(m => m.sourceValues.length > 0 && m.clusterName.trim())) {
      toast({
        title: "Error",
        description: "Please add at least one cluster mapping",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // 1. Create the new custom dimension
      const { data: newDimension, error: dimError } = await supabase
        .from('dimensions')
        .insert({
          name: clusterDimensionName,
          type: 'text',
          scope: 'custom',
          user_id: user.id,
          report_id: reportId,
          account_id: accountId,
        })
        .select()
        .single();

      if (dimError) throw dimError;

      // 2. Create the cluster dimension record
      const { data: clusterDim, error: clusterError } = await supabase
        .from('cluster_dimensions')
        .insert({
          cluster_dimension_name: clusterDimensionName,
          source_dimension_id: sourceDimensionId,
          report_id: reportId,
          account_id: accountId,
          user_id: user.id,
          created_dimension_id: newDimension.id,
        })
        .select()
        .single();

      if (clusterError) throw clusterError;

      // 3. Create the cluster mappings
      const validMappings = clusterMappings.filter(m => m.sourceValues.length > 0 && m.clusterName.trim());
      const mappingsToInsert = validMappings.map(m => ({
        cluster_dimension_id: clusterDim.id,
        source_values: m.sourceValues,
        cluster_name: m.clusterName,
      }));

      const { error: mappingsError } = await supabase
        .from('cluster_mappings')
        .insert(mappingsToInsert);

      if (mappingsError) throw mappingsError;

      // 4. Apply the cluster mappings to dimension_data
      await applyClusterMappings(newDimension.id, clusterDim.id);

      toast({
        title: "Success",
        description: `Cluster dimension "${clusterDimensionName}" created successfully`,
      });

      onSave?.();
      onOpenChange(false);
      resetForm();
    } catch (error: any) {
      console.error('Error saving cluster dimension:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to save cluster dimension",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const applyClusterMappings = async (newDimensionId: string, clusterDimensionId: string) => {
    if (!reportId) return;

    // Get all cluster mappings
    const { data: mappings, error: mappingsError } = await supabase
      .from('cluster_mappings')
      .select('*')
      .eq('cluster_dimension_id', clusterDimensionId);

    if (mappingsError) throw mappingsError;

    // Get all dimension_data rows
    const { data: dimensionDataRows, error: dataError } = await supabase
      .from('dimension_data')
      .select('id, dimension_values')
      .eq('report_id', reportId);

    if (dataError) throw dataError;

    // Apply mappings to each row
    const updates = dimensionDataRows?.map((row: any) => {
      const sourceValue = row.dimension_values?.[sourceDimensionId];
      let clusterValue = null;

      // Find which cluster this value belongs to
      for (const mapping of mappings || []) {
        if (mapping.source_values.includes(sourceValue)) {
          clusterValue = mapping.cluster_name;
          break;
        }
      }

      return {
        id: row.id,
        dimension_values: {
          ...row.dimension_values,
          [newDimensionId]: clusterValue,
        },
      };
    });

    // Update in batches
    const batchSize = 100;
    for (let i = 0; i < (updates?.length || 0); i += batchSize) {
      const batch = updates?.slice(i, i + batchSize) || [];
      
      for (const update of batch) {
        const { error } = await supabase
          .from('dimension_data')
          .update({ dimension_values: update.dimension_values })
          .eq('id', update.id);

        if (error) console.error('Error updating row:', error);
      }
    }
  };

  const resetForm = () => {
    setClusterDimensionName("");
    setSourceDimensionId("");
    setClusterMappings([{ sourceValues: [], clusterName: "" }]);
    setSourceValues([]);
  };

  const selectedDimension = dimensions.find(d => d.id === sourceDimensionId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Cluster Dimension</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="py-8 text-center">Loading dimensions...</div>
        ) : (
          <div className="space-y-6">
            {/* Step 1: Cluster Dimension Name */}
            <div className="space-y-2">
              <Label htmlFor="cluster-name">1. New Cluster Dimension Name</Label>
              <Input
                id="cluster-name"
                placeholder="e.g., Hotel Group, Campaign Cluster"
                value={clusterDimensionName}
                onChange={(e) => setClusterDimensionName(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                This will create a new custom dimension available in filters
              </p>
            </div>

            {/* Step 2: Source Dimension */}
            <div className="space-y-2">
              <Label htmlFor="source-dimension">2. Choose Source Dimension</Label>
              <Select value={sourceDimensionId} onValueChange={setSourceDimensionId}>
                <SelectTrigger id="source-dimension">
                  <SelectValue placeholder="Select dimension (e.g., Hotel)" />
                </SelectTrigger>
                <SelectContent>
                  {dimensions.map((dim) => (
                    <SelectItem key={dim.id} value={dim.id}>
                      {dim.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Step 3: Cluster Mappings */}
            {sourceDimensionId && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>3. Define Clusters</Label>
                  <Button onClick={addClusterMapping} size="sm" variant="outline">
                    <Plus className="w-4 h-4 mr-2" />
                    Add Cluster
                  </Button>
                </div>

                {isLoadingValues ? (
                  <div className="py-4 text-center text-sm text-muted-foreground">
                    Loading {selectedDimension?.name} values...
                  </div>
                ) : (
                  <div className="space-y-4">
                    {clusterMappings.map((mapping, index) => (
                      <div key={index} className="p-4 border rounded-lg space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm font-medium">Cluster {index + 1}</Label>
                          {clusterMappings.length > 1 && (
                            <Button
                              onClick={() => removeClusterMapping(index)}
                              size="sm"
                              variant="ghost"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </div>

                        {/* Multi-select for source values */}
                        <div className="space-y-2">
                          <Label className="text-sm">
                            Select values from {selectedDimension?.name} ({mapping.sourceValues.length} selected)
                          </Label>
                          <div className="max-h-48 overflow-y-auto border rounded p-3 space-y-2">
                            {sourceValues.map((value) => (
                              <div key={value} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`${index}-${value}`}
                                  checked={mapping.sourceValues.includes(value)}
                                  onCheckedChange={() => toggleSourceValue(index, value)}
                                />
                                <label
                                  htmlFor={`${index}-${value}`}
                                  className="text-sm cursor-pointer flex-1"
                                >
                                  {value}
                                </label>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Cluster name input */}
                        <div className="space-y-2">
                          <Label className="text-sm">Cluster Name / Tag</Label>
                          <Input
                            placeholder="e.g., Premium Hotels, Brand Campaigns"
                            value={mapping.clusterName}
                            onChange={(e) =>
                              updateClusterMapping(index, 'clusterName', e.target.value)
                            }
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isLoading}>
            {isSaving ? (
              <>
                <Save className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Create Cluster Dimension
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
