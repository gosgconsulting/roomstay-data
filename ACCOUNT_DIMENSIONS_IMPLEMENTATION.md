# Account-Specific Dimensions Implementation

## Overview
Successfully migrated from **global shared dimensions** to **account-specific dimensions**. Each account now has its own isolated set of dimensions that can be modified or deleted independently.

## What Changed

### Before (Global Dimensions)
- All dimensions were `scope: 'global'`
- Shared across ALL accounts
- Deleting/modifying affected everyone
- No account isolation

### After (Account-Specific Dimensions)
- Each account has its own dimensions (`scope: 'account'`)
- Changes only affect that specific account
- Safe to delete - only affects the owner account
- Global dimensions kept as templates for new accounts

## Implementation Details

### 1. Database Migration ✅

**Created account-specific dimension copies:**
- Roomstay: 19 dimensions
- GO SG: 19 dimensions

**Updated column mappings:**
- All data_sources now reference account-specific dimension IDs
- Cost dimension for GO SG: `dd3ed343-f654-4ea2-8d2d-2bb9e6f6a953`
- Cost dimension for Roomstay: `fb281b3f-c800-48f4-b34b-02d4f0244b07`

### 2. Frontend Updates ✅

**Updated Components:**

#### `src/components/PerformanceTable.tsx`
```typescript
// Priority order changed to: account > custom > global
const allDimensions = [
  ...(accountData || []),   // Account-specific (highest priority)
  ...(customData || []),    // Custom
  ...(globalData || [])     // Global (templates)
];
```

#### `src/components/DimensionSelectorModal.tsx`
```typescript
// Loads account-specific dimensions via reportId → account_id
if (reportId) {
  const { data: reportData } = await supabase
    .from('reports')
    .select('account_id')
    .eq('id', reportId)
    .single();
  
  if (reportData?.account_id) {
    // Load dimensions for this account
  }
}
```

#### `src/components/FiltersBar.tsx`
- Already supports account-scoped dimensions ✅

#### `src/components/DimensionsListModal.tsx`
- Already supports account-scoped dimensions ✅

### 3. Backend Updates ✅

#### `supabase/functions/get-performance-data/index.ts`
```typescript
// Updated dimension loading to include account-specific dimensions
if (userId && accountId) {
  query = query.or(`and(scope.eq.account,account_id.eq.${accountId}),and(scope.eq.custom,user_id.eq.${userId}),scope.eq.global`);
}
```

### 4. Auto-Create Dimensions for New Accounts ✅

#### `src/pages/ReportTool.tsx` - `handleCreateAccount()`
```typescript
// When creating a new account:
const { data: globalDimensions } = await supabase
  .from('dimensions')
  .select('name, type, formula, user_id')
  .eq('scope', 'global');

const accountDimensions = globalDimensions.map(d => ({
  name: d.name,
  type: d.type,
  formula: d.formula,
  scope: 'account',
  account_id: newAccount.id,
  user_id: session.user.id,
}));

await supabase.from('dimensions').insert(accountDimensions);
```

### 5. Sync Function Update ✅

#### `src/lib/sync-utils.ts` - `transformDataRows()`
```typescript
// Loads dimension types from database to ensure correct parsing
const { data: dimensionsData } = await supabase
  .from('dimensions')
  .select('id, type')
  .in('id', dimensionIds);

// Uses dimension type as fallback when column mappings lack type info
const dimensionType = 
  mapping.newDimensionType || 
  mapping.dimensionType || 
  dimensionTypeMap[dimensionId] ||  // ← Fallback from DB
  'text';
```

## Benefits

### Account Isolation
- ✅ Each account has independent dimensions
- ✅ Modifications only affect one account
- ✅ Safe to delete dimensions
- ✅ Account-specific customization

### Examples:
- **GO SG** can delete "Hotel" dimension → Only affects GO SG
- **Roomstay** can add custom "Property Type" dimension → Only visible in Roomstay
- **New Account** automatically gets all 19 standard dimensions

## Dimension Priority System

When loading dimensions, the system uses this priority:

1. **Account-specific** (`scope: 'account'`, `account_id: XXX`) - Highest priority
2. **Custom** (`scope: 'custom'`, `user_id: XXX`) - User-specific
3. **Global** (`scope: 'global'`) - Templates/fallback

This ensures:
- Account dimensions override global templates
- Custom user dimensions take precedence
- Global dimensions available as fallback

## Testing Checklist

### For Existing Accounts (Roomstay, GO SG)
- [ ] View dimensions list - should see 19 account-specific dimensions
- [ ] Edit a dimension - should only affect that account
- [ ] Delete a dimension - should only affect that account
- [ ] Data still displays correctly in reports
- [ ] Column mappings reference correct dimension IDs

### For New Accounts
- [ ] Create a new account
- [ ] Verify 19 dimensions auto-created
- [ ] Create a report in the new account
- [ ] Import data source
- [ ] Verify dimensions work in filters, group by, KPIs

### Cross-Account Verification
- [ ] Change dimension in GO SG → Roomstay unaffected
- [ ] Delete dimension in Roomstay → GO SG unaffected

## Verification Queries

```sql
-- Check dimension distribution
SELECT 
  scope,
  a.name as account_name,
  COUNT(*) as dimension_count
FROM dimensions d
LEFT JOIN accounts a ON d.account_id = a.id
GROUP BY scope, a.name
ORDER BY scope, a.name;

-- Expected results:
-- account | GO SG      | 19
-- account | Roomstay   | 19
-- custom  | null       | X (user-specific)
-- global  | null       | 19 (templates)

-- Verify Cost dimension for GO SG uses account-specific ID
SELECT 
  ds.name as data_source_name,
  mapping->>'column' as column_name,
  mapping->>'dimensionId' as dimension_id,
  d.name as dimension_name,
  d.scope,
  a.name as account_name
FROM data_sources ds
JOIN reports r ON ds.report_id = r.id
LEFT JOIN accounts a ON r.account_id = a.id,
  jsonb_array_elements(ds.column_mappings) as mapping
LEFT JOIN dimensions d ON d.id = (mapping->>'dimensionId')::uuid
WHERE ds.id = 'd837587c-e04f-445c-8855-ce23a18d3cd0'
  AND mapping->>'column' = 'Cost';

-- Expected: dimension_id = dd3ed343-f654-4ea2-8d2d-2bb9e6f6a953 (GO SG Cost)
```

## Next Steps

1. **Re-sync GO SG SEM data** to apply the currency parsing fix
2. **Test dimension management** for both accounts
3. **Create a test account** to verify auto-dimension creation
4. **Verify data isolation** between accounts

## Files Modified

### Database
- Migration: `duplicate_dimensions_for_accounts.sql`
- Migration: `update_column_mappings_for_account_dimensions.sql`

### Frontend
- `src/components/PerformanceTable.tsx`
- `src/components/DimensionSelectorModal.tsx`
- `src/pages/ReportTool.tsx`

### Backend
- `supabase/functions/get-performance-data/index.ts`
- `src/lib/sync-utils.ts`

### Not Changed (Already Compatible)
- `src/components/FiltersBar.tsx`
- `src/components/DimensionsListModal.tsx`
