/**
 * Tests for centralized filter detection functions in slideViewHelpers
 */

import { describe, it, expect } from 'vitest';
import {
  hasActiveFiltersForChannel,
  hasAnyActiveFilters,
  getChannelsWithFilters,
} from '../slideViewHelpers';

describe('hasActiveFiltersForChannel', () => {
  it('should return false when no filter values are provided', () => {
    const result = hasActiveFiltersForChannel({}, {});
    expect(result).toBe(false);
  });

  it('should return false when filter values object is empty', () => {
    const result = hasActiveFiltersForChannel({}, { hotel: ['Hotel A', 'Hotel B'] });
    expect(result).toBe(false);
  });

  it('should return true when empty array is selected (active filter that excludes everything)', () => {
    const filterValues = { hotel: [] };
    const availableValues = { hotel: ['Hotel A', 'Hotel B'] };
    const result = hasActiveFiltersForChannel(filterValues, availableValues);
    expect(result).toBe(true);
  });

  it('should return false when all available values are selected (no filter)', () => {
    const filterValues = { hotel: ['Hotel A', 'Hotel B'] };
    const availableValues = { hotel: ['Hotel A', 'Hotel B'] };
    const result = hasActiveFiltersForChannel(filterValues, availableValues);
    expect(result).toBe(false);
  });

  it('should return true when subset of values is selected (active filter)', () => {
    const filterValues = { hotel: ['Hotel A'] };
    const availableValues = { hotel: ['Hotel A', 'Hotel B', 'Hotel C'] };
    const result = hasActiveFiltersForChannel(filterValues, availableValues);
    expect(result).toBe(true);
  });

  it('should return false when filter value is undefined', () => {
    const filterValues = { hotel: undefined as any };
    const availableValues = { hotel: ['Hotel A', 'Hotel B'] };
    const result = hasActiveFiltersForChannel(filterValues, availableValues);
    expect(result).toBe(false);
  });

  it('should return false when filter value is null', () => {
    const filterValues = { hotel: null as any };
    const availableValues = { hotel: ['Hotel A', 'Hotel B'] };
    const result = hasActiveFiltersForChannel(filterValues, availableValues);
    expect(result).toBe(false);
  });

  it('should handle multiple dimensions correctly', () => {
    const filterValues = {
      hotel: ['Hotel A'],
      campaign: ['Campaign B'],
    };
    const availableValues = {
      hotel: ['Hotel A', 'Hotel B'],
      campaign: ['Campaign A', 'Campaign B', 'Campaign C'],
    };
    const result = hasActiveFiltersForChannel(filterValues, availableValues);
    expect(result).toBe(true);
  });

  it('should return false when all dimensions have all values selected', () => {
    const filterValues = {
      hotel: ['Hotel A', 'Hotel B'],
      campaign: ['Campaign A', 'Campaign B'],
    };
    const availableValues = {
      hotel: ['Hotel A', 'Hotel B'],
      campaign: ['Campaign A', 'Campaign B'],
    };
    const result = hasActiveFiltersForChannel(filterValues, availableValues);
    expect(result).toBe(false);
  });

  it('should handle case where available values are empty', () => {
    const filterValues = { hotel: ['Hotel A'] };
    const availableValues = { hotel: [] };
    const result = hasActiveFiltersForChannel(filterValues, availableValues);
    expect(result).toBe(true); // If we have selected values but no available, it's still a filter
  });
});

describe('hasAnyActiveFilters', () => {
  it('should return false when no filters across all channels', () => {
    const filterValues = {
      metasearch: {},
      sem: {},
      social: {},
    };
    const filterDimensionValues = {
      metasearch: {},
      sem: {},
      social: {},
    };
    const result = hasAnyActiveFilters(filterValues, filterDimensionValues);
    expect(result).toBe(false);
  });

  it('should return true when one channel has active filters', () => {
    const filterValues = {
      metasearch: { hotel: ['Hotel A'] },
      sem: {},
      social: {},
    };
    const filterDimensionValues = {
      metasearch: { hotel: ['Hotel A', 'Hotel B'] },
      sem: {},
      social: {},
    };
    const result = hasAnyActiveFilters(filterValues, filterDimensionValues);
    expect(result).toBe(true);
  });

  it('should return true when multiple channels have active filters', () => {
    const filterValues = {
      metasearch: { hotel: ['Hotel A'] },
      sem: { campaign: ['Campaign B'] },
      social: {},
    };
    const filterDimensionValues = {
      metasearch: { hotel: ['Hotel A', 'Hotel B'] },
      sem: { campaign: ['Campaign A', 'Campaign B'] },
      social: {},
    };
    const result = hasAnyActiveFilters(filterValues, filterDimensionValues);
    expect(result).toBe(true);
  });

  it('should return false when all channels have all values selected', () => {
    const filterValues = {
      metasearch: { hotel: ['Hotel A', 'Hotel B'] },
      sem: { campaign: ['Campaign A', 'Campaign B'] },
      social: {},
    };
    const filterDimensionValues = {
      metasearch: { hotel: ['Hotel A', 'Hotel B'] },
      sem: { campaign: ['Campaign A', 'Campaign B'] },
      social: {},
    };
    const result = hasAnyActiveFilters(filterValues, filterDimensionValues);
    expect(result).toBe(false);
  });

  it('should return true when one channel has empty array filter', () => {
    const filterValues = {
      metasearch: { hotel: [] },
      sem: {},
      social: {},
    };
    const filterDimensionValues = {
      metasearch: { hotel: ['Hotel A', 'Hotel B'] },
      sem: {},
      social: {},
    };
    const result = hasAnyActiveFilters(filterValues, filterDimensionValues);
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
    const filterDimensionValues = {
      metasearch: {},
      sem: {},
      social: {},
    };
    const result = getChannelsWithFilters(filterValues, filterDimensionValues);
    expect(result).toEqual(new Set());
  });

  it('should return set with one channel when only one has filters', () => {
    const filterValues = {
      metasearch: { hotel: ['Hotel A'] },
      sem: {},
      social: {},
    };
    const filterDimensionValues = {
      metasearch: { hotel: ['Hotel A', 'Hotel B'] },
      sem: {},
      social: {},
    };
    const result = getChannelsWithFilters(filterValues, filterDimensionValues);
    expect(result).toEqual(new Set(['metasearch']));
  });

  it('should return set with multiple channels when multiple have filters', () => {
    const filterValues = {
      metasearch: { hotel: ['Hotel A'] },
      sem: { campaign: ['Campaign B'] },
      social: {},
    };
    const filterDimensionValues = {
      metasearch: { hotel: ['Hotel A', 'Hotel B'] },
      sem: { campaign: ['Campaign A', 'Campaign B'] },
      social: {},
    };
    const result = getChannelsWithFilters(filterValues, filterDimensionValues);
    expect(result).toEqual(new Set(['metasearch', 'sem']));
  });

  it('should not include channels with all values selected', () => {
    const filterValues = {
      metasearch: { hotel: ['Hotel A', 'Hotel B'] },
      sem: { campaign: ['Campaign A'] },
      social: {},
    };
    const filterDimensionValues = {
      metasearch: { hotel: ['Hotel A', 'Hotel B'] },
      sem: { campaign: ['Campaign A', 'Campaign B'] },
      social: {},
    };
    const result = getChannelsWithFilters(filterValues, filterDimensionValues);
    expect(result).toEqual(new Set(['sem']));
  });

  it('should include channels with empty array filters', () => {
    const filterValues = {
      metasearch: { hotel: [] },
      sem: {},
      social: {},
    };
    const filterDimensionValues = {
      metasearch: { hotel: ['Hotel A', 'Hotel B'] },
      sem: {},
      social: {},
    };
    const result = getChannelsWithFilters(filterValues, filterDimensionValues);
    expect(result).toEqual(new Set(['metasearch']));
  });
});
