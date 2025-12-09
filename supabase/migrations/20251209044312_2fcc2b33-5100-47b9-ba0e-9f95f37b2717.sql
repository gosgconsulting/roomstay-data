-- Create table for AI Summary budget data (budgets by report and month)
CREATE TABLE public.ai_summary_budgets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  account_id uuid REFERENCES public.accounts(id) ON DELETE CASCADE,
  ai_summary_card_id uuid NOT NULL,
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  month_key text NOT NULL, -- Format: "2025-01" for January 2025
  budget_amount numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT unique_budget_per_report_month UNIQUE (ai_summary_card_id, report_id, month_key)
);

-- Enable Row Level Security
ALTER TABLE public.ai_summary_budgets ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own AI summary budgets" 
  ON public.ai_summary_budgets FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own AI summary budgets" 
  ON public.ai_summary_budgets FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own AI summary budgets" 
  ON public.ai_summary_budgets FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own AI summary budgets" 
  ON public.ai_summary_budgets FOR DELETE 
  USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_ai_summary_budgets_updated_at
  BEFORE UPDATE ON public.ai_summary_budgets
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();