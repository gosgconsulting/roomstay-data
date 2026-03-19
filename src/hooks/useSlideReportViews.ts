/**
 * Hooks for managing slide report views
 * Handles CRUD operations for saved filter views
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SlideReportView } from "@/types/slideReports";
import { toast } from "@/hooks/use-toast";
import { Json } from "@/integrations/supabase/types";

const slideReportViewKeys = {
  all: ["views"] as const,
  list: (slideReportId: string) => [...slideReportViewKeys.all, "list", slideReportId] as const,
  detail: (viewId: string) => [...slideReportViewKeys.all, "detail", viewId] as const,
};

/**
 * Fetch all views for a slide report
 */
export function useSlideReportViews(slideReportId: string | null) {
  return useQuery({
    queryKey: slideReportViewKeys.list(slideReportId || ""),
    queryFn: async (): Promise<SlideReportView[]> => {
      if (!slideReportId) return [];

      const { data, error } = await supabase
        .from("views")
        .select("*")
        .eq("mode", "slide_view")
        .eq("slide_report_id", slideReportId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data || []).map((view: any) => ({
        ...view,
        filter_values: (view.filter_values || {}) as SlideReportView['filter_values'],
      }));
    },
    enabled: !!slideReportId,
  });
}

/**
 * Create a new view
 */
export function useCreateSlideReportView() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (view: {
      slide_report_id: string;
      account_id: string | null;
      user_id: string;
      name: string;
      selected_year: string;
      selected_month: string;
      comparison_type: 'none' | 'previous_period' | 'previous_year';
      chart_time_range?: 'this_year' | 'last_12_months' | 'last_6_months' | 'last_3_months' | null;
      price_check_chart_time_range?: 'this_year' | 'last_12_months' | 'last_6_months' | 'last_3_months' | null;
      filter_values: {
        [channel: string]: {
          [dimensionId: string]: string[];
        };
      };
    }) => {
      const { data, error } = await supabase
        .from("views")
        .insert({
          mode: "slide_view",
          slide_report_id: view.slide_report_id,
          account_id: view.account_id,
          user_id: view.user_id,
          name: view.name,
          selected_year: view.selected_year,
          selected_month: view.selected_month,
          comparison_type: view.comparison_type,
          chart_time_range: view.chart_time_range || null,
          price_check_chart_time_range: view.price_check_chart_time_range || null,
          filter_values: view.filter_values as unknown as Json,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: slideReportViewKeys.list(data.slide_report_id) });
      toast({ 
        title: "View saved", 
        description: `View "${data.name}" has been saved successfully.` 
      });
    },
    onError: (error: any) => {
      console.error("Error creating slide report view:", error);
      if (error.code === '23505') { // Unique constraint violation
        toast({ 
          title: "Error", 
          description: "A view with this name already exists.", 
          variant: "destructive" 
        });
      } else {
        toast({ 
          title: "Error", 
          description: "Failed to save view.", 
          variant: "destructive" 
        });
      }
    },
  });
}

/**
 * Update an existing view
 */
export function useUpdateSlideReportView() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      id, 
      name,
      selected_year,
      selected_month,
      comparison_type,
      chart_time_range,
      price_check_chart_time_range,
      filter_values,
      ...rest 
    }: Partial<SlideReportView> & { id: string }) => {
      const updateData: any = { ...rest, updated_at: new Date().toISOString() };
      if (name !== undefined) updateData.name = name;
      if (selected_year !== undefined) updateData.selected_year = selected_year;
      if (selected_month !== undefined) updateData.selected_month = selected_month;
      if (comparison_type !== undefined) updateData.comparison_type = comparison_type;
      if (chart_time_range !== undefined) updateData.chart_time_range = chart_time_range;
      if (price_check_chart_time_range !== undefined) updateData.price_check_chart_time_range = price_check_chart_time_range;
      if (filter_values !== undefined) updateData.filter_values = filter_values as unknown as Json;

      const { data, error } = await supabase
        .from("views")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: slideReportViewKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: slideReportViewKeys.list(data.slide_report_id) });
      toast({ 
        title: "View updated", 
        description: `View "${data.name}" has been updated.` 
      });
    },
    onError: (error) => {
      console.error("Error updating slide report view:", error);
      toast({ 
        title: "Error", 
        description: "Failed to update view.", 
        variant: "destructive" 
      });
    },
  });
}

/**
 * Delete a view
 */
export function useDeleteSlideReportView() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (viewId: string) => {
      // Get the view first to invalidate the correct queries
      const { data: view, error: fetchError } = await supabase
        .from("views")
        .select("slide_report_id, name")
        .eq("id", viewId)
        .single();

      if (fetchError) throw fetchError;

      const { error } = await supabase
        .from("views")
        .delete()
        .eq("id", viewId);

      if (error) throw error;
      return { id: viewId, slide_report_id: view.slide_report_id, name: view.name };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: slideReportViewKeys.list(data.slide_report_id) });
      toast({ 
        title: "View deleted", 
        description: `View "${data.name}" has been deleted.` 
      });
    },
    onError: (error) => {
      console.error("Error deleting slide report view:", error);
      toast({ 
        title: "Error", 
        description: "Failed to delete view.", 
        variant: "destructive" 
      });
    },
  });
}
