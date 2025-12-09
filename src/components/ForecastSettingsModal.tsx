import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface ForecastRow {
  id: string;
  name: string;
  rooms: number;
  occupancy_rate: number;
  daily_rate: number;
}

interface ForecastSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  aiSummaryCardId: string;
}

export function ForecastSettingsModal({
  open,
  onOpenChange,
  aiSummaryCardId,
}: ForecastSettingsModalProps) {
  const [rows, setRows] = useState<ForecastRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // New row form state
  const [newName, setNewName] = useState("");
  const [newRooms, setNewRooms] = useState("");
  const [newOccupancy, setNewOccupancy] = useState("");
  const [newDailyRate, setNewDailyRate] = useState("");

  const fetchForecasts = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("ai_summary_forecasts")
        .select("*")
        .eq("ai_summary_card_id", aiSummaryCardId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching forecasts:", error);
        return;
      }

      setRows(
        (data || []).map((row: any) => ({
          id: row.id,
          name: row.name,
          rooms: row.rooms,
          occupancy_rate: row.occupancy_rate,
          daily_rate: row.daily_rate,
        }))
      );
    } catch (err) {
      console.error("Error fetching forecasts:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchForecasts();
    }
  }, [open, aiSummaryCardId]);

  const handleAddRow = async () => {
    if (!newName.trim()) {
      toast.error("Name is required");
      return;
    }

    setIsSaving(true);
    try {
      const { user } = await getUser();
      if (!user) {
        toast.error("You must be logged in");
        return;
      }

      const { data, error } = await supabase
        .from("ai_summary_forecasts")
        .insert({
          ai_summary_card_id: aiSummaryCardId,
          user_id: user.id,
          name: newName.trim(),
          rooms: parseInt(newRooms) || 0,
          occupancy_rate: parseFloat(newOccupancy) || 0,
          daily_rate: parseFloat(newDailyRate) || 0,
        })
        .select()
        .single();

      if (error) {
        console.error("Error adding forecast:", error);
        toast.error("Failed to add forecast row");
        return;
      }

      setRows((prev) => [
        ...prev,
        {
          id: data.id,
          name: data.name,
          rooms: data.rooms,
          occupancy_rate: data.occupancy_rate,
          daily_rate: data.daily_rate,
        },
      ]);

      // Clear form
      setNewName("");
      setNewRooms("");
      setNewOccupancy("");
      setNewDailyRate("");

      toast.success("Forecast row added");
    } catch (err) {
      console.error("Error adding forecast:", err);
      toast.error("Failed to add forecast row");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRow = async (rowId: string) => {
    try {
      const { error } = await supabase
        .from("ai_summary_forecasts")
        .delete()
        .eq("id", rowId);

      if (error) {
        console.error("Error deleting forecast:", error);
        toast.error("Failed to delete forecast row");
        return;
      }

      setRows((prev) => prev.filter((r) => r.id !== rowId));
      toast.success("Forecast row deleted");
    } catch (err) {
      console.error("Error deleting forecast:", err);
      toast.error("Failed to delete forecast row");
    }
  };

  const formatPercent = (value: number) => `${value}%`;
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);

  // Calculate total revenue from all forecasts (monthly)
  const calculateMonthlyRevenue = () => {
    const daysInMonth = 30; // Average days per month
    return rows.reduce((total, row) => {
      const revenue = row.rooms * (row.occupancy_rate / 100) * row.daily_rate * daysInMonth;
      return total + revenue;
    }, 0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>Forecast Settings</DialogTitle>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Existing rows table */}
              {rows.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Name</TableHead>
                        <TableHead className="text-right">Rooms</TableHead>
                        <TableHead className="text-right">Occupancy Rate</TableHead>
                        <TableHead className="text-right">Daily Rate</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.name}</TableCell>
                          <TableCell className="text-right">{row.rooms}</TableCell>
                          <TableCell className="text-right">
                            {formatPercent(row.occupancy_rate)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(row.daily_rate)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => handleDeleteRow(row.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Summary */}
              {rows.length > 0 && (
                <div className="bg-muted/30 rounded-lg p-4">
                  <p className="text-sm text-muted-foreground">
                    Estimated Monthly Revenue:{" "}
                    <span className="font-semibold text-foreground">
                      {formatCurrency(calculateMonthlyRevenue())}
                    </span>
                  </p>
                </div>
              )}

              {/* Add new row form */}
              <div className="border rounded-lg p-4 space-y-4">
                <p className="text-sm font-medium">Add New Forecast</p>
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Name</label>
                    <Input
                      placeholder="e.g., Hotel A"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Rooms</label>
                    <Input
                      type="number"
                      placeholder="275"
                      value={newRooms}
                      onChange={(e) => setNewRooms(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      Occupancy Rate (%)
                    </label>
                    <Input
                      type="number"
                      placeholder="75"
                      value={newOccupancy}
                      onChange={(e) => setNewOccupancy(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Daily Rate</label>
                    <Input
                      type="number"
                      placeholder="250"
                      value={newDailyRate}
                      onChange={(e) => setNewDailyRate(e.target.value)}
                    />
                  </div>
                </div>
                <Button onClick={handleAddRow} disabled={isSaving}>
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-2" />
                  )}
                  Add Row
                </Button>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ForecastSettingsModal;
