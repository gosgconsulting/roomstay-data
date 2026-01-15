-- Force PostgREST to refresh its schema cache after adding slide_report_id column
-- This migration ensures the column is visible to PostgREST API

DO $$
BEGIN
  -- Verify the column exists
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'share_links' 
    AND column_name = 'slide_report_id'
  ) THEN
    -- Add a comment to the column to force schema introspection
    COMMENT ON COLUMN public.share_links.slide_report_id IS 'Slide report ID for share links with views. Added in migration 20260117000001.';
    
    -- Perform a dummy operation that forces PostgREST to re-introspect the table
    -- This can help refresh the schema cache
    PERFORM 1 FROM public.share_links WHERE false;
    
    -- Attempt to notify PostgREST to reload schema (if pg_notify is available)
    -- This may not work in all Supabase setups, but it's worth trying
    BEGIN
      PERFORM pg_notify('pgrst', 'reload schema');
      RAISE NOTICE 'Notified PostgREST to reload schema';
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE 'Could not notify PostgREST (this is normal in some setups). Schema cache will refresh automatically within a few minutes.';
    END;
    
    RAISE NOTICE 'slide_report_id column exists. Schema cache refresh attempted. If errors persist, wait a few minutes for automatic cache refresh.';
  ELSE
    RAISE WARNING 'slide_report_id column does not exist! Please run migration 20260117000001 first.';
  END IF;
END $$;

-- Create a helper function to insert share_links with slide_report_id
-- This bypasses PostgREST schema cache by using a PostgreSQL function
CREATE OR REPLACE FUNCTION public.insert_share_link_with_slide_report(
  p_slug TEXT,
  p_password_hash TEXT,
  p_report_ids JSONB,
  p_created_by UUID,
  p_account_id UUID,
  p_dimension_filters JSONB,
  p_view_id UUID DEFAULT NULL,
  p_slide_report_id UUID DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.share_links (
    slug,
    password_hash,
    report_ids,
    created_by,
    account_id,
    dimension_filters,
    view_id,
    slide_report_id
  ) VALUES (
    p_slug,
    p_password_hash,
    p_report_ids,
    p_created_by,
    p_account_id,
    p_dimension_filters,
    p_view_id,
    p_slide_report_id
  ) RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.insert_share_link_with_slide_report TO authenticated;
GRANT EXECUTE ON FUNCTION public.insert_share_link_with_slide_report TO anon;

