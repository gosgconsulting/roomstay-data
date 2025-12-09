-- Create table for AI Summary forecast settings
CREATE TABLE public.ai_summary_forecasts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ai_summary_card_id UUID NOT NULL REFERENCES public.ai_summary_cards(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rooms INTEGER NOT NULL DEFAULT 0,
  occupancy_rate NUMERIC NOT NULL DEFAULT 0,
  daily_rate NUMERIC NOT NULL DEFAULT 0,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_summary_forecasts ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their own AI summary forecasts"
ON public.ai_summary_forecasts FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own AI summary forecasts"
ON public.ai_summary_forecasts FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own AI summary forecasts"
ON public.ai_summary_forecasts FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own AI summary forecasts"
ON public.ai_summary_forecasts FOR DELETE
USING (auth.uid() = user_id);

-- Create index for performance
CREATE INDEX idx_ai_summary_forecasts_card_id ON public.ai_summary_forecasts(ai_summary_card_id);

-- Create trigger for updated_at
CREATE TRIGGER update_ai_summary_forecasts_updated_at
BEFORE UPDATE ON public.ai_summary_forecasts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();