

## Plan: Fix Build Errors and Currency Formatting

There are two categories of issues to fix:

### 1. Frontend Build Errors (SlideViewPage.tsx)

**Error 1: Missing `BreakdownTableSection` import**
- `BreakdownTableSection` is used at line 3516 but never imported.
- Add import from `@/components/slides/BreakdownTableSection`.

**Error 2: `ComparisonBanner` missing props (line 3604)**
- Currently: `<ComparisonBanner comparisonType={comparisonType} />`
- Required props: `selectedTab`, `selectedYear`, `selectedMonth`
- Fix: pass all four required props.

**Error 3: `EditSourceModal` prop mismatch (line 3735)**
- The `EditSourceModal` interface uses `isOpen` not `open`, and `handleModalClose` not `onOpenChange`.
- Also passes extra props not in its interface: `accountReportIds`, `filteredValues`, `handleNext` (should be non-async).
- Fix: rename `open` to `isOpen`, `onOpenChange` to `handleModalClose`.

**Error 4: `SlideDataBrowser` extra prop `slideReport` (line 3792)**
- `SlideDataBrowserProps` does not have `slideReport` — it has `configuration`, `lastRefreshedAt`, `reportIds`.
- Fix: remove `slideReport` prop, pass correct props from slideReport object.

**Error 5: `ShareModal` extra prop `filterValues` (line 3805)**
- `ShareModalProps` uses `currentFilterValues` not `filterValues`, and requires `reportId` and `reportName`.
- Fix: rename `filterValues` to `currentFilterValues`, add `reportId` and `reportName`.

### 2. Edge Function Type Errors (refresh-slide-report-channel)

**Root cause:** All functions use `supabase: ReturnType<typeof createClient>` as param type, but the `supabase` client created in `index.ts` has a different generic signature (`SupabaseClient<any, "public", "public", ...>` vs the inferred `never` types).

**Fix:** Change all function signatures to use `supabase: any` instead of `ReturnType<typeof createClient>`. This is the simplest approach and matches the pattern already used in other edge functions. The same fix applies to:
- `pivotComputation.ts`: ~6 function signatures + all `.from()` query results need `as any` or explicit interface casts for `reportData`, `dim`, `row`, etc.
- `accountReports.ts`: 2 function signatures
- `index.ts`: 3 call sites (these will resolve once the function signatures change)

Also fix the return type of `computeChannelPivotDataForMonth` — move `rawDataRows` and `dimensionMap` inside `channelDataSlice` or update the return type to include them.

### 3. Currency Display: Remove "A" prefix from "$"

**In `formatNumber` (slideViewHelpers.ts):**
- Line 381: Change `return \`A$\${numberPart}\`` to `return \`$\${numberPart}\``
- This removes the "A$" prefix when displaying AUD currency, showing just "$" instead.

**In `KPICardsSection.tsx`:**
- The `formattedValue` logic calls `formatNumber` which will be fixed above.

### Technical Details

Files to modify:
1. `src/pages/SlideViewPage.tsx` — fix 5 prop mismatches + add missing import
2. `src/lib/slideViewHelpers.ts` — remove "A" from AUD currency prefix (line 381)
3. `supabase/functions/refresh-slide-report-channel/pivotComputation.ts` — change all `ReturnType<typeof createClient>` to `any`, add type assertions on query results
4. `supabase/functions/refresh-slide-report-channel/index.ts` — will auto-resolve after pivotComputation fix
5. `supabase/functions/refresh-slide-report/accountReports.ts` — change param type to `any`
6. `supabase/functions/refresh-slide-report/index.ts` — will auto-resolve after accountReports fix

