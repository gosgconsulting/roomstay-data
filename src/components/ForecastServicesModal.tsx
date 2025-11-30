import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";

interface ForecastServicesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  forecastId: string | null;
}

type ServiceRow = {
  id: string;
  name: string;
  weight: number;
  cost_of_sell: number;
  recurrent_fee: number;
  percent_cost: number;
  percent_revenue: number;
};

export default function ForecastServicesModal({ open, onOpenChange, forecastId }: ForecastServicesModalProps) {
  const [services, setServices] = React.useState<ServiceRow[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    const load = async () => {
      if (!forecastId) {
        setServices([]);
        return;
      }
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("forecast_services")
        .select("*")
        .eq("forecast_id", forecastId)
        .order("created_at", { ascending: false }) as { data: ServiceRow[] | null; error: any };
      if (!error && data) setServices(data);
      setLoading(false);
    };
    load();
  }, [forecastId, open]);

    return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] bg-background">
        <DialogHeader>
          <DialogTitle>Services</DialogTitle>
        </DialogHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service Name</TableHead>
                <TableHead>% Weight</TableHead>
                <TableHead>% Cost of Sale</TableHead>
                <TableHead>Recurrent fee</TableHead>
                <TableHead>% Cost</TableHead>
                <TableHead>% Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">Loading services...</TableCell>
                </TableRow>
              ) : services.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-muted-foreground">No services saved for this scenario.</TableCell>
                </TableRow>
              ) : (
                services.map(s => (
                  <TableRow key={s.id}>
                    <TableCell>{s.name}</TableCell>
                    <TableCell>{Number(s.weight || 0).toFixed(2)}%</TableCell>
                    <TableCell>{Number(s.cost_of_sell || 0).toFixed(2)}%</TableCell>
                    <TableCell>${Number(s.recurrent_fee || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}</TableCell>
                    <TableCell>{Number(s.percent_cost || 0).toFixed(2)}%</TableCell>
                    <TableCell>{Number(s.percent_revenue || 0).toFixed(2)}%</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}