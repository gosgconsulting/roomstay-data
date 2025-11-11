import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileSpreadsheet, FileText, Globe } from "lucide-react";

interface DataSourceSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectGoogleSheets: () => void;
  onSelectCSV: () => void;
  onSelectAPI: () => void;
}

export const DataSourceSelectionModal = ({
  open,
  onOpenChange,
  onSelectGoogleSheets,
  onSelectCSV,
  onSelectAPI,
}: DataSourceSelectionModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Select Data Source Type</DialogTitle>
          <DialogDescription>
            Choose how you want to import your data
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <Card 
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={onSelectGoogleSheets}
          >
            <CardHeader className="text-center pb-4">
              <div className="flex justify-center mb-2">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileSpreadsheet className="h-6 w-6 text-primary" />
                </div>
              </div>
              <CardTitle className="text-lg">Google Sheets</CardTitle>
              <CardDescription className="text-sm">
                Import data from Google Sheets
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center text-xs text-muted-foreground">
              Connect your spreadsheet with a URL
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={onSelectCSV}
          >
            <CardHeader className="text-center pb-4">
              <div className="flex justify-center mb-2">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
              </div>
              <CardTitle className="text-lg">CSV Import</CardTitle>
              <CardDescription className="text-sm">
                Import data from a CSV file
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center text-xs text-muted-foreground">
              Upload or Connect to a CSV file
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:border-primary transition-colors opacity-50"
            onClick={onSelectAPI}
          >
            <CardHeader className="text-center pb-4">
              <div className="flex justify-center mb-2">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Globe className="h-6 w-6 text-primary" />
                </div>
              </div>
              <CardTitle className="text-lg">API</CardTitle>
              <CardDescription className="text-sm">
                Connect to API endpoint
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center text-xs text-muted-foreground">
              Coming soon
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};
