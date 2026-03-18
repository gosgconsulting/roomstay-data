import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RefreshCw, Check, History, Database } from "lucide-react";
import { RefreshStepIndicator } from "./EditSourceModal";
import { cn } from "@/lib/utils";

export type RefreshMode = 'full' | 'recent';

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
  /** Called when the user picks a mode and confirms. */
  onStartRefresh?: (mode: RefreshMode) => void;
  /** Current refresh mode (controlled externally once started). */
  refreshMode?: RefreshMode;
  /** Total rows imported across all data sources — shown in the success message. */
  rowsProcessed?: number | null;
}

export function RefreshDataModal({
  open,
  onOpenChange,
  refreshStep,
  refreshStepStatus,
  refreshError,
  isDataStudio = false,
  onStartRefresh,
  refreshMode,
  rowsProcessed,
}: RefreshDataModalProps) {
  const allComplete = refreshStepStatus[5] === 'complete';
  const isRunning = refreshStep > 0 && !allComplete && !refreshError;
  const hasStarted = refreshStep > 0;

  // Local mode selection — only used before refresh starts
  const [selectedMode, setSelectedMode] = React.useState<RefreshMode>('recent');

  // Reset selected mode when modal re-opens (step goes back to 0)
  React.useEffect(() => {
    if (!hasStarted) setSelectedMode('recent');
  }, [hasStarted]);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onOpenChange(false); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <RefreshCw className={cn("h-5 w-5 text-primary", isRunning && "animate-spin")} />
            <DialogTitle>{hasStarted ? "Refreshing Data" : "Refresh Data"}</DialogTitle>
          </div>
          <DialogDescription>
            {hasStarted
              ? "Updating your report with the latest data. You can close this and the refresh will continue in the background."
              : "Choose how much data to refresh from your sources."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* ── Mode selection (before start) ── */}
          {!hasStarted && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setSelectedMode('recent')}
                className={cn(
                  "w-full flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-colors",
                  selectedMode === 'recent'
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/40"
                )}
              >
                <History className={cn("h-5 w-5 mt-0.5 shrink-0", selectedMode === 'recent' ? "text-primary" : "text-muted-foreground")} />
                <div>
                  <p className={cn("font-medium text-sm", selectedMode === 'recent' ? "text-primary" : "text-foreground")}>
                    Last 2 Months
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Replaces only recent data. Fast — keeps all historical data intact.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSelectedMode('full')}
                className={cn(
                  "w-full flex items-start gap-3 p-4 rounded-lg border-2 text-left transition-colors",
                  selectedMode === 'full'
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/40"
                )}
              >
                <Database className={cn("h-5 w-5 mt-0.5 shrink-0", selectedMode === 'full' ? "text-primary" : "text-muted-foreground")} />
                <div>
                  <p className={cn("font-medium text-sm", selectedMode === 'full' ? "text-primary" : "text-foreground")}>
                    Full Refresh
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Replaces all data from scratch. Slower — use when source data has changed historically.
                  </p>
                </div>
              </button>
            </div>
          )}

          {/* ── Progress steps (after start) ── */}
          {hasStarted && (
            <>
              <div className="text-xs text-muted-foreground">
                Mode: <span className="font-medium text-foreground">
                  {refreshMode === 'recent' ? 'Last 2 Months' : 'Full Refresh'}
                </span>
              </div>

              {isDataStudio ? (
                <>
                  <RefreshStepIndicator
                    stepNumber={1}
                    status={refreshStepStatus[0]}
                    title="Clearing and resetting data"
                    description="Removing existing report data before sync"
                  />
                  <RefreshStepIndicator
                    stepNumber={2}
                    status={refreshStepStatus[1]}
                    title="Fetching from sources"
                    description={refreshMode === 'recent'
                      ? "Loading last 2 months of data from Google Sheets & CSV"
                      : "Loading all data from Google Sheets & CSV"}
                  />
                  <RefreshStepIndicator
                    stepNumber={3}
                    status={refreshStepStatus[5] === 'complete' ? 'complete' : refreshStepStatus[2]}
                    title="Updating cache & interface"
                    description="Recomputing metrics and refreshing report"
                  />
                </>
              ) : (
                <>
                  <RefreshStepIndicator stepNumber={1} status={refreshStepStatus[1]} title="Resyncing data sources" description="Pulling latest data from all connected sources" />
                  <RefreshStepIndicator stepNumber={2} status={refreshStepStatus[2]} title="Computing pivot data" description="Aggregating metrics by year, month, and channel" />
                  <RefreshStepIndicator stepNumber={3} status={refreshStepStatus[3]} title="Storing monthly data" description="Saving data organized by Year → Month → Channel" />
                  <RefreshStepIndicator stepNumber={4} status={refreshStepStatus[4]} title="Processing breakdowns & filters" description="Storing breakdown tables and filter configurations" />
                  <RefreshStepIndicator stepNumber={5} status={refreshStepStatus[5]} title="Updating interface" description="Refreshing report with latest data" />
                </>
              )}
            </>
          )}

          {/* ── Error ── */}
          {refreshError && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm text-destructive">{refreshError}</p>
            </div>
          )}

          {/* ── Success ── */}
          {allComplete && (
            <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg space-y-1">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-primary shrink-0" />
                <p className="text-sm text-primary font-medium">Data refresh complete!</p>
              </div>
              {rowsProcessed != null && (
                <p className="text-xs text-muted-foreground pl-6">
                  {rowsProcessed.toLocaleString()} row{rowsProcessed !== 1 ? 's' : ''} imported
                  {refreshMode === 'recent' ? ' (last 2 months)' : ''}
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {!hasStarted ? (
            <div className="flex gap-2 w-full justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={() => onStartRefresh?.(selectedMode)} className="bg-primary hover:bg-primary/90">
                Start Refresh
              </Button>
            </div>
          ) : refreshError ? (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          ) : allComplete ? (
            <Button onClick={() => onOpenChange(false)} className="bg-primary hover:bg-primary/90">Done</Button>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close (runs in background)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
