import * as React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";

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
  budget_payer?: 'client' | 'agency';
};

export default function ForecastServicesModal({ open, onOpenChange, forecastId }: ForecastServicesModalProps) {
  const [services, setServices] = React.useState<ServiceRow[]>([]);
  const [loading, setLoading] = React.useState(false);

  // NEW: editing state for inline cells
  type EditableField = keyof Pick<ServiceRow, 'name' | 'weight' | 'cost_of_sell' | 'recurrent_fee' | 'percent_cost' | 'percent_revenue' | 'budget_payer'>;
  const [editing, setEditing] = React.useState<{ id: string | null; field: EditableField | null; value: string }>({
    id: null,
    field: null,
    value: ""
  });
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  // NEW: add service handler
  const handleAddService = async () => {
    if (!forecastId) {
      toast.error("Please select a forecast scenario first");
      return;
    }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) {
      console.error("Auth error:", authError);
      toast.error("Unable to verify user");
      return;
    }
    const user = authData?.user;
    if (!user) {
      toast.error("You must be signed in to add a service");
      return;
    }

    const { data, error } = await (supabase as any)
      .from("forecast_services")
      .insert({
        forecast_id: forecastId,
        user_id: user.id,
        name: "New service",
        weight: 0,
        cost_of_sell: 0,
        recurrent_fee: 0,
        percent_cost: 0,
        percent_revenue: 0,
        budget_payer: 'client'
      })
      .select()
      .single() as { data: ServiceRow | null; error: any };

    if (error || !data) {
      console.error("Add service error:", error);
      toast.error("Failed to add service");
      return;
    }

    setServices(prev => [data as ServiceRow, ...prev]);
    setEditing({ id: data.id, field: "name", value: data.name || "" });
    toast.success("Service added");
  };

  // NEW: delete service handler
  const handleDeleteService = async (id: string) => {
    if (!id) return;
    if (!window.confirm("Delete this service?")) return;

    setDeletingId(id);
    const { error } = await (supabase as any)
      .from("forecast_services")
      .delete()
      .eq("id", id);

    setDeletingId(null);

    if (error) {
      console.error("Delete service error:", error);
      toast.error("Failed to delete service");
      return;
    }

    setServices(prev => prev.filter(s => s.id !== id));
    if (editing.id === id) {
      setEditing({ id: null, field: null, value: "" });
    }
    toast.success("Service deleted");
  };

  const startEdit = (id: string, field: EditableField, current: number | string) => {
    setEditing({ id, field, value: String(current ?? "") });
  };

  const cancelEdit = () => {
    setEditing({ id: null, field: null, value: "" });
  };

  const commitEdit = async () => {
    if (!editing.id || !editing.field) return;
    const id = editing.id;
    const field = editing.field;
    let valueToSave: number | string = editing.value;

    // Validation + normalization
    const percentFields: EditableField[] = ["weight", "cost_of_sell", "percent_cost", "percent_revenue"];
    if (field === "name") {
      valueToSave = String(valueToSave).trim();
      if (!valueToSave) {
        toast.error("Service name cannot be empty");
        return;
      }
    } else if (field === "recurrent_fee") {
      const num = parseFloat(String(valueToSave));
      if (Number.isNaN(num) || num < 0) {
        toast.error("Recurrent fee must be a non-negative number");
        return;
      }
      valueToSave = num;
    } else if (percentFields.includes(field)) {
      const num = parseFloat(String(valueToSave));
      if (Number.isNaN(num) || num < 0 || num > 100) {
        toast.error("Percent values must be between 0 and 100");
        return;
      }
      valueToSave = num;
    } else if (field === "budget_payer") {
      const val = String(valueToSave);
      if (val !== 'client' && val !== 'agency') {
        toast.error("Budget must be Client or Agency");
        return;
      }
      valueToSave = val;
    }

    // Persist to Supabase
    const { error } = await (supabase as any)
      .from("forecast_services")
      .update({ [field]: valueToSave })
      .eq("id", id);

    if (error) {
      console.error("Update service error:", error);
      toast.error("Failed to save change");
      return;
    }

    // Optimistic UI update
    setServices(prev => prev.map(s => s.id === id ? { ...s, [field]: valueToSave as any } : s));
    toast.success("Saved");
    cancelEdit();
  };

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

  // NEW: live total % weight
  const totalWeight = services.reduce((sum, s) => sum + (Number(s.weight) || 0), 0);

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) cancelEdit(); }}>
      <DialogContent className="sm:max-w-[900px] bg-background">
        <DialogHeader>
          <DialogTitle>Services</DialogTitle>
        </DialogHeader>

        {/* Tip + Add Service button */}
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-muted-foreground">Tip: Click a cell to edit. Press Enter or click Save; Esc or click Cancel.</div>
          <Button size="sm" onClick={handleAddService}>
            <Plus className="mr-2 h-4 w-4" />
            Add Service
          </Button>
        </div>

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
                <TableHead>Budget</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground">Loading services...</TableCell>
                </TableRow>
              ) : services.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-muted-foreground">No services saved for this scenario.</TableCell>
                </TableRow>
              ) : (
                services.map(s => (
                  <TableRow key={s.id}>
                    {/* Name */}
                    <TableCell onClick={() => startEdit(s.id, "name", s.name)} className="cursor-pointer">
                      {editing.id === s.id && editing.field === "name" ? (
                        <div className="flex items-center gap-2">
                          <Input
                            autoFocus
                            className="w-full"
                            value={editing.value}
                            onChange={(e) => setEditing(ed => ({ ...ed, value: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit();
                              if (e.key === "Escape") cancelEdit();
                            }}
                          />
                          <Button size="sm" variant="secondary" onClick={commitEdit}>Save</Button>
                          <Button size="sm" variant="outline" onClick={cancelEdit}>Cancel</Button>
                        </div>
                      ) : (
                        s.name
                      )}
                    </TableCell>

                    {/* % Weight */}
                    <TableCell onClick={() => startEdit(s.id, "weight", s.weight)} className="cursor-pointer">
                      {editing.id === s.id && editing.field === "weight" ? (
                        <div className="flex items-center gap-2">
                          <Input
                            autoFocus
                            type="number"
                            step="0.01"
                            min={0}
                            max={100}
                            className="w-32"
                            value={editing.value}
                            onChange={(e) => setEditing(ed => ({ ...ed, value: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit();
                              if (e.key === "Escape") cancelEdit();
                            }}
                          />
                          <Button size="sm" variant="secondary" onClick={commitEdit}>Save</Button>
                          <Button size="sm" variant="outline" onClick={cancelEdit}>Cancel</Button>
                        </div>
                      ) : (
                        `${Number(s.weight || 0).toFixed(2)}%`
                      )}
                    </TableCell>

                    {/* % Cost of Sale */}
                    <TableCell onClick={() => startEdit(s.id, "cost_of_sell", s.cost_of_sell)} className="cursor-pointer">
                      {editing.id === s.id && editing.field === "cost_of_sell" ? (
                        <div className="flex items-center gap-2">
                          <Input
                            autoFocus
                            type="number"
                            step="0.01"
                            min={0}
                            max={100}
                            className="w-32"
                            value={editing.value}
                            onChange={(e) => setEditing(ed => ({ ...ed, value: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit();
                              if (e.key === "Escape") cancelEdit();
                            }}
                          />
                          <Button size="sm" variant="secondary" onClick={commitEdit}>Save</Button>
                          <Button size="sm" variant="outline" onClick={cancelEdit}>Cancel</Button>
                        </div>
                      ) : (
                        `${Number(s.cost_of_sell || 0).toFixed(2)}%`
                      )}
                    </TableCell>

                    {/* Recurrent fee */}
                    <TableCell onClick={() => startEdit(s.id, "recurrent_fee", s.recurrent_fee)} className="cursor-pointer">
                      {editing.id === s.id && editing.field === "recurrent_fee" ? (
                        <div className="flex items-center gap-2">
                          <Input
                            autoFocus
                            type="number"
                            step="0.01"
                            min={0}
                            className="w-32"
                            value={editing.value}
                            onChange={(e) => setEditing(ed => ({ ...ed, value: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit();
                              if (e.key === "Escape") cancelEdit();
                            }}
                          />
                          <Button size="sm" variant="secondary" onClick={commitEdit}>Save</Button>
                          <Button size="sm" variant="outline" onClick={cancelEdit}>Cancel</Button>
                        </div>
                      ) : (
                        `$${Number(s.recurrent_fee || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`
                      )}
                    </TableCell>

                    {/* % Cost */}
                    <TableCell onClick={() => startEdit(s.id, "percent_cost", s.percent_cost)} className="cursor-pointer">
                      {editing.id === s.id && editing.field === "percent_cost" ? (
                        <div className="flex items-center gap-2">
                          <Input
                            autoFocus
                            type="number"
                            step="0.01"
                            min={0}
                            max={100}
                            className="w-32"
                            value={editing.value}
                            onChange={(e) => setEditing(ed => ({ ...ed, value: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit();
                              if (e.key === "Escape") cancelEdit();
                            }}
                          />
                          <Button size="sm" variant="secondary" onClick={commitEdit}>Save</Button>
                          <Button size="sm" variant="outline" onClick={cancelEdit}>Cancel</Button>
                        </div>
                      ) : (
                        `${Number(s.percent_cost || 0).toFixed(2)}%`
                      )}
                    </TableCell>

                    {/* % Revenue */}
                    <TableCell onClick={() => startEdit(s.id, "percent_revenue", s.percent_revenue)} className="cursor-pointer">
                      {editing.id === s.id && editing.field === "percent_revenue" ? (
                        <div className="flex items-center gap-2">
                          <Input
                            autoFocus
                            type="number"
                            step="0.01"
                            min={0}
                            max={100}
                            className="w-32"
                            value={editing.value}
                            onChange={(e) => setEditing(ed => ({ ...ed, value: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") commitEdit();
                              if (e.key === "Escape") cancelEdit();
                            }}
                          />
                          <Button size="sm" variant="secondary" onClick={commitEdit}>Save</Button>
                          <Button size="sm" variant="outline" onClick={cancelEdit}>Cancel</Button>
                        </div>
                      ) : (
                        `${Number(s.percent_revenue || 0).toFixed(2)}%`
                      )}
                    </TableCell>

                    {/* Budget */}
                    <TableCell onClick={() => startEdit(s.id, "budget_payer", s.budget_payer ?? 'client')} className="cursor-pointer">
                      {editing.id === s.id && editing.field === "budget_payer" ? (
                        <div className="flex items-center gap-2">
                          <Select
                            value={String(editing.value || 'client')}
                            onValueChange={(v) => setEditing(ed => ({ ...ed, value: v }))}
                          >
                            <SelectTrigger className="w-40 h-8">
                              <SelectValue placeholder="Client" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="client">Client</SelectItem>
                              <SelectItem value="agency">Agency</SelectItem>
                            </SelectContent>
                          </Select>
                          <Button size="sm" variant="secondary" onClick={commitEdit}>Save</Button>
                          <Button size="sm" variant="outline" onClick={cancelEdit}>Cancel</Button>
                        </div>
                      ) : (
                        (s.budget_payer ?? 'client') === 'agency' ? 'Agency' : 'Client'
                      )}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDeleteService(s.id)}
                        disabled={deletingId === s.id}
                        aria-label="Delete service"
                        title="Delete service"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Live total % Weight indicator */}
        <div className="flex justify-end mt-2 text-sm">
          <span className={`${Number(totalWeight.toFixed(2)) === 100 ? "text-muted-foreground" : "text-destructive font-medium"}`}>
            Total % Weight: {totalWeight.toFixed(2)}%
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}