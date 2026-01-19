import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";

interface AISummaryButtonProps {
  onClick: () => void;
  disabled?: boolean;
  isLoading?: boolean;
}

export function AISummaryButton({ onClick, disabled, isLoading }: AISummaryButtonProps) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      disabled={disabled || isLoading}
      className="gap-2"
    >
      <Sparkles className="h-4 w-4" />
      {isLoading ? "Generating..." : "AI Summary"}
    </Button>
  );
}
