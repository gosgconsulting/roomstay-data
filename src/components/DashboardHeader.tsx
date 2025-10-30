import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar, ChevronDown, Database, Share2, Plus, Trash2 } from "lucide-react";
import { useState, useEffect } from "react";
import { DataSourceModal } from "./DataSourceModal";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Report {
  id: string;
  name: string;
}

export const DashboardHeader = () => {
  const [showDataSourceModal, setShowDataSourceModal] = useState(false);
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

      if (data && data.length > 0) {
        setReports(data);
        setCurrentReport(data[0]);
      } else {
        // Create a default report if none exists
        await createDefaultReport();
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

  const createDefaultReport = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error("User not authenticated");
      }

      const { data, error } = await supabase
        .from('reports')
        .insert({ 
          name: 'My First Report',
          user_id: user.id 
        })
        .select()
        .single();

      if (error) throw error;

      setReports([data]);
      setCurrentReport(data);
      
      toast({
        title: "Welcome!",
        description: "Created your first report",
      });
    } catch (error) {
      console.error("Error creating default report:", error);
      toast({
        title: "Error",
        description: "Failed to create default report",
        variant: "destructive",
      });
    }
  };

  const handleCreateReport = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error("User not authenticated");
      }

      const { data, error } = await supabase
        .from('reports')
        .insert({ 
          name: `Report ${reports.length + 1}`,
          user_id: user.id 
        })
        .select()
        .single();

      if (error) throw error;

      setReports([...reports, data]);
      setCurrentReport(data);
      
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

  const handleDeleteReport = async () => {
    if (!currentReport) return;

    if (reports.length === 1) {
      toast({
        title: "Cannot delete",
        description: "You must have at least one report",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('reports')
        .delete()
        .eq('id', currentReport.id);

      if (error) throw error;

      const updatedReports = reports.filter(r => r.id !== currentReport.id);
      setReports(updatedReports);
      setCurrentReport(updatedReports[0]);
      
      toast({
        title: "Report deleted",
        description: `Deleted "${currentReport.name}"`,
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
            <DropdownMenuContent align="start" className="w-56">
              {reports.map((report) => (
                <DropdownMenuItem 
                  key={report.id}
                  onClick={() => setCurrentReport(report)}
                >
                  {report.name}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem className="text-primary" onClick={handleCreateReport}>
                <Plus className="h-4 w-4 mr-2" />
                Add new
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={handleDeleteReport}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setShowDataSourceModal(true)}
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
        <DataSourceModal
          open={showDataSourceModal}
          onOpenChange={setShowDataSourceModal}
          reportId={currentReport.id}
        />
      )}
    </>
  );
};
