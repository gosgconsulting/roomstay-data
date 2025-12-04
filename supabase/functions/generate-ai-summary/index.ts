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
  cardId: string;
  pivotData: CachedPivotData;
  selectedMetrics: string[];
  reportConfigs?: Record<string, any>;
  aiPrompt: string;
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
    const { cardId, pivotData, selectedMetrics, reportConfigs, aiPrompt } = body;

    console.log('Generating AI summary for card:', cardId);
    console.log('Selected metrics:', selectedMetrics);

    if (!pivotData) {
      return new Response(
        JSON.stringify({ error: 'No pivot data provided. Please refresh the data first.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build comprehensive data context from pivot tables
    let dataContext = `# Performance Analysis Data\n\n`;
    
    // Last Month Section - Primary Focus
    dataContext += `## Last Month Performance (End of Month Results)\n\n`;
    dataContext += formatReportTable(
      pivotData.last_month, 
      pivotData.comparison_previous_period?.last_month,
      selectedMetrics,
      "Last Month vs Previous Month"
    );
    dataContext += formatReportTable(
      pivotData.last_month, 
      pivotData.comparison_previous_year?.last_month,
      selectedMetrics,
      "Last Month vs Same Month Last Year"
    );
    
    // YTM Section (Year to End of Month)
    dataContext += `## Year-to-Month (YTM) Performance\n\n`;
    dataContext += formatReportTable(
      pivotData.ytd, 
      pivotData.comparison_previous_year?.ytd,
      selectedMetrics,
      "YTM vs Same Period Last Year"
    );
    
    // Breakdown data for each report (using last_month data)
    if (pivotData.breakdown_data && Object.keys(pivotData.breakdown_data).length > 0) {
      dataContext += `## Channel Breakdown Analysis (Last Month)\n\n`;
      
      for (const [reportId, breakdown] of Object.entries(pivotData.breakdown_data)) {
        const reportConfig = reportConfigs?.[reportId];
        const dimensionName = reportConfig?.dimensionName || 'Segment';
        const reportName = pivotData.last_month?.find(r => r.reportId === reportId)?.reportName || 'Channel';
        
        // Use last_month breakdown instead of mtd
        const lastMonthBreakdown = {
          last_month: breakdown.last_month,
          mtd: breakdown.last_month, // Map to last_month for the formatter
          ytd: breakdown.ytd
        };
        const compBreakdown = pivotData.comparison_previous_period?.breakdown_data?.[reportId];
        const lastMonthCompBreakdown = compBreakdown ? {
          last_month: compBreakdown.last_month,
          mtd: compBreakdown.last_month,
          ytd: compBreakdown.ytd
        } : undefined;
        dataContext += formatBreakdownTable(lastMonthBreakdown, lastMonthCompBreakdown, selectedMetrics, reportName, dimensionName);
      }
    }
    
    // Monthly trend data for YTM
    if (pivotData.combined_date_breakdown?.ytd && pivotData.combined_date_breakdown.ytd.length > 0) {
      dataContext += `## Monthly Trend (YTM - Combined All Channels)\n\n`;
      dataContext += "| Month | " + selectedMetrics.join(" | ") + " |\n";
      dataContext += "|-------|" + selectedMetrics.map(() => "------").join("|") + "|\n";
      
      pivotData.combined_date_breakdown.ytd.forEach(row => {
        const cells = selectedMetrics.map(m => formatMetricValue(m, row.metrics[m] || 0));
        dataContext += `| ${row.dateGroup} | ${cells.join(" | ")} |\n`;
      });
      dataContext += "\n";
    }

    // Enhanced system prompt for executive summaries - focused on End of Month reporting
    const systemPrompt = `You are an expert digital marketing analyst providing end-of-month executive summaries for hotel and hospitality clients. Your analysis should be strategic, actionable, and focused on business impact.

## Your Role
- Provide clear, concise executive summaries based on completed month performance data
- Focus on insights that matter to senior stakeholders and decision-makers
- Highlight both wins and areas requiring attention
- Consider seasonality and industry trends in hospitality
- This report is for client delivery, so be professional and clear

## Analysis Guidelines
1. **Start with the headline**: What's the most important insight from last month?
2. **Compare periods intelligently**: 
   - Last Month vs Previous Month for recent trends
   - Last Month vs Same Month Last Year for YoY comparison
   - YTM (Year to Month) vs Same Period Last Year for cumulative performance
3. **Identify patterns**: Look for consistent trends across channels
4. **Prioritize by impact**: Focus on metrics that affect revenue and ROI most
5. **Be specific**: Use actual numbers and percentages from the data

## Key Metrics Interpretation
- **ROAS**: Target typically 10x+ for profitable campaigns
- **Cost of Sale (COS)**: Lower is better, typically target <15%
- **CTR**: Varies by channel (Metasearch ~5%, SEM ~3%, Social ~1%)
- **Conversion Rate**: Industry benchmark ~3-5%
- **CPC**: Monitor for cost efficiency

## Output Format
Structure your response as follows:
1. **Executive Summary** (2-3 sentences capturing the key story of the month)
2. **Last Month Highlights by Channel** (bullet points per channel with key metrics)
3. **Year-to-Date Progress** (how cumulative performance compares to last year)
4. **Key Trends & Insights** (what's improving, what needs attention)
5. **Recommendations for Next Month** (specific, actionable next steps)

${aiPrompt ? `\n## Additional Instructions from User\n${aiPrompt}` : ''}`;

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

    return new Response(
      JSON.stringify({ 
        summary: generatedSummary,
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
