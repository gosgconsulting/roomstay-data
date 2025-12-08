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
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfYear, eachMonthOfInterval } from "date-fns";

export type ComparisonOption = "previous_period" | "previous_year" | "both";

interface GenerateAISummaryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerate: (comparisonType: ComparisonOption, selectedPeriods: string[], aiPrompt: string) => void;
  isGenerating: boolean;
  cardName?: string;
  initialAiPrompt?: string;
}

const DEFAULT_AI_PROMPT = `You are an analytics expert.
I will provide raw performance data broken down by channel (e.g., SEM, Social Ads, Metasearch).
Using the dataset and the selected metrics I provide, generate a clear and executive-level performance summary following the structure below.

1. Global Results per Channel

For each channel:

Present the selected metrics clearly and consistently.

Provide:

Short narrative summary

Bullet insights on performance drivers, efficiency, volume changes, notable strengths or weaknesses.

2. MTD vs Previous Period

Compare Month-To-Date vs Previous Period (same number of days) using the same selected metrics:

Highlight key increases or decreases

Add a 1–2 sentence executive interpretation per channel

Mention seasonal or competitive factors if they explain the change

3. MTD vs Last Month

Compare MTD to the full previous calendar month, using the same selected metrics:

Summarize shifts, trends, and efficiency changes

Provide a short strategic interpretation (why the changes matter)

4. YTD vs Previous Year (if available)

If YTD data exists:

Compare the selected metrics against previous year

Identify the major drivers of improvement or decline
If not available:

State YTD comparison is not applicable.

5. Cross-Channel Executive Summary

Provide a high-level overview answering:

Which channel is most efficient overall?

Which channel delivers the strongest scale?

Are costs rising or stabilizing?

What major shifts define this period?

What is the single biggest opportunity to improve?

This section must read as a polished C-suite executive summary.

6. Recommendations

Provide short, strategic, actionable recommendations:

Budget allocation

Optimizations

Creative and audience refresh

Structural changes

Any funnel or CRO improvements

Focus on impact, not technical details.

7. Automatically Add These Insights When Relevant
Seasonality

Call out if performance changes align with known seasonal periods, holidays, or industry cycles.

Competitive/Auction Dynamics

Identify trends such as increased competition, volatility, or efficiency shifts.

Tracking/Data Considerations

Mention anomalies, missing signals, attribution mismatches, or measurement gaps if visible.

Final Output Format

Executive Summary

Global Results per Channel

MTD vs Previous Period

MTD vs Last Month

YTD vs Previous Year

Key Insights

Recommendations

Tone: Concise, professional, and performance-driven.`;

const GenerateAISummaryModal: React.FC<GenerateAISummaryModalProps> = ({
  open,
  onOpenChange,
  onGenerate,
  isGenerating,
  cardName,
  initialAiPrompt,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedPeriod, setSelectedPeriod] = useState<string>("");
  const [comparisonType, setComparisonType] = useState<ComparisonOption>("previous_year");
  const [aiPrompt, setAiPrompt] = useState(initialAiPrompt || DEFAULT_AI_PROMPT);

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
    onGenerate(comparisonType, [selectedPeriod], aiPrompt);
  };

  const handleClose = () => {
    setStep(1);
    setSelectedPeriod("");
    setComparisonType("previous_year");
    setAiPrompt(initialAiPrompt || DEFAULT_AI_PROMPT);
    onOpenChange(false);
  };

  const canProceedToStep2 = selectedPeriod !== "";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[560px]">
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
          <div className="w-8 h-0.5 bg-muted" />
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step === 3 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            3
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

        {step === 3 && (
          <div className="py-4 space-y-4">
            <div className="space-y-3">
              <Label className="text-sm font-medium">AI Summary Prompt</Label>
              <p className="text-xs text-muted-foreground">
                Customize the instructions for the AI to generate your executive summary
              </p>
              
              <Textarea
                className="w-full h-64 resize-none text-sm"
                placeholder="Enter instructions for the AI summary..."
                value={aiPrompt}
                onChange={e => setAiPrompt(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                This prompt will guide the AI in generating your executive summary.
              </p>
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
          ) : step === 2 ? (
            <>
              <Button variant="outline" onClick={() => setStep(1)} disabled={isGenerating}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <Button onClick={() => setStep(3)}>
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep(2)} disabled={isGenerating}>
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
