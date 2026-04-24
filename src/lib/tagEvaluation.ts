/**
 * Tag evaluation engine.
 *
 * Pure functions that augment raw data rows with computed tag dimension values.
 * Called before filterRawDataRows() so tags appear as filterable/breakdownable dimensions.
 */

import type { RawDataRow } from '@/types/slideReports';
import type { Tag, TagRule, TagValue } from '@/types/tags';
import { tagDimensionId } from '@/types/tags';

const UNTAGGED = '(Untagged)';

// ── Rule matching ───────────────────────────────────────────────────────────

/**
 * Check whether a single cell value matches a tag rule.
 */
export function matchesTagRule(cellValue: string | null | undefined, rule: TagRule): boolean {
  if (cellValue == null || cellValue === '') return false;

  const haystack = rule.case_sensitive ? String(cellValue) : String(cellValue).toLowerCase();
  const needle = rule.case_sensitive ? rule.value : rule.value.toLowerCase();

  switch (rule.operator) {
    case 'contains':
      return haystack.includes(needle);
    case 'not_contains':
      return !haystack.includes(needle);
    case 'equals':
      return haystack === needle;
    case 'not_equals':
      return haystack !== needle;
    case 'starts_with':
      return haystack.startsWith(needle);
    case 'ends_with':
      return haystack.endsWith(needle);
    case 'regex':
      try {
        const flags = rule.case_sensitive ? '' : 'i';
        return new RegExp(rule.value, flags).test(String(cellValue));
      } catch {
        return false; // Invalid regex — treat as no match
      }
    default:
      return false;
  }
}

/**
 * Resolve a dimension_id to the key that exists in a raw data row.
 *
 * Tag rules reference a dimension by its UUID (e.g. the "Campaign" dimension).
 * But raw data rows may use a different UUID for the same dimension (account-scoped
 * vs global). We resolve via name-based lookup, same as filterRawDataRows().
 */
function resolveDimensionKey(
  dimensionId: string,
  sampleRow: Record<string, unknown>,
  dimensionMap: Record<string, string>
): string | null {
  // Direct match — dimension ID exists in the row
  if (dimensionId in sampleRow) return dimensionId;

  // Resolve via name: find the dimension's name, then find which row key has that name
  const dimName = dimensionMap[dimensionId];
  if (!dimName) return null;

  for (const [rowKey, name] of Object.entries(dimensionMap)) {
    if (name === dimName && rowKey in sampleRow) {
      return rowKey;
    }
  }
  return null;
}

/**
 * Check whether a row matches ALL rules for a tag value (AND logic).
 */
function matchesAllRules(
  row: Record<string, unknown>,
  rules: TagRule[],
  resolvedKeys: Map<string, string | null>
): boolean {
  if (rules.length === 0) return false; // No rules = no match

  for (const rule of rules) {
    const rowKey = resolvedKeys.get(rule.dimension_id);
    if (!rowKey) return false; // Dimension not in data — can't match

    const cellValue = row[rowKey];
    if (!matchesTagRule(cellValue as string, rule)) return false;
  }
  return true;
}

// ── Main evaluation function ────────────────────────────────────────────────

/**
 * Augment raw data rows with computed tag dimension values.
 *
 * For each row, each tag is evaluated by checking its tag_values in sort_order.
 * The first matching tag_value's label becomes the row's value for that tag dimension.
 * If no tag_value matches, the row gets "(Untagged)".
 *
 * @param rows       Raw data rows for a single channel
 * @param tags       Tags applicable to this channel (pre-filtered by caller)
 * @param dimensionMap  dimensionId → dimensionName mapping for the channel
 * @returns New array of rows with additional `tag:<uuid>` keys
 */
export function evaluateTagsForRows(
  rows: RawDataRow[],
  tags: Tag[],
  dimensionMap: Record<string, string>
): RawDataRow[] {
  if (!rows || rows.length === 0 || tags.length === 0) return rows;

  // Pre-resolve dimension keys from a sample row (all rows share the same schema)
  const sampleRow = (rows[0]?.dimension_values || rows[0]) as Record<string, unknown>;
  const resolvedKeysByTag = new Map<string, Map<string, string | null>>();

  for (const tag of tags) {
    const keyMap = new Map<string, string | null>();
    for (const tv of tag.tag_values) {
      for (const rule of tv.rules) {
        if (!keyMap.has(rule.dimension_id)) {
          keyMap.set(rule.dimension_id, resolveDimensionKey(rule.dimension_id, sampleRow, dimensionMap));
        }
      }
    }
    resolvedKeysByTag.set(tag.id, keyMap);
  }

  // Check if rows use the dimension_values wrapper (some data formats nest data there)
  const hasDimensionValues = rows[0]?.dimension_values != null;

  return rows.map((row) => {
    const rowData = (row.dimension_values || row) as Record<string, unknown>;
    const augmented: RawDataRow = { ...row };

    // If the row has a dimension_values wrapper, also spread it so we can add tag keys inside
    if (hasDimensionValues) {
      augmented.dimension_values = { ...row.dimension_values };
    }

    for (const tag of tags) {
      const dimId = tagDimensionId(tag.id);
      const resolvedKeys = resolvedKeysByTag.get(tag.id)!;
      let matched = false;

      // Check tag_values in sort_order (caller ensures they're sorted)
      for (const tv of tag.tag_values) {
        if (matchesAllRules(rowData, tv.rules, resolvedKeys)) {
          augmented[dimId] = tv.label;
          if (hasDimensionValues) augmented.dimension_values[dimId] = tv.label;
          matched = true;
          break; // First match wins
        }
      }

      if (!matched) {
        augmented[dimId] = UNTAGGED;
        if (hasDimensionValues) augmented.dimension_values[dimId] = UNTAGGED;
      }
    }

    return augmented;
  });
}

/**
 * Extract the unique tag values present in a set of rows for a specific tag.
 * Used to build filter dropdown options.
 */
export function getTagFilterOptions(
  rows: RawDataRow[],
  tagId: string
): string[] {
  const dimId = tagDimensionId(tagId);
  const values = new Set<string>();
  for (const row of rows) {
    const val = row[dimId];
    if (val != null && val !== '') {
      values.add(String(val));
    }
  }
  return Array.from(values).sort((a, b) => {
    // Sort "(Untagged)" to the end
    if (a === UNTAGGED) return 1;
    if (b === UNTAGGED) return -1;
    return a.localeCompare(b);
  });
}
