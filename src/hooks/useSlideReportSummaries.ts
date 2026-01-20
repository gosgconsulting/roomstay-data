import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface SlideReportSummary {
  id: string;
  slide_report_id: string;
  account_id: string | null;
  user_id: string;
  tab: 'overview' | 'metasearch' | 'sem' | 'social';
  selected_year: string;
  selected_month: string;
  view_id: string | null;
  comparison_type: 'previous_period' | 'previous_year' | 'both';
  summary_text: string;
  source: 'ai' | 'algorithm';
  created_at: string;
  updated_at: string;
}

interface SaveSummaryParams {
  slide_report_id: string;
  tab: 'overview' | 'metasearch' | 'sem' | 'social';
  selected_year: string;
  selected_month: string;
  view_id?: string | null;
  comparison_type: 'previous_period' | 'previous_year' | 'both';
  summary_text: string;
  source: 'ai' | 'algorithm';
}

export function useSlideReportSummaries(slideReportId: string | null) {
  return useQuery({
    queryKey: ['slideReportSummaries', slideReportId],
    queryFn: async () => {
      if (!slideReportId) return [];

      const { data, error } = await supabase
        .from('slide_report_summaries')
        .select('*')
        .eq('slide_report_id', slideReportId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as SlideReportSummary[];
    },
    enabled: !!slideReportId,
  });
}

export function useSaveSlideReportSummary() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: SaveSummaryParams) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const { data: accountData } = await supabase
        .from('accounts')
        .select('id')
        .eq('user_id', session.user.id)
        .single();

      const summaryData = {
        ...params,
        account_id: accountData?.id || null,
        user_id: session.user.id,
      };

      // Check if a summary already exists for this combination
      // Handle NULL view_id by checking both NULL and the actual value
      let existingQuery = supabase
        .from('slide_report_summaries')
        .select('id')
        .eq('slide_report_id', params.slide_report_id)
        .eq('tab', params.tab)
        .eq('selected_year', params.selected_year)
        .eq('selected_month', params.selected_month);

      if (params.view_id) {
        existingQuery = existingQuery.eq('view_id', params.view_id);
      } else {
        existingQuery = existingQuery.is('view_id', null);
      }

      const { data: existing } = await existingQuery.single();

      let result;
      if (existing) {
        // Update existing record
        const { data, error } = await supabase
          .from('slide_report_summaries')
          .update(summaryData)
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        result = data;
      } else {
        // Insert new record
        const { data, error } = await supabase
          .from('slide_report_summaries')
          .insert(summaryData)
          .select()
          .single();

        if (error) throw error;
        result = data;
      }

      return result as SlideReportSummary;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['slideReportSummaries', data.slide_report_id] });
    },
  });
}

export function useGetSummaryForTab(
  slideReportId: string | null,
  tab: 'overview' | 'metasearch' | 'sem' | 'social',
  selectedYear: string,
  selectedMonth: string,
  viewId?: string | null
) {
  const { data: summaries } = useSlideReportSummaries(slideReportId);

  return summaries?.find(
    (summary) =>
      summary.tab === tab &&
      summary.selected_year === selectedYear &&
      summary.selected_month === selectedMonth &&
      (summary.view_id === viewId || (!summary.view_id && !viewId))
  );
}
