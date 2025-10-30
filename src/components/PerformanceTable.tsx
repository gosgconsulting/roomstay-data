import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Columns3 } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { MappingModal } from "./MappingModal";
import { supabase } from "@/integrations/supabase/client";

interface Dimension {
  id: string;
  name: string;
  type: string;
  formula: string | null;
}

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
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(new Set());
  const [isLoadingDimensions, setIsLoadingDimensions] = useState(true);

  useEffect(() => {
    loadDimensions();
  }, []);

  const loadDimensions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("dimensions")
        .select("*")
        .eq("user_id", user.id)
        .order("name", { ascending: true });

      if (error) throw error;

      setDimensions(data || []);
      // Set all dimensions as visible by default
      setVisibleColumns(new Set(data?.map(d => d.id) || []));
    } catch (error) {
      console.error("Error loading dimensions:", error);
    } finally {
      setIsLoadingDimensions(false);
    }
  };

  const toggleColumn = (dimensionId: string) => {
    const newVisible = new Set(visibleColumns);
    if (newVisible.has(dimensionId)) {
      newVisible.delete(dimensionId);
    } else {
      newVisible.add(dimensionId);
    }
    setVisibleColumns(newVisible);
  };

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
          {dimensions.filter(d => visibleColumns.has(d.id)).map((dimension) => (
            <td key={dimension.id} className="py-3 px-4 text-right">
              {/* Mock data - will be replaced with actual data */}
              {dimension.name === "Impressions" && row.impressions.toLocaleString()}
              {dimension.name === "Clicks" && row.clicks.toLocaleString()}
              {dimension.name === "Cost" && `$${row.cost.toLocaleString()}`}
              {dimension.name === "Revenue" && `$${row.revenue.toLocaleString()}`}
              {dimension.name === "Conversions" && row.bookings}
              {dimension.name === "ROAS" && row.roas}
              {dimension.name === "Conversion Rate" && row.conversionRate}
              {dimension.name === "Cost of sale" && row.costOfSale}
              {dimension.name === "CTR" && row.ctr}
              {dimension.name === "Impression Share" && row.impressionStatus}
              {!["Impressions", "Clicks", "Cost", "Revenue", "Conversions", "ROAS", "Conversion Rate", "Cost of sale", "CTR", "Impression Share"].includes(dimension.name) && "-"}
            </td>
          ))}
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
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="device">Device</SelectItem>
                    <SelectItem value="channel">Channel</SelectItem>
                    <SelectItem value="none">None</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9">
                    <Columns3 className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>Column Visibility</SheetTitle>
                    <SheetDescription>
                      Select which metrics to display in the table
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 space-y-4">
                    {isLoadingDimensions ? (
                      <div className="text-sm text-muted-foreground">Loading dimensions...</div>
                    ) : dimensions.length === 0 ? (
                      <div className="text-sm text-muted-foreground">No dimensions found</div>
                    ) : (
                      dimensions.map((dimension) => (
                        <div key={dimension.id} className="flex items-center space-x-3">
                          <Checkbox
                            id={dimension.id}
                            checked={visibleColumns.has(dimension.id)}
                            onCheckedChange={() => toggleColumn(dimension.id)}
                          />
                          <label
                            htmlFor={dimension.id}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                          >
                            {dimension.name}
                            {dimension.formula && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                (formula)
                              </span>
                            )}
                          </label>
                        </div>
                      ))
                    )}
                  </div>
                </SheetContent>
              </Sheet>
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
                  {dimensions.filter(d => visibleColumns.has(d.id)).map((dimension) => (
                    <th
                      key={dimension.id}
                      className="py-3 px-4 text-right font-medium text-sm"
                      onContextMenu={(e) => handleContextMenu(e, dimension.name)}
                    >
                      {dimension.name}
                    </th>
                  ))}
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
