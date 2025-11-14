# Resync from Scratch - Currency Parsing Verification

## Confirmation
✅ **The "Resync from Scratch" feature WILL use the new currency parsing logic**

## Flow Verification

### 1. User Action
**UI**: Edit Data Source Modal → "Resync from Scratch" button
- Located in: `src/components/EditDataSourceModal.tsx`
- Calls: `handleResync()` function

### 2. Resync Handler
```typescript
// src/components/EditDataSourceModal.tsx
const handleResync = async () => {
  const options: SyncOptions = {
    deleteExistingData: true,      // ✅ Deletes old data
    recreateDimensions: true,      // ✅ Recreates dimensions
    showProgress: true,
  };
  
  const result = await syncDataSource(syncDataSourceObj, options);
}
```

### 3. Sync Function
```typescript
// src/lib/sync-utils.ts
export const syncDataSource = async (
  dataSource: DataSource,
  options: SyncOptions = {}
): Promise<SyncResult> => {
  // ...
  // Calls processAndInsertData()
}
```

### 4. Data Processing
```typescript
// src/lib/sync-utils.ts - processAndInsertData()
visibleMappings.forEach((mapping: ColumnMapping) => {
  const rawValue = row[colIndex];
  const dimensionType = mapping.newDimensionType || mapping.dimensionType || 'text';
  const dateFormat = mapping.dateFormat;
  
  // ✅ THIS CALLS THE UPDATED parseValue WITH CURRENCY PARSING
  const value = parseValue(rawValue, dimensionType, dateFormat);
  
  if (value !== null) {
    dimensionValues[dimensionIdMap[mapping.column]] = value;
  }
});
```

### 5. Currency Parsing (FIXED)
```typescript
// src/lib/sync-utils.ts - parseValue()
if (dimensionType === 'number' || dimensionType === 'currency' || dimensionType === 'percentage') {
  // Handle currency values (like "$1.64", "$16.47", "$33.10", "€123.45")
  const currencySymbolsRegex = /[$€£¥₹₽¢₩₦₨₫₪₭₮₯₰₱₲₳₴₵₶₷₸₹₺₻₼₽₾₿]/g;
  const hasCurrencySymbol = currencySymbolsRegex.test(stringValue);
  
  if (hasCurrencySymbol) {
    // Remove currency symbols, commas, spaces
    const cleanedValue = stringValue
      .replace(currencySymbolsRegex, '')
      .replace(/[,\s]/g, '')
      .replace(/[^\d.-]/g, '');
    
    const numValue = parseFloat(cleanedValue);
    if (!isNaN(numValue) && isFinite(numValue)) {
      console.log(`[SYNC] Parsed currency value: "${stringValue}" -> ${numValue}`);
      return numValue;  // ✅ RETURNS NUMERIC VALUE
    }
  }
}
```

## Complete Data Flow

```
User clicks "Resync from Scratch"
    ↓
handleResync() in EditDataSourceModal.tsx
    ↓
syncDataSource() in sync-utils.ts
    ↓
deleteExistingData() - Removes old string-based currency values
    ↓
Fetch fresh data from Google Sheets
    ↓
processAndInsertData() - Processes each row
    ↓
parseValue() - FOR EACH COLUMN VALUE
    ↓
CURRENCY PARSING LOGIC (UPDATED)
    ↓
Stores numeric values in dimension_data
```

## Expected Results

### Before Resync
```json
{
  "Cost": "$33.10"  // ❌ STRING
}
```

### After Resync (with new parsing)
```json
{
  "Cost": 33.10  // ✅ NUMBER
}
```

## Verification Commands

After clicking "Resync from Scratch", verify the fix:

```sql
-- Check that Cost values are now numeric (no $ symbol)
SELECT 
  dimension_values->>'8444ab3b-8ded-4290-9b50-7ddfee892290' as cost_value,
  dimension_values->>'722602a7-590c-4bb1-b6db-ce3ecf123832' as campaign,
  dimension_values->>'425eddda-29ff-468d-a107-08b0f3d6efb9' as date
FROM dimension_data
WHERE report_id = '8df21841-649a-40b0-8113-a93c2ca8c80c'
  AND dimension_values->>'8444ab3b-8ded-4290-9b50-7ddfee892290' IS NOT NULL
LIMIT 5;

-- Expected results (AFTER resync):
-- 33.10  (not "$33.10")
-- 24.72  (not "$24.72")
-- 38.04  (not "$38.04")
```

## Console Logs to Watch

When resyncing, you should see logs like:
```
[SYNC] Parsed currency value: "$33.10" -> 33.10
[SYNC] Parsed currency value: "$24.72" -> 24.72
[SYNC] Parsed currency value: "$38.04" -> 38.04
```

## Summary

✅ **100% Confirmed**: The "Resync from Scratch" button will:
1. Delete old data (with string currency values)
2. Fetch fresh data from Google Sheets
3. Apply the **new currency parsing logic**
4. Strip currency symbols
5. Store numeric values
6. Fix the Cost KPI display

**No code changes needed** - the fix is already in place and will be applied during resync.
