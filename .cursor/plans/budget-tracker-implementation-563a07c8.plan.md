<!-- 563a07c8-9d07-455f-98e3-5ad52a96c656 85de190f-7bc5-4ca8-a6a8-7d076f16711d -->
# Filter Dimensions by Data Availability

## Problem

When navigating between reports (Meta, SEM, Social), users see dimensions in filters, graphs, and performance table that don't have data for the current report. For example, "Conversion" dimension appears as an option even when it's not mapped/has no data for the current report.

## Root Cause

The dimension loading logic loads ALL available dimensions (account-scoped, global, custom) and only uses `dimensionHasData` for UI indicators, but doesn't filter out dimensions that have no data for the specific report.

## Solution Strategy

Modify the dimension loading logic to filter dimensions based on actual data availability for the current report, ensuring only dimensions with data are shown in:

- FiltersBar dimension options
- KPI Charts metric selectors  
- PerformanceTable dimension selectors
- Budget Tracker dimension selectors

## Implementation Plan

### 1. Update Core Dimension Loading Logic

**Files**: `src/hooks/performanceTable/usePerformanceTableDimensions.ts`, `src/hooks/useDimensionData.ts`

- Modify dimension loading to filter by data availability after loading
- Use existing `checkDimensionsHaveData` function to determine which dimensions have data
- Only return dimensions that have actual data for the current report
- Keep fallback behavior for error cases

### 2. Update FiltersBar Dimension Loading

**File**: `src/components/FiltersBar.tsx`

- Modify `loadDimensions()` to filter by data availability
- Ensure only dimensions with data appear in filter options
- Update `loadAllDimensions()` for settings modal to also respect data availability

### 3. Update Budget Tracker Dimension Loading

**Files**: `src/hooks/budgetTracker/useBudgetTrackerData.ts`, `src/hooks/budgetTracker/useBudgetTrackerFilters.ts`

- Ensure Budget Tracker also respects data availability filtering
- Update dimension loading to use the same filtering logic

### 4. Add Caching for Performance

**File**: `src/lib/dimensionUtils.ts`

- Add caching to `checkDimensionsHaveData` to avoid repeated database calls
- Cache results per report to improve performance when switching between components

### 5. Update Dimension Loader Utility

**File**: `src/lib/dimensionLoader.ts`

- Add optional parameter to filter by data availability
- Modify `loadDimensionsForUser` to optionally check data availability
- Ensure consistent behavior across all dimension loading

### 6. Handle Edge Cases

- Ensure date dimensions are always included (required for grouping)
- Handle cases where no dimensions have data gracefully
- Maintain backward compatibility for components that need all dimensions

## Key Benefits

- ✅ Users only see relevant dimensions for each report
- ✅ Cleaner, more intuitive UI when switching between reports  
- ✅ Prevents confusion from seeing unmapped dimensions
- ✅ Maintains existing functionality while improving UX
- ✅ Performance optimization through caching

### To-dos

- [ ] Create YearRangeFilter component for year-only date selection
- [ ] Create budget tracker data and filter management hooks
- [ ] Create BudgetTrackerTable component with Month/Year tabs
- [ ] Add BudgetTrackerTable to Index.tsx and ReportDashboard.tsx
- [ ] Test complete integration and ensure proper data display
- [ ] Add caching to checkDimensionsHaveData for performance optimization
- [ ] Filter dimensions by data availability in usePerformanceTableDimensions
- [ ] Filter dimensions by data availability in FiltersBar component
- [ ] Add data availability filtering option to loadDimensionsForUser
- [ ] Ensure Budget Tracker respects data availability filtering
- [ ] Test dimension filtering when navigating between Meta, SEM, Social reports