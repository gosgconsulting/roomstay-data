/**
 * Hook to fetch and aggregate real data for custom report blocks.
 * Uses the same raw data pipeline as Data Studio (edge function + fallback).
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  filterRawDataRows,
  aggregateRowsToMetrics,
  calculateDerivedMetrics,
} from '@/lib/slideViewHelpers';
import { evaluateTagsForRows } from '@/lib/tagEvaluation';
import { tagDimensionId } from '@/types/tags';
import type { Tag } from '@/types/tags';
import type { CustomReport, TableConfig, KpiCardsConfig, WinnersLosersConfig } from '@/types/customReports';

export interface BreakdownRow {
  dimensionValue: string;
  metrics: Record<string, number>;
  /** Aggregated metrics for the comparison period (YoY or previous period) */
  comparisonMetrics?: Record<string, number>;
  /** % change vs comparison: positive = current higher, negative = current lower */
  deltaPct?: Record<string, number>;
}

export interface BlockTableResult {
  totals: Record<string, number>;
  breakdownRows: BreakdownRow[];
  comparisonTotals?: Record<string, number>;
  totalsDeltaPct?: Record<string, number>;
  /** Number of distinct campaigns per grouped row (if a Campaign dimension is present). */
  campaignCountByRow?: Record<string, number>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * % change vs comparison. Returns NaN when comparison is 0 / missing so
 * callers (and the DeltaBadge) can hide deltas rather than rendering a
 * meaningless ±100%.
 */
function computeDeltaPct(current: number, comparison: number): number {
  if (!isFinite(current) || !isFinite(comparison) || comparison === 0) return NaN;
  return ((current - comparison) / Math.abs(comparison)) * 100;
}

function addCpa(derived: Record<string, number>, baseTotals: { cost: number; bookings: number }) {
  derived.cpa = baseTotals.bookings > 0 ? baseTotals.cost / baseTotals.bookings : 0;
  return derived;
}

/**
 * Fetches raw rows for a channel from the edge function.
 */
async function fetchChannelData(
  channelReportId: string,
  selectedYear: string,
  dimensionFilters?: Record<string, string[]>,
) {
  const body: Record<string, unknown> = {
    reportId: channelReportId,
    selectedYear,
    selectedMonth: 'all',
  };
  if (dimensionFilters && Object.keys(dimensionFilters).length > 0) {
    body.dimensionFilters = dimensionFilters;
  }

  const { data, error } = await supabase.functions.invoke('get-cached-report-data', { body });
  if (error) throw error;

  const response = (data || {}) as any;
  if (!response.success) {
    throw new Error(response.error || 'Failed to fetch report data');
  }

  const rows = Array.isArray(response.rows) ? response.rows : [];

  // Build dimension map from rows — collect ALL dimension IDs from the data
  const allDimIds = new Set<string>();
  for (const row of rows) {
    const dv = (row.dimension_values || row) as Record<string, unknown>;
    for (const id of Object.keys(dv)) {
      if (id.length >= 32) allDimIds.add(id);
    }
  }

  let dimMap: Record<string, string> = {};
  if (allDimIds.size > 0) {
    const dimIdArray = Array.from(allDimIds);
    for (let i = 0; i < dimIdArray.length; i += 50) {
      const chunk = dimIdArray.slice(i, i + 50);
      const { data: dims } = await supabase
        .from('dimensions')
        .select('id, name')
        .in('id', chunk);
      if (dims) {
        for (const d of dims) dimMap[d.id] = d.name;
      }
    }
  }

  return { rows, dimMap };
}

/**
 * Fetch + evaluate tags for a single channel + year.
 */
async function fetchAndEvaluateChannel(
  chReportId: string,
  year: string,
  filters: Record<string, string[]> | undefined,
  channelTags: Tag[],
) {
  const { rows, dimMap } = await fetchChannelData(chReportId, year, filters);

  const taggedRows = channelTags.length > 0
    ? (evaluateTagsForRows(rows as any, channelTags, dimMap) as Record<string, any>[])
    : rows;

  // Register tag dimension IDs in dimMap so groupBy resolution works
  for (const tag of channelTags) {
    dimMap[tagDimensionId(tag.id)] = tag.name;
  }

  return { rows: taggedRows, dimMap };
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useCustomReportData(report: CustomReport | null | undefined) {
  const viewId = report?.view_id;

  const { data: viewData } = useQuery({
    queryKey: ['customReportViewData', viewId],
    queryFn: async () => {
      if (!viewId) return null;
      const { data, error } = await supabase
        .from('views')
        .select('filter_values, slide_report_id')
        .eq('id', viewId)
        .single();
      if (error) throw error;
      return data as { filter_values: Record<string, Record<string, string[]>>; slide_report_id: string };
    },
    enabled: !!viewId,
    staleTime: 5 * 60 * 1000,
  });

  const slideReportId = viewData?.slide_report_id;
  const { data: slideReport } = useQuery({
    queryKey: ['customReportSlideReport', slideReportId],
    queryFn: async () => {
      if (!slideReportId) return null;
      const { data, error } = await supabase
        .from('slide_reports')
        .select('report_ids')
        .eq('id', slideReportId)
        .single();
      if (error) throw error;
      return data as { report_ids: Record<string, string> };
    },
    enabled: !!slideReportId,
    staleTime: 5 * 60 * 1000,
  });

  const reportIds = slideReport?.report_ids || {};
  const filterValues = (viewData?.filter_values || {}) as Record<string, Record<string, string[]>>;

  const channels = useMemo(() => {
    if (!report) return [];
    const channelSet = new Set<string>();
    for (const block of report.blocks) {
      if (block.block_type === 'table' || block.block_type === 'kpi_cards' || block.block_type === 'chart') {
        const config = block.config as any;
        if (config.channel === 'all') {
          channelSet.add('metasearch');
          channelSet.add('sem');
          channelSet.add('social');
        } else if (config.channel) {
          channelSet.add(config.channel);
        }
      }
    }
    return Array.from(channelSet);
  }, [report]);

  const { data: allChannelData, isLoading } = useQuery({
    queryKey: ['customReportChannelData', report?.id, viewId, Object.values(reportIds).join(','), channels.join(',')],
    queryFn: async () => {
      // ── Step 1: Fetch tags for this view ──────────────────────────────────
      let viewTags: Tag[] = [];
      if (viewId) {
        const { data: tagRows } = await supabase
          .from('tags')
          .select('*')
          .eq('view_id', viewId);

        if (tagRows && tagRows.length > 0) {
          const tagIds = tagRows.map((t: any) => t.id);
          const { data: allValues } = await supabase
            .from('tag_values')
            .select('*')
            .in('tag_id', tagIds)
            .order('sort_order');
          const valueIds = (allValues || []).map((v: any) => v.id);
          let allRules: any[] = [];
          if (valueIds.length > 0) {
            const { data: rules } = await supabase
              .from('tag_rules')
              .select('*')
              .in('tag_value_id', valueIds);
            allRules = rules || [];
          }
          viewTags = tagRows.map((tag: any) => ({
            ...tag,
            tag_values: (allValues || [])
              .filter((v: any) => v.tag_id === tag.id)
              .map((v: any) => ({
                ...v,
                rules: allRules.filter((r: any) => r.tag_value_id === v.id),
              })),
          })) as Tag[];
        }
      }

      // ── Step 2: Fetch current (2026) + comparison (2025) in parallel ──────
      type ChannelResult = Record<string, { rows: Record<string, any>[]; dimMap: Record<string, string> }>;
      const result2026: ChannelResult = {};
      const result2025: ChannelResult = {};

      await Promise.all(
        channels.map(async (ch) => {
          const chReportId = reportIds[ch];
          if (!chReportId) return;

          const channelTags = viewTags.filter(
            (t) => !t.channels || t.channels.length === 0 || t.channels.includes(ch),
          );

          try {
            const [data2026, data2025] = await Promise.all([
              fetchAndEvaluateChannel(chReportId, '2026', filterValues[ch], channelTags),
              fetchAndEvaluateChannel(chReportId, '2025', filterValues[ch], channelTags),
            ]);
            result2026[ch] = data2026;
            result2025[ch] = data2025;
          } catch (e) {
            console.error(`[useCustomReportData] Failed to fetch ${ch}:`, e);
            result2026[ch] = { rows: [], dimMap: {} };
            result2025[ch] = { rows: [], dimMap: {} };
          }
        })
      );

      return { current: result2026, comparison: result2025 };
    },
    enabled: channels.length > 0 && Object.keys(reportIds).length > 0,
    staleTime: 5 * 60 * 1000,
  });

  return {
    channelData: allChannelData?.current || {},
    comparisonChannelData: allChannelData?.comparison || {},
    filterValues,
    isLoading,
  };
}

// ── processTableBlock ─────────────────────────────────────────────────────────

/**
 * Process table block: filter rows by date range, aggregate by groupBy dimension.
 * Optionally computes comparison metrics + delta %.
 */
export function processTableBlock(
  config: TableConfig,
  channelRows: Record<string, any>[],
  dimMap: Record<string, string>,
  viewFilterValues: Record<string, string[]>,
  comparisonRows?: Record<string, any>[],
  comparisonDateRange?: { from: string; to: string },
): BlockTableResult {
  const dateRange = config.dateRange
    ? { start: new Date(config.dateRange.from), end: new Date(config.dateRange.to + 'T23:59:59') }
    : undefined;

  const filtered = filterRawDataRows(channelRows, viewFilterValues || {}, dateRange, dimMap);

  // ── Current period totals ──────────────────────────────────────────────────
  const baseTotals = aggregateRowsToMetrics(filtered, dimMap);
  const derived = addCpa(calculateDerivedMetrics(baseTotals) as any, baseTotals);

  // ── Comparison period (optional) ───────────────────────────────────────────
  let comparisonTotals: Record<string, number> | undefined;
  let totalsDeltaPct: Record<string, number> | undefined;
  let compGroupMap: Map<string, Record<string, number>> | undefined;

  if (comparisonRows && comparisonDateRange) {
    const compDateRange = {
      start: new Date(comparisonDateRange.from),
      end: new Date(comparisonDateRange.to + 'T23:59:59'),
    };
    const filteredComp = filterRawDataRows(comparisonRows, viewFilterValues || {}, compDateRange, dimMap);
    const compBase = aggregateRowsToMetrics(filteredComp, dimMap);
    comparisonTotals = addCpa(calculateDerivedMetrics(compBase) as any, compBase);

    totalsDeltaPct = {};
    for (const key of Object.keys(derived)) {
      totalsDeltaPct[key] = computeDeltaPct(derived[key], (comparisonTotals as any)[key] ?? 0);
    }

    if (config.groupBy) {
      compGroupMap = new Map();
      const compGroups = new Map<string, Record<string, any>[]>();
      for (const row of filteredComp) {
        const rowData = (row.dimension_values || row) as Record<string, any>;
        const val = String(rowData[config.groupBy] ?? '(Unknown)');
        const list = compGroups.get(val) || [];
        list.push(row);
        compGroups.set(val, list);
      }
      for (const [val, rows] of compGroups) {
        const gBase = aggregateRowsToMetrics(rows, dimMap);
        const gDerived = addCpa(calculateDerivedMetrics(gBase) as any, gBase);
        compGroupMap.set(val, gDerived);
      }
    }
  }

  // ── Current period breakdown ───────────────────────────────────────────────
  if (!config.groupBy) {
    return { totals: derived, breakdownRows: [], comparisonTotals, totalsDeltaPct };
  }

  const groups = new Map<string, Record<string, any>[]>();
  for (const row of filtered) {
    const rowData = (row.dimension_values || row) as Record<string, any>;
    const val = String(rowData[config.groupBy] ?? '(Unknown)');
    const list = groups.get(val) || [];
    list.push(row);
    groups.set(val, list);
  }

  const breakdownRows: BreakdownRow[] = [];
  for (const [val, rows] of groups) {
    const gBase = aggregateRowsToMetrics(rows, dimMap);
    const gDerived = addCpa(calculateDerivedMetrics(gBase) as any, gBase);
    const compMetrics = compGroupMap?.get(val);
    const deltaPct: Record<string, number> | undefined = compMetrics
      ? Object.fromEntries(
          Object.keys(gDerived).map((k) => [k, computeDeltaPct(gDerived[k], compMetrics[k] ?? 0)])
        )
      : undefined;

    breakdownRows.push({
      dimensionValue: val,
      metrics: gDerived,
      comparisonMetrics: compMetrics,
      deltaPct,
    });
  }

  breakdownRows.sort((a, b) => (b.metrics.cost || 0) - (a.metrics.cost || 0));

  // ── Campaign-count per row (optional) ──────────────────────────────────────
  // Find a "campaign" dimension ID (case-insensitive exact match) in dimMap.
  let campaignDimId: string | undefined;
  for (const [id, name] of Object.entries(dimMap)) {
    if (typeof name === 'string' && name.toLowerCase() === 'campaign' && !id.startsWith('tag:')) {
      campaignDimId = id;
      break;
    }
  }

  let campaignCountByRow: Record<string, number> | undefined;
  if (campaignDimId && config.groupBy && config.groupBy !== campaignDimId) {
    campaignCountByRow = {};
    for (const [val, rows] of groups) {
      const seen = new Set<string>();
      for (const row of rows) {
        const rd = (row.dimension_values || row) as Record<string, any>;
        const campaign = rd[campaignDimId];
        if (campaign != null && campaign !== '') seen.add(String(campaign));
      }
      campaignCountByRow[val] = seen.size;
    }
  }

  return { totals: derived, breakdownRows, comparisonTotals, totalsDeltaPct, campaignCountByRow };
}

// ── processKpiBlock ───────────────────────────────────────────────────────────

export function processKpiBlock(
  config: KpiCardsConfig,
  allChannelData: Record<string, { rows: Record<string, any>[]; dimMap: Record<string, string> }>,
  allFilterValues: Record<string, Record<string, string[]>>,
  comparisonChannelData?: Record<string, { rows: Record<string, any>[]; dimMap: Record<string, string> }>,
  comparisonDateRange?: { from: string; to: string },
): { totals: Record<string, number>; comparisonTotals?: Record<string, number>; totalsDeltaPct?: Record<string, number> } {
  const dateRange = config.dateRange
    ? { start: new Date(config.dateRange.from), end: new Date(config.dateRange.to + 'T23:59:59') }
    : undefined;

  const totalsBase = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0, leads: 0 };
  const compBase = { impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0, leads: 0 };
  const hasComparison = !!(comparisonChannelData && comparisonDateRange);

  const channelsToAggregate = config.channel === 'all'
    ? ['metasearch', 'sem', 'social']
    : [config.channel];

  const compDateRange = hasComparison
    ? { start: new Date(comparisonDateRange!.from), end: new Date(comparisonDateRange!.to + 'T23:59:59') }
    : undefined;

  for (const ch of channelsToAggregate) {
    const chData = allChannelData[ch];
    if (chData) {
      const filtered = filterRawDataRows(chData.rows, allFilterValues[ch] || {}, dateRange, chData.dimMap);
      const chMetrics = aggregateRowsToMetrics(filtered, chData.dimMap);
      for (const k of Object.keys(totalsBase) as (keyof typeof totalsBase)[]) {
        totalsBase[k] += chMetrics[k] || 0;
      }
    }

    if (hasComparison) {
      const compChData = comparisonChannelData![ch];
      if (compChData) {
        const filteredComp = filterRawDataRows(compChData.rows, allFilterValues[ch] || {}, compDateRange, compChData.dimMap);
        const chComp = aggregateRowsToMetrics(filteredComp, compChData.dimMap);
        for (const k of Object.keys(compBase) as (keyof typeof compBase)[]) {
          compBase[k] += chComp[k] || 0;
        }
      }
    }
  }

  const derived = addCpa(calculateDerivedMetrics(totalsBase) as any, totalsBase);

  if (!hasComparison) {
    return { totals: derived };
  }

  const compDerived = addCpa(calculateDerivedMetrics(compBase) as any, compBase);
  const totalsDeltaPct: Record<string, number> = {};
  for (const key of Object.keys(derived)) {
    totalsDeltaPct[key] = computeDeltaPct(derived[key], (compDerived as any)[key] ?? 0);
  }

  return { totals: derived, comparisonTotals: compDerived, totalsDeltaPct };
}

// ── processWinnersLosersBlock ────────────────────────────────────────────────

export interface WinnerLoserRow {
  dimensionValue: string;
  currentMetrics: Record<string, number>;
  comparisonMetrics: Record<string, number>;
  /** Absolute delta (current − comparison) per metric */
  deltaAbs: Record<string, number>;
  /** % change per metric */
  deltaPct: Record<string, number>;
  /** Value of the secondary groupBy (e.g. funnel) for this row, if configured. */
  segmentValue?: string;
}

/** Per-segment summary (e.g. per-funnel) alongside the top campaigns list. */
export interface WinnersLosersSegment {
  segmentValue: string;
  winnerCount: number;
  loserCount: number;
  totalCost: number;
  totalRevenue: number;
  roas: number;
  costDeltaPct: number;
  revenueDeltaPct: number;
  roasDeltaPct: number;
}

/**
 * Compute top-3 winners and top-3 losers at the dimension (campaign) level
 * by comparing current vs comparison period metrics.
 */
export function processWinnersLosersBlock(
  config: WinnersLosersConfig,
  channelRows: Record<string, any>[],
  dimMap: Record<string, string>,
  viewFilterValues: Record<string, string[]>,
  comparisonRows: Record<string, any>[],
  comparisonDateRange: { from: string; to: string },
): { winners: WinnerLoserRow[]; losers: WinnerLoserRow[]; segments?: WinnersLosersSegment[] } {
  const dateRange = config.dateRange
    ? { start: new Date(config.dateRange.from), end: new Date(config.dateRange.to + 'T23:59:59') }
    : undefined;
  const compDR = {
    start: new Date(comparisonDateRange.from),
    end: new Date(comparisonDateRange.to + 'T23:59:59'),
  };

  const filtered = filterRawDataRows(channelRows, viewFilterValues || {}, dateRange, dimMap);
  const filteredComp = filterRawDataRows(comparisonRows, viewFilterValues || {}, compDR, dimMap);

  // Group both periods by dimension value
  function groupBy(rows: Record<string, any>[], dimKey: string) {
    const map = new Map<string, Record<string, any>[]>();
    for (const row of rows) {
      const rd = (row.dimension_values || row) as Record<string, any>;
      const val = String(rd[dimKey] ?? '(Unknown)');
      if (val === '(Unknown)' || val === '') continue;
      map.set(val, [...(map.get(val) || []), row]);
    }
    return map;
  }

  const currGroups = groupBy(filtered, config.groupBy);
  const compGroups = groupBy(filteredComp, config.groupBy);
  const allDims = new Set([...currGroups.keys(), ...compGroups.keys()]);

  // Helper: pick the dominant segment value for a dimension value by looking at the first row
  const segKey = config.secondaryGroupBy;
  function segmentFor(dim: string): string | undefined {
    if (!segKey) return undefined;
    const rows = currGroups.get(dim) || compGroups.get(dim) || [];
    for (const row of rows) {
      const rd = (row.dimension_values || row) as Record<string, any>;
      const v = rd[segKey];
      if (v != null && v !== '') return String(v);
    }
    return '(Unknown)';
  }

  const allRows: WinnerLoserRow[] = [];
  for (const dim of allDims) {
    const currBase = aggregateRowsToMetrics(currGroups.get(dim) || [], dimMap);
    const compBase = aggregateRowsToMetrics(compGroups.get(dim) || [], dimMap);
    const currMetrics = addCpa(calculateDerivedMetrics(currBase) as any, currBase);
    const compMetrics = addCpa(calculateDerivedMetrics(compBase) as any, compBase);

    const deltaAbs: Record<string, number> = {};
    const deltaPct: Record<string, number> = {};
    for (const k of Object.keys(currMetrics)) {
      deltaAbs[k] = currMetrics[k] - (compMetrics[k] ?? 0);
      deltaPct[k] = computeDeltaPct(currMetrics[k], compMetrics[k] ?? 0);
    }

    allRows.push({
      dimensionValue: dim,
      currentMetrics: currMetrics,
      comparisonMetrics: compMetrics,
      deltaAbs,
      deltaPct,
      segmentValue: segmentFor(dim),
    });
  }

  const rankKey = config.rankBy || 'revenue';
  const topN = config.topN ?? 3;
  allRows.sort((a, b) => (b.deltaAbs[rankKey] ?? 0) - (a.deltaAbs[rankKey] ?? 0));

  const winners = allRows.filter((r) => (r.deltaAbs[rankKey] ?? 0) > 0).slice(0, topN);
  const losers = allRows.filter((r) => (r.deltaAbs[rankKey] ?? 0) < 0).slice(-topN).reverse();

  // ── Segments summary (per secondary groupBy, e.g. per Funnel) ──────────────
  let segments: WinnersLosersSegment[] | undefined;
  if (segKey) {
    // Aggregate current + comparison by the secondary dim directly from raw rows
    const currBySeg = new Map<string, Record<string, any>[]>();
    const compBySeg = new Map<string, Record<string, any>[]>();
    function bucket(rows: Record<string, any>[], map: Map<string, Record<string, any>[]>) {
      for (const row of rows) {
        const rd = (row.dimension_values || row) as Record<string, any>;
        const v = String(rd[segKey] ?? '(Unknown)');
        if (v === '(Unknown)' || v === '') continue;
        map.set(v, [...(map.get(v) || []), row]);
      }
    }
    bucket(filtered, currBySeg);
    bucket(filteredComp, compBySeg);

    // Winner/loser counts per segment from the ranked allRows
    const winnerCounts = new Map<string, number>();
    const loserCounts = new Map<string, number>();
    for (const r of allRows) {
      const seg = r.segmentValue || '(Unknown)';
      if ((r.deltaAbs[rankKey] ?? 0) > 0) {
        winnerCounts.set(seg, (winnerCounts.get(seg) || 0) + 1);
      } else if ((r.deltaAbs[rankKey] ?? 0) < 0) {
        loserCounts.set(seg, (loserCounts.get(seg) || 0) + 1);
      }
    }

    const segNames = new Set([...currBySeg.keys(), ...compBySeg.keys()]);
    segments = [];
    for (const seg of segNames) {
      const currM = aggregateRowsToMetrics(currBySeg.get(seg) || [], dimMap);
      const compM = aggregateRowsToMetrics(compBySeg.get(seg) || [], dimMap);
      const roasCurr = currM.cost > 0 ? currM.revenue / currM.cost : 0;
      const roasComp = compM.cost > 0 ? compM.revenue / compM.cost : 0;
      segments.push({
        segmentValue: seg,
        winnerCount: winnerCounts.get(seg) || 0,
        loserCount: loserCounts.get(seg) || 0,
        totalCost: currM.cost,
        totalRevenue: currM.revenue,
        roas: roasCurr,
        costDeltaPct: computeDeltaPct(currM.cost, compM.cost),
        revenueDeltaPct: computeDeltaPct(currM.revenue, compM.revenue),
        roasDeltaPct: computeDeltaPct(roasCurr, roasComp),
      });
    }
    segments.sort((a, b) => b.totalCost - a.totalCost);
  }

  return { winners, losers, segments };
}
