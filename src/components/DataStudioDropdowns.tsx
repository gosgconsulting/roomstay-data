import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart3, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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

interface DataStudioDropdownsProps {
  reports: Report[];
  accountId?: string;
  selectedReportId?: string;
  onEditReport?: (reportId: string) => void;
  onDeleteReport?: (reportId: string) => void;
  onAddNewReport?: () => void;
  onSelectReport?: (reportId: string) => void;
}

export function DataStudioDropdowns({
  reports,
  accountId,
  selectedReportId,
  onEditReport,
  onDeleteReport,
  onAddNewReport,
  onSelectReport,
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
    </div>
  );
}
