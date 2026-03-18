-- Unified views table (canonical for filters + view persistence)
-- Replaces both:
-- - public.report_views (PerformanceTable / Data dashboard)
-- - public.slide_report_views (SlideView saved filter views)
--
-- Strategy:
-- - Create superset table `public.views`
-- - Backfill using the SAME ids as legacy tables (id-preserving) so share_links/budgets `view_id` can be repointed safely
-- - Add public-read policy for shared views referenced by share_links (matches prior slide_report_views policy)
--
-- Safe to apply multiple times.

BEGIN;

CREATE TABLE IF NOT EXISTS public.views (
  id uuid PRIMARY KEY,
  mode text NOT NULL CHECK (mode IN ('performance_table', 'slide_view')),

  -- Common identity / ownership
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- PerformanceTable view scope
  report_id uuid REFERENCES public.reports(id) ON DELETE CASCADE,

  -- PerformanceTable settings (from report_views + follow-up migrations)
  group_by_dimensions text[] DEFAULT ARRAY[]::text[],
  breakdown_by_dimensions text[] DEFAULT ARRAY[]::text[],
  then_by_dimensions text[] DEFAULT ARRAY[]::text[],
  visible_columns uuid[] DEFAULT ARRAY[]::uuid[],
  column_order uuid[] DEFAULT ARRAY[]::uuid[],
  is_default boolean DEFAULT false,
  visible_kpis text[] DEFAULT ARRAY[]::text[],
  kpi_order text[] DEFAULT ARRAY[]::text[],
  date_granularity text DEFAULT 'none',
  date_order text DEFAULT 'desc',
  filter_dimensions text[] DEFAULT ARRAY[]::text[],
  filter_values jsonb DEFAULT '{}'::jsonb,
  date_range_start date,
  date_range_end date,
  date_range_preset text DEFAULT 'this_month',

  -- SlideView scope + settings (from slide_report_views + follow-up migrations)
  slide_report_id uuid REFERENCES public.slide_reports(id) ON DELETE CASCADE,
  selected_year text,
  selected_month text,
  comparison_type text CHECK (comparison_type IN ('none', 'previous_period', 'previous_year')),
  tab text,
  chart_time_range text CHECK (chart_time_range IN ('this_year', 'last_12_months', 'last_6_months', 'last_3_months')),
  price_check_chart_time_range text CHECK (price_check_chart_time_range IN ('this_year', 'last_12_months', 'last_6_months', 'last_3_months'))
);

ALTER TABLE public.views ENABLE ROW LEVEL SECURITY;

-- Owner CRUD policies (matches prior patterns)
DROP POLICY IF EXISTS "Users can view their own views" ON public.views;
CREATE POLICY "Users can view their own views"
ON public.views
FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own views" ON public.views;
CREATE POLICY "Users can create their own views"
ON public.views
FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own views" ON public.views;
CREATE POLICY "Users can update their own views"
ON public.views
FOR UPDATE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own views" ON public.views;
CREATE POLICY "Users can delete their own views"
ON public.views
FOR DELETE
USING (auth.uid() = user_id);

-- Public read access for shared views (ported from 20260117000000_allow_public_access_to_shared_views.sql)
DROP POLICY IF EXISTS "Anyone can view views referenced by share_links" ON public.views;
CREATE POLICY "Anyone can view views referenced by share_links"
ON public.views
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.share_links
    WHERE share_links.view_id = views.id
  )
);

-- Backfill: PerformanceTable views (id-preserving)
INSERT INTO public.views (
  id,
  mode,
  report_id,
  user_id,
  name,
  group_by_dimensions,
  breakdown_by_dimensions,
  then_by_dimensions,
  visible_columns,
  is_default,
  created_at,
  updated_at
)
SELECT
  rv.id,
  'performance_table',
  rv.report_id,
  rv.user_id,
  rv.name,
  rv.group_by_dimensions,
  rv.breakdown_by_dimensions,
  rv.then_by_dimensions,
  rv.visible_columns,
  rv.is_default,
  rv.created_at,
  rv.updated_at
FROM public.report_views rv
ON CONFLICT (id) DO NOTHING;

-- Backfill: SlideView views (id-preserving)
INSERT INTO public.views (
  id,
  mode,
  slide_report_id,
  account_id,
  user_id,
  name,
  selected_year,
  selected_month,
  comparison_type,
  chart_time_range,
  filter_values,
  created_at,
  updated_at
)
SELECT
  sv.id,
  'slide_view',
  sv.slide_report_id,
  sv.account_id,
  sv.user_id,
  sv.name,
  sv.selected_year,
  sv.selected_month,
  sv.comparison_type,
  sv.chart_time_range,
  sv.filter_values,
  sv.created_at,
  sv.updated_at
FROM public.slide_report_views sv
ON CONFLICT (id) DO NOTHING;

-- Repointer: budgets.view_id + share_links.view_id should reference public.views going forward
-- (keeps column name, only changes FK target; ids are preserved)
ALTER TABLE public.budgets
  DROP CONSTRAINT IF EXISTS budgets_view_id_fkey;
ALTER TABLE public.budgets
  ADD CONSTRAINT budgets_view_id_fkey
  FOREIGN KEY (view_id) REFERENCES public.views(id) ON DELETE SET NULL;

ALTER TABLE public.share_links
  DROP CONSTRAINT IF EXISTS share_links_view_id_fkey;
ALTER TABLE public.share_links
  ADD CONSTRAINT share_links_view_id_fkey
  FOREIGN KEY (view_id) REFERENCES public.views(id) ON DELETE SET NULL;

-- Public access to slide_reports referenced by shared slide_view views (ported and updated)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'slide_reports'
  ) THEN
    DROP POLICY IF EXISTS "Anyone can view slide reports referenced by shared views" ON public.slide_reports;

    CREATE POLICY "Anyone can view slide reports referenced by shared views"
    ON public.slide_reports
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1
        FROM public.views v
        INNER JOIN public.share_links sl ON sl.view_id = v.id
        WHERE v.mode = 'slide_view'
          AND v.slide_report_id = slide_reports.id
      )
    );
  END IF;
END $$;

COMMIT;

