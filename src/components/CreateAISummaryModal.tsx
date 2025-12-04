import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CreateAISummaryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSummaryCreated: (summary: { id: string; name: string }) => void;
  accountId?: string;
  userId?: string;
}

export function CreateAISummaryModal({
  open,
  onOpenChange,
  onSummaryCreated,
  accountId,
  userId,
}: CreateAISummaryModalProps) {
  const [name, setName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !userId) return;

    setIsCreating(true);
    try {
      // Get January 1st of current year as default since_date
      const defaultSinceDate = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];

      const { data, error } = await (supabase.from("ai_summary_cards") as any)
        .insert({
          user_id: userId,
          account_id: accountId || null,
          name: name.trim(),
          report_ids: [],
          report_configs: {},
          selected_metrics: [],
          since_date: defaultSinceDate,
          ai_prompt: "",
        })
        .select("id, name")
        .single();

      if (error) {
        console.error("Error creating AI Summary:", error);
        toast.error("Failed to create AI Summary");
        return;
      }

      toast.success("AI Summary created");
      onSummaryCreated(data);
      setName("");
      onOpenChange(false);
    } catch (err) {
      console.error("Error creating AI Summary:", err);
      toast.error("Failed to create AI Summary");
    } finally {
      setIsCreating(false);
    }
  };

  const handleClose = () => {
    if (!isCreating) {
      setName("");
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create AI Summary</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">AI Summary Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter summary name..."
                autoFocus
                disabled={isCreating}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={isCreating}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || isCreating}>
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
