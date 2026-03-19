import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type StepStatus = 'pending' | 'loading' | 'complete' | 'error';

interface RefreshStepIndicatorProps {
  stepNumber: number;
  status: StepStatus;
  title: string;
  description: string;
}

export function RefreshStepIndicator({ stepNumber, status, title, description }: RefreshStepIndicatorProps) {
  return (
    <div className="flex items-center gap-3">
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
        status === 'complete' && "bg-success/10 text-success",
        status === 'loading' && "bg-primary/20 text-primary",
        status === 'error' && "bg-destructive/10 text-destructive",
        status === 'pending' && "bg-muted text-muted-foreground"
      )}>
        {status === 'complete' ? (
          <Check className="h-4 w-4" />
        ) : status === 'loading' ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : status === 'error' ? (
          <span>!</span>
        ) : (
          String(stepNumber)
        )}
      </div>
      <div className="flex-1">
        <p className={cn(
          "font-medium",
          status === 'complete' && "text-success",
          status === 'loading' && "text-foreground",
          status === 'error' && "text-destructive",
          status === 'pending' && "text-muted-foreground"
        )}>
          {title}
        </p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
