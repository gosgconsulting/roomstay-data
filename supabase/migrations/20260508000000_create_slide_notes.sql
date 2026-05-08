-- Slide speaker notes / comments: one row per (deck_id, slide_index, user_id)
CREATE TABLE IF NOT EXISTS public.slide_notes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  deck_id     text        NOT NULL,
  slide_index integer     NOT NULL,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deck_id, slide_index, user_id)
);

CREATE INDEX idx_slide_notes_user_deck ON public.slide_notes (user_id, deck_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.set_slide_notes_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_slide_notes_updated_at
  BEFORE UPDATE ON public.slide_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_slide_notes_updated_at();

-- RLS: each authenticated user can only access their own notes
ALTER TABLE public.slide_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own slide notes"
  ON public.slide_notes
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
