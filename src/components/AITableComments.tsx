import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AITableCommentsProps {
  tableType: "report" | "breakdown" | "date";
  tableName: string;
  tableData: any[];
  metrics: string[];
  onCommentGenerated?: (comment: string) => void;
  existingComment?: string;
}

const AITableComments: React.FC<AITableCommentsProps> = ({
  tableType,
  tableName,
  tableData,
  metrics,
  onCommentGenerated,
  existingComment,
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [comment, setComment] = useState<string | null>(existingComment || null);

  const generateComment = async () => {
    setIsGenerating(true);
    try {
      // Prepare table context
      const tableContext = tableData.map(row => {
        const rowData: Record<string, any> = {};
        if (row.reportName) rowData.name = row.reportName;
        if (row.groupValue) rowData.name = row.groupValue;
        if (row.dateGroup) rowData.name = row.dateGroup;
        metrics.forEach(metric => {
          rowData[metric] = row.metrics?.[metric] || 0;
        });
        return rowData;
      });

      const prompt = getPromptForTableType(tableType, tableName, tableContext, metrics);

      const { data, error } = await supabase.functions.invoke("generate-ai-summary", {
        body: {
          pivotData: { tableContext },
          selectedMetrics: metrics,
          aiPrompt: prompt,
          isTableComment: true,
        },
      });

      if (error) throw error;
      
      const generatedComment = data?.summary || "Unable to generate insights.";
      setComment(generatedComment);
      onCommentGenerated?.(generatedComment);
      
    } catch (err) {
      console.error("Error generating table comment:", err);
      toast.error("Failed to generate insights");
    } finally {
      setIsGenerating(false);
    }
  };

  const getPromptForTableType = (
    type: string,
    name: string,
    data: any[],
    metrics: string[]
  ): string => {
    const dataStr = JSON.stringify(data, null, 2);
    
    switch (type) {
      case "report":
        return `Analyze this report performance summary table for "${name}". 
Data: ${dataStr}
Metrics: ${metrics.join(", ")}

Provide 2-3 concise bullet points highlighting:
- Key performance insights
- Notable trends or anomalies
- Actionable recommendations

Keep each point brief and focused on business impact.`;

      case "breakdown":
        return `Analyze this breakdown by "${name}" table.
Data: ${dataStr}
Metrics: ${metrics.join(", ")}

Provide 2-3 concise bullet points highlighting:
- Top and bottom performers
- Distribution patterns
- Optimization opportunities

Keep each point brief and focused on business impact.`;

      case "date":
        return `Analyze this time-based performance table (${name}).
Data: ${dataStr}
Metrics: ${metrics.join(", ")}

Provide 2-3 concise bullet points highlighting:
- Performance trajectory
- Notable periods (peaks/dips)
- Trends to watch

Keep each point brief and focused on business impact.`;

      default:
        return `Analyze this data table and provide 2-3 key insights.
Data: ${dataStr}`;
    }
  };

  const formatComment = (text: string): React.ReactNode => {
    const lines = text.split('\n').filter(line => line.trim());
    
    return (
      <ul className="space-y-2">
        {lines.map((line, idx) => {
          const cleanLine = line.replace(/^[-•*]\s*/, '').trim();
          if (!cleanLine) return null;
          
          return (
            <li key={idx} className="flex items-start gap-2 text-sm">
              <span className="text-primary mt-0.5 flex-shrink-0">•</span>
              <span className="text-muted-foreground">{cleanLine}</span>
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="mt-3 px-4 pb-4">
      {comment ? (
        <div className="bg-muted/30 rounded-lg p-3 border border-border/50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              AI Insights
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={generateComment}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
            </Button>
          </div>
          {formatComment(comment)}
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs h-8"
          onClick={generateComment}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
              Generating insights...
            </>
          ) : (
            <>
              <Sparkles className="h-3 w-3 mr-1.5" />
              Generate AI Insights
            </>
          )}
        </Button>
      )}
    </div>
  );
};

export default AITableComments;
