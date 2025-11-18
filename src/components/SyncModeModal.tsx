import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RefreshCw, RotateCcw, Clock, Database } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";

interface SyncModeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSync: (mode: 'incremental' | 'full', schedule: { enabled: boolean; frequency: 'manual' | 'daily' | 'weekly' | 'monthly'; time?: string | null; timezone?: string | null }) => void;
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
  // Only full refresh is allowed
  const selectedMode: 'full' = 'full';

  // NEW: Auto sync state
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(true);
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'manual'>('daily');
  const [syncTime, setSyncTime] = useState<string>('02:00');
  const [timezone, setTimezone] = useState<string>('Asia/Singapore');

  const handleSync = () => {
    onSync('full', {
      enabled: autoSyncEnabled,
      frequency,
      time: autoSyncEnabled ? syncTime : null,
      timezone: autoSyncEnabled ? timezone : null
    });
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
            Full Refresh
          </DialogTitle>
          <DialogDescription>
            Replace all existing data with a fresh import from Google Sheets.
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

          {/* Full Refresh Info (only option) */}
          <Card className="ring-2 ring-primary">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-orange-600" />
                Full Refresh
              </CardTitle>
              <CardDescription className="mt-1">
                This will remove existing data and import fresh rows from your source.
              </CardDescription>
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

          {/* NEW: Auto Sync Configuration */}
          <Card className="bg-muted/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Auto Sync
              </CardTitle>
              <CardDescription className="mt-1">
                Enable a schedule to keep your data up to date automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="autoSync">Enable auto sync</Label>
                <Switch id="autoSync" checked={autoSyncEnabled} onCheckedChange={setAutoSyncEnabled} />
              </div>
              <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 ${autoSyncEnabled ? '' : 'opacity-50 pointer-events-none'}`}>
                <div>
                  <Label htmlFor="frequency">Frequency</Label>
                  <Select value={frequency} onValueChange={(v) => setFrequency(v as typeof frequency)}>
                    <SelectTrigger id="frequency" className="bg-background mt-1">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent className="bg-background z-50">
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="syncTime">Time</Label>
                  <Input id="syncTime" type="time" value={syncTime} onChange={(e) => setSyncTime(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="timezone">Timezone</Label>
                  <Input id="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} className="mt-1" placeholder="e.g., Asia/Singapore" />
                </div>
              </div>
            </CardContent>
          </Card>

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
                  <RotateCcw className="h-4 w-4" />
                  Full Refresh
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};