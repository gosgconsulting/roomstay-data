import React from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Settings } from "lucide-react";

interface Report {
  id: string;
  name: string;
}

interface ReportSelectorProps {
  availableReports: Report[];
  selectedReportIds: string[];
  onChange: (reportIds: string[]) => void;
}

const ReportSelector: React.FC<ReportSelectorProps> = ({
  availableReports,
  selectedReportIds,
  onChange,
}) => {
  const toggle = (id: string) => {
    const next = selectedReportIds.includes(id)
      ? selectedReportIds.filter(rid => rid !== id)
      : [...selectedReportIds, id];
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">Include Reports</label>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="outline" className="w-[200px] justify-between bg-background">
            {selectedReportIds.length === 0
              ? "All reports"
              : selectedReportIds.length === availableReports.length
              ? "All reports"
              : `${selectedReportIds.length} selected`}
            <Settings className="ml-2 h-4 w-4 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0 bg-background z-50" align="start">
          <div className="p-2 border-b flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 h-8 text-xs"
              onClick={() => onChange(availableReports.map(r => r.id))}
            >
              Select All
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 h-8 text-xs"
              onClick={() => onChange([])}
            >
              Deselect All
            </Button>
          </div>
          <ScrollArea className="h-[200px]">
            <div className="p-2 space-y-1">
              {availableReports.map(report => (
                <div
                  key={report.id}
                  className="flex items-center gap-2 p-2 hover:bg-accent rounded cursor-pointer"
                  onClick={() => toggle(report.id)}
                >
                  <Checkbox checked={selectedReportIds.includes(report.id)} onCheckedChange={() => {}} />
                  <span className="text-sm">{report.name}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default ReportSelector;