import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState, useEffect } from "react";
import { FileSpreadsheet } from "lucide-react";

interface ReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (name: string) => void;
  initialName?: string;
  title: string;
  description: string;
}

export const ReportModal = ({ 
  open, 
  onOpenChange, 
  onSave, 
  initialName = "",
  title,
  description
}: ReportModalProps) => {
  const [reportName, setReportName] = useState(initialName);

  useEffect(() => {
    setReportName(initialName);
  }, [initialName, open]);

  const handleSave = () => {
    if (reportName.trim()) {
      onSave(reportName.trim());
      setReportName("");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="reportName">Report Name *</Label>
            <Input
              id="reportName"
              placeholder="e.g., Q1 2024 Performance"
              value={reportName}
              onChange={(e) => setReportName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSave();
                }
              }}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button 
            variant="outline" 
            onClick={() => {
              onOpenChange(false);
              setReportName("");
            }}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!reportName.trim()}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
