import { describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useDataStudioFilters, type FilterConfigs } from '../useDataStudioFilters';

const INITIAL_FILTER_CONFIGS: FilterConfigs = {
  metasearch: { filterDimensionIds: [] },
  sem: { filterDimensionIds: [] },
  social: { filterDimensionIds: [] },
};

describe('useDataStudioFilters', () => {
  it('keeps customDateRange externally controlled even when the current value is undefined', () => {
    const setExternalCustomDateRange = vi.fn();
    const setSelectedYear = vi.fn();
    const setSelectedMonth = vi.fn();

    const { result } = renderHook(() =>
      useDataStudioFilters({
        effectivePivotData: null,
        initialFilterConfigs: INITIAL_FILTER_CONFIGS,
        onPersistFilterConfigs: vi.fn(),
        views: [],
        externalCustomDateRange: undefined,
        setExternalCustomDateRange,
        selectedYear: '2026',
        setSelectedYear,
        selectedMonth: 'March',
        setSelectedMonth,
      })
    );

    const range = {
      from: new Date(2026, 2, 1),
      to: new Date(2026, 2, 18),
    };

    act(() => {
      result.current.setCustomDateRange(range);
    });

    expect(setExternalCustomDateRange).toHaveBeenCalledWith(range);
    expect(setSelectedYear).toHaveBeenCalledWith('2026');
    expect(setSelectedMonth).toHaveBeenCalledWith('March');
  });
});
