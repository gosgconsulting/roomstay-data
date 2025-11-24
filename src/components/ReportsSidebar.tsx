import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Edit, Trash2, Plus } from "lucide-react";
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

interface ReportsSidebarProps {
  reports: Report[];
  accountId?: string;
  onEditReport?: (reportId: string) => void;
  onDeleteReport?: (reportId: string) => void;
  onAddNewReport?: () => void;
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
  className,
}: ReportsSidebarProps) {
  const navigate = useNavigate();
  const [hoveredReportId, setHoveredReportId] = useState<string | null>(null);

  const handleReportClick = (reportId: string) => {
    if (accountId) {
      navigate(`/tools/report/${accountId}?reportId=${reportId}`);
    } else {
      // Find the report's account_id if not provided
      const report = reports.find(r => r.id === reportId);
      if (report?.account_id) {
        navigate(`/tools/report/${report.account_id}?reportId=${reportId}`);
      }
    }
  };

  const handleAllReportsClick = () => {
    if (accountId) {
      navigate(`/all-reports/${accountId}`);
    } else {
      navigate('/all-reports');
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

  return (
    <Sidebar className={cn("w-64 border-r bg-sidebar", className)}>
      <SidebarContent className="p-6">
        <SidebarGroup>
          <SidebarGroupLabel className="text-base font-medium text-sidebar-foreground mb-6 px-0">
            Reports
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="space-y-2">
              {/* All Reports */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={handleAllReportsClick}
                  className="w-full justify-start text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground px-3 py-2 h-auto font-normal"
                >
                  All reports
                </SidebarMenuButton>
              </SidebarMenuItem>

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
                      className="w-full justify-start text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground px-3 py-2 h-auto font-normal pr-16"
                    >
                      <span className="truncate">
                        [{report.name}]
                      </span>
                    </SidebarMenuButton>
                    
                    {/* Hover Actions */}
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

              {/* Demo Reports - Show SEM and Metasearch as examples if no reports */}
              {reports.length === 0 && (
                <>
                  <SidebarMenuItem>
                    <div
                      className="relative group"
                      onMouseEnter={() => setHoveredReportId('demo-sem')}
                      onMouseLeave={() => setHoveredReportId(null)}
                    >
                      <SidebarMenuButton
                        onClick={() => console.log('Demo SEM report clicked')}
                        className="w-full justify-start text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground px-3 py-2 h-auto font-normal pr-16"
                      >
                        <span className="truncate">
                          [SEM]
                        </span>
                      </SidebarMenuButton>
                      
                      {/* Hover Actions */}
                      {hoveredReportId === 'demo-sem' && (
                        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 hover:bg-sidebar-accent rounded-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              console.log('Edit SEM report');
                            }}
                            title="Edit report"
                          >
                            <Edit className="h-3 w-3 text-sidebar-foreground" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground rounded-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              console.log('Delete SEM report');
                            }}
                            title="Delete report"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </SidebarMenuItem>

                  <SidebarMenuItem>
                    <SidebarMenuButton
                      onClick={() => console.log('Demo Metasearch report clicked')}
                      className="w-full justify-start text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground px-3 py-2 h-auto font-normal"
                    >
                      <span className="truncate">
                        [Metasearch]
                      </span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </>
              )}

              {/* Add New Report */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={handleAddNewClick}
                  className="w-full justify-start text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground px-3 py-2 h-auto font-normal"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  [Add New]
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
