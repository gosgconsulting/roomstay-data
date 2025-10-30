import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Calendar, ChevronDown, Database, Share2, Plus, Trash2, Pencil } from "lucide-react";
import { useState, useEffect } from "react";
import { DataSourceModal } from "./DataSourceModal";
import { DataSourcesListModal } from "./DataSourcesListModal";
import { ReportModal } from "./ReportModal";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Report {
  id: string;
  name: string;
}

export const DashboardHeader = () => {
  const [showDataSourceModal, setShowDataSourceModal] = useState(false);
  const [showDataSourcesListModal, setShowDataSourcesListModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [editingReport, setEditingReport] = useState<Report | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [currentReport, setCurrentReport] = useState<Report | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      const { data, error } = await supabase
        .from('reports')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      setReports(data || []);
      if (data && data.length > 0) {
        setCurrentReport(data[0]);
      }
    } catch (error) {
      console.error("Error loading reports:", error);
      toast({
        title: "Error loading reports",
        description: "Failed to load your reports",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateReport = async (name: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error("User not authenticated");
      }

      const { data, error } = await supabase
        .from('reports')
        .insert({ 
          name,
          user_id: user.id 
        })
        .select()
        .single();

      if (error) throw error;

      setReports([data, ...reports]);
      setCurrentReport(data);
      setShowReportModal(false);
      
      toast({
        title: "Report created",
        description: `Created "${data.name}"`,
      });
    } catch (error) {
      console.error("Error creating report:", error);
      toast({
        title: "Error",
        description: "Failed to create report",
        variant: "destructive",
      });
    }
  };

  const handleEditReport = async (name: string) => {
    if (!editingReport) return;

    try {
      const { error } = await supabase
        .from('reports')
        .update({ name })
        .eq('id', editingReport.id);

      if (error) throw error;

      const updatedReports = reports.map(r => 
        r.id === editingReport.id ? { ...r, name } : r
      );
      setReports(updatedReports);
      
      if (currentReport?.id === editingReport.id) {
        setCurrentReport({ ...currentReport, name });
      }

      setShowReportModal(false);
      setEditingReport(null);
      
      toast({
        title: "Report updated",
        description: `Renamed to "${name}"`,
      });
    } catch (error) {
      console.error("Error updating report:", error);
      toast({
        title: "Error",
        description: "Failed to update report",
        variant: "destructive",
      });
    }
  };

  const handleDeleteReport = async (report: Report) => {
    try {
      const { error } = await supabase
        .from('reports')
        .delete()
        .eq('id', report.id);

      if (error) throw error;

      const updatedReports = reports.filter(r => r.id !== report.id);
      setReports(updatedReports);
      
      if (currentReport?.id === report.id) {
        setCurrentReport(updatedReports[0] || null);
      }
      
      toast({
        title: "Report deleted",
        description: `Deleted "${report.name}"`,
      });
    } catch (error) {
      console.error("Error deleting report:", error);
      toast({
        title: "Error",
        description: "Failed to delete report",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <header className="border-b bg-card px-6 py-3 flex items-center justify-between">
        <div className="text-muted-foreground">Loading...</div>
      </header>
    );
  }

  return (
    <>
      <header className="border-b bg-card px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                {currentReport?.name || "Select Report"} <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56 bg-background z-50">
              {reports.map((report) => (
                <DropdownMenuItem 
                  key={report.id}
                  className="justify-between group"
                  onSelect={(e) => e.preventDefault()}
                >
                  <span 
                    className="flex-1 cursor-pointer"
                    onClick={() => setCurrentReport(report)}
                  >
                    {report.name}
                  </span>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingReport(report);
                        setShowReportModal(true);
                      }}
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteReport(report);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </DropdownMenuItem>
              ))}
              {reports.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem 
                className="text-primary" 
                onClick={() => {
                  setEditingReport(null);
                  setShowReportModal(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add new
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setShowDataSourcesListModal(true)}
            disabled={!currentReport}
          >
            <Database className="h-4 w-4" />
            Data sources
          </Button>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" className="gap-2">
            <Share2 className="h-4 w-4" />
            Share
          </Button>
          <Button variant="outline" className="gap-2">
            <Calendar className="h-4 w-4" />
            Date
          </Button>
        </div>
      </header>

      {currentReport && (
        <>
          <DataSourcesListModal
            open={showDataSourcesListModal}
            onOpenChange={setShowDataSourcesListModal}
            reportId={currentReport.id}
            onAddNew={() => {
              setShowDataSourcesListModal(false);
              setShowDataSourceModal(true);
            }}
          />
          
          <DataSourceModal
            open={showDataSourceModal}
            onOpenChange={(open) => {
              setShowDataSourceModal(open);
              if (!open) {
                // Reopen the list modal when closing the add modal
                setShowDataSourcesListModal(true);
              }
            }}
            reportId={currentReport.id}
          />
        </>
      )}

      <ReportModal
        open={showReportModal}
        onOpenChange={(open) => {
          setShowReportModal(open);
          if (!open) setEditingReport(null);
        }}
        onSave={editingReport ? handleEditReport : handleCreateReport}
        initialName={editingReport?.name}
        title={editingReport ? "Edit Report" : "Create New Report"}
        description={editingReport ? "Update the report name" : "Enter a name for your new report"}
      />
    </>
  );
};
