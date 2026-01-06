
-- Delete existing master_report_configs for Roomstay account
DELETE FROM master_report_configs 
WHERE user_id = '2141f8fd-3b83-4f4a-9569-eae251041c08' 
AND account_id = '3998a594-c07c-46b2-937d-fe477b6e9ce7';

-- Delete existing master_report_global_configs for Roomstay account
DELETE FROM master_report_global_configs 
WHERE user_id = '2141f8fd-3b83-4f4a-9569-eae251041c08' 
AND account_id = '3998a594-c07c-46b2-937d-fe477b6e9ce7';

-- Insert Social report config (Group by Account)
INSERT INTO master_report_configs (
  user_id,
  account_id,
  report_id,
  group_by_dimension_id,
  group_by_dimension_name,
  selected_values,
  selected_metrics
) VALUES (
  '2141f8fd-3b83-4f4a-9569-eae251041c08',
  '3998a594-c07c-46b2-937d-fe477b6e9ce7',
  '8c2f7db9-acbd-4c59-9593-74e8953e7787',
  '277ec940-a91b-4c95-b1e2-4a8fd5814d04',
  'Account',
  ARRAY['Food4Fitness', 'Brady Hotels 2025', 'The Village Hostels', 'Retail Sydney Airport'],
  ARRAY['Cost', 'Revenue', 'ROAS', 'Conversions']
);

-- Insert SEM report config (Group by Account)
INSERT INTO master_report_configs (
  user_id,
  account_id,
  report_id,
  group_by_dimension_id,
  group_by_dimension_name,
  selected_values,
  selected_metrics
) VALUES (
  '2141f8fd-3b83-4f4a-9569-eae251041c08',
  '3998a594-c07c-46b2-937d-fe477b6e9ce7',
  '3b2a0e45-33be-4eec-911e-b955b951c84e',
  '277ec940-a91b-4c95-b1e2-4a8fd5814d04',
  'Account',
  ARRAY['Food 4 Fitness', 'Mojo Nomad PPC', '(HK_B) Ovolo Hong Kong', 'Brady Hotels Group'],
  ARRAY['Cost', 'Revenue', 'ROAS', 'Conversions']
);

-- Insert Metasearch report config (Group by Hotel)
INSERT INTO master_report_configs (
  user_id,
  account_id,
  report_id,
  group_by_dimension_id,
  group_by_dimension_name,
  selected_values,
  selected_metrics
) VALUES (
  '2141f8fd-3b83-4f4a-9569-eae251041c08',
  '3998a594-c07c-46b2-937d-fe477b6e9ce7',
  '2eff17d0-38de-4d5d-a15b-69ad13788c92',
  '093ac487-dd90-4466-9972-ac51d110e91e',
  'Hotel',
  ARRAY['Daydream Island Resort and Living Reef', 'Brady Apartment Hotel Hardware Lane', 'Brady Hotels Central Melbourne', 'Sojourn Apartment Hotel - Ghuznee', 'Brady Hotels Jones Lane', 'Sojourn Apartment Hotel - Riddiford', 'Brady Apartment Hotel Flinders Street'],
  ARRAY['Cost', 'Revenue', 'ROAS', 'Conversions']
);

-- Insert global config for master report
INSERT INTO master_report_global_configs (
  user_id,
  account_id,
  since_date,
  selected_metrics
) VALUES (
  '2141f8fd-3b83-4f4a-9569-eae251041c08',
  '3998a594-c07c-46b2-937d-fe477b6e9ce7',
  '2025-01-01',
  ARRAY['Cost', 'Revenue', 'ROAS', 'Conversions']
);
