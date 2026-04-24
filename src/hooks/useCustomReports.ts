/**
 * React Query hooks for custom report CRUD operations.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type {
  CustomReport,
  CustomReportBlock,
  CreateCustomReportInput,
  UpdateCustomReportInput,
  CreateBlockInput,
  UpdateBlockInput,
} from '@/types/customReports';

// ── Query keys ──────────────────────────────────────────────────────────────

export const customReportKeys = {
  all: ['customReports'] as const,
  list: (accountId: string) => ['customReports', 'list', accountId] as const,
  detail: (reportId: string) => ['customReports', 'detail', reportId] as const,
};

// ── Fetch all reports for an account ────────────────────────────────────────

async function fetchCustomReports(accountId: string): Promise<CustomReport[]> {
  const { data: reports, error } = await supabase
    .from('custom_reports')
    .select('*')
    .eq('account_id', accountId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!reports || reports.length === 0) return [];

  // Fetch all blocks for these reports
  const reportIds = reports.map((r: any) => r.id);
  const { data: allBlocks, error: blocksError } = await supabase
    .from('custom_report_blocks')
    .select('*')
    .in('report_id', reportIds)
    .order('sort_order');

  if (blocksError) throw blocksError;

  const blocksByReportId = new Map<string, CustomReportBlock[]>();
  for (const block of allBlocks || []) {
    const list = blocksByReportId.get(block.report_id) || [];
    list.push(block as CustomReportBlock);
    blocksByReportId.set(block.report_id, list);
  }

  return reports.map((r: any) => ({
    ...r,
    blocks: blocksByReportId.get(r.id) || [],
  })) as CustomReport[];
}

export function useCustomReports(accountId: string | undefined) {
  return useQuery({
    queryKey: customReportKeys.list(accountId || ''),
    queryFn: () => fetchCustomReports(accountId!),
    enabled: !!accountId,
    staleTime: 5 * 60 * 1000,
  });
}

// ── Fetch single report with blocks ─────────────────────────────────────────

async function fetchCustomReport(reportId: string): Promise<CustomReport | null> {
  const { data: report, error } = await supabase
    .from('custom_reports')
    .select('*')
    .eq('id', reportId)
    .single();

  if (error) throw error;
  if (!report) return null;

  const { data: blocks, error: blocksError } = await supabase
    .from('custom_report_blocks')
    .select('*')
    .eq('report_id', reportId)
    .order('sort_order');

  if (blocksError) throw blocksError;

  return {
    ...report,
    blocks: (blocks || []) as CustomReportBlock[],
  } as CustomReport;
}

export function useCustomReport(reportId: string | undefined) {
  return useQuery({
    queryKey: customReportKeys.detail(reportId || ''),
    queryFn: () => fetchCustomReport(reportId!),
    enabled: !!reportId,
  });
}

// ── Create report ───────────────────────────────────────────────────────────

export function useCreateCustomReport() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: CreateCustomReportInput & { created_by: string }) => {
      const { data: report, error } = await supabase
        .from('custom_reports')
        .insert({
          account_id: input.account_id,
          view_id: input.view_id ?? null,
          created_by: input.created_by,
          name: input.name,
          description: input.description || '',
        })
        .select()
        .single();

      if (error) throw error;

      // Insert initial blocks if provided
      if (input.blocks && input.blocks.length > 0) {
        const blocksToInsert = input.blocks.map((b, idx) => ({
          report_id: report.id,
          block_type: b.block_type,
          title: b.title || '',
          config: b.config,
          sort_order: b.sort_order ?? idx,
        }));

        const { error: blocksError } = await supabase
          .from('custom_report_blocks')
          .insert(blocksToInsert);

        if (blocksError) throw blocksError;
      }

      return report;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: customReportKeys.list(data.account_id) });
      toast({ title: 'Report created', description: `"${data.name}" has been created.` });
    },
    onError: (error: any) => {
      console.error('[useCreateCustomReport] Error:', error);
      toast({ title: 'Error', description: 'Failed to create report.', variant: 'destructive' });
    },
  });
}

// ── Update report metadata ──────────────────────────────────────────────────

export function useUpdateCustomReport() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: UpdateCustomReportInput) => {
      const updateData: any = { updated_at: new Date().toISOString() };
      if (input.name !== undefined) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.view_id !== undefined) updateData.view_id = input.view_id;

      const { data, error } = await supabase
        .from('custom_reports')
        .update(updateData)
        .eq('id', input.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: customReportKeys.list(data.account_id) });
      queryClient.invalidateQueries({ queryKey: customReportKeys.detail(data.id) });
      toast({ title: 'Report updated' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to update report.', variant: 'destructive' });
    },
  });
}

// ── Delete report ───────────────────────────────────────────────────────────

export function useDeleteCustomReport() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ reportId, accountId }: { reportId: string; accountId: string }) => {
      const { error } = await supabase
        .from('custom_reports')
        .delete()
        .eq('id', reportId);

      if (error) throw error;
      return { accountId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: customReportKeys.list(data.accountId) });
      toast({ title: 'Report deleted' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to delete report.', variant: 'destructive' });
    },
  });
}

// ── Block CRUD ──────────────────────────────────────────────────────────────

export function useCreateBlock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateBlockInput) => {
      const { data, error } = await supabase
        .from('custom_report_blocks')
        .insert({
          report_id: input.report_id,
          block_type: input.block_type,
          title: input.title || '',
          config: input.config,
          sort_order: input.sort_order ?? 0,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: customReportKeys.detail(data.report_id) });
    },
  });
}

export function useUpdateBlock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateBlockInput & { report_id: string }) => {
      const updateData: any = { updated_at: new Date().toISOString() };
      if (input.title !== undefined) updateData.title = input.title;
      if (input.config !== undefined) updateData.config = input.config;
      if (input.sort_order !== undefined) updateData.sort_order = input.sort_order;

      const { data, error } = await supabase
        .from('custom_report_blocks')
        .update(updateData)
        .eq('id', input.id)
        .select()
        .single();

      if (error) throw error;
      return { ...data, report_id: input.report_id };
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: customReportKeys.detail(data.report_id) });
    },
  });
}

export function useDeleteBlock() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ blockId, reportId }: { blockId: string; reportId: string }) => {
      const { error } = await supabase
        .from('custom_report_blocks')
        .delete()
        .eq('id', blockId);

      if (error) throw error;
      return { reportId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: customReportKeys.detail(data.reportId) });
    },
  });
}
