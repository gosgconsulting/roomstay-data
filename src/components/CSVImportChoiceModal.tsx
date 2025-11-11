import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, Globe } from "lucide-react";

interface CSVImportChoiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectUpload: () => void;
  onSelectURL: () => void;
}

export const CSVImportChoiceModal = ({
  open,
  onOpenChange,
  onSelectUpload,
  onSelectURL,
}: CSVImportChoiceModalProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import CSV Data</DialogTitle>
          <DialogDescription>
            Choose how you want to import your CSV data
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <Card 
            className="cursor-pointer hover:border-primary transition-colors opacity-50"
            onClick={onSelectUpload}
          >
            <CardHeader className="text-center pb-4">
              <div className="flex justify-center mb-2">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Upload className="h-6 w-6 text-primary" />
                </div>
              </div>
              <CardTitle className="text-lg">Upload CSV File</CardTitle>
              <CardDescription className="text-sm">
                Upload a CSV file from your computer
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center text-xs text-muted-foreground">
              Coming soon
            </CardContent>
          </Card>

          <Card 
            className="cursor-pointer hover:border-primary transition-colors"
            onClick={onSelectURL}
          >
            <CardHeader className="text-center pb-4">
              <div className="flex justify-center mb-2">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Globe className="h-6 w-6 text-primary" />
                </div>
              </div>
              <CardTitle className="text-lg">CSV URL</CardTitle>
              <CardDescription className="text-sm">
                Import data from a CSV file URL
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center text-xs text-muted-foreground">
              Connect to a CSV file online
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};

