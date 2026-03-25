

## Root Cause Analysis

There are **three interconnected issues** causing shared views to intermittently show 0 data:

### Issue 1: `dimensions` table has no anon RLS policy
When the edge function `get-cached-report-data` fails (timeout, cold start), the client falls back to `fetchChannelRowsDirect` which calls `buildDimensionNameMap()`. This queries the `dimensions` table directly from the client. For unauthenticated share viewers, the `dimensions` table has NO `anon` SELECT policy, so the query returns empty `{}`. Without dimension names, `filterRawDataRows` cannot resolve filter dimension IDs to row keys, causing all filter-matching to fail silently — resulting in 0 KPIs.

### Issue 2: React Query 5-minute staleTime caches bad results
If the first fetch fails or returns empty dimMaps, React Query caches that result for 5 minutes (`staleTime: 5 * 60 * 1000`). Subsequent renders reuse the bad cached data. The cache guard only checks for 0 *rows*, not 0 dimMap entries, so it doesn't trigger a retry when rows exist but dimMap is empty.

### Issue 3: sessionStorage dependency on page refresh
When a user refreshes `/shared/brady/studio?id=...&aid=...&vid=...` directly, `SharedReport.tsx` is NOT loaded — the user goes straight to `SlideViewPage`. If `share_report_ids_${slug}` wasn't persisted in sessionStorage before the refresh, the system relies on a DB fallback that adds an extra render cycle and can race with the query cache.

## Plan

### Step 1: Add anon SELECT policy for `dimensions` table
Create a migration that adds an RLS policy allowing anonymous users to read dimensions that belong to reports referenced by share links. This ensures `buildDimensionNameMap` works for unauthenticated viewers in the direct DB fallback path.

```sql
CREATE POLICY "Anon can read dimensions for shared reports"
ON public.dimensions FOR SELECT TO anon
USING (
  EXISTS (
    SELECT 1 FROM public.data_sources ds
    JOIN public.reports r ON r.id = ds.report_id
    JOIN public.slide_reports sr ON sr.account_id = r.account_id
    JOIN public.share_links sl ON sl.slide_report_id = sr.id
    WHERE ds.id = dimensions.data_source_id
  )
  OR scope = 'global'
);
```

### Step 2: Fix React Query caching for shared views
In `useDataStudioRawRows.ts`:
- Reduce `staleTime` to 0 and `gcTime` to 0 for shared/anon views (no user session) so data is always fresh
- Expand the cache guard to also detect empty dimMaps (rows exist but no dimension names) and force invalidation
- Add `refetchOnMount: true` so page refreshes always get fresh data

### Step 3: Eliminate sessionStorage race on refresh
In `SlideViewPage.tsx`:
- When URL has `?id=` and `?aid=`, **always** fetch `report_ids` from the `slide_reports` table on mount (don't wait for sessionStorage to fail first)
- Store the result in sessionStorage for future use
- This makes the URL the single source of truth, with sessionStorage as a performance optimization only

### Step 4: Retry logic when edge function fails
In `useDataStudioRawRows.ts`:
- Add `retry: 2` to the React Query config so transient edge function failures are retried automatically
- The existing fallback to `fetchChannelRowsDirect` remains as a last resort

### Files to modify
1. **New migration** — anon RLS policy on `dimensions`
2. **`src/hooks/useDataStudioRawRows.ts`** — caching, retry, dimMap guard
3. **`src/pages/SlideViewPage.tsx`** — always fetch report_ids from DB on shared mount

