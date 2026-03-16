/**
 * Client for the run-refresh-workflow Edge Function.
 * Single entry point for clear + resync + optional refresh-slide-report.
 */

import { supabase } from '@/integrations/supabase/client';

const FUNCTION_NAME = 'run-refresh-workflow';

export interface RunRefreshWorkflowParams {
  accountId: string;
  reportId?: string;
  slideReportId?: string;
  clearFirst?: boolean;
  skipResync?: boolean;
  /** When true and slideReportId is set, resync data sources but do not call refresh-slide-report (e.g. Data Studio). */
  skipRefresh?: boolean;
}

export interface RunRefreshWorkflowResult {
  success: boolean;
  cleared?: boolean;
  resynced?: number;
  resyncErrors?: Array<{ dataSourceId: string; error: string }>;
  refreshSuccess?: boolean;
  error?: string;
  message?: string;
}

export async function runRefreshWorkflow(
  params: RunRefreshWorkflowParams
): Promise<RunRefreshWorkflowResult> {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: params,
  });

  if (error) {
    throw new Error(data?.error ?? error.message ?? 'run-refresh-workflow failed');
  }

  if (data?.error && !data?.success) {
    throw new Error(String(data.error));
  }

  return data as RunRefreshWorkflowResult;
}
