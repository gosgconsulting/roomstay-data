/**
 * Get Slide Report Display Data Edge Function
 *
 * Returns display-ready channel totals, monthly data, and optional breakdowns
 * for the given filters and date so the frontend does no heavy calculation.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type ChartTimeRange = 'this_year' | 'last_12_months' | 'last_6_months' | 'last_3_months';

interface RequestBody {
  slide_report_id: string;
  filter_values?: Record<string, Record<string, string[]>>;
  selected_year: string;
  selected_month: string;
  /** When set, monthly_data is returned for this chart range. */
  chart_time_range?: ChartTimeRange | null;
  group_by_dimension_id?: string | null;
  breakdown_by_dimension_id?: string | null;
  channels?: ('metasearch' | 'sem' | 'social')[];
  comparison_type?: 'none' | 'previous_period' | 'previous_year';
}

interface MetricData {
  impressions: number;
  clicks: number;
  cost: number;
  revenue: number;
  bookings: number;
  ctr?: number;
  conversionRate?: number;
  cpc?: number;
  roas?: number;
  costOfSale?: number;
}

interface MonthlyDataPoint {
  year: number;
  month: string;
  metasearch: number;
  sem: number;
  social: number;
}

interface MonthlyChannelMetrics {
  year: number;
  month: string;
  metasearch: { cost: number; revenue: number };
  sem: { cost: number; revenue: number };
  social: { cost: number; revenue: number };
}

interface BreakdownRow {
  name: string;
  impressions: number;
  clicks: number;
  cost: number;
  revenue: number;
  bookings: number;
  cpc?: number;
  roas?: number;
  costOfSale?: number;
  [k: string]: unknown;
}

interface DisplayDataResponse {
  channel_totals: Record<string, MetricData>;
  monthly_data: MonthlyDataPoint[];
  /** Per-month per-channel cost and revenue for budget tab when using API. */
  monthly_channel_metrics?: MonthlyChannelMetrics[];
  breakdowns?: { groupBy: string; rows: BreakdownRow[]; expanded?: Record<string, BreakdownRow[]> };
  comparison_totals?: Record<string, MetricData> | null;
  has_filters: boolean;
  channels_with_filters: string[];
}

function getCorsHeaders(req?: Request): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    // Allow all headers so preflight succeeds regardless of what the client sends
    'Access-Control-Allow-Headers': '*',
  };
  if (req) {
    const requestedHeaders = req.headers.get('Access-Control-Request-Headers');
    if (requestedHeaders) {
      headers['Access-Control-Allow-Headers'] = requestedHeaders;
    }
  }
  return headers;
}

/** Decode JWT payload and return sub (user id). Gateway verifies JWT when verify_jwt is true. */
function getUserIdFromJwt(req: Request): string | null {
  const authHeader = req.headers.get('authorization');
  const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!bearer) return null;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (serviceKey && bearer === serviceKey) return null; // service role: no user id, allow and check ownership via report
  try {
    const parts = bearer.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    return payload?.sub ?? null;
  } catch {
    return null;
  }
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const d = new Date(String(value));
  return isNaN(d.getTime()) ? null : d;
}

function isWithinInterval(date: Date, interval: { start: Date; end: Date }): boolean {
  return date >= interval.start && date <= interval.end;
}

/** Return date range for the chart so monthly_data covers the selected range (e.g. last 6 months). */
function getChartDateRange(chartTimeRange: ChartTimeRange): { start: Date; end: Date } {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  let start: Date;
  if (chartTimeRange === 'this_year') {
    start = new Date(now.getFullYear(), 0, 1);
  } else if (chartTimeRange === 'last_12_months') {
    start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  } else if (chartTimeRange === 'last_6_months') {
    start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  } else if (chartTimeRange === 'last_3_months') {
    start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  } else {
    start = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  }
  return { start, end };
}

function calculateDerivedMetrics(data: { impressions: number; clicks: number; cost: number; revenue: number; bookings: number }): MetricData {
  const impressions = Number(data.impressions) || 0;
  const clicks = Number(data.clicks) || 0;
  const cost = Number(data.cost) || 0;
  const revenue = Number(data.revenue) || 0;
  const bookings = Number(data.bookings) || 0;
  const cpc = clicks > 0 ? cost / clicks : 0;
  const roas = cost > 0 ? revenue / cost : 0;
  const costOfSale = revenue > 0 ? (cost / revenue) * 100 : 0;
  return {
    impressions,
    clicks,
    cost,
    revenue,
    bookings,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    conversionRate: clicks > 0 ? (bookings / clicks) * 100 : 0,
    cpc,
    roas,
    costOfSale,
  };
}

/** Filter rows by filter_values (dimensionId -> selected values) and optional date range. */
function filterRawDataRows(
  rows: Record<string, unknown>[],
  filterValues: Record<string, string[]>,
  dateRange?: { start: Date; end: Date },
  dimensionIdToName?: Record<string, string>
): Record<string, unknown>[] {
  if (!rows?.length) return [];
  return rows.filter((row) => {
    const rowData = (row as { dimension_values?: Record<string, unknown> }).dimension_values || row;
    const r = rowData as Record<string, unknown>;

    if (dateRange) {
      let dateValue: unknown = r.Date ?? r.date ?? r.Day ?? r.day;
      if (dateValue == null) {
        for (const [, val] of Object.entries(r)) {
          if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
            dateValue = val;
            break;
          }
        }
      }
      if (dateValue) {
        const d = parseDate(dateValue);
        if (!d || !isWithinInterval(d, dateRange)) return false;
      }
    }

    for (const [dimensionId, selectedValues] of Object.entries(filterValues)) {
      if (selectedValues && selectedValues.length === 0) return false;
      if (!selectedValues) continue;
      let rowValue: unknown = r[dimensionId];
      if ((rowValue === undefined || rowValue === null) && dimensionIdToName?.[dimensionId]) {
        rowValue = r[dimensionIdToName[dimensionId]];
      }
      if (rowValue === undefined || rowValue === null) return false;
      const normalized = String(rowValue).trim();
      const allowed = new Set(selectedValues.map((v) => String(v).trim()));
      if (!allowed.has(normalized)) return false;
    }
    return true;
  });
}

/** Sum base metrics from rows using dimension_map (id -> name). Name keys: Impressions, Clicks, Cost, Revenue, Bookings. */
function aggregateFromRows(
  rows: Record<string, unknown>[],
  dimensionMap: Record<string, string>
): { impressions: number; clicks: number; cost: number; revenue: number; bookings: number } {
  const nameToId: Record<string, string> = {};
  for (const [id, name] of Object.entries(dimensionMap)) {
    if (name) nameToId[name] = id;
  }
  const get = (row: Record<string, unknown>, name: string): number => {
    const id = nameToId[name];
    const v = id != null ? row[id] : undefined;
    const fallback = row[name];
    const x = v ?? fallback;
    if (x == null) return 0;
    const n = typeof x === 'number' ? x : parseFloat(String(x).replace(/[^0-9.-]/g, ''));
    return isNaN(n) ? 0 : n;
  };
  let impressions = 0, clicks = 0, cost = 0, revenue = 0, bookings = 0;
  for (const row of rows) {
    const r = (row as { dimension_values?: Record<string, unknown> }).dimension_values || row;
    const rec = r as Record<string, unknown>;
    impressions += get(rec, 'Impressions');
    clicks += get(rec, 'Clicks');
    cost += get(rec, 'Cost');
    revenue += get(rec, 'Revenue');
    bookings += get(rec, 'Bookings');
  }
  return { impressions, clicks, cost, revenue, bookings };
}

/** Check if channel has any active filter (selected values for at least one dimension). */
function hasChannelFilters(filterValues: Record<string, string[] | undefined>): boolean {
  if (!filterValues || Object.keys(filterValues).length === 0) return false;
  for (const selected of Object.values(filterValues)) {
    if (selected && selected.length >= 0) return true;
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: getCorsHeaders(req),
    });
  }
  const cors = getCorsHeaders(req);

  const userId = getUserIdFromJwt(req);
  const bearer = req.headers.get('authorization')?.startsWith('Bearer ') ? req.headers.get('authorization')!.slice(7) : null;
  const isServiceRole = bearer === Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!userId && !isServiceRole) {
    return new Response(
      JSON.stringify({ success: false, error: 'Unauthorized' }),
      { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) {
    return new Response(
      JSON.stringify({ success: false, error: 'Server configuration error' }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ success: false, error: 'Invalid JSON body' }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }

  const {
    slide_report_id,
    filter_values = {},
    selected_year,
    selected_month,
    chart_time_range: chartTimeRange,
    group_by_dimension_id,
    breakdown_by_dimension_id,
    channels = ['metasearch', 'sem', 'social'],
    comparison_type = 'none',
  } = body;

  if (!slide_report_id) {
    return new Response(
      JSON.stringify({ success: false, error: 'slide_report_id is required' }),
      { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }

  const { data: report, error: reportError } = await supabase
    .from('slide_reports')
    .select('id, user_id, pivot_data, report_ids, configuration')
    .eq('id', slide_report_id)
    .single();

  if (reportError || !report) {
    return new Response(
      JSON.stringify({ success: false, error: reportError?.message || 'Slide report not found' }),
      { status: reportError?.code === 'PGRST116' ? 404 : 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }

  const reportUserId = report.user_id as string;
  if (!isServiceRole && userId && reportUserId !== userId) {
    return new Response(
      JSON.stringify({ success: false, error: 'Forbidden' }),
      { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }

  const pivotData = (report.pivot_data as Record<string, unknown>) || {};
  const channelsData = (pivotData.channels as Record<string, Record<string, unknown>>) || {};
  const reportIds = (report.report_ids as Record<string, string>) || {};

  const channelsWithFilters: string[] = [];
  for (const ch of channels) {
    const fv = filter_values[ch];
    if (fv && hasChannelFilters(fv)) channelsWithFilters.push(ch);
  }
  const hasFilters = channelsWithFilters.length > 0;

  const emptyMetrics = (): MetricData => ({
    impressions: 0, clicks: 0, cost: 0, revenue: 0, bookings: 0,
    ctr: 0, conversionRate: 0, cpc: 0, roas: 0, costOfSale: 0,
  });

  const channelTotals: Record<string, MetricData> = {
    metasearch: emptyMetrics(),
    sem: emptyMetrics(),
    social: emptyMetrics(),
  };

  const monthlyMap = new Map<string, { year: number; month: string; metasearch: number; sem: number; social: number }>();
  const monthlyChannelMetricsMap = new Map<string, { metasearch: { cost: number; revenue: number }; sem: { cost: number; revenue: number }; social: { cost: number; revenue: number } }>();

  if (!hasFilters) {
    for (const ch of channels) {
      const data = channelsData[ch];
      if (!data) continue;
      const current = data.current as MetricData | undefined;
      if (current) {
        channelTotals[ch] = {
          ...emptyMetrics(),
          ...current,
          ...calculateDerivedMetrics({
            impressions: current.impressions ?? 0,
            clicks: current.clicks ?? 0,
            cost: current.cost ?? 0,
            revenue: current.revenue ?? 0,
            bookings: current.bookings ?? 0,
          }),
        };
      }
      const monthly = (data.monthly as Record<string, MetricData>) || {};
      for (const [monthKey, m] of Object.entries(monthly)) {
        const [y, mo] = monthKey.split('-').map(Number);
        const monthName = MONTH_NAMES[mo - 1];
        const key = `${y}-${monthName}`;
        if (!monthlyMap.has(key)) {
          monthlyMap.set(key, { year: y, month: monthName, metasearch: 0, sem: 0, social: 0 });
        }
        const entry = monthlyMap.get(key)!;
        (entry as Record<string, number>)[ch] = m.revenue ?? 0;
        if (!monthlyChannelMetricsMap.has(key)) {
          monthlyChannelMetricsMap.set(key, {
            metasearch: { cost: 0, revenue: 0 },
            sem: { cost: 0, revenue: 0 },
            social: { cost: 0, revenue: 0 },
          });
        }
        const metricsEntry = monthlyChannelMetricsMap.get(key)!;
        (metricsEntry[ch as keyof typeof metricsEntry] as { cost: number; revenue: number }).cost = m.cost ?? 0;
        (metricsEntry[ch as keyof typeof metricsEntry] as { cost: number; revenue: number }).revenue = m.revenue ?? 0;
      }
    }
  } else {
    const yearNum = selected_year !== 'all' ? parseInt(selected_year, 10) : null;
    const monthNum = selected_month !== 'all' ? MONTH_NAMES.indexOf(selected_month) + 1 : null;
    const useChartRange = chartTimeRange && ['this_year', 'last_12_months', 'last_6_months', 'last_3_months'].includes(chartTimeRange);
    let dateRange: { start: Date; end: Date } | undefined;
    if (useChartRange) {
      dateRange = getChartDateRange(chartTimeRange as ChartTimeRange);
    } else if (yearNum != null && !isNaN(yearNum)) {
      if (monthNum != null && monthNum >= 1 && monthNum <= 12) {
        dateRange = {
          start: new Date(yearNum, monthNum - 1, 1),
          end: new Date(yearNum, monthNum, 0, 23, 59, 59),
        };
      } else {
        dateRange = {
          start: new Date(yearNum, 0, 1),
          end: new Date(yearNum, 11, 31, 23, 59, 59),
        };
      }
    }

    for (const ch of channels) {
      const fv = filter_values[ch] || {};
      if (!hasChannelFilters(fv)) {
        const data = channelsData[ch];
        const current = data?.current as MetricData | undefined;
        if (current) {
          channelTotals[ch] = {
            ...emptyMetrics(),
            ...current,
            ...calculateDerivedMetrics({
              impressions: current.impressions ?? 0,
              clicks: current.clicks ?? 0,
              cost: current.cost ?? 0,
              revenue: current.revenue ?? 0,
              bookings: current.bookings ?? 0,
            }),
          };
        }
        const monthly = (data?.monthly as Record<string, MetricData>) || {};
        for (const [monthKey, m] of Object.entries(monthly)) {
          const [y, mo] = monthKey.split('-').map(Number);
          const monthName = MONTH_NAMES[mo - 1];
          const key = `${y}-${monthName}`;
          if (!monthlyMap.has(key)) monthlyMap.set(key, { year: y, month: monthName, metasearch: 0, sem: 0, social: 0 });
          (monthlyMap.get(key)! as Record<string, number>)[ch] = m.revenue ?? 0;
          if (!monthlyChannelMetricsMap.has(key)) {
            monthlyChannelMetricsMap.set(key, { metasearch: { cost: 0, revenue: 0 }, sem: { cost: 0, revenue: 0 }, social: { cost: 0, revenue: 0 } });
          }
          const me = monthlyChannelMetricsMap.get(key)!;
          (me[ch as keyof typeof me] as { cost: number; revenue: number }).cost = m.cost ?? 0;
          (me[ch as keyof typeof me] as { cost: number; revenue: number }).revenue = m.revenue ?? 0;
        }
        continue;
      }

      const dimMap = (channelsData[ch]?.dimensionMap as Record<string, string>) || {};
      const idToName = dimMap;
      const nameToId: Record<string, string> = {};
      for (const [id, name] of Object.entries(idToName)) {
        if (name) nameToId[name] = id;
      }

      let rawRows: Record<string, unknown>[] = [];
      let query = supabase
        .from('slide_report_channel_raw_rows')
        .select('rows, dimension_map')
        .eq('slide_report_id', slide_report_id)
        .eq('channel', ch);
      if (!useChartRange && yearNum != null) {
        query = query.eq('year', yearNum);
        if (monthNum != null) query = query.eq('month', monthNum);
      }
      const { data: rawRowsData } = await query;

      if (rawRowsData?.length) {
        for (const row of rawRowsData) {
          const r = (row.rows as unknown[]) || [];
          const dm = (row.dimension_map as Record<string, string>) || {};
          rawRows = rawRows.concat(r.map((x) => ({ dimension_values: x, ...(x as object) } as Record<string, unknown>)));
          if (Object.keys(dm).length > 0 && Object.keys(idToName).length === 0) {
            Object.assign(idToName, dm);
          }
        }
      }

      if (rawRows.length === 0 && reportIds[ch]) {
        const reportId = reportIds[ch];
        const dateDimId = Object.entries(idToName).find(([, n]) => n === 'Date' || n === 'date')?.[0] ?? null;
        if (dateDimId) {
          const { data: dimRows } = await supabase.rpc('get_dimension_data_by_report_and_date', {
            p_report_id: reportId,
            p_date_dim_id: dateDimId,
            p_year: yearNum ?? new Date().getFullYear(),
            p_month: monthNum ?? null,
            p_max_rows: 50000,
          });
          const rowsFromRpc = (dimRows as unknown[]) || [];
          rawRows = rowsFromRpc.map((dv) => ({ dimension_values: dv, ...(dv as object) } as Record<string, unknown>));
        }
      }

      const filtered = filterRawDataRows(rawRows, fv, dateRange, idToName);
      const agg = aggregateFromRows(filtered, idToName);
      channelTotals[ch] = calculateDerivedMetrics(agg);

      for (const row of filtered) {
        const r = (row as { dimension_values?: Record<string, unknown> }).dimension_values || row;
        const rec = r as Record<string, unknown>;
        let dateValue: unknown = rec.Date ?? rec.date ?? rec.Day ?? rec.day;
        if (dateValue == null) {
          for (const [, val] of Object.entries(rec)) {
            if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}/.test(val)) {
              dateValue = val;
              break;
            }
          }
        }
        if (dateValue) {
          const d = parseDate(dateValue);
          if (d) {
            const y = d.getFullYear();
            const monthName = MONTH_NAMES[d.getMonth()];
            const key = `${y}-${monthName}`;
            if (!monthlyMap.has(key)) monthlyMap.set(key, { year: y, month: monthName, metasearch: 0, sem: 0, social: 0 });
            const entry = monthlyMap.get(key)!;
            const rev = Number(rec[nameToId['Revenue'] ?? 'Revenue'] ?? rec['Revenue']) || 0;
            const costVal = Number(rec[nameToId['Cost'] ?? 'Cost'] ?? rec['Cost']) || 0;
            (entry as Record<string, number>)[ch] = ((entry as Record<string, number>)[ch] || 0) + rev;
            if (!monthlyChannelMetricsMap.has(key)) {
              monthlyChannelMetricsMap.set(key, { metasearch: { cost: 0, revenue: 0 }, sem: { cost: 0, revenue: 0 }, social: { cost: 0, revenue: 0 } });
            }
            const me = monthlyChannelMetricsMap.get(key)!;
            const chEntry = me[ch as keyof typeof me] as { cost: number; revenue: number };
            chEntry.cost += costVal;
            chEntry.revenue += rev;
          }
        }
      }
    }
  }

  // When no dimension filters but year/month selected, restrict channel totals to that range (otherwise they are all-time)
  if (!hasFilters && selected_year !== 'all') {
    const y = parseInt(selected_year, 10);
    const monthNum = selected_month !== 'all' ? MONTH_NAMES.indexOf(selected_month) + 1 : null;
    if (!isNaN(y)) {
      for (const ch of channels) {
        const data = channelsData[ch];
        const monthly = (data?.monthly as Record<string, MetricData>) || {};
        let impressions = 0, clicks = 0, cost = 0, revenue = 0, bookings = 0;
        for (const [monthKey, m] of Object.entries(monthly)) {
          const parts = monthKey.split('-');
          const yr = parseInt(parts[0], 10);
          const mo = parseInt(parts[1], 10);
          if (yr !== y || isNaN(yr)) continue;
          if (monthNum != null && mo !== monthNum) continue;
          impressions += m.impressions ?? 0;
          clicks += m.clicks ?? 0;
          cost += m.cost ?? 0;
          revenue += m.revenue ?? 0;
          bookings += m.bookings ?? 0;
        }
        channelTotals[ch] = calculateDerivedMetrics({ impressions, clicks, cost, revenue, bookings });
      }
    }
  }

  let monthlyData: MonthlyDataPoint[] = Array.from(monthlyMap.values()).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return MONTH_NAMES.indexOf(a.month) - MONTH_NAMES.indexOf(b.month);
  });

  const useChartRangeForMonthly = chartTimeRange && ['this_year', 'last_12_months', 'last_6_months', 'last_3_months'].includes(chartTimeRange);
  if (useChartRangeForMonthly) {
    const chartRange = getChartDateRange(chartTimeRange as ChartTimeRange);
    monthlyData = monthlyData.filter((m) => {
      const monthDate = new Date(m.year, MONTH_NAMES.indexOf(m.month), 1);
      return monthDate >= chartRange.start && monthDate <= chartRange.end;
    });
  } else if (selected_year !== 'all') {
    const y = parseInt(selected_year, 10);
    if (!isNaN(y)) {
      monthlyData = monthlyData.filter((m) => m.year === y);
    }
    if (selected_month !== 'all') {
      const monthName = selected_month;
      monthlyData = monthlyData.filter((m) => m.month === monthName);
    }
  }

  let comparisonTotals: Record<string, MetricData> | null = null;
  if (comparison_type !== 'none') {
    comparisonTotals = { metasearch: emptyMetrics(), sem: emptyMetrics(), social: emptyMetrics() };
    for (const ch of channels) {
      const data = channelsData[ch];
      const prev = comparison_type === 'previous_period'
        ? (data?.previous_period as MetricData)
        : (data?.previous_year as MetricData);
      if (prev) {
        comparisonTotals[ch] = {
          ...emptyMetrics(),
          ...prev,
          ...calculateDerivedMetrics({
            impressions: prev.impressions ?? 0,
            clicks: prev.clicks ?? 0,
            cost: prev.cost ?? 0,
            revenue: prev.revenue ?? 0,
            bookings: prev.bookings ?? 0,
          }),
        };
      }
    }
  }

  let breakdowns: DisplayDataResponse['breakdowns'] | undefined;
  if (group_by_dimension_id && hasFilters) {
    const firstCh = channelsWithFilters[0];
    const firstDimMap = (channelsData[firstCh]?.dimensionMap as Record<string, string>) || {};
    const groupByDimName = firstDimMap[group_by_dimension_id] || group_by_dimension_id;
    const breakdownByDimId = breakdown_by_dimension_id ?? null;
    const breakdownByDimName = breakdownByDimId ? (firstDimMap[breakdownByDimId] || breakdownByDimId) : null;
    const rows: BreakdownRow[] = [];
    const byGroupAllChannels: Record<string, Record<string, unknown>[]> = {};
    const yearNumB = selected_year !== 'all' ? parseInt(selected_year, 10) : null;
    const monthNumB = selected_month !== 'all' ? MONTH_NAMES.indexOf(selected_month) + 1 : null;
    let dateRangeB: { start: Date; end: Date } | undefined;
    if (yearNumB != null && !isNaN(yearNumB)) {
      if (monthNumB != null && monthNumB >= 1 && monthNumB <= 12) {
        dateRangeB = {
          start: new Date(yearNumB, monthNumB - 1, 1),
          end: new Date(yearNumB, monthNumB, 0, 23, 59, 59),
        };
      } else {
        dateRangeB = {
          start: new Date(yearNumB, 0, 1),
          end: new Date(yearNumB, 11, 31, 23, 59, 59),
        };
      }
    }

    for (const ch of channelsWithFilters) {
      const fv = filter_values[ch] || {};
      const dimMap = (channelsData[ch]?.dimensionMap as Record<string, string>) || {};
      let queryB = supabase
        .from('slide_report_channel_raw_rows')
        .select('rows, dimension_map')
        .eq('slide_report_id', slide_report_id)
        .eq('channel', ch);
      if (yearNumB != null) {
        queryB = queryB.eq('year', yearNumB);
        if (monthNumB != null) queryB = queryB.eq('month', monthNumB);
      }
      const { data: rawRowsData } = await queryB;
      let rawRows: Record<string, unknown>[] = [];
      if (rawRowsData?.length) {
        for (const r of rawRowsData) {
          const arr = (r.rows as unknown[]) || [];
          rawRows = rawRows.concat(arr.map((x) => ({ dimension_values: x, ...(x as object) } as Record<string, unknown>)));
        }
      }
      const filtered = filterRawDataRows(rawRows, fv, dateRangeB, dimMap);
      const byGroup: Record<string, Record<string, unknown>[]> = {};
      for (const row of filtered) {
        const r = (row as { dimension_values?: Record<string, unknown> }).dimension_values || row;
        const rec = r as Record<string, unknown>;
        const val = rec[group_by_dimension_id] ?? rec[groupByDimName];
        const key = val != null && String(val).trim() !== '' ? String(val).trim() : 'Unknown';
        if (!byGroup[key]) byGroup[key] = [];
        byGroup[key].push(rec);
      }
      if (breakdownByDimId != null) {
        for (const [k, arr] of Object.entries(byGroup)) {
          if (!byGroupAllChannels[k]) byGroupAllChannels[k] = [];
          byGroupAllChannels[k].push(...arr);
        }
      }
      for (const [name, groupRows] of Object.entries(byGroup)) {
        const agg = aggregateFromRows(
          groupRows.map((r) => ({ dimension_values: r, ...r })) as Record<string, unknown>[],
          dimMap
        );
        const derived = calculateDerivedMetrics(agg);
        rows.push({
          name,
          impressions: agg.impressions,
          clicks: agg.clicks,
          cost: agg.cost,
          revenue: agg.revenue,
          bookings: agg.bookings,
          ...derived,
        });
      }
    }
    const uniqueByName = new Map<string, BreakdownRow>();
    for (const r of rows) {
      const existing = uniqueByName.get(r.name);
      if (existing) {
        existing.impressions += r.impressions;
        existing.clicks += r.clicks;
        existing.cost += r.cost;
        existing.revenue += r.revenue;
        existing.bookings += r.bookings;
      } else {
        uniqueByName.set(r.name, { ...r });
      }
    }
    const sorted = Array.from(uniqueByName.values()).sort((a, b) => b.revenue - a.revenue);
    const breakdownRows = sorted.map((r) => ({ ...r, ...calculateDerivedMetrics(r) }));

    const expanded: Record<string, BreakdownRow[]> = {};
    if (breakdownByDimId && breakdownByDimName && Object.keys(byGroupAllChannels).length > 0) {
      const firstDimMapForBreakdown = (channelsData[channelsWithFilters[0]]?.dimensionMap as Record<string, string>) || {};
      for (const [groupValue, groupRows] of Object.entries(byGroupAllChannels)) {
        const byBreakdown: Record<string, Record<string, unknown>[]> = {};
        for (const rec of groupRows) {
          const val = rec[breakdownByDimId] ?? rec[breakdownByDimName];
          const key = val != null && String(val).trim() !== '' ? String(val).trim() : 'Unknown';
          if (!byBreakdown[key]) byBreakdown[key] = [];
          byBreakdown[key].push(rec);
        }
        const expandedRows: BreakdownRow[] = [];
        for (const [breakdownName, breakdownRowsForName] of Object.entries(byBreakdown)) {
          if (breakdownName === 'Unknown') continue;
          const agg = aggregateFromRows(
            breakdownRowsForName.map((r) => ({ dimension_values: r, ...r })) as Record<string, unknown>[],
            firstDimMapForBreakdown
          );
          const derived = calculateDerivedMetrics(agg);
          expandedRows.push({
            name: breakdownName,
            impressions: agg.impressions,
            clicks: agg.clicks,
            cost: agg.cost,
            revenue: agg.revenue,
            bookings: agg.bookings,
            ...derived,
          });
        }
        expanded[groupValue] = expandedRows.sort((a, b) => b.revenue - a.revenue);
      }
    }
    breakdowns = { groupBy: groupByDimName, rows: breakdownRows, expanded: Object.keys(expanded).length > 0 ? expanded : undefined };
  } else if (group_by_dimension_id && !hasFilters) {
    const ch = channels[0];
    const data = channelsData[ch];
    const dimName = (data?.dimensionMap as Record<string, string>)?.[group_by_dimension_id] || group_by_dimension_id;
    const allBreakdowns = (data?.breakdowns as Record<string, BreakdownRow[]>) || {};
    const rows = allBreakdowns[dimName] || [];
    breakdowns = { groupBy: dimName, rows: rows.map((r) => ({ ...r, ...calculateDerivedMetrics(r) })) };
  }

  let monthlyChannelMetrics: MonthlyChannelMetrics[] = Array.from(monthlyChannelMetricsMap.entries()).map(([key, channels]) => {
    const idx = key.indexOf('-');
    const y = idx >= 0 ? parseInt(key.slice(0, idx), 10) : 0;
    const monthName = idx >= 0 ? key.slice(idx + 1) : key;
    return { year: y, month: monthName, ...channels };
  }).sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return MONTH_NAMES.indexOf(a.month) - MONTH_NAMES.indexOf(b.month);
  });

  if (selected_year !== 'all') {
    const y = parseInt(selected_year, 10);
    if (!isNaN(y)) {
      monthlyChannelMetrics = monthlyChannelMetrics.filter((m) => m.year === y);
      if (selected_month !== 'all') {
        monthlyChannelMetrics = monthlyChannelMetrics.filter((m) => m.month === selected_month);
      }
    }
  }

  const response: DisplayDataResponse = {
    channel_totals: channelTotals,
    monthly_data: monthlyData,
    monthly_channel_metrics: monthlyChannelMetrics.length ? monthlyChannelMetrics : undefined,
    breakdowns,
    comparison_totals: comparisonTotals ?? undefined,
    has_filters: hasFilters,
    channels_with_filters: channelsWithFilters,
  };

  return new Response(JSON.stringify(response), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
