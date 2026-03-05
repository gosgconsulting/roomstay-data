UPDATE slide_reports SET configuration = jsonb_set(
  jsonb_set(
    configuration,
    '{filterConfigs,metasearch,filterDimensionIds}',
    '["6c553ea6-e3bb-4946-bb56-069d39a3c5c0", "093ac487-dd90-4466-9972-ac51d110e91e", "970c0d99-7ec4-48db-893c-15957122b9cc"]'
  ),
  '{breakdownConfigs,metasearch,breakdownDimensionIds}',
  '["093ac487-dd90-4466-9972-ac51d110e91e", "6c553ea6-e3bb-4946-bb56-069d39a3c5c0", "970c0d99-7ec4-48db-893c-15957122b9cc"]'
), updated_at = now() WHERE id IN ('1bd40bdd-8f54-4fd1-b125-3ac305faaffb', 'ce7528cc-91e9-4dcc-a37e-878c0413a7d3');