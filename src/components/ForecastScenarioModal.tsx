import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { supabase } from "@/integrations/supabase/client";

type ForecastScenario = {
  id: string;
  name: string;
  email?: string | null;
  average_daily_rate?: number | null;
  direct_bookings_target?: number | null; // % Direct Revenue
  rooms?: number | null;
  occupancy_rate?: number | null; // % (0-100)
  cost_of_sell: number; // decimal (0-1)
  conversion_rate: number; // decimal (0-1)
  created_at: string;
};

interface ForecastScenarioModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scenario: ForecastScenario | null;
}

const formatCurrency0 = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);

const formatCurrency2 = (value: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

const formatPercent = (decimal: number) => `${(decimal * 100).toFixed(2)}%`;

export default function ForecastScenarioModal({ open, onOpenChange, scenario }: ForecastScenarioModalProps) {
  const [period, setPeriod] = React.useState<"month" | "year">("month");
  // Load services for the scenario
  type ServiceRow = { 
    id: string; 
    name: string; 
    weight: number; 
    cost_of_sell: number; 
    recurrent_fee: number; 
    percent_cost: number; 
    percent_revenue: number; 
  };
  const [services, setServices] = React.useState<ServiceRow[]>([]);

  React.useEffect(() => {
    const loadServices = async () => {
      if (!scenario?.id) {
        setServices([]);
        return;
      }
      const { data } = await (supabase as any)
        .from("forecast_services")
        .select("*")
        .eq("forecast_id", scenario.id)
        .order("created_at", { ascending: false }) as { data: ServiceRow[] | null };
      setServices(data || []);
    };
    loadServices();
  }, [scenario?.id, open]);

  // Inputs (safe defaults)
  const adr = Number(scenario?.average_daily_rate ?? 0);
  const directRevenuePct = Number(scenario?.direct_bookings_target ?? 0);
  const rooms = Number(scenario?.rooms ?? 0);
  const occPct = Number(scenario?.occupancy_rate ?? 0);
  const convRate = Number(scenario?.conversion_rate ?? 0); // decimal

  // Base monthly metrics
  const monthly = React.useMemo(() => {
    const revenue = adr * rooms * 30 * (occPct / 100);
    const paidRevenue = revenue * (directRevenuePct / 100);
    const bookings = convRate > 0 ? revenue * convRate : 0;
    return { revenue, paidRevenue, bookings };
  }, [adr, rooms, occPct, directRevenuePct, convRate]);

  const yearly = React.useMemo(() => ({
    revenue: monthly.revenue * 12,
    paidRevenue: monthly.paidRevenue * 12,
    bookings: monthly.bookings * 12
  }), [monthly]);

  const base = period === "month" ? monthly : yearly;

  // Compute per-service metrics from weights → shares
  const serviceShares = React.useMemo(() => {
    const total = services.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);
    return services.map(s => ({
      ...s,
      share: total > 0 ? (Number(s.weight) || 0) / total : 0
    }));
  }, [services]);

  const perService = React.useMemo(() => {
    return serviceShares.map(s => {
      const revenue = base.paidRevenue * s.share;
      const cost = revenue * ((Number(s.cost_of_sell) || 0) / 100);
      const recurrentFee = period === "year" ? (Number(s.recurrent_fee) || 0) * 12 : (Number(s.recurrent_fee) || 0);

      // FIX: Cost Fee is based on Cost, not Revenue
      const costFee = cost * ((Number(s.percent_cost) || 0) / 100);
      // Revenue Fee remains based on Revenue
      const revenueFee = revenue * ((Number(s.percent_revenue) || 0) / 100);

      const totalCostValue = cost + recurrentFee + costFee + revenueFee;
      const totalCostPct = revenue > 0 ? totalCostValue / revenue : 0;

      return {
        key: s.id,
        name: s.name,
        revenue,
        cost,
        recurrentFee,
        costFee,
        revenueFee,
        totalCostValue,
        totalCostPct,
        percentCost: Number(s.percent_cost || 0),
        percentRevenue: Number(s.percent_revenue || 0),
      };
    });
  }, [serviceShares, base, period]);

  if (!scenario) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[720px] bg-background">
          <DialogHeader>
            <DialogTitle>Forecast Scenario</DialogTitle>
            <DialogDescription>Select a scenario to view details.</DialogDescription>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">No scenario selected.</div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1100px] bg-background">
        <DialogHeader>
          <DialogTitle>Forecast: {scenario.name}</DialogTitle>
          <DialogDescription>
            Per-service metrics are computed from the configured Services.
          </DialogDescription>
        </DialogHeader>

        {/* Scenario badges */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Rooms: {Number(scenario.rooms || 0)}</Badge>
          <Badge variant="outline">ADR: {formatCurrency2(Number(scenario.average_daily_rate || 0))}</Badge>
          <Badge variant="outline">Occupancy: {Number(scenario.occupancy_rate || 0).toFixed(2)}%</Badge>
          <Badge variant="outline">Direct Revenue %: {Number(scenario.direct_bookings_target || 0).toFixed(2)}%</Badge>
          <Badge variant="outline">Conv. Rate: {formatPercent(Number(scenario.conversion_rate || 0))}</Badge>
        </div>

        {/* Period toggle */}
        <div className="mt-4">
          <ToggleGroup type="single" value={period} onValueChange={(v) => v && setPeriod(v as "month" | "year")} className="justify-start">
            <ToggleGroupItem value="month" aria-label="Month">Month</ToggleGroupItem>
            <ToggleGroupItem value="year" aria-label="Year">Year</ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* NEW: Summary card with Total Revenue and scenario info */}
        <div className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Total Revenue</CardTitle>
              <div className="text-xs text-muted-foreground">Based on forecast</div>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span>Hotel Name</span>
                <span className="font-medium">{scenario.name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Rooms</span>
                <span className="font-medium">{Number(scenario.rooms || 0)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>ADR</span>
                <span className="font-medium">{formatCurrency2(Number(scenario.average_daily_rate || 0))}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Occupancy Rate</span>
                <span className="font-medium">{Number(scenario.occupancy_rate || 0).toFixed(2)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Direct Revenue %</span>
                <span className="font-medium">{Number(scenario.direct_bookings_target || 0).toFixed(2)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Conv Rate</span>
                <span className="font-medium">{formatPercent(Number(scenario.conversion_rate || 0))}</span>
              </div>
              <div className="flex items-center justify-between pt-2">
                <span className="font-semibold">Total Revenue</span>
                <span className="font-semibold">{formatCurrency0(base.revenue)}</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* UPDATED Layout: only per-service cards (removed total KPIs sidebar) */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {perService.length === 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">No Services</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Add services to this scenario to see detailed breakdown.
              </CardContent>
            </Card>
          ) : (
            perService.map((svc) => (
              <Card key={svc.key}>
                <CardHeader>
                  <CardTitle className="text-base">{svc.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span>Revenue</span>
                    <span className="font-medium">{formatCurrency0(svc.revenue)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Cost</span>
                    <span className="font-medium">{formatCurrency2(svc.cost)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Recurrent Fee</span>
                    <span className="font-medium">{formatCurrency2(svc.recurrentFee)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Cost Fee ({svc.percentCost.toFixed(2)}%)</span>
                    <span className="font-medium">{formatCurrency2(svc.costFee)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Revenue Fee ({svc.percentRevenue.toFixed(2)}%)</span>
                    <span className="font-medium">{formatCurrency2(svc.revenueFee)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Total Cost</span>
                    <span className="font-semibold">
                      {formatCurrency2(svc.totalCostValue)} ({(svc.totalCostPct * 100).toFixed(2)}%)
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}