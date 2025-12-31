import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { Copy, ExternalLink, CalendarIcon } from "lucide-react";
import { format } from "date-fns";

interface APIBuilderModalProps {
  reportId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Define available dimensions (5 options)
const DIMENSIONS = [
  { value: 'channel', label: 'Channel' },
  { value: 'device', label: 'Device' },
  { value: 'hotel', label: 'Hotel' },
  { value: 'link_type', label: 'Link Type' },
  { value: 'market', label: 'Market' }
];

export const APIBuilderModal = ({ reportId, open, onOpenChange }: APIBuilderModalProps) => {
  const { toast } = useToast();
  
  // State for date picker (start date), end date is always today
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [limit, setLimit] = useState("100");
  const [page, setPage] = useState("1");
  const [groupBy, setGroupBy] = useState("");                    // Single selection
  const [breakdownBy, setBreakdownBy] = useState<string[]>([]);  // Multiple checkboxes

  // Reset to defaults when modal opens
  useEffect(() => {
    if (open) {
      setStartDate(new Date());
      setLimit("100");
      setPage("1");
      setGroupBy("");
      setBreakdownBy([]);
    }
  }, [open]);

  // Handler: Toggle breakdown dimension
  const toggleBreakdown = (dimension: string) => {
    setBreakdownBy(prev => 
      prev.includes(dimension)
        ? prev.filter(d => d !== dimension)
        : [...prev, dimension]
    );
  };

  // Handler: When groupBy changes, reset breakdowns
  const handleGroupByChange = (value: string) => {
    setGroupBy(value);
    setBreakdownBy([]);  // Clear breakdowns when group changes
  };

  // Generate API URL dynamically
  const generateApiUrl = useCallback(() => {
    const params = new URLSearchParams();
    
    // Format dates as YYYY-MM-DD
    const dateFrom = format(startDate, 'yyyy-MM-dd');
    const dateTo = format(new Date(), 'yyyy-MM-dd');
    
    params.append('date_from', dateFrom);
    params.append('date_to', dateTo);
    
    // Add limit and page
    if (limit) params.append('limit', limit);
    if (page && page !== "1") params.append('page', page);
    
    // Add grouping parameters
    if (groupBy) {
      params.append('groupby', groupBy);
      
      // Add multiple breakdown dimensions
      breakdownBy.forEach(bd => {
        params.append('breakdownby[]', bd);
      });
    }
    
    const baseUrl = `${window.location.origin}/api/reports/${reportId}`;
    const queryString = params.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  }, [reportId, startDate, limit, page, groupBy, breakdownBy]);

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>API URL Builder</DialogTitle>
          <DialogDescription>
            Select start date to filter data. End date is automatically set to today.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Date Range */}
          <div className="space-y-2">
            <Label>Start Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(startDate, 'PPP')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={(date) => date && setStartDate(date)}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            <p className="text-xs text-muted-foreground">
              End date is set to today
            </p>
          </div>

          {/* Grouping Section */}
          <div className="space-y-2">
            <Label>Select Dimension (Group By)</Label>
            <Select value={groupBy} onValueChange={handleGroupByChange}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a dimension..." />
              </SelectTrigger>
              <SelectContent>
                {DIMENSIONS.map(dim => (
                  <SelectItem key={dim.value} value={dim.value}>
                    {dim.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Breakdown Section (appears only when groupBy is selected) */}
          {groupBy && (
            <div className="space-y-2 border rounded-lg p-3 bg-muted/30">
              <Label>Breakdown Dimensions</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Select one or more dimensions to breakdown data
              </p>
              <div className="space-y-2">
                {DIMENSIONS.filter(d => d.value !== groupBy).map(dim => (
                  <div key={dim.value} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id={`breakdown-${dim.value}`}
                      checked={breakdownBy.includes(dim.value)}
                      onChange={() => toggleBreakdown(dim.value)}
                      className="w-4 h-4 rounded border-gray-300"
                    />
                    <label 
                      htmlFor={`breakdown-${dim.value}`}
                      className="text-sm font-medium leading-none cursor-pointer"
                    >
                      {dim.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Limit + Page (2 columns) */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="limit">Results per page</Label>
              <Select value={limit} onValueChange={setLimit}>
                <SelectTrigger id="limit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="25">25</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                  <SelectItem value="100">100</SelectItem>
                  <SelectItem value="200">200</SelectItem>
                  <SelectItem value="500">500</SelectItem>
                  <SelectItem value="1000">1000</SelectItem>
                  <SelectItem value="5000">5000</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="page">Page</Label>
              <Input
                id="page"
                type="number"
                min="1"
                value={page}
                onChange={(e) => setPage(e.target.value)}
                placeholder="1"
              />
            </div>
          </div>

          {/* Info Message */}
          {groupBy && (
            <div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950 p-2 rounded border border-blue-200 dark:border-blue-800">
              <strong>Aggregation enabled:</strong> Data grouped by {DIMENSIONS.find(d => d.value === groupBy)?.label}
              {breakdownBy.length > 0 && ` with ${breakdownBy.length} breakdown dimension(s)`}. 
              Metrics will be summed and conversion_rate calculated.
            </div>
          )}

          {/* API URL Preview */}
          <div className="space-y-2">
            <Label htmlFor="api-url">API URL</Label>
            <div className="flex gap-2">
              <Input
                id="api-url"
                value={apiUrl}
                readOnly
                className="font-mono text-xs"
              />
              <Button variant="outline" size="icon" onClick={handleCopyUrl}>
                <Copy className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" onClick={handleOpenInNewTab}>
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

