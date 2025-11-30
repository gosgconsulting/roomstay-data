import React from "react";
import { useParams } from "react-router-dom";
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

type ServiceRow = {
  id: string;
  name: string;
  weight: number;
  cost_of_sell: number;
  recurrent_fee: number;
  percent_cost: number;
  percent_revenue: number;
  one_off_fee: number;
  budget_payer?: "client" | "agency";
};

const formatCurrency0 = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);

const formatCurrency2 = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const formatPercent = (decimal: number) => `${(decimal * 100).toFixed(2)}%`;

export default function ForecastScenarioPage() {
  const { scenarioId } = useParams<{ scenarioId: string }>();
  const [scenario, setScenario] = React.useState<ForecastScenario | null>(null);
  const [services, setServices] = React.useState<ServiceRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [period, setPeriod] = React.useState<"month" | "year">("month");

  React.useEffect(() => {
    let mounted = true;
    const loadData = async () => {
      if (!scenarioId) return;
      setLoading(true);

      const { data: scenarioData } = await (supabase as any)
        .from("forecasts")
        .select("*")
        .eq("id", scenarioId)
        .single() as { data: ForecastScenario | null };

      const { data: svcData } = await (supabase as any)
        .from("forecast_services")
        .select("*")
        .eq("forecast_id", scenarioId)
        .order("created_at", { ascending: false }) as { data: ServiceRow[] | null };

      if (!mounted) return;
      setScenario(scenarioData ?? null);
      setServices(svcData ?? []);
      setLoading(false);
    };

    loadData();
    return () => {
      mounted = false;
    };
  }, [scenarioId]);

  // Inputs (safe defaults when loading or missing scenario)
  const adr = Number(scenario?.average_daily_rate ?? 0);
  const directRevenuePct = Number(scenario?.direct_bookings_target ?? 0);
  const rooms = Number(scenario?.rooms ?? 0);
  const occPct = Number(scenario?.occupancy_rate ?? 0);
  const convRate = Number(scenario?.conversion_rate ?? 0);

  // Base monthly metrics
  const monthly = React.useMemo(() => {
    const revenue = adr * rooms * 30 * (occPct / 100);
    const paidRevenue = revenue * (directRevenuePct / 100);
    const bookings = convRate > 0 ? revenue * convRate : 0;
    return { revenue, paidRevenue, bookings };
  }, [adr, rooms, occPct, directRevenuePct, convRate]);

  const yearly = React.useMemo(
    () => ({
      revenue: monthly.revenue * 12,
      paidRevenue: monthly.paidRevenue * 12,
      bookings: monthly.bookings * 12,
    }),
    [monthly]
  );

  const base = React.useMemo(
    () => (period === "month" ? monthly : yearly),
    [period, monthly, yearly]
  );

  // Compute per-service metrics
  const serviceShares = React.useMemo(() => {
    const total = services.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);
    return services.map((s) => ({
      ...s,
      share: total > 0 ? (Number(s.weight) || 0) / total : 0,
    }));
  }, [services]);

  const perService = React.useMemo(() => {
    return serviceShares.map((s) => {
      const revenue = base.paidRevenue * s.share;
      const cost = revenue * ((Number(s.cost_of_sell) || 0) / 100);
      const recurrentFee =
        period === "year"
          ? (Number(s.recurrent_fee) || 0) * 12
          : Number(s.recurrent_fee) || 0;
      const oneOffFee = Number(s.one_off_fee || 0);

      const costFee = cost * ((Number(s.percent_cost) || 0) / 100);
      const revenueFee = revenue * ((Number(s.percent_revenue) || 0) / 100);

      const totalCostValue = cost + recurrentFee + oneOffFee + costFee + revenueFee;
      const totalCostPct = revenue > 0 ? totalCostValue / revenue : 0;

      return {
        key: s.id,
        name: s.name,
        revenue,
        cost,
        recurrentFee,
        oneOffFee,
        costFee,
        revenueFee,
        totalCostValue,
        totalCostPct,
        percentCost: Number(s.percent_cost || 0),
        percentRevenue: Number(s.percent_revenue || 0),
        budgetPayer: (s.budget_payer ?? "client") as "client" | "agency",
      };
    });
  }, [serviceShares, base, period]);

  // NEW: aggregate totals across all services
  const servicesTotals = React.useMemo(() => {
    const totalRevenue = perService.reduce((sum, s) => sum + s.revenue, 0);
    const totalCost = perService.reduce((sum, s) => sum + s.cost, 0);
    const totalRecurrentFee = perService.reduce((sum, s) => sum + s.recurrentFee, 0);
    const totalOneOffFee = perService.reduce((sum, s) => sum + s.oneOffFee, 0);
    const totalCostFee = perService.reduce((sum, s) => sum + s.costFee, 0);
    const totalRevenueFee = perService.reduce((sum, s) => sum + s.revenueFee, 0);
    const totalCostValue = totalCost + totalRecurrentFee + totalOneOffFee + totalCostFee + totalRevenueFee;
    const totalCostPct = totalRevenue > 0 ? totalCostValue / totalRevenue : 0;
    return {
      totalRevenue,
      totalCost,
      totalRecurrentFee,
      totalOneOffFee,
      totalCostFee,
      totalRevenueFee,
      totalCostValue,
      totalCostPct,
    };
  }, [perService]);

  // Profit KPI: sum of fees (cost %, revenue %, recurrent, one-off) minus cost, for Agency-paid budgets
  const totalProfit = React.useMemo(() => {
    return perService.reduce((sum, svc) => {
      if (svc.budgetPayer === "agency") {
        const profit =
          svc.costFee + svc.revenueFee + svc.recurrentFee + svc.oneOffFee - svc.cost;
        return sum + profit;
      }
      return sum;
    }, 0);
  }, [perService]);

  if (loading) {
    return (
      <div className="container mx-auto p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Loading forecast...</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!scenario) {
    return (
      <div className="container mx-auto p-4 md:p-6">
        <Card>
          <CardHeader>
            <CardTitle>Forecast Scenario</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Scenario not found.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Forecast: {scenario.name}</h1>
        <p className="text-sm text-muted-foreground">
          Per-service metrics are computed from the configured Services.
        </p>
      </div>

      {/* Scenario badges */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">Rooms: {Number(scenario.rooms || 0)}</Badge>
        <Badge variant="outline">
          ADR: {formatCurrency2(Number(scenario.average_daily_rate || 0))}
        </Badge>
        <Badge variant="outline">
          Occupancy: {Number(scenario.occupancy_rate || 0).toFixed(2)}%
        </Badge>
        <Badge variant="outline">
          Direct Revenue %: {Number(scenario.direct_bookings_target || 0).toFixed(2)}%
        </Badge>
        <Badge variant="outline">
          Conv. Rate: {formatPercent(Number(scenario.conversion_rate || 0))}
        </Badge>
      </div>

      {/* Period toggle */}
      <div>
        <ToggleGroup
          type="single"
          value={period}
          onValueChange={(v) => v && setPeriod(v as "month" | "year")}
          className="justify-start"
        >
          <ToggleGroupItem value="month" aria-label="Month">
            Month
          </ToggleGroupItem>
          <ToggleGroupItem value="year" aria-label="Year">
            Year
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Summary card */}
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
            <span className="font-medium">
              {formatCurrency2(Number(scenario.average_daily_rate || 0))}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Occupancy Rate</span>
            <span className="font-medium">
              {Number(scenario.occupancy_rate || 0).toFixed(2)}%
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Direct Revenue %</span>
            <span className="font-medium">
              {Number(scenario.direct_bookings_target || 0).toFixed(2)}%
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span>Conv Rate</span>
            <span className="font-medium">
              {formatPercent(Number(scenario.conversion_rate || 0))}
            </span>
          </div>
          <div className="flex items-center justify-between pt-2">
            <span className="font-semibold">Total Revenue</span>
            <span className="font-semibold">{formatCurrency0(base.revenue)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Profit</span>
            <span className="font-semibold">{formatCurrency0(totalProfit)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Total Services card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Total Services</CardTitle>
          <div className="text-xs text-muted-foreground">Combined across all services</div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span>Revenue</span>
            <span className="font-medium">{formatCurrency0(servicesTotals.totalRevenue)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Cost</span>
            <span className="font-medium">{formatCurrency2(servicesTotals.totalCost)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Recurrent Fee</span>
            <span className="font-medium">{formatCurrency2(servicesTotals.totalRecurrentFee)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>One-off Fee</span>
            <span className="font-medium">{formatCurrency2(servicesTotals.totalOneOffFee)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Cost Fee</span>
            <span className="font-medium">{formatCurrency2(servicesTotals.totalCostFee)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span>Revenue Fee</span>
            <span className="font-medium">{formatCurrency2(servicesTotals.totalRevenueFee)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-semibold">Total Cost</span>
            <span className="font-semibold">
              {formatCurrency2(servicesTotals.totalCostValue)} ({(servicesTotals.totalCostPct * 100).toFixed(2)}%)
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Per-service cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                  <span>One-off Fee</span>
                  <span className="font-medium">{formatCurrency2(svc.oneOffFee)}</span>
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
                    {formatCurrency2(svc.totalCostValue)} (
                    {(svc.totalCostPct * 100).toFixed(2)}%)
                  </span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}