import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RefreshCw, Check, CalendarRange, Calendar } from "lucide-react";
import { RefreshStepIndicator } from "./EditSourceModal";
import { cn } from "@/lib/utils";

export type RefreshMode = 'full' | 'current_month';

interface RefreshDataModalProps {
  isRefreshModalOpen: boolean;
  setIsRefreshModalOpen: (open: boolean) => void;
  refreshStep: number;
  refreshMode: RefreshMode | null;
  refreshStepStatus: Record<number, 'pending' | 'loading' | 'complete' | 'error'>;
  refreshError: string | null;
  /** Report "Since" label (e.g. "January 2025") for full-range refresh message. */
  sinceLabel?: string | null;
  /** Called when user chooses full range or current month only. */
  onChooseRefreshMode: (mode: RefreshMode) => void;
  /** Label for current month (e.g. "February 2026") when showing current-month option. */
  currentMonthLabel?: string | null;
}

export function RefreshDataModal({
  isRefreshModalOpen,
  setIsRefreshModalOpen,
  refreshStep,
  refreshMode,
  refreshStepStatus,
  refreshError,
  sinceLabel,
  onChooseRefreshMode,
  currentMonthLabel,
}: RefreshDataModalProps) {
  const showChoiceStep = refreshStep === 0;
  const rangeLabel = sinceLabel ? `from ${sinceLabel} to Present` : 'for the full report date range';
  const description =
    refreshMode === 'full'
      ? `Refreshing all data ${rangeLabel}. This may take a moment for multi-year reports.`
      : refreshMode === 'current_month'
        ? `Refreshing ${currentMonthLabel ?? 'selected month'} only. Faster for quick updates.`
        : '';

  return (
    <Dialog open={isRefreshModalOpen} onOpenChange={(open) => !open && refreshStep === 0 && setIsRefreshModalOpen(false)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <RefreshCw className={cn("h-5 w-5 text-primary", refreshStep > 0 && refreshStep < 6 && "animate-spin")} />
            <DialogTitle>{showChoiceStep ? "Choose refresh type" : "Refreshing Data"}</DialogTitle>
          </div>
          {showChoiceStep ? (
            <DialogDescription>
              Choose how much data to refresh. Full range uses your report&apos;s &quot;Since&quot; date and may take longer.
            </DialogDescription>
          ) : (
            <DialogDescription>{description}</DialogDescription>
          )}
        </DialogHeader>

        {showChoiceStep ? (
          <div className="space-y-3 py-4">
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-4 px-4 flex flex-col items-start gap-1"
              onClick={() => onChooseRefreshMode('full')}
            >
              <span className="flex items-center gap-2 font-medium">
                <CalendarRange className="h-4 w-4" />
                Full range (Since to Present)
              </span>
              <span className="text-muted-foreground text-left text-sm font-normal">
                Refresh all months from your report&apos;s &quot;Since&quot; date to present. Best for initial load or when you need every month updated.
              </span>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start h-auto py-4 px-4 flex flex-col items-start gap-1"
              onClick={() => onChooseRefreshMode('current_month')}
            >
              <span className="flex items-center gap-2 font-medium">
                <Calendar className="h-4 w-4" />
                Current month only
              </span>
              <span className="text-muted-foreground text-left text-sm font-normal">
                Refresh only the selected month (or current month). Faster and good for quick updates.
              </span>
            </Button>
          </div>
        ) : (
        <div className="space-y-4 py-4">
          <RefreshStepIndicator
            stepNumber={1}
            status={refreshStepStatus[1]}
            title="Verifying settings"
            description="Checking configuration and data sources"
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
        )}

        <DialogFooter>
          {showChoiceStep ? (
            <Button variant="outline" onClick={() => setIsRefreshModalOpen(false)}>Cancel</Button>
          ) : refreshError ? (
            <Button onClick={() => setIsRefreshModalOpen(false)}>Close</Button>
          ) : refreshStepStatus[5] === 'complete' ? (
            <Button onClick={() => setIsRefreshModalOpen(false)} className="bg-green-600 hover:bg-green-700">
              Done
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
