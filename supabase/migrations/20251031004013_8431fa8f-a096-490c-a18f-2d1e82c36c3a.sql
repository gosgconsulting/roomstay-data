-- Create report_shares table to track shared access
CREATE TABLE public.report_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  shared_with_email TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(report_id, shared_with_email)
);

-- Enable RLS
ALTER TABLE public.report_shares ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view shares for their own reports
CREATE POLICY "Users can view shares for their reports"
ON public.report_shares
FOR SELECT
USING (
  created_by = auth.uid() OR
  shared_with_email = (SELECT email FROM auth.users WHERE id = auth.uid())
);

-- Policy: Users can create shares for their own reports
CREATE POLICY "Users can create shares for their reports"
ON public.report_shares
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.reports
    WHERE id = report_id AND user_id = auth.uid()
  )
);

-- Policy: Users can delete shares for their own reports
CREATE POLICY "Users can delete shares for their reports"
ON public.report_shares
FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.reports
    WHERE id = report_id AND user_id = auth.uid()
  )
);

-- Update reports RLS to allow viewing shared reports
DROP POLICY IF EXISTS "Users can view their own reports" ON public.reports;

CREATE POLICY "Users can view their own and shared reports"
ON public.reports
FOR SELECT
USING (
  user_id = auth.uid() OR
  EXISTS (
    SELECT 1 FROM public.report_shares
    WHERE report_id = reports.id 
    AND shared_with_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  )
);

-- Create index for performance
CREATE INDEX idx_report_shares_email ON public.report_shares(shared_with_email);
CREATE INDEX idx_report_shares_report ON public.report_shares(report_id);