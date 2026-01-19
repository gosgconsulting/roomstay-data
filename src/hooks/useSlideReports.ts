import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SlideReport, SlideReportConfiguration, SlideReportPivotData, SlideReportDateRange } from "@/types/slideReports";
import { toast } from "@/hooks/use-toast";
import { Json } from "@/integrations/supabase/types";

const slideReportKeys = {
  all: ["slide_reports"] as const,
  list: (accountId: string) => [...slideReportKeys.all, "list", accountId] as const,
  detail: (slideReportId: string) => [...slideReportKeys.all, "detail", slideReportId] as const,
};

export function useSlideReports(accountId: string | null) {
  return useQuery({
    queryKey: slideReportKeys.list(accountId || ""),
    queryFn: async (): Promise<SlideReport[]> => {
      if (!accountId) return [];

      const { data, error } = await supabase
        .from("slide_reports")
        .select("*")
        .eq("account_id", accountId)
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data || []).map((report: any) => ({
        ...report,
        configuration: (report.configuration || {}) as unknown as SlideReportConfiguration,
        report_ids: (report.report_ids || {}) as unknown as Record<string, string>,
        pivot_data: (report.pivot_data || {}) as unknown as SlideReportPivotData,
        date_range: (report.date_range || null) as unknown as SlideReportDateRange | null,
      }));
    },
    enabled: !!accountId,
  });
}

export function useSlideReport(slideReportId: string | null) {
  return useQuery({
    queryKey: slideReportKeys.detail(slideReportId || ""),
    queryFn: async (): Promise<SlideReport | null> => {
      if (!slideReportId) return null;

      const { data, error } = await supabase
        .from("slide_reports")
        .select("*")
        .eq("id", slideReportId)
        .maybeSingle();

      if (error) throw error;

      return {
        ...data,
        configuration: (data.configuration || {}) as unknown as SlideReportConfiguration,
        report_ids: (data.report_ids || {}) as unknown as Record<string, string>,
        pivot_data: (data.pivot_data || {}) as unknown as SlideReportPivotData,
        date_range: (data.date_range || null) as unknown as SlideReportDateRange | null,
      };
    },
    enabled: !!slideReportId,
  });
}

export function useCreateSlideReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (report: {
      name: string;
      account_id: string;
      user_id: string;
      configuration?: SlideReportConfiguration;
      report_ids?: Record<string, string>;
      pivot_data?: SlideReportPivotData;
      date_range?: SlideReportDateRange | null;
      description?: string;
    }) => {
      const { data, error } = await supabase
        .from("slide_reports")
        .insert({
          name: report.name,
          account_id: report.account_id,
          user_id: report.user_id,
          configuration: (report.configuration || {}) as unknown as Json,
          report_ids: (report.report_ids || {}) as unknown as Json,
          pivot_data: (report.pivot_data || {}) as unknown as Json,
          date_range: (report.date_range || null) as unknown as Json,
          description: report.description || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: slideReportKeys.list(data.account_id || "") });
      toast({ title: "Slide report created", description: "Your slide report has been created successfully." });
    },
    onError: (error) => {
      console.error("Error creating slide report:", error);
      toast({ title: "Error", description: "Failed to create slide report.", variant: "destructive" });
    },
  });
}

export function useUpdateSlideReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      id, 
      configuration, 
      report_ids,
      pivot_data, 
      date_range,
      ...rest 
    }: Partial<SlideReport> & { id: string }) => {
      const updateData: any = { ...rest, updated_at: new Date().toISOString() };
      if (configuration) updateData.configuration = configuration as unknown as Json;
      if (report_ids) updateData.report_ids = report_ids as unknown as Json;
      if (pivot_data) updateData.pivot_data = pivot_data as unknown as Json;
      if (date_range !== undefined) updateData.date_range = date_range as unknown as Json;

      const { data, error } = await supabase
        .from("slide_reports")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: slideReportKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: slideReportKeys.list(data.account_id || "") });
    },
    onError: (error) => {
      console.error("Error updating slide report:", error);
      toast({ title: "Error", description: "Failed to update slide report.", variant: "destructive" });
    },
  });
}

export function useDeleteSlideReport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, account_id }: { id: string; account_id: string }) => {
      const { error } = await supabase.from("slide_reports").delete().eq("id", id);
      if (error) throw error;
      return { id, account_id };
    },
    onSuccess: ({ account_id }) => {
      queryClient.invalidateQueries({ queryKey: slideReportKeys.list(account_id) });
      toast({ title: "Slide report deleted", description: "Your slide report has been deleted successfully." });
    },
    onError: (error) => {
      console.error("Error deleting slide report:", error);
      toast({ title: "Error", description: "Failed to delete slide report.", variant: "destructive" });
    },
  });
}

export function useRefreshSlideReportData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (slideReportId: string) => {
      // Fetch the slide report
      const { data: slideReport, error: slideError } = await supabase
        .from("slide_reports")
        .select("*")
        .eq("id", slideReportId)
        .single();

      if (slideError) throw slideError;
      if (!slideReport) throw new Error("Slide report not found");

      // Import computation function
      const { computeSlideReportPivotData } = await import("@/lib/slideReportPivotComputation");

      // Compute pivot data
      if (!slideReport.date_range) {
        throw new Error("Date range not set for slide report");
      }

      const pivotData = await computeSlideReportPivotData(
        slideReport.report_ids as unknown as Record<string, string>,
        slideReport.configuration as unknown as SlideReportConfiguration,
        slideReport.date_range as unknown as SlideReportDateRange
      );

      // Update the slide report with computed pivot data
      const { data: updatedReport, error: updateError } = await supabase
        .from("slide_reports")
        .update({
          pivot_data: pivotData as unknown as Json,
          last_refreshed_at: new Date().toISOString(),
        })
        .eq("id", slideReportId)
        .select()
        .single();

      if (updateError) throw updateError;
      return updatedReport;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: slideReportKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: slideReportKeys.list(data.account_id || "") });
      toast({ title: "Data refreshed", description: "Slide report data has been updated." });
    },
    onError: (error) => {
      console.error("Error refreshing slide report data:", error);
      toast({ 
        title: "Error", 
        description: error instanceof Error ? error.message : "Failed to refresh.", 
        variant: "destructive" 
      });
    },
  });
}
