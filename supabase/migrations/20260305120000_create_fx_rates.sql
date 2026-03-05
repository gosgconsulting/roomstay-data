-- Store daily USD->AUD FX rate so get-fx-rate can return cached rate instead of calling external API every time.
CREATE TABLE IF NOT EXISTS public.fx_rates (
  rate_date DATE NOT NULL PRIMARY KEY,
  aud_per_usd NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.fx_rates IS 'Daily USD to AUD exchange rate; one row per day, refreshed once per day by get-fx-rate.';

-- Allow service role (edge functions) to read and insert; optional: allow anon to read for client-side cache
ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role and anon can read fx_rates"
  ON public.fx_rates FOR SELECT
  USING (true);

CREATE POLICY "Service role can insert fx_rates"
  ON public.fx_rates FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Service role can update fx_rates"
  ON public.fx_rates FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Only service role (e.g. edge functions) should write; anon/authenticated read-only
REVOKE INSERT, UPDATE, DELETE ON public.fx_rates FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.fx_rates FROM authenticated;
