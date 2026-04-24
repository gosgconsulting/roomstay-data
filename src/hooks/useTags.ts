/**
 * React Query hooks for tag CRUD operations.
 *
 * Tags are fetched eagerly with their nested tag_values and tag_rules.
 * Mutations handle the full tag lifecycle: create (with values+rules),
 * update (replace values+rules), and delete (cascades automatically).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type {
  Tag,
  TagValue,
  TagRule,
  CreateTagInput,
  UpdateTagInput,
} from '@/types/tags';

// ── Query keys ──────────────────────────────────────────────────────────────

export const tagKeys = {
  all: ['tags'] as const,
  list: (accountId: string) => ['tags', 'list', accountId] as const,
  detail: (tagId: string) => ['tags', 'detail', tagId] as const,
};

// ── Fetch all tags for an account ───────────────────────────────────────────

async function fetchTags(accountId: string): Promise<Tag[]> {
  // Fetch tags
  const { data: tags, error: tagsError } = await supabase
    .from('tags')
    .select('*')
    .eq('account_id', accountId)
    .order('name');

  if (tagsError) throw tagsError;
  if (!tags || tags.length === 0) return [];

  const tagIds = tags.map((t: any) => t.id);

  // Fetch all tag_values for these tags
  const { data: allValues, error: valuesError } = await supabase
    .from('tag_values')
    .select('*')
    .in('tag_id', tagIds)
    .order('sort_order');

  if (valuesError) throw valuesError;

  const valueIds = (allValues || []).map((v: any) => v.id);

  // Fetch all rules for these values
  let allRules: any[] = [];
  if (valueIds.length > 0) {
    const { data: rules, error: rulesError } = await supabase
      .from('tag_rules')
      .select('*')
      .in('tag_value_id', valueIds);

    if (rulesError) throw rulesError;
    allRules = rules || [];
  }

  // Assemble the nested structure
  const rulesByValueId = new Map<string, TagRule[]>();
  for (const rule of allRules) {
    const list = rulesByValueId.get(rule.tag_value_id) || [];
    list.push(rule as TagRule);
    rulesByValueId.set(rule.tag_value_id, list);
  }

  const valuesByTagId = new Map<string, TagValue[]>();
  for (const val of allValues || []) {
    const tagId = val.tag_id;
    const list = valuesByTagId.get(tagId) || [];
    list.push({
      ...val,
      rules: rulesByValueId.get(val.id) || [],
    } as TagValue);
    valuesByTagId.set(tagId, list);
  }

  return tags.map((tag: any) => ({
    ...tag,
    tag_values: valuesByTagId.get(tag.id) || [],
  })) as Tag[];
}

export function useTags(accountId: string | undefined) {
  return useQuery({
    queryKey: tagKeys.list(accountId || ''),
    queryFn: () => fetchTags(accountId!),
    enabled: !!accountId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// ── Create a tag with values and rules ──────────────────────────────────────

export function useCreateTag() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: CreateTagInput & { created_by: string }) => {
      // 1. Insert the tag
      const { data: tag, error: tagError } = await supabase
        .from('tags')
        .insert({
          account_id: input.account_id,
          name: input.name,
          channels: input.channels,
          view_id: input.view_id ?? null,
          created_by: input.created_by,
        })
        .select()
        .single();

      if (tagError) throw tagError;

      // 2. Insert tag values
      if (input.tag_values.length > 0) {
        const valuesToInsert = input.tag_values.map((tv, idx) => ({
          tag_id: tag.id,
          label: tv.label,
          sort_order: tv.sort_order ?? idx,
        }));

        const { data: values, error: valuesError } = await supabase
          .from('tag_values')
          .insert(valuesToInsert)
          .select();

        if (valuesError) throw valuesError;

        // 3. Insert rules for each value
        const rulesToInsert: any[] = [];
        for (let i = 0; i < input.tag_values.length; i++) {
          const inputValue = input.tag_values[i];
          const dbValue = values?.find((v: any) => v.label === inputValue.label);
          if (!dbValue) continue;

          for (const rule of inputValue.rules) {
            rulesToInsert.push({
              tag_value_id: dbValue.id,
              dimension_id: rule.dimension_id,
              operator: rule.operator,
              value: rule.value,
              case_sensitive: rule.case_sensitive ?? false,
            });
          }
        }

        if (rulesToInsert.length > 0) {
          const { error: rulesError } = await supabase
            .from('tag_rules')
            .insert(rulesToInsert);

          if (rulesError) throw rulesError;
        }
      }

      return tag;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: tagKeys.list(data.account_id) });
      toast({
        title: 'Tag created',
        description: `Tag "${data.name}" has been created.`,
      });
    },
    onError: (error: any) => {
      console.error('[useCreateTag] Error:', error);
      if (error.code === '23505') {
        toast({
          title: 'Tag already exists',
          description: 'A tag with this name already exists for this account.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Error',
          description: 'Failed to create tag.',
          variant: 'destructive',
        });
      }
    },
  });
}

// ── Update a tag (replace values and rules) ─────────────────────────────────

export function useUpdateTag() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: UpdateTagInput & { account_id: string }) => {
      // 1. Update tag metadata
      const updateData: any = { updated_at: new Date().toISOString() };
      if (input.name !== undefined) updateData.name = input.name;
      if (input.channels !== undefined) updateData.channels = input.channels;
      if (input.view_id !== undefined) updateData.view_id = input.view_id;

      const { error: tagError } = await supabase
        .from('tags')
        .update(updateData)
        .eq('id', input.id);

      if (tagError) throw tagError;

      // 2. Replace tag values + rules (delete old, insert new)
      if (input.tag_values !== undefined) {
        // Delete existing values (cascades to rules)
        const { error: deleteError } = await supabase
          .from('tag_values')
          .delete()
          .eq('tag_id', input.id);

        if (deleteError) throw deleteError;

        // Insert new values
        if (input.tag_values.length > 0) {
          const valuesToInsert = input.tag_values.map((tv, idx) => ({
            tag_id: input.id,
            label: tv.label,
            sort_order: tv.sort_order ?? idx,
          }));

          const { data: values, error: valuesError } = await supabase
            .from('tag_values')
            .insert(valuesToInsert)
            .select();

          if (valuesError) throw valuesError;

          // Insert rules
          const rulesToInsert: any[] = [];
          for (let i = 0; i < input.tag_values.length; i++) {
            const inputValue = input.tag_values[i];
            const dbValue = values?.find((v: any) => v.label === inputValue.label);
            if (!dbValue) continue;

            for (const rule of inputValue.rules) {
              rulesToInsert.push({
                tag_value_id: dbValue.id,
                dimension_id: rule.dimension_id,
                operator: rule.operator,
                value: rule.value,
                case_sensitive: rule.case_sensitive ?? false,
              });
            }
          }

          if (rulesToInsert.length > 0) {
            const { error: rulesError } = await supabase
              .from('tag_rules')
              .insert(rulesToInsert);

            if (rulesError) throw rulesError;
          }
        }
      }

      return { id: input.id, account_id: input.account_id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: tagKeys.list(data.account_id) });
      toast({
        title: 'Tag updated',
        description: 'Tag has been updated successfully.',
      });
    },
    onError: (error: any) => {
      console.error('[useUpdateTag] Error:', error);
      toast({
        title: 'Error',
        description: 'Failed to update tag.',
        variant: 'destructive',
      });
    },
  });
}

// ── Delete a tag ────────────────────────────────────────────────────────────

export function useDeleteTag() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ tagId, accountId }: { tagId: string; accountId: string }) => {
      const { error } = await supabase
        .from('tags')
        .delete()
        .eq('id', tagId);

      if (error) throw error;
      return { accountId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: tagKeys.list(data.accountId) });
      toast({
        title: 'Tag deleted',
        description: 'Tag has been removed.',
      });
    },
    onError: (error: any) => {
      console.error('[useDeleteTag] Error:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete tag.',
        variant: 'destructive',
      });
    },
  });
}
