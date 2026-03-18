/**
 * Client for the run-refresh-workflow Edge Function.
 * Single entry point for clear + resync + optional refresh-slide-report.
 * Retries on transient "Failed to send request" errors so Data Studio and Master Report refresh complete.
 */

import { supabase } from '@/integrations/supabase/client';

const FUNCTION_NAME = 'run-refresh-workflow';
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

export interface RunRefreshWorkflowParams {
  accountId: string;
  reportId?: string;
  slideReportId?: string;
  clearFirst?: boolean;
  skipResync?: boolean;
  /** When true and slideReportId is set, resync data sources but do not call refresh-slide-report (e.g. Data Studio). */
  skipRefresh?: boolean;
  /**
   * 'full'   — delete all existing rows and re-insert everything from source (default).
   * 'recent' — delete only the last 2 months of rows and re-insert only those rows.
   *            Older historical data is preserved. Faster for routine daily/weekly refreshes.
   */
  refreshMode?: 'full' | 'recent';
}

export interface RunRefreshWorkflowResult {
  success: boolean;
  cleared?: boolean;
  resynced?: number;
  /** Total rows inserted across all data sources in this refresh. */
  rowsProcessed?: number;
  resyncErrors?: Array<{ dataSourceId: string; error: string }>;
  refreshSuccess?: boolean;
  error?: string;
  message?: string;
}

function isRetryableError(err: { message?: string } | null): boolean {
  const msg = err?.message ?? '';
  return (
    msg.includes('Failed to send') ||
    msg.includes('fetch') ||
    msg.includes('network') ||
    msg.includes('ECONNRESET') ||
    msg.includes('timeout')
  );
}

export async function runRefreshWorkflow(
  params: RunRefreshWorkflowParams
): Promise<RunRefreshWorkflowResult> {
  let lastData: unknown = null;
  let lastError: { message?: string } | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
      body: params,
    });

    lastData = data;
    lastError = error;

    if (!error) {
      if (data && typeof data === 'object' && (data as RunRefreshWorkflowResult).error && !(data as RunRefreshWorkflowResult).success) {
        throw new Error(String((data as RunRefreshWorkflowResult).error));
      }
      return data as RunRefreshWorkflowResult;
    }

    if (attempt < MAX_RETRIES && isRetryableError(error)) {
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      continue;
    }

    throw new Error(
      (lastData as { error?: string })?.error ?? error?.message ?? 'run-refresh-workflow failed'
    );
  }

  throw new Error(
    (lastData as { error?: string })?.error ?? lastError?.message ?? 'run-refresh-workflow failed'
  );
}
