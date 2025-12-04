import React from "react";

interface FormattedAISummaryProps {
  summary: string;
}

const FormattedAISummary: React.FC<FormattedAISummaryProps> = ({ summary }) => {
  const parseAndFormat = (text: string) => {
    const lines = text.split("\n");
    const elements: React.ReactNode[] = [];
    let keyIndex = 0;

    const formatInlineText = (text: string): React.ReactNode => {
      // Process the text to handle bold, percentages, and important keywords
      const processSegment = (segment: string, segmentIdx: number): React.ReactNode => {
        // Handle percentages with parentheses like (-12.2%) or (+7.4%)
        const percentParenPattern = /\(([+-]?\d+\.?\d*%)\)/g;
        const parts = segment.split(percentParenPattern);
        
        if (parts.length > 1) {
          return parts.map((part, pIdx) => {
            // Check if this part is a percentage
            if (part.match(/^[+-]?\d+\.?\d*%$/)) {
              const isNegative = part.startsWith("-");
              const isPositive = part.startsWith("+");
              return (
                <span key={`${segmentIdx}-${pIdx}`} className={`font-semibold ${
                  isNegative ? "text-red-600 dark:text-red-500" : 
                  isPositive ? "text-green-600 dark:text-green-500" : 
                  "text-foreground"
                }`}>
                  ({part})
                </span>
              );
            }
            // Process standalone percentages in the remaining text
            return processStandalonePercent(part, `${segmentIdx}-${pIdx}`);
          });
        }
        
        return processStandalonePercent(segment, String(segmentIdx));
      };

      const processStandalonePercent = (text: string, key: string): React.ReactNode => {
        // Handle standalone percentages and important numbers
        const numberPattern = /(\d+\.?\d*%|\$[\d,]+\.?\d*|\d+x\b)/g;
        const parts = text.split(numberPattern);
        
        if (parts.length > 1) {
          return parts.map((part, idx) => {
            if (part.match(/^\d+\.?\d*%$/) || part.match(/^\$[\d,]+\.?\d*$/) || part.match(/^\d+x$/)) {
              // Check context for positive/negative
              const prevText = parts.slice(0, idx).join("").toLowerCase();
              const isNegativeContext = prevText.includes("decline") || 
                                        prevText.includes("decrease") || 
                                        prevText.includes("drop") || 
                                        prevText.includes("fall") ||
                                        prevText.includes("reduction") ||
                                        prevText.includes("down") ||
                                        prevText.includes("lower");
              const isPositiveContext = prevText.includes("increase") || 
                                        prevText.includes("growth") || 
                                        prevText.includes("rise") ||
                                        prevText.includes("up") ||
                                        prevText.includes("gain") ||
                                        prevText.includes("improvement") ||
                                        prevText.includes("higher") ||
                                        prevText.includes("impressive");
              
              return (
                <strong key={`${key}-${idx}`} className={`font-semibold ${
                  isNegativeContext ? "text-red-600 dark:text-red-500" : 
                  isPositiveContext ? "text-green-600 dark:text-green-500" : 
                  "text-foreground"
                }`}>
                  {part}
                </strong>
              );
            }
            return highlightKeywords(part, `${key}-${idx}`);
          });
        }
        
        return highlightKeywords(text, key);
      };

      const highlightKeywords = (text: string, key: string): React.ReactNode => {
        // Highlight important positive/negative keywords
        const positiveWords = /(impressive|significant improvement|strong performance|excellent|growth|increased|improvement|improved|higher|gain|success|outperformed)/gi;
        const negativeWords = /(decline|decrease|dropped|falling|reduction|challenge|concern|underperformed|lower|down|weakness)/gi;
        
        let result = text;
        const elements: React.ReactNode[] = [];
        let lastIndex = 0;
        
        // Combine patterns
        const combinedPattern = /(impressive|significant improvement|strong performance|excellent|growth|increased|improvement|improved|higher|gain|success|outperformed|decline|decrease|dropped|falling|reduction|challenge|concern|underperformed|lower|weakness)/gi;
        
        let match;
        while ((match = combinedPattern.exec(text)) !== null) {
          // Add text before match
          if (match.index > lastIndex) {
            elements.push(text.slice(lastIndex, match.index));
          }
          
          const word = match[0];
          const isPositive = word.match(positiveWords);
          elements.push(
            <strong key={`${key}-kw-${match.index}`} className={`font-semibold ${
              isPositive ? "text-green-600 dark:text-green-500" : "text-red-600 dark:text-red-500"
            }`}>
              {word}
            </strong>
          );
          
          lastIndex = match.index + word.length;
        }
        
        // Add remaining text
        if (lastIndex < text.length) {
          elements.push(text.slice(lastIndex));
        }
        
        return elements.length > 0 ? elements : text;
      };

      // First handle **bold** markdown
      const boldPattern = /\*\*([^*]+)\*\*/g;
      const boldParts = text.split(boldPattern);
      
      return boldParts.map((part, idx) => {
        // Odd indices are the bold content
        if (idx % 2 === 1) {
          return <strong key={idx} className="font-semibold">{processSegment(part, idx)}</strong>;
        }
        return <React.Fragment key={idx}>{processSegment(part, idx)}</React.Fragment>;
      });
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      if (!trimmedLine) continue;

      // Handle ### headers (h3)
      if (trimmedLine.startsWith("###")) {
        const headerText = trimmedLine.replace(/^#+\s*/, "").replace(/\*\*/g, "");
        elements.push(
          <h3 key={`h3-${keyIndex++}`} className="text-base font-semibold text-foreground mt-5 mb-2">
            {headerText}
          </h3>
        );
        continue;
      }

      // Handle ## headers (h2)
      if (trimmedLine.startsWith("##")) {
        const headerText = trimmedLine.replace(/^#+\s*/, "").replace(/\*\*/g, "");
        elements.push(
          <h2 key={`h2-${keyIndex++}`} className="text-lg font-bold text-foreground mt-6 mb-3">
            {headerText}
          </h2>
        );
        continue;
      }

      // Handle # headers (h1)
      if (trimmedLine.startsWith("#")) {
        const headerText = trimmedLine.replace(/^#+\s*/, "").replace(/\*\*/g, "");
        elements.push(
          <h2 key={`h1-${keyIndex++}`} className="text-xl font-bold text-foreground mt-6 mb-3">
            {headerText}
          </h2>
        );
        continue;
      }

      // Handle section headers (Title Case lines ending with : or standalone titles)
      if (trimmedLine.match(/^[A-Z][A-Za-z\s&-]+:?$/) && trimmedLine.length < 50 && !trimmedLine.startsWith("-")) {
        const headerText = trimmedLine.replace(/:$/, "").replace(/\*\*/g, "");
        elements.push(
          <h2 key={`header-${keyIndex++}`} className="text-lg font-bold text-foreground mt-6 mb-3">
            {headerText}
          </h2>
        );
        continue;
      }

      // Handle numbered section headers like "1. Executive Summary"
      if (trimmedLine.match(/^\d+\.\s+[A-Z]/)) {
        const headerText = trimmedLine.replace(/^\d+\.\s+/, "").replace(/:$/, "").replace(/\*\*/g, "");
        elements.push(
          <h2 key={`numbered-header-${keyIndex++}`} className="text-lg font-bold text-foreground mt-6 mb-3">
            {headerText}
          </h2>
        );
        continue;
      }

      // Handle bullet points
      if (trimmedLine.startsWith("-") || trimmedLine.startsWith("•") || trimmedLine.startsWith("*")) {
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
      elements.push(
        <p key={`para-${keyIndex++}`} className="text-foreground/90 mb-4 leading-relaxed">
          {formatInlineText(trimmedLine)}
        </p>
      );
    }

    return elements;
  };

  return (
    <div className="space-y-1">
      {parseAndFormat(summary)}
    </div>
  );
};

export default FormattedAISummary;
