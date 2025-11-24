
-- Migrate Roomstay account ownership to performance@dijitally.com
-- Account ID: 3998a594-c07c-46b2-937d-fe477b6e9ce7
-- New Owner ID: 7481aa90-a2eb-4ebb-9a66-fa86bbb29536

-- Update account ownership
UPDATE accounts
SET user_id = '7481aa90-a2eb-4ebb-9a66-fa86bbb29536'::uuid,
    updated_at = now()
WHERE id = '3998a594-c07c-46b2-937d-fe477b6e9ce7'::uuid;

-- Update all reports associated with this account
UPDATE reports
SET user_id = '7481aa90-a2eb-4ebb-9a66-fa86bbb29536'::uuid,
    updated_at = now()
WHERE account_id = '3998a594-c07c-46b2-937d-fe477b6e9ce7'::uuid;

-- Update account-scoped dimensions
UPDATE dimensions
SET user_id = '7481aa90-a2eb-4ebb-9a66-fa86bbb29536'::uuid,
    updated_at = now()
WHERE account_id = '3998a594-c07c-46b2-937d-fe477b6e9ce7'::uuid
  AND scope = 'account';

-- Update budgets associated with this account
UPDATE budgets
SET user_id = '7481aa90-a2eb-4ebb-9a66-fa86bbb29536'::uuid,
    updated_at = now()
WHERE account_id = '3998a594-c07c-46b2-937d-fe477b6e9ce7'::uuid;

-- Update cluster dimensions associated with this account
UPDATE cluster_dimensions
SET user_id = '7481aa90-a2eb-4ebb-9a66-fa86bbb29536'::uuid,
    updated_at = now()
WHERE account_id = '3998a594-c07c-46b2-937d-fe477b6e9ce7'::uuid;

-- Update forecasts for reports in this account
UPDATE forecasts
SET user_id = '7481aa90-a2eb-4ebb-9a66-fa86bbb29536'::uuid,
    updated_at = now()
WHERE report_id IN (
    SELECT id FROM reports WHERE account_id = '3998a594-c07c-46b2-937d-fe477b6e9ce7'::uuid
);

-- Update report views for reports in this account
UPDATE report_views
SET user_id = '7481aa90-a2eb-4ebb-9a66-fa86bbb29536'::uuid,
    updated_at = now()
WHERE report_id IN (
    SELECT id FROM reports WHERE account_id = '3998a594-c07c-46b2-937d-fe477b6e9ce7'::uuid
);

-- Update master filter settings for this account
UPDATE master_filter_settings
SET user_id = '7481aa90-a2eb-4ebb-9a66-fa86bbb29536'::uuid,
    updated_at = now()
WHERE account_id = '3998a594-c07c-46b2-937d-fe477b6e9ce7'::uuid;
