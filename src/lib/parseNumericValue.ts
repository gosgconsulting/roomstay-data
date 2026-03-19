/**
 * Reliable parsing of numeric/currency values from report data (e.g. metasearch Cost).
 *
 * Source data may be stored as "$1,234.56", "AU$ 1,234", "1.234,56" (EU), or plain numbers.
 * This normalizes symbols and separators so cost/revenue/etc. always parse correctly.
 */

/** Unicode currency symbols we strip (single chars) */
const CURRENCY_SYMBOLS =
  /[$€£¥₹₽¢₩₦₨₫₪₭₮₯₰₱₲₳₴₵₶₷₸₹₺₻₼₽₾₿]/g;

/** Currency codes that may appear before/after the number (e.g. AU$, US$, USD, AUD) */
const CURRENCY_CODE_PREFIX = /^(?:AU\$|US\$|A\$|U\$|USD|AUD|EUR|GBP|CAD)\s*/i;
const CURRENCY_CODE_SUFFIX = /\s*(?:USD|AUD|EUR|GBP|CAD)$/i;

/**
 * Strip currency symbols and codes from a string, then normalize thousands/decimal
 * so we can parseFloat. Assumes Western number format (comma = thousands, dot = decimal).
 */
function cleanCurrencyString(s: string): string {
  let cleaned = s.trim();
  cleaned = cleaned.replace(CURRENCY_CODE_PREFIX, '');
  cleaned = cleaned.replace(CURRENCY_CODE_SUFFIX, '');
  cleaned = cleaned.replace(CURRENCY_SYMBOLS, '');
  cleaned = cleaned.replace(/[\s,]/g, '');
  return cleaned;
}

/**
 * Parse a value that might be a number or a formatted currency/numeric string.
 * Use this whenever reading cost, revenue, or other numeric metrics from dimension_data
 * or report rows (e.g. metasearch Cost) so that "$1,234.56", "AU$ 1,234", and 1234 all work.
 *
 * @param value - Raw value (number, string like "$1,234.56", or null/undefined)
 * @returns Parsed number, or 0 if unparseable (use when 0 is a valid default for aggregation)
 */
export function parseNumericValue(value: unknown): number {
  const n = parseNumericValueOrNull(value);
  return n ?? 0;
}

/**
 * Same as parseNumericValue but returns null when the value is not parseable as a number.
 * Use in forms/validation where you need to distinguish "0" from "invalid".
 */
export function parseNumericValueOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value;
    return null;
  }
  const s = String(value).trim();
  if (!s) return null;

  // Percentage: "12.5%" -> 12.5 (caller may divide by 100)
  if (s.includes('%')) {
    const withoutPct = s.replace(/%/g, '').replace(/[,\s]/g, '');
    const n = parseFloat(withoutPct);
    return Number.isFinite(n) ? n : null;
  }

  // Try cleaned currency string first (handles $ € AU$ etc.)
  const cleaned = cleanCurrencyString(s);
  if (!/\d/.test(cleaned)) return null;
  let n = parseFloat(cleaned);
  if (Number.isFinite(n)) return n;

  // Fallback: strip everything except digits, minus, and decimal point
  const digitsOnly = s.replace(/[^0-9.-]/g, '');
  if (!digitsOnly) return null;
  n = parseFloat(digitsOnly);
  return Number.isFinite(n) ? n : null;
}
