# FiltersBar Dimension Loading Test

## Issue
Account dimension (and potentially other dimensions) not showing in filter options despite being correctly mapped to data source.

## Root Cause
FiltersBar was only loading dimensions that had data in the `dimension_data` table, rather than loading all available dimensions for the report.

## Fix Applied
Updated `loadDimensions()` function in FiltersBar.tsx to use the same logic as DimensionsListModal:
- Load global dimensions (scope = 'global')
- Load account-specific dimensions (scope = 'account', account_id matches)
- Load custom dimensions (scope = 'custom', user_id matches)
- Filter by type (text/date only for filtering)
- Apply visibility settings

## Test Steps

### 1. Verify Account Dimension Exists
```sql
SELECT id, name, type, scope, account_id, report_id 
FROM dimensions 
WHERE name ILIKE '%account%';
```
Expected: Should show Account dimension with ID `d391961b-6e90-4398-af50-e4b9c2517c63`

### 2. Check Dimension Data Presence
```sql
SELECT 
  r.name as report_name,
  CASE 
    WHEN dd.dimension_values ? 'd391961b-6e90-4398-af50-e4b9c2517c63' THEN 'Account dimension present'
    ELSE 'Account dimension missing'
  END as account_status
FROM reports r
LEFT JOIN dimension_data dd ON r.id = dd.report_id
GROUP BY r.name, (dd.dimension_values ? 'd391961b-6e90-4398-af50-e4b9c2517c63');
```
Expected: May show "Account dimension missing" - this is the root cause

### 3. Test FiltersBar Loading
1. Open any report dashboard
2. Look at the "Configure Filter Dimensions" modal
3. Check if "Account" appears in the dropdown for "Select a dimension to add..."

### 4. Verify Console Logs
Check browser console for:
```
[testing] FiltersBar - Loading dimensions for user: [user-id] report: [report-id] account: [account-id]
[testing] FiltersBar - Loaded dimensions - Global: X Account: Y Custom: Z
[testing] FiltersBar - Final filterable dimensions: N
```

### 5. Test Filter Functionality
1. Add Account dimension to filters
2. Verify it loads values correctly
3. Test filtering by Account values

## Expected Results
- Account dimension should appear in filter options
- All global, account, and custom dimensions should be available
- Filtering should work correctly
- No regression in existing functionality

## Verification Checklist
- [ ] Account dimension appears in filter dropdown
- [ ] Other global dimensions still appear
- [ ] Account-specific dimensions appear (if any)
- [ ] Custom dimensions appear (if any)
- [ ] Visibility settings still work
- [ ] Filter values load correctly
- [ ] Filtering functionality works
- [ ] No console errors
- [ ] Performance is acceptable

## Notes
- This fix aligns FiltersBar with the pattern used in DimensionsListModal
- The old approach was too restrictive, only showing dimensions with existing data
- The new approach shows all available dimensions, which is the correct behavior
