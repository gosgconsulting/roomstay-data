import React from "react";

interface FormattedAISummaryProps {
  summary: string;
}

const FormattedAISummary: React.FC<FormattedAISummaryProps> = ({ summary }) => {
  // Parse the summary and format it with styling
  const parseAndFormat = (text: string) => {
    const lines = text.split("\n");
    const elements: React.ReactNode[] = [];
    let bulletPoints: string[] = [];
    let keyIndex = 0;

    const flushBulletPoints = () => {
      if (bulletPoints.length > 0) {
        elements.push(
          <ul key={`bullets-${keyIndex++}`} className="space-y-2 mb-4 ml-4">
            {bulletPoints.map((point, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-foreground mt-0.5 flex-shrink-0">-</span>
                <span className="text-foreground/90">{formatInlineText(point)}</span>
              </li>
            ))}
          </ul>
        );
        bulletPoints = [];
      }
    };

    const formatInlineText = (text: string): React.ReactNode => {
      // Split by percentage patterns and bold patterns
      const parts = text.split(/(\*\*[^*]+\*\*|\d+\.?\d*%)/g);
      
      return parts.map((part, idx) => {
        // Handle **bold** text
        if (part.startsWith("**") && part.endsWith("**")) {
          const boldText = part.slice(2, -2);
          return <strong key={idx} className="text-foreground font-semibold">{boldText}</strong>;
        }
        
        // Handle percentage values - check surrounding context
        if (part.match(/^\d+\.?\d*%$/)) {
          // Look at previous parts to determine if positive or negative context
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
          // Default to neutral
          return <span key={idx} className="font-medium">{part}</span>;
        }
        
        return part;
      });
    };

    for (const line of lines) {
      const trimmedLine = line.trim();
      
      // Empty line
      if (!trimmedLine) {
        flushBulletPoints();
        continue;
      }

      // Section headers (lines ending with :) - no bullet point
      if (trimmedLine.match(/^[A-Z][^:]+:$/) || trimmedLine.match(/^\d+\.\s+[A-Z][^:]+:$/)) {
        flushBulletPoints();
        const headerText = trimmedLine.replace(/^\d+\.\s+/, "").replace(/:$/, "");
        elements.push(
          <h3 key={`header-${keyIndex++}`} className="text-lg font-bold text-primary mt-6 mb-3">
            {headerText}
          </h3>
        );
        continue;
      }

      // Bold section headers (## or ###) - no bullet point
      if (trimmedLine.startsWith("##")) {
        flushBulletPoints();
        const headerText = trimmedLine.replace(/^#+\s*/, "");
        elements.push(
          <h3 key={`header-${keyIndex++}`} className="text-lg font-bold text-primary mt-6 mb-3">
            {headerText}
          </h3>
        );
        continue;
      }

      // Bullet points (collect them)
      if (trimmedLine.startsWith("-") || trimmedLine.startsWith("•") || trimmedLine.startsWith("*")) {
        const bulletText = trimmedLine.replace(/^[-•*]\s*/, "");
        bulletPoints.push(bulletText);
        continue;
      }

      // Numbered items
      if (trimmedLine.match(/^\d+\.\s+/)) {
        const itemText = trimmedLine.replace(/^\d+\.\s+/, "");
        // Check if it is a sub-section header (ends with :)
        if (itemText.endsWith(":")) {
          flushBulletPoints();
          elements.push(
            <h4 key={`subheader-${keyIndex++}`} className="text-base font-semibold text-foreground mt-4 mb-2">
              {itemText.replace(/:$/, "")}
            </h4>
          );
        } else {
          bulletPoints.push(itemText);
        }
        continue;
      }

      // Regular paragraph
      flushBulletPoints();
      elements.push(
        <p key={`para-${keyIndex++}`} className="text-foreground/90 mb-3 leading-relaxed">
          {formatInlineText(trimmedLine)}
        </p>
      );
    }

    flushBulletPoints();
    return elements;
  };

  return (
    <div className="space-y-1">
      {parseAndFormat(summary)}
    </div>
  );
};

export default FormattedAISummary;
