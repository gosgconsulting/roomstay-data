-- Create table for master report global configurations
CREATE TABLE public.master_report_global_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  since_date DATE NOT NULL DEFAULT CURRENT_DATE,
  selected_metrics TEXT[] NOT NULL DEFAULT ARRAY['Cost', 'Revenue', 'ROAS', 'Conversions'],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, account_id)
);

-- Enable RLS
ALTER TABLE public.master_report_global_configs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own master report global configs"
ON public.master_report_global_configs FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own master report global configs"
ON public.master_report_global_configs FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own master report global configs"
ON public.master_report_global_configs FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own master report global configs"
ON public.master_report_global_configs FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_master_report_global_configs_updated_at
BEFORE UPDATE ON public.master_report_global_configs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();