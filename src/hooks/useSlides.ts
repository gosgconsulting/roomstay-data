import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Slide, SlideComponent, SlideWithDetails } from "@/types/slides";
import { toast } from "@/hooks/use-toast";
import { Json } from "@/integrations/supabase/types";

const slideKeys = {
  all: ["slides"] as const,
  list: (accountId: string) => [...slideKeys.all, "list", accountId] as const,
  detail: (slideId: string) => [...slideKeys.all, "detail", slideId] as const,
};

export function useSlides(accountId: string | null) {
  return useQuery({
    queryKey: slideKeys.list(accountId || ""),
    queryFn: async (): Promise<SlideWithDetails[]> => {
      if (!accountId) return [];

      const { data, error } = await supabase
        .from("slides")
        .select("*")
        .eq("account_id", accountId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data || []).map((slide: any) => ({
        ...slide,
        components: (slide.components || []) as SlideComponent[],
        cached_data: (slide.cached_data || {}) as Record<string, any>,
      }));
    },
    enabled: !!accountId,
  });
}

export function useSlide(slideId: string | null) {
  return useQuery({
    queryKey: slideKeys.detail(slideId || ""),
    queryFn: async (): Promise<SlideWithDetails | null> => {
      if (!slideId) return null;

      const { data, error } = await supabase
        .from("slides")
        .select("*")
        .eq("id", slideId)
        .single();

      if (error) throw error;

      return {
        ...data,
        components: (data.components || []) as SlideComponent[],
        cached_data: (data.cached_data || {}) as Record<string, any>,
      };
    },
    enabled: !!slideId,
  });
}

export function useCreateSlide() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (slide: {
      name: string;
      account_id: string;
      data_source_id?: string;
      report_id?: string;
      components?: SlideComponent[];
      user_id: string;
    }) => {
      const { data, error } = await supabase
        .from("slides")
        .insert({
          name: slide.name,
          account_id: slide.account_id,
          data_source_id: slide.data_source_id || null,
          report_id: slide.report_id || null,
          components: (slide.components || []) as unknown as Json,
          user_id: slide.user_id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: slideKeys.list(data.account_id || "") });
      toast({ title: "Slide created", description: "Your slide has been created successfully." });
    },
    onError: (error) => {
      console.error("Error creating slide:", error);
      toast({ title: "Error", description: "Failed to create slide.", variant: "destructive" });
    },
  });
}

export function useUpdateSlide() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, components, cached_data, ...rest }: Partial<Slide> & { id: string }) => {
      const updateData: any = { ...rest, updated_at: new Date().toISOString() };
      if (components) updateData.components = components as unknown as Json;
      if (cached_data) updateData.cached_data = cached_data as unknown as Json;

      const { data, error } = await supabase
        .from("slides")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: slideKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: slideKeys.list(data.account_id || "") });
    },
    onError: (error) => {
      console.error("Error updating slide:", error);
      toast({ title: "Error", description: "Failed to update slide.", variant: "destructive" });
    },
  });
}

export function useDeleteSlide() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, account_id }: { id: string; account_id: string }) => {
      const { error } = await supabase.from("slides").delete().eq("id", id);
      if (error) throw error;
      return { id, account_id };
    },
    onSuccess: ({ account_id }) => {
      queryClient.invalidateQueries({ queryKey: slideKeys.list(account_id) });
      toast({ title: "Slide deleted", description: "Your slide has been deleted successfully." });
    },
    onError: (error) => {
      console.error("Error deleting slide:", error);
      toast({ title: "Error", description: "Failed to delete slide.", variant: "destructive" });
    },
  });
}

export function useRefreshSlideData() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (slideId: string) => {
      const { data: slide, error: slideError } = await supabase
        .from("slides")
        .select("*")
        .eq("id", slideId)
        .single();

      if (slideError) throw slideError;
      
      const reportId = slide.report_id;
      if (!reportId) throw new Error("No report linked to this slide");

      const { data: dimensionData, error: dataError } = await supabase
        .from("dimension_data")
        .select("dimension_values")
        .eq("report_id", reportId)
        .limit(1000);

      if (dataError) throw dataError;

      const cachedData = {
        rows: dimensionData.map((d: any) => d.dimension_values),
        refreshedAt: new Date().toISOString(),
        rowCount: dimensionData.length,
      };

      const { data: updatedSlide, error: updateError } = await supabase
        .from("slides")
        .update({
          cached_data: cachedData as unknown as Json,
          last_refreshed_at: new Date().toISOString(),
        })
        .eq("id", slideId)
        .select()
        .single();

      if (updateError) throw updateError;
      return updatedSlide;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: slideKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: slideKeys.list(data.account_id || "") });
      toast({ title: "Data refreshed", description: "Slide data has been updated." });
    },
    onError: (error) => {
      console.error("Error refreshing slide data:", error);
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to refresh.", variant: "destructive" });
    },
  });
}

      // Fetch cached dimension data for this report
      const { data: dimensionData, error: dataError } = await supabase
        .from("dimension_data")
        .select("dimension_values")
        .eq("report_id", reportId)
        .limit(1000);

      if (dataError) throw dataError;

      // Cache the data
      const cachedData = {
        rows: dimensionData.map((d: any) => d.dimension_values),
        refreshedAt: new Date().toISOString(),
        rowCount: dimensionData.length,
      };

      // Update the slide with cached data
      const { data: updatedSlide, error: updateError } = await supabase
        .from("slides")
        .update({
          cached_data: cachedData,
          last_refreshed_at: new Date().toISOString(),
        })
        .eq("id", slideId)
        .select()
        .single();

      if (updateError) throw updateError;
      return updatedSlide;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: slideKeys.detail(data.id) });
      queryClient.invalidateQueries({ queryKey: slideKeys.list(data.account_id) });
      toast({
        title: "Data refreshed",
        description: "Slide data has been updated from the source.",
      });
    },
    onError: (error) => {
      console.error("Error refreshing slide data:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to refresh slide data.",
        variant: "destructive",
      });
    },
  });
}
