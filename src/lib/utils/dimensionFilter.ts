/**
 * Filter dimensions by view settings (FiltersBar, performance table).
 * Uses filter_dimensions or visible_dimensions from canonical views table.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
type SupabaseLike = SupabaseClient;

/**
 * Filter dimensions by filter settings (for FiltersBar).
 * Uses filter_dimensions instead of visible_dimensions.
 */
export const filterDimensionsByFilterSettings = async (
  dimensions: { id: string; name: string; [key: string]: unknown }[],
  reportId: string,
  userId: string,
  supabaseClient: SupabaseLike
): Promise<typeof dimensions> => {
  try {
    const { data: viewSettings } = await supabaseClient
      .from("views")
      .select("filter_dimensions")
      .eq("mode", "performance_table")
      .eq("report_id", reportId)
      .eq("user_id", userId)
      .eq("is_default", true)
      .maybeSingle();

    if (viewSettings?.filter_dimensions && Array.isArray(viewSettings.filter_dimensions)) {
      const filterDimensionIds = new Set(viewSettings.filter_dimensions);
      return dimensions.filter((d) => filterDimensionIds.has(d.id));
    }
    return dimensions;
  } catch (error) {
    console.error("Error filtering dimensions by filter settings:", error);
    return dimensions;
  }
};

