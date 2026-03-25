-- Allow anonymous users to read dimension_data for reports linked through share_links
-- This enables the direct DB fallback path when the edge function cache is unavailable

DO $$
BEGIN
  -- Only create policy if the table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'dimension_data'
  ) THEN
    -- Drop policy if it exists (to allow re-running migration)
    DROP POLICY IF EXISTS "Anon can read dimension_data for shared reports" ON public.dimension_data;
    
    CREATE POLICY "Anon can read dimension_data for shared reports"
    ON public.dimension_data
    FOR SELECT
    TO anon
    USING (
      EXISTS (
        SELECT 1 FROM public.reports r
        JOIN public.slide_reports sr ON sr.account_id = r.account_id
        JOIN public.share_links sl ON sl.slide_report_id = sr.id
        WHERE r.id = dimension_data.report_id
      )
    );
  END IF;
END $$;
