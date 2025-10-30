import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { Settings2 } from "lucide-react";
import { useState } from "react";

interface MappingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kpiName: string;
}

const dataSources = ["Hotel Performance Data", "Marketing Data", "Revenue Data"];
const kpiFields = [
  "impressions",
  "clicks",
  "cost",
  "bookings",
  "revenue",
  "conversion_rate",
  "roas",
];

export const MappingModal = ({ open, onOpenChange, kpiName }: MappingModalProps) => {
  const [dataSource, setDataSource] = useState("");
  const [kpiField, setKpiField] = useState("");

  const handleSave = () => {
    if (!dataSource || !kpiField) {
      toast({
        title: "Missing selection",
        description: "Please select both data source and KPI field",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Mapping saved",
      description: `${kpiName} is now mapped to ${kpiField} from ${dataSource}`,
    });

    onOpenChange(false);
    setDataSource("");
    setKpiField("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-primary" />
            KPI Mapping
          </DialogTitle>
          <DialogDescription>
            Map "{kpiName}" to a data source field
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="dataSource">Data Source</Label>
            <Select value={dataSource} onValueChange={setDataSource}>
              <SelectTrigger id="dataSource">
                <SelectValue placeholder="Select data source" />
              </SelectTrigger>
              <SelectContent>
                {dataSources.map((source) => (
                  <SelectItem key={source} value={source}>
                    {source}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="kpiField">KPI Field</Label>
            <Select value={kpiField} onValueChange={setKpiField}>
              <SelectTrigger id="kpiField">
                <SelectValue placeholder="Select KPI field" />
              </SelectTrigger>
              <SelectContent>
                {kpiFields.map((field) => (
                  <SelectItem key={field} value={field}>
                    {field.replace(/_/g, " ").toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Mapping</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
