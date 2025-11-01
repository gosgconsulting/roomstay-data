import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Account {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  user_id: string;
}

interface EditAccountModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: Account | null;
  onEdit: (name: string, description: string) => Promise<void>;
}

export function EditAccountModal({
  open,
  onOpenChange,
  account,
  onEdit,
}: EditAccountModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (account && open) {
      setName(account.name);
      setDescription(account.description || "");
    }
  }, [account, open]);

  const handleEdit = async () => {
    if (!name.trim()) {
      alert("Please enter an account name");
      return;
    }

    setIsLoading(true);
    try {
      await onEdit(name, description);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isLoading) {
      onOpenChange(newOpen);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Account</DialogTitle>
          <DialogDescription>
            Update the account details
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="edit-account-name">Account Name *</Label>
            <Input
              id="edit-account-name"
              placeholder="e.g., Q1 2024 Report"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isLoading}
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-account-description">Description</Label>
            <Textarea
              id="edit-account-description"
              placeholder="Optional description for this account"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isLoading}
              rows={3}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button onClick={handleEdit} disabled={isLoading}>
            {isLoading ? "Updating..." : "Update Account"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
