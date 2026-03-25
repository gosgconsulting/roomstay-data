-- Allow anonymous users to read slide_reports directly referenced by share_links
-- The previous policy only covered share_links joined via views.view_id (legacy view-based shares).
-- New share links created via the 2-step wizard set share_links.slide_report_id directly (no view_id).
-- Without this policy, unauthenticated shared-studio viewers cannot load slide_report.report_ids,
-- so effectiveReportIdsForFetch stays empty and useDataStudioRawRows never fires → 0 KPI.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'slide_reports'
  ) THEN
    DROP POLICY IF EXISTS "Anon can read slide_reports for direct share links" ON public.slide_reports;

    CREATE POLICY "Anon can read slide_reports for direct share links"
    ON public.slide_reports
    FOR SELECT
    TO anon
    USING (
      EXISTS (
        SELECT 1 FROM public.share_links sl
        WHERE sl.slide_report_id = slide_reports.id
      )
    );
  END IF;
END $$;
