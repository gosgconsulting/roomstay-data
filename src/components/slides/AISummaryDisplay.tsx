import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AISummaryDisplayProps {
  summary?: string;
  title?: string;
  className?: string;
  value?: string | null;
}

export function AISummaryDisplay({ summary, value, title, className }: AISummaryDisplayProps) {
  const content = summary ?? value ?? "";
  if (!content) return null;

  return (
    <Card className={cn("mt-6 border-primary/20 shadow-lg bg-gradient-to-br from-card to-card/50", className)}>
      <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 border-b border-primary/10">
        <CardTitle className="flex items-center gap-2 text-lg">
          <div className="p-1.5 rounded-md bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          {title || "AI Summary"}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-6">
        <div className="prose prose-sm max-w-none dark:prose-invert 
          prose-headings:font-semibold prose-headings:text-foreground prose-headings:mt-6 prose-headings:mb-3
          prose-h1:text-xl prose-h1:font-bold prose-h1:border-b prose-h1:border-border prose-h1:pb-2
          prose-h2:text-lg prose-h2:font-semibold prose-h2:mt-5 prose-h2:mb-2
          prose-h3:text-base prose-h3:font-semibold prose-h3:mt-4 prose-h3:mb-2
          prose-p:text-foreground/90 prose-p:leading-relaxed prose-p:mb-4
          prose-strong:text-foreground prose-strong:font-semibold
          prose-ul:text-foreground/90 prose-ul:my-4 prose-ul:space-y-2
          prose-li:text-foreground/90 prose-li:leading-relaxed prose-li:marker:text-primary
          prose-ol:text-foreground/90 prose-ol:my-4 prose-ol:space-y-2
          prose-code:text-foreground prose-code:bg-muted prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-sm
          prose-blockquote:border-l-4 prose-blockquote:border-primary/30 prose-blockquote:pl-4 prose-blockquote:italic prose-blockquote:text-foreground/80
          prose-a:text-primary prose-a:underline prose-a:decoration-primary/50 hover:prose-a:decoration-primary
          [&_strong]:text-foreground [&_strong]:font-semibold
          [&_*:has(+)]:mb-0">
          <ReactMarkdown 
            remarkPlugins={[remarkGfm]}
            components={{
              ul: ({ children, ...props }) => (
                <ul {...props} className="my-4 space-y-2.5 list-none pl-0">
                  {children}
                </ul>
              ),
              li: ({ children, ...props }) => (
                <li {...props} className="flex items-start gap-3 text-foreground/90 leading-relaxed">
                  <span className="text-primary mt-1.5 flex-shrink-0 font-bold text-lg">•</span>
                  <span className="flex-1">{children}</span>
                </li>
              ),
              h2: ({ children, ...props }) => (
                <h2 {...props} className="text-lg font-semibold text-foreground mt-6 mb-3 pt-3 border-b border-border/50 pb-2">
                  {children}
                </h2>
              ),
              h3: ({ children, ...props }) => (
                <h3 {...props} className="text-base font-semibold text-foreground mt-5 mb-2">
                  {children}
                </h3>
              ),
              p: ({ children, ...props }) => (
                <p {...props} className="text-foreground/90 leading-relaxed mb-4 text-[15px]">
                  {children}
                </p>
              ),
              strong: ({ children, ...props }) => (
                <strong {...props} className="font-semibold text-foreground">
                  {children}
                </strong>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </div>
      </CardContent>
    </Card>
  );
}

export default AISummaryDisplay;