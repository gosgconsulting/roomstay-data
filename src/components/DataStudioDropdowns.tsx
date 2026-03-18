import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, Sparkles, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Report {
  id: string;
  name: string;
  account_id: string | null;
  created_at: string;
  updated_at: string;
}

interface AISummary {
  id: string;
  name: string;
}

interface DataStudioDropdownsProps {
  reports: Report[];
  accountId?: string;
  selectedReportId?: string;
  selectedAISummaryId?: string;
  onEditReport?: (reportId: string) => void;
  onDeleteReport?: (reportId: string) => void;
  onAddNewReport?: () => void;
  onSelectReport?: (reportId: string) => void;
  onAddAISummary?: () => void;
  onEditAISummary?: (summaryId: string) => void;
  onDeleteAISummary?: (summaryId: string) => void;
  aiSummaries?: AISummary[];
}

export function DataStudioDropdowns({
  reports,
  accountId,
  selectedReportId,
  selectedAISummaryId,
  onEditReport,
  onDeleteReport,
  onAddNewReport,
  onSelectReport,
  onAddAISummary,
  onEditAISummary,
  onDeleteAISummary,
  aiSummaries = [],
}: DataStudioDropdownsProps) {
  const navigate = useNavigate();
  const [openReportDropdown, setOpenReportDropdown] = useState(false);

  const handleReportSelect = (reportId: string) => {
    if (reportId === "add-new") {
      handleAddNewClick();
      return;
    }
    
    if (onSelectReport) {
      onSelectReport(reportId);
      return;
    }

    if (accountId) {
      navigate(`/tools/data?reportId=${reportId}`);
    } else {
      const report = reports.find(r => r.id === reportId);
      if (report?.account_id) {
        navigate(`/tools/data?reportId=${reportId}`);
      }
    }
    setOpenReportDropdown(false);
  };

  const handleAddNewClick = () => {
    if (onAddNewReport) {
      onAddNewReport();
    } else {
      navigate('/tools/data');
    }
    setOpenReportDropdown(false);
  };

  const handleAISummarySelect = (summaryId: string) => {
    if (summaryId === "add-new") {
      handleAddAISummaryClick();
      return;
    }
    
    // Use first report's name if available, otherwise fallback to legacy route
    if (reports.length > 0) {
      import("@/lib/report-url").then(({ getReportUrlWithSummary }) => {
        navigate(getReportUrlWithSummary(reports[0].name, summaryId));
      });
    } else {
      navigate(`/tools/report/${summaryId}`);
    }
  };

  const handleAddAISummaryClick = () => {
    if (onAddAISummary) {
      onAddAISummary();
    }
  };

  const selectedReport = reports.find(r => r.id === selectedReportId);

  return (
    <div className="flex items-center gap-4">
      {/* Data Studio Dropdown */}
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-foreground" />
        <span className="text-base font-medium">Data Studio</span>
        <DropdownMenu open={openReportDropdown} onOpenChange={setOpenReportDropdown}>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="min-w-[200px] justify-between">
              {selectedReport ? selectedReport.name : "Select report"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[250px]">
            {reports.map((report) => (
              <DropdownMenuItem
                key={report.id}
                className="flex items-center justify-between p-2 cursor-pointer"
                onSelect={(e) => {
                  e.preventDefault();
                  handleReportSelect(report.id);
                }}
              >
                <span className={selectedReportId === report.id ? "font-semibold" : ""}>
                  {report.name}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditReport?.(report.id);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteReport?.(report.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem
              className="text-primary cursor-pointer"
              onSelect={(e) => {
                e.preventDefault();
                handleAddNewClick();
              }}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add New Report
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Reports Dropdown */}
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-foreground" />
        <span className="text-base font-medium">Reports</span>
        <Select 
          value={selectedAISummaryId || ""} 
          onValueChange={handleAISummarySelect}
        >
          <SelectTrigger className="w-[200px] bg-background border-border">
            <SelectValue placeholder="Select AI summary" />
          </SelectTrigger>
          <SelectContent className="bg-popover border-border z-50">
            {aiSummaries.map((summary) => (
              <SelectItem key={summary.id} value={summary.id}>
                {summary.name}
              </SelectItem>
            ))}
            <SelectItem value="add-new" className="text-primary">
              <span className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Add New AI Summary
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
