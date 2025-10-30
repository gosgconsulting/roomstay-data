import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { DashboardHeader } from "@/components/DashboardHeader";
import { KPIMetricsCards } from "@/components/KPIMetricsCards";
import { KPIChartsGrid } from "@/components/KPIChartsGrid";
import { PerformanceTable } from "@/components/PerformanceTable";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Session } from "@supabase/supabase-js";

const Index = () => {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reportId, setReportId] = useState<string | null>(null);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setIsLoading(false);
        
        if (!session) {
          navigate("/auth");
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsLoading(false);
      
      if (!session) {
        navigate("/auth");
      } else {
        loadOrCreateReport(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const loadOrCreateReport = async (userId: string) => {
    try {
      // Try to get existing report
      const { data: reports, error: fetchError } = await supabase
        .from("reports")
        .select("*")
        .eq("user_id", userId)
        .limit(1);

      if (fetchError) throw fetchError;

      if (reports && reports.length > 0) {
        setReportId(reports[0].id);
      } else {
        // Create a default report
        const { data: newReport, error: createError } = await supabase
          .from("reports")
          .insert({
            user_id: userId,
            name: "Hotel Performance Report",
          })
          .select()
          .single();

        if (createError) throw createError;
        setReportId(newReport.id);
      }
    } catch (error) {
      console.error("Error loading/creating report:", error);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold">Data Dashboard</h1>
            <span className="text-sm text-muted-foreground">{session.user.email}</span>
          </div>
          <Button variant="outline" onClick={handleSignOut}>
            Sign Out
          </Button>
        </div>
      </div>
      <DashboardHeader reportId={reportId} />
      <main className="container mx-auto px-6 py-6 space-y-6">
        <KPIMetricsCards reportId={reportId} />
        <KPIChartsGrid reportId={reportId} />
        <PerformanceTable reportId={reportId} />
      </main>
    </div>
  );
};

export default Index;
