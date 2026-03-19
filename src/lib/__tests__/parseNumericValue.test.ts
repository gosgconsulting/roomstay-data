/**
 * Tests for parseNumericValue / parseNumericValueOrNull (currency-safe metric parsing)
 */

import { describe, it, expect } from 'vitest';
import { parseNumericValue, parseNumericValueOrNull } from '../parseNumericValue';

describe('parseNumericValue', () => {
  it('returns 0 for null/undefined', () => {
    expect(parseNumericValue(null)).toBe(0);
    expect(parseNumericValue(undefined)).toBe(0);
  });

  it('returns number as-is when finite', () => {
    expect(parseNumericValue(0)).toBe(0);
    expect(parseNumericValue(1234.56)).toBe(1234.56);
    expect(parseNumericValue(-100)).toBe(-100);
  });

  it('parses plain numeric strings', () => {
    expect(parseNumericValue('1234')).toBe(1234);
    expect(parseNumericValue('1234.56')).toBe(1234.56);
    expect(parseNumericValue('0')).toBe(0);
  });

  it('strips dollar and commas (USD-style)', () => {
    expect(parseNumericValue('$1,234.56')).toBe(1234.56);
    expect(parseNumericValue('$ 1,234')).toBe(1234);
    expect(parseNumericValue('1,234.56')).toBe(1234.56);
  });

  it('strips currency codes (AU$, US$, USD, AUD)', () => {
    expect(parseNumericValue('AU$ 1,234.56')).toBe(1234.56);
    expect(parseNumericValue('US$ 1,234')).toBe(1234);
    expect(parseNumericValue('USD 500')).toBe(500);
    expect(parseNumericValue('AUD 999.99')).toBe(999.99);
  });

  it('strips other currency symbols', () => {
    expect(parseNumericValue('£100')).toBe(100);
    expect(parseNumericValue('£1,234.56')).toBe(1234.56);
    expect(parseNumericValue('€500')).toBe(500);
  });

  it('handles percentages (returns raw number)', () => {
    expect(parseNumericValue('12.5%')).toBe(12.5);
    expect(parseNumericValue('100%')).toBe(100);
  });

  it('returns 0 for unparseable strings', () => {
    expect(parseNumericValue('')).toBe(0);
    expect(parseNumericValue('abc')).toBe(0);
    expect(parseNumericValue('N/A')).toBe(0);
  });
});

describe('parseNumericValueOrNull', () => {
  it('returns null for null/undefined', () => {
    expect(parseNumericValueOrNull(null)).toBe(null);
    expect(parseNumericValueOrNull(undefined)).toBe(null);
  });

  it('returns null for unparseable strings', () => {
    expect(parseNumericValueOrNull('')).toBe(null);
    expect(parseNumericValueOrNull('abc')).toBe(null);
  });

  it('returns number for valid input including 0', () => {
    expect(parseNumericValueOrNull(0)).toBe(0);
    expect(parseNumericValueOrNull('0')).toBe(0);
    expect(parseNumericValueOrNull('$1,234.56')).toBe(1234.56);
  });
});
