# Filter Dimensions Per Report Tab - Analysis and Plan

Date: 2026-03-20
Scope: Data Studio channel tabs (`metasearch`, `sem`, `social`) and "Filter dimensions" modal.

## Findings

### 1) Current per-tab dimension rules are channel-scoped and consistent

`SlideViewPage` defines the canonical channel dimension allowlist:

- `metasearch`: `Hotel`, `Channel`, `Device`, `Link Type`, `Market`
- `sem`: `Account`, `Campaign`, `Ad Group`
- `social`: `Account`, `Campaign`, `Ad Group`

These names are used to constrain both breakdown and filter configs.

### 2) Filter modal options and table options come from different state paths

The `DimensionSettingsModal` receives:

- `filterDimensions` from `dimensions[channel]`
- `breakdownDimensions` from `breakdownDimensions[channel]`

But these two lists are loaded differently:

- `dimensions` is populated by `loadDimensionsForChannel`, which currently runs only in the Edit Source flow (`isEditSourceOpen` + modal steps 2-5).
- `breakdownDimensions` is populated by `loadBreakdownDimensionsForChannel`, which also runs on page load / channel-tab switches.

Impact:

- The filter settings modal can show "No dimensions available for this channel" even when breakdown table dimensions are available and working.

### 3) Breakdown table already uses a more resilient dimension strategy

`UnifiedBreakdownTable` logic is robust because it:

- accepts dimension ID or name hints and resolves them at runtime,
- reads values from `rawDataRows` keyed by dimension IDs,
- falls back to `dimensionMap` name matching when needed,
- has fallback behavior for missing IDs in configs.

This keeps table behavior stable across account/global ID differences.

### 4) Filter value loading already includes ID mismatch handling

`loadFilterDimensionValues` already resolves mismatches where a configured filter ID is not present in raw row keys by:

- checking channel `dimensionMap`,
- resolving by dimension name,
- and falling back to DB lookup by dimension ID -> name when required.

So the weak point is mainly the modal option source (`dimensions`) rather than value extraction.

## Root Cause

The filter settings modal depends on `dimensions[channel]`, but that list is not guaranteed to be loaded in the channel-tab experience. It is tightly coupled to Edit Source modal lifecycle instead of the Data Studio tab lifecycle.

## Plan

1. Unify filter option source with the table path:
   - Use the same dimension source used by the channel breakdown table (`breakdownDimensions`-based channel-scoped list) for `DimensionSettingsModal` filter options.

2. Keep channel constraints in one place:
   - Continue to apply `CHANNEL_DIMENSION_NAMES` filtering at the source boundary.
   - Avoid duplicate filtering logic in multiple render paths.

3. Add fallback merge for saved filter IDs (parallel to breakdown):
   - If `filterConfigs[channel].filterDimensionIds` includes IDs not present in loaded option lists, fetch those IDs from `dimensions` and merge valid channel names.
   - This prevents empty modal state when older configs contain mismatched or stale IDs.

4. Keep value extraction behavior as-is (already robust):
   - Retain `loadFilterDimensionValues` rawRows + `dimensionMap` ID/name resolution.
   - No new parallel filter-value logic.

5. Verify:
   - Open each channel tab and open "Filter dimensions".
   - Confirm options appear for all three channels.
   - Confirm selected IDs persist and are re-opened correctly.
   - Confirm applying filter settings still updates `slide_reports.configuration.filterConfigs`.
   - Run `npm run lint` and `npm run build`.

## Reuse / Unification Notes

- Reuse existing `breakdownDimensions` loading and channel-scope filters.
- Reuse existing `loadFilterDimensionValues` for value extraction.
- Avoid introducing new dimension loaders or duplicate state trees.
