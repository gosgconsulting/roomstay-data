<!-- 5e4a7502-1f04-41c1-b70c-30c81bf91cc9 b85aea07-9877-41c1-a064-79f7c5db4577 -->
# Fix Report Filter State Management Issue

## Problem Analysis

The Metasearch report is showing filters from the SEM report ("Aqua Resort") instead of its own proper filters. This indicates a filter state management issue where:

1. **Filter State Persistence**: Filters from one report are persisting when switching to another report
2. **Incorrect Filter Loading**: The FiltersBar is not properly loading the correct dimensions for the current report
3. **Cache Issues**: Stale filter data might be cached and not refreshing when switching reports

## Root Cause Analysis

Based on the issue description:

1. **Cross-Report Filter Contamination**: SEM report filters ("Aqua Resort") appearing in Metasearch report
2. **Missing Metasearch Filters**: Expected filters (Hotel, Cluster with Brady/Sojourn) not showing
3. **Filter State Not Resetting**: When switching between reports, filter state isn't being properly cleared and reloaded

## Implementation Plan

### 1. Fix Filter State Reset on Report Change

- Ensure FiltersBar properly resets when reportId changes
- Clear previous filter state before loading new report filters
- Reset activeDimensions and selectedFilters appropriately

### 2. Fix Filter Loading Logic

- Verify FiltersBar loads correct dimensions for each specific report
- Ensure report_views.filter_dimensions are properly scoped to each report
- Check that dimension loading respects report-specific settings

### 3. Fix Cache Management

- Ensure filter-related caches are properly invalidated on report change
- Verify useVlookupMappings loads correct mappings for current report
- Clear stale dimension values when switching reports

### 4. Verify Database State

- Check report_views table for correct filter_dimensions per report
- Ensure Metasearch report has proper filter configuration
- Verify SEM and Metasearch reports have distinct filter settings

## Key Files to Investigate and Fix

- `src/components/FiltersBar.tsx` - Main filter state management
- `src/pages/ReportDashboard.tsx` - Report switching logic
- Database: `report_views` table - Filter configuration per report
- `src/hooks/useVlookupMappings.ts` - Vlookup mappings per report

### To-dos

- [x] Debug the current vlookup save process to identify specific failure points
- [x] Fix FiltersBar dimension loading to include account-scoped vlookup dimensions
- [x] Add proper cache invalidation after vlookup creation in VlookupModal
- [x] Verify and fix useVlookupMappings hook query logic and scope handling
- [x] Test complete flow: create cluster → appears in filters → filters data correctly