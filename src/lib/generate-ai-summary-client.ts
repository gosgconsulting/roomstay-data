/**
 * Single client for invoking the generate-ai-summary Edge Function.
 * All AI summary generation goes through this module so auth and errors are consistent.
 * Supports both payload shapes: card-based (pivotData) and minimalData (slide view).
 */

import { supabase } from '@/integrations/supabase/client';

const FUNCTION_NAME = 'generate-ai-summary';

/** Request body for card-based summary (AISummaryPage). */
export interface GenerateAISummaryCardBody {
  cardId: string;
  pivotData: unknown;
  selectedMetrics: string[];
  reportConfigs: Record<string, unknown>;
  aiPrompt: string;
  comparisonType: string;
  selectedPeriods: string[];
}

/** Request body for minimalData summary (SlideViewAISummaryModal). */
export interface GenerateAISummaryMinimalBody {
  minimalData: unknown;
  selectedTab: string;
  selectedYear: string;
  selectedMonth: string;
  comparisonType: string;
  isTableComment?: boolean;
  aiPrompt: string;
}

export type GenerateAISummaryBody = GenerateAISummaryCardBody | GenerateAISummaryMinimalBody;

/** Response shape from the edge function (card path returns tableInsights/executiveSummaries too). */
export interface GenerateAISummaryResult {
  summary?: string;
  executiveSummary?: string;
  executiveSummaries?: Record<string, string>;
  tableInsights?: {
    summary?: Record<string, string>;
    date_breakdown?: Record<string, string>;
    breakdowns?: Record<string, Record<string, string>>;
  };
  error?: string;
}

/**
 * Invoke the generate-ai-summary Edge Function with the given body.
 * Uses the current Supabase session; no hardcoded URL or keys.
 */
export async function invokeGenerateAISummary(
  body: GenerateAISummaryBody
): Promise<GenerateAISummaryResult> {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: body as Record<string, unknown>,
  });

  if (error) {
    throw new Error(data?.error ?? error.message ?? 'Failed to generate AI summary');
  }
  if (data?.error) {
    throw new Error(String(data.error));
  }

  return data as GenerateAISummaryResult;
}
