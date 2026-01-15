-- Add slide_report_id to share_links table to avoid needing to query slide_report_views
-- This allows us to get the slide report ID directly from the share link without RLS issues

DO $$
BEGIN
  -- Add the column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'share_links' 
    AND column_name = 'slide_report_id'
  ) THEN
    -- First, add the column without foreign key constraint (in case slide_reports doesn't exist yet)
    ALTER TABLE public.share_links 
    ADD COLUMN slide_report_id UUID;
    
    -- Create index for better performance
    CREATE INDEX IF NOT EXISTS idx_share_links_slide_report_id ON public.share_links(slide_report_id);
    
    -- If slide_reports table exists, add the foreign key constraint
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'slide_reports'
    ) THEN
      -- Add the foreign key constraint
      ALTER TABLE public.share_links
      ADD CONSTRAINT share_links_slide_report_id_fkey 
      FOREIGN KEY (slide_report_id) 
      REFERENCES public.slide_reports(id) 
      ON DELETE SET NULL;
      
      RAISE NOTICE 'Added slide_report_id column to share_links table with foreign key constraint';
    ELSE
      RAISE NOTICE 'Added slide_report_id column to share_links table without foreign key (slide_reports table does not exist yet)';
    END IF;
  ELSE
    RAISE NOTICE 'slide_report_id column already exists in share_links table';
    
    -- If column exists but foreign key doesn't, and slide_reports exists, add the constraint
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name = 'slide_reports'
    ) AND NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints 
      WHERE table_schema = 'public' 
      AND table_name = 'share_links' 
      AND constraint_name = 'share_links_slide_report_id_fkey'
    ) THEN
      ALTER TABLE public.share_links
      ADD CONSTRAINT share_links_slide_report_id_fkey 
      FOREIGN KEY (slide_report_id) 
      REFERENCES public.slide_reports(id) 
      ON DELETE SET NULL;
      
      RAISE NOTICE 'Added foreign key constraint to existing slide_report_id column';
    END IF;
  END IF;
END $$;
