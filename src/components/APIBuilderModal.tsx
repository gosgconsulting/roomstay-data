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

export const APIBuilderModal = ({ reportId, open, onOpenChange }: APIBuilderModalProps) => {
  const { toast } = useToast();
  
  // State for date picker (start date), end date is always today
  const [startDate, setStartDate] = useState<Date>(new Date());
  const [limit, setLimit] = useState("100");
  const [page, setPage] = useState("1");

  // Reset to defaults when modal opens
  useEffect(() => {
    if (open) {
      setStartDate(new Date());
      setLimit("100");
      setPage("1");
    }
  }, [open]);

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
    
    const baseUrl = `${window.location.origin}/api/reports/${reportId}`;
    const queryString = params.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  }, [reportId, startDate, limit, page]);

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

        <div className="space-y-6 py-4">
          {/* Date Picker */}
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
              End date is automatically set to today ({format(new Date(), 'PPP')})
            </p>
          </div>

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

