/**
 * Save or Update View Dialog Component
 * Intermediate dialog that allows users to choose between saving a new view or updating an existing one
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

interface SaveOrUpdateViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveNew: () => void; // Callback to open SaveViewDialog
  onUpdate: (viewId: string) => void; // Callback to update selected view
  availableViews: Array<{ id: string; name: string }>; // List of views for dropdown
  currentViewId?: string | null; // Currently selected view (if any)
}

/**
 * Save or Update View Dialog Component
 * 
 * Shows two options when a view is already selected:
 * 1. Save view - Opens SaveViewDialog to create a new view
 * 2. Update existing view - Shows dropdown to select which view to update
 * 
 * @param props - Component props
 * @returns SaveOrUpdateViewDialog component
 */
export const SaveOrUpdateViewDialog = React.memo<SaveOrUpdateViewDialogProps>(
  ({ open, onOpenChange, onSaveNew, onUpdate, availableViews, currentViewId }) => {
    const [selectedViewToUpdate, setSelectedViewToUpdate] = useState<string>('');
    const [showUpdateDropdown, setShowUpdateDropdown] = useState(false);

    // Filter out views without IDs (like 'unsaved')
    const validViews = availableViews.filter(v => v.id && v.id !== 'unsaved');

    const handleSaveNew = () => {
      onSaveNew();
      onOpenChange(false);
    };

    const handleUpdateClick = () => {
      if (!selectedViewToUpdate) {
        return;
      }
      onUpdate(selectedViewToUpdate);
      setSelectedViewToUpdate('');
      setShowUpdateDropdown(false);
      onOpenChange(false);
    };

    const handleUpdateExistingClick = () => {
      // Pre-select current view if available
      if (currentViewId && validViews.some(v => v.id === currentViewId)) {
        setSelectedViewToUpdate(currentViewId);
      }
      setShowUpdateDropdown(true);
    };

    const handleCancel = () => {
      setSelectedViewToUpdate('');
      setShowUpdateDropdown(false);
      onOpenChange(false);
    };

    const handleOpenChange = (newOpen: boolean) => {
      if (!newOpen) {
        setSelectedViewToUpdate('');
        setShowUpdateDropdown(false);
      }
      onOpenChange(newOpen);
    };

    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save or Update View</DialogTitle>
            <DialogDescription>
              Choose to save a new view or update an existing one with your current filter configuration.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {!showUpdateDropdown ? (
              // Initial state: Show two options
              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="w-full justify-start h-auto py-4"
                  onClick={handleSaveNew}
                >
                  <div className="flex flex-col items-start gap-1">
                    <span className="font-medium">Save view</span>
                    <span className="text-sm text-muted-foreground">Create a new view with current filters</span>
                  </div>
                </Button>
                <Button
                  variant="outline"
                  className="w-full justify-start h-auto py-4"
                  onClick={handleUpdateExistingClick}
                  disabled={validViews.length === 0}
                >
                  <div className="flex flex-col items-start gap-1">
                    <span className="font-medium">Update existing view</span>
                    <span className="text-sm text-muted-foreground">
                      {validViews.length === 0 
                        ? 'No views available to update' 
                        : 'Update an existing view with current filters'}
                    </span>
                  </div>
                </Button>
              </div>
            ) : (
              // Update state: Show dropdown to select view
              <div className="space-y-2">
                <Label htmlFor="view-to-update">Select view to update</Label>
                <Select
                  value={selectedViewToUpdate}
                  onValueChange={setSelectedViewToUpdate}
                >
                  <SelectTrigger id="view-to-update">
                    <SelectValue placeholder="Select a view..." />
                  </SelectTrigger>
                  <SelectContent>
                    {validViews.map((view) => (
                      <SelectItem key={view.id} value={view.id}>
                        {view.name}
                        {view.id === currentViewId && ' (current)'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              Cancel
            </Button>
            {showUpdateDropdown && (
              <Button 
                onClick={handleUpdateClick}
                disabled={!selectedViewToUpdate}
              >
                Update
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }
);

SaveOrUpdateViewDialog.displayName = 'SaveOrUpdateViewDialog';
