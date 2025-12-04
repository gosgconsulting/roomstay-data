import React from "react";

interface FormattedAISummaryProps {
  summary: string;
}

interface ChannelMetrics {
  channel: string;
  metrics: { name: string; value: string; change: string | null }[];
}

const FormattedAISummary: React.FC<FormattedAISummaryProps> = ({ summary }) => {
  const parseAndFormat = (text: string) => {
    const lines = text.split("\n");
    const elements: React.ReactNode[] = [];
    let keyIndex = 0;
    let currentChannel: ChannelMetrics | null = null;
    let channelMetrics: ChannelMetrics[] = [];
    let inGlobalResults = false;

    const flushChannelMetrics = () => {
      if (currentChannel && currentChannel.metrics.length > 0) {
        channelMetrics.push(currentChannel);
        currentChannel = null;
      }
    };

    const renderChannelTable = () => {
      if (channelMetrics.length === 0) return null;

      // Get all unique metric names across all channels
      const allMetricNames = new Set<string>();
      channelMetrics.forEach(ch => {
        ch.metrics.forEach(m => allMetricNames.add(m.name));
      });
      const metricNames = Array.from(allMetricNames);

      const table = (
        <div key={`channel-table-${keyIndex++}`} className="overflow-x-auto mb-6">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 font-semibold text-foreground">Channel</th>
                {metricNames.map(name => (
                  <th key={name} className="text-right py-2 px-2 font-semibold text-foreground whitespace-nowrap">
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {channelMetrics.map((channel, idx) => (
                <tr key={channel.channel} className={idx % 2 === 0 ? "bg-muted/20" : ""}>
                  <td className="py-2 pr-4 font-medium text-foreground">{channel.channel}</td>
                  {metricNames.map(metricName => {
                    const metric = channel.metrics.find(m => m.name === metricName);
                    if (!metric) {
                      return <td key={metricName} className="text-right py-2 px-2 text-muted-foreground">-</td>;
                    }
                    return (
                      <td key={metricName} className="text-right py-2 px-2 whitespace-nowrap">
                        <span className="text-foreground">{metric.value}</span>
                        {metric.change && (
                          <span className={`ml-1 text-xs ${
                            metric.change.startsWith("+") 
                              ? "text-green-600 dark:text-green-500" 
                              : metric.change.startsWith("-") 
                              ? "text-red-600 dark:text-red-500" 
                              : "text-muted-foreground"
                          }`}>
                            ({metric.change})
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

      channelMetrics = [];
      return table;
    };

    const formatInlineText = (text: string): React.ReactNode => {
      const parts = text.split(/(\*\*[^*]+\*\*|\d+\.?\d*%)/g);
      
      return parts.map((part, idx) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          const boldText = part.slice(2, -2);
          return <strong key={idx} className="font-semibold">{boldText}</strong>;
        }
        
        if (part.match(/^\d+\.?\d*%$/)) {
          const prevText = parts.slice(0, idx).join("").toLowerCase();
          const isNegativeContext = prevText.includes("decline") || 
                                    prevText.includes("decrease") || 
                                    prevText.includes("drop") || 
                                    prevText.includes("fall") ||
                                    prevText.includes("reduction") ||
                                    prevText.includes("down");
          const isPositiveContext = prevText.includes("increase") || 
                                    prevText.includes("growth") || 
                                    prevText.includes("rise") ||
                                    prevText.includes("up") ||
                                    prevText.includes("gain") ||
                                    prevText.includes("improvement");
          
          if (isNegativeContext) {
            return <span key={idx} className="text-red-600 dark:text-red-500 font-medium">{part}</span>;
          }
          if (isPositiveContext) {
            return <span key={idx} className="text-green-600 dark:text-green-500 font-medium">{part}</span>;
          }
          return <span key={idx} className="font-medium">{part}</span>;
        }
        
        return part;
      });
    };

    const parseMetricLine = (line: string): { name: string; value: string; change: string | null } | null => {
      // Match patterns like "Impressions: 30,662 (-12.2%)" or "ROAS: 25x (+7.4%)"
      const match = line.match(/^[-•*]?\s*\**([^:]+)\**:\s*([^(]+?)(?:\s*\(([+-]?\d+\.?\d*%)\))?$/);
      if (match) {
        return {
          name: match[1].trim(),
          value: match[2].trim(),
          change: match[3] || null
        };
      }
      return null;
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      if (!trimmedLine) continue;

      // Check for Global Results section
      if (trimmedLine.toLowerCase().includes("global results") || 
          trimmedLine.toLowerCase().includes("results per channel") ||
          trimmedLine.toLowerCase().includes("channel performance")) {
        flushChannelMetrics();
        const tableEl = renderChannelTable();
        if (tableEl) elements.push(tableEl);
        
        inGlobalResults = true;
        const headerText = trimmedLine.replace(/^#+\s*/, "").replace(/^\d+\.\s+/, "").replace(/:$/, "").replace(/\*\*/g, "");
        elements.push(
          <h2 key={`h2-${keyIndex++}`} className="text-xl font-bold text-foreground mt-8 mb-4">
            {headerText}
          </h2>
        );
        continue;
      }

      // Main section headers (h2)
      if (trimmedLine.match(/^(##\s+|Executive Summary|Key|Recommendations|Year-to-Date|YTD|Trends|Insights)/i) ||
          (trimmedLine.match(/^[A-Z][^:]+:?$/) && !inGlobalResults && trimmedLine.length < 50)) {
        flushChannelMetrics();
        const tableEl = renderChannelTable();
        if (tableEl) elements.push(tableEl);
        inGlobalResults = false;
        
        const headerText = trimmedLine.replace(/^#+\s*/, "").replace(/^\d+\.\s+/, "").replace(/:$/, "").replace(/\*\*/g, "");
        elements.push(
          <h2 key={`h2-${keyIndex++}`} className="text-xl font-bold text-foreground mt-8 mb-3">
            {headerText}
          </h2>
        );
        continue;
      }

      // Channel names (h3) within Global Results
      if (inGlobalResults && 
          (trimmedLine.match(/^(Metasearch|SEM|Social|Display|Email|Paid|Organic|Direct)/i) ||
           trimmedLine.match(/^[A-Z][a-z]+:?$/) && trimmedLine.length < 20)) {
        flushChannelMetrics();
        const channelName = trimmedLine.replace(/:$/, "").replace(/\*\*/g, "");
        currentChannel = { channel: channelName, metrics: [] };
        continue;
      }

      // Sub-section headers (h3)
      if (trimmedLine.match(/^\d+\.\s+[A-Z]/) || 
          (trimmedLine.match(/^[A-Z][a-z]+[^:]*:$/) && !inGlobalResults)) {
        flushChannelMetrics();
        const tableEl = renderChannelTable();
        if (tableEl) elements.push(tableEl);
        
        const headerText = trimmedLine.replace(/^\d+\.\s+/, "").replace(/:$/, "").replace(/\*\*/g, "");
        elements.push(
          <h3 key={`h3-${keyIndex++}`} className="text-lg font-semibold text-foreground mt-6 mb-2">
            {headerText}
          </h3>
        );
        continue;
      }

      // Metric lines within a channel
      if (currentChannel && (trimmedLine.startsWith("-") || trimmedLine.startsWith("•") || trimmedLine.startsWith("*"))) {
        const metric = parseMetricLine(trimmedLine);
        if (metric) {
          currentChannel.metrics.push(metric);
          continue;
        }
      }

      // Regular bullet points (not in global results)
      if ((trimmedLine.startsWith("-") || trimmedLine.startsWith("•") || trimmedLine.startsWith("*")) && !currentChannel) {
        const bulletText = trimmedLine.replace(/^[-•*]\s*/, "");
        elements.push(
          <div key={`bullet-${keyIndex++}`} className="flex items-start gap-2 mb-2 ml-4">
            <span className="text-foreground mt-0.5 flex-shrink-0">-</span>
            <span className="text-foreground/90">{formatInlineText(bulletText)}</span>
          </div>
        );
        continue;
      }

      // Regular paragraph
      flushChannelMetrics();
      const tableEl = renderChannelTable();
      if (tableEl) elements.push(tableEl);
      
      if (!inGlobalResults || !currentChannel) {
        inGlobalResults = false;
      }
      
      elements.push(
        <p key={`para-${keyIndex++}`} className="text-foreground/90 mb-4 leading-relaxed">
          {formatInlineText(trimmedLine)}
        </p>
      );
    }

    // Flush any remaining channel metrics
    flushChannelMetrics();
    const tableEl = renderChannelTable();
    if (tableEl) elements.push(tableEl);

    return elements;
  };

  return (
    <div className="space-y-2">
      {parseAndFormat(summary)}
    </div>
  );
};

export default FormattedAISummary;
