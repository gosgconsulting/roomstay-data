-- Add RLS policy to allow public access to AI summary cards when accessed via share links
CREATE POLICY "Public can view AI summary cards via share links"
ON public.ai_summary_cards
FOR SELECT
USING (
  id IN (
    SELECT unnest(report_ids) 
    FROM share_links
  )
);