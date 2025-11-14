# Quick Start: Dimension Visibility Save Feature

## What Changed?

Users can now **batch toggle dimensions and save all at once** instead of auto-saving each click.

## How It Works

### User Flow

1. **Open Dimensions Modal**
   - Click "Dimensions" button in dashboard header
   
2. **Toggle Visibility** (Eye Icons)
   - Click eye icon to toggle any dimension on/off
   - 👁️ = Visible in report
   - 👁️‍🗨️ = Hidden from report
   
3. **Save Changes**
   - After toggling 1+ dimensions, a "Save Visibility Changes" button appears
   - Click to persist changes to database
   - Success toast confirms save
   
4. **Cancel Changes (Optional)**
   - Click "Cancel" to revert all unsaved changes
   - Returns to last saved state

### Visual Example

**Before (no changes):**
```
┌─────────────────────────────────────────┐
│ Dimensions (18)                    [X]  │
├─────────────────────────────────────────┤
│ Global | Account | Custom              │
│                                         │
│ Name           Type      Actions        │
│ Date           Date      👁️ ✏️          │
│ ROAS           Number    👁️ ✏️          │
│ Clicks         Number    👁️‍🗨️ ✏️         │
│                                         │
├─────────────────────────────────────────┤
│        [+ ADD A DIMENSION]              │
└─────────────────────────────────────────┘
```

**After toggling Clicks (unsaved):**
```
┌─────────────────────────────────────────┐
│ Dimensions (18)                    [X]  │
├─────────────────────────────────────────┤
│ Global | Account | Custom              │
│                                         │
│ Name           Type      Actions        │
│ Date           Date      👁️ ✏️          │
│ ROAS           Number    👁️ ✏️          │
│ Clicks         Number    👁️ ✏️  ← Changed│
│                                         │
├─────────────────────────────────────────┤
│ [💾 Save Visibility Changes] [✕ Cancel]│  ← New!
│        [+ ADD A DIMENSION]              │
└─────────────────────────────────────────┘
```

## Key Features

### ✅ Batch Operations
- Toggle multiple dimensions
- Save all at once
- Reduces database calls from N to 1

### ✅ Preview Changes
- See changes before committing
- No database writes until you click Save

### ✅ Easy Undo
- Cancel button reverts all unsaved changes
- Instant revert, no database call

### ✅ Smart Button Visibility
- Save/Cancel only appear when changes exist
- Disappear after save or cancel

### ✅ Loading States
- Button shows "Saving..." during operation
- Buttons disabled while saving

### ✅ Error Handling
- Toast notifications for success/error
- Can retry on failure
- Changes preserved on error

## Developer Notes

### State Management
```typescript
// Tracks saved state from database
const [initialVisibleDimensions, setInitialVisibleDimensions] = useState<Set<string> | null>(null);

// Tracks current UI state
const [visibleDimensions, setVisibleDimensions] = useState<Set<string> | null>(null);

// Loading state
const [isSaving, setIsSaving] = useState(false);
```

### Key Functions

**Toggle (Local Only):**
```typescript
const toggleDimensionVisibility = (dimensionId: string) => {
  // Updates visibleDimensions Set only
  // No database call
}
```

**Save (Persist to DB):**
```typescript
const saveVisibilityChanges = async () => {
  // Saves to report_views table
  // Updates initialVisibleDimensions on success
}
```

**Cancel (Revert):**
```typescript
const cancelVisibilityChanges = () => {
  // Copies initialVisibleDimensions back to visibleDimensions
}
```

**Change Detection:**
```typescript
const hasUnsavedChanges = () => {
  // Compares Sets efficiently
  // Returns boolean
}
```

### Conditional Rendering
```typescript
{reportId && hasUnsavedChanges() && (
  <div>
    <Button onClick={saveVisibilityChanges}>Save</Button>
    <Button onClick={cancelVisibilityChanges}>Cancel</Button>
  </div>
)}
```

## Testing

### Quick Manual Test
1. ✅ Toggle dimension → Buttons appear
2. ✅ Click Save → Success toast, buttons disappear
3. ✅ Close and reopen modal → Changes persisted
4. ✅ Toggle dimension → Buttons appear
5. ✅ Click Cancel → Changes reverted, buttons disappear

### Debug Logging
All operations log with `[testing]` prefix:
```javascript
[testing] Toggled dimension visibility locally: abc-123
[testing] Saving visibility changes to database
[testing] Successfully saved visibility changes
[testing] Cancelled visibility changes, reverted to initial state
```

## Database

### Table: `report_views`
```sql
id                UUID PRIMARY KEY
report_id         UUID (FK → reports)
user_id           UUID (FK → auth.users)
is_default        BOOLEAN
name              TEXT
visible_dimensions UUID[] -- Array of dimension IDs
created_at        TIMESTAMP
updated_at        TIMESTAMP
```

### Upsert Behavior
- **First save**: Creates new row with is_default=true
- **Subsequent saves**: Updates existing row
- **Per user/report**: Each user has their own default view per report

## Troubleshooting

### Buttons Don't Appear
**Cause**: No reportId provided or no changes made  
**Solution**: Ensure you're in a report context

### Changes Don't Save
**Cause**: Network error or permission issue  
**Solution**: Check console for `[testing]` logs, verify authentication

### Save Button Stays Visible
**Cause**: Save operation failed  
**Solution**: Click Save again to retry

### Changes Lost on Close
**Cause**: Modal closed without clicking Save  
**Expected**: Unsaved changes are discarded

## Performance

### Before
- **N database calls** (one per toggle)
- Network latency on each click
- Potential race conditions

### After
- **1 database call** (on save)
- Instant UI response
- No race conditions

## Files Changed

```
src/components/DimensionsListModal.tsx     (Modified)
src/tests/dimension-visibility-save-test.md (New)
DIMENSION_VISIBILITY_SAVE_IMPLEMENTATION.md (New)
QUICK_START_DIMENSION_VISIBILITY.md        (New - This file)
```

## Related Documentation

- Full implementation details: `DIMENSION_VISIBILITY_SAVE_IMPLEMENTATION.md`
- Complete test plan: `src/tests/dimension-visibility-save-test.md`
- Component source: `src/components/DimensionsListModal.tsx`

## Support

For issues or questions:
1. Check debug logs (filter by `[testing]`)
2. Review test cases in test plan
3. Verify database schema matches docs
4. Check network tab for API calls
