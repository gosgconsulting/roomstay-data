import React from "react";

export interface AISummaryDisplayProps {
  value?: string | null;
}

export function AISummaryDisplay({ value }: AISummaryDisplayProps) {
  return (
    <div className="prose prose-sm max-w-none">
      {value ? <p>{value}</p> : <p className="text-muted-foreground">No summary yet.</p>}
    </div>
  );
}

export default AISummaryDisplay;