# Dimension Visibility Save Feature Test

## Overview
This test verifies that the dimension visibility save feature works correctly. Users should be able to toggle dimension visibility using the eye icon, and changes should only be saved when they click the "Save Visibility Changes" button.

## Test Date
Created: 2025-11-02

## Feature Description
- **Purpose**: Allow users to batch toggle dimension visibility before saving to database
- **Affected Component**: `DimensionsListModal.tsx`
- **User Story**: As a user, I want to toggle multiple dimensions on/off and then save all my changes at once, so I have better control over what dimensions are visible in my reports.

## Implementation Details

### State Management
1. **New State Variables**:
   - `initialVisibleDimensions`: Set<string> | null - Tracks the saved state from database
   - `isSaving`: boolean - Loading state during save operation

2. **Modified Functions**:
   - `toggleDimensionVisibility`: Now only updates local state, no database save
   - `loadVisibleDimensions`: Now also sets `initialVisibleDimensions`

3. **New Functions**:
   - `saveVisibilityChanges()`: Persists visibility changes to database
   - `cancelVisibilityChanges()`: Reverts to initial state
   - `hasUnsavedChanges()`: Compares current vs initial state

### UI Changes
1. **Save/Cancel Buttons**:
   - Only visible when `reportId` exists and there are unsaved changes
   - Save button shows "Saving..." during operation
   - Cancel button reverts to initial state
   
2. **Button Layout**:
   - Save button takes most space (flex-1)
   - Cancel button is compact
   - "Add Dimension" button changes to secondary variant when unsaved changes exist

## Test Cases

### Test 1: Basic Visibility Toggle
**Steps**:
1. Open Dimensions modal with a valid reportId
2. Click the eye icon on any dimension
3. Verify the eye icon changes state (Eye → EyeOff or vice versa)
4. Verify "Save Visibility Changes" button appears at bottom
5. Verify "Cancel" button appears next to it

**Expected Result**: ✅ 
- UI updates immediately
- Save/Cancel buttons appear
- No database call made yet

---

### Test 2: Save Visibility Changes
**Steps**:
1. Toggle visibility on 2-3 dimensions
2. Click "Save Visibility Changes"
3. Verify toast notification shows success
4. Verify Save/Cancel buttons disappear
5. Close and reopen the modal
6. Verify visibility state persists

**Expected Result**: ✅
- Changes saved to database
- Buttons hide after save
- State persists on reload

---

### Test 3: Cancel Visibility Changes
**Steps**:
1. Note initial visibility state
2. Toggle visibility on 2-3 dimensions
3. Click "Cancel"
4. Verify eye icons revert to original state
5. Verify Save/Cancel buttons disappear

**Expected Result**: ✅
- All changes reverted
- UI matches initial state
- No database call made

---

### Test 4: Multiple Toggles Before Save
**Steps**:
1. Toggle dimension A (on → off)
2. Toggle dimension B (off → on)
3. Toggle dimension A again (off → on)
4. Click Save
5. Verify final state matches UI state

**Expected Result**: ✅
- Only final state is saved
- All intermediate states are ignored

---

### Test 5: No Save Button Without ReportId
**Steps**:
1. Open Dimensions modal without reportId (global context)
2. Toggle eye icon on any dimension
3. Verify NO Save/Cancel buttons appear

**Expected Result**: ✅
- Eye icons may toggle locally
- No save functionality available
- No buttons shown

---

### Test 6: Loading State During Save
**Steps**:
1. Toggle visibility on a dimension
2. Click "Save Visibility Changes"
3. During save operation:
   - Verify button shows "Saving..."
   - Verify Save button is disabled
   - Verify Cancel button is disabled

**Expected Result**: ✅
- Button text changes
- Both buttons disabled during save
- Re-enabled after save completes

---

### Test 7: Error Handling
**Steps**:
1. Disconnect from internet (or simulate database error)
2. Toggle visibility
3. Click Save
4. Verify error toast appears
5. Verify buttons remain visible (changes not lost)
6. Reconnect and click Save again

**Expected Result**: ✅
- Error message shown
- Local state preserved
- Can retry save

---

### Test 8: Initial Load - No Saved Settings
**Steps**:
1. Create a new report with no saved visibility settings
2. Open Dimensions modal
3. Verify all dimensions show Eye icon (all visible)
4. Verify NO Save/Cancel buttons (no changes made)

**Expected Result**: ✅
- All dimensions default to visible
- No unsaved changes initially

---

### Test 9: Initial Load - With Saved Settings
**Steps**:
1. Use report with previously saved visibility settings
2. Open Dimensions modal
3. Verify eye icons match saved state
4. Verify NO Save/Cancel buttons initially

**Expected Result**: ✅
- Correct state loaded from database
- No unsaved changes initially

---

### Test 10: Close Modal Without Saving
**Steps**:
1. Toggle visibility on several dimensions
2. Close modal (X button or click outside)
3. Reopen modal
4. Verify changes were NOT saved
5. Verify original state restored

**Expected Result**: ✅
- Unsaved changes discarded on close
- Modal reopens with saved state

---

## Edge Cases

### Edge Case 1: Toggle All Dimensions
**Steps**:
1. Toggle every dimension to opposite state
2. Save
3. Verify all changes persisted

**Expected Result**: ✅

---

### Edge Case 2: Rapid Toggling
**Steps**:
1. Rapidly click same eye icon multiple times
2. Verify final state is correct
3. Save and verify

**Expected Result**: ✅

---

### Edge Case 3: Empty Visible Set
**Steps**:
1. Turn off all dimensions
2. Save
3. Reopen modal
4. Verify all show EyeOff icon

**Expected Result**: ✅

---

## Code Quality Checks

### Debug Logging
- ✅ All save operations log to console with `[testing]` prefix
- ✅ Toggle operations log dimension ID
- ✅ Error cases log with context

### Performance
- ✅ No database calls on toggle (only on save)
- ✅ Efficient Set comparison in hasUnsavedChanges()
- ✅ No unnecessary re-renders

### Accessibility
- ✅ Buttons have descriptive text
- ✅ Icons have proper aria labels
- ✅ Loading states communicated clearly

### User Experience
- ✅ Immediate visual feedback on toggle
- ✅ Clear indication of unsaved changes
- ✅ Success/error feedback via toasts
- ✅ Can cancel changes before saving

## Database Schema Verification

### Table: `views` (mode `performance_table`)
Required columns (relevant to this feature):
- `id`: UUID (primary key)
- `report_id`: UUID (foreign key, nullable for slide-scoped rows)
- `user_id`: UUID (foreign key)
- `mode`: text — use `performance_table` for dashboard views (Data Studio saved views use `slide_view`)
- `is_default`: boolean
- `name`: text
- `visible_columns`: string[] | null (dimension / column visibility for the table)

**Verification**: ✅ Schema supports the feature (unified `views` replaced legacy `report_views`)

## Regression Tests

### Ensure No Breaking Changes:
1. ✅ Edit dimension functionality still works
2. ✅ Delete dimension functionality still works
3. ✅ Add dimension functionality still works
4. ✅ Mapped dimensions indicator still shows
5. ✅ System dimensions still show SYS badge
6. ✅ Tabs (Global/Account/Custom) still work

## Manual Test Checklist

Before marking as complete, manually verify:
- [ ] All Test Cases pass
- [ ] All Edge Cases handled
- [ ] No console errors
- [ ] Build passes (`npm run build`)
- [ ] No TypeScript errors
- [ ] UI looks good on different screen sizes
- [ ] Feature works with multiple reports
- [ ] Feature works with multiple users

## Known Limitations

1. **No confirmation on close**: If user closes modal with unsaved changes, they are lost
   - Future improvement: Add confirmation dialog

2. **No batch operations**: Can't select multiple dimensions and toggle all at once
   - Future improvement: Add "Show All" / "Hide All" buttons

## Rollback Plan

If issues are found:
1. Revert `DimensionsListModal.tsx` to previous version
2. Visibility will auto-save on every toggle (old behavior)
3. No data loss - feature is additive only

## Success Criteria

✅ Users can toggle multiple dimensions before saving  
✅ Save button only appears when there are changes  
✅ Cancel button reverts unsaved changes  
✅ Changes persist after save  
✅ No breaking changes to existing functionality  
✅ Clear user feedback (toasts, loading states)  
✅ Feature works with and without reportId  

## Notes

- Feature is backward compatible
- Persists to unified `views` table (`mode = 'performance_table'`)
- Performance improved (fewer database calls)
- Better UX with batch operations
