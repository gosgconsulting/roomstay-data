import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Copy, ExternalLink } from "lucide-react";

interface APIBuilderModalProps {
  reportId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MONTHS = [
  { value: 1, label: "Jan" },
  { value: 2, label: "Feb" },
  { value: 3, label: "Mar" },
  { value: 4, label: "Apr" },
  { value: 5, label: "May" },
  { value: 6, label: "Jun" },
  { value: 7, label: "Jul" },
  { value: 8, label: "Aug" },
  { value: 9, label: "Sep" },
  { value: 10, label: "Oct" },
  { value: 11, label: "Nov" },
  { value: 12, label: "Dec" },
];

export const APIBuilderModal = ({ reportId, open, onOpenChange }: APIBuilderModalProps) => {
  const { toast } = useToast();
  
  // Get current month and year for defaults
  const getCurrentDefaults = () => {
    const now = new Date();
    return {
      month: now.getMonth() + 1, // 1-12
      year: now.getFullYear(),
    };
  };

  // Generate available years: current year - 2 to current year
  const getAvailableYears = () => {
    const currentYear = new Date().getFullYear();
    return [currentYear - 2, currentYear - 1, currentYear];
  };

  const [selectedMonths, setSelectedMonths] = useState<number[]>([]);
  const [selectedYears, setSelectedYears] = useState<number[]>([]);
  const [limit, setLimit] = useState("100");
  const [page, setPage] = useState("1");

  // Reset to defaults when modal opens
  useEffect(() => {
    if (open) {
      const defaults = getCurrentDefaults();
      setSelectedMonths([defaults.month]);
      setSelectedYears([defaults.year]);
      setLimit("100");
      setPage("1");
    }
  }, [open]);

  // Toggle month selection
  const toggleMonth = (month: number) => {
    setSelectedMonths(prev => 
      prev.includes(month) 
        ? prev.filter(m => m !== month)
        : [...prev, month].sort((a, b) => a - b)
    );
  };

  // Toggle year selection
  const toggleYear = (year: number) => {
    setSelectedYears(prev =>
      prev.includes(year)
        ? prev.filter(y => y !== year)
        : [...prev, year].sort((a, b) => a - b)
    );
  };

  // Generate month-year combinations in YYYY-MM format
  const generateMonthYearCombos = useCallback(() => {
    const combos: string[] = [];
    for (const year of selectedYears) {
      for (const month of selectedMonths) {
        const monthStr = month.toString().padStart(2, '0');
        combos.push(`${year}-${monthStr}`);
      }
    }
    return combos.sort();
  }, [selectedMonths, selectedYears]);

  // Generate API URL dynamically
  const generateApiUrl = useCallback(() => {
    const params = new URLSearchParams();
    
    // Add months[] parameters
    const combos = generateMonthYearCombos();
    combos.forEach(combo => {
      params.append('months[]', combo);
    });
    
    // Add limit and page
    if (limit) params.append('limit', limit);
    if (page && page !== "1") params.append('page', page);
    
    const baseUrl = `${window.location.origin}/api/reports/${reportId}`;
    const queryString = params.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  }, [reportId, generateMonthYearCombos, limit, page]);

  const apiUrl = generateApiUrl();

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(apiUrl);
    toast({
      title: "URL Copied",
      description: "API URL has been copied to clipboard",
    });
  };

  const handleOpenInNewTab = () => {
    window.open(apiUrl, '_blank');
  };

  const availableYears = getAvailableYears();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>API URL Builder</DialogTitle>
          <DialogDescription>
            Select months and years to filter your API data. Multiple selections will fetch data for all selected combinations.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Month Selection */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Select Months</Label>
            <div className="grid grid-cols-4 gap-2">
              {MONTHS.map(month => (
                <div key={month.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`month-${month.value}`}
                    checked={selectedMonths.includes(month.value)}
                    onCheckedChange={() => toggleMonth(month.value)}
                  />
                  <label
                    htmlFor={`month-${month.value}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    {month.label}
                  </label>
                </div>
              ))}
            </div>
            {selectedMonths.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Select at least one month
              </p>
            )}
          </div>

          {/* Year Selection */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">Select Years</Label>
            <div className="flex flex-wrap gap-4">
              {availableYears.map(year => (
                <div key={year} className="flex items-center space-x-2">
                  <Checkbox
                    id={`year-${year}`}
                    checked={selectedYears.includes(year)}
                    onCheckedChange={() => toggleYear(year)}
                  />
                  <label
                    htmlFor={`year-${year}`}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    {year}
                  </label>
                </div>
              ))}
            </div>
            {selectedYears.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Select at least one year
              </p>
            )}
          </div>

          {/* Selected Combinations Preview */}
          {selectedMonths.length > 0 && selectedYears.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Selected Periods ({generateMonthYearCombos().length})</Label>
              <div className="flex flex-wrap gap-1 p-2 bg-muted rounded-md max-h-24 overflow-y-auto">
                {generateMonthYearCombos().map(combo => (
                  <span key={combo} className="px-2 py-1 bg-primary/10 text-primary text-xs rounded">
                    {combo}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Pagination Controls */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="limit">Results per page</Label>
              <Select value={limit} onValueChange={setLimit}>
                <SelectTrigger id="limit">
                  <SelectValue placeholder="Select limit" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="250">250</SelectItem>
                  <SelectItem value="500">500</SelectItem>
                  <SelectItem value="1000">1,000</SelectItem>
                  <SelectItem value="2500">2,500</SelectItem>
                  <SelectItem value="5000">5,000</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="page">Page Number</Label>
              <Input
                id="page"
                type="number"
                min="1"
                value={page}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === "" || parseInt(val, 10) >= 1) {
                    setPage(val);
                  }
                }}
                placeholder="1"
              />
            </div>
          </div>

          {/* API URL Preview Section */}
          <div className="space-y-2">
            <Label htmlFor="api-url">API URL Preview</Label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Input
                  id="api-url"
                  type="text"
                  value={apiUrl}
                  readOnly
                  className="pr-10 font-mono text-xs"
                  onClick={handleCopyUrl}
                  style={{ cursor: 'pointer' }}
                  title="Click to copy"
                />
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopyUrl}
                title="Copy URL"
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={handleOpenInNewTab}
                title="Open in new tab"
                disabled={selectedMonths.length === 0 || selectedYears.length === 0}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Click the URL or copy button to copy to clipboard
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

