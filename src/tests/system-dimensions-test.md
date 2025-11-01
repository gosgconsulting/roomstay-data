# Manual Test Guide: System Dimensions Protection

## Test Scenario: Verify hardcoded dimensions cannot be deleted across all reports

### Prerequisites
1. Application is running (`npm run dev`)
2. User is authenticated
3. System has created default dimensions

### Test Steps

#### 1. Verify System Dimensions Are Created
- [ ] Navigate to the dashboard
- [ ] Click on "Dimensions" button
- [ ] **Expected**: Dimensions list modal opens
- [ ] **Expected**: Default dimensions are present:
  - **Base Metrics**: Impressions, Clicks, Revenue, Cost, Conversions, Leads
  - **Formula KPIs**: CTR, ROAS, Cost of sale, Conversion Rate, CPM, CPC, Impression Share

#### 2. Verify System Dimensions Cannot Be Deleted
- [ ] Look at each system dimension row
- [ ] **Expected**: System dimensions show "SYS" label instead of delete button
- [ ] **Expected**: User-created dimensions show delete button (trash icon)
- [ ] Try to find delete button for system dimensions
- [ ] **Expected**: No delete button visible for system dimensions

#### 3. Test System Dimension Edit Restrictions
- [ ] Click edit (pencil icon) on a system dimension (e.g., "Impressions")
- [ ] **Expected**: Edit modal opens with "System" badge in title
- [ ] **Expected**: Description says "This is a system dimension. Only the formula can be modified."
- [ ] **Expected**: Name field is disabled and grayed out
- [ ] **Expected**: Type dropdown is disabled and grayed out
- [ ] **Expected**: Formula field is editable (if applicable)
- [ ] **Expected**: Helper text explains restrictions

#### 4. Test System Dimension Formula Editing
- [ ] Edit a formula-based system dimension (e.g., "CTR")
- [ ] Modify the formula (e.g., change "Clicks / Impressions * 100" to "Clicks / Impressions * 50")
- [ ] Click "Save"
- [ ] **Expected**: Success toast: "Dimension updated"
- [ ] **Expected**: Modal closes and list refreshes
- [ ] **Expected**: Formula change is saved

#### 5. Test User Dimension Deletion Still Works
- [ ] Create a new custom dimension via "ADD A DIMENSION"
- [ ] Return to dimensions list
- [ ] **Expected**: Custom dimension shows delete button (trash icon)
- [ ] Click delete button on custom dimension
- [ ] **Expected**: Dimension is deleted successfully
- [ ] **Expected**: Success toast appears

#### 6. Test System Dimension Identification
- [ ] Check console logs for `[testing]` messages
- [ ] **Expected**: Logs show system dimension detection
- [ ] **Expected**: Logs show protection messages when attempting operations

#### 7. Test Across Multiple Reports
- [ ] Create or switch to different report
- [ ] Navigate to dimensions
- [ ] **Expected**: Same system dimensions are protected
- [ ] **Expected**: Protection works consistently across all reports

### Debug Logs to Check
Look for these console logs (prefixed with `[testing]`):
- `[testing] Creating system dimensions: [...]`
- `[testing] Attempted to delete system dimension: {name}`
- `[testing] Deleting user dimension: {name}`
- `[testing] Populating form for edit mode: {dimension}`

### Error Scenarios to Test
1. **Attempt to delete system dimension programmatically**
   - Should be blocked with error message
2. **Attempt to modify system dimension name/type**
   - Should be prevented in UI and backend
3. **System dimension detection edge cases**
   - Test with dimensions that have similar names

### Success Criteria
- ✅ All 13 system dimensions are protected from deletion
- ✅ System dimensions show "SYS" label instead of delete button
- ✅ System dimension editing is restricted (name/type read-only)
- ✅ System dimension formulas can still be modified
- ✅ User-created dimensions can still be deleted normally
- ✅ Protection works across all reports consistently
- ✅ Clear visual indicators for system vs user dimensions
- ✅ Appropriate error messages when attempting restricted operations

### System Dimensions List
**Base Metrics (6):**
1. Impressions (number)
2. Clicks (number)
3. Revenue (currency)
4. Cost (currency)
5. Conversions (number)
6. Leads (number)

**Formula KPIs (7):**
1. CTR (percentage) - Clicks / Impressions * 100
2. ROAS (number) - Revenue / Cost
3. Cost of sale (percentage) - Cost / Revenue * 100
4. Conversion Rate (percentage) - Conversions / Clicks * 100
5. CPM (currency) - Cost / Impressions * 1000
6. CPC (currency) - Cost / Clicks
7. Impression Share (percentage) - Impressions / Total Impressions * 100
