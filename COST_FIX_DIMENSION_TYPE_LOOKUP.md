# Cost Parsing Fix - Dimension Type Lookup

## Problem
After implementing the currency parsing fix and re-syncing, the Cost data **still** shows as strings with `$` symbols (`"$33.10"`) instead of numbers (`33.10`).

## Root Cause Analysis

### Issue Chain
1. ✅ Currency parsing logic works correctly in `parseValue()`
2. ✅ Dimension is correctly typed as `'currency'` in the `dimensions` table
3. ❌ **Column mapping has `dimensionType: null` and `newDimensionType: null`**
4. ❌ Code defaults to `'text'` when both are null
5. ❌ Currency parsing is **never triggered** because dimensionType = 'text'

### Evidence
```sql
-- Column mapping (WRONG)
{
  "column": "Cost",
  "dimensionId": "8444ab3b-8ded-4290-9b50-7ddfee892290",
  "dimensionType": null,        -- ❌ NULL
  "newDimensionType": null      -- ❌ NULL
}

-- Dimension table (CORRECT)
{
  "id": "8444ab3b-8ded-4290-9b50-7ddfee892290",
  "name": "Cost",
  "type": "currency"            -- ✅ CORRECT
}
```

### Code Flow (Before Fix)
```typescript
// src/lib/sync-utils.ts - transformDataRows()
const dimensionType = mapping.newDimensionType || mapping.dimensionType || 'text';
//                     ↑ null                   ↑ null              ↑ DEFAULTS TO 'text'

// parseValue() is called with dimensionType = 'text'
// Currency parsing is NEVER triggered:
if (dimensionType === 'number' || dimensionType === 'currency' || dimensionType === 'percentage') {
  // This block is SKIPPED when dimensionType = 'text'
  // ... currency parsing code ...
}

// Result: "$33.10" stays as "$33.10" (text)
```

## Solution

### Updated Code Flow
Load dimension types from the database and use them as a fallback when column mappings don't have type information.

```typescript
// src/lib/sync-utils.ts - transformDataRows()

// NEW: Load dimension types from database
const dimensionTypeMap: Record<string, string> = {};
const dimensionIds = Object.values(dimensionIdMap).filter(id => id !== 'none' && id !== 'create_new');

if (dimensionIds.length > 0) {
  const { data: dimensionsData } = await supabase
    .from('dimensions')
    .select('id, type')
    .in('id', dimensionIds);
    
  dimensionsData.forEach((dim: any) => {
    dimensionTypeMap[dim.id] = dim.type;  // { "8444ab3b-...": "currency" }
  });
}

// When processing each row:
const dimensionId = dimensionIdMap[mapping.column];

// NEW: Three-tier priority system
const dimensionType = 
  mapping.newDimensionType ||      // 1. Explicit mapping type (highest priority)
  mapping.dimensionType ||         // 2. Original mapping type
  dimensionTypeMap[dimensionId] || // 3. Type from dimensions table (NEW!)
  'text';                          // 4. Default fallback

// Now dimensionType = 'currency' (from database)
// Currency parsing IS triggered:
if (dimensionType === 'number' || dimensionType === 'currency' || dimensionType === 'percentage') {
  // ✅ This block executes
  // Strips "$33.10" → 33.10
}
```

## Changes Made

### File: `src/lib/sync-utils.ts`

1. **Made `transformDataRows` async**:
```typescript
export const transformDataRows = async (
  // ... parameters
): Promise<any[]> => {
```

2. **Added dimension type lookup**:
```typescript
const dimensionTypeMap: Record<string, string> = {};
const dimensionIds = Object.values(dimensionIdMap).filter(id => id !== 'none' && id !== 'create_new');

if (dimensionIds.length > 0) {
  const { data: dimensionsData, error: dimError } = await supabase
    .from('dimensions')
    .select('id, type')
    .in('id', dimensionIds);
  
  if (!dimError && dimensionsData) {
    dimensionsData.forEach((dim: any) => {
      dimensionTypeMap[dim.id] = dim.type;
    });
  }
}
```

3. **Updated type resolution**:
```typescript
const dimensionId = dimensionIdMap[mapping.column];
const dimensionType = 
  mapping.newDimensionType || 
  mapping.dimensionType || 
  dimensionTypeMap[dimensionId] ||  // ← NEW FALLBACK
  'text';
```

4. **Updated function call**:
```typescript
const rowsToInsert = await transformDataRows(
  // ... parameters
);
```

## Expected Results

### Before Fix
```sql
-- Data stored (WRONG)
SELECT dimension_values->>'8444ab3b-8ded-4290-9b50-7ddfee892290' as cost
FROM dimension_data
WHERE report_id = '8df21841-649a-40b0-8113-a93c2ca8c80c'
LIMIT 3;

-- Results:
"$33.10"  ❌ STRING
"$24.72"  ❌ STRING
"$38.04"  ❌ STRING
```

### After Fix + Resync
```sql
-- Data stored (CORRECT)
SELECT dimension_values->>'8444ab3b-8ded-4290-9b50-7ddfee892290' as cost
FROM dimension_data
WHERE report_id = '8df21841-649a-40b0-8113-a93c2ca8c80c'
LIMIT 3;

-- Results:
33.10  ✅ NUMBER
24.72  ✅ NUMBER
38.04  ✅ NUMBER
```

## Console Logs

After re-sync, you should see:
```
[SYNC] Loaded dimension types from database: {
  "8444ab3b-8ded-4290-9b50-7ddfee892290": "currency",
  ...
}
[SYNC] Row 1 - Cost (currency): "$33.10" -> "33.10"
[SYNC] Row 2 - Cost (currency): "$24.72" -> "24.72"
[SYNC] Parsed currency value: "$33.10" -> 33.10
```

## Required Action

**Re-sync the GO SG SEM data source ONE MORE TIME** to apply the fix:

1. Go to GO SG Account → SEM Report
2. Click "Data Sources" button
3. Find "SEM" data source
4. Click "Resync from Scratch"
5. Wait for completion

After this resync:
- ✅ Cost values will be stored as numbers
- ✅ Cost KPI will show correct totals
- ✅ All currency-formatted columns will work correctly

## Prevention

This fix handles cases where:
- Column mappings don't have type information
- Dimensions are correctly typed in the database
- Types need to be inferred during sync

**All future syncs** will now:
1. Load dimension types from the database
2. Use them as fallback when mappings lack type info
3. Correctly parse currency, percentage, and date values
4. Store numeric values instead of strings
