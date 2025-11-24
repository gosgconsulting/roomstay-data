import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchUniqueDimensionValues } from "../lib/vlookup/fetchUniqueValues";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import type { Dimension } from "@/hooks/performanceTable/usePerformanceTableDimensions";
import MultiSelect from "@/components/MultiSelect";

type Row = {
  sourceDimensionId?: string;
  valuesToMap: string[];
  targetDimensionId?: string;
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
  dimensions?: Dimension[];
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

  const [loadedDims, setLoadedDims] = useState<Dimension[]>([]);
  const allDims: Dimension[] = useMemo(() => (dimensions.length > 0 ? dimensions : loadedDims), [dimensions, loadedDims]);
  const textDimensions = useMemo(() => allDims.filter(d => d.type === "text"), [allDims]);
  
  // Target dimensions created via Vlookup (account-scoped only)
  const [targetDimensions, setTargetDimensions] = useState<Dimension[]>([]);

  // Rows shown in UI
  const [rows, setRows] = useState<Row[]>([{ valuesToMap: [], newDimensionName: "", groupedValue: "" }]);

  // Options per source dimension for Values to Map
  const [optionsMap, setOptionsMap] = useState<Record<string, string[]>>({});
  const [loadingOptionsMap, setLoadingOptionsMap] = useState<Record<string, boolean>>({});

  // Loading state for save operation
  const [isSaving, setIsSaving] = useState(false);
  
  // Loading state for existing mappings
  const [isLoadingExisting, setIsLoadingExisting] = useState(false);

  // Reset all modal state when modal closes
  const resetModalState = () => {
    console.log('[VlookupModal] Resetting modal state');
    setRows([{ valuesToMap: [], newDimensionName: "", groupedValue: "" }]);
    setOptionsMap({});
    setLoadingOptionsMap({});
    setTargetDimensions([]);
    setIsSaving(false);
    setIsLoadingExisting(false);
  };

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      resetModalState();
    }
  }, [open]);

  // Load dimensions when modal opens
  useEffect(() => {
    let cancel = false;
    async function loadDims() {
      if (!open) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      console.log('[VlookupModal] Loading dimensions for user:', user.id, 'accountId:', accountId, 'reportId:', reportId);

      // Load source dimensions (for Source Dimension dropdown)
      let accountData: any[] = [];
      if (accountId) {
        const { data, error } = await supabase
          .from("dimensions")
          .select("*")
          .eq("scope", "account")
          .eq("account_id", accountId)
          .order("created_at", { ascending: false });
        
        if (error) {
          console.error('[VlookupModal] Error loading account dimensions:', error);
        } else {
          console.log('[VlookupModal] Loaded account dimensions:', data?.length || 0);
          accountData = data || [];
        }
      }

      const { data: globalData, error: globalError } = await supabase
        .from("dimensions")
        .select("*")
        .eq("scope", "global")
        .order("created_at", { ascending: false });

      if (globalError) {
        console.error('[VlookupModal] Error loading global dimensions:', globalError);
      } else {
        console.log('[VlookupModal] Loaded global dimensions:', globalData?.length || 0);
      }

      let customData: any[] = [];
      if (reportId) {
        const { data, error } = await supabase
          .from("dimensions")
          .select("*")
          .eq("scope", "custom")
          .eq("report_id", reportId)
          .order("created_at", { ascending: false });
        
        if (error) {
          console.error('[VlookupModal] Error loading custom dimensions:', error);
        } else {
          console.log('[VlookupModal] Loaded custom dimensions:', data?.length || 0);
          customData = data || [];
        }
      }

      const combined = [...(accountData || []), ...(globalData || []), ...(customData || [])];
      const seen = new Set<string>();
      const unique = combined.filter((d: any) => {
        if (!d?.name || seen.has(d.name)) return false;
        seen.add(d.name);
        return true;
      });

      console.log('[VlookupModal] All unique dimensions before filter:', unique.map(d => d.name));

      // Filter by filter_dimensions from report_views (same as FiltersBar)
      let filteredDims = unique;
      if (reportId) {
        const { data: viewSettings } = await supabase
          .from("report_views")
          .select("filter_dimensions")
          .eq("report_id", reportId)
          .eq("user_id", user.id)
          .eq("is_default", true)
          .maybeSingle();

        console.log('[VlookupModal] View settings filter_dimensions:', viewSettings?.filter_dimensions);

        if (viewSettings?.filter_dimensions && Array.isArray(viewSettings.filter_dimensions)) {
          const filterDimensionIds = new Set(viewSettings.filter_dimensions);
          filteredDims = unique.filter(d => filterDimensionIds.has(d.id));
          console.log('[VlookupModal] Filtered dimensions by filter_dimensions:', filteredDims.map(d => d.name));
        }
      }

      if (!cancel) setLoadedDims(filteredDims as Dimension[]);

      // Load target dimensions - look for account-scoped text dimensions that were created via vlookup
      // We'll identify vlookup dimensions by checking if they have associated cluster_dimensions
      if (accountId) {
        // First get all cluster_dimensions for this account to identify which dimensions are vlookup targets
        const { data: clusterDims, error: clusterError } = await supabase
          .from('cluster_dimensions')
          .select('created_dimension_id')
          .eq('user_id', user.id)
          .eq('account_id', accountId);

        if (clusterError) {
          console.error('[VlookupModal] Error loading cluster dimensions:', clusterError);
        }

        const vlookupDimensionIds = new Set((clusterDims || []).map(cd => cd.created_dimension_id).filter(Boolean));
        console.log('[VlookupModal] Found vlookup dimension IDs:', Array.from(vlookupDimensionIds));

        // Now get the actual dimensions that are vlookup targets
        if (vlookupDimensionIds.size > 0) {
          const { data: targetDims, error: targetError } = await supabase
            .from("dimensions")
            .select("*")
            .eq("scope", "account")
            .eq("account_id", accountId)
            .in("id", Array.from(vlookupDimensionIds))
            .order("created_at", { ascending: false });
          
          if (targetError) {
            console.error('[VlookupModal] Error loading target dimensions:', targetError);
          } else {
            console.log('[VlookupModal] Loaded target vlookup dimensions:', targetDims?.length || 0);
            // Cast dimensions with proper scope type and conditions
            const typedDims = (targetDims || []).map(d => ({
              ...d,
              scope: d.scope as 'account' | 'custom' | 'global',
              conditions: (Array.isArray(d.conditions) ? d.conditions : []) as unknown as import("@/types/dimensions").DimensionCondition[]
            }));
            if (!cancel) setTargetDimensions(typedDims);
          }
        } else {
          console.log('[VlookupModal] No existing vlookup dimensions found');
          if (!cancel) setTargetDimensions([]);
        }
      }
    }
    loadDims();
    return () => { cancel = true; };
  }, [open, accountId, reportId]);

  // Load existing mappings and prefill rows on open
  useEffect(() => {
    let cancelled = false;
    
    async function loadExistingMappings() {
      if (!open) return;
      
      setIsLoadingExisting(true);
      console.log('[VlookupModal] Loading existing mappings for accountId:', accountId, 'reportId:', reportId);

      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Query cluster_dimensions with prioritized scope logic (same as save logic)
        let cdQuery = supabase
          .from('cluster_dimensions')
          .select('id, source_dimension_id, created_dimension_id, cluster_dimension_name, report_id, account_id, user_id')
          .eq('user_id', user.id);

        // Prioritize account-scoped over report-scoped (same logic as save)
        if (accountId) {
          cdQuery = cdQuery.eq('account_id', accountId);
        } else if (reportId) {
          cdQuery = cdQuery.eq('report_id', reportId);
        }

        const { data: cds, error: cdErr } = await cdQuery;
        if (cdErr) {
          console.error('[VlookupModal] Error loading cluster_dimensions:', cdErr);
          return;
        }

        console.log('[VlookupModal] Found cluster_dimensions:', cds?.length || 0);

        if (!cds || cds.length === 0) {
          console.log('[VlookupModal] No existing cluster dimensions found, using default empty row');
          if (!cancelled) {
            setRows([{ valuesToMap: [], newDimensionName: "", groupedValue: "" }]);
          }
          return;
        }

        // Load cluster mappings
        const cdIds = cds.map((c: any) => c.id);
        const { data: cms, error: cmErr } = await supabase
          .from('cluster_mappings')
          .select('cluster_dimension_id, source_values, cluster_name')
          .in('cluster_dimension_id', cdIds);

        if (cmErr) {
          console.error('[VlookupModal] Error loading cluster_mappings:', cmErr);
          return;
        }

        console.log('[VlookupModal] Found cluster_mappings:', cms?.length || 0);

        // Load target dimensions to get names
        const targetDimIds = cds.map((c: any) => c.created_dimension_id).filter(Boolean);
        let targetDims: any[] = [];
        
        if (targetDimIds.length > 0) {
          const { data: targetDimsData, error: targetErr } = await supabase
            .from('dimensions')
            .select('id, name')
            .in('id', targetDimIds);
          
          if (targetErr) {
            console.error('[VlookupModal] Error loading target dimensions:', targetErr);
          } else {
            targetDims = targetDimsData || [];
          }
        }

        const cdById = new Map(cds.map((c: any) => [c.id, c]));
        const targetDimById = new Map(targetDims.map((d: any) => [d.id, d]));
        const nextRows: Row[] = [];

        (cms || []).forEach((m: any) => {
          const cd = cdById.get(m.cluster_dimension_id);
          if (!cd) return;
          
          const values = Array.isArray(m.source_values) ? m.source_values : [];
          const targetDim = targetDimById.get(cd.created_dimension_id);
          
          nextRows.push({
            sourceDimensionId: cd.source_dimension_id,
            valuesToMap: values,
            targetDimensionId: cd.created_dimension_id || undefined,
            creatingNew: false,
            newDimensionName: targetDim?.name || cd.cluster_dimension_name || "",
            groupedValue: m.cluster_name || "",
          });
        });

        console.log('[VlookupModal] Loaded existing mappings into rows:', nextRows.length);

        if (!cancelled) {
          setRows(nextRows.length > 0 ? nextRows : [{ valuesToMap: [], newDimensionName: "", groupedValue: "" }]);
        }
      } catch (error) {
        console.error('[VlookupModal] Error in loadExistingMappings:', error);
      } finally {
        if (!cancelled) {
          setIsLoadingExisting(false);
        }
      }
    }

    // Load existing mappings when modal opens (don't wait for targetDimensions)
    if (open) {
      loadExistingMappings();
    }
    
    return () => { cancelled = true; };
  }, [open, accountId, reportId]);

  // Load "Values to Map" options for all unique source dimensions present in rows
  useEffect(() => {
    let cancelled = false;

    async function loadForDimension(dimensionId: string) {
      console.log('[VlookupModal] Loading values for dimension:', dimensionId);
      setLoadingOptionsMap(prev => ({ ...prev, [dimensionId]: true }));
      try {
        // Find dimension name for better value lookup
        const dimension = loadedDims.find(d => d.id === dimensionId);
        const dimensionName = dimension?.name;
        
        const values = await fetchUniqueDimensionValues({
          reportId: reportId ?? undefined,
          reportIds,
          dimensionId,
          dimensionName,
          limit: 5000,
        });
        console.log('[VlookupModal] Loaded values for dimension', dimensionId, ':', values?.length || 0, 'values');
        if (!cancelled) {
          setOptionsMap(prev => ({ ...prev, [dimensionId]: values || [] }));
        }
      } catch (error) {
        console.error('[VlookupModal] Error loading values for dimension', dimensionId, ':', error);
        if (!cancelled) {
          setOptionsMap(prev => ({ ...prev, [dimensionId]: [] }));
        }
      } finally {
        if (!cancelled) {
          setLoadingOptionsMap(prev => ({ ...prev, [dimensionId]: false }));
        }
      }
    }

    if (open) {
      const uniqueSourceIds = Array.from(new Set(rows.map(r => r.sourceDimensionId).filter(Boolean))) as string[];
      console.log('[VlookupModal] Loading values for source dimensions:', uniqueSourceIds);
      uniqueSourceIds.forEach(dimId => {
        if (!optionsMap[dimId] && !loadingOptionsMap[dimId]) {
          loadForDimension(dimId);
        }
      });
    }

    return () => { cancelled = true; };
  }, [open, JSON.stringify(rows.map(r => r.sourceDimensionId)), reportId, JSON.stringify(reportIds)]);

  const updateRow = (index: number, patch: Partial<Row>) => {
    setRows(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...patch };
      return copy;
    });
  };

  const addRow = () => {
    const firstSource = rows[0]?.sourceDimensionId;
    setRows(prev => [...prev, { sourceDimensionId: firstSource, valuesToMap: [], newDimensionName: "", groupedValue: "" }]);
  };
  
  const removeRow = (index: number) => setRows(prev => prev.filter((_, i) => i !== index));

  async function ensureTargetDimension(row: Row): Promise<string | null> {
    if (row.targetDimensionId) return row.targetDimensionId;

    const name = row.newDimensionName?.trim();
    if (!name) return null;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    // Check if dimension with this name already exists in account scope
    const { data: existing } = await supabase
      .from('dimensions')
      .select('id')
      .eq('scope', 'account')
      .eq('account_id', accountId)
      .eq('name', name)
      .eq('type', 'text')
      .limit(1);

    if (existing && existing.length > 0) {
      return existing[0].id;
    }

    // Create new account-scoped dimension with type 'text' (not 'vlookup')
    const insertData: any = {
      name,
      type: 'text', // Changed from 'vlookup' to 'text'
      user_id: user.id,
      scope: 'account',
      account_id: accountId,
      report_id: null, // Account-scoped, not report-specific
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

    const clusterName = (newName || 'Cluster').trim();

    // First, check for an existing cluster dimension using uniqueness on:
    // cluster_dimension_name + source_dimension_id + (account/report scope)
    let checkQuery = supabase
      .from('cluster_dimensions')
      .select('id')
      .eq('user_id', user.id)
      .eq('source_dimension_id', sourceDimensionId)
      .eq('cluster_dimension_name', clusterName);

    if (accountId) {
      checkQuery = checkQuery.eq('account_id', accountId).is('report_id', null);
    } else if (reportId) {
      checkQuery = checkQuery.eq('report_id', reportId).is('account_id', null);
    } else {
      // No scope provided: safest is to match nulls
      checkQuery = checkQuery.is('account_id', null).is('report_id', null);
    }

    const { data: existingByName } = await checkQuery.limit(1);
    if (existingByName && existingByName.length > 0) {
      return existingByName[0].id;
    }

    // Next, check by source + target combo (legacy path)
    let legacyQuery = supabase
      .from('cluster_dimensions')
      .select('id')
      .eq('user_id', user.id)
      .eq('source_dimension_id', sourceDimensionId)
      .eq('created_dimension_id', targetDimensionId);

    if (accountId) legacyQuery = legacyQuery.eq('account_id', accountId).is('report_id', null);
    else if (reportId) legacyQuery = legacyQuery.eq('report_id', reportId).is('account_id', null);
    else legacyQuery = legacyQuery.is('account_id', null).is('report_id', null);

    const { data: existingLegacy } = await legacyQuery.limit(1);
    if (existingLegacy && existingLegacy.length > 0) {
      return existingLegacy[0].id;
    }

    // Create new cluster dimension (account-scoped preferred)
    const insertData: any = {
      cluster_dimension_name: clusterName,
      source_dimension_id: sourceDimensionId,
      created_dimension_id: targetDimensionId,
      user_id: user.id,
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

  const handleSave = async () => {
    if (isSaving) return;
    
    try {
      setIsSaving(true);
      
      if (!accountId) {
        toast({ title: "Account required", description: "Target dimensions require an account context.", variant: "destructive" });
        return;
      }
      
      const valid = rows.filter(r =>
        r.sourceDimensionId &&
        r.valuesToMap.length > 0 &&
        r.newDimensionName.trim() &&
        r.groupedValue.trim()
      );
      
      if (valid.length === 0) {
        toast({ title: "Invalid data", description: "Please fill in all required fields.", variant: "destructive" });
        return;
      }

      for (const r of valid) {
        const targetId = await ensureTargetDimension(r);
        if (!targetId) continue;

        const clusterDimId = await findOrCreateClusterDimension(
          r.sourceDimensionId!,
          targetId,
          r.newDimensionName || "Cluster"
        );

        await upsertClusterMapping(clusterDimId, r.groupedValue, r.valuesToMap);
      }

      // Add newly created target dimensions to filter settings so they appear in FiltersBar
      if (reportId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Get unique target dimension IDs from valid rows
          const targetDimensionIds = Array.from(new Set(
            valid.map(r => r.targetDimensionId).filter(Boolean)
          ));

          if (targetDimensionIds.length > 0) {
            console.log('[VlookupModal] Adding target dimensions to filter settings:', targetDimensionIds);
            
            // Get current filter settings
            const { data: currentView } = await supabase
              .from('report_views')
              .select('filter_dimensions')
              .eq('report_id', reportId)
              .eq('user_id', user.id)
              .eq('is_default', true)
              .maybeSingle();

            const currentFilterDims = Array.isArray(currentView?.filter_dimensions) 
              ? currentView.filter_dimensions 
              : [];

            // Add new target dimensions to filter_dimensions if not already present
            const updatedFilterDims = Array.from(new Set([
              ...currentFilterDims,
              ...targetDimensionIds
            ]));

            if (updatedFilterDims.length > currentFilterDims.length) {
              await supabase
                .from('report_views')
                .upsert({
                  report_id: reportId,
                  user_id: user.id,
                  is_default: true,
                  filter_dimensions: updatedFilterDims,
                  name: 'Default View'
                }, {
                  onConflict: 'report_id,user_id,is_default'
                });
              
              console.log('[VlookupModal] Updated filter_dimensions:', updatedFilterDims);
            }
          }
        }
      }

      // Invalidate all relevant caches
      await Promise.all([
        // Invalidate vlookup mappings
        queryClient.invalidateQueries({ queryKey: ['vlookup-mappings', reportId ?? undefined, accountId ?? undefined] }),
        queryClient.invalidateQueries({ queryKey: ['vlookup-mappings'] }),
        
        // Invalidate dimensions cache to refresh FiltersBar
        queryClient.invalidateQueries({ queryKey: ['dimensions'] }),
        queryClient.invalidateQueries({ queryKey: ['performance-table-dimensions'] }),
        
        // Invalidate performance data to refresh with new mappings
        queryClient.invalidateQueries({ queryKey: ['performance-table-data'] }),
        queryClient.invalidateQueries({ queryKey: ['performance-table-filters'] }),
      ]);

      console.log('[VlookupModal] Cache invalidation completed after saving vlookup mappings');
      toast({ title: "Mappings saved", description: "Your pivot mappings were saved successfully. The new cluster dimension is now available in filters." });

      onCreate?.(valid as Row[]);
      onOpenChange(false);
    } catch (e: any) {
      console.error('Vlookup save error:', e);
      toast({ title: "Error", description: e?.message || "Failed to save mappings", variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  // Validation for save button
  const isValidForSave = rows.some(r =>
    r.sourceDimensionId &&
    r.valuesToMap.length > 0 &&
    r.newDimensionName.trim() &&
    r.groupedValue.trim()
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create Pivot Dimensions</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Loading indicator */}
          {isLoadingExisting && (
            <div className="text-center py-4">
              <div className="text-sm text-muted-foreground">Loading existing mappings...</div>
            </div>
          )}
          
          {/* Header row */}
          <div className="grid grid-cols-12 gap-4 text-sm font-medium text-muted-foreground border-b pb-2">
            <div className="col-span-3">Source Dimension</div>
            <div className="col-span-3">Values to Map</div>
            <div className="col-span-3">Target Dimension</div>
            <div className="col-span-2">Grouped Value</div>
            <div className="col-span-1">Actions</div>
          </div>

          {/* Data rows */}
          {rows.map((row, idx) => {
            const currentOptions = row.sourceDimensionId ? (optionsMap[row.sourceDimensionId] || []) : [];
            const loading = !!(row.sourceDimensionId && loadingOptionsMap[row.sourceDimensionId]);
            
            return (
              <div key={idx} className="grid grid-cols-12 gap-4 items-start py-2 border-b border-gray-100 last:border-b-0">
                {/* Source dimension */}
                <div className="col-span-3">
                  <Select
                    value={row.sourceDimensionId}
                    onValueChange={(val) => {
                      updateRow(idx, { sourceDimensionId: val, valuesToMap: [] });
                      // Prime options for this new source if not already loaded
                      if (!optionsMap[val]) {
                        setLoadingOptionsMap(prev => ({ ...prev, [val]: true }));
                        
                        // Find dimension name for better value lookup
                        const dimension = loadedDims.find(d => d.id === val);
                        const dimensionName = dimension?.name;
                        
                        fetchUniqueDimensionValues({
                          reportId: reportId ?? undefined,
                          reportIds,
                          dimensionId: val,
                          dimensionName,
                          limit: 5000,
                        }).then(values => {
                          setOptionsMap(prev => ({ ...prev, [val]: values || [] }));
                        }).finally(() => {
                          setLoadingOptionsMap(prev => ({ ...prev, [val]: false }));
                        });
                      }
                    }}
                  >
                    <SelectTrigger className="h-10">
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
                <div className="col-span-3">
                  <MultiSelect
                    options={currentOptions.map(v => ({ label: v, value: v }))}
                    values={row.valuesToMap}
                    onChange={(vals) => updateRow(idx, { valuesToMap: vals })}
                    placeholder={loading ? "Loading values…" : "Select values..."}
                    searchPlaceholder="Search..."
                    disabled={loading || !row.sourceDimensionId}
                    className="bg-background min-h-[40px]"
                  />
                </div>

                {/* Target dimension */}
                <div className="col-span-3">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className={cn(
                          "w-full justify-between h-10",
                          !row.newDimensionName && "text-muted-foreground"
                        )}
                      >
                        {row.newDimensionName || "Select or create dimension..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0">
                      <Command>
                        <CommandInput 
                          placeholder="Search or type new dimension name..."
                          value={row.newDimensionName}
                          onValueChange={(val) => {
                            updateRow(idx, { 
                              newDimensionName: val,
                              targetDimensionId: targetDimensions.find(d => d.name === val)?.id,
                              creatingNew: !targetDimensions.find(d => d.name === val)
                            });
                          }}
                        />
                        <CommandList>
                          {targetDimensions.length > 0 && (
                            <CommandGroup heading="Existing Pivot Dimensions">
                              {targetDimensions.map((dim) => (
                                <CommandItem
                                  key={dim.id}
                                  value={dim.name}
                                  onSelect={() => {
                                    updateRow(idx, { 
                                      newDimensionName: dim.name,
                                      targetDimensionId: dim.id,
                                      creatingNew: false
                                    });
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      row.targetDimensionId === dim.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {dim.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          )}
                          {row.newDimensionName && row.newDimensionName.trim() && !targetDimensions.find(d => d.name === row.newDimensionName) && (
                            <CommandGroup heading="Create New">
                              <CommandItem
                                value={row.newDimensionName}
                                onSelect={() => {
                                  updateRow(idx, { 
                                    newDimensionName: row.newDimensionName,
                                    targetDimensionId: undefined,
                                    creatingNew: true
                                  });
                                }}
                              >
                                <Check className="mr-2 h-4 w-4 opacity-0" />
                                Create "{row.newDimensionName}"
                              </CommandItem>
                            </CommandGroup>
                          )}
                          {targetDimensions.length === 0 && !row.newDimensionName && (
                            <CommandEmpty>
                              <div className="p-4 text-center text-sm text-muted-foreground">
                                <p>No existing pivot dimensions.</p>
                                <p className="mt-2">Type a name to create a new dimension.</p>
                              </div>
                            </CommandEmpty>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Grouped value */}
                <div className="col-span-2">
                  <Input
                    placeholder="e.g., Brady"
                    value={row.groupedValue}
                    onChange={(e) => updateRow(idx, { groupedValue: e.target.value })}
                    className="h-10"
                  />
                </div>

                {/* Actions */}
                <div className="col-span-1 flex items-center justify-center">
                  {rows.length > 1 && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => removeRow(idx)}
                      className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Add row button */}
          <div className="flex justify-start">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={addRow}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Row
            </Button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 pt-6 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={!isValidForSave || isSaving}
            className="min-w-[80px]"
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}