# Edit Mode Settings Persistence Test

## Test Objective
Verify that all settings configured in Edit Mode are properly saved and persist after page refresh.

## Test Setup
1. Navigate to a report dashboard
2. Switch to Edit Mode
3. Configure various settings
4. Refresh the page
5. Verify all settings are restored

## Test Cases

### 1. Filter Settings Persistence ✅
**Steps:**
1. Switch to Edit Mode
2. Open Filter Settings (gear icon next to filters)
3. Select/deselect dimensions (e.g., add "Campaign", remove "Hotel")
4. Save settings
5. Add some filter values (e.g., filter by specific accounts)
6. Change date range to "Last 30 days"
7. Refresh the page

**Expected Results:**
- ✅ Selected filter dimensions should be restored
- ✅ Filter values should be restored
- ✅ Date range should be restored
- ✅ Settings should only be editable in Edit Mode

**Database Location:** `views.filter_dimensions`, `views.filter_values`, `views.date_range_start/end`

### 2. KPI Settings Persistence ✅
**Steps:**
1. Switch to Edit Mode
2. Click "KPI Settings" button
3. Reorder KPIs (drag and drop)
4. Hide some KPIs (uncheck boxes)
5. Save settings
6. Refresh the page

**Expected Results:**
- ✅ KPI order should be restored
- ✅ Hidden KPIs should remain hidden
- ✅ Visible KPIs should match saved configuration
- ✅ Settings should only be editable in Edit Mode

**Database Location:** `views.visible_kpis`, `views.kpi_order`

### 3. Performance Table Column Settings Persistence ✅
**Steps:**
1. Switch to Edit Mode
2. In Performance Table header, click column visibility icon
3. Hide some columns (uncheck boxes)
4. Reorder columns (drag and drop)
5. Apply settings (should auto-save now)
6. Refresh the page

**Expected Results:**
- ✅ Column visibility should be restored
- ✅ Column order should be restored
- ✅ Settings should only be editable in Edit Mode

**Database Location:** `views.visible_columns`, `views.column_order`

### 4. Performance Table Grouping Settings Persistence ✅
**Steps:**
1. Switch to Edit Mode
2. Change "Group by" dimension
3. Change "Breakdown by" dimension
4. Change "Then by" dimension
5. Switch between Day/Week/Month/Year tabs
6. Refresh the page

**Expected Results:**
- ✅ Group by dimension should be restored
- ✅ Breakdown by dimension should be restored
- ✅ Then by dimension should be restored
- ✅ Date granularity tab should be restored
- ✅ Settings should only be editable in Edit Mode

**Database Location:** `views.group_by_dimensions`, `views.breakdown_by_dimensions`, `views.then_by_dimensions`, `views.date_granularity`

### 5. Edit Mode State Persistence ❌
**Steps:**
1. Switch to Edit Mode
2. Refresh the page

**Expected Results:**
- ❌ Edit Mode should reset to View Mode (this is intentional for security)
- ✅ All configured settings should still be loaded
- ✅ Settings should not be editable until Edit Mode is re-enabled

### 6. Cross-Component Integration Test ✅
**Steps:**
1. Switch to Edit Mode
2. Configure filters, KPIs, and table columns
3. Switch to View Mode
4. Refresh the page
5. Switch back to Edit Mode

**Expected Results:**
- ✅ All settings should be restored correctly
- ✅ Components should work together seamlessly
- ✅ No conflicts between different setting types

## Debugging Commands

### Check Database State
```sql
-- Check unified `views` row for PerformanceTable (legacy `report_views` was dropped)
SELECT 
  name,
  mode,
  filter_dimensions,
  filter_values,
  visible_kpis,
  kpi_order,
  visible_columns,
  column_order,
  group_by_dimensions,
  breakdown_by_dimensions,
  then_by_dimensions,
  date_granularity,
  date_range_start,
  date_range_end,
  date_range_preset
FROM views
WHERE report_id = 'YOUR_REPORT_ID'
  AND mode = 'performance_table'
  AND is_default = true;
```

### Browser Console Debugging
```javascript
// Check if settings are being saved
console.log('[EDIT-MODE-TEST] Filter settings saved:', localStorage.getItem('filter-settings'));

// Monitor save operations
window.addEventListener('beforeunload', () => {
  console.log('[EDIT-MODE-TEST] Page refreshing, checking if settings were saved');
});
```

## Known Issues & Fixes Applied

### ✅ Fixed: Column Settings Required Manual Save
- **Issue**: Column visibility changes required clicking "Apply Settings"
- **Fix**: Added auto-save with 1-second debounce
- **Location**: `usePerformanceTableColumns.ts`

### ✅ Fixed: Edit Mode Check Missing
- **Issue**: Some settings saved even in View Mode
- **Fix**: Added `isEditMode` checks to all save operations
- **Location**: `FiltersBar.tsx`, `usePerformanceTableViews.ts`

### ✅ Fixed: Inconsistent Save Patterns
- **Issue**: Different components used different save mechanisms
- **Fix**: Standardized on auto-save with debounce for most settings
- **Location**: Multiple components

## Success Criteria
- [ ] All filter settings persist after refresh
- [ ] All KPI settings persist after refresh  
- [ ] All table column settings persist after refresh
- [ ] All table grouping settings persist after refresh
- [ ] Settings only save in Edit Mode
- [ ] No console errors during save/load operations
- [ ] UI shows appropriate loading/saving states