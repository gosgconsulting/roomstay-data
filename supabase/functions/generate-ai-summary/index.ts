import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY') || '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';
// Using Claude Haiku - cheapest model: $1 per million input tokens, $5 per million output tokens
// Try latest model first, fallback to 3.5 if needed
const AI_MODEL = 'claude-3-5-haiku-20241022'; // Valid model name for Anthropic API
const MAX_COST_CENTS = 20; // Maximum cost per summary in cents ($0.20)

// Anthropic pricing (per million tokens)
const INPUT_COST_PER_MILLION = 1.0; // $1 per million input tokens
const OUTPUT_COST_PER_MILLION = 5.0; // $5 per million output tokens

/**
 * Estimate token count (rough approximation: 1 token ≈ 4 characters)
 * This is a conservative estimate - actual tokenization may vary
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Calculate cost in cents based on input and output tokens
 */
function calculateCost(inputTokens: number, outputTokens: number): number {
  const inputCost = (inputTokens / 1_000_000) * INPUT_COST_PER_MILLION * 100; // Convert to cents
  const outputCost = (outputTokens / 1_000_000) * OUTPUT_COST_PER_MILLION * 100; // Convert to cents
  return inputCost + outputCost;
}

/**
 * Truncate text to fit within token budget
 */
function truncateToTokenLimit(text: string, maxTokens: number): string {
  const estimatedTokens = estimateTokens(text);
  if (estimatedTokens <= maxTokens) {
    return text;
  }
  
  // Truncate to fit within budget (conservative: use 90% of budget)
  const targetTokens = Math.floor(maxTokens * 0.9);
  const targetChars = targetTokens * 4;
  return text.substring(0, targetChars) + '\n\n[Data truncated to fit cost budget]';
}

// Base CORS headers - dynamically handle requested headers
const getCorsHeaders = (req?: Request) => {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, PUT, DELETE, PATCH',
    'Access-Control-Max-Age': '86400',
  };

  // For preflight requests, echo back the requested headers
  if (req) {
    const requestedHeaders = req.headers.get('Access-Control-Request-Headers');
    if (requestedHeaders) {
      headers['Access-Control-Allow-Headers'] = requestedHeaders;
    } else {
      // Default headers if none requested
      headers['Access-Control-Allow-Headers'] = 'authorization, x-client-info, apikey, content-type, x-supabase-client-info';
    }
  } else {
    // For regular responses, include common headers
    headers['Access-Control-Allow-Headers'] = 'authorization, x-client-info, apikey, content-type, x-supabase-client-info';
  }

  return headers;
};

interface ReportMetrics {
  reportId: string;
  reportName: string;
  metrics: Record<string, number>;
}

interface BreakdownRow {
  groupValue: string;
  metrics: Record<string, number>;
}

interface DateBreakdownRow {
  dateGroup: string;
  metrics: Record<string, number>;
}

type DateTab = "last_month" | "mtd" | "ytd";

interface CachedPivotData {
  last_month: ReportMetrics[];
  mtd: ReportMetrics[];
  ytd: ReportMetrics[];
  breakdown_data?: Record<string, Record<DateTab, BreakdownRow[]>>;
  combined_date_breakdown?: Record<DateTab, DateBreakdownRow[]>;
  comparison_previous_period?: {
    last_month: ReportMetrics[];
    mtd: ReportMetrics[];
    ytd: ReportMetrics[];
    breakdown_data?: Record<string, Record<DateTab, BreakdownRow[]>>;
  };
  comparison_previous_year?: {
    last_month: ReportMetrics[];
    mtd: ReportMetrics[];
    ytd: ReportMetrics[];
    breakdown_data?: Record<string, Record<DateTab, BreakdownRow[]>>;
  };
}

interface MinimalAIData {
  view: 'overview' | 'metasearch' | 'sem' | 'social';
  period: {
    year: number;
    month: string;
    monthKey: string;
  };
  metrics: {
    [channel: string]: {
      impressions: number;
      clicks: number;
      cost: number;
      revenue: number;
      bookings: number;
      ctr: number;
      conversionRate: number;
      cpc: number;
      roas: number;
      costOfSale: number;
    };
  };
  comparison?: {
    previous_period?: {
      impressions: number;
      clicks: number;
      cost: number;
      revenue: number;
      bookings: number;
      ctr: number;
      conversionRate: number;
      cpc: number;
      roas: number;
      costOfSale: number;
    };
    previous_year?: {
      impressions: number;
      clicks: number;
      cost: number;
      revenue: number;
      bookings: number;
      ctr: number;
      conversionRate: number;
      cpc: number;
      roas: number;
      costOfSale: number;
    };
  };
}

interface RequestBody {
  cardId?: string;
  pivotData?: CachedPivotData | { tableContext: any[] };
  minimalData?: MinimalAIData;
  selectedTab?: 'overview' | 'metasearch' | 'sem' | 'social';
  selectedYear?: string;
  selectedMonth?: string;
  selectedMetrics?: string[];
  reportConfigs?: Record<string, any>;
  aiPrompt?: string;
  isTableComment?: boolean;
  comparisonType?: 'previous_period' | 'previous_year' | 'both';
}

const formatMetricValue = (metric: string, value: number): string => {
  const lowerMetric = metric.toLowerCase();
  
  if (lowerMetric.includes("rate") || lowerMetric === "ctr" || lowerMetric === "cost of sale" || lowerMetric === "cos") {
    return value.toFixed(2) + "%";
  }
  if (lowerMetric === "roas") {
    return Math.round(value) + "x";
  }
  if (lowerMetric === "cost" || lowerMetric === "revenue" || lowerMetric === "cpc" || lowerMetric === "spend") {
    return "$" + value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  }
  return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
};

const calculatePercentChange = (current: number, comparison: number): string => {
  if (comparison === 0) return current > 0 ? "+100%" : "N/A";
  const change = ((current - comparison) / Math.abs(comparison)) * 100;
  return (change >= 0 ? "+" : "") + change.toFixed(1) + "%";
};

const formatReportTable = (
  data: ReportMetrics[], 
  comparisonData: ReportMetrics[] | undefined,
  metrics: string[],
  periodLabel: string
): string => {
  if (!data || data.length === 0) return "";
  
  let table = `### ${periodLabel}\n\n`;
  table += "| Report | " + metrics.join(" | ") + " |\n";
  table += "|--------|" + metrics.map(() => "--------").join("|") + "|\n";
  
  data.forEach(report => {
    const compReport = comparisonData?.find(r => r.reportId === report.reportId);
    const cells = metrics.map(m => {
      const current = report.metrics[m] || 0;
      const formatted = formatMetricValue(m, current);
      if (compReport) {
        const comparison = compReport.metrics[m] || 0;
        const change = calculatePercentChange(current, comparison);
        return `${formatted} (${change})`;
      }
      return formatted;
    });
    table += `| ${report.reportName} | ${cells.join(" | ")} |\n`;
  });
  
  // Add totals row
  const totals: Record<string, number> = {};
  const compTotals: Record<string, number> = {};
  metrics.forEach(m => {
    totals[m] = data.reduce((sum, r) => sum + (r.metrics[m] || 0), 0);
    if (comparisonData) {
      compTotals[m] = comparisonData.reduce((sum, r) => sum + (r.metrics[m] || 0), 0);
    }
  });
  
  const totalCells = metrics.map(m => {
    const formatted = formatMetricValue(m, totals[m]);
    if (comparisonData) {
      const change = calculatePercentChange(totals[m], compTotals[m] || 0);
      return `**${formatted}** (${change})`;
    }
    return `**${formatted}**`;
  });
  table += `| **TOTAL** | ${totalCells.join(" | ")} |\n`;
  
  return table + "\n";
};

const formatBreakdownTable = (
  breakdown: Record<DateTab, BreakdownRow[]>,
  comparisonBreakdown: Record<DateTab, BreakdownRow[]> | undefined,
  metrics: string[],
  reportName: string,
  dimensionName: string
): string => {
  const mtdData = breakdown?.mtd || [];
  if (mtdData.length === 0) return "";
  
  let table = `### ${reportName} - Breakdown by ${dimensionName} (MTD)\n\n`;
  table += `| ${dimensionName} | ` + metrics.join(" | ") + " |\n";
  table += "|--------|" + metrics.map(() => "--------").join("|") + "|\n";
  
  const compMtdData = comparisonBreakdown?.mtd || [];
  
  mtdData.forEach(row => {
    const compRow = compMtdData.find(r => r.groupValue === row.groupValue);
    const cells = metrics.map(m => {
      const current = row.metrics[m] || 0;
      const formatted = formatMetricValue(m, current);
      if (compRow) {
        const comparison = compRow.metrics[m] || 0;
        const change = calculatePercentChange(current, comparison);
        return `${formatted} (${change})`;
      }
      return formatted;
    });
    table += `| ${row.groupValue} | ${cells.join(" | ")} |\n`;
  });
  
  return table + "\n";
};

/**
 * Handle AI summary generation for minimal data (single view, single month)
 */
async function handleMinimalDataSummary(
  minimalData: MinimalAIData,
  selectedTab: string | undefined,
  selectedYear: string | undefined,
  selectedMonth: string | undefined,
  comparisonType: 'previous_period' | 'previous_year' | 'both',
  aiPrompt: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const { view, period, metrics, comparison } = minimalData;
  
  // Build data context string
  let dataContext = `Performance Data for ${period.month} ${period.year}\n`;
  dataContext += `View: ${view === 'overview' ? 'Overview (All Channels)' : view.toUpperCase()}\n\n`;
  
  dataContext += "METRICS:\n";
  Object.entries(metrics).forEach(([channel, channelMetrics]) => {
    const channelLabel = channel === 'overview' ? 'Overview' : channel.toUpperCase();
    dataContext += `\n${channelLabel}:\n`;
    dataContext += `  Impressions: ${channelMetrics.impressions.toLocaleString()}\n`;
    dataContext += `  Clicks: ${channelMetrics.clicks.toLocaleString()}\n`;
    dataContext += `  Cost: $${channelMetrics.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    dataContext += `  Revenue: $${channelMetrics.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
    dataContext += `  Bookings: ${channelMetrics.bookings}\n`;
    dataContext += `  CTR: ${channelMetrics.ctr.toFixed(2)}%\n`;
    dataContext += `  Conversion Rate: ${channelMetrics.conversionRate.toFixed(2)}%\n`;
    dataContext += `  CPC: $${channelMetrics.cpc.toFixed(2)}\n`;
    dataContext += `  ROAS: ${channelMetrics.roas.toFixed(2)}x\n`;
    dataContext += `  Cost of Sale: ${channelMetrics.costOfSale.toFixed(2)}%\n`;
  });

  // Add comparison data if available
  if (comparison) {
    dataContext += "\n\nCOMPARISON DATA:\n";
    if (comparison.previous_period && (comparisonType === "previous_period" || comparisonType === "both")) {
      const comp = comparison.previous_period;
      dataContext += "\nPrevious Period:\n";
      dataContext += `  Impressions: ${comp.impressions.toLocaleString()}\n`;
      dataContext += `  Clicks: ${comp.clicks.toLocaleString()}\n`;
      dataContext += `  Cost: $${comp.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      dataContext += `  Revenue: $${comp.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      dataContext += `  Bookings: ${comp.bookings}\n`;
    }
    if (comparison.previous_year && (comparisonType === "previous_year" || comparisonType === "both")) {
      const comp = comparison.previous_year;
      dataContext += "\nPrevious Year (Same Period):\n";
      dataContext += `  Impressions: ${comp.impressions.toLocaleString()}\n`;
      dataContext += `  Clicks: ${comp.clicks.toLocaleString()}\n`;
      dataContext += `  Cost: $${comp.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      dataContext += `  Revenue: $${comp.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
      dataContext += `  Bookings: ${comp.bookings}\n`;
    }
  }

  // Build system prompt optimized for single-view, single-month analysis
  const viewLabel = view === 'overview' ? 'Overview (All Channels)' : view.toUpperCase();
  const systemPrompt = `You are an expert digital marketing analyst writing executive summaries for hotel and hospitality clients. 

## CONTEXT
You are analyzing ${viewLabel} performance data for ${period.month} ${period.year}.

${comparison ? `COMPARISON: ${comparisonType === 'both' ? 'Compare against both previous period and previous year' : comparisonType === 'previous_period' ? 'Compare against previous period' : 'Compare against same period last year'}` : 'No comparison data available.'}

## REQUIREMENTS
1. Provide a concise executive summary (3-4 paragraphs, ~200-300 words)
2. Focus on key performance indicators: Revenue, ROAS, Cost, Bookings, and efficiency metrics (CTR, Conversion Rate, CPC)
3. ${view === 'overview' ? 'Compare performance across channels (Metasearch, SEM, Social) and identify which channel is most efficient' : `Analyze ${view.toUpperCase()} channel performance in detail`}
4. ${comparison ? 'Include specific percentage changes when comparison data is available. Use +/- signs for changes.' : 'Focus on current performance without comparisons.'}
5. Provide 2-3 actionable recommendations
6. Keep the tone professional and data-driven

## OUTPUT FORMAT
- Executive Summary (2-3 paragraphs)
- Key Insights (2-3 bullet points)
- Recommendations (2-3 actionable items)

Focus on strategic insights, not just restating the numbers.`;

  const userPrompt = aiPrompt || `Please analyze the following ${viewLabel} performance data for ${period.month} ${period.year} and generate an executive summary.\n\n${dataContext}`;

  try {
    // Estimate tokens and apply cost cap
    const systemTokens = estimateTokens(systemPrompt);
    const userTokens = estimateTokens(userPrompt);
    const totalInputTokens = systemTokens + userTokens;
    
    // Max output tokens (2000 tokens ≈ $0.01, leaving ~$0.19 for input)
    const maxOutputTokens = 2000;
    // Max input tokens to stay under cost cap (conservative: ~150K tokens ≈ $0.15)
    const maxInputTokens = 150000;
    
    // Truncate if needed
    let finalSystemPrompt = systemPrompt;
    let finalUserPrompt = userPrompt;
    
    if (totalInputTokens > maxInputTokens) {
      // Truncate user prompt (data context) to fit budget
      const availableTokens = maxInputTokens - systemTokens;
      finalUserPrompt = truncateToTokenLimit(userPrompt, availableTokens);
      console.warn(`[Cost Cap] Truncated input from ${totalInputTokens} to ~${maxInputTokens} tokens`);
    }
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: maxOutputTokens,
        temperature: 0.7,
        system: finalSystemPrompt,
        messages: [
          { role: 'user', content: finalUserPrompt }
        ]
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `API error: ${response.status}` }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const summary = data.content?.[0]?.text || '';
    
    // Calculate actual cost
    const actualInputTokens = data.usage?.input_tokens || estimateTokens(finalSystemPrompt + finalUserPrompt);
    const actualOutputTokens = data.usage?.output_tokens || estimateTokens(summary);
    const actualCostCents = calculateCost(actualInputTokens, actualOutputTokens);
    
    console.log(`[Cost] Input: ${actualInputTokens} tokens ($${(actualInputTokens / 1_000_000 * INPUT_COST_PER_MILLION).toFixed(4)}), Output: ${actualOutputTokens} tokens ($${(actualOutputTokens / 1_000_000 * OUTPUT_COST_PER_MILLION).toFixed(4)}), Total: $${(actualCostCents / 100).toFixed(4)}`);
    
    if (actualCostCents > MAX_COST_CENTS) {
      console.error(`[Cost Cap] Warning: Cost exceeded cap! Actual: $${(actualCostCents / 100).toFixed(4)}, Cap: $${(MAX_COST_CENTS / 100).toFixed(2)}`);
    }

    return new Response(
      JSON.stringify({ 
        summary: summary,
        executiveSummary: summary, // For consistency with existing API
        cost: {
          inputTokens: actualInputTokens,
          outputTokens: actualOutputTokens,
          costCents: actualCostCents
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error generating minimal data summary:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to generate summary' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204,
      headers: getCorsHeaders(req) 
    });
  }

  const corsHeaders = getCorsHeaders();

  try {
    if (!anthropicApiKey) {
      console.error('ANTHROPIC_API_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'Anthropic API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: RequestBody = await req.json();
    const { 
      cardId, 
      pivotData, 
      minimalData,
      selectedTab,
      selectedYear,
      selectedMonth,
      selectedMetrics = [], 
      reportConfigs, 
      aiPrompt = '', 
      isTableComment, 
      comparisonType = 'previous_year' 
    } = body;

    console.log('Generating AI summary, isTableComment:', isTableComment, 'comparisonType:', comparisonType);
    console.log('Has minimalData:', !!minimalData, 'Has pivotData:', !!pivotData);

    // Handle minimal data path (from slide view)
    if (minimalData) {
      return handleMinimalDataSummary(minimalData, selectedTab, selectedYear, selectedMonth, comparisonType, aiPrompt, corsHeaders);
    }

    if (!pivotData) {
      return new Response(
        JSON.stringify({ error: 'No pivot data provided. Please refresh the data first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle table comment generation (shorter, focused insights)
    if (isTableComment) {
      console.log('Generating table comment...');
      
      const tableCommentPrompt = `You are a concise marketing analyst. Analyze the provided data and give exactly 2-3 bullet points with brief, actionable insights. Keep each point to one sentence. Focus on patterns, top/bottom performers, and opportunities.`;
      
      // Estimate tokens and apply cost cap
      const systemTokens = estimateTokens(tableCommentPrompt);
      const userTokens = estimateTokens(aiPrompt);
      const maxInputTokens = 150000;
      const maxOutputTokens = 500; // Shorter for table comments
      
      let finalUserPrompt = aiPrompt;
      if (systemTokens + userTokens > maxInputTokens) {
        finalUserPrompt = truncateToTokenLimit(aiPrompt, maxInputTokens - systemTokens);
      }
      
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': anthropicApiKey,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: AI_MODEL,
          max_tokens: maxOutputTokens,
          temperature: 0.5,
          system: tableCommentPrompt,
          messages: [
            { role: 'user', content: finalUserPrompt }
          ]
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Anthropic API error:', response.status, errorText);
        return new Response(
          JSON.stringify({ error: `API error: ${response.status}` }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      const comment = data.content?.[0]?.text || '';
      
      // Calculate cost
      const actualInputTokens = data.usage?.input_tokens || estimateTokens(tableCommentPrompt + finalUserPrompt);
      const actualOutputTokens = data.usage?.output_tokens || estimateTokens(comment);
      const actualCostCents = calculateCost(actualInputTokens, actualOutputTokens);
      console.log(`[Cost] Table comment - Input: ${actualInputTokens}, Output: ${actualOutputTokens}, Cost: $${(actualCostCents / 100).toFixed(4)}`);
      
      return new Response(
        JSON.stringify({ summary: comment }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Cast pivotData to CachedPivotData for the main summary generation
    const pivotDataTyped = pivotData as CachedPivotData;

    // Get current date context for accurate period references
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.toLocaleString('en-US', { month: 'long' });
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthName = lastMonth.toLocaleString('en-US', { month: 'long' });
    const lastMonthYear = lastMonth.getFullYear();
    const previousYearLastMonth = lastMonthYear - 1;

    // Get comparison context based on user selection
    const getComparisonContext = (periodKey: string) => {
      const isLastMonth = periodKey === 'last_month';
      const isMTD = periodKey === 'mtd';
      
      // Calculate previous month for "previous_period" comparison
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      const prevMonthName = prevMonth.toLocaleString('en-US', { month: 'long' });
      const prevMonthYear = prevMonth.getFullYear();
      
      if (comparisonType === 'previous_period') {
        if (isLastMonth) {
          return `Compare ${lastMonthName} ${lastMonthYear} vs ${prevMonthName} ${prevMonthYear} (the month before). 
IMPORTANT: When showing changes, say "vs ${prevMonthName}" NOT "vs ${lastMonthName} ${previousYearLastMonth}". This is a month-over-month comparison.`;
        } else if (isMTD) {
          return `Compare ${currentMonth} ${currentYear} MTD vs same days in ${lastMonthName} ${lastMonthYear}`;
        }
        return `Compare ${currentYear} YTD vs same period in ${currentYear - 1}`;
      } else if (comparisonType === 'previous_year') {
        if (isLastMonth) {
          return `Compare ${lastMonthName} ${lastMonthYear} vs ${lastMonthName} ${previousYearLastMonth} (same month last year).
IMPORTANT: When showing changes, say "vs ${lastMonthName} ${previousYearLastMonth}". This is a year-over-year comparison.`;
        } else if (isMTD) {
          return `Compare ${currentMonth} ${currentYear} MTD vs ${currentMonth} ${currentYear - 1} MTD`;
        }
        return `Compare ${currentYear} YTD vs ${currentYear - 1} YTD`;
      }
      // 'both' - include both comparisons
      if (isLastMonth) {
        return `Compare ${lastMonthName} ${lastMonthYear} vs BOTH:
- Previous Month: ${prevMonthName} ${prevMonthYear}
- Same Month Last Year: ${lastMonthName} ${previousYearLastMonth}`;
      } else if (isMTD) {
        return `Compare ${currentMonth} ${currentYear} MTD vs BOTH:
- Previous Month: same days in ${lastMonthName} ${lastMonthYear}
- Same Month Last Year: ${currentMonth} ${currentYear - 1} MTD`;
      }
      return `Compare ${currentYear} YTD vs BOTH:
- Previous Year Same Period: ${currentYear - 1} YTD
- Full Previous Year: ${currentYear - 1}`;
    };

    // System prompt for executive summaries - focused on single period analysis
    const getSystemPrompt = (periodLabel: string, periodKey: string) => {
      const isMTD = periodKey === 'mtd';
      const isLastMonth = periodKey === 'last_month';
      const comparisonContext = getComparisonContext(periodKey);
      
      const mtdForecasting = isMTD ? `
## MTD FORECASTING REQUIREMENTS
Since this is Month-to-Date data for ${currentMonth} ${currentYear}, you MUST include:
1. **Days Progress**: State how many days of data we have vs total days in the month (e.g., "With 15 days of data out of 30...")
2. **Projected Performance**: Forecast the end-of-month figures:
   - Projected Revenue by month end
   - Projected Cost/Budget consumption
   - Projected ROAS and Bookings
   - Are we on track vs previous month's final numbers?
3. **Pacing Analysis**: Is performance trending above or below the monthly run rate?

Example: "With 18 days of data (60% of the month), current revenue stands at $180K. **Projected month-end revenue is $300K**, which would represent a +15% improvement over last month's $261K."
` : '';

      const dateContext = isLastMonth ? `
## IMPORTANT DATE CONTEXT FOR LAST MONTH
- You are analyzing: ${lastMonthName} ${lastMonthYear} (the current data period)
- COMPARISON: ${comparisonContext}
- ALWAYS refer to the current period as "${lastMonthName} ${lastMonthYear}"
- Use the comparison data provided to show meaningful changes
` : isMTD ? `
## IMPORTANT DATE CONTEXT FOR MTD
- You are analyzing: ${currentMonth} ${currentYear} to date
- COMPARISON: ${comparisonContext}
` : `
## IMPORTANT DATE CONTEXT FOR YTD  
- You are analyzing: January - ${currentMonth} ${currentYear}
- COMPARISON: ${comparisonContext}
`;

      return `You are an expert digital marketing analyst writing executive summaries for hotel and hospitality clients. Write in flowing paragraphs with specific numbers inline.
${dateContext}
## CRITICAL FORMATTING RULES

### 1. ALWAYS INCLUDE NUMBERS WITH SIGNS
When mentioning any KPI, include the actual number with +/- signs for changes:
- ✅ CORRECT: "Revenue reached $258K (+24.7%) with ROAS at 32x (+29.8%)"
- ❌ WRONG: "Revenue grew significantly with improved ROAS"

### 2. BOLD USAGE - BE SELECTIVE
Only use **bold** for truly important summary phrases or key takeaways, NOT for every keyword:
- ✅ CORRECT: "SEM was **the top performer this period** with revenue of $258K (+24.7%)"
- ❌ WRONG: "SEM showed **strong** **growth** with **improved** **performance**"
Do NOT bold words like: growth, improvement, increase, decrease, strong, significant, etc.

### 3. COMPARISON FOCUS
${comparisonType === 'both' ? 'Include insights from BOTH comparisons when data is available. Show changes vs previous period AND vs same period last year.' : 
  comparisonType === 'previous_period' ? `Focus ONLY on sequential month-over-month changes. When you say "vs [period]" always use the PREVIOUS MONTH (e.g., ${lastMonthName} ${lastMonthYear} vs ${new Date(now.getFullYear(), now.getMonth() - 2, 1).toLocaleString('en-US', { month: 'long' })} ${new Date(now.getFullYear(), now.getMonth() - 2, 1).getFullYear()}). DO NOT mention the same month from last year.` :
  `Focus ONLY on year-over-year changes. When you say "vs [period]" always use the SAME MONTH LAST YEAR (e.g., ${lastMonthName} ${lastMonthYear} vs ${lastMonthName} ${previousYearLastMonth}).`}

### 4. CHANNEL SECTION FORMATTING
For channel sections, use numbered format:
- ✅ CORRECT: "**1. Metasearch**" or just "**Metasearch**"
- ❌ WRONG: "- Metasearch:" 

### 5. NUMBER COLOR HINTS
Use + prefix for positive changes and - prefix for negative changes. The UI will color them:
- "+24.7%" will show green
- "-12.3%" will show red
${mtdForecasting}
## Output Structure (FOCUSED ON ${periodLabel.toUpperCase()} ONLY)
1. **Executive Summary** - 2-3 sentences with the headline story and key numbers${isMTD ? ' including projected month-end figures' : ''}
2. **Channel Analysis** - Use "**1. Metasearch**", "**2. SEM**", "**3. Social**". Each channel gets a paragraph with numbers inline.
3. **Key Takeaway** - One actionable insight${isMTD ? ' about pacing or forecast' : ''}

${aiPrompt ? `\n## Additional Context from User\n${aiPrompt}` : ''}`;
    };

    // Helper to build data context for a specific period
    const buildPeriodContext = (
      periodData: ReportMetrics[],
      comparisonPrevPeriod: ReportMetrics[] | undefined,
      comparisonPrevYear: ReportMetrics[] | undefined,
      breakdownData: Record<string, Record<DateTab, BreakdownRow[]>> | undefined,
      compBreakdownData: Record<string, Record<DateTab, BreakdownRow[]>> | undefined,
      periodKey: DateTab,
      periodLabel: string
    ): string => {
      let context = `# ${periodLabel} Performance Analysis\n\n`;
      
      if (comparisonPrevPeriod) {
        context += formatReportTable(periodData, comparisonPrevPeriod, selectedMetrics, `${periodLabel} vs Previous Period`);
      }
      if (comparisonPrevYear) {
        context += formatReportTable(periodData, comparisonPrevYear, selectedMetrics, `${periodLabel} vs Same Period Last Year`);
      }
      if (!comparisonPrevPeriod && !comparisonPrevYear) {
        context += formatReportTable(periodData, undefined, selectedMetrics, periodLabel);
      }
      
      // Add breakdown data for this period
      if (breakdownData && Object.keys(breakdownData).length > 0) {
        context += `## Channel Breakdown Analysis\n\n`;
        for (const [reportId, breakdown] of Object.entries(breakdownData)) {
          const reportConfig = reportConfigs?.[reportId];
          const dimensionName = reportConfig?.dimensionName || 'Segment';
          const reportName = periodData?.find((r: ReportMetrics) => r.reportId === reportId)?.reportName || 'Channel';
          const typedBreakdown = breakdown as Record<DateTab, BreakdownRow[]>;
          const periodBreakdown = { last_month: typedBreakdown[periodKey], mtd: typedBreakdown[periodKey], ytd: typedBreakdown[periodKey] };
          const compBreakdown = compBreakdownData?.[reportId];
          const periodCompBreakdown = compBreakdown ? { last_month: compBreakdown[periodKey], mtd: compBreakdown[periodKey], ytd: compBreakdown[periodKey] } : undefined;
          context += formatBreakdownTable(periodBreakdown, periodCompBreakdown, selectedMetrics, reportName, dimensionName);
        }
      }
      
      return context;
    };

    const tabs: { key: DateTab; label: string }[] = [
      { key: 'last_month', label: 'Last Month' },
      { key: 'mtd', label: 'Month to Date' },
      { key: 'ytd', label: 'Year to Date' }
    ];

    const executiveSummaries: Record<string, string> = {};
    let totalCostCents = 0; // Track total cost across all API calls

    // Generate executive summary for each period
    for (const tab of tabs) {
      // Check if we've exceeded cost cap
      if (totalCostCents >= MAX_COST_CENTS) {
        console.warn(`[Cost Cap] Stopping generation - total cost ($${(totalCostCents / 100).toFixed(4)}) exceeds cap ($${(MAX_COST_CENTS / 100).toFixed(2)})`);
        break;
      }
      const periodData = pivotDataTyped[tab.key] || [];
      if (periodData.length === 0) continue;

      // Only pass the comparison data that matches the user's selection
      const compPrevPeriod = comparisonType === 'previous_year' ? undefined : pivotDataTyped.comparison_previous_period?.[tab.key];
      const compPrevYear = comparisonType === 'previous_period' ? undefined : pivotDataTyped.comparison_previous_year?.[tab.key];
      const compBreakdown = comparisonType === 'previous_year' ? undefined : pivotDataTyped.comparison_previous_period?.breakdown_data;

      const dataContext = buildPeriodContext(
        periodData,
        compPrevPeriod,
        compPrevYear,
        pivotDataTyped.breakdown_data,
        compBreakdown,
        tab.key,
        tab.label
      );

      console.log(`Generating executive summary for ${tab.label}...`);

      try {
        const systemPrompt = getSystemPrompt(tab.label, tab.key);
        const userPrompt = `Please analyze the following ${tab.label} performance data and generate an executive summary.\n\n${dataContext}`;
        
        // Estimate tokens and apply cost cap (split budget across multiple tabs)
        const systemTokens = estimateTokens(systemPrompt);
        const userTokens = estimateTokens(userPrompt);
        const maxInputTokens = 150000; // Conservative limit per tab
        const maxOutputTokens = 2000; // Limit output per tab
        
        let finalUserPrompt = userPrompt;
        if (systemTokens + userTokens > maxInputTokens) {
          finalUserPrompt = truncateToTokenLimit(userPrompt, maxInputTokens - systemTokens);
          console.warn(`[Cost Cap] Truncated ${tab.label} input from ${userTokens} to ~${maxInputTokens - systemTokens} tokens`);
        }
        
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': anthropicApiKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: AI_MODEL,
            max_tokens: maxOutputTokens,
            temperature: 0.7,
            system: systemPrompt,
            messages: [
              { role: 'user', content: finalUserPrompt }
            ]
          }),
        });

        if (response.ok) {
          const data = await response.json();
          executiveSummaries[tab.key] = data.content?.[0]?.text || '';
          
          // Calculate cost
          const actualInputTokens = data.usage?.input_tokens || estimateTokens(systemPrompt + finalUserPrompt);
          const actualOutputTokens = data.usage?.output_tokens || estimateTokens(executiveSummaries[tab.key]);
          const actualCostCents = calculateCost(actualInputTokens, actualOutputTokens);
          totalCostCents += actualCostCents;
          console.log(`[Cost] ${tab.label} summary - Input: ${actualInputTokens}, Output: ${actualOutputTokens}, Cost: $${(actualCostCents / 100).toFixed(4)}, Total: $${(totalCostCents / 100).toFixed(4)}`);
          
          if (totalCostCents >= MAX_COST_CENTS) {
            console.warn(`[Cost Cap] Reached cost cap after ${tab.label} summary`);
          }
          
          console.log(`Summary generated for ${tab.label}, length: ${executiveSummaries[tab.key].length}`);
        } else {
          const errorText = await response.text();
          console.error(`Error generating summary for ${tab.label}:`, errorText);
        }
      } catch (e) {
        console.error(`Error generating executive summary for ${tab.label}:`, e);
      }
    }

    // Generate table insights for each tab
    const tableInsights: {
      summary: Record<string, string>;
      date_breakdown: Record<string, string>;
      breakdowns: Record<string, Record<string, string>>;
    } = {
      summary: {},
      date_breakdown: {},
      breakdowns: {}
    };

    const tabLabels: Record<string, string> = {
      last_month: 'Last Month',
      mtd: 'Month to Date',
      ytd: 'Year to Date'
    };

    // Generate insights for summary table for each tab
    for (const tab of tabs) {
      // Check cost cap before generating insights
      if (totalCostCents >= MAX_COST_CENTS) {
        console.warn(`[Cost Cap] Skipping table insights - cost cap reached`);
        break;
      }
      
      const tabData = pivotDataTyped[tab.key] || [];
      if (tabData.length > 0) {
        const summaryContext = tabData.map(r => `${r.reportName}: ${selectedMetrics.map(m => `${m}=${formatMetricValue(m, r.metrics[m] || 0)}`).join(', ')}`).join('\n');
        
        // Build comparison context for insights
        const compPrevPeriod = comparisonType === 'previous_year' ? undefined : pivotDataTyped.comparison_previous_period?.[tab.key];
        const compPrevYear = comparisonType === 'previous_period' ? undefined : pivotDataTyped.comparison_previous_year?.[tab.key];
        
        let comparisonContext = '';
        if (compPrevPeriod && compPrevPeriod.length > 0) {
          comparisonContext += '\n\nComparison (Previous Period):\n' + compPrevPeriod.map(r => `${r.reportName}: ${selectedMetrics.map(m => `${m}=${formatMetricValue(m, r.metrics[m] || 0)}`).join(', ')}`).join('\n');
        }
        if (compPrevYear && compPrevYear.length > 0) {
          comparisonContext += '\n\nComparison (Same Period Last Year):\n' + compPrevYear.map(r => `${r.reportName}: ${selectedMetrics.map(m => `${m}=${formatMetricValue(m, r.metrics[m] || 0)}`).join(', ')}`).join('\n');
        }
        
        try {
          const systemPrompt = `You are a senior digital marketing strategist providing performance analysis. The data in the table is self-explanatory, so DO NOT simply restate the numbers. Instead, provide strategic insights about:

- WHY certain channels are performing better or worse
- WHAT actions should be taken based on the performance patterns
- HOW the current performance compares to expectations or benchmarks
- STRATEGIC recommendations for budget allocation or optimization

Provide exactly 3 insights formatted as bullet points (use "•" character). Each insight should be 2-3 sentences (40-60 words) with specific reasoning and actionable recommendations.

Format each insight as:
• **[Category]:** [Your detailed insight with strategic reasoning and recommended actions]

Categories to use: "Channel Strategy", "Budget Optimization", "Performance Gap", "Efficiency Analysis", "Growth Opportunity", "Risk Alert"

${comparisonType !== 'previous_year' ? 'Include month-over-month momentum analysis when comparison data is available.' : ''}
${comparisonType !== 'previous_period' ? 'Include year-over-year trend analysis when comparison data is available.' : ''}

Use +/- signs when mentioning percentage changes. Focus on strategic implications, not just restating the data.`;
          
          const userContent = `${tabLabels[tab.key]} performance by channel:\n${summaryContext}${comparisonContext}`;
          
          // Apply cost cap (smaller budget for table insights)
          const systemTokens = estimateTokens(systemPrompt);
          const userTokens = estimateTokens(userContent);
          const maxInputTokens = 50000; // Smaller limit for insights
          const maxOutputTokens = 600;
          
          let finalUserContent = userContent;
          if (systemTokens + userTokens > maxInputTokens) {
            finalUserContent = truncateToTokenLimit(userContent, maxInputTokens - systemTokens);
          }
          
          const insightResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': anthropicApiKey,
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: AI_MODEL,
              max_tokens: maxOutputTokens,
              temperature: 0.6,
              system: systemPrompt,
              messages: [
                { role: 'user', content: finalUserContent }
              ]
            }),
          });
          
          if (insightResponse.ok) {
            const insightData = await insightResponse.json();
            tableInsights.summary[tab.key] = insightData.content?.[0]?.text?.trim() || '';
            
            // Log cost and track total
            const actualInputTokens = insightData.usage?.input_tokens || estimateTokens(systemPrompt + finalUserContent);
            const actualOutputTokens = insightData.usage?.output_tokens || estimateTokens(tableInsights.summary[tab.key]);
            const actualCostCents = calculateCost(actualInputTokens, actualOutputTokens);
            totalCostCents += actualCostCents;
            console.log(`[Cost] ${tab.key} table insight - Input: ${actualInputTokens}, Output: ${actualOutputTokens}, Cost: $${(actualCostCents / 100).toFixed(4)}, Total: $${(totalCostCents / 100).toFixed(4)}`);
            
            if (totalCostCents >= MAX_COST_CENTS) {
              console.warn(`[Cost Cap] Reached cost cap after ${tab.key} table insight`);
            }
          } else {
            console.error(`Error generating summary insight for ${tab.key}:`, await insightResponse.text());
          }
        } catch (e) {
          console.error(`Error generating summary insight for ${tab.key}:`, e);
        }
      }
    }

    // Generate insights for date breakdown for each tab
    for (const tab of tabs) {
      // Check cost cap
      if (totalCostCents >= MAX_COST_CENTS) {
        console.warn(`[Cost Cap] Skipping date breakdown insights - cost cap reached`);
        break;
      }
      
      const dateData = pivotDataTyped.combined_date_breakdown?.[tab.key] || [];
      if (dateData.length > 0) {
        const dateContext = dateData.slice(0, 8).map(r => `${r.dateGroup}: ${selectedMetrics.map(m => `${m}=${formatMetricValue(m, r.metrics[m] || 0)}`).join(', ')}`).join('\n');
        
        const periodType = tab.key === 'ytd' ? 'monthly' : 'weekly';
        
        try {
          const systemPrompt = `You are a senior digital marketing strategist analyzing ${periodType} performance trends. The data in the table shows ${periodType} breakdowns - do NOT simply restate these numbers. Instead, provide strategic insights about:

- TREND PATTERNS: Is performance accelerating, decelerating, or stabilizing? What does the trajectory suggest?
- SEASONALITY: Are there patterns that align with typical hospitality/travel seasonality or market events?
- PACING: Is current performance on track with monthly/quarterly goals?
- INFLECTION POINTS: What caused significant changes between periods?

Provide exactly 3 insights formatted as bullet points (use "•" character). Each insight should be 2-3 sentences (40-60 words) with specific reasoning about the trends.

Format each insight as:
• **[Category]:** [Your detailed insight with trend analysis and implications]

Categories to use: "Trend Analysis", "Pacing Alert", "Seasonality Pattern", "Momentum Shift", "Forecast Implication", "Week-over-Week Insight"

Focus on the story the data tells about performance trajectory, not just restating the ${periodType} numbers.`;
          
          const userContent = `${tabLabels[tab.key]} ${periodType} breakdown:\n${dateContext}`;
          
          // Apply cost cap
          const systemTokens = estimateTokens(systemPrompt);
          const userTokens = estimateTokens(userContent);
          const maxInputTokens = 50000;
          const maxOutputTokens = 600;
          
          let finalUserContent = userContent;
          if (systemTokens + userTokens > maxInputTokens) {
            finalUserContent = truncateToTokenLimit(userContent, maxInputTokens - systemTokens);
          }
          
          const insightResponse = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'x-api-key': anthropicApiKey,
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: AI_MODEL,
              max_tokens: maxOutputTokens,
              temperature: 0.6,
              system: systemPrompt,
              messages: [
                { role: 'user', content: finalUserContent }
              ]
            }),
          });
          
          if (insightResponse.ok) {
            const insightData = await insightResponse.json();
            tableInsights.date_breakdown[tab.key] = insightData.content?.[0]?.text?.trim() || '';
            
            // Log cost and track total
            const actualInputTokens = insightData.usage?.input_tokens || estimateTokens(systemPrompt + finalUserContent);
            const actualOutputTokens = insightData.usage?.output_tokens || estimateTokens(tableInsights.date_breakdown[tab.key]);
            const actualCostCents = calculateCost(actualInputTokens, actualOutputTokens);
            totalCostCents += actualCostCents;
            console.log(`[Cost] ${tab.key} date breakdown insight - Input: ${actualInputTokens}, Output: ${actualOutputTokens}, Cost: $${(actualCostCents / 100).toFixed(4)}, Total: $${(totalCostCents / 100).toFixed(4)}`);
            
            if (totalCostCents >= MAX_COST_CENTS) {
              console.warn(`[Cost Cap] Reached cost cap after ${tab.key} date breakdown insight`);
            }
          } else {
            console.error(`Error generating date breakdown insight for ${tab.key}:`, await insightResponse.text());
          }
        } catch (e) {
          console.error(`Error generating date breakdown insight for ${tab.key}:`, e);
        }
      }
    }

    // Generate insights for breakdown tables
    if (pivotDataTyped.breakdown_data) {
      const breakdownDimensionNames = (pivotDataTyped as any).breakdown_dimension_names || {};
      
      for (const [breakdownKey, breakdown] of Object.entries(pivotDataTyped.breakdown_data)) {
        // Check cost cap before processing breakdowns
        if (totalCostCents >= MAX_COST_CENTS) {
          console.warn(`[Cost Cap] Skipping breakdown insights - cost cap reached`);
          break;
        }
        
        tableInsights.breakdowns[breakdownKey] = {};
        
        // Parse the breakdown key - it can be "reportId_dimensionId" (new format) or just "reportId" (legacy)
        const keyParts = breakdownKey.split('_');
        const reportId = keyParts.length >= 2 && keyParts[0].length === 36 
          ? keyParts[0]  // UUID format for reportId
          : breakdownKey; // Legacy: entire key is reportId
        
        const reportName = pivotDataTyped.last_month?.find((r: ReportMetrics) => r.reportId === reportId)?.reportName || 'Channel';
        const dimensionName = breakdownDimensionNames[breakdownKey] || breakdownDimensionNames[reportId] || reportConfigs?.[reportId]?.dimensionName || 'Segment';
        
        // Get comparison breakdown data - try both key formats
        const compBreakdownPrevPeriod = comparisonType === 'previous_year' ? undefined : 
          (pivotDataTyped.comparison_previous_period?.breakdown_data?.[breakdownKey] || 
           pivotDataTyped.comparison_previous_period?.breakdown_data?.[reportId]);
        const compBreakdownPrevYear = comparisonType === 'previous_period' ? undefined : 
          (pivotDataTyped.comparison_previous_year?.breakdown_data?.[breakdownKey] ||
           pivotDataTyped.comparison_previous_year?.breakdown_data?.[reportId]);
        
        for (const tab of tabs) {
          // Check cost cap for each tab
          if (totalCostCents >= MAX_COST_CENTS) {
            break;
          }
          const breakdownData = (breakdown as Record<string, BreakdownRow[]>)[tab.key] || [];
          if (breakdownData.length > 0) {
            const breakdownContext = breakdownData.slice(0, 8).map(r => `${r.groupValue}: ${selectedMetrics.map(m => `${m}=${formatMetricValue(m, r.metrics[m] || 0)}`).join(', ')}`).join('\n');
            
            // Build comparison context for breakdown insights
            let compContext = '';
            if (compBreakdownPrevPeriod) {
              const compData = (compBreakdownPrevPeriod as Record<string, BreakdownRow[]>)[tab.key] || [];
              if (compData.length > 0) {
                compContext += '\n\nComparison (Previous Period):\n' + compData.slice(0, 8).map(r => `${r.groupValue}: ${selectedMetrics.map(m => `${m}=${formatMetricValue(m, r.metrics[m] || 0)}`).join(', ')}`).join('\n');
              }
            }
            if (compBreakdownPrevYear) {
              const compData = (compBreakdownPrevYear as Record<string, BreakdownRow[]>)[tab.key] || [];
              if (compData.length > 0) {
                compContext += '\n\nComparison (Same Period Last Year):\n' + compData.slice(0, 8).map(r => `${r.groupValue}: ${selectedMetrics.map(m => `${m}=${formatMetricValue(m, r.metrics[m] || 0)}`).join(', ')}`).join('\n');
              }
            }
            
            try {
              const systemPrompt = `You are a senior digital marketing strategist analyzing ${reportName} performance by ${dimensionName}. The data shows breakdown by ${dimensionName} - do NOT simply restate these numbers. Instead, provide strategic insights about:

- PORTFOLIO ANALYSIS: Which ${dimensionName.toLowerCase()}s are carrying the performance? Is there concentration risk?
- EFFICIENCY GAPS: Where is budget being under or over-utilized relative to returns?
- OPTIMIZATION OPPORTUNITIES: Which ${dimensionName.toLowerCase()}s should receive more/less investment?
- COMPETITIVE POSITIONING: What do the performance differences suggest about market dynamics?

${compContext ? `Use the comparison data to identify:
- Which ${dimensionName.toLowerCase()}s are gaining or losing momentum
- Where year-over-year or period-over-period changes indicate strategic shifts needed` : ''}

Provide exactly 3 insights formatted as bullet points (use "•" character). Each insight should be 2-3 sentences (40-60 words) with specific strategic recommendations.

Format each insight as:
• **[Category]:** [Your detailed insight with strategic reasoning and actionable recommendations]

Categories to use: "Portfolio Optimization", "Investment Reallocation", "Efficiency Gap", "Scale Opportunity", "Underperformer Alert", "Market Signal"

Focus on actionable strategy, not restating the breakdown numbers.`;
              
              const userContent = `${reportName} ${tabLabels[tab.key]} breakdown by ${dimensionName}:\n${breakdownContext}${compContext}`;
              
              // Apply cost cap
              const systemTokens = estimateTokens(systemPrompt);
              const userTokens = estimateTokens(userContent);
              const maxInputTokens = 50000;
              const maxOutputTokens = 600;
              
              let finalUserContent = userContent;
              if (systemTokens + userTokens > maxInputTokens) {
                finalUserContent = truncateToTokenLimit(userContent, maxInputTokens - systemTokens);
              }
              
              const insightResponse = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                  'x-api-key': anthropicApiKey,
                  'anthropic-version': '2023-06-01',
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  model: AI_MODEL,
                  max_tokens: maxOutputTokens,
                  temperature: 0.6,
                  system: systemPrompt,
                  messages: [
                    { role: 'user', content: finalUserContent }
                  ]
                }),
              });
              
              if (insightResponse.ok) {
                const insightData = await insightResponse.json();
                tableInsights.breakdowns[breakdownKey][tab.key] = insightData.content?.[0]?.text?.trim() || '';
                
                // Log cost and track total
                const actualInputTokens = insightData.usage?.input_tokens || estimateTokens(systemPrompt + finalUserContent);
                const actualOutputTokens = insightData.usage?.output_tokens || estimateTokens(tableInsights.breakdowns[breakdownKey][tab.key]);
                const actualCostCents = calculateCost(actualInputTokens, actualOutputTokens);
                totalCostCents += actualCostCents;
                console.log(`[Cost] ${breakdownKey} ${tab.key} breakdown insight - Input: ${actualInputTokens}, Output: ${actualOutputTokens}, Cost: $${(actualCostCents / 100).toFixed(4)}, Total: $${(totalCostCents / 100).toFixed(4)}`);
                
                if (totalCostCents >= MAX_COST_CENTS) {
                  console.warn(`[Cost Cap] Reached cost cap after ${breakdownKey} ${tab.key} breakdown insight`);
                }
              } else {
                console.error(`Error generating breakdown insight for ${breakdownKey} ${tab.key}:`, await insightResponse.text());
              }
            } catch (e) {
              console.error(`Error generating breakdown insight for ${breakdownKey} ${tab.key}:`, e);
            }
          }
        }
      }
    }

    console.log(`[Cost] Total cost for all summaries: $${(totalCostCents / 100).toFixed(4)} (cap: $${(MAX_COST_CENTS / 100).toFixed(2)})`);
    
    if (totalCostCents > MAX_COST_CENTS) {
      console.warn(`[Cost Cap] WARNING: Total cost ($${(totalCostCents / 100).toFixed(4)}) exceeded cap ($${(MAX_COST_CENTS / 100).toFixed(2)})`);
    }

    return new Response(
      JSON.stringify({ 
        summary: executiveSummaries.last_month || '', // Backwards compatibility
        executiveSummaries, // New: { last_month, mtd, ytd }
        tableInsights,
        cardId,
        totalCost: {
          costCents: totalCostCents,
          costDollars: (totalCostCents / 100).toFixed(4)
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in generate-ai-summary function:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
