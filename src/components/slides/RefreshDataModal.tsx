import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { RefreshCw, Check } from "lucide-react";
import { RefreshStepIndicator } from "./EditSourceModal";
import { cn } from "@/lib/utils";
import { MONTH_NAMES } from "@/constants/slideViewConstants";

export type RefreshMonthOption = { year: number; month: number } | null;

interface RefreshDataModalProps {
  isRefreshModalOpen: boolean;
  setIsRefreshModalOpen: (open: boolean) => void;
  refreshStep: number;
  refreshStepStatus: Record<number, "pending" | "loading" | "complete" | "error">;
  refreshError: string | null;
  onStartRefresh: (options: RefreshMonthOption) => void;
  dateRange?: { from: string; to: string } | null;
}

const MONTHS_1_12 = MONTH_NAMES.map((name, i) => ({ value: i + 1, label: name }));

export function RefreshDataModal({
  isRefreshModalOpen,
  setIsRefreshModalOpen,
  refreshStep,
  refreshStepStatus,
  refreshError,
  onStartRefresh,
  dateRange,
}: RefreshDataModalProps) {
  const [useSpecificMonth, setUseSpecificMonth] = useState(false);
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear());
  const [selectedMonthNum, setSelectedMonthNum] = useState(() => new Date().getMonth() + 1);

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    if (dateRange?.from && dateRange?.to) {
      const fromYear = new Date(dateRange.from).getFullYear();
      const toYear = new Date(dateRange.to).getFullYear();
      const min = Math.min(fromYear, toYear, currentYear - 2);
      const max = Math.max(fromYear, toYear, currentYear + 1);
      const years: number[] = [];
      for (let y = min; y <= max; y++) years.push(y);
      return years.sort((a, b) => b - a);
    }
    return [currentYear + 1, currentYear, currentYear - 1, currentYear - 2];
  }, [dateRange?.from, dateRange?.to]);

  const isConfigPhase = refreshStep === 0;

  const handleStartRefresh = () => {
    const options: RefreshMonthOption = useSpecificMonth
      ? { year: selectedYear, month: selectedMonthNum }
      : null;
    onStartRefresh(options);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && refreshStep === 0) setIsRefreshModalOpen(false);
  };

  return (
    <Dialog open={isRefreshModalOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <RefreshCw
              className={cn("h-5 w-5 text-primary", refreshStep > 0 && refreshStep < 6 && "animate-spin")}
            />
            <DialogTitle>{isConfigPhase ? "Refresh Data" : "Refreshing Data"}</DialogTitle>
          </div>
          <DialogDescription>
            {isConfigPhase
              ? "Choose whether to refresh the entire date range or a specific month, then start the refresh."
              : "Updating your report with the latest data..."}
          </DialogDescription>
        </DialogHeader>

        {isConfigPhase ? (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Refresh scope</Label>
              <Select
                value={useSpecificMonth ? "month" : "entire"}
                onValueChange={(v) => setUseSpecificMonth(v === "month")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="entire">Entire date range</SelectItem>
                  <SelectItem value="month">Specific month</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {useSpecificMonth && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Year</Label>
                  <Select
                    value={String(selectedYear)}
                    onValueChange={(v) => setSelectedYear(parseInt(v, 10))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {yearOptions.map((y) => (
                        <SelectItem key={y} value={String(y)}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Month</Label>
                  <Select
                    value={String(selectedMonthNum)}
                    onValueChange={(v) => setSelectedMonthNum(parseInt(v, 10))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTHS_1_12.map(({ value, label }) => (
                        <SelectItem key={value} value={String(value)}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
            <DialogFooter className="flex gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setIsRefreshModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleStartRefresh}>Start refresh</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
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

              {refreshError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-700">{refreshError}</p>
                </div>
              )}

              {refreshStepStatus[5] === "complete" && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600" />
                  <p className="text-sm text-green-700 font-medium">
                    Data refresh complete! Browse data in the Data tab.
                  </p>
                </div>
              )}
            </div>

            <DialogFooter>
              {refreshError ? (
                <Button onClick={() => setIsRefreshModalOpen(false)}>Close</Button>
              ) : refreshStepStatus[5] === "complete" ? (
                <Button
                  onClick={() => setIsRefreshModalOpen(false)}
                  className="bg-green-600 hover:bg-green-700"
                >
                  Done
                </Button>
              ) : null}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
