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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Lock } from 'lucide-react';

interface SaveViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (viewName: string, mainDimensionId?: string, mainDimensionName?: string) => void;
  existingViewNames?: string[];
  availableMainDimensions?: Array<{ id: string; name: string; channel: string }>;
  defaultMainDimensionId?: string;
}

/**
 * Save View Dialog Component
 * 
 * Allows users to save the current filter configuration as a named view.
 * Validates that view names are unique and not empty.
 * Captures the main dimension (Account/Hotel) that will be locked when sharing.
 * 
 * @param props - Component props
 * @returns SaveViewDialog component
 */
export const SaveViewDialog = React.memo<SaveViewDialogProps>(
  ({ open, onOpenChange, onSave, existingViewNames = [], availableMainDimensions = [], defaultMainDimensionId }) => {
    const [viewName, setViewName] = useState('');
    const [mainDimensionId, setMainDimensionId] = useState<string | undefined>(undefined);
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
      const selectedDim = availableMainDimensions.find(d => d.id === mainDimensionId);
      onSave(trimmedName, mainDimensionId, selectedDim?.name);
      setViewName('');
      setMainDimensionId(undefined);
      onOpenChange(false);
    };

    const handleCancel = () => {
      setViewName('');
      setMainDimensionId(undefined);
      setError(null);
      onOpenChange(false);
    };

    const handleOpenChange = (newOpen: boolean) => {
      if (!newOpen) {
        setViewName('');
        setMainDimensionId(undefined);
        setError(null);
      } else {
        // Set default main dimension when opening
        if (defaultMainDimensionId) {
          setMainDimensionId(defaultMainDimensionId);
        } else if (availableMainDimensions.length > 0) {
          setMainDimensionId(availableMainDimensions[0].id);
        }
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

            {availableMainDimensions.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="main-dimension" className="flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                  Main Dimension (locked when sharing)
                </Label>
                <Select value={mainDimensionId} onValueChange={setMainDimensionId}>
                  <SelectTrigger id="main-dimension">
                    <SelectValue placeholder="Select main dimension..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableMainDimensions.map((dim) => (
                      <SelectItem key={dim.id} value={dim.id}>
                        {dim.name}
                        <span className="ml-2 text-xs text-muted-foreground">({dim.channel})</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  This dimension will be locked when you share this view. Viewers can change date and other filters, but not this one.
                </p>
              </div>
            )}
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
