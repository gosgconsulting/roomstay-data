import React from "react";

interface FormattedAISummaryProps {
  summary: string;
}

const FormattedAISummary: React.FC<FormattedAISummaryProps> = ({ summary }) => {
  // Clean up malformed markdown before processing
  const cleanMarkdown = (text: string): string => {
    let cleaned = text;
    
    // Fix malformed bold: *text** -> **text** and **text* -> **text**
    cleaned = cleaned.replace(/(?<!\*)\*([^*\n]+)\*\*/g, '**$1**');
    cleaned = cleaned.replace(/\*\*([^*\n]+)\*(?!\*)/g, '**$1**');
    
    // Fix cases like - *1. Text** (bullet with broken bold)
    cleaned = cleaned.replace(/-\s*\*(\d+\.)/g, '- **$1');
    
    // Remove any remaining single asterisks that look like broken bold markers
    // Pattern: single * followed by text and then **
    cleaned = cleaned.replace(/(?<!\*)\*(?!\*)(\d+\.\s*[A-Za-z][^*\n]*)\*\*/g, '**$1**');
    
    return cleaned;
  };

  const parseAndFormat = (text: string) => {
    const cleanedText = cleanMarkdown(text);
    const lines = cleanedText.split("\n");
    const elements: React.ReactNode[] = [];
    let keyIndex = 0;

    const formatInlineText = (lineText: string): React.ReactNode => {
      // Process the text to handle bold and numbers with colors
      const processNumberColors = (segment: string, segmentIdx: number): React.ReactNode => {
        // Match numbers with signs: +24.7%, -12.2%, $258K, 32x, etc.
        const numberPattern = /([+-]\d+\.?\d*%?|\(\s*[+-]?\d+\.?\d*%?\s*\)|\$[\d,]+\.?\d*[KkMm]?|\d+\.?\d*%|\d+x\b)/g;
        const parts = segment.split(numberPattern);
        
        if (parts.length > 1) {
          return parts.map((part, idx) => {
            // Check if this is a number that should be colored
            if (part.match(/^[+-]\d+\.?\d*%?$/) || part.match(/^\(\s*[+-]?\d+\.?\d*%?\s*\)$/)) {
              const isNegative = part.includes("-");
              const isPositive = part.includes("+");
              return (
                <span key={`${segmentIdx}-${idx}`} className={`font-medium ${
                  isNegative ? "text-red-600 dark:text-red-500" : 
                  isPositive ? "text-green-600 dark:text-green-500" : 
                  "text-foreground"
                }`}>
                  {part}
                </span>
              );
            }
            // For other numbers, check context
            if (part.match(/^\$[\d,]+\.?\d*[KkMm]?$/) || part.match(/^\d+\.?\d*%$/) || part.match(/^\d+x$/)) {
              // Check surrounding context for positive/negative
              const prevText = parts.slice(0, idx).join("").toLowerCase();
              const isNegativeContext = prevText.match(/(decline|decrease|drop|fall|reduction|down|lower|less|reduced|lost)$/i);
              const isPositiveContext = prevText.match(/(increase|growth|rise|up|gain|improvement|higher|more|grew|jumped)$/i);
              
              return (
                <span key={`${segmentIdx}-${idx}`} className={`font-medium ${
                  isNegativeContext ? "text-red-600 dark:text-red-500" : 
                  isPositiveContext ? "text-green-600 dark:text-green-500" : 
                  "text-foreground"
                }`}>
                  {part}
                </span>
              );
            }
            return part;
          });
        }
        
        return segment;
      };

      // Handle **bold** markdown - render as bold
      const boldPattern = /\*\*([^*]+)\*\*/g;
      const boldParts = lineText.split(boldPattern);
      
      return boldParts.map((part, idx) => {
        // Odd indices are the bold content
        if (idx % 2 === 1) {
          return <strong key={idx} className="font-semibold">{processNumberColors(part, idx)}</strong>;
        }
        // Clean any remaining stray asterisks from non-bold parts
        const cleanedPart = part.replace(/\*+/g, '');
        return <React.Fragment key={idx}>{processNumberColors(cleanedPart, idx)}</React.Fragment>;
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
            <span className="text-primary mt-1.5 flex-shrink-0">•</span>
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
