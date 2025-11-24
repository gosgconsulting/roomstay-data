import React from "react";
import { ReportsSidebar } from "./ReportsSidebar";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { Card } from "@/components/ui/card";

/**
 * Demo component to showcase the ReportsSidebar functionality
 */
export function ReportsSidebarDemo() {
  // Sample reports data
  const sampleReports = [
    {
      id: "1",
      name: "SEM",
      account_id: "account-1",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    },
    {
      id: "2", 
      name: "Metasearch",
      account_id: "account-1",
      created_at: "2024-01-02T00:00:00Z",
      updated_at: "2024-01-02T00:00:00Z",
    },
  ];

  const handleEditReport = (reportId: string) => {
    console.log('[testing] Demo - Edit report:', reportId);
    alert(`Edit report: ${reportId}`);
  };

  const handleDeleteReport = (reportId: string) => {
    console.log('[testing] Demo - Delete report:', reportId);
    if (confirm(`Delete report ${reportId}?`)) {
      alert(`Report ${reportId} deleted!`);
    }
  };

  const handleAddNewReport = () => {
    console.log('[testing] Demo - Add new report');
    alert('Add new report clicked!');
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen bg-background flex">
        <ReportsSidebar
          reports={sampleReports}
          accountId="account-1"
          onEditReport={handleEditReport}
          onDeleteReport={handleDeleteReport}
          onAddNewReport={handleAddNewReport}
        />
        
        <SidebarInset className="flex-1">
          <main className="container mx-auto px-6 py-6">
            <Card className="p-6">
              <h1 className="text-2xl font-bold mb-4">Reports Sidebar Demo</h1>
              <div className="space-y-4">
                <p className="text-muted-foreground">
                  This demo showcases the ReportsSidebar component with the following features:
                </p>
                <ul className="list-disc list-inside space-y-2 text-sm">
                  <li><strong>Reports headline</strong> - Main navigation title</li>
                  <li><strong>All reports</strong> - Link to view all reports</li>
                  <li><strong>[SEM]</strong> - Individual report with hover actions (edit/delete)</li>
                  <li><strong>[Metasearch]</strong> - Another individual report</li>
                  <li><strong>[Add New]</strong> - Button to create a new report</li>
                </ul>
                <div className="mt-6 p-4 bg-muted rounded-lg">
                  <h3 className="font-semibold mb-2">Try hovering over the report items!</h3>
                  <p className="text-sm text-muted-foreground">
                    When you hover over the [SEM] report in the sidebar, you'll see edit and delete buttons appear.
                    Click on any sidebar item to see the navigation in action.
                  </p>
                </div>
              </div>
            </Card>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
