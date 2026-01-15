-- Backfill slide_report_id for existing share_links that have view_id but missing slide_report_id
-- This migration will populate the slide_report_id column for share links created before the column was added

DO $$
BEGIN
  -- First, ensure the column exists (in case the previous migration wasn't run)
  -- Add it as plain UUID if it doesn't exist (foreign key will be added later if slide_reports exists)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'share_links' 
    AND column_name = 'slide_report_id'
  ) THEN
    -- Add column without foreign key constraint (in case slide_reports doesn't exist yet)
    ALTER TABLE public.share_links 
    ADD COLUMN slide_report_id UUID;
    
    CREATE INDEX IF NOT EXISTS idx_share_links_slide_report_id ON public.share_links(slide_report_id);
    
    -- If slide_reports exists, add the foreign key constraint
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'slide_reports'
    ) THEN
      ALTER TABLE public.share_links
      ADD CONSTRAINT share_links_slide_report_id_fkey 
      FOREIGN KEY (slide_report_id) 
      REFERENCES public.slide_reports(id) 
      ON DELETE SET NULL;
    END IF;
  END IF;

  -- Backfill slide_report_id for share links that have view_id but no slide_report_id
  -- Only if both tables exist
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'slide_report_views'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'share_links'
  ) THEN
    UPDATE public.share_links sl
    SET slide_report_id = srv.slide_report_id
    FROM public.slide_report_views srv
    WHERE sl.view_id = srv.id
      AND sl.view_id IS NOT NULL
      AND sl.slide_report_id IS NULL;
    
    RAISE NOTICE 'Backfilled slide_report_id for share links with view_id';
  END IF;
END $$;
