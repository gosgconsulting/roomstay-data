-- Create master_report_configs table to store per-account master report configurations
CREATE TABLE public.master_report_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  group_by_dimension_id UUID REFERENCES public.dimensions(id) ON DELETE SET NULL,
  group_by_dimension_name TEXT,
  selected_values TEXT[] DEFAULT '{}',
  selected_metrics TEXT[] DEFAULT ARRAY['Cost', 'Revenue', 'ROAS', 'Conversions'],
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, account_id, report_id)
);

-- Enable Row Level Security
ALTER TABLE public.master_report_configs ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own master report configs" 
ON public.master_report_configs 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own master report configs" 
ON public.master_report_configs 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own master report configs" 
ON public.master_report_configs 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own master report configs" 
ON public.master_report_configs 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_master_report_configs_updated_at
BEFORE UPDATE ON public.master_report_configs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();