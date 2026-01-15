-- Create slide_reports table for pre-computed pivot table data
CREATE TABLE IF NOT EXISTS public.slide_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  
  -- Configuration from Edit Source modal
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Structure:
  -- {
  --   "selectedChannels": ["metasearch", "sem", "social"],
  --   "channelConfigs": {
  --     "metasearch": { "dimensionId": "...", "selectedValues": [...] },
  --     "sem": { ... },
  --     "social": { ... }
  --   },
  --   "breakdownConfigs": {
  --     "metasearch": { "breakdownDimensionIds": [...] },
  --     "sem": { ... },
  --     "social": { ... }
  --   },
  --   "filterConfigs": {
  --     "metasearch": { "filterDimensionIds": [...] },
  --     "sem": { ... },
  --     "social": { ... }
  --   }
  -- }
  
  -- Report IDs for each channel (mapping channel names to report IDs)
  report_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Structure: { "metasearch": "report-id-1", "sem": "report-id-2", "social": "report-id-3" }
  
  -- Pre-computed pivot tables for fast loading
  pivot_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Structure (similar to CachedPivotData but tailored for slides):
  -- {
  --   "overview": {
  --     "current": { "impressions": ..., "clicks": ..., "revenue": ..., etc. },
  --     "previous_period": { ... },
  --     "previous_year": { ... }
  --   },
  --   "channels": {
  --     "metasearch": {
  --       "current": { ... },
  --       "previous_period": { ... },
  --       "previous_year": { ... },
  --       "monthly": { "2025-01": {...}, "2025-02": {...}, ... },
  --       "breakdowns": {
  --         "hotel": [{ "hotel": "...", "impressions": ..., ... }, ...],
  --         "link_type": [{ "linkType": "...", ... }, ...]
  --       }
  --     },
  --     "sem": { ... },
  --     "social": { ... }
  --   },
  --   "budget": {
  --     "monthly": [{ "month": "Jan", "budget": ..., "actual": ... }, ...],
  --     "totals": { "totalBudget": ..., "totalActual": ..., "variance": ... }
  --   }
  -- }
  
  -- Date range for the current data
  date_range JSONB,
  -- Structure: { "year": 2025, "month": "December", "from": "2025-12-01", "to": "2025-12-31" }
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_refreshed_at TIMESTAMP WITH TIME ZONE,
  
  -- Metadata
  description TEXT,
  is_active BOOLEAN DEFAULT true
);

-- Enable Row Level Security
ALTER TABLE public.slide_reports ENABLE ROW LEVEL SECURITY;

-- Create policies for user access (only if they don't exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'slide_reports' 
    AND policyname = 'Users can view their own slide reports'
  ) THEN
    CREATE POLICY "Users can view their own slide reports" 
    ON public.slide_reports 
    FOR SELECT 
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'slide_reports' 
    AND policyname = 'Users can create their own slide reports'
  ) THEN
    CREATE POLICY "Users can create their own slide reports" 
    ON public.slide_reports 
    FOR INSERT 
    WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'slide_reports' 
    AND policyname = 'Users can update their own slide reports'
  ) THEN
    CREATE POLICY "Users can update their own slide reports" 
    ON public.slide_reports 
    FOR UPDATE 
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'slide_reports' 
    AND policyname = 'Users can delete their own slide reports'
  ) THEN
    CREATE POLICY "Users can delete their own slide reports" 
    ON public.slide_reports 
    FOR DELETE 
    USING (auth.uid() = user_id);
  END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX idx_slide_reports_account_id ON public.slide_reports(account_id);
CREATE INDEX idx_slide_reports_user_id ON public.slide_reports(user_id);
CREATE INDEX idx_slide_reports_is_active ON public.slide_reports(is_active) WHERE is_active = true;

-- GIN indexes for JSONB queries
CREATE INDEX idx_slide_reports_configuration ON public.slide_reports USING gin(configuration);
CREATE INDEX idx_slide_reports_report_ids ON public.slide_reports USING gin(report_ids);
CREATE INDEX idx_slide_reports_pivot_data ON public.slide_reports USING gin(pivot_data);

-- Create trigger for automatic timestamp updates (only if function exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' 
    AND p.proname = 'update_updated_at_column'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'update_slide_reports_updated_at'
  ) THEN
    CREATE TRIGGER update_slide_reports_updated_at
    BEFORE UPDATE ON public.slide_reports
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
