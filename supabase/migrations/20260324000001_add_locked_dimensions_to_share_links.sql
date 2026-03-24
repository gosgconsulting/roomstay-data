-- Add locked dimension tracking to share_links table
-- Stores which dimension IDs should be read-only for viewers
-- Typically the main dimension (Account/Hotel) from the linked view

DO $$
BEGIN
  -- Add locked_dimension_ids column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'share_links' 
    AND column_name = 'locked_dimension_ids'
  ) THEN
    ALTER TABLE public.share_links 
    ADD COLUMN locked_dimension_ids UUID[] DEFAULT ARRAY[]::UUID[];
    
    CREATE INDEX IF NOT EXISTS idx_share_links_locked_dimension_ids ON public.share_links USING GIN(locked_dimension_ids);
    
    RAISE NOTICE 'Added locked_dimension_ids column to share_links table';
  ELSE
    RAISE NOTICE 'locked_dimension_ids column already exists in share_links table';
  END IF;
END $$;

-- Add comment for documentation
COMMENT ON COLUMN public.share_links.locked_dimension_ids IS 'Array of dimension IDs that viewers cannot change. Typically includes the main dimension (Account for SEM/Social, Hotel for Metasearch) from the linked view.';
