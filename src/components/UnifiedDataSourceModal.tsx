import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Loader2, ExternalLink } from "lucide-react";

interface UnifiedDataSourceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: string;
  sourceType: 'google_sheets' | 'csv_url';
  onSuccess: () => void;
}

export function UnifiedDataSourceModal({
  open,
  onOpenChange,
  reportId,
  sourceType,
  onSuccess,
}: UnifiedDataSourceModalProps) {
  const [name, setName] = useState("");
  const [googleSheetsUrl, setGoogleSheetsUrl] = useState("");
  const [csvUrl, setCsvUrl] = useState("");
  const [tabName, setTabName] = useState("");
  const [headerRow, setHeaderRow] = useState("1");
  const [isLoading, setIsLoading] = useState(false);

  // Reset form when modal opens/closes or source type changes
  useEffect(() => {
    if (open) {
      setName("");
      setGoogleSheetsUrl("");
      setCsvUrl("");
      setTabName("");
      setHeaderRow("1");
    }
  }, [open, sourceType]);

  const extractSpreadsheetId = (url: string): string | null => {
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  };

  const validateForm = (): boolean => {
    if (!name.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter a data source name.",
        variant: "destructive",
      });
      return false;
    }

    if (sourceType === 'google_sheets') {
      if (!googleSheetsUrl.trim()) {
        toast({
          title: "Validation Error",
          description: "Please enter a Google Sheets URL.",
          variant: "destructive",
        });
        return false;
      }

      if (!extractSpreadsheetId(googleSheetsUrl)) {
        toast({
          title: "Validation Error",
          description: "Please enter a valid Google Sheets URL.",
          variant: "destructive",
        });
        return false;
      }

      if (!tabName.trim()) {
        toast({
          title: "Validation Error",
          description: "Please enter a tab/sheet name.",
          variant: "destructive",
        });
        return false;
      }
    } else if (sourceType === 'csv_url') {
      if (!csvUrl.trim()) {
        toast({
          title: "Validation Error",
          description: "Please enter a CSV URL.",
          variant: "destructive",
        });
        return false;
      }

      try {
        new URL(csvUrl);
      } catch {
        toast({
          title: "Validation Error",
          description: "Please enter a valid CSV URL.",
          variant: "destructive",
        });
        return false;
      }
    }

    const headerRowNum = parseInt(headerRow);
    if (isNaN(headerRowNum) || headerRowNum < 1) {
      toast({
        title: "Validation Error",
        description: "Header row must be a positive number.",
        variant: "destructive",
      });
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      const dataSourceData: any = {
        report_id: reportId,
        name: name.trim(),
        source_type: sourceType,
        header_row: parseInt(headerRow),
      };

      if (sourceType === 'google_sheets') {
        const spreadsheetId = extractSpreadsheetId(googleSheetsUrl);
        dataSourceData.google_sheets_url = googleSheetsUrl.trim();
        dataSourceData.spreadsheet_id = spreadsheetId;
        dataSourceData.tab_name = tabName.trim();
      } else if (sourceType === 'csv_url') {
        dataSourceData.csv_url = csvUrl.trim();
      }

      const { error } = await supabase
        .from("data_sources")
        .insert(dataSourceData);

      if (error) throw error;

      toast({
        title: "Success",
        description: `${sourceType === 'google_sheets' ? 'Google Sheets' : 'CSV'} data source created successfully.`,
      });

      onSuccess();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error creating data source:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create data source.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getModalTitle = () => {
    return sourceType === 'google_sheets' 
      ? 'Add Google Sheets Data Source' 
      : 'Add CSV Data Source';
  };

  const getUrlPlaceholder = () => {
    return sourceType === 'google_sheets'
      ? 'https://docs.google.com/spreadsheets/d/...'
      : 'https://example.com/data.csv';
  };

  const getUrlLabel = () => {
    return sourceType === 'google_sheets' ? 'Google Sheets URL' : 'CSV URL';
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {getModalTitle()}
            {sourceType === 'google_sheets' && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open('https://sheets.google.com', '_blank')}
                className="p-1 h-auto"
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="name">Data Source Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter a descriptive name"
              disabled={isLoading}
            />
          </div>

          <div>
            <Label htmlFor="url">{getUrlLabel()}</Label>
            <Input
              id="url"
              value={sourceType === 'google_sheets' ? googleSheetsUrl : csvUrl}
              onChange={(e) => {
                if (sourceType === 'google_sheets') {
                  setGoogleSheetsUrl(e.target.value);
                } else {
                  setCsvUrl(e.target.value);
                }
              }}
              placeholder={getUrlPlaceholder()}
              disabled={isLoading}
            />
            {sourceType === 'google_sheets' && (
              <p className="text-sm text-muted-foreground mt-1">
                Make sure the Google Sheet is publicly accessible or shared with view permissions.
              </p>
            )}
          </div>

          {sourceType === 'google_sheets' && (
            <div>
              <Label htmlFor="tabName">Sheet/Tab Name</Label>
              <Input
                id="tabName"
                value={tabName}
                onChange={(e) => setTabName(e.target.value)}
                placeholder="Sheet1"
                disabled={isLoading}
              />
              <p className="text-sm text-muted-foreground mt-1">
                The name of the specific sheet/tab within the Google Sheets document.
              </p>
            </div>
          )}

          <div>
            <Label htmlFor="headerRow">Header Row</Label>
            <Select value={headerRow} onValueChange={setHeaderRow} disabled={isLoading}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[1, 2, 3, 4, 5].map((row) => (
                  <SelectItem key={row} value={row.toString()}>
                    Row {row}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground mt-1">
              The row number where your column headers are located.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create Data Source
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}