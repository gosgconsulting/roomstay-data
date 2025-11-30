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
      const paidRevenueShare = base.paidRevenue * s.share;
      const commissions = paidRevenueShare * ((Number(s.percent_revenue) || 0) / 100);
      const variableCost = paidRevenueShare * ((Number(s.cost_of_sell) || 0) / 100);
      const recurrent = period === "year" ? (Number(s.recurrent_fee) || 0) * 12 : (Number(s.recurrent_fee) || 0);
      const yourCost = variableCost + recurrent;
      const savings = commissions - yourCost;
      const bookings = base.bookings * s.share;
      return {
        key: s.id,
        name: s.name,
        paidRevenue: paidRevenueShare,
        commissions,
        yourCost,
        savings,
        bookings
      };
    });
  }, [serviceShares, base, period]);

  const aggregated = React.useMemo(() => {
    if (perService.length > 0) {
      const commissions = perService.reduce((sum, ch) => sum + ch.commissions, 0);
      const yourCost = perService.reduce((sum, ch) => sum + ch.yourCost, 0);
      const savings = commissions - yourCost;
      // Weighted avg cost-of-sale for Max CPC
      const totalShare = serviceShares.reduce((sum, s) => sum + s.share, 0);
      const avgCostRate = totalShare > 0 ? serviceShares.reduce((sum, s) => sum + s.share * ((Number(s.cost_of_sell) || 0) / 100), 0) / totalShare : Number(scenario?.cost_of_sell || 0);
      const maxCpc = convRate > 0 ? (adr * avgCostRate) / convRate : 0;
      return { commissions, yourCost, savings, maxCpc };
    } else {
      // Fallback: use scenario cost_of_sell and a default commission (15%)
      const fallbackCommissionRate = 0.15;
      const commissions = base.paidRevenue * fallbackCommissionRate;
      const yourCost = base.paidRevenue * (Number(scenario?.cost_of_sell || 0));
      const savings = commissions - yourCost;
      const maxCpc = convRate > 0 ? (adr * Number(scenario?.cost_of_sell || 0)) / convRate : 0;
      return { commissions, yourCost, savings, maxCpc };
    }
  }, [perService, base, convRate, adr, scenario?.cost_of_sell, serviceShares]);

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
            KPIs and per-service breakdown are computed from the configured Services.
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

        {/* Layout: KPI sidebar + per-service cards */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* KPI Sidebar */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">KPIs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span>Revenue</span>
                <span className="font-medium">{formatCurrency0(base.revenue)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Paid Revenue</span>
                <span className="font-medium">{formatCurrency0(base.paidRevenue)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Commissions</span>
                <span className="font-medium">{formatCurrency2(aggregated.commissions)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Your Cost</span>
                <span className="font-medium">{formatCurrency2(aggregated.yourCost)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Savings vs Commission</span>
                <span className={`font-semibold ${aggregated.savings >= 0 ? "text-emerald-600" : "text-red-600"}`}>{formatCurrency2(aggregated.savings)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Estimated Bookings</span>
                <span className="font-medium">{Math.floor(base.bookings).toLocaleString("en-US")}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Max CPC Recommendation</span>
                <span className="font-medium">{formatCurrency2(aggregated.maxCpc)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Per-service cards */}
          <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
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
              perService.map((ch) => (
                <Card key={ch.key}>
                  <CardHeader>
                    <CardTitle className="text-base">{ch.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span>Paid Revenue</span>
                      <span className="font-medium">{formatCurrency0(ch.paidRevenue)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Commissions</span>
                      <span className="font-medium">{formatCurrency2(ch.commissions)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Your Cost</span>
                      <span className="font-medium">{formatCurrency2(ch.yourCost)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Savings</span>
                      <span className={`font-semibold ${ch.savings >= 0 ? "text-emerald-600" : "text-red-600"}`}>{formatCurrency2(ch.savings)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Estimated Bookings</span>
                      <span className="font-medium">{Math.floor(ch.bookings).toLocaleString("en-US")}</span>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}