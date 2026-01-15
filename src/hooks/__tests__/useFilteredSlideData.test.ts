/**
 * Tests for useFilteredSlideData hook
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useFilteredSlideData } from '../useFilteredSlideData';
import type { SlideReportPivotData } from '@/types/slideReports';
import type { RawDataRow } from '@/types/slideView';

// Mock data helpers
function createMockPivotData(): SlideReportPivotData {
  return {
    overview: {
      current: {
        impressions: 1000,
        clicks: 100,
        cost: 500,
        revenue: 2000,
        bookings: 10,
        ctr: 10,
        conversionRate: 10,
        cpc: 5,
        roas: 4,
        costOfSale: 25,
      },
      monthly: {},
      yearly: {},
    },
    channels: {
      metasearch: {
        current: {
          impressions: 500,
          clicks: 50,
          cost: 250,
          revenue: 1000,
          bookings: 5,
          ctr: 10,
          conversionRate: 10,
          cpc: 5,
          roas: 4,
          costOfSale: 25,
        },
        monthly: {
          '2025-01': {
            impressions: 500,
            clicks: 50,
            cost: 250,
            revenue: 1000,
            bookings: 5,
            ctr: 10,
            conversionRate: 10,
            cpc: 5,
            roas: 4,
            costOfSale: 25,
          },
        },
        yearly: {
          '2025': {
            impressions: 500,
            clicks: 50,
            cost: 250,
            revenue: 1000,
            bookings: 5,
            ctr: 10,
            conversionRate: 10,
            cpc: 5,
            roas: 4,
            costOfSale: 25,
          },
        },
        breakdowns: {},
        rawDataRows: [
          {
            dimension_values: {
              hotel: 'Hotel A',
              Date: '2025-01-15',
              Impressions: 100,
              Clicks: 10,
              Cost: 50,
              Revenue: 200,
              Bookings: 1,
            },
          },
          {
            dimension_values: {
              hotel: 'Hotel B',
              Date: '2025-01-20',
              Impressions: 200,
              Clicks: 20,
              Cost: 100,
              Revenue: 400,
              Bookings: 2,
            },
          },
        ] as RawDataRow[],
        dimensionMap: {
          'dim-hotel': 'hotel',
          'dim-date': 'Date',
          'dim-impressions': 'Impressions',
          'dim-clicks': 'Clicks',
          'dim-cost': 'Cost',
          'dim-revenue': 'Revenue',
          'dim-bookings': 'Bookings',
        },
      },
      sem: {
        current: {
          impressions: 300,
          clicks: 30,
          cost: 150,
          revenue: 600,
          bookings: 3,
          ctr: 10,
          conversionRate: 10,
          cpc: 5,
          roas: 4,
          costOfSale: 25,
        },
        monthly: {},
        yearly: {},
        breakdowns: {},
        rawDataRows: [],
        dimensionMap: {},
      },
      social: {
        current: {
          impressions: 200,
          clicks: 20,
          cost: 100,
          revenue: 400,
          bookings: 2,
          ctr: 10,
          conversionRate: 10,
          cpc: 5,
          roas: 4,
          costOfSale: 25,
        },
        monthly: {},
        yearly: {},
        breakdowns: {},
        rawDataRows: [],
        dimensionMap: {},
      },
    },
    budget: {
      monthly: [],
      totals: {
        totalBudget: 0,
        totalActual: 0,
        variance: 0,
      },
    },
  };
}

describe('useFilteredSlideData', () => {
  const defaultParams = {
    pivotData: createMockPivotData(),
    filterValues: {
      metasearch: {},
      sem: {},
      social: {},
    },
    filterDimensionValues: {
      metasearch: {},
      sem: {},
      social: {},
    },
    selectedYear: 'all',
    selectedMonth: 'all',
    selectedTab: 'overview',
    slideType: 'default',
    dynamicChannelTotals: undefined,
  };

  it('should return correct data structure', () => {
    const { result } = renderHook(() => useFilteredSlideData(defaultParams));

    expect(result.current).toHaveProperty('hasFilters');
    expect(result.current).toHaveProperty('channelsWithFilters');
    expect(result.current).toHaveProperty('channelTotals');
    expect(result.current).toHaveProperty('monthlyData');
    expect(result.current).toHaveProperty('filteredRawRows');
    expect(result.current).toHaveProperty('dateRange');
    expect(result.current).toHaveProperty('getFilteredRowsForChannel');
    expect(result.current).toHaveProperty('getChannelTotals');
  });

  it('should return hasFilters as false when no filters are applied', () => {
    const { result } = renderHook(() => useFilteredSlideData(defaultParams));

    expect(result.current.hasFilters).toBe(false);
    expect(result.current.channelsWithFilters.size).toBe(0);
  });

  it('should return hasFilters as true when filters are applied', () => {
    const params = {
      ...defaultParams,
      filterValues: {
        metasearch: { hotel: ['Hotel A'] },
        sem: {},
        social: {},
      },
      filterDimensionValues: {
        metasearch: { hotel: ['Hotel A', 'Hotel B'] },
        sem: {},
        social: {},
      },
    };

    const { result } = renderHook(() => useFilteredSlideData(params));

    expect(result.current.hasFilters).toBe(true);
    expect(result.current.channelsWithFilters.has('metasearch')).toBe(true);
  });

  it('should use pre-computed data when no filters are applied (fast path)', () => {
    const { result } = renderHook(() => useFilteredSlideData(defaultParams));

    // Should use pre-computed current totals
    expect(result.current.channelTotals.metasearch.impressions).toBe(500);
    expect(result.current.channelTotals.metasearch.clicks).toBe(50);
  });

  it('should filter raw rows when filters are applied', () => {
    const params = {
      ...defaultParams,
      filterValues: {
        metasearch: { hotel: ['Hotel A'] },
        sem: {},
        social: {},
      },
      filterDimensionValues: {
        metasearch: { hotel: ['Hotel A', 'Hotel B'] },
        sem: {},
        social: {},
      },
    };

    const { result } = renderHook(() => useFilteredSlideData(params));

    const filteredRows = result.current.getFilteredRowsForChannel('metasearch');
    expect(filteredRows.length).toBe(1);
    expect(filteredRows[0].dimension_values.hotel).toBe('Hotel A');
  });

  it('should return empty array for channel with no raw rows', () => {
    const { result } = renderHook(() => useFilteredSlideData(defaultParams));

    const filteredRows = result.current.getFilteredRowsForChannel('sem');
    expect(filteredRows).toEqual([]);
  });

  it('should return correct channel totals using helper method', () => {
    const { result } = renderHook(() => useFilteredSlideData(defaultParams));

    const metasearchTotals = result.current.getChannelTotals('metasearch');
    expect(metasearchTotals.impressions).toBe(500);
    expect(metasearchTotals.clicks).toBe(50);
  });

  it('should handle null pivotData gracefully', () => {
    const params = {
      ...defaultParams,
      pivotData: null,
    };

    const { result } = renderHook(() => useFilteredSlideData(params));

    expect(result.current.channelTotals.metasearch.impressions).toBe(0);
    expect(result.current.channelTotals.metasearch.clicks).toBe(0);
    expect(result.current.monthlyData).toEqual([]);
  });

  it('should build date range correctly for specific month', () => {
    const params = {
      ...defaultParams,
      selectedYear: '2025',
      selectedMonth: 'January',
    };

    const { result } = renderHook(() => useFilteredSlideData(params));

    expect(result.current.dateRange).toBeDefined();
    expect(result.current.dateRange?.start.getFullYear()).toBe(2025);
    expect(result.current.dateRange?.start.getMonth()).toBe(0); // January is 0
  });

  it('should build date range correctly for specific year', () => {
    const params = {
      ...defaultParams,
      selectedYear: '2025',
      selectedMonth: 'all',
    };

    const { result } = renderHook(() => useFilteredSlideData(params));

    expect(result.current.dateRange).toBeDefined();
    expect(result.current.dateRange?.start.getFullYear()).toBe(2025);
    expect(result.current.dateRange?.start.getMonth()).toBe(0);
    expect(result.current.dateRange?.end.getMonth()).toBe(11); // December
  });

  it('should return undefined dateRange when both year and month are "all"', () => {
    const { result } = renderHook(() => useFilteredSlideData(defaultParams));

    expect(result.current.dateRange).toBeUndefined();
  });

  it('should aggregate monthly data correctly from filtered rows', () => {
    const params = {
      ...defaultParams,
      filterValues: {
        metasearch: { hotel: ['Hotel A'] },
        sem: {},
        social: {},
      },
      filterDimensionValues: {
        metasearch: { hotel: ['Hotel A', 'Hotel B'] },
        sem: {},
        social: {},
      },
    };

    const { result } = renderHook(() => useFilteredSlideData(params));

    // Should have monthly data from filtered rows
    const januaryData = result.current.monthlyData.find(
      (m) => m.year === 2025 && m.month === 'January'
    );
    expect(januaryData).toBeDefined();
    expect(januaryData?.metasearch).toBeGreaterThan(0);
  });

  it('should use dynamicChannelTotals as fallback for master-report', () => {
    const params = {
      ...defaultParams,
      pivotData: null,
      slideType: 'master-report',
      dynamicChannelTotals: {
        metasearch: {
          impressions: 1000,
          clicks: 100,
          cost: 500,
          revenue: 2000,
          bookings: 10,
        },
        sem: {
          impressions: 500,
          clicks: 50,
          cost: 250,
          revenue: 1000,
          bookings: 5,
        },
        social: {
          impressions: 300,
          clicks: 30,
          cost: 150,
          revenue: 600,
          bookings: 3,
        },
      },
    };

    const { result } = renderHook(() => useFilteredSlideData(params));

    expect(result.current.channelTotals.metasearch.impressions).toBe(1000);
    expect(result.current.channelTotals.sem.impressions).toBe(500);
  });
});
