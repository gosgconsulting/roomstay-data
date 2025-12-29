import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Copy, ExternalLink } from "lucide-react";

interface APIBuilderModalProps {
  reportId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const APIBuilderModal = ({ reportId, open, onOpenChange }: APIBuilderModalProps) => {
  const { toast } = useToast();
  
  // Default date range: last 30 days
  const getDefaultDates = () => {
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(today.getDate() - 30);
    
    return {
      start: thirtyDaysAgo.toISOString().split('T')[0],
      end: today.toISOString().split('T')[0]
    };
  };
  
  const defaultDates = getDefaultDates();
  const [dateStart, setDateStart] = useState(defaultDates.start);
  const [dateEnd, setDateEnd] = useState(defaultDates.end);
  const [limit, setLimit] = useState("100");

  // Reset to defaults when modal opens
  useEffect(() => {
    if (open) {
      const defaults = getDefaultDates();
      setDateStart(defaults.start);
      setDateEnd(defaults.end);
      setLimit("100");
    }
  }, [open]);

  // Generate API URL dynamically
  const generateApiUrl = () => {
    const params = new URLSearchParams();
    if (dateStart) params.append('date_start', dateStart);
    if (dateEnd) params.append('date_end', dateEnd);
    if (limit) params.append('limit', limit);
    
    const baseUrl = `${window.location.origin}/api/reports/${reportId}`;
    const queryString = params.toString();
    return queryString ? `${baseUrl}?${queryString}` : baseUrl;
  };

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

  // Validate dates
  const isDateValid = !dateStart || !dateEnd || dateStart <= dateEnd;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Please select the date range and limit for your API request</DialogTitle>
          <DialogDescription>
            Configure query parameters to generate your custom API endpoint URL
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Date Range Section */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="date-start">Start Date</Label>
                <Input
                  id="date-start"
                  type="date"
                  value={dateStart}
                  onChange={(e) => setDateStart(e.target.value)}
                  max={dateEnd}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date-end">End Date</Label>
                <Input
                  id="date-end"
                  type="date"
                  value={dateEnd}
                  onChange={(e) => setDateEnd(e.target.value)}
                  min={dateStart}
                />
              </div>
            </div>
            {!isDateValid && (
              <p className="text-sm text-destructive">
                Start date must be before or equal to end date
              </p>
            )}
          </div>

          {/* Limit Section */}
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
                <SelectItem value="200">200</SelectItem>
                <SelectItem value="500">500</SelectItem>
                <SelectItem value="1000">1000</SelectItem>
              </SelectContent>
            </Select>
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
                disabled={!isDateValid}
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

