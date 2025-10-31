-- Create share_links table for slug-based sharing
CREATE TABLE public.share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  report_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT slug_format CHECK (slug ~ '^[a-z0-9-]+$'),
  CONSTRAINT slug_length CHECK (char_length(slug) >= 3 AND char_length(slug) <= 50)
);

-- Enable RLS
ALTER TABLE public.share_links ENABLE ROW LEVEL SECURITY;

-- Policies for share_links
CREATE POLICY "Users can view their own share links"
  ON public.share_links
  FOR SELECT
  USING (auth.uid() = created_by OR is_master_account(auth.uid()));

CREATE POLICY "Users can create share links"
  ON public.share_links
  FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Users can update their own share links"
  ON public.share_links
  FOR UPDATE
  USING (auth.uid() = created_by OR is_master_account(auth.uid()));

CREATE POLICY "Users can delete their own share links"
  ON public.share_links
  FOR DELETE
  USING (auth.uid() = created_by OR is_master_account(auth.uid()));

-- Public access policy for slug-based access (no auth required)
CREATE POLICY "Anyone can view share links by slug"
  ON public.share_links
  FOR SELECT
  USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_share_links_updated_at
  BEFORE UPDATE ON public.share_links
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Create index for faster slug lookups
CREATE INDEX idx_share_links_slug ON public.share_links(slug);
CREATE INDEX idx_share_links_created_by ON public.share_links(created_by);