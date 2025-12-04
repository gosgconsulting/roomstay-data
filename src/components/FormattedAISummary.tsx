import React from "react";

interface FormattedAISummaryProps {
  summary: string;
}

const FormattedAISummary: React.FC<FormattedAISummaryProps> = ({ summary }) => {
  // Parse the summary and format it with styling
  const parseAndFormat = (text: string) => {
    const lines = text.split('\n');
    const elements: React.ReactNode[] = [];
    let currentSection: string | null = null;
    let bulletPoints: string[] = [];
    let keyIndex = 0;

    const flushBulletPoints = () => {
      if (bulletPoints.length > 0) {
        elements.push(
          <ul key={`bullets-${keyIndex++}`} className="space-y-2 mb-4 ml-4">
            {bulletPoints.map((point, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="text-primary mt-1.5 flex-shrink-0">•</span>
                <span className="text-foreground/90">{formatInlineText(point)}</span>
              </li>
            ))}
          </ul>
        );
        bulletPoints = [];
      }
    };

    const formatInlineText = (text: string): React.ReactNode => {
      // Handle **bold** text
      const parts = text.split(/(\*\*[^*]+\*\*)/g);
      return parts.map((part, idx) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          const boldText = part.slice(2, -2);
          // Check if it contains positive/negative indicators
          if (boldText.includes('+') || boldText.toLowerCase().includes('increase') || boldText.toLowerCase().includes('growth')) {
            return <strong key={idx} className="text-green-600 dark:text-green-400">{boldText}</strong>;
          }
          if (boldText.includes('-') || boldText.includes('decrease') || boldText.toLowerCase().includes('decline')) {
            return <strong key={idx} className="text-red-600 dark:text-red-400">{boldText}</strong>;
          }
          return <strong key={idx} className="text-foreground font-semibold">{boldText}</strong>;
        }
        // Check for percentage changes in regular text
        const percentMatch = part.match(/([+-]?\d+\.?\d*%)/g);
        if (percentMatch) {
          let result = part;
          return part.split(/([+-]?\d+\.?\d*%)/g).map((segment, sIdx) => {
            if (segment.match(/^[+-]?\d+\.?\d*%$/)) {
              const isPositive = segment.startsWith('+') || (!segment.startsWith('-') && !segment.includes('decrease'));
              const isNegative = segment.startsWith('-');
              if (isPositive && !isNegative) {
                return <span key={sIdx} className="text-green-600 dark:text-green-400 font-medium">{segment}</span>;
              }
              if (isNegative) {
                return <span key={sIdx} className="text-red-600 dark:text-red-400 font-medium">{segment}</span>;
              }
            }
            return segment;
          });
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

      // Section headers (lines ending with :)
      if (trimmedLine.match(/^[A-Z][^:]+:$/) || trimmedLine.match(/^\d+\.\s+[A-Z][^:]+:$/)) {
        flushBulletPoints();
        const headerText = trimmedLine.replace(/^\d+\.\s+/, '').replace(/:$/, '');
        elements.push(
          <h3 key={`header-${keyIndex++}`} className="text-lg font-bold text-primary mt-6 mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-primary rounded-full"></span>
            {headerText}
          </h3>
        );
        currentSection = headerText;
        continue;
      }

      // Bold section headers (## or ###)
      if (trimmedLine.startsWith('##')) {
        flushBulletPoints();
        const headerText = trimmedLine.replace(/^#+\s*/, '');
        elements.push(
          <h3 key={`header-${keyIndex++}`} className="text-lg font-bold text-primary mt-6 mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 bg-primary rounded-full"></span>
            {headerText}
          </h3>
        );
        continue;
      }

      // Bullet points
      if (trimmedLine.startsWith('-') || trimmedLine.startsWith('•') || trimmedLine.startsWith('*')) {
        const bulletText = trimmedLine.replace(/^[-•*]\s*/, '');
        bulletPoints.push(bulletText);
        continue;
      }

      // Numbered items
      if (trimmedLine.match(/^\d+\.\s+/)) {
        const itemText = trimmedLine.replace(/^\d+\.\s+/, '');
        // Check if it's a sub-section header
        if (itemText.endsWith(':')) {
          flushBulletPoints();
          elements.push(
            <h4 key={`subheader-${keyIndex++}`} className="text-base font-semibold text-foreground mt-4 mb-2">
              {itemText.replace(/:$/, '')}
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
