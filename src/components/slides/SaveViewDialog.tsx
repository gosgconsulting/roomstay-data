/**
 * Save View Dialog Component
 * Dialog for saving current filter configuration as a named view
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SaveViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (viewName: string) => void;
  existingViewNames?: string[];
}

/**
 * Save View Dialog Component
 * 
 * Allows users to save the current filter configuration as a named view.
 * Validates that view names are unique and not empty.
 * 
 * @param props - Component props
 * @returns SaveViewDialog component
 */
export const SaveViewDialog = React.memo<SaveViewDialogProps>(
  ({ open, onOpenChange, onSave, existingViewNames = [] }) => {
    const [viewName, setViewName] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleSave = () => {
      const trimmedName = viewName.trim();
      
      if (!trimmedName) {
        setError('View name is required');
        return;
      }

      if (existingViewNames.includes(trimmedName)) {
        setError('A view with this name already exists');
        return;
      }

      setError(null);
      onSave(trimmedName);
      setViewName('');
      onOpenChange(false);
    };

    const handleCancel = () => {
      setViewName('');
      setError(null);
      onOpenChange(false);
    };

    const handleOpenChange = (newOpen: boolean) => {
      if (!newOpen) {
        setViewName('');
        setError(null);
      }
      onOpenChange(newOpen);
    };

    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save View</DialogTitle>
            <DialogDescription>
              Save your current filter configuration as a named view for quick access.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="view-name">View Name</Label>
              <Input
                id="view-name"
                value={viewName}
                onChange={(e) => {
                  setViewName(e.target.value);
                  setError(null);
                }}
                placeholder="Enter view name..."
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSave();
                  }
                }}
                autoFocus
              />
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            <Button onClick={handleSave}>Save View</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

SaveViewDialog.displayName = 'SaveViewDialog';
