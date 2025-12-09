import React, { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, BarChart3, Sparkles, Calendar, Wallet } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { format, subMonths, startOfYear } from "date-fns";

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

// DateTab can be "mtd", "ytd", or a month key like "2025-11"
export type DateTab = "mtd" | "ytd" | string;

// Report tabs for AI Summary pivot table (Overview + individual reports)
export type ReportTab = "overview" | "budget" | string;

interface ReportsSidebarProps {
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
  className?: string;
  // Date tab props for AI Summary
  selectedDateTab?: DateTab;
  onDateTabChange?: (tab: DateTab) => void;
  showDateTabs?: boolean;
  // Report tabs for AI Summary pivot table
  aiSummaryReportTabs?: { id: string; name: string }[];
  selectedReportTab?: ReportTab;
  onReportTabChange?: (tab: ReportTab) => void;
}

/**
 * Sidebar component for reports navigation
 * Uses dropdown selects for reports and AI summaries
 */
export function ReportsSidebar({
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
  className,
  selectedDateTab,
  onDateTabChange,
  showDateTabs = false,
  aiSummaryReportTabs = [],
  selectedReportTab = "overview",
  onReportTabChange,
}: ReportsSidebarProps) {
  const navigate = useNavigate();

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
      navigate(`/tools/report/${accountId}?reportId=${reportId}`);
    } else {
      const report = reports.find(r => r.id === reportId);
      if (report?.account_id) {
        navigate(`/tools/report/${report.account_id}?reportId=${reportId}`);
      }
    }
  };

  const handleAddNewClick = () => {
    if (onAddNewReport) {
      onAddNewReport();
    } else {
      if (accountId) {
        navigate(`/tools/report/${accountId}`);
      } else {
        navigate('/tools/report');
      }
    }
  };

  const handleAISummarySelect = (summaryId: string) => {
    if (summaryId === "add-new") {
      handleAddAISummaryClick();
      return;
    }
    
    if (accountId) {
      navigate(`/tools/ai-summary/${accountId}/${summaryId}`);
    }
  };

  const handleAddAISummaryClick = () => {
    if (onAddAISummary) {
      onAddAISummary();
    }
  };

  // Generate date options: YTD at top, then MTD (current month), then previous months
  const dateOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    const now = new Date();
    const yearStart = startOfYear(now);
    const currentMonthKey = format(now, "yyyy-MM");
    
    // Add YTD at the top
    options.push({ value: "ytd", label: "YTD" });
    
    // Start from current month and go back to January
    let current = now;
    while (current >= yearStart) {
      const monthKey = format(current, "yyyy-MM");
      // Label current month as "MTD", others as month name
      const monthLabel = monthKey === currentMonthKey ? "MTD" : format(current, "MMMM yyyy");
      options.push({ value: monthKey, label: monthLabel });
      current = subMonths(current, 1);
    }
    
    return options;
  }, []);

  // Get default value (current month)
  const defaultDateValue = useMemo(() => {
    return format(new Date(), "yyyy-MM");
  }, []);

  return (
    <Sidebar collapsible="icon" className={cn("w-64 border-r bg-sidebar", className)}>
      <SidebarContent className="p-6">
        {/* Data Studio Section */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-base font-medium text-sidebar-foreground mb-3 px-0 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Data Studio
          </SidebarGroupLabel>
          <SidebarGroupContent className="space-y-1">
            {reports.map((report) => (
              <Button
                key={report.id}
                variant={selectedReportId === report.id ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start text-left h-9 px-3",
                  selectedReportId === report.id && "bg-accent text-accent-foreground"
                )}
                onClick={() => handleReportSelect(report.id)}
              >
                {report.name}
              </Button>
            ))}
            <Button
              variant="ghost"
              className="w-full justify-start text-left h-9 px-3 text-primary hover:text-primary"
              onClick={handleAddNewClick}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add New Report
            </Button>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Reports Section */}
        <SidebarGroup className="mt-6">
          <SidebarGroupLabel className="text-base font-medium text-sidebar-foreground mb-3 px-0 flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Reports
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <Select 
              value={selectedAISummaryId || ""} 
              onValueChange={handleAISummarySelect}
            >
              <SelectTrigger className="w-full bg-background border-border">
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
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Report Tabs - Only shown when showDateTabs is true and there are report tabs */}
        {showDateTabs && aiSummaryReportTabs.length > 0 && (
          <div className="mt-3 space-y-1">
            <Button
              variant={selectedReportTab === "overview" ? "secondary" : "ghost"}
              className={cn(
                "w-full justify-start text-left h-9 px-3",
                selectedReportTab === "overview" && "bg-accent text-accent-foreground"
              )}
              onClick={() => onReportTabChange?.("overview")}
            >
              Overview
            </Button>
            {aiSummaryReportTabs.map((report) => (
              <Button
                key={report.id}
                variant={selectedReportTab === report.id ? "secondary" : "ghost"}
                className={cn(
                  "w-full justify-start text-left h-9 px-3",
                  selectedReportTab === report.id && "bg-accent text-accent-foreground"
                )}
                onClick={() => onReportTabChange?.(report.id)}
              >
                {report.name}
              </Button>
            ))}
            <Button
              variant={selectedReportTab === "budget" ? "secondary" : "ghost"}
              className={cn(
                "w-full justify-start text-left h-9 px-3",
                selectedReportTab === "budget" && "bg-accent text-accent-foreground"
              )}
              onClick={() => onReportTabChange?.("budget")}
            >
              Budget
            </Button>
          </div>
        )}

      </SidebarContent>
    </Sidebar>
  );
}
