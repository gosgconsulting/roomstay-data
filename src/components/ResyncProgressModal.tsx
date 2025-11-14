import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle2, Loader2, Circle } from "lucide-react";

interface ResyncStep {
  id: string;
  label: string;
  status: 'pending' | 'in-progress' | 'completed' | 'error';
  detail?: string;
}

interface ResyncProgressModalProps {
  open: boolean;
  steps: ResyncStep[];
}

export function ResyncProgressModal({ open, steps }: ResyncProgressModalProps) {
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[500px] [&>button]:hidden">
        <DialogHeader>
          <DialogTitle>Syncing Data</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {steps.map((step) => (
            <div key={step.id} className="flex items-start gap-3">
              <div className="mt-0.5">
                {step.status === 'completed' && (
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                )}
                {step.status === 'in-progress' && (
                  <Loader2 className="h-5 w-5 text-primary animate-spin" />
                )}
                {step.status === 'pending' && (
                  <Circle className="h-5 w-5 text-muted-foreground" />
                )}
                {step.status === 'error' && (
                  <Circle className="h-5 w-5 text-destructive" />
                )}
              </div>
              
              <div className="flex-1 space-y-1">
                <p className={`text-sm font-medium ${
                  step.status === 'completed' ? 'text-green-600' :
                  step.status === 'in-progress' ? 'text-primary' :
                  step.status === 'error' ? 'text-destructive' :
                  'text-muted-foreground'
                }`}>
                  {step.label}
                </p>
                {step.detail && (
                  <p className="text-xs text-muted-foreground">{step.detail}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
