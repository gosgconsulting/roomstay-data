-- Add main dimension tracking to views table
-- This identifies the primary dimension (Account for SEM/Social, Hotel for Metasearch)
-- that should be locked when sharing views publicly

DO $$
BEGIN
  -- Add main_dimension_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'views' 
    AND column_name = 'main_dimension_id'
  ) THEN
    ALTER TABLE public.views 
    ADD COLUMN main_dimension_id UUID REFERENCES public.dimensions(id) ON DELETE SET NULL;
    
    CREATE INDEX IF NOT EXISTS idx_views_main_dimension_id ON public.views(main_dimension_id);
    
    RAISE NOTICE 'Added main_dimension_id column to views table';
  ELSE
    RAISE NOTICE 'main_dimension_id column already exists in views table';
  END IF;

  -- Add main_dimension_name column for display/fallback if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'views' 
    AND column_name = 'main_dimension_name'
  ) THEN
    ALTER TABLE public.views 
    ADD COLUMN main_dimension_name TEXT;
    
    RAISE NOTICE 'Added main_dimension_name column to views table';
  ELSE
    RAISE NOTICE 'main_dimension_name column already exists in views table';
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN public.views.main_dimension_id IS 'Primary dimension for this view (e.g., Account for SEM/Social, Hotel for Metasearch). This dimension is locked when the view is shared publicly.';
COMMENT ON COLUMN public.views.main_dimension_name IS 'Display name of the main dimension for fallback/display purposes.';
