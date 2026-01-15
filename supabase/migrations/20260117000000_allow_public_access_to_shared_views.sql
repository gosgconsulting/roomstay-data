-- Allow public access to slide_report_views that are referenced by share_links
-- This enables guest users to view shared slide report views without authentication

DO $$
BEGIN
  -- Only create policy if the table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'slide_report_views'
  ) THEN
    -- Drop policy if it exists (to allow re-running migration)
    DROP POLICY IF EXISTS "Anyone can view views referenced by share_links" ON public.slide_report_views;
    
    CREATE POLICY "Anyone can view views referenced by share_links"
    ON public.slide_report_views
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1
        FROM public.share_links
        WHERE share_links.view_id = slide_report_views.id
      )
    );
  END IF;
END $$;

-- Allow public access to slide_reports that are referenced by views that are shared
-- This enables guest users to load the slide report data when viewing shared views

DO $$
BEGIN
  -- Only create policy if both tables exist
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'slide_reports'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'slide_report_views'
  ) THEN
    -- Drop policy if it exists (to allow re-running migration)
    DROP POLICY IF EXISTS "Anyone can view slide reports referenced by shared views" ON public.slide_reports;
    
    CREATE POLICY "Anyone can view slide reports referenced by shared views"
    ON public.slide_reports
    FOR SELECT
    USING (
      EXISTS (
        SELECT 1
        FROM public.slide_report_views
        INNER JOIN public.share_links ON share_links.view_id = slide_report_views.id
        WHERE slide_report_views.slide_report_id = slide_reports.id
      )
    );
  END IF;
END $$;
