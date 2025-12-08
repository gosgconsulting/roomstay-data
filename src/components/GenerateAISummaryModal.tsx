import React, { useState, useMemo } from "react";
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
import { Sparkles, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfYear, eachMonthOfInterval } from "date-fns";

export type ComparisonOption = "previous_period" | "previous_year" | "both";

interface GenerateAISummaryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (comparisonType: ComparisonOption, selectedPeriods: string[]) => void;
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
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");
  const [comparisonType, setComparisonType] = useState<ComparisonOption>("previous_year");

  // Generate date period options
  const dateOptions = useMemo(() => {
    const now = new Date();
    const options: { value: string; label: string }[] = [];
    
    // Add YTD at top
    options.push({ value: "ytd", label: "YTD (Year to Date)" });
    
    // Add MTD
    options.push({ value: "mtd", label: "MTD (Month to Date)" });
    
    // Add individual months from current month back to January
    const startOfCurrentYear = startOfYear(now);
    const months = eachMonthOfInterval({ start: startOfCurrentYear, end: now });
    
    months.reverse().forEach((month) => {
      const value = format(month, "yyyy-MM");
      const label = format(month, "MMMM yyyy");
      options.push({ value, label });
    });
    
    return options;
  }, []);

  const handleGenerate = () => {
    onGenerate(comparisonType, [selectedPeriod]);
  };

  const handleClose = () => {
    setStep(1);
    setSelectedPeriod("");
    setComparisonType("previous_year");
    onOpenChange(false);
  };

  const canProceedToStep2 = selectedPeriod !== "";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Generate AI Summary
          </DialogTitle>
          <DialogDescription>
            {cardName ? `Configure summary generation for "${cardName}"` : "Configure how the AI should analyze your data"}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-2 py-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step === 1 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            1
          </div>
          <div className="w-8 h-0.5 bg-muted" />
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step === 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            2
          </div>
        </div>

        {step === 1 && (
          <div className="py-4 space-y-4">
            <div className="space-y-3">
              <Label className="text-sm font-medium">Select Date Period</Label>
              <p className="text-xs text-muted-foreground">
                Choose which period to analyze
              </p>
              
              <RadioGroup
                value={selectedPeriod}
                onValueChange={setSelectedPeriod}
                className="max-h-[280px] overflow-y-auto space-y-2 pr-2"
              >
                {dateOptions.map((option) => (
                  <div 
                    key={option.value}
                    className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer"
                    onClick={() => setSelectedPeriod(option.value)}
                  >
                    <RadioGroupItem value={option.value} id={option.value} />
                    <Label htmlFor={option.value} className="font-medium cursor-pointer flex-1">
                      {option.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
          </div>
        )}

        {step === 2 && (
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
        )}

        <DialogFooter className="flex-row gap-2">
          {step === 1 ? (
            <>
              <Button variant="outline" onClick={handleClose} disabled={isGenerating}>
                Cancel
              </Button>
              <Button 
                onClick={() => setStep(2)} 
                disabled={!canProceedToStep2}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep(1)} disabled={isGenerating}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
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
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GenerateAISummaryModal;
