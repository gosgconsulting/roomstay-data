-- Add a uniqueness guardrail for dimensions to prevent future duplicates.
-- This is additive and safe: it does not delete or rewrite data.
--
-- Note: we coalesce nullable scope/user/account/report into sentinel values so
-- Postgres enforces uniqueness consistently even with NULLs.

CREATE UNIQUE INDEX IF NOT EXISTS dimensions_unique_name_per_context
  ON public.dimensions (
    lower(name),
    COALESCE(scope, 'global'),
    COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(account_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(report_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

COMMENT ON INDEX public.dimensions_unique_name_per_context IS
  'Prevents duplicate dimension names within the same scope/user/account/report context (case-insensitive).';

