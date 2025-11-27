import * as React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";

type ForecastScenario = {
  id: string;
  name: string; // Hotel Name
  email?: string | null; // Optional field
  average_daily_rate?: number | null;
  direct_bookings_percentage?: number | null; // Direct Revenue
  direct_bookings_target?: number | null; // % Direct Revenue
  rooms?: number | null;
  occupancy_rate?: number | null; // New field
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
  // REMOVED: tabs state; we show a single table comparing Month vs Year

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
  
  // Extract hotel-specific fields
  const averageDailyRate = Number(scenario.average_daily_rate) || 0;
  const directRevenue = Number(scenario.direct_bookings_percentage) || 0; // Absolute dollar amount
  const directRevenueTarget = Number(scenario.direct_bookings_target) || 0; // Percentage
  const rooms = Number(scenario.rooms) || 0;
  const occupancyRate = Number(scenario.occupancy_rate) || 75; // Use provided occupancy rate or default to 75%
  const costOfSell = Number(scenario.cost_of_sell) || 0; // stored as 0-1
  const conversionRate = Number(scenario.conversion_rate) || 0; // stored as 0-1
  
  // Calculate monthly revenue from hotel metrics: ADR × Rooms × 30 days × (Occupancy Rate / 100)
  const revMonth = averageDailyRate * rooms * 30 * (occupancyRate / 100);

  // Calculate paid revenue from the % Direct Revenue field: Total Revenue × (% Direct Revenue / 100)
  const paidRevenueMonth = revMonth * (directRevenueTarget / 100);
  const paidSharePct = directRevenueTarget; // Already a percentage
  
  // OTA cost applied to paid revenue (calculated from percentage)
  const otaCostMonth = paidRevenueMonth * OTA_RATE;
  // Your cost applied to paid revenue
  const yourCostMonth = paidRevenueMonth * costOfSell;
  const savingsVsOTAMonth = otaCostMonth - yourCostMonth;
  
  // Estimated bookings based on conversion rate
  const ordersMonth = conversionRate > 0 ? revMonth * conversionRate : 0;

  // Yearly metrics
  const revYear = revMonth * 12;
  const paidRevenueYear = paidRevenueMonth * 12;
  const otaCostYear = otaCostMonth * 12;
  const yourCostYear = yourCostMonth * 12;
  const savingsVsOTAYear = savingsVsOTAMonth * 12;
  const ordersYear = ordersMonth * 12;
  const savingsMonthClass = savingsVsOTAMonth >= 0 ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold";
  const savingsYearClass = savingsVsOTAYear >= 0 ? "text-emerald-600 font-semibold" : "text-red-600 font-semibold";

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
          {/* Hotel Details */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">Rooms: {rooms}</Badge>
              <Badge variant="outline">ADR: {formatCurrency2(averageDailyRate)}</Badge>
              <Badge variant="outline">Occupancy: {occupancyRate}%</Badge>
              <Badge variant="outline">Direct Revenue %: {paidSharePct.toFixed(2)}%</Badge>
              <Badge variant="outline">Cost of sell: {formatPercent(costOfSell)}</Badge>
              <Badge variant="outline">OTA rate: 15%</Badge>
              {scenario.email && (
                <Badge variant="outline">Email: {scenario.email}</Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              Compare monthly and yearly metrics side by side
            </div>
          </div>

          {/* Single Monthly vs Yearly table comparison */}
          <div className="mt-4">
            <Table className="bg-card rounded-xl border shadow-sm">
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[220px]">Metric</TableHead>
                  <TableHead>Per Month</TableHead>
                  <TableHead>Per Year</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="hover:bg-muted/40">
                  <TableCell className="font-medium">Revenue</TableCell>
                  <TableCell>{formatCurrency0(revMonth)}</TableCell>
                  <TableCell>{formatCurrency0(revYear)}</TableCell>
                </TableRow>
                <TableRow className="hover:bg-muted/40">
                  <TableCell className="font-medium">Paid Revenue</TableCell>
                  <TableCell>{formatCurrency0(paidRevenueMonth)}</TableCell>
                  <TableCell>{formatCurrency0(paidRevenueYear)}</TableCell>
                </TableRow>
                <TableRow className="hover:bg-muted/40">
                  <TableCell className="font-medium">OTA Cost (15%)</TableCell>
                  <TableCell>{formatCurrency2(otaCostMonth)}</TableCell>
                  <TableCell>{formatCurrency2(otaCostYear)}</TableCell>
                </TableRow>
                <TableRow className="hover:bg-muted/40">
                  <TableCell className="font-medium">Your Cost</TableCell>
                  <TableCell>{formatCurrency2(yourCostMonth)}</TableCell>
                  <TableCell>{formatCurrency2(yourCostYear)}</TableCell>
                </TableRow>
                <TableRow className="hover:bg-muted/40">
                  <TableCell className="font-medium">Savings vs OTA</TableCell>
                  <TableCell className={savingsMonthClass}>{formatCurrency2(savingsVsOTAMonth)}</TableCell>
                  <TableCell className={savingsYearClass}>{formatCurrency2(savingsVsOTAYear)}</TableCell>
                </TableRow>
                <TableRow className="hover:bg-muted/40">
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