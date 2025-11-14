# Debug Plan: Analytics & Insights Cards Not Showing

## Phase 1: Analysis - Root Cause Investigation ✅ COMPLETED

### Problem Statement
The Analytics & Insights cards (KPIMetricsCards component) are not displaying on the dashboard.

### ✅ ROOT CAUSE IDENTIFIED

**The required database tables do not exist:**
- ❌ `dimension_data` table - MISSING
- ❌ `dimensions` table - MISSING  
- ❌ `report_views` table - MISSING

The KPIMetricsCards component attempts to query these tables starting at line 72:
```typescript
const { data: userDimensions, error: userError } = await supabase
  .from("dimensions")
  .select("*")
  .eq("user_id", user.id);
```

And at line 113:
```typescript
const { data: chunkData, error } = await supabase
  .from("dimension_data")
  .select("*")
  .eq("report_id", reportId)
```

**Impact:** The component will fail silently in the catch block (line 279-280), setting an empty metrics array and displaying "No KPIs configured" message.

### Database Schema Investigation

Checked the Supabase database and found:
- ✅ 195+ tables exist in the public schema
- ❌ None of the required tables for KPI metrics exist:
  - `dimension_data`
  - `dimensions`
  - `report_views`

### Alternative Tables Found

The database DOES have:
- ✅ `data_reports` - Stores report metadata
- ✅ `data_sources` - Stores data source information
- ✅ `data_source_mappings` - Maps columns to KPIs
- ✅ `reporting_kpis` - Stores actual KPI data (clicks, cost, bookings, revenue)

This suggests the application may have been refactored but the KPIMetricsCards component wasn't updated to use the new schema.

---

## Phase 2: Implementation - Create Missing Tables or Refactor Component

### Option A: Create Missing Tables (Quick Fix)
Create the expected database schema that the component needs.

### Option B: Refactor Component (Proper Fix)
Update KPIMetricsCards to use the existing `reporting_kpis` and `data_reports` tables.

### Recommended Approach: Option B - Refactor

**Rationale:**
1. The existing tables (`reporting_kpis`, `data_reports`) already contain the data
2. Creating duplicate tables would lead to data inconsistency
3. The component should use the actual database schema

---

## Phase 3: Verification - Test the Fix

### Test Cases

1. **Test with existing data**
   - ✓ Query `reporting_kpis` table
   - ✓ Display metrics from actual data
   - ✓ Handle empty state gracefully

2. **Test with reportId**
   - ✓ Filter by report_name
   - ✓ Aggregate metrics correctly
   - ✓ Calculate comparisons if date ranges provided

3. **Test with filters**
   - ✓ Apply date range filters
   - ✓ Handle dimension filters if applicable

---

## Phase 4: Refinement - Implement Solution

### Action Items

1. **Update KPIMetricsCards.tsx to use correct tables**
   - Replace `dimensions` queries with schema from `data_reports`
   - Replace `dimension_data` queries with `reporting_kpis`
   - Replace `report_views` queries with user preferences or remove

2. **Update data fetching logic**
   - Query `reporting_kpis` for metrics data
   - Aggregate by date ranges
   - Calculate KPI values (CTR, ROAS, etc.) from base metrics

3. **Test thoroughly**
   - Verify all KPIs display correctly
   - Test with different date ranges
   - Test comparison periods

4. **Update documentation**
   - Document the correct database schema
   - Update any API documentation

---

## Next Steps

1. ✅ Root cause identified - missing tables
2. ⏭️ Examine existing `reporting_kpis` table structure
3. ⏭️ Refactor KPIMetricsCards to use correct schema
4. ⏭️ Test with actual data
5. ⏭️ Deploy and verify

---

## Database Schema Comparison

### Expected by Component (MISSING):
```
dimensions (id, name, type, formula, user_id)
dimension_data (id, report_id, dimension_values, row_number)
report_views (id, report_id, user_id, visible_kpis, kpi_order)
```

### Actually Available:
```
reporting_kpis (id, report_name, date, clicks, cost, bookings, revenue, metadata)
data_reports (id, name, google_sheets_url, user_id, status, column_mappings, kpi_configuration)
data_sources (id, name, type, url, configuration)
data_source_mappings (id, data_source_id, report_name, column_mappings, kpi_mappings)
```

The actual schema is more straightforward and already has the KPI data structured properly!
