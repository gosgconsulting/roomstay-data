# Dimension Visibility Database Fix

## Issue
When attempting to save dimension visibility settings, the application was throwing an error: **"Failed to save visibility settings. Please try again."**

## Root Cause
The `report_views` table was missing three critical columns required by the dimension visibility save functionality:

1. **`visible_dimensions`** - UUID array to store which dimensions are visible
2. **`is_default`** - Boolean flag to identify the default view for each user/report
3. **`name`** - Text field to name the view (e.g., "Default View")

The existing `report_views` table only had columns for tracking analytics (viewer_ip, viewer_user_agent, viewed_at, etc.) but not for storing user preferences.

## Solution Applied

### Migration: `add_visibility_columns_to_report_views`

Applied on: 2025-11-02

```sql
-- Add columns for dimension visibility settings to report_views table
ALTER TABLE public.report_views 
ADD COLUMN IF NOT EXISTS visible_dimensions UUID[] DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS name TEXT DEFAULT NULL;

-- Add comment explaining the new columns
COMMENT ON COLUMN public.report_views.visible_dimensions IS 'Array of dimension IDs that are visible in this view';
COMMENT ON COLUMN public.report_views.is_default IS 'Whether this is the default view for the user/report combination';
COMMENT ON COLUMN public.report_views.name IS 'Name of the view (e.g., "Default View")';

-- Create an index on report_id, user_id, and is_default for faster lookups
CREATE INDEX IF NOT EXISTS idx_report_views_report_user_default 
ON public.report_views(report_id, user_id, is_default) 
WHERE is_default = true;
```

### Table Structure After Fix

The `report_views` table now supports two use cases:

**1. Analytics/Tracking** (existing):
- `id`, `report_id`, `user_id`
- `viewer_ip`, `viewer_user_agent`, `referrer`
- `viewed_at`, `session_id`, `is_authenticated`

**2. View Configuration** (new):
- `visible_dimensions` - UUID[] - Array of dimension IDs to display
- `is_default` - BOOLEAN - Whether this is the user's default view
- `name` - TEXT - Name of the view

## How It Works

### Save Flow
1. User toggles dimension visibility (eye icons)
2. User clicks "Save Visibility Changes"
3. Application queries for existing default view:
   ```sql
   SELECT id FROM report_views
   WHERE report_id = ? AND user_id = ? AND is_default = true
   ```
4. If exists: **UPDATE** the `visible_dimensions` array
5. If not: **INSERT** new row with `is_default = true` and `visible_dimensions` array

### Load Flow
1. Application queries for user's default view:
   ```sql
   SELECT visible_dimensions FROM report_views
   WHERE report_id = ? AND user_id = ? AND is_default = true
   ```
2. If found: Display only those dimensions
3. If not found: Display all dimensions (default behavior)

## Performance Optimization

Added a partial index for faster lookups:
```sql
CREATE INDEX idx_report_views_report_user_default 
ON report_views(report_id, user_id, is_default) 
WHERE is_default = true;
```

This index speeds up queries for default views, which is the most common lookup pattern.

## Testing

### Verify the Fix

1. **Check columns exist:**
   ```sql
   SELECT column_name, data_type, is_nullable, column_default
   FROM information_schema.columns 
   WHERE table_name = 'report_views' 
   AND column_name IN ('visible_dimensions', 'is_default', 'name');
   ```

2. **Test save functionality:**
   - Open Dimensions modal in a report
   - Toggle some dimension visibility
   - Click "Save Visibility Changes"
   - Should show success toast: "Dimension visibility settings saved successfully"

3. **Verify persistence:**
   - Close and reopen the modal
   - Visibility settings should be preserved

4. **Check database:**
   ```sql
   SELECT report_id, user_id, is_default, name, 
          array_length(visible_dimensions, 1) as dimension_count
   FROM report_views
   WHERE visible_dimensions IS NOT NULL;
   ```

## Backward Compatibility

✅ **Fully backward compatible**
- All columns are nullable with defaults
- Existing rows continue to work for analytics tracking
- New rows can serve both purposes (analytics + view configuration)
- No data migration required

## Data Model

```typescript
interface ReportView {
  // Primary keys
  id: UUID;
  report_id: UUID;
  user_id?: UUID;
  
  // Analytics (existing)
  viewer_ip?: string;
  viewer_user_agent?: string;
  referrer?: string;
  viewed_at?: timestamp;
  session_id?: string;
  is_authenticated?: boolean;
  
  // View configuration (new)
  visible_dimensions?: UUID[];  // ← NEW
  is_default?: boolean;          // ← NEW
  name?: string;                 // ← NEW
  
  // Timestamps
  created_at?: timestamp;
}
```

## Known Limitations

1. **Single default view per user/report**
   - Currently only one default view is supported
   - Future enhancement: Multiple named views

2. **No view sharing**
   - Views are user-specific
   - Future enhancement: Share views between team members

3. **No view versioning**
   - Changes overwrite previous settings
   - Future enhancement: View history/undo

## Related Files

- Migration: `supabase/migrations/[timestamp]_add_visibility_columns_to_report_views.sql`
- Component: `src/components/DimensionsListModal.tsx`
- Test Plan: `src/tests/dimension-visibility-save-test.md`
- Implementation Doc: `DIMENSION_VISIBILITY_SAVE_IMPLEMENTATION.md`

## Next Steps

1. ✅ **Database migration applied**
2. ⏭️ **Test the save functionality** in the UI
3. ⏭️ **Verify persistence** across sessions
4. ⏭️ **Check for any RLS policies** that might block inserts/updates
5. ⏭️ **Monitor for errors** in production logs

## Rollback Plan

If needed, the columns can be safely removed:

```sql
ALTER TABLE public.report_views
DROP COLUMN IF EXISTS visible_dimensions,
DROP COLUMN IF EXISTS is_default,
DROP COLUMN IF EXISTS name;

DROP INDEX IF EXISTS idx_report_views_report_user_default;
```

Note: This will only affect the new visibility feature. Analytics tracking will continue to work.
