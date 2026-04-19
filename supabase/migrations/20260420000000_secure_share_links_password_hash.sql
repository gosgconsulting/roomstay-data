-- SECURITY: Prevent password_hash from being exposed via the public RLS policy.
--
-- The old policy "Anyone can view share links by slug" uses `USING (true)` which
-- returns ALL columns including password_hash to unauthenticated users.
--
-- Postgres RLS cannot restrict columns, so we:
-- 1. Revoke direct SELECT on password_hash from anon and authenticated roles
-- 2. Grant SELECT only on the safe columns
-- 3. The edge function `share-link-auth` uses the service_role key to read
--    password_hash for verification, bypassing column-level grants.

-- Revoke blanket SELECT and re-grant only safe columns for anon role
REVOKE SELECT ON public.share_links FROM anon;
GRANT SELECT (
  id, slug, report_ids, created_at, created_by, updated_at,
  account_id, slide_report_id, view_id,
  dimension_filters, locked_dimension_ids,
  selected_year, selected_month, custom_date_range, date_preset,
  allowed_emails
) ON public.share_links TO anon;

-- For authenticated users: also restrict password_hash column access.
-- Owners manage their own links but never need to read the hash back.
REVOKE SELECT ON public.share_links FROM authenticated;
GRANT SELECT (
  id, slug, report_ids, created_at, created_by, updated_at,
  account_id, slide_report_id, view_id,
  dimension_filters, locked_dimension_ids,
  selected_year, selected_month, custom_date_range, date_preset,
  allowed_emails
) ON public.share_links TO authenticated;

-- Authenticated users still need full INSERT/UPDATE/DELETE (managed by RLS policies)
GRANT INSERT, UPDATE, DELETE ON public.share_links TO authenticated;
