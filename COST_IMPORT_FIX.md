# Cost KPI Import Issue - GO SG Account

## Problem
The Cost KPI shows `$0.00` for the GO SG account's SEM report, but the data exists in the database.

## Root Cause
- **Data Source**: GO SG > SEM report (`d837587c-e04f-445c-8855-ce23a18d3cd0`)
- **Issue**: Cost values stored as **strings with currency symbols** (`"$33.10"`, `"$24.72"`, etc.)
- **Expected**: Numeric values (`33.10`, `24.72`, etc.)

### Evidence
```sql
SELECT dimension_values->>'8444ab3b-8ded-4290-9b50-7ddfee892290' as cost_value
FROM dimension_data
WHERE report_id = '8df21841-649a-40b0-8113-a93c2ca8c80c'
LIMIT 3;

-- Results:
"$33.10"  ← STRING (wrong)
"$24.72"  ← STRING (wrong)
"$38.04"  ← STRING (wrong)

-- Should be:
33.10     ← NUMBER (correct)
24.72     ← NUMBER (correct)
38.04     ← NUMBER (correct)
```

## Why This Happened
The data was imported **before** the currency parsing fix (implemented in `src/lib/sync-utils.ts`). The old import logic didn't strip currency symbols from the Google Sheets data.

## Fix Applied

### Code Fix (Already Implemented)
✅ Updated `src/lib/sync-utils.ts` - `parseValue()` function:
- Detects currency symbols: `$`, `€`, `£`, `¥`, `₹`, `₽`, etc.
- Strips currency symbols and formatting
- Converts to numeric value

```typescript
// Example parsing:
"$33.10" → 33.10
"$1,234.56" → 1234.56
"€123.45" → 123.45
```

### Required Action
**Re-sync the GO SG SEM data source** to apply the fix:

1. **Navigate to**: GO SG Account > SEM Report
2. **Click**: "Data Sources" button in header
3. **Find**: "SEM" data source
4. **Click**: Sync/Refresh button
5. **Select**: "Replace all data" (full re-import)
6. **Confirm**: Re-import

This will:
- Re-fetch data from Google Sheets
- Apply the new currency parsing logic
- Store numeric values instead of strings
- Fix the Cost KPI display

## Verification
After re-sync, verify:
```sql
-- Should return numeric values without $ symbols
SELECT dimension_values->>'8444ab3b-8ded-4290-9b50-7ddfee892290' as cost_value
FROM dimension_data
WHERE report_id = '8df21841-649a-40b0-8113-a93c2ca8c80c'
LIMIT 5;

-- Expected results:
33.10
24.72
38.04
```

## Prevention
All future imports will automatically:
- ✅ Detect currency-formatted columns
- ✅ Strip currency symbols
- ✅ Store as numeric values
- ✅ Display correctly in KPI cards and tables

## Related Files
- `src/lib/sync-utils.ts` - Currency parsing logic
- `src/components/DataSourcesListModal.tsx` - Sync UI
- `src/components/EditDataSourceModal.tsx` - Edit/Sync UI
