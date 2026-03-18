# Refresh workflow audit: SEM, Social, Metasearch

## Purpose

Single reference for the end-to-end refresh flow for all three channels (metasearch, sem, social), and where the gap was that caused metasearch to show 0 cost after sync.

---

## Shared workflow (all channels)

1. **UI**  
   User clicks "Refresh Data" → `RefreshDataModal` opens → user picks "Last 2 Months" or "Full Refresh" → "Start Refresh" → `handleStartRefresh(mode)` sets `activeRefreshMode` and `refreshPending`.

2. **run-refresh-workflow** (edge function)  
   - Input: `accountId`, `slideReportId`, `clearFirst: true`, `refreshMode: 'full' | 'recent'`.
   - Resolves `reportIds` from `slide_reports.report_ids` (e.g. `{ metasearch: id1, sem: id2, social: id3 }` → `[id1, id2, id3]`).
   - **Step: Clear**  
     If `clearFirst`: `DELETE FROM dimension_data WHERE report_id IN (reportIds)`. Same for all channels.
   - **Step: Resync**  
     Lists `data_sources` where `report_id IN reportIds` (one or more per channel). For each data source calls `resync-data-source` with `refreshMode`. No channel-specific logic.

3. **resync-data-source** (edge function, per data source)  
   - Loads `data_sources` row (includes `report_id`, `account_id`, `column_mappings`).
   - **Full mode:**  
     `deleteExistingData(supabase, dataSource.id)` (by `data_source_id`), then `deleteCustomDimensions(supabase, dataSource.id)`.
   - Fetches sheet/CSV, then `buildDimensionMappingWithAutoDetection` → `transformDataRows` → `insertDataInBatches`.
   - Dimension resolution: `resolveDimensionNameToId(..., accountId, reportId, userId)` (account → custom → global).  
   - **Gap (fixed):** If `column_mappings` still had a `dimensionId` pointing at a dimension that was just deleted (e.g. custom "Cost"), the lookup returned no name, so the Cost column was not re-mapped and no cost was written → **metasearch 0 cost**. Fix: when dimension-by-ID lookup fails, resolve by column header name so Cost/Revenue etc. map to account-scoped dimensions.

4. **Frontend read**  
   `useDataStudioRawRows` → per channel: `report_id` from `slide_reports.report_ids[channel]` → fetch `dimension_data` for that `report_id` → build `dimensionMap` (id → name) from row keys → `effectivePivotData.channels[channel]` = `{ rawDataRows, dimensionMap }`.  
   `useFilteredSlideData` → `aggregateRowsToMetrics(rows, dimensionMap)` for each channel.  
   If a channel has **0 rows** (e.g. resync failed or no data written), that channel is missing from `dataStudioRawRows`, so `channelTotals[channel]` falls back to `EMPTY_METRICS` → **0 cost**.

---

## Per-channel flow (no structural difference)

| Step                    | Metasearch | SEM | Social |
|-------------------------|------------|-----|--------|
| report_id               | `report_ids.metasearch` | `report_ids.sem` | `report_ids.social` |
| clearFirst              | Same delete by report_id | Same | Same |
| data_sources listed     | All where report_id IN (id1,id2,id3) | Same | Same |
| resync-data-source      | One call per data source | Same | Same |
| dimension resolution    | account → custom → global | Same | Same |
| dimension_data key      | (report_id, data_source_id, row_number) | Same | Same |
| Frontend read           | By report_id → rawRows, dimensionMap | Same | Same |

There is no separate code path for metasearch. The only difference is **data**: one data source per channel, and **column_mappings** / **dimensions** per report. The bug was that after `deleteCustomDimensions`, metasearch’s stored mapping still referenced the deleted dimension ID, so the Cost column was dropped during buildDimensionMapping; the fallback (resolve by column header) fixes that for all channels.

---

## Fixes applied

1. **resync-data-source (dimensions.ts)**  
   - If `getDimensionName` returns null (e.g. dimension was deleted) but mapping has a `dimensionId`, set `dimensionName = mapping.column` and resolve by name.  
   - If we still have no `dimensionId`, try `resolveDimensionNameToId(supabase, mapping.column.trim(), ...)` so columns like "Cost" map to account Cost.  
   - Ensures Cost/Revenue etc. are always written with account-scoped dimension IDs after a full resync.

2. **RefreshDataModal / SlideViewPage**  
   - Explicit **Step 1: Clearing and resetting data** before "Fetching from sources".  
   - `clearFirst: true` was already set; the UI now shows the clear step.

3. **Full refresh**  
   - User selects "Full Refresh" → `activeRefreshMode = 'full'` → `runRefreshWorkflow(..., refreshMode: 'full')`.  
   - Workflow clears all `dimension_data` for the report(s), then resyncs every data source; `resync-data-source` with `refreshMode: 'full'` fetches all rows from the sheet (no date filter). So full refresh replaces all data from all sources.

---

## Verification

- Full refresh: choose "Full Refresh" → Start → Step 1 (Clear) and Step 2 (Fetch) run → all three channels get new data.  
- Metasearch cost: after full refresh, metasearch tab shows non-zero cost when the source sheet has cost data; dimension fallback keeps Cost column mapped to account Cost dimension.
