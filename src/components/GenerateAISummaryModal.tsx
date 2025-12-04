import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sparkles, Loader2 } from "lucide-react";

export type ComparisonOption = "previous_period" | "previous_year" | "both";

interface GenerateAISummaryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (comparisonType: ComparisonOption) => void;
  isGenerating: boolean;
  cardName?: string;
}

const GenerateAISummaryModal: React.FC<GenerateAISummaryModalProps> = ({
  open,
  onOpenChange,
  onGenerate,
  isGenerating,
  cardName,
}) => {
  const [comparisonType, setComparisonType] = useState<ComparisonOption>("previous_year");

  const handleGenerate = () => {
    onGenerate(comparisonType);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Generate AI Summary
          </DialogTitle>
          <DialogDescription>
            {cardName ? `Configure summary generation for "${cardName}"` : "Configure how the AI should analyze your data"}
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="space-y-3">
            <Label className="text-sm font-medium">Comparison Period</Label>
            <p className="text-xs text-muted-foreground">
              Choose how you want to compare your performance data
            </p>
            
            <RadioGroup
              value={comparisonType}
              onValueChange={(value) => setComparisonType(value as ComparisonOption)}
              className="space-y-3"
            >
              <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                <RadioGroupItem value="previous_period" id="previous_period" className="mt-0.5" />
                <div className="space-y-1">
                  <Label htmlFor="previous_period" className="font-medium cursor-pointer">
                    vs Previous Period
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Compare Last Month vs 2 months ago, MTD vs last month same days, YTD vs last year same period
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                <RadioGroupItem value="previous_year" id="previous_year" className="mt-0.5" />
                <div className="space-y-1">
                  <Label htmlFor="previous_year" className="font-medium cursor-pointer">
                    vs Previous Year
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Compare each period to the same period last year (e.g., Nov 2025 vs Nov 2024)
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                <RadioGroupItem value="both" id="both" className="mt-0.5" />
                <div className="space-y-1">
                  <Label htmlFor="both" className="font-medium cursor-pointer">
                    Both Comparisons
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Include analysis for both previous period and previous year comparisons
                  </p>
                </div>
              </div>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isGenerating}>
            Cancel
          </Button>
          <Button onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Summary
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GenerateAISummaryModal;
