import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { RefreshCw, Plus, RotateCcw, Clock, Database, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface SyncModeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSync: (mode: 'incremental' | 'full') => void;
  isLoading?: boolean;
  lastSyncTime?: string | null;
  totalRows?: number;
}

export const SyncModeModal = ({ 
  open, 
  onOpenChange, 
  onSync, 
  isLoading = false,
  lastSyncTime,
  totalRows = 0
}: SyncModeModalProps) => {
  const [selectedMode, setSelectedMode] = useState<'incremental' | 'full'>('incremental');

  const handleSync = () => {
    onSync(selectedMode);
  };

  const formatLastSync = (dateString: string | null) => {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5 text-primary" />
            Choose Sync Mode
          </DialogTitle>
          <DialogDescription>
            Select how you want to sync data from Google Sheets
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Current Data Info */}
          <Card className="bg-muted/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Database className="h-4 w-4" />
                Current Data
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-muted-foreground">Total Rows</div>
                  <div className="font-medium">{totalRows.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Last Sync</div>
                  <div className="font-medium">{formatLastSync(lastSyncTime)}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Sync Mode Selection */}
          <RadioGroup value={selectedMode} onValueChange={(value) => setSelectedMode(value as 'incremental' | 'full')}>
            {/* Incremental Sync Option */}
            <Card className={`cursor-pointer transition-colors ${selectedMode === 'incremental' ? 'ring-2 ring-primary' : 'hover:bg-muted/50'}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start space-x-3">
                  <RadioGroupItem value="incremental" id="incremental" className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="incremental" className="cursor-pointer">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Plus className="h-4 w-4 text-green-600" />
                        Incremental Sync
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-normal">
                          Recommended
                        </span>
                      </CardTitle>
                    </Label>
                    <CardDescription className="mt-1">
                      Add only new rows from Google Sheets. Keeps existing data and appends new entries.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    Faster sync
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Preserves history
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Full Refresh Option */}
            <Card className={`cursor-pointer transition-colors ${selectedMode === 'full' ? 'ring-2 ring-primary' : 'hover:bg-muted/50'}`}>
              <CardHeader className="pb-3">
                <div className="flex items-start space-x-3">
                  <RadioGroupItem value="full" id="full" className="mt-1" />
                  <div className="flex-1">
                    <Label htmlFor="full" className="cursor-pointer">
                      <CardTitle className="text-base flex items-center gap-2">
                        <RotateCcw className="h-4 w-4 text-orange-600" />
                        Full Refresh
                      </CardTitle>
                    </Label>
                    <CardDescription className="mt-1">
                      Replace all data with fresh import from Google Sheets. Removes existing data first.
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <RefreshCw className="h-3 w-3" />
                    Complete refresh
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Slower for large datasets
                  </div>
                </div>
              </CardContent>
            </Card>
          </RadioGroup>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button onClick={handleSync} disabled={isLoading} className="gap-2">
              {isLoading ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  {selectedMode === 'incremental' ? (
                    <Plus className="h-4 w-4" />
                  ) : (
                    <RotateCcw className="h-4 w-4" />
                  )}
                  {selectedMode === 'incremental' ? 'Add New Rows' : 'Full Refresh'}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
