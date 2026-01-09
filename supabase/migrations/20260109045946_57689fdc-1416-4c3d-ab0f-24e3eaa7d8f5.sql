-- Create slides table for pre-rendered data snapshots
CREATE TABLE public.slides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  data_source_id UUID REFERENCES public.data_sources(id) ON DELETE SET NULL,
  report_id UUID REFERENCES public.reports(id) ON DELETE SET NULL,
  components JSONB NOT NULL DEFAULT '[]'::jsonb,
  cached_data JSONB DEFAULT '{}'::jsonb,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_refreshed_at TIMESTAMP WITH TIME ZONE
);

-- Enable Row Level Security
ALTER TABLE public.slides ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own slides" 
ON public.slides 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own slides" 
ON public.slides 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own slides" 
ON public.slides 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own slides" 
ON public.slides 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX idx_slides_account_id ON public.slides(account_id);
CREATE INDEX idx_slides_user_id ON public.slides(user_id);
CREATE INDEX idx_slides_data_source_id ON public.slides(data_source_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_slides_updated_at
BEFORE UPDATE ON public.slides
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();