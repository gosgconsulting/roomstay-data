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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { FileSpreadsheet, ChevronLeft } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface DataSourceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const DataSourceModal = ({ open, onOpenChange }: DataSourceModalProps) => {
  const [step, setStep] = useState(1);
  const [dataName, setDataName] = useState("");
  const [url, setUrl] = useState("");
  const [availableTabs, setAvailableTabs] = useState<string[]>([]);
  const [selectedTab, setSelectedTab] = useState("");
  const [headerRow, setHeaderRow] = useState("1");
  const [isLoading, setIsLoading] = useState(false);

  const extractSpreadsheetId = (url: string) => {
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    return match ? match[1] : null;
  };

  const handleNext = async () => {
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
          action: 'metadata',
        },
      });

      if (error) throw error;

      if (data?.sheets && data.sheets.length > 0) {
        const tabs = data.sheets.map((sheet: any) => sheet.title);
        setAvailableTabs(tabs);
        setSelectedTab(tabs[0]);
        setStep(2);
      } else {
        throw new Error("No sheets found in the spreadsheet");
      }
    } catch (error) {
      console.error("Error fetching spreadsheet metadata:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to fetch spreadsheet information";
      toast({
        title: "Connection failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!selectedTab) {
      toast({
        title: "Missing tab",
        description: "Please select a tab",
        variant: "destructive",
      });
      return;
    }

    const spreadsheetId = extractSpreadsheetId(url);
    if (!spreadsheetId) return;

    setIsLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('fetch-google-sheets', {
        body: {
          spreadsheetId,
          tabName: selectedTab,
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
        resetForm();
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

  const resetForm = () => {
    setStep(1);
    setDataName("");
    setUrl("");
    setAvailableTabs([]);
    setSelectedTab("");
    setHeaderRow("1");
  };

  const handleBack = () => {
    setStep(1);
    setAvailableTabs([]);
    setSelectedTab("");
  };

  return (
    <Dialog open={open} onOpenChange={(open) => {
      onOpenChange(open);
      if (!open) resetForm();
    }}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === 2 && (
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 -ml-2"
                onClick={handleBack}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            )}
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            Add Google Sheets Data Source
          </DialogTitle>
          <DialogDescription>
            {step === 1 
              ? "Enter your Google Sheets URL and data name"
              : "Select the tab and specify the header row"
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {step === 1 ? (
            <>
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
            </>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="tabName">Select Tab *</Label>
                <Select value={selectedTab} onValueChange={setSelectedTab}>
                  <SelectTrigger id="tabName">
                    <SelectValue placeholder="Select a tab" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTabs.map((tab) => (
                      <SelectItem key={tab} value={tab}>
                        {tab}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
            </>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button 
            variant="outline" 
            onClick={() => {
              onOpenChange(false);
              resetForm();
            }} 
            disabled={isLoading}
          >
            Cancel
          </Button>
          {step === 1 ? (
            <Button onClick={handleNext} disabled={isLoading}>
              {isLoading ? "Fetching..." : "Next"}
            </Button>
          ) : (
            <Button onClick={handleAdd} disabled={isLoading}>
              {isLoading ? "Connecting..." : "Add Data Source"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
