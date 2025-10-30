-- Make dimensions global by adding user_id and making report_id nullable
ALTER TABLE public.dimensions ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Update report_id to be nullable
ALTER TABLE public.dimensions ALTER COLUMN report_id DROP NOT NULL;

-- Drop old RLS policies
DROP POLICY IF EXISTS "Users can create dimensions for their reports" ON public.dimensions;
DROP POLICY IF EXISTS "Users can delete dimensions for their reports" ON public.dimensions;
DROP POLICY IF EXISTS "Users can update dimensions for their reports" ON public.dimensions;
DROP POLICY IF EXISTS "Users can view dimensions for their reports" ON public.dimensions;

-- Create new RLS policies for global dimensions
CREATE POLICY "Users can view their own dimensions"
ON public.dimensions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own dimensions"
ON public.dimensions FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own dimensions"
ON public.dimensions FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own dimensions"
ON public.dimensions FOR DELETE
USING (auth.uid() = user_id);