import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openRouterApiKey = Deno.env.get('OPENROUTER_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RequestBody {
  cardId: string;
  reportData: Array<{
    reportName: string;
    rows: Array<Record<string, any>>;
  }>;
  selectedMetrics: string[];
  sinceDate: string;
  aiPrompt: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
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
    const { cardId, reportData, selectedMetrics, sinceDate, aiPrompt } = body;

    console.log('Generating AI summary for card:', cardId);
    console.log('Report data count:', reportData?.length);
    console.log('Selected metrics:', selectedMetrics);
    console.log('Since date:', sinceDate);

    if (!reportData || reportData.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No report data provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format the data for analysis
    const formattedData = reportData.map(report => {
      const rowCount = report.rows?.length || 0;
      console.log(`Report ${report.reportName}: ${rowCount} rows`);
      
      // Aggregate metrics by summing numeric values
      const aggregatedMetrics: Record<string, number> = {};
      
      report.rows?.forEach(row => {
        selectedMetrics.forEach(metric => {
          const value = parseFloat(String(row[metric] || '0').replace(/[^0-9.-]/g, ''));
          if (!isNaN(value)) {
            aggregatedMetrics[metric] = (aggregatedMetrics[metric] || 0) + value;
          }
        });
      });

      return {
        channel: report.reportName,
        rowCount,
        metrics: aggregatedMetrics,
        // Include sample rows for context (limit to avoid token overflow)
        sampleRows: report.rows?.slice(0, 10) || []
      };
    });

    // Build the data context message
    const dataContext = `
## Performance Data Summary (Since ${sinceDate})

${formattedData.map(report => `
### ${report.channel}
- Total rows: ${report.rowCount}
- Aggregated Metrics:
${Object.entries(report.metrics).map(([key, value]) => `  - ${key}: ${typeof value === 'number' ? value.toLocaleString('en-US', { maximumFractionDigits: 2 }) : value}`).join('\n')}
`).join('\n')}

## Raw Data Sample (First 10 rows per channel)
${formattedData.map(report => `
### ${report.channel}
\`\`\`json
${JSON.stringify(report.sampleRows, null, 2)}
\`\`\`
`).join('\n')}
`;

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
            content: aiPrompt
          },
          { 
            role: 'user', 
            content: `Please analyze the following performance data and generate an executive summary based on the instructions provided.\n\n${dataContext}`
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
