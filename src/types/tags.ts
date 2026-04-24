/**
 * Tags: custom rule-based dimensions for categorizing data rows.
 *
 * A Tag (e.g. "Strategy") belongs to an account and applies to specific channels.
 * It contains TagValues (e.g. "Brand", "Generic"), each with TagRules that match
 * against existing dimension values (e.g. Campaign name contains "Brand").
 *
 * Tags integrate with the filter/breakdown system via synthetic dimension IDs
 * using the "tag:<uuid>" convention.
 */

export type TagRuleOperator =
  | 'contains'
  | 'not_contains'
  | 'equals'
  | 'not_equals'
  | 'starts_with'
  | 'ends_with'
  | 'regex';

export interface TagRule {
  id: string;
  tag_value_id: string;
  dimension_id: string; // references dimensions.id (e.g. the "Campaign" dimension)
  operator: TagRuleOperator;
  value: string;
  case_sensitive: boolean;
}

export interface TagValue {
  id: string;
  tag_id: string;
  label: string; // e.g. "Brand", "Generic"
  sort_order: number;
  rules: TagRule[]; // eagerly loaded
}

export interface Tag {
  id: string;
  account_id: string;
  name: string; // e.g. "Strategy"
  channels: string[]; // e.g. ['sem']
  view_id: string | null; // scoped to a specific view, or null for account-wide
  created_by: string;
  created_at: string;
  updated_at: string;
  tag_values: TagValue[]; // eagerly loaded, sorted by sort_order
}

// ── Synthetic dimension ID helpers ──────────────────────────────────────────

const TAG_PREFIX = 'tag:';

/** Build the synthetic dimension ID used in filterConfigs/breakdownConfigs. */
export function tagDimensionId(tagId: string): string {
  return `${TAG_PREFIX}${tagId}`;
}

/** Check whether a dimension ID refers to a tag. */
export function isTagDimensionId(dimId: string): boolean {
  return dimId.startsWith(TAG_PREFIX);
}

/** Extract the real tag UUID from a synthetic dimension ID. */
export function extractTagId(tagDimId: string): string {
  return tagDimId.slice(TAG_PREFIX.length);
}

// ── Input types for CRUD operations ─────────────────────────────────────────

export interface TagRuleInput {
  dimension_id: string;
  operator: TagRuleOperator;
  value: string;
  case_sensitive?: boolean;
}

export interface TagValueInput {
  label: string;
  sort_order?: number;
  rules: TagRuleInput[];
}

export interface CreateTagInput {
  account_id: string;
  name: string;
  channels: string[];
  view_id?: string | null;
  tag_values: TagValueInput[];
}

export interface UpdateTagInput {
  id: string;
  name?: string;
  channels?: string[];
  view_id?: string | null;
  tag_values?: TagValueInput[];
}
