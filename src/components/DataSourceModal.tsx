import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface DataSourceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const DataSourceModal = ({ open, onOpenChange }: DataSourceModalProps) => {
  const [dataName, setDataName] = useState("");
  const [url, setUrl] = useState("");
  const [tabName, setTabName] = useState("");
  const [headerRow, setHeaderRow] = useState("1");
  const [isLoading, setIsLoading] = useState(false);

  const extractSpreadsheetId = (url: string) => {
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  };

  const handleAdd = async () => {
    if (!dataName || !url) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    const spreadsheetId = extractSpreadsheetId(url);
    if (!spreadsheetId) {
      toast({
        title: "Invalid URL",
        description: "Please provide a valid Google Sheets URL",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('fetch-google-sheets', {
        body: {
          spreadsheetId,
          tabName: tabName || undefined,
          range: `${headerRow}:${headerRow}`,
        },
      });

      if (error) throw error;

      if (data?.values && data.values.length > 0) {
        toast({
          title: "Data source connected",
          description: `Successfully connected to ${dataName} with ${data.values[0].length} columns`,
        });
        
        onOpenChange(false);
        setDataName("");
        setUrl("");
        setTabName("");
        setHeaderRow("1");
      } else {
        throw new Error("No data found in the specified range");
      }
    } catch (error) {
      console.error("Error connecting to Google Sheets:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to connect to Google Sheets";
      toast({
        title: "Connection failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Add Google Sheets Data Source
          </DialogTitle>
          <DialogDescription>
            Connect your Google Sheets data to this report
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="dataName">Data Name *</Label>
            <Input
              id="dataName"
              placeholder="e.g., Hotel Performance Data"
              value={dataName}
              onChange={(e) => setDataName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="url">Google Sheets URL *</Label>
            <Input
              id="url"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tabName">Tab Name</Label>
              <Input
                id="tabName"
                placeholder="Sheet1"
                value={tabName}
                onChange={(e) => setTabName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="headerRow">Header Row Number</Label>
              <Input
                id="headerRow"
                type="number"
                min="1"
                value={headerRow}
                onChange={(e) => setHeaderRow(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleAdd} disabled={isLoading}>
            {isLoading ? "Connecting..." : "Add Data Source"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
