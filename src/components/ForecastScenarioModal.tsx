import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";

type ForecastScenario = {
  id: string;
  name: string; // Hotel Name
  email?: string | null;
  revenue_per_month: number;
  paid_revenue_share: number; // percentage (0-100)
  cost_of_sell: number; // decimal (0-1)
  target_average_order_value: number;
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
  const [tab, setTab] = React.useState<"month" | "year">("month");

  if (!scenario) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[640px] bg-background">
          <DialogHeader>
            <DialogTitle>Forecast Scenario</DialogTitle>
            <DialogDescription>Load a scenario to view details.</DialogDescription>
          </DialogHeader>
          <div className="text-sm text-muted-foreground">No scenario selected.</div>
        </DialogContent>
      </Dialog>
    );
  }

  const OTA_RATE = 0.15;
  const revMonth = Number(scenario.revenue_per_month) || 0;
  const paidSharePct = Number(scenario.paid_revenue_share) || 0; // stored as 0-100
  const costOfSell = Number(scenario.cost_of_sell) || 0; // stored as 0-1
  const aov = Number(scenario.target_average_order_value) || 0;

  // Monthly metrics
  const paidRevenueMonth = revMonth * (paidSharePct / 100);
  const otaCostMonth = revMonth * OTA_RATE;
  const yourCostMonth = revMonth * costOfSell;
  const savingsVsOTAMonth = otaCostMonth - yourCostMonth;
  const ordersMonth = aov > 0 ? revMonth / aov : 0;

  // Yearly metrics
  const revYear = revMonth * 12;
  const paidRevenueYear = paidRevenueMonth * 12;
  const otaCostYear = otaCostMonth * 12;
  const yourCostYear = yourCostMonth * 12;
  const savingsVsOTAYear = savingsVsOTAMonth * 12;
  const ordersYear = ordersMonth * 12;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] bg-background">
        <DialogHeader>
          <DialogTitle>Forecast: {scenario.name}</DialogTitle>
          <DialogDescription>
            Savings vs OTAs assumes a 15% OTA commission. Compare costs and revenue per month or per year.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {scenario.email ? <>Email: <span className="text-foreground">{scenario.email}</span></> : "No email provided"}
            </div>
            <div className="text-sm text-muted-foreground">
              Cost of sell: <span className="text-foreground">{formatPercent(costOfSell)}</span> • Paid share: <span className="text-foreground">{paidSharePct.toFixed(2)}%</span>
            </div>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as "month" | "year")}>
            <TabsList>
              <TabsTrigger value="month">Per Month</TabsTrigger>
              <TabsTrigger value="year">Per Year</TabsTrigger>
            </TabsList>

            <TabsContent value="month" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader><CardTitle>Revenue</CardTitle></CardHeader>
                  <CardContent className="text-2xl font-semibold">{formatCurrency0(revMonth)}</CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Paid Revenue</CardTitle></CardHeader>
                  <CardContent className="text-2xl font-semibold">{formatCurrency0(paidRevenueMonth)}</CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>OTA Cost (15%)</CardTitle></CardHeader>
                  <CardContent className="text-2xl font-semibold">{formatCurrency2(otaCostMonth)}</CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Your Cost</CardTitle></CardHeader>
                  <CardContent className="text-2xl font-semibold">{formatCurrency2(yourCostMonth)}</CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Savings vs OTA</CardTitle></CardHeader>
                  <CardContent className="text-2xl font-semibold">{formatCurrency2(savingsVsOTAMonth)}</CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Estimated Bookings</CardTitle></CardHeader>
                  <CardContent className="text-2xl font-semibold">{Math.floor(ordersMonth).toLocaleString("en-US")}</CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="year" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader><CardTitle>Revenue</CardTitle></CardHeader>
                  <CardContent className="text-2xl font-semibold">{formatCurrency0(revYear)}</CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Paid Revenue</CardTitle></CardHeader>
                  <CardContent className="text-2xl font-semibold">{formatCurrency0(paidRevenueYear)}</CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>OTA Cost (15%)</CardTitle></CardHeader>
                  <CardContent className="text-2xl font-semibold">{formatCurrency2(otaCostYear)}</CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Your Cost</CardTitle></CardHeader>
                  <CardContent className="text-2xl font-semibold">{formatCurrency2(yourCostYear)}</CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Savings vs OTA</CardTitle></CardHeader>
                  <CardContent className="text-2xl font-semibold">{formatCurrency2(savingsVsOTAYear)}</CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Estimated Bookings</CardTitle></CardHeader>
                  <CardContent className="text-2xl font-semibold">{Math.floor(ordersYear).toLocaleString("en-US")}</CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>

          {/* Monthly vs Yearly table comparison */}
          <div className="mt-6">
            <div className="mb-2">
              <div className="text-sm font-medium text-muted-foreground">Monthly vs Yearly Overview</div>
            </div>
            <Table className="bg-card rounded-md border">
              <TableHeader>
                <TableRow>
                  <TableHead>Metric</TableHead>
                  <TableHead>Per Month</TableHead>
                  <TableHead>Per Year</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">Revenue</TableCell>
                  <TableCell>{formatCurrency0(revMonth)}</TableCell>
                  <TableCell>{formatCurrency0(revYear)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Paid Revenue</TableCell>
                  <TableCell>{formatCurrency0(paidRevenueMonth)}</TableCell>
                  <TableCell>{formatCurrency0(paidRevenueYear)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">OTA Cost (15%)</TableCell>
                  <TableCell>{formatCurrency2(otaCostMonth)}</TableCell>
                  <TableCell>{formatCurrency2(otaCostYear)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Your Cost</TableCell>
                  <TableCell>{formatCurrency2(yourCostMonth)}</TableCell>
                  <TableCell>{formatCurrency2(yourCostYear)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Savings vs OTA</TableCell>
                  <TableCell>{formatCurrency2(savingsVsOTAMonth)}</TableCell>
                  <TableCell>{formatCurrency2(savingsVsOTAYear)}</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">Estimated Bookings</TableCell>
                  <TableCell>{Math.floor(ordersMonth).toLocaleString("en-US")}</TableCell>
                  <TableCell>{Math.floor(ordersYear).toLocaleString("en-US")}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}