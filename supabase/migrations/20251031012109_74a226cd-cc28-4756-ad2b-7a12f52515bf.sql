-- Migrate all dimensions from performance@dijitally.com to contact@gosgconsulting.com
UPDATE dimensions 
SET user_id = '2141f8fd-3b83-4f4a-9569-eae251041c08' 
WHERE user_id = '3da1cd10-c88d-4084-b225-fa2fd77c0743';