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
}

interface DimensionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dimension?: Dimension;
  mode?: 'add' | 'edit';
  onSaved?: () => void;
}

export const DimensionModal = ({
  open,
  onOpenChange,
  dimension,
  mode = 'add',
  onSaved,
}: DimensionModalProps) => {
  const [name, setName] = useState("");
  const [type, setType] = useState("number");
  const [formula, setFormula] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // [testing] Reset form when modal opens/closes or dimension changes
  useEffect(() => {
    if (open && mode === 'edit' && dimension) {
      console.log('[testing] Populating form for edit mode:', dimension);
      setName(dimension.name);
      setType(dimension.type);
      setFormula(dimension.formula || "");
    } else if (open && mode === 'add') {
      console.log('[testing] Resetting form for add mode');
      setName("");
      setType("number");
      setFormula("");
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
        const { error } = await supabase
          .from("dimensions")
          .update({
            name: name.trim(),
            type,
            formula: formula.trim() || null,
          })
          .eq("id", dimension.id);

        if (error) throw error;

        toast({
          title: "Dimension updated",
          description: `Updated dimension "${name}"`,
        });
      } else {
        console.log('[testing] Creating new dimension');
        const { error } = await supabase
          .from("dimensions")
          .insert({
            user_id: user.id,
            name: name.trim(),
            type,
            formula: formula.trim() || null,
          });

        if (error) throw error;

        toast({
          title: "Dimension added",
          description: `Created dimension "${name}"`,
        });
      }

      // Reset form
      setName("");
      setType("number");
      setFormula("");
      onOpenChange(false);
      
      // Notify parent component to refresh data
      if (onSaved) {
        onSaved();
      }
    } catch (error) {
      console.error(`Error ${mode === 'edit' ? 'updating' : 'creating'} dimension:`, error);
      toast({
        title: "Error",
        description: `Failed to ${mode === 'edit' ? 'update' : 'create'} dimension`,
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
          <DialogTitle>{mode === 'edit' ? 'Edit Dimension' : 'Add Dimension'}</DialogTitle>
          <DialogDescription>
            {mode === 'edit' ? 'Update the dimension details' : 'Create a new dimension for your report'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="e.g., Impressions, Clicks, Revenue"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="type">Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger id="type" className="bg-background">
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
