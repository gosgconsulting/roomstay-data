import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Dimension {
  id: string;
  name: string;
  type: string;
  formula: string | null;
  is_system?: boolean;
  scope?: 'global' | 'custom';
}

interface DimensionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dimension?: Dimension;
  mode?: 'add' | 'edit';
  onSaved?: () => void;
  reportId?: string;
}

export const DimensionModal = ({
  open,
  onOpenChange,
  dimension,
  mode = 'add',
  onSaved,
  reportId,
}: DimensionModalProps) => {
  const [name, setName] = useState("");
  const [type, setType] = useState("number");
  const [formula, setFormula] = useState("");
  const [scope, setScope] = useState<'global' | 'custom'>('custom');
  const [isLoading, setIsLoading] = useState(false);

  // [testing] Check if dimension is a system/default dimension
  const isSystemDimension = (dim: Dimension | null): boolean => {
    if (!dim) return false;
    const systemDimensionNames = [
      'Impressions', 'Clicks', 'Revenue', 'Cost', 'Conversions', 'Leads',
      'CTR', 'ROAS', 'Cost of sale', 'Conversion Rate', 'CPM', 'CPC', 'Impression Share'
    ];
    return dim.is_system === true || systemDimensionNames.includes(dim.name);
  };

  // Reset form when modal opens/closes or dimension changes
  useEffect(() => {
    if (open && mode === 'edit' && dimension) {
      console.log('[testing] Populating form for edit mode:', dimension);
      setName(dimension.name);
      setType(dimension.type);
      setFormula(dimension.formula || "");
      // Always show the dimension's actual scope in edit mode (read-only)
      setScope(dimension.scope || 'custom');
    } else if (open && mode === 'add') {
      console.log('[testing] Resetting form for add mode');
      setName("");
      setType("number");
      setFormula("");
      // Always create custom dimensions (users can't create global)
      setScope('custom');
    }
  }, [open, mode, dimension]);

  const handleSave = async () => {
    if (!name.trim()) {
      toast({
        title: "Validation error",
        description: "Please enter a dimension name",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) throw new Error("User not authenticated");

      if (mode === 'edit' && dimension) {
        console.log('[testing] Updating dimension:', dimension.id);

        // For system dimensions, only allow formula updates
        const updateData = isSystemDimension(dimension)
          ? { formula: formula.trim() || null }
          : {
              name: name.trim(),
              type,
              formula: formula.trim() || null,
              scope,
            };

        const { error } = await supabase
          .from("dimensions")
          .update(updateData)
          .eq("id", dimension.id);

        if (error) throw error;

        toast({
          title: "Dimension updated",
          description: `Updated dimension "${name}"`,
        });
      } else {
        console.log('[testing] Creating new dimension for report:', reportId);

        // Users can only create custom dimensions (for their specific report)
        if (!reportId) {
          throw new Error("Report ID is required for creating dimensions");
        }

        const { error } = await supabase
          .from("dimensions")
          .insert({
            user_id: user.id,
            report_id: reportId,
            name: name.trim(),
            type,
            formula: formula.trim() || null,
            scope: 'custom', // Always custom for user-created dimensions
          });

        if (error) throw error;

        toast({
          title: "Dimension added",
          description: `Created dimension "${name}" for this report`,
        });
      }

      // Reset form
      setName("");
      setType("number");
      setFormula("");
      setScope('custom');
      onOpenChange(false);
      
      // Notify parent component to refresh data
      if (onSaved) {
        onSaved();
      }
    } catch (error) {
      // Properly serialize error for logging
      let errorMessage = '';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      } else if (error && typeof error === 'object' && 'message' in error) {
        errorMessage = (error as any).message;
      } else {
        errorMessage = JSON.stringify(error, null, 2);
      }

      console.error(`Error ${mode === 'edit' ? 'updating' : 'creating'} dimension:`, errorMessage);
      toast({
        title: "Error",
        description: errorMessage || `Failed to ${mode === 'edit' ? 'update' : 'create'} dimension`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === 'edit' ? 'Edit Dimension' : 'Add Dimension'}
            {mode === 'edit' && isSystemDimension(dimension) && (
              <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                System
              </span>
            )}
          </DialogTitle>
          <DialogDescription>
            {mode === 'edit' && isSystemDimension(dimension) 
              ? 'This is a system dimension. Only the formula can be modified.'
              : mode === 'edit' 
                ? 'Update the dimension details' 
                : 'Create a new dimension for your report'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="scope">Scope</Label>
            <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
              <input
                type="radio"
                id="custom"
                value="custom"
                checked={scope === 'custom'}
                onChange={() => setScope('custom')}
                disabled={mode === 'edit'}
              />
              <label htmlFor="custom" className="cursor-pointer flex-1">
                <div>
                  <span className="font-medium">Custom</span>
                  <p className="text-xs text-muted-foreground">For this report only</p>
                </div>
              </label>
            </div>
            {mode === 'edit' && (
              <p className="text-xs text-muted-foreground">
                Scope cannot be changed after creation
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Custom dimensions are specific to this report. Contact an administrator to create global dimensions available across all reports.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="e.g., Impressions, Clicks, Revenue"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={mode === 'edit' && isSystemDimension(dimension)}
              className={mode === 'edit' && isSystemDimension(dimension) ? 'bg-gray-50' : ''}
            />
            {mode === 'edit' && isSystemDimension(dimension) && (
              <p className="text-xs text-muted-foreground">
                System dimension names cannot be changed
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <Select 
              value={type} 
              onValueChange={setType}
              disabled={mode === 'edit' && isSystemDimension(dimension)}
            >
              <SelectTrigger 
                id="type" 
                className={`bg-background ${mode === 'edit' && isSystemDimension(dimension) ? 'bg-gray-50' : ''}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-background z-50">
                <SelectItem value="text">Plain text</SelectItem>
                <SelectItem value="date">Date</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="currency">Currency</SelectItem>
                <SelectItem value="percentage">Percentage</SelectItem>
              </SelectContent>
            </Select>
            {mode === 'edit' && isSystemDimension(dimension) && (
              <p className="text-xs text-muted-foreground">
                System dimension types cannot be changed
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="formula">Formula (optional)</Label>
            <Textarea
              id="formula"
              placeholder="e.g., Cost / Clicks, Revenue / Cost"
              value={formula}
              onChange={(e) => setFormula(e.target.value)}
              rows={3}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Use metric names for calculations. Leave empty for base metrics that come from your data source.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? "Saving..." : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
