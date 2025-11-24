import React from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

interface YearRangeFilterProps {
  selectedYear: number;
  onYearChange: (year: number) => void;
}

const YearRangeFilter: React.FC<YearRangeFilterProps> = ({
  selectedYear,
  onYearChange,
}) => {
  const currentYear = new Date().getFullYear();
  
  // Generate year options (current year ± 5 years)
  const generateYearOptions = () => {
    const years = [];
    for (let i = currentYear - 5; i <= currentYear + 5; i++) {
      years.push(i);
    }
    return years;
  };

  const yearOptions = generateYearOptions();

  const renderButtonLabel = () => {
    if (selectedYear === currentYear) {
      return "This Year";
    }
    return selectedYear.toString();
  };

  const handlePreviousYear = () => {
    onYearChange(selectedYear - 1);
  };

  const handleNextYear = () => {
    onYearChange(selectedYear + 1);
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-muted-foreground">Year</label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              "w-[150px] justify-start text-left font-normal bg-background"
            )}
          >
            <Calendar className="mr-2 h-4 w-4" />
            {renderButtonLabel()}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 bg-background z-50" align="start">
          <div className="p-3">
            {/* Year Navigation */}
            <div className="flex items-center justify-between mb-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handlePreviousYear}
                className="h-8 w-8 p-0"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-medium text-sm">{selectedYear}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleNextYear}
                className="h-8 w-8 p-0"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Quick Year Presets */}
            <div className="space-y-1 mb-3">
              <Button
                variant={selectedYear === currentYear ? "default" : "outline"}
                size="sm"
                onClick={() => onYearChange(currentYear)}
                className="w-full text-xs h-7"
              >
                This Year ({currentYear})
              </Button>
              <Button
                variant={selectedYear === currentYear - 1 ? "default" : "outline"}
                size="sm"
                onClick={() => onYearChange(currentYear - 1)}
                className="w-full text-xs h-7"
              >
                Last Year ({currentYear - 1})
              </Button>
            </div>

            {/* Year Grid */}
            <div className="border-t pt-3">
              <div className="grid grid-cols-3 gap-1">
                {yearOptions.map((year) => (
                  <Button
                    key={year}
                    variant={selectedYear === year ? "default" : "outline"}
                    size="sm"
                    onClick={() => onYearChange(year)}
                    className="text-xs h-7 px-2"
                  >
                    {year}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default YearRangeFilter;
