# Manual Test Guide: Report-Specific Dimensions

## Test Scenario: Verify KPI formula modifications are applied per report, not across reports

### Prerequisites
1. Application is running (`npm run dev`)
2. User is authenticated
3. At least 2 different reports exist or can be created

### Test Steps

#### 1. Create/Access Multiple Reports
- [ ] Navigate to the dashboard
- [ ] Ensure you have at least 2 reports available
- [ ] Note the report IDs/names for reference
- [ ] **Expected**: Each report should have its own set of dimensions

#### 2. Verify System Dimensions Are Created Per Report
- [ ] Switch to Report A
- [ ] Click "Dimensions" button
- [ ] **Expected**: System dimensions are present (Impressions, Clicks, Revenue, Cost, etc.)
- [ ] Note the current formula for "CTR" (should be "Clicks / Impressions * 100")
- [ ] Switch to Report B  
- [ ] Click "Dimensions" button
- [ ] **Expected**: Same system dimensions are present with default formulas
- [ ] **Expected**: CTR formula is also "Clicks / Impressions * 100" (default)

#### 3. Test Report-Specific Formula Modification
- [ ] In Report A, edit the "CTR" dimension
- [ ] **Expected**: Edit modal opens with "System" badge
- [ ] **Expected**: Name and Type fields are disabled
- [ ] **Expected**: Formula field is editable
- [ ] Change formula from "Clicks / Impressions * 100" to "Clicks / Impressions * 50"
- [ ] Click "Save"
- [ ] **Expected**: Success toast: "Dimension updated"
- [ ] **Expected**: Modal closes and returns to dimensions list

#### 4. Verify Formula Change Is Report-Specific
- [ ] In Report A dimensions list, verify CTR shows modified formula
- [ ] **Expected**: CTR formula is now "Clicks / Impressions * 50"
- [ ] Switch to Report B
- [ ] Navigate to dimensions
- [ ] Check CTR dimension formula
- [ ] **Expected**: CTR formula is still "Clicks / Impressions * 100" (unchanged)
- [ ] **Expected**: Report B dimensions are independent of Report A changes

#### 5. Test Multiple Formula Modifications
- [ ] In Report B, edit "ROAS" dimension
- [ ] Change formula from "Revenue / Cost" to "Revenue / Cost * 2"
- [ ] Save the change
- [ ] Switch back to Report A
- [ ] Check ROAS dimension
- [ ] **Expected**: Report A ROAS is still "Revenue / Cost" (original)
- [ ] **Expected**: Each report maintains its own formula customizations

#### 6. Test User Dimension Creation Per Report
- [ ] In Report A, create a new custom dimension "Custom Metric A"
- [ ] Set type as "number", no formula
- [ ] Save the dimension
- [ ] Switch to Report B
- [ ] **Expected**: "Custom Metric A" is NOT visible in Report B
- [ ] Create a different custom dimension "Custom Metric B" in Report B
- [ ] Switch back to Report A
- [ ] **Expected**: "Custom Metric B" is NOT visible in Report A

#### 7. Test System Dimension Protection Per Report
- [ ] In Report A, try to delete "Impressions" dimension
- [ ] **Expected**: No delete button visible (shows "SYS" label)
- [ ] In Report B, try to delete "Clicks" dimension  
- [ ] **Expected**: No delete button visible (shows "SYS" label)
- [ ] **Expected**: System dimensions are protected in all reports

#### 8. Test Cross-Report Independence
- [ ] Create Report C (if possible)
- [ ] Navigate to dimensions in Report C
- [ ] **Expected**: Fresh set of default system dimensions with original formulas
- [ ] **Expected**: No custom dimensions from Reports A or B
- [ ] **Expected**: All system dimensions have default formulas

### Debug Logs to Check
Look for these console logs (prefixed with `[testing]`):
- `[testing] Creating default dimensions for report: {reportId}`
- `[testing] Existing dimensions for report: [...]`
- `[testing] Creating report-specific system dimensions: [...]`
- `[testing] For report ID: {reportId}`
- `[testing] Loading dimensions for user: {userId} report: {reportId}`
- `[testing] Loaded report-specific dimensions: {count}`
- `[testing] Creating new dimension for report: {reportId}`

### Advanced Test Scenarios

#### 9. Test Report Switching Behavior
- [ ] Open dimensions modal in Report A
- [ ] Switch to Report B without closing modal
- [ ] Close and reopen dimensions modal
- [ ] **Expected**: Shows Report B dimensions, not Report A
- [ ] **Expected**: No cross-contamination between reports

#### 10. Test Formula Validation Per Report
- [ ] In Report A, edit CTR with invalid formula "invalid_formula"
- [ ] Try to save
- [ ] **Expected**: Appropriate error handling
- [ ] Switch to Report B
- [ ] **Expected**: CTR still has valid original formula

#### 11. Test Bulk Operations
- [ ] Create multiple custom dimensions in Report A
- [ ] Switch to Report B
- [ ] **Expected**: Report B is unaffected by Report A bulk changes
- [ ] **Expected**: Each report maintains independent dimension sets

### Success Criteria
- ✅ System dimensions are created independently for each report
- ✅ Formula modifications in one report don't affect other reports
- ✅ Custom dimensions are report-specific (not shared)
- ✅ System dimension protection works in all reports
- ✅ Default formulas are preserved when switching reports
- ✅ Debug logs show correct report IDs for all operations
- ✅ No cross-contamination between report dimensions
- ✅ Each report can have different formula customizations
- ✅ User-created dimensions are isolated per report

### Error Scenarios to Test
1. **Missing Report ID**: Should handle gracefully
2. **Invalid Report ID**: Should show appropriate errors  
3. **Report switching during operations**: Should maintain data integrity
4. **Concurrent modifications**: Should handle properly per report

### Database Verification
If you have database access, verify:
- [ ] Dimensions table has `report_id` column populated
- [ ] Same dimension names exist with different `report_id` values
- [ ] Formula modifications are stored per `report_id`
- [ ] `is_system` flag is consistent across reports

### Performance Considerations
- [ ] Dimension loading is fast when switching reports
- [ ] No unnecessary API calls when report doesn't change
- [ ] Efficient filtering by report_id in database queries

This test ensures that the core requirement is met: **KPI formula modifications are applied per report and do not affect other reports**, while maintaining all existing protection and functionality.
