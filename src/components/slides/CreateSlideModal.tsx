import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { ChevronLeft, ChevronRight, Sparkles, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface CreateSlideModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  userId: string;
  onSlideCreated: (slide: any) => void;
}

type Step = "name";

export function CreateSlideModal({
  open,
  onOpenChange,
  accountId,
  userId,
  onSlideCreated,
}: CreateSlideModalProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("name");
  const [reportName, setReportName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (open) {
      // Reset state when modal opens
      setStep("name");
      setReportName("");
    }
  }, [open]);

  const handleCreate = async () => {
    if (!reportName.trim()) return;

    setIsCreating(true);
    try {
      // Create a new slide_report record
      const { data, error } = await supabase
        .from("slide_reports")
        .insert({
          name: reportName.trim(),
          account_id: accountId,
          user_id: userId,
          configuration: {
            selectedChannels: [],
            channelConfigs: {},
            breakdownConfigs: {},
            filterConfigs: {},
          },
          report_ids: {},
          pivot_data: {},
          date_range: null,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      onSlideCreated(data);
      onOpenChange(false);
      
      // Navigate to the Edit Source page for the new report
      navigate(`/tools/reports/${accountId}/master-report?reportId=${data.id}&edit=true`);
    } catch (error) {
      console.error("Error creating slide report:", error);
    } finally {
      setIsCreating(false);
    }
  };

  const canProceed = () => {
    switch (step) {
      case "name":
        return reportName.trim().length > 0;
      default:
        return false;
    }
  };

  const goNext = () => {
    switch (step) {
      case "name":
        handleCreate();
        break;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Create New Report
          </DialogTitle>
          <DialogDescription>
            {step === "name" && (
              "Give your report a name to get started."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {step === "name" && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="report-name">Report Name</Label>
                <Input
                  id="report-name"
                  placeholder="e.g., Q1 2026 Performance Report"
                  value={reportName}
                  onChange={(e) => setReportName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canProceed()) {
                      goNext();
                    }
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  You can configure channels, date ranges, and filters in the next step.
                </p>
              </div>
              
              <div className="p-4 bg-muted/50 rounded-lg border border-dashed">
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm font-medium">What happens next?</p>
                    <ul className="text-xs text-muted-foreground mt-1 space-y-1">
                      <li>• Select your date range (Since when)</li>
                      <li>• Choose channels (Metasearch, SEM, Social)</li>
                      <li>• Configure value dimensions and filters</li>
                      <li>• Refresh data to compute your report</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <div />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={goNext}
              disabled={!canProceed() || isCreating}
              className="gap-2"
            >
              {isCreating ? "Creating..." : (
                <>
                  Create & Configure
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
