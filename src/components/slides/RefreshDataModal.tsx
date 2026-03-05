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
}

export function RefreshDataModal({
  open,
  onOpenChange,
  refreshStep,
  refreshStepStatus,
  refreshError,
}: RefreshDataModalProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onOpenChange(false)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <RefreshCw className={cn("h-5 w-5 text-primary", refreshStep > 0 && refreshStep < 6 && "animate-spin")} />
            <DialogTitle>Refreshing Data</DialogTitle>
          </div>
          <DialogDescription>
            Updating your report with the latest data...
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
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

          {/* Error message */}
          {refreshError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700">{refreshError}</p>
            </div>
          )}

          {/* All complete message */}
          {refreshStepStatus[5] === 'complete' && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600" />
              <p className="text-sm text-green-700 font-medium">Data refresh complete! Browse data in the Data tab.</p>
            </div>
          )}
        </div>

        <DialogFooter>
          {refreshError ? (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          ) : refreshStepStatus[5] === 'complete' ? (
            <Button onClick={() => onOpenChange(false)} className="bg-green-600 hover:bg-green-700">
              Done
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
