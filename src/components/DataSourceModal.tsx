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

interface DataSourceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const DataSourceModal = ({ open, onOpenChange }: DataSourceModalProps) => {
  const [dataName, setDataName] = useState("");
  const [url, setUrl] = useState("");
  const [tabName, setTabName] = useState("");
  const [headerRow, setHeaderRow] = useState("1");

  const handleAdd = () => {
    if (!dataName || !url) {
      toast({
        title: "Missing fields",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Data source added",
      description: `Successfully connected to ${dataName}`,
    });

    onOpenChange(false);
    setDataName("");
    setUrl("");
    setTabName("");
    setHeaderRow("1");
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
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleAdd}>Add Data Source</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
