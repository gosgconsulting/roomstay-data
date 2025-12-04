-- Create table for AI summary cards
CREATE TABLE public.ai_summary_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'AI Summary',
  report_ids UUID[] NOT NULL DEFAULT '{}',
  report_configs JSONB NOT NULL DEFAULT '{}',
  selected_metrics TEXT[] NOT NULL DEFAULT '{}',
  since_date DATE NOT NULL,
  ai_prompt TEXT NOT NULL,
  generated_summary TEXT,
  last_generated_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_summary_cards ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own AI summary cards"
ON public.ai_summary_cards
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own AI summary cards"
ON public.ai_summary_cards
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own AI summary cards"
ON public.ai_summary_cards
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own AI summary cards"
ON public.ai_summary_cards
FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_ai_summary_cards_updated_at
BEFORE UPDATE ON public.ai_summary_cards
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();