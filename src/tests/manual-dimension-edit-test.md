# Manual Test Guide: Dimension Edit Functionality

## Test Scenario: Replace Eye Icon with Edit Icon and Enable Dimension Editing

### Prerequisites
1. Application is running (`npm run dev`)
2. User is authenticated
3. At least one dimension exists in the system

### Test Steps

#### 1. Verify Edit Icon Replacement
- [ ] Navigate to the dashboard
- [ ] Click on "Dimensions" button
- [ ] Verify that dimensions list modal opens
- [ ] **Expected**: Each dimension row shows a pencil (edit) icon instead of an eye icon
- [ ] **Expected**: Edit icon has tooltip "Edit dimension"

#### 2. Test Edit Functionality - Opening Edit Modal
- [ ] Click on the edit (pencil) icon for any dimension
- [ ] **Expected**: Dimensions list modal closes
- [ ] **Expected**: Dimension edit modal opens with title "Edit Dimension"
- [ ] **Expected**: Form fields are pre-populated with existing dimension data:
  - Name field shows current dimension name
  - Type dropdown shows current dimension type
  - Formula field shows current formula (if any)

#### 3. Test Edit Functionality - Updating Dimension
- [ ] Modify the dimension name (e.g., add " - Updated")
- [ ] Change the type if desired
- [ ] Modify or add a formula
- [ ] Click "Save" button
- [ ] **Expected**: Success toast appears: "Dimension updated"
- [ ] **Expected**: Edit modal closes
- [ ] **Expected**: Dimensions list modal reopens
- [ ] **Expected**: Updated dimension appears in the list with new values

#### 4. Test Edit Functionality - Validation
- [ ] Click edit on any dimension
- [ ] Clear the name field (make it empty)
- [ ] Click "Save"
- [ ] **Expected**: Error toast appears: "Please enter a dimension name"
- [ ] **Expected**: Modal remains open

#### 5. Test Edit Functionality - Cancel
- [ ] Click edit on any dimension
- [ ] Make some changes to the form
- [ ] Click "Cancel" button
- [ ] **Expected**: Edit modal closes without saving
- [ ] **Expected**: Dimensions list modal reopens
- [ ] **Expected**: Original dimension data is unchanged

#### 6. Test Add Functionality Still Works
- [ ] In dimensions list modal, click "ADD A DIMENSION"
- [ ] **Expected**: Modal opens with title "Add Dimension"
- [ ] **Expected**: Form fields are empty/default
- [ ] Fill in dimension details and save
- [ ] **Expected**: New dimension is created successfully

### Debug Logs to Check
Look for these console logs (prefixed with `[testing]`):
- `[testing] Opening edit dimension modal for: {dimension}`
- `[testing] Populating form for edit mode: {dimension}`
- `[testing] Updating dimension: {dimensionId}`
- `[testing] Dimension saved, refreshing list`

### Error Scenarios to Test
1. Network error during update
2. Invalid dimension data
3. Concurrent edits (if applicable)

### Success Criteria
- ✅ Eye icon is completely replaced with edit (pencil) icon
- ✅ Edit icon opens pre-populated edit modal
- ✅ Dimension updates are saved to database
- ✅ UI refreshes to show updated data
- ✅ Validation works correctly
- ✅ Add functionality remains intact
- ✅ No console errors or TypeScript issues
