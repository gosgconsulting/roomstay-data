import { useState } from "react";
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

interface DimensionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: string;
}

export const DimensionModal = ({
  open,
  onOpenChange,
  reportId,
}: DimensionModalProps) => {
  const [name, setName] = useState("");
  const [type, setType] = useState("number");
  const [formula, setFormula] = useState("");
  const [isLoading, setIsLoading] = useState(false);

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
      const { error } = await supabase
        .from("dimensions")
        .insert({
          report_id: reportId,
          name: name.trim(),
          type,
          formula: formula.trim() || null,
        });

      if (error) throw error;

      toast({
        title: "Dimension added",
        description: `Created dimension "${name}"`,
      });

      // Reset form
      setName("");
      setType("number");
      setFormula("");
      onOpenChange(false);
    } catch (error) {
      console.error("Error creating dimension:", error);
      toast({
        title: "Error",
        description: "Failed to create dimension",
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
          <DialogTitle>Add Dimension</DialogTitle>
          <DialogDescription>
            Create a new dimension for your report
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
