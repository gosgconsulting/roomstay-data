import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

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

  // Inputs
  const OTA_RATE = 0.15;
  const adr = Number(scenario.average_daily_rate) || 0;
  const directRevenuePct = Number(scenario.direct_bookings_target) || 0;
  const rooms = Number(scenario.rooms) || 0;
  const occPct = Number(scenario.occupancy_rate) || 0;
  const costOfSell = Number(scenario.cost_of_sell) || 0; // decimal
  const convRate = Number(scenario.conversion_rate) || 0; // decimal

  // Base monthly metrics
  const monthly = React.useMemo(() => {
    const rev = adr * rooms * 30 * (occPct / 100);
    const paidRevenue = rev * (directRevenuePct / 100);
    const otaCost = paidRevenue * OTA_RATE;
    const yourCost = paidRevenue * costOfSell;
    const savings = otaCost - yourCost;
    const bookings = convRate > 0 ? rev * convRate : 0;
    const maxCpc = convRate > 0 ? (adr * costOfSell) / convRate : 0;

    return {
      revenue: rev,
      paidRevenue,
      otaCost,
      yourCost,
      savings,
      bookings,
      maxCpc,
    };
  }, [adr, rooms, occPct, directRevenuePct, costOfSell, convRate]);

  const yearly = React.useMemo(() => ({
    revenue: monthly.revenue * 12,
    paidRevenue: monthly.paidRevenue * 12,
    otaCost: monthly.otaCost * 12,
    yourCost: monthly.yourCost * 12,
    savings: monthly.savings * 12,
    bookings: monthly.bookings * 12,
    maxCpc: monthly.maxCpc, // same recommendation
  }), [monthly]);

  const selected = period === "month" ? monthly : yearly;

  // Channel assumptions (simple and editable later if needed)
  const CHANNELS = [
    { key: "metasearch", name: "Metasearch", share: 0.5, costRate: costOfSell },
    { key: "fbl", name: "Free Booking Links", share: 0.3, costRate: 0 },
    { key: "other", name: "Other Paid", share: 0.2, costRate: costOfSell },
  ];

  const channelMetrics = CHANNELS.map((ch) => {
    const paidRevenue = selected.paidRevenue * ch.share;
    const commissions = paidRevenue * OTA_RATE;
    const cost = paidRevenue * ch.costRate;
    const savings = commissions - cost;
    const bookings = selected.bookings * ch.share;
    return {
      key: ch.key,
      name: ch.name,
      paidRevenue,
      commissions,
      cost,
      savings,
      bookings,
    };
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1100px] bg-background">
        <DialogHeader>
          <DialogTitle>Forecast: {scenario.name}</DialogTitle>
          <DialogDescription>
            Compare monthly and yearly KPIs, and see channel-level breakdown. OTA commission assumed at 15%.
          </DialogDescription>
        </DialogHeader>

        {/* Scenario badges */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Rooms: {rooms}</Badge>
          <Badge variant="outline">ADR: {formatCurrency2(adr)}</Badge>
          <Badge variant="outline">Occupancy: {occPct.toFixed(2)}%</Badge>
          <Badge variant="outline">Direct Revenue %: {directRevenuePct.toFixed(2)}%</Badge>
          <Badge variant="outline">Cost of sale: {formatPercent(costOfSell)}</Badge>
          <Badge variant="outline">OTA rate: 15%</Badge>
          {scenario.email && <Badge variant="outline">Email: {scenario.email}</Badge>}
        </div>

        {/* Period toggle */}
        <div className="mt-4">
          <ToggleGroup type="single" value={period} onValueChange={(v) => v && setPeriod(v as "month" | "year")} className="justify-start">
            <ToggleGroupItem value="month" aria-label="Month">Month</ToggleGroupItem>
            <ToggleGroupItem value="year" aria-label="Year">Year</ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Layout: KPI sidebar + channels */}
        <div className="mt-4 grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* KPI Sidebar */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">KPIs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span>Revenue</span>
                <span className="font-medium">{formatCurrency0(selected.revenue)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Paid Revenue</span>
                <span className="font-medium">{formatCurrency0(selected.paidRevenue)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>OTA Commissions</span>
                <span className="font-medium">{formatCurrency2(selected.otaCost)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Your Cost</span>
                <span className="font-medium">{formatCurrency2(selected.yourCost)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Savings vs OTA</span>
                <span className={`font-semibold ${selected.savings >= 0 ? "text-emerald-600" : "text-red-600"}`}>{formatCurrency2(selected.savings)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Estimated Bookings</span>
                <span className="font-medium">{Math.floor(selected.bookings).toLocaleString("en-US")}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Max CPC Recommendation</span>
                <span className="font-medium">{formatCurrency2(selected.maxCpc)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Channels */}
          <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {channelMetrics.map((ch) => (
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
                    <span className="font-medium">{formatCurrency2(ch.cost)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Savings vs OTA</span>
                    <span className={`font-semibold ${ch.savings >= 0 ? "text-emerald-600" : "text-red-600"}`}>{formatCurrency2(ch.savings)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Estimated Bookings</span>
                    <span className="font-medium">{Math.floor(ch.bookings).toLocaleString("en-US")}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}