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
    const { cardId, pivotData, selectedMetrics, reportConfigs, aiPrompt, isTableComment } = body;

    console.log('Generating AI summary, isTableComment:', isTableComment);
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

    // Build comprehensive data context from pivot tables
    let dataContext = `# Performance Analysis Data\n\n`;
    
    // Last Month Section - Primary Focus
    dataContext += `## Last Month Performance (End of Month Results)\n\n`;
    dataContext += formatReportTable(
      pivotDataTyped.last_month, 
      pivotDataTyped.comparison_previous_period?.last_month,
      selectedMetrics,
      "Last Month vs Previous Month"
    );
    dataContext += formatReportTable(
      pivotDataTyped.last_month, 
      pivotDataTyped.comparison_previous_year?.last_month,
      selectedMetrics,
      "Last Month vs Same Month Last Year"
    );
    
    // YTM Section (Year to End of Month)
    dataContext += `## Year-to-Month (YTM) Performance\n\n`;
    dataContext += formatReportTable(
      pivotDataTyped.ytd, 
      pivotDataTyped.comparison_previous_year?.ytd,
      selectedMetrics,
      "YTM vs Same Period Last Year"
    );
    
    // Breakdown data for each report (using last_month data)
    if (pivotDataTyped.breakdown_data && Object.keys(pivotDataTyped.breakdown_data).length > 0) {
      dataContext += `## Channel Breakdown Analysis (Last Month)\n\n`;
      
      for (const [reportId, breakdown] of Object.entries(pivotDataTyped.breakdown_data)) {
        const reportConfig = reportConfigs?.[reportId];
        const dimensionName = reportConfig?.dimensionName || 'Segment';
        const reportName = pivotDataTyped.last_month?.find((r: ReportMetrics) => r.reportId === reportId)?.reportName || 'Channel';
        
        // Use last_month breakdown instead of mtd
        const typedBreakdown = breakdown as Record<DateTab, BreakdownRow[]>;
        const lastMonthBreakdown = {
          last_month: typedBreakdown.last_month,
          mtd: typedBreakdown.last_month, // Map to last_month for the formatter
          ytd: typedBreakdown.ytd
        };
        const compBreakdown = pivotDataTyped.comparison_previous_period?.breakdown_data?.[reportId];
        const lastMonthCompBreakdown = compBreakdown ? {
          last_month: compBreakdown.last_month,
          mtd: compBreakdown.last_month,
          ytd: compBreakdown.ytd
        } : undefined;
        dataContext += formatBreakdownTable(lastMonthBreakdown, lastMonthCompBreakdown, selectedMetrics, reportName, dimensionName);
      }
    }
    
    // Monthly trend data for YTM
    if (pivotDataTyped.combined_date_breakdown?.ytd && pivotDataTyped.combined_date_breakdown.ytd.length > 0) {
      dataContext += `## Monthly Trend (YTM - Combined All Channels)\n\n`;
      dataContext += "| Month | " + selectedMetrics.join(" | ") + " |\n";
      dataContext += "|-------|" + selectedMetrics.map(() => "------").join("|") + "|\n";
      
      pivotDataTyped.combined_date_breakdown.ytd.forEach((row: DateBreakdownRow) => {
        const cells = selectedMetrics.map(m => formatMetricValue(m, row.metrics[m] || 0));
        dataContext += `| ${row.dateGroup} | ${cells.join(" | ")} |\n`;
      });
      dataContext += "\n";
    }

    // Enhanced system prompt for executive summaries - focused on narrative paragraphs
    const systemPrompt = `You are an expert digital marketing analyst writing executive summaries for hotel and hospitality clients. Write in flowing paragraphs, NOT bullet lists of individual KPIs.

## CRITICAL WRITING RULES
1. **NO LISTING ALL KPIS** - Tables already show the numbers. Your job is to explain the story BEHIND the numbers.
2. **WRITE IN PARAGRAPHS** - Use narrative prose, not bullet points with metric values.
3. **GROUP KPIS BY CATEGORY** when explaining performance:
   - **Volume metrics**: Impressions, Clicks, Bookings (traffic & demand indicators)
   - **Efficiency metrics**: CTR, Conversion Rate, ROAS (performance quality)
   - **Financial metrics**: Revenue, Cost, CPC, Cost of Sale (money impact)
4. **EXPLAIN CAUSALITY** - e.g., "Revenue grew +24% driven by higher traffic (+15% clicks) combined with improved conversion rate (+16%)."
5. **ONLY MENTION RELEVANT KPIS** - Don't list every metric. Focus on what tells the story.
6. **USE BOLD for key numbers and important insights** - Make critical data stand out.

## EXAMPLE OF GOOD ANALYSIS (DO THIS):
"SEM delivered exceptional revenue growth of **+24.7%** this month, driven by a combination of improved efficiency and volume. **Conversion rates jumped +16.5%**, indicating better traffic quality, while **ROAS reached 32x** - a **+29.8% improvement**. This efficiency gain allowed the channel to generate more revenue despite a slight **-1.1% decrease in clicks**, proving that quality outweighed quantity."

## EXAMPLE OF BAD ANALYSIS (DON'T DO THIS):
"SEM Performance:
- Impressions: 521,421 (-19.4%)
- Clicks: 11,068 (-1.1%)
- Cost: $8,067.73 (-3.9%)
- Revenue: $258,335.21 (+24.7%)"

## Output Structure
Write 3-4 paragraphs covering:
1. **Overall Performance Summary** - The headline story across all channels (2-3 sentences)
2. **Channel Analysis** - For each channel, explain WHY performance changed using grouped metrics. Connect the dots between traffic, efficiency, and revenue.
3. **Year-to-Date Context** - How does monthly performance fit into the bigger picture?
4. **Key Takeaway** - One actionable insight or recommendation

${aiPrompt ? `\n## Additional Context from User\n${aiPrompt}` : ''}`;

    console.log('Calling OpenRouter API with GPT-4 Turbo...');

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
          { 
            role: 'system', 
            content: systemPrompt
          },
          { 
            role: 'user', 
            content: `Please analyze the following performance data and generate an executive summary.\n\n${dataContext}`
          }
        ],
        max_tokens: 4000,
        temperature: 0.7
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenRouter API error:', response.status, errorText);
      return new Response(
        JSON.stringify({ error: `OpenRouter API error: ${response.status}`, details: errorText }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('OpenRouter response received');

    const generatedSummary = data.choices?.[0]?.message?.content;

    if (!generatedSummary) {
      console.error('No summary generated from OpenRouter');
      return new Response(
        JSON.stringify({ error: 'No summary generated' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Summary generated successfully, length:', generatedSummary.length);

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

    const tabs = ['last_month', 'mtd', 'ytd'] as const;
    const tabLabels: Record<string, string> = {
      last_month: 'Last Month',
      mtd: 'Month to Date',
      ytd: 'Year to Date'
    };

    // Generate insights for summary table for each tab
    for (const tab of tabs) {
      const tabData = pivotDataTyped[tab] || [];
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
                { role: 'system', content: 'You are a concise marketing analyst. Provide ONE brief sentence (max 20 words) highlighting the key insight from this data. Focus on the most important trend or standout performance.' },
                { role: 'user', content: `${tabLabels[tab]} performance summary:\n${summaryContext}` }
              ],
              max_tokens: 100,
              temperature: 0.5
            }),
          });
          
          if (insightResponse.ok) {
            const insightData = await insightResponse.json();
            tableInsights.summary[tab] = insightData.choices?.[0]?.message?.content?.trim() || '';
          }
        } catch (e) {
          console.error(`Error generating summary insight for ${tab}:`, e);
        }
      }
    }

    // Generate insights for date breakdown for each tab
    for (const tab of tabs) {
      const dateData = pivotDataTyped.combined_date_breakdown?.[tab] || [];
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
                { role: 'system', content: 'You are a concise marketing analyst. Provide ONE brief sentence (max 20 words) about the time-based trend in this data. Focus on trajectory or notable periods.' },
                { role: 'user', content: `${tabLabels[tab]} ${tab === 'ytd' ? 'monthly' : 'weekly'} breakdown:\n${dateContext}` }
              ],
              max_tokens: 100,
              temperature: 0.5
            }),
          });
          
          if (insightResponse.ok) {
            const insightData = await insightResponse.json();
            tableInsights.date_breakdown[tab] = insightData.choices?.[0]?.message?.content?.trim() || '';
          }
        } catch (e) {
          console.error(`Error generating date breakdown insight for ${tab}:`, e);
        }
      }
    }

    // Generate insights for breakdown tables
    if (pivotDataTyped.breakdown_data) {
      for (const [reportId, breakdown] of Object.entries(pivotDataTyped.breakdown_data)) {
        tableInsights.breakdowns[reportId] = {};
        const reportName = pivotDataTyped.last_month?.find((r: ReportMetrics) => r.reportId === reportId)?.reportName || 'Channel';
        
        for (const tab of tabs) {
          const breakdownData = (breakdown as Record<string, BreakdownRow[]>)[tab] || [];
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
                    { role: 'system', content: 'You are a concise marketing analyst. Provide ONE brief sentence (max 20 words) about performance distribution. Mention top performer or notable pattern.' },
                    { role: 'user', content: `${reportName} ${tabLabels[tab]} breakdown:\n${breakdownContext}` }
                  ],
                  max_tokens: 100,
                  temperature: 0.5
                }),
              });
              
              if (insightResponse.ok) {
                const insightData = await insightResponse.json();
                tableInsights.breakdowns[reportId][tab] = insightData.choices?.[0]?.message?.content?.trim() || '';
              }
            } catch (e) {
              console.error(`Error generating breakdown insight for ${reportId} ${tab}:`, e);
            }
          }
        }
      }
    }

    console.log('Table insights generated');

    return new Response(
      JSON.stringify({ 
        summary: generatedSummary,
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
