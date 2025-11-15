import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fetchUniqueDimensionValues } from "../lib/vlookup/fetchUniqueValues";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import type { Dimension } from "@/hooks/performanceTable/usePerformanceTableDimensions";
import MultiSelect from "@/components/MultiSelect";

type Row = {
  sourceDimensionId?: string;
  valuesToMap: string[];
  targetDimensionId?: string; // existing dimension
  creatingNew?: boolean;
  newDimensionName: string;
  groupedValue: string;
};

interface VlookupModalProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  reportId: string | null;
  reportIds?: string[];
  accountId?: string;
  dimensions?: Dimension[]; // optional external dims; we also load locally
  onCreate?: (rows: Row[]) => void;
}

export default function VlookupModal({
  open,
  onOpenChange,
  reportId,
  reportIds,
  accountId,
  dimensions = [],
  onCreate,
}: VlookupModalProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Local dimensions (fallback to provided prop if any; otherwise load)
  const [loadedDims, setLoadedDims] = useState<Dimension[]>([]);
  const allDims: Dimension[] = useMemo(() => {
    // prefer externally passed list if present
    return dimensions.length > 0 ? dimensions : loadedDims;
  }, [dimensions, loadedDims]);

  const textDimensions = useMemo(
    () => allDims.filter(d => d.type === "text"),
    [allDims]
  );

  // Rows state
  const [rows, setRows] = useState<Row[]>([{ valuesToMap: [], newDimensionName: "", groupedValue: "" }]);

  // Unique values state
  const [options, setOptions] = useState<string[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const selectedSourceDimensionId = rows[0]?.sourceDimensionId;

  // Load dimensions locally when modal opens (account > global > custom for report)
  useEffect(() => {
    let cancel = false;
    async function loadDims() {
      if (!open) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Account-scoped
      let accountData: any[] = [];
      if (accountId) {
        const { data } = await supabase
          .from("dimensions")
          .select("*")
          .eq("scope", "account")
          .eq("account_id", accountId)
          .order("created_at", { ascending: false });
        accountData = data || [];
      }

      // Global
      const { data: globalData } = await supabase
        .from("dimensions")
        .select("*")
        .eq("scope", "global")
        .order("created_at", { ascending: false });

      // Custom (report-specific)
      let customData: any[] = [];
      if (reportId) {
        const { data } = await supabase
          .from("dimensions")
          .select("*")
          .eq("user_id", user.id)
          .eq("scope", "custom")
          .eq("report_id", reportId)
          .order("created_at", { ascending: false });
        customData = data || [];
      }

      // Combine and dedupe by name, prefer account > global > custom
      const combined = [...(accountData || []), ...(globalData || []), ...(customData || [])];
      const seen = new Set<string>();
      const unique = combined.filter(d => {
        if (!d?.name || seen.has(d.name)) return false;
        seen.add(d.name);
        return true;
      });

      if (!cancel) setLoadedDims(unique as Dimension[]);
    }
    loadDims();
    return () => { cancel = true; };
  }, [open, accountId, reportId]);

  // Load unique values whenever source dimension changes or search updates
  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!open) return;
      if (!selectedSourceDimensionId) {
        setOptions([]);
        return;
      }
      if (!reportId && (!reportIds || reportIds.length === 0)) {
        setOptions([]);
        return;
      }

      setLoadingOptions(true);
      const values = await fetchUniqueDimensionValues({
        reportId: reportId ?? undefined,
        reportIds,
        dimensionId: selectedSourceDimensionId,
        limit: 5000,
      }).catch(() => []);

      if (!cancelled) {
        setOptions(values);
        setLoadingOptions(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [open, selectedSourceDimensionId, reportId, JSON.stringify(reportIds)]);

  const updateRow = (index: number, patch: Partial<Row>) => {
    setRows(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...patch };
      return copy;
    });
  };

  const addRow = () => setRows(prev => [...prev, { sourceDimensionId: rows[0]?.sourceDimensionId, valuesToMap: [], newDimensionName: "", groupedValue: "" }]);
  const removeRow = (index: number) => setRows(prev => prev.filter((_, i) => i !== index));

  async function ensureTargetDimension(row: Row): Promise<string | null> {
    if (row.targetDimensionId) return row.targetDimensionId;

    const name = row.newDimensionName?.trim();
    if (!name) return null;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const scope = accountId ? 'account' : 'custom';
    const insertData: any = {
      name,
      type: 'text',
      user_id: user.id,
      scope,
      account_id: accountId ?? null,
      report_id: accountId ? null : (reportId ?? null),
      formula: null,
    };

    const { data, error } = await supabase
      .from('dimensions')
      .insert(insertData)
      .select('id')
      .single();

    if (error) throw error;
    return data?.id || null;
  }

  async function findOrCreateClusterDimension(sourceDimensionId: string, targetDimensionId: string, newName: string): Promise<string> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    // Try find existing
    let query = supabase
      .from('cluster_dimensions')
      .select('id')
      .eq('user_id', user.id)
      .eq('source_dimension_id', sourceDimensionId)
      .eq('created_dimension_id', targetDimensionId);

    if (accountId) query = query.eq('account_id', accountId);
    if (reportId) query = query.eq('report_id', reportId);

    const { data: existing } = await query.limit(1);
    if (existing && existing.length > 0) return existing[0].id;

    const insertData: any = {
      cluster_dimension_name: newName || 'Cluster',
      source_dimension_id: sourceDimensionId,
      created_dimension_id: targetDimensionId,
      user_id: (await supabase.auth.getUser()).data.user?.id,
      account_id: accountId ?? null,
      report_id: accountId ? null : (reportId ?? null),
    };

    const { data, error } = await supabase
      .from('cluster_dimensions')
      .insert(insertData)
      .select('id')
      .single();

    if (error) throw error;
    return data!.id;
  }

  async function upsertClusterMapping(clusterDimensionId: string, groupedValue: string, valuesToMap: string[]) {
    const gv = groupedValue.trim();
    if (!gv || valuesToMap.length === 0) return;

    // Check if mapping exists for this cluster_name; if so, merge values
    const { data: existing } = await supabase
      .from('cluster_mappings')
      .select('id, source_values, cluster_name')
      .eq('cluster_dimension_id', clusterDimensionId)
      .eq('cluster_name', gv)
      .limit(1);

    const normalizedSet = new Set(valuesToMap.map(v => String(v).trim()));

    if (existing && existing.length > 0) {
      const current = Array.isArray(existing[0].source_values) ? existing[0].source_values : [];
      current.forEach((v: string) => normalizedSet.add(String(v).trim()));
      const merged = Array.from(normalizedSet);

      await supabase
        .from('cluster_mappings')
        .update({ source_values: merged })
        .eq('id', existing[0].id);
    } else {
      await supabase
        .from('cluster_mappings')
        .insert({
          cluster_dimension_id: clusterDimensionId,
          source_values: Array.from(normalizedSet),
          cluster_name: gv,
        });
    }
  }

  const handleCreate = async () => {
    try {
      if (!reportId && !accountId) {
        toast({ title: "Select a context", description: "Missing report/account.", variant: "destructive" });
        return;
      }
      const valid = rows.filter(r =>
        r.sourceDimensionId &&
        r.valuesToMap.length > 0 &&
        (r.targetDimensionId || r.newDimensionName.trim()) &&
        r.groupedValue.trim()
      );
      if (valid.length === 0) return;

      for (const r of valid) {
        const targetId = await ensureTargetDimension(r);
        if (!targetId) continue;

        const clusterDimId = await findOrCreateClusterDimension(
          r.sourceDimensionId!,
          targetId,
          r.newDimensionName || (textDimensions.find(d => d.id === r.sourceDimensionId!)?.name ?? "Cluster")
        );

        await upsertClusterMapping(clusterDimId, r.groupedValue, r.valuesToMap);
      }

      // Invalidate mappings so table/chart pick up changes immediately
      await queryClient.invalidateQueries({ queryKey: ['vlookup-mappings', reportId ?? undefined, accountId ?? undefined] });

      toast({ title: "Mappings saved", description: "Your pivot mappings were saved successfully." });
      onCreate?.(valid as Row[]);
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Error", description: e?.message || "Failed to save mappings", variant: "destructive" });
    }
  };

  // Reset form when opening
  useEffect(() => {
    if (open) {
      setRows([{ valuesToMap: [], newDimensionName: "", groupedValue: "" }]);
      setOptions([]);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Create Pivot Dimensions</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {rows.map((row, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-3 items-end">
              {/* Source dimension */}
              <div className="col-span-3">
                <Label>Source Dimension</Label>
                <Select
                  value={row.sourceDimensionId}
                  onValueChange={(val) => {
                    updateRow(idx, { sourceDimensionId: val, valuesToMap: [] });
                    if (idx === 0) {
                      setRows(prev => prev.map((r, i) => i === 0 ? { ...r, sourceDimensionId: val } : r));
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select dimension" />
                  </SelectTrigger>
                  <SelectContent>
                    {textDimensions.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Values to map */}
              <div className="col-span-4">
                <Label>Values to Map</Label>
                <MultiSelect
                  options={options.map(v => ({ label: v, value: v }))}
                  values={row.valuesToMap}
                  onChange={(vals) => updateRow(idx, { valuesToMap: vals })}
                  placeholder={loadingOptions ? "Loading values…" : "Select values..."}
                  searchPlaceholder="Search..."
                  disabled={loadingOptions || !selectedSourceDimensionId}
                  className="bg-background"
                />
              </div>

              {/* Target dimension selector + create */}
              <div className="col-span-3">
                <Label>Target Dimension</Label>
                {row.creatingNew ? (
                  <Input
                    placeholder="e.g., Account"
                    value={row.newDimensionName}
                    onChange={(e) => updateRow(idx, { newDimensionName: e.target.value })}
                  />
                ) : (
                  <Select
                    value={row.targetDimensionId}
                    onValueChange={(val) => {
                      if (val === '__create__') {
                        updateRow(idx, { creatingNew: true, targetDimensionId: undefined, newDimensionName: "" });
                      } else {
                        updateRow(idx, { targetDimensionId: val, creatingNew: false, newDimensionName: "" });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose or create" />
                    </SelectTrigger>
                    <SelectContent>
                      {textDimensions.map(d => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                      <SelectItem value="__create__">+ Create new…</SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Grouped Value */}
              <div className="col-span-2">
                <Label>Grouped Value</Label>
                <Input
                  placeholder="e.g., Brady"
                  value={row.groupedValue}
                  onChange={(e) => updateRow(idx, { groupedValue: e.target.value })}
                />
              </div>

              {/* Row actions */}
              <div className="col-span-12 flex items-center gap-2">
                {rows.length > 1 && (
                  <Button variant="outline" size="sm" onClick={() => removeRow(idx)}>
                    Remove
                  </Button>
                )}
                {idx === rows.length - 1 && (
                  <Button variant="outline" size="sm" onClick={addRow}>
                    + Add Row
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleCreate}>Create Dimensions</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}