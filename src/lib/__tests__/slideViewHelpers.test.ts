/**
 * Tests for centralized filter detection and row filtering in slideViewHelpers
 */

import { describe, it, expect } from 'vitest';
import {
  hasActiveFiltersForChannel,
  hasAnyActiveFilters,
  getChannelsWithFilters,
  filterRawDataRows,
  getRowKeysForSameNamedDimension,
  computePerformanceModelCommissionSplit,
} from '../slideViewHelpers';

describe('hasActiveFiltersForChannel', () => {
  it('should return false when no filter values are provided', () => {
    const result = hasActiveFiltersForChannel({});
    expect(result).toBe(false);
  });

  it('should return true when empty array is selected (None mode/active filter)', () => {
    const filterValues = { hotel: [] };
    const result = hasActiveFiltersForChannel(filterValues);
    expect(result).toBe(true);
  });

  it('should return true when subset of values is selected (active filter)', () => {
    const filterValues = { hotel: ['Hotel A'] };
    const result = hasActiveFiltersForChannel(filterValues);
    expect(result).toBe(true);
  });

  it('should return false when filter value is undefined', () => {
    const filterValues = { hotel: undefined as any };
    const result = hasActiveFiltersForChannel(filterValues);
    expect(result).toBe(false);
  });

  it('should return false when filter value is null', () => {
    const filterValues = { hotel: null as any };
    const result = hasActiveFiltersForChannel(filterValues);
    expect(result).toBe(false);
  });

  it('should handle multiple dimensions correctly', () => {
    const filterValues = {
      hotel: ['Hotel A'],
      campaign: ['Campaign B'],
    };
    const result = hasActiveFiltersForChannel(filterValues);
    expect(result).toBe(true);
  });
});

describe('hasAnyActiveFilters', () => {
  it('should return false when no filters across all channels', () => {
    const filterValues = {
      metasearch: {},
      sem: {},
      social: {},
    };
    const result = hasAnyActiveFilters(filterValues);
    expect(result).toBe(false);
  });

  it('should return true when one channel has active filters', () => {
    const filterValues = {
      metasearch: { hotel: ['Hotel A'] },
      sem: {},
      social: {},
    };
    const result = hasAnyActiveFilters(filterValues);
    expect(result).toBe(true);
  });

  it('should return true when multiple channels have active filters', () => {
    const filterValues = {
      metasearch: { hotel: ['Hotel A'] },
      sem: { campaign: ['Campaign B'] },
      social: {},
    };
    const result = hasAnyActiveFilters(filterValues);
    expect(result).toBe(true);
  });

  it('should return true when one channel has empty array filter (None mode/active filter)', () => {
    const filterValues = {
      metasearch: { hotel: [] },
      sem: {},
      social: {},
    };
    const result = hasAnyActiveFilters(filterValues);
    expect(result).toBe(true);
  });
});

describe('getChannelsWithFilters', () => {
  it('should return empty set when no channels have filters', () => {
    const filterValues = {
      metasearch: {},
      sem: {},
      social: {},
    };
    const result = getChannelsWithFilters(filterValues);
    expect(result).toEqual(new Set());
  });

  it('should return set with one channel when only one has filters', () => {
    const filterValues = {
      metasearch: { hotel: ['Hotel A'] },
      sem: {},
      social: {},
    };
    const result = getChannelsWithFilters(filterValues);
    expect(result).toEqual(new Set(['metasearch']));
  });

  it('should return set with multiple channels when multiple have filters', () => {
    const filterValues = {
      metasearch: { hotel: ['Hotel A'] },
      sem: { campaign: ['Campaign B'] },
      social: {},
    };
    const result = getChannelsWithFilters(filterValues);
    expect(result).toEqual(new Set(['metasearch', 'sem']));
  });

  it('should include channels with empty array filters (None mode/active filter)', () => {
    const filterValues = {
      metasearch: { hotel: [] },
      sem: {},
      social: {},
    };
    const result = getChannelsWithFilters(filterValues);
    expect(result).toEqual(new Set(['metasearch']));
  });
});

describe('getRowKeysForSameNamedDimension', () => {
  it('returns every UUID that shares the same display name', () => {
    const map = {
      'uuid-a': 'Hotel',
      'uuid-b': 'Hotel',
      'uuid-c': 'Channel',
    };
    const keys = getRowKeysForSameNamedDimension('uuid-a', map);
    expect(keys.sort()).toEqual(['uuid-a', 'uuid-b'].sort());
  });
});

describe('filterRawDataRows', () => {
  const makeRow = (vals: Record<string, unknown>) => ({ dimension_values: vals });

  it('should filter by direct dimension ID key', () => {
    const rows = [
      makeRow({ 'dim-hotel': 'Brady', 'dim-cost': 100 }),
      makeRow({ 'dim-hotel': 'Marriott', 'dim-cost': 200 }),
    ];
    const result = filterRawDataRows(rows as any, { 'dim-hotel': ['Brady'] });
    expect(result).toHaveLength(1);
    expect((result[0] as any).dimension_values['dim-hotel']).toBe('Brady');
  });

  it('should resolve global/configured IDs via dimensionIdToName map', () => {
    const rows = [
      makeRow({ 'report-dim-hotel': 'Brady', 'report-dim-cost': 100 }),
      makeRow({ 'report-dim-hotel': 'Marriott', 'report-dim-cost': 200 }),
    ];
    const dimensionIdToName: Record<string, string> = {
      'report-dim-hotel': 'Hotel',
      'global-dim-hotel': 'Hotel',
    };
    const result = filterRawDataRows(
      rows as any,
      { 'global-dim-hotel': ['Brady'] },
      undefined,
      dimensionIdToName
    );
    expect(result).toHaveLength(1);
    expect((result[0] as any).dimension_values['report-dim-hotel']).toBe('Brady');
  });

  it('should apply date range filter', () => {
    const rows = [
      makeRow({ 'dim-hotel': 'Brady', Date: '2025-01-15' }),
      makeRow({ 'dim-hotel': 'Brady', Date: '2025-03-15' }),
    ];
    const dateRange = { start: new Date(2025, 0, 1), end: new Date(2025, 1, 28, 23, 59, 59) };
    const result = filterRawDataRows(rows as any, {}, dateRange);
    expect(result).toHaveLength(1);
    expect((result[0] as any).dimension_values.Date).toBe('2025-01-15');
  });

  it('should combine dimension filter + date range', () => {
    const rows = [
      makeRow({ 'dim-hotel': 'Brady', Date: '2025-01-15', 'dim-cost': 100 }),
      makeRow({ 'dim-hotel': 'Marriott', Date: '2025-01-20', 'dim-cost': 200 }),
      makeRow({ 'dim-hotel': 'Brady', Date: '2025-03-15', 'dim-cost': 300 }),
    ];
    const dateRange = { start: new Date(2025, 0, 1), end: new Date(2025, 1, 28, 23, 59, 59) };
    const result = filterRawDataRows(
      rows as any,
      { 'dim-hotel': ['Brady'] },
      dateRange
    );
    expect(result).toHaveLength(1);
    expect((result[0] as any).dimension_values['dim-cost']).toBe(100);
  });

  it('should pass rows through when filter values are empty', () => {
    const rows = [
      makeRow({ 'dim-hotel': 'Brady' }),
      makeRow({ 'dim-hotel': 'Marriott' }),
    ];
    const result = filterRawDataRows(rows as any, {});
    expect(result).toHaveLength(2);
  });

  it('should filter out all rows when filter has empty array (None mode)', () => {
    const rows = [
      makeRow({ 'dim-hotel': 'Brady' }),
      makeRow({ 'dim-hotel': 'Marriott' }),
    ];
    const result = filterRawDataRows(rows as any, { 'dim-hotel': [] });
    expect(result).toHaveLength(0);
  });

  it('should handle multiple dimension filters (AND logic)', () => {
    const rows = [
      makeRow({ 'dim-hotel': 'Brady', 'dim-channel': 'Google' }),
      makeRow({ 'dim-hotel': 'Brady', 'dim-channel': 'Bing' }),
      makeRow({ 'dim-hotel': 'Marriott', 'dim-channel': 'Google' }),
    ];
    const result = filterRawDataRows(
      rows as any,
      { 'dim-hotel': ['Brady'], 'dim-channel': ['Google'] }
    );
    expect(result).toHaveLength(1);
    expect((result[0] as any).dimension_values['dim-hotel']).toBe('Brady');
    expect((result[0] as any).dimension_values['dim-channel']).toBe('Google');
  });

  it('should match Hotel across alternate dimension UUIDs (merged metasearch sources)', () => {
    const rows = [
      makeRow({ 'dim-hotel-a': 'Brady Hotels', 'dim-date': '2025-01-01' }),
      makeRow({ 'dim-hotel-b': 'Daydream Island Resort and Living Reef', 'dim-date': '2025-01-02' }),
    ];
    const dimensionIdToName: Record<string, string> = {
      'dim-hotel-a': 'Hotel',
      'dim-hotel-b': 'Hotel',
      'cfg-hotel': 'Hotel',
    };
    const result = filterRawDataRows(
      rows as any,
      { 'cfg-hotel': ['Daydream Island Resort and Living Reef'] },
      undefined,
      dimensionIdToName
    );
    expect(result).toHaveLength(1);
    expect((result[0] as any).dimension_values['dim-hotel-b']).toBe(
      'Daydream Island Resort and Living Reef'
    );
  });
});

describe('computePerformanceModelCommissionSplit', () => {
  const dimMap: Record<string, string> = {
    'lt-id': 'Link Type',
    'rev-id': 'Revenue',
  };

  it('metasearch: Paid link 15%, Free link 3% of row revenue', () => {
    const rows = [
      { dimension_values: { 'lt-id': 'Paid', 'rev-id': 1000 } },
      { dimension_values: { 'lt-id': 'Free Link', 'rev-id': 2000 } },
    ];
    const r = computePerformanceModelCommissionSplit('metasearch', rows, dimMap);
    expect(r.commissionsPaid).toBeCloseTo(150);
    expect(r.commissionsFree).toBeCloseTo(60);
  });

  it('metasearch: unrecognized link type (no free/organic/google-uni signals) defaults to 15%', () => {
    const rows = [{ dimension_values: { 'lt-id': 'Standard CPC', 'rev-id': 100 } }];
    const r = computePerformanceModelCommissionSplit('metasearch', rows, dimMap);
    expect(r.commissionsPaid).toBeCloseTo(15);
    expect(r.commissionsFree).toBe(0);
  });

  it('metasearch: organic label uses 3% free tier', () => {
    const rows = [{ dimension_values: { 'lt-id': 'Organic Search', 'rev-id': 2000 } }];
    const r = computePerformanceModelCommissionSplit('metasearch', rows, dimMap);
    expect(r.commissionsFree).toBeCloseTo(60);
    expect(r.commissionsPaid).toBe(0);
  });

  it('metasearch: Google Universal / Google Uni uses 3% free tier (no "free" in label)', () => {
    const rows = [
      { dimension_values: { 'lt-id': 'Google Universal', 'rev-id': 1000 } },
      { dimension_values: { 'lt-id': 'Google Uni Hotel', 'rev-id': 500 } },
    ];
    const r = computePerformanceModelCommissionSplit('metasearch', rows, dimMap);
    expect(r.commissionsFree).toBeCloseTo(45);
    expect(r.commissionsPaid).toBe(0);
  });

  it('sem/social: all revenue as commissions paid at 15%', () => {
    const rows = [{ dimension_values: { 'rev-id': 800 } }];
    expect(computePerformanceModelCommissionSplit('sem', rows, dimMap)).toEqual({
      commissionsPaid: 120,
      commissionsFree: 0,
    });
    expect(computePerformanceModelCommissionSplit('social', rows, dimMap)).toEqual({
      commissionsPaid: 120,
      commissionsFree: 0,
    });
  });
});
