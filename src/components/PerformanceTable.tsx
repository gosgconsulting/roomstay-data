import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { MappingModal } from "./MappingModal";

interface TableRow {
  id: string;
  name: string;
  level: number;
  parentId?: string;
  impressions: number;
  impressionStatus: string;
  clicks: number;
  ctr: string;
  cost: number;
  bookings: number;
  conversionRate: string;
  revenue: number;
  roas: number;
  costOfSale: string;
  children?: TableRow[];
}

const mockData: TableRow[] = [
  {
    id: "1",
    name: "Grand Plaza Hotel",
    level: 0,
    impressions: 175000,
    impressionStatus: "68.5%",
    clicks: 2520,
    ctr: "2%",
    cost: 54695,
    bookings: 945,
    conversionRate: "8.8%",
    revenue: 46600,
    roas: 10.5,
    costOfSale: "9.5%",
  },
  {
    id: "2",
    name: "Google Hotel Ads",
    level: 0,
    impressions: 45000,
    impressionStatus: "77%",
    clicks: 900,
    ctr: "2%",
    cost: 51665,
    bookings: 89,
    conversionRate: "9.9%",
    revenue: 57677,
    roas: 10.6,
    costOfSale: "9.4%",
    children: [
      {
        id: "2-1",
        name: "Desktop",
        level: 1,
        parentId: "2",
        impressions: 27000,
        impressionStatus: "77%",
        clicks: 540,
        ctr: "2%",
        cost: 5999,
        bookings: 54,
        conversionRate: "10%",
        revenue: 31573,
        roas: 10.6,
        costOfSale: "9.4%",
      },
      {
        id: "2-2",
        name: "Mobile",
        level: 1,
        parentId: "2",
        impressions: 18000,
        impressionStatus: "71%",
        clicks: 360,
        ctr: "2%",
        cost: 5866,
        bookings: 35,
        conversionRate: "9.7%",
        revenue: 37049,
        roas: 10.6,
        costOfSale: "9.4%",
      },
    ],
  },
  {
    id: "3",
    name: "Booking.com",
    level: 0,
    impressions: 45000,
    impressionStatus: "68%",
    clicks: 820,
    ctr: "2%",
    cost: 51480,
    bookings: 78,
    conversionRate: "8.8%",
    revenue: 19444,
    roas: 10.4,
    costOfSale: "9.6%",
  },
  {
    id: "4",
    name: "Expedia",
    level: 0,
    impressions: 25000,
    impressionStatus: "65%",
    clicks: 520,
    ctr: "2%",
    cost: 5925,
    bookings: 52,
    conversionRate: "10.4%",
    revenue: 10296,
    roas: 11.1,
    costOfSale: "9%",
  },
  {
    id: "5",
    name: "Direct",
    level: 0,
    impressions: 15000,
    impressionStatus: "70%",
    clicks: 300,
    ctr: "2%",
    cost: 5155,
    bookings: 76,
    conversionRate: "8.7%",
    revenue: 15148,
    roas: 9.5,
    costOfSale: "10.6%",
  },
  {
    id: "6",
    name: "Sunset Beach Resort",
    level: 0,
    impressions: 195000,
    impressionStatus: "71.5%",
    clicks: 3170,
    ctr: "2%",
    cost: 55772,
    bookings: 317,
    conversionRate: "10%",
    revenue: 162400,
    roas: 10.8,
    costOfSale: "9.3%",
  },
];

export const PerformanceTable = () => {
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set(["2"]));
  const [mappingModalOpen, setMappingModalOpen] = useState(false);
  const [selectedKPI, setSelectedKPI] = useState("");

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const handleContextMenu = (e: React.MouseEvent, kpi: string) => {
    e.preventDefault();
    setSelectedKPI(kpi);
    setMappingModalOpen(true);
  };

  const renderRow = (row: TableRow) => {
    const isExpanded = expandedRows.has(row.id);
    const hasChildren = row.children && row.children.length > 0;

    return (
      <>
        <tr
          key={row.id}
          className={cn(
            "border-b hover:bg-muted/50 transition-colors",
            row.level === 1 && "bg-muted/30"
          )}
        >
          <td className="py-3 px-4" style={{ paddingLeft: `${row.level * 2 + 1}rem` }}>
            <div className="flex items-center gap-2">
              {hasChildren && (
                <button
                  onClick={() => toggleRow(row.id)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
              )}
              {!hasChildren && <div className="w-4" />}
              <span className="font-medium">{row.name}</span>
            </div>
          </td>
          <td className="py-3 px-4 text-right">{row.impressions.toLocaleString()}</td>
          <td className="py-3 px-4 text-right text-primary font-medium">
            {row.impressionStatus}
          </td>
          <td className="py-3 px-4 text-right">{row.clicks.toLocaleString()}</td>
          <td className="py-3 px-4 text-right">{row.ctr}</td>
          <td className="py-3 px-4 text-right">${row.cost.toLocaleString()}</td>
          <td className="py-3 px-4 text-right text-primary font-medium">{row.bookings}</td>
          <td className="py-3 px-4 text-right">{row.conversionRate}</td>
          <td className="py-3 px-4 text-right">${row.revenue.toLocaleString()}</td>
          <td className="py-3 px-4 text-right">{row.roas}</td>
          <td className="py-3 px-4 text-right">{row.costOfSale}</td>
        </tr>
        {isExpanded &&
          row.children?.map((child) => renderRow(child))}
      </>
    );
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Hotel Performance</CardTitle>
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Group by:</span>
                <Select defaultValue="hotel">
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hotel">Hotel</SelectItem>
                    <SelectItem value="channel">Channel</SelectItem>
                    <SelectItem value="device">Device</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Breakdown by:</span>
                <Select
                  defaultValue="channel"
                  onOpenChange={(open) => {
                    if (!open) return;
                  }}
                  onValueChange={(value) => {
                    if (value === "mapping") {
                      setSelectedKPI("breakdown");
                      setMappingModalOpen(true);
                    }
                  }}
                >
                  <SelectTrigger
                    className="w-32"
                    onContextMenu={(e) => handleContextMenu(e, "breakdown")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="channel">Channel</SelectItem>
                    <SelectItem value="device">Device</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Then by:</span>
                <Select
                  defaultValue="device"
                  onValueChange={(value) => {
                    if (value === "mapping") {
                      setSelectedKPI("then-by");
                      setMappingModalOpen(true);
                    }
                  }}
                >
                  <SelectTrigger
                    className="w-32"
                    onContextMenu={(e) => handleContextMenu(e, "then-by")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="device">Device</SelectItem>
                    <SelectItem value="channel">Channel</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b bg-muted/30">
                <tr>
                  <th
                    className="py-3 px-4 text-left font-medium text-sm"
                    onContextMenu={(e) => handleContextMenu(e, "hotel-name")}
                  >
                    Hotel Name
                  </th>
                  <th
                    className="py-3 px-4 text-right font-medium text-sm"
                    onContextMenu={(e) => handleContextMenu(e, "impressions")}
                  >
                    Impressions
                  </th>
                  <th
                    className="py-3 px-4 text-right font-medium text-sm"
                    onContextMenu={(e) => handleContextMenu(e, "impression-status")}
                  >
                    Impression Status
                  </th>
                  <th
                    className="py-3 px-4 text-right font-medium text-sm"
                    onContextMenu={(e) => handleContextMenu(e, "clicks")}
                  >
                    Clicks
                  </th>
                  <th
                    className="py-3 px-4 text-right font-medium text-sm"
                    onContextMenu={(e) => handleContextMenu(e, "ctr")}
                  >
                    CTR
                  </th>
                  <th
                    className="py-3 px-4 text-right font-medium text-sm"
                    onContextMenu={(e) => handleContextMenu(e, "cost")}
                  >
                    Cost
                  </th>
                  <th
                    className="py-3 px-4 text-right font-medium text-sm"
                    onContextMenu={(e) => handleContextMenu(e, "bookings")}
                  >
                    Bookings
                  </th>
                  <th
                    className="py-3 px-4 text-right font-medium text-sm"
                    onContextMenu={(e) => handleContextMenu(e, "conversion-rate")}
                  >
                    Conversion Rate
                  </th>
                  <th
                    className="py-3 px-4 text-right font-medium text-sm"
                    onContextMenu={(e) => handleContextMenu(e, "revenue")}
                  >
                    Revenue
                  </th>
                  <th
                    className="py-3 px-4 text-right font-medium text-sm"
                    onContextMenu={(e) => handleContextMenu(e, "roas")}
                  >
                    ROAS
                  </th>
                  <th
                    className="py-3 px-4 text-right font-medium text-sm"
                    onContextMenu={(e) => handleContextMenu(e, "cost-of-sale")}
                  >
                    Cost of Sale
                  </th>
                </tr>
              </thead>
              <tbody>{mockData.map((row) => renderRow(row))}</tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <MappingModal
        open={mappingModalOpen}
        onOpenChange={setMappingModalOpen}
        kpiName={selectedKPI}
      />
    </>
  );
};
