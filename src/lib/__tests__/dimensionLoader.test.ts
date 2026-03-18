/**
 * Unit tests for dimension dedupe and canonical loading helpers
 */

import { describe, it, expect } from 'vitest';
import { dedupeDimensionsByName } from '../dimensionLoader';

describe('dedupeDimensionsByName', () => {
  it('returns empty array for empty input', () => {
    expect(dedupeDimensionsByName([])).toEqual([]);
  });

  it('returns same array when all names are unique', () => {
    const dims = [
      { id: '1', name: 'Revenue', type: 'currency' },
      { id: '2', name: 'Impressions', type: 'number' },
      { id: '3', name: 'Date', type: 'date' },
    ];
    expect(dedupeDimensionsByName(dims)).toEqual(dims);
  });

  it('keeps first occurrence when names duplicate (account > custom > global precedence)', () => {
    const dims = [
      { id: 'account-1', name: 'Revenue', type: 'currency' },
      { id: 'custom-1', name: 'Revenue', type: 'number' },
      { id: 'global-1', name: 'Revenue', type: 'currency' },
    ];
    const result = dedupeDimensionsByName(dims);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('account-1');
    expect(result[0].name).toBe('Revenue');
  });

  it('dedupes by name and preserves order of first occurrence', () => {
    const dims = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'a2', name: 'A' },
      { id: 'c', name: 'C' },
      { id: 'b2', name: 'B' },
    ];
    const result = dedupeDimensionsByName(dims);
    expect(result.map((d) => d.id)).toEqual(['a', 'b', 'c']);
    expect(result.map((d) => d.name)).toEqual(['A', 'B', 'C']);
  });

  it('is case-sensitive (name match is exact)', () => {
    const dims = [
      { id: '1', name: 'Revenue' },
      { id: '2', name: 'revenue' },
      { id: '3', name: 'REVENUE' },
    ];
    const result = dedupeDimensionsByName(dims);
    expect(result).toHaveLength(3);
  });
});
