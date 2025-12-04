import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

interface RequestBody {
  cardId?: string;
  pivotData: CachedPivotData | { tableContext: any[] };
  selectedMetrics: string[];
  reportConfigs?: Record<string, any>;
  aiPrompt: string;
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!openRouterApiKey) {
      console.error('OPENROUTER_API_KEY is not configured');
      return new Response(
        JSON.stringify({ error: 'OpenRouter API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: RequestBody = await req.json();
    const { cardId, pivotData, selectedMetrics, reportConfigs, aiPrompt, isTableComment, comparisonType = 'previous_year' } = body;

    console.log('Generating AI summary, isTableComment:', isTableComment, 'comparisonType:', comparisonType);
    console.log('Selected metrics:', selectedMetrics);

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
      
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openRouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://lovable.dev',
          'X-Title': 'AI Table Comments'
        },
        body: JSON.stringify({
          model: 'openai/gpt-4-turbo',
          messages: [
            { role: 'system', content: tableCommentPrompt },
            { role: 'user', content: aiPrompt }
          ],
          max_tokens: 500,
          temperature: 0.5
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('OpenRouter API error:', response.status, errorText);
        return new Response(
          JSON.stringify({ error: `API error: ${response.status}` }),
          { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      const comment = data.choices?.[0]?.message?.content || '';
      
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

    // Generate executive summary for each period
    for (const tab of tabs) {
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
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openRouterApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://lovable.dev',
            'X-Title': 'AI Summary Generator'
          },
          body: JSON.stringify({
            model: 'openai/gpt-4-turbo',
            messages: [
              { role: 'system', content: getSystemPrompt(tab.label, tab.key) },
              { role: 'user', content: `Please analyze the following ${tab.label} performance data and generate an executive summary.\n\n${dataContext}` }
            ],
            max_tokens: 2500,
            temperature: 0.7
          }),
        });

        if (response.ok) {
          const data = await response.json();
          executiveSummaries[tab.key] = data.choices?.[0]?.message?.content || '';
          console.log(`Summary generated for ${tab.label}, length: ${executiveSummaries[tab.key].length}`);
        } else {
          console.error(`Error generating summary for ${tab.label}:`, await response.text());
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
      const tabData = pivotDataTyped[tab.key] || [];
      if (tabData.length > 0) {
        const summaryContext = tabData.map(r => `${r.reportName}: ${selectedMetrics.map(m => `${m}=${formatMetricValue(m, r.metrics[m] || 0)}`).join(', ')}`).join('\n');
        
        try {
          const insightResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openRouterApiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://lovable.dev',
              'X-Title': 'AI Table Insights'
            },
            body: JSON.stringify({
              model: 'openai/gpt-4-turbo',
              messages: [
                { role: 'system', content: `You are a concise marketing analyst. Provide exactly 3 brief insights (one sentence each, max 15 words each), formatted as:
1. **Performance**: [Revenue/Cost/ROAS/Bookings insight with numbers]
2. **Visibility**: [Impressions/Clicks/CTR/Brand awareness insight with numbers]  
3. **Highlight**: [Best or worst performer with specific numbers]

Use +/- signs for changes. Keep it factual with actual numbers from the data.` },
                { role: 'user', content: `${tabLabels[tab.key]} performance summary:\n${summaryContext}` }
              ],
              max_tokens: 200,
              temperature: 0.5
            }),
          });
          
          if (insightResponse.ok) {
            const insightData = await insightResponse.json();
            tableInsights.summary[tab.key] = insightData.choices?.[0]?.message?.content?.trim() || '';
          }
        } catch (e) {
          console.error(`Error generating summary insight for ${tab.key}:`, e);
        }
      }
    }

    // Generate insights for date breakdown for each tab
    for (const tab of tabs) {
      const dateData = pivotDataTyped.combined_date_breakdown?.[tab.key] || [];
      if (dateData.length > 0) {
        const dateContext = dateData.slice(0, 5).map(r => `${r.dateGroup}: ${selectedMetrics.slice(0, 3).map(m => `${m}=${formatMetricValue(m, r.metrics[m] || 0)}`).join(', ')}`).join('\n');
        
        try {
          const insightResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openRouterApiKey}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://lovable.dev',
              'X-Title': 'AI Table Insights'
            },
            body: JSON.stringify({
              model: 'openai/gpt-4-turbo',
              messages: [
                { role: 'system', content: `You are a concise marketing analyst. Provide exactly 3 brief insights (one sentence each, max 15 words each), formatted as:
1. **Performance**: [Revenue/Cost trend over time with specific numbers]
2. **Visibility**: [Traffic/impressions trend with specific numbers]
3. **Highlight**: [Best or worst performing period with numbers]

Use +/- signs for changes. Be factual with actual numbers.` },
                { role: 'user', content: `${tabLabels[tab.key]} ${tab.key === 'ytd' ? 'monthly' : 'weekly'} breakdown:\n${dateContext}` }
              ],
              max_tokens: 200,
              temperature: 0.5
            }),
          });
          
          if (insightResponse.ok) {
            const insightData = await insightResponse.json();
            tableInsights.date_breakdown[tab.key] = insightData.choices?.[0]?.message?.content?.trim() || '';
          }
        } catch (e) {
          console.error(`Error generating date breakdown insight for ${tab.key}:`, e);
        }
      }
    }

    // Generate insights for breakdown tables
    if (pivotDataTyped.breakdown_data) {
      for (const [reportId, breakdown] of Object.entries(pivotDataTyped.breakdown_data)) {
        tableInsights.breakdowns[reportId] = {};
        const reportName = pivotDataTyped.last_month?.find((r: ReportMetrics) => r.reportId === reportId)?.reportName || 'Channel';
        
        for (const tab of tabs) {
          const breakdownData = (breakdown as Record<string, BreakdownRow[]>)[tab.key] || [];
          if (breakdownData.length > 0) {
            const breakdownContext = breakdownData.slice(0, 5).map(r => `${r.groupValue}: ${selectedMetrics.slice(0, 3).map(m => `${m}=${formatMetricValue(m, r.metrics[m] || 0)}`).join(', ')}`).join('\n');
            
            try {
              const insightResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${openRouterApiKey}`,
                  'Content-Type': 'application/json',
                  'HTTP-Referer': 'https://lovable.dev',
                  'X-Title': 'AI Table Insights'
                },
                body: JSON.stringify({
                  model: 'openai/gpt-4-turbo',
                  messages: [
                    { role: 'system', content: `You are a concise marketing analyst. Provide exactly 3 brief insights (one sentence each, max 15 words each), formatted as:
1. **Performance**: [Revenue/ROAS/Bookings insight for this breakdown with numbers]
2. **Visibility**: [Traffic/clicks distribution insight with numbers]
3. **Highlight**: [Best or worst performer in this breakdown with numbers]

Use +/- signs for changes. Be factual with actual numbers.` },
                    { role: 'user', content: `${reportName} ${tabLabels[tab.key]} breakdown:\n${breakdownContext}` }
                  ],
                  max_tokens: 200,
                  temperature: 0.5
                }),
              });
              
              if (insightResponse.ok) {
                const insightData = await insightResponse.json();
                tableInsights.breakdowns[reportId][tab.key] = insightData.choices?.[0]?.message?.content?.trim() || '';
              }
            } catch (e) {
              console.error(`Error generating breakdown insight for ${reportId} ${tab.key}:`, e);
            }
          }
        }
      }
    }

    console.log('All summaries and table insights generated');

    return new Response(
      JSON.stringify({ 
        summary: executiveSummaries.last_month || '', // Backwards compatibility
        executiveSummaries, // New: { last_month, mtd, ytd }
        tableInsights,
        cardId
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
