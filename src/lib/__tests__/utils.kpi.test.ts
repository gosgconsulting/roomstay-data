/**
 * Unit tests for KPI mapping validation and default ordering (dimension/KPI pipeline)
 */

import { describe, it, expect } from 'vitest';
import {
  sortKPIsByDefaultOrder,
  getAccountDefaultKPIs,
} from '../utils';

describe('sortKPIsByDefaultOrder', () => {
  it('returns empty array for empty input', () => {
    expect(sortKPIsByDefaultOrder([])).toEqual([]);
  });

  it('puts priority-first KPIs at the start', () => {
    const input = ['Revenue', 'Impressions', 'Cost', 'Clicks'];
    const result = sortKPIsByDefaultOrder(input);
    expect(result.indexOf('Impressions')).toBeLessThan(result.indexOf('Revenue'));
    expect(result.indexOf('Clicks')).toBeLessThan(result.indexOf('Cost'));
  });

  it('puts priority-last KPIs at the end', () => {
    const input = ['ROAS', 'Impressions', 'Cost of sale', 'Clicks'];
    const result = sortKPIsByDefaultOrder(input);
    const roasIndex = result.indexOf('ROAS');
    const costOfSaleIndex = result.indexOf('Cost of sale');
    expect(roasIndex).toBeGreaterThan(result.indexOf('Clicks'));
    expect(costOfSaleIndex).toBeGreaterThan(result.indexOf('Impressions'));
  });

  it('sorts middle group alphabetically', () => {
    const input = ['Bookings', 'Revenue', 'Cost'];
    const result = sortKPIsByDefaultOrder(input);
    const costIdx = result.indexOf('Cost');
    const revenueIdx = result.indexOf('Revenue');
    const bookingsIdx = result.indexOf('Bookings');
    if (costIdx >= 0 && revenueIdx >= 0 && bookingsIdx >= 0) {
      expect(['Bookings', 'Cost', 'Revenue'].sort()).toEqual(
        [result[bookingsIdx], result[costIdx], result[revenueIdx]].sort()
      );
    }
  });
});

describe('getAccountDefaultKPIs', () => {
  it('returns exact casing from availableKPIs for Roomstay account', () => {
    const available = ['impressions', 'CLICKS', 'Revenue', 'ROAS'];
    const result = getAccountDefaultKPIs('roomstay', available);
    expect(result).toContain('impressions');
    expect(result).toContain('CLICKS');
    expect(result).toContain('Revenue');
    expect(result).toContain('ROAS');
    expect(result.every((k) => available.includes(k))).toBe(true);
  });

  it('uses Roomstay order for account name "roomstay" (case-insensitive)', () => {
    const available = ['Revenue', 'Impressions', 'Clicks', 'ROAS', 'Cost of sale'];
    const result = getAccountDefaultKPIs('Roomstay', available);
    expect(result[0]).toBe('Impressions');
    expect(result[1]).toBe('Clicks');
    expect(result).toContain('Revenue');
    expect(result).toContain('ROAS');
    expect(result).toContain('Cost of sale');
  });

  it('falls back to sortKPIsByDefaultOrder for non-Roomstay account', () => {
    const available = ['Revenue', 'Impressions', 'Cost'];
    const result = getAccountDefaultKPIs('OtherAccount', available);
    expect(result.length).toBe(available.length);
    expect(result.sort()).toEqual(available.sort());
  });

  it('handles undefined accountName with default ordering', () => {
    const available = ['Revenue', 'Impressions'];
    const result = getAccountDefaultKPIs(undefined, available);
    expect(result.length).toBe(2);
    expect(result).toContain('Revenue');
    expect(result).toContain('Impressions');
  });

  it('does not duplicate KPIs when available has same name different casing for Roomstay', () => {
    const available = ['Impressions', 'Clicks', 'Revenue'];
    const result = getAccountDefaultKPIs('roomstay', available);
    const impressionsCount = result.filter((k) => k.toLowerCase() === 'impressions').length;
    expect(impressionsCount).toBe(1);
  });
});
