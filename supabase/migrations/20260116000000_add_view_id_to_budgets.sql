-- Add view_id column to budgets table to link budgets to slide_report_views
ALTER TABLE public.budgets
ADD COLUMN IF NOT EXISTS view_id UUID REFERENCES public.slide_report_views(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_budgets_view_id ON public.budgets(view_id);

-- Add comment for documentation
COMMENT ON COLUMN public.budgets.view_id IS 'Optional link to slide_report_views - allows budgets to be associated with specific views (e.g., "Brady" view)';

-- Sync existing Brady hotels budgets with the "Brady" view
-- This will find all budgets where dimension_item contains "Brady" and link them to the "Brady" view
DO $$
DECLARE
  brady_view_id UUID;
  budget_record RECORD;
BEGIN
  -- Find the "Brady" view for each slide_report
  FOR budget_record IN 
    SELECT DISTINCT b.id as budget_id, b.account_id, b.report_id, sr.id as slide_report_id
    FROM public.budgets b
    LEFT JOIN public.reports r ON r.id = b.report_id
    LEFT JOIN public.slide_reports sr ON sr.account_id = b.account_id
    WHERE LOWER(b.dimension_item) LIKE '%brady%'
      AND b.view_id IS NULL
  LOOP
    -- Find the "Brady" view for this slide_report
    SELECT id INTO brady_view_id
    FROM public.slide_report_views
    WHERE slide_report_id = budget_record.slide_report_id
      AND LOWER(name) = 'brady'
    LIMIT 1;
    
    -- If we found a Brady view, update the budget
    IF brady_view_id IS NOT NULL THEN
      UPDATE public.budgets
      SET view_id = brady_view_id
      WHERE id = budget_record.budget_id;
      
      RAISE NOTICE 'Linked budget % to Brady view %', budget_record.budget_id, brady_view_id;
    END IF;
  END LOOP;
END $$;
