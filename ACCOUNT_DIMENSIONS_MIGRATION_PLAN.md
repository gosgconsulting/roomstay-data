# Account-Specific Dimensions Migration Plan

## Current State

### Problem
- All dimensions are `scope: 'global'` (19 dimensions)
- Shared across ALL accounts (Roomstay, GO SG, etc.)
- Modifying/deleting a dimension affects ALL accounts
- No account isolation

### Accounts
1. **Roomstay** (`3998a594-c07c-46b2-937d-fe477b6e9ce7`)
2. **GO SG** (`896be03c-6b46-4a9c-aa6d-7f517cf85f2c`)

### Global Dimensions (19)
- Account, Ad Group, Bookings, Campaign, Channel
- Clicks, Conversion Rate, Conversions, Cost, Cost of sale
- CPC, CPM, CTR, Date, Hotel
- Impression Share, Impressions, Revenue, ROAS

## Goal

### Desired State
- Each account has its **own copy** of all standard dimensions
- Dimensions are `scope: 'account'` with `account_id` set
- Modifying/deleting only affects that specific account
- New accounts automatically get a copy of all standard dimensions

## Migration Strategy

### Phase 1: Duplicate Dimensions for Existing Accounts

For each account (Roomstay, GO SG):
1. Duplicate all 19 global dimensions
2. Set `scope: 'account'`
3. Set `account_id` to the account's ID
4. Preserve: name, type, formula

### Phase 2: Update Column Mappings

Update all `data_sources.column_mappings` to reference the new account-scoped dimension IDs:
1. For each data source, get its report's account_id
2. Find the corresponding account-scoped dimension
3. Update the `dimensionId` in column_mappings

### Phase 3: Keep Global Dimensions as Templates

Keep global dimensions as "templates" for creating new accounts:
- When creating a new account → clone all global dimensions to account scope
- Global dimensions become read-only templates

### Phase 4: Update Code

Update dimension loading logic in:
- `DimensionSelectorModal.tsx`
- `PerformanceTable.tsx`
- `FiltersBar.tsx`
- `DimensionsListModal.tsx`

Load dimensions with priority:
1. Account-scoped dimensions (for the current account)
2. Custom dimensions (user-specific)
3. Global dimensions (as fallback/templates)

## Implementation Steps

### Step 1: Migration SQL
```sql
-- For Roomstay account
INSERT INTO dimensions (id, name, type, formula, scope, account_id, user_id, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  name,
  type,
  formula,
  'account',
  '3998a594-c07c-46b2-937d-fe477b6e9ce7',  -- Roomstay
  user_id,
  now(),
  now()
FROM dimensions
WHERE scope = 'global';

-- For GO SG account
INSERT INTO dimensions (id, name, type, formula, scope, account_id, user_id, created_at, updated_at)
SELECT 
  gen_random_uuid(),
  name,
  type,
  formula,
  'account',
  '896be03c-6b46-4a9c-aa6d-7f517cf85f2c',  -- GO SG
  user_id,
  now(),
  now()
FROM dimensions
WHERE scope = 'global';
```

### Step 2: Update Column Mappings
For each data source:
1. Get report → account mapping
2. Find matching account-scoped dimension by name
3. Update column_mappings with new dimension ID

### Step 3: Update Dimension Loading
Change from:
```typescript
.eq("scope", "global")
```

To:
```typescript
.or(`scope.eq.account.and(account_id.eq.${accountId}),scope.eq.global`)
```

### Step 4: Auto-create Dimensions for New Accounts
When creating a new account:
```typescript
// Clone all global dimensions for the new account
const { data: globalDimensions } = await supabase
  .from('dimensions')
  .select('*')
  .eq('scope', 'global');

const accountDimensions = globalDimensions.map(d => ({
  name: d.name,
  type: d.type,
  formula: d.formula,
  scope: 'account',
  account_id: newAccountId,
  user_id: userId,
}));

await supabase.from('dimensions').insert(accountDimensions);
```

## Benefits
- ✅ Account isolation - changes only affect one account
- ✅ Safe deletion - deleting a dimension only affects its account
- ✅ Account-specific customization
- ✅ New accounts get standard dimensions automatically
- ✅ Global dimensions preserved as templates

## Risks & Mitigation
- **Risk**: Column mappings breaking
  - **Mitigation**: Map old dimension IDs to new ones before updating
- **Risk**: Existing data references
  - **Mitigation**: Keep data_sources and dimension_data intact, only update mappings
- **Risk**: Formula references
  - **Mitigation**: Formulas reference dimension names, not IDs

## Rollback Plan
If issues occur:
1. Revert column_mappings to original dimension IDs
2. Delete account-scoped dimensions
3. Re-enable global dimension loading
