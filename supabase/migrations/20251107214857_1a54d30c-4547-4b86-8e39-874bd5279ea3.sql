-- Create function to update updated_at timestamp if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create master_filter_settings table to persist filter preferences per account
CREATE TABLE IF NOT EXISTS public.master_filter_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  
  -- Filter settings
  selected_dimension_id TEXT,
  selected_dimension_values TEXT[] DEFAULT '{}',
  selected_report_ids TEXT[] DEFAULT '{}',
  
  -- Date range settings
  date_range_from DATE,
  date_range_to DATE,
  date_preset TEXT DEFAULT 'this_month',
  
  -- Comparison settings
  compare_enabled BOOLEAN DEFAULT false,
  compare_type TEXT DEFAULT 'previous_period',
  compare_date_from DATE,
  compare_date_to DATE,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Ensure one settings record per user per account
  UNIQUE(user_id, account_id)
);

-- Enable RLS
ALTER TABLE public.master_filter_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own settings
CREATE POLICY "Users can view their own master filter settings"
  ON public.master_filter_settings
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy: Users can insert their own settings
CREATE POLICY "Users can insert their own master filter settings"
  ON public.master_filter_settings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own settings
CREATE POLICY "Users can update their own master filter settings"
  ON public.master_filter_settings
  FOR UPDATE
  USING (auth.uid() = user_id);

-- Policy: Users can delete their own settings
CREATE POLICY "Users can delete their own master filter settings"
  ON public.master_filter_settings
  FOR DELETE
  USING (auth.uid() = user_id);

-- Add trigger to update updated_at timestamp
CREATE TRIGGER update_master_filter_settings_updated_at
  BEFORE UPDATE ON public.master_filter_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_master_filter_settings_user_account 
  ON public.master_filter_settings(user_id, account_id);