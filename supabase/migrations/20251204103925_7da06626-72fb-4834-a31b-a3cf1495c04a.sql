-- Delete all cached data from dimension_data table
DELETE FROM dimension_data;

-- Delete all cached data from monthly_dimension_data table
DELETE FROM monthly_dimension_data;

-- Delete all sheet_data (already empty but for completeness)
DELETE FROM sheet_data;