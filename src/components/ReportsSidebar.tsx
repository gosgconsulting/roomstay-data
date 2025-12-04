import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Edit, Trash2, Plus, BarChart3, Sparkles } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

interface ReportsSidebarProps {
  reports: Report[];
  accountId?: string;
  onEditReport?: (reportId: string) => void;
  onDeleteReport?: (reportId: string) => void;
  onAddNewReport?: () => void;
  onSelectReport?: (reportId: string) => void;
  onAddAISummary?: () => void;
  onEditAISummary?: (summaryId: string) => void;
  onDeleteAISummary?: (summaryId: string) => void;
  aiSummaries?: AISummary[];
  className?: string;
}

/**
 * Sidebar component for reports navigation
 * Displays a list of reports with hover actions for edit/delete
 */
export function ReportsSidebar({
  reports,
  accountId,
  onEditReport,
  onDeleteReport,
  onAddNewReport,
  onSelectReport,
  onAddAISummary,
  onEditAISummary,
  onDeleteAISummary,
  aiSummaries = [],
  className,
}: ReportsSidebarProps) {
  const navigate = useNavigate();
  const [hoveredReportId, setHoveredReportId] = useState<string | null>(null);
  const [hoveredSummaryId, setHoveredSummaryId] = useState<string | null>(null);

  const handleReportClick = (reportId: string) => {
    // Prefer local switch if provided
    if (onSelectReport) {
      onSelectReport(reportId);
      return;
    }

    // Fallback: navigate to the report page
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
      // Default behavior - navigate to report creation
      if (accountId) {
        navigate(`/tools/report/${accountId}`);
      } else {
        navigate('/tools/report');
      }
    }
  };

  const handleAISummaryClick = (summaryId: string) => {
    if (accountId) {
      navigate(`/tools/ai-summary/${accountId}/${summaryId}`);
    }
  };

  const handleAddAISummaryClick = () => {
    if (onAddAISummary) {
      onAddAISummary();
    }
  };

  return (
    <Sidebar collapsible="icon" className={cn("w-64 border-r bg-sidebar", className)}>
      <SidebarContent className="p-6">
        {/* Reports Section */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-base font-medium text-sidebar-foreground mb-6 px-0">
            Reports
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-2">
              {/* Individual Reports */}
              {reports.map((report) => (
                <SidebarMenuItem key={report.id}>
                  <div
                    className="relative group"
                    onMouseEnter={() => setHoveredReportId(report.id)}
                    onMouseLeave={() => setHoveredReportId(null)}
                  >
                    <SidebarMenuButton
                      onClick={() => handleReportClick(report.id)}
                      tooltip={report.name}
                      className="w-full justify-start text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground px-3 py-2 h-auto font-normal pr-16"
                    >
                      <BarChart3 className="h-4 w-4" />
                      <span className="truncate">{report.name}</span>
                    </SidebarMenuButton>
                    
                    {hoveredReportId === report.id && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        {onEditReport && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 hover:bg-sidebar-accent rounded-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditReport(report.id);
                            }}
                            title="Edit report"
                          >
                            <Edit className="h-3 w-3 text-sidebar-foreground" />
                          </Button>
                        )}
                        {onDeleteReport && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground rounded-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteReport(report.id);
                            }}
                            title="Delete report"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </SidebarMenuItem>
              ))}

              {/* Add New Report */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={handleAddNewClick}
                  tooltip="Add new report"
                  className="w-full justify-start text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground px-3 py-2 h-auto font-normal"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  <span>Add New</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* AI Summary Section */}
        <SidebarGroup className="mt-8">
          <SidebarGroupLabel className="text-base font-medium text-sidebar-foreground mb-6 px-0">
            AI Summary
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-2">
              {/* AI Summaries List */}
              {aiSummaries.map((summary) => (
                <SidebarMenuItem key={summary.id}>
                  <div
                    className="relative group"
                    onMouseEnter={() => setHoveredSummaryId(summary.id)}
                    onMouseLeave={() => setHoveredSummaryId(null)}
                  >
                    <SidebarMenuButton
                      onClick={() => handleAISummaryClick(summary.id)}
                      tooltip={summary.name}
                      className="w-full justify-start text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground px-3 py-2 h-auto font-normal pr-16"
                    >
                      <Sparkles className="h-4 w-4" />
                      <span className="truncate">{summary.name}</span>
                    </SidebarMenuButton>
                    
                    {hoveredSummaryId === summary.id && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        {onEditAISummary && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 hover:bg-sidebar-accent rounded-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditAISummary(summary.id);
                            }}
                            title="Edit AI summary"
                          >
                            <Edit className="h-3 w-3 text-sidebar-foreground" />
                          </Button>
                        )}
                        {onDeleteAISummary && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground rounded-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteAISummary(summary.id);
                            }}
                            title="Delete AI summary"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </SidebarMenuItem>
              ))}

              {/* Add New AI Summary */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={handleAddAISummaryClick}
                  tooltip="Add new AI summary"
                  className="w-full justify-start text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground px-3 py-2 h-auto font-normal"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  <span>Add New</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
