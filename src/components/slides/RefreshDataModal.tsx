import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RefreshCw, Check } from "lucide-react";
import { RefreshStepIndicator } from "./EditSourceModal";
import { cn } from "@/lib/utils";

interface RefreshDataModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slideReportId?: string | null;
  slideReport?: any;
  refreshStep: number;
  setRefreshStep?: (step: number) => void;
  refreshStepStatus: Record<number, 'pending' | 'loading' | 'complete' | 'error'>;
  setRefreshStepStatus?: (fn: (prev: Record<number, 'pending' | 'loading' | 'complete' | 'error'>) => Record<number, 'pending' | 'loading' | 'complete' | 'error'>) => void;
  refreshError: string | null;
  setRefreshError?: (err: string | null) => void;
  isDataStudio?: boolean;
}

export function RefreshDataModal({
  open,
  onOpenChange,
  refreshStep,
  refreshStepStatus,
  refreshError,
  isDataStudio = false,
}: RefreshDataModalProps) {
  // Data Studio: 2 steps only (resync + update cache)
  // Master Report: 5 steps (resync + compute + store + breakdowns + update)
  const lastStep = isDataStudio ? 2 : 5;
  const allComplete = refreshStepStatus[5] === 'complete';

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onOpenChange(false)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <RefreshCw className={cn("h-5 w-5 text-primary", refreshStep > 0 && !allComplete && "animate-spin")} />
            <DialogTitle>Refreshing Data</DialogTitle>
          </div>
          <DialogDescription>
            Updating your report with the latest data...
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {isDataStudio ? (
            <>
              <RefreshStepIndicator
                stepNumber={1}
                status={refreshStepStatus[1]}
                title="Fetching from sources"
                description="Loading latest data from Google Sheets & CSV"
              />
              <RefreshStepIndicator
                stepNumber={2}
                status={refreshStepStatus[5] === 'complete' ? 'complete' : refreshStepStatus[2]}
                title="Updating cache & interface"
                description="Recomputing metrics and refreshing report"
              />
            </>
          ) : (
            <>
              <RefreshStepIndicator
                stepNumber={1}
                status={refreshStepStatus[1]}
                title="Resyncing data sources"
                description="Pulling latest data from all connected sources"
              />
              <RefreshStepIndicator
                stepNumber={2}
                status={refreshStepStatus[2]}
                title="Computing pivot data"
                description="Aggregating metrics by year, month, and channel"
              />
              <RefreshStepIndicator
                stepNumber={3}
                status={refreshStepStatus[3]}
                title="Storing monthly data"
                description="Saving data organized by Year → Month → Channel"
              />
              <RefreshStepIndicator
                stepNumber={4}
                status={refreshStepStatus[4]}
                title="Processing breakdowns & filters"
                description="Storing breakdown tables and filter configurations"
              />
              <RefreshStepIndicator
                stepNumber={5}
                status={refreshStepStatus[5]}
                title="Updating interface"
                description="Refreshing report with latest data"
              />
            </>
          )}

          {/* Error message */}
          {refreshError && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm text-destructive">{refreshError}</p>
            </div>
          )}

          {/* All complete message */}
          {allComplete && (
            <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg flex items-center gap-2">
              <Check className="h-4 w-4 text-primary" />
              <p className="text-sm text-primary font-medium">Data refresh complete!</p>
            </div>
          )}
        </div>

        <DialogFooter>
          {refreshError ? (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          ) : allComplete ? (
            <Button onClick={() => onOpenChange(false)} className="bg-primary hover:bg-primary/90">
              Done
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
