import { useState, useEffect } from "react";
import { sortKPIsByDefaultOrder } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Save, X } from "lucide-react";

interface KPISettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: string | null;
  onSettingsChange?: () => void;
  visibilityRefreshTrigger?: number;
}

interface KPIConfig {
  name: string;
  visible: boolean;
  order: number;
}

function SortableKPIItem({ kpi, onToggle }: { kpi: KPIConfig; onToggle: (name: string) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: kpi.name });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 bg-card border rounded-md hover:bg-accent/50"
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>
      <Checkbox
        id={`kpi-${kpi.name}`}
        checked={kpi.visible}
        onCheckedChange={() => onToggle(kpi.name)}
      />
      <Label
        htmlFor={`kpi-${kpi.name}`}
        className="flex-1 cursor-pointer"
      >
        {kpi.name}
      </Label>
    </div>
  );
}

export function KPISettingsModal({ open, onOpenChange, reportId, onSettingsChange, visibilityRefreshTrigger }: KPISettingsModalProps) {
  const [kpis, setKpis] = useState<KPIConfig[]>([]);
  const [initialKpis, setInitialKpis] = useState<KPIConfig[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (open && reportId) {
      loadKPISettings();
    }
  }, [open, reportId]);

  // Refresh KPI settings when dimension visibility changes
  useEffect(() => {
    if (open && reportId && visibilityRefreshTrigger && visibilityRefreshTrigger > 0) {
      console.log('[testing] Refreshing KPI settings due to dimension visibility change');
      loadKPISettings();
    }
  }, [visibilityRefreshTrigger, open, reportId]);

  const loadKPISettings = async () => {
    if (!reportId) return;

    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load all KPIs that are mapped in data sources or have formulas (even if currently zero/empty)
      console.log('[testing] KPISettings - Loading all mapped KPIs for report:', reportId);

      // Get all dimensions that are either:
      // 1. Mapped in data sources for this report
      // 2. Have formulas (calculated KPIs)
      // 3. Are numeric types (exclude text dimensions)
      
      // First, get dimension IDs that are mapped in data sources
      const { data: dataSources, error: dsError } = await supabase
        .from("data_sources")
        .select("column_mappings")
        .eq("report_id", reportId);

      if (dsError) throw dsError;

      const mappedDimensionIds = new Set<string>();
      
      if (dataSources && dataSources.length > 0) {
        dataSources.forEach(ds => {
          if (ds.column_mappings && Array.isArray(ds.column_mappings)) {
            ds.column_mappings.forEach((mapping: any) => {
              if (mapping.dimensionId && mapping.dimensionId !== 'none' && mapping.dimensionId !== null) {
                mappedDimensionIds.add(mapping.dimensionId);
              }
            });
          }
        });
      }

      console.log('[testing] Found mapped dimension IDs:', Array.from(mappedDimensionIds));

      // Get all numeric dimensions (global and custom) - include all since mappings exist
      const { data: allDimensions, error: dimError } = await supabase
        .from("dimensions")
        .select("id, name, type, scope, formula")
        .in("type", ["number", "currency", "percentage"]) // Exclude text dimensions
        .or(`scope.eq.global,and(scope.eq.custom,user_id.eq.${user.id})`);

      if (dimError) throw dimError;

      // Filter to include:
      // 1. Dimensions that are mapped in data sources
      // 2. Dimensions with formulas (calculated KPIs)
      // 3. All global dimensions (they're available for all reports)
      const relevantDimensions = allDimensions?.filter(dim => 
        mappedDimensionIds.has(dim.id) ||  // Mapped in data source
        dim.formula ||                     // Has formula (calculated)
        dim.scope === 'global'             // Global dimensions are always available
      ) || [];

      // Remove duplicates by name, prioritizing custom > global
      const uniqueDimensions = relevantDimensions.filter((dim, index, arr) => 
        arr.findIndex(d => d.name === dim.name) === index
      );

      const availableKPIs = sortKPIsByDefaultOrder(uniqueDimensions.map(d => d.name));
      console.log('[testing] KPISettings - All available KPIs (mapped + formulas):', availableKPIs.length, availableKPIs);
      
      if (availableKPIs.length === 0) {
        setKpis([]);
        setIsLoading(false);
        return;
      }

      // Load the current view settings
      const { data: views, error: viewError } = await supabase
        .from("report_views")
        .select("*")
        .eq("report_id", reportId)
        .eq("user_id", user.id)
        .eq("is_default", true)
        .maybeSingle();

      if (viewError) throw viewError;

      let kpiConfigs: KPIConfig[];

      if (views?.visible_kpis && views?.kpi_order) {
        // Load from saved settings
        const visibleKPIs = new Set(views.visible_kpis as string[]);
        const savedOrder = views.kpi_order as string[];
        
        // Merge saved order with any new KPIs that might have been added
        const savedKPIsSet = new Set(savedOrder);
        const newKPIs = availableKPIs.filter(name => !savedKPIsSet.has(name));
        // Sort new KPIs using default order, then append to saved order
        const sortedNewKPIs = sortKPIsByDefaultOrder(newKPIs);
        const allKPIsOrdered = [...savedOrder, ...sortedNewKPIs];
        
        kpiConfigs = allKPIsOrdered
          .filter(name => availableKPIs.includes(name)) // Only include KPIs that still exist
          .map((name, index) => ({
            name,
            visible: visibleKPIs.has(name),
            order: index,
          }));
      } else {
        // Use all available KPIs as default - all visible
        kpiConfigs = availableKPIs.map((name, index) => ({
          name,
          visible: true,
          order: index,
        }));
      }

      setKpis(kpiConfigs);
      setInitialKpis([...kpiConfigs]); // Store initial state for comparison
      console.log('[testing] Loaded KPI settings:', kpiConfigs.length, 'KPIs');
    } catch (error) {
      console.error("Error loading KPI settings:", error);
      toast({
        title: "Error",
        description: "Failed to load KPI settings.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = (name: string) => {
    console.log('[testing] Toggling KPI:', name);
    setKpis(prev => 
      prev.map(kpi => 
        kpi.name === name ? { ...kpi, visible: !kpi.visible } : kpi
      )
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      setKpis((items) => {
        const oldIndex = items.findIndex(item => item.name === active.id);
        const newIndex = items.findIndex(item => item.name === over.id);
        
        return arrayMove(items, oldIndex, newIndex).map((item, index) => ({
          ...item,
          order: index,
        }));
      });
    }
  };

  const applySettings = async () => {
    if (!reportId || kpis.length === 0) return;

    try {
      setIsSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Error",
          description: "You must be logged in to save KPI settings",
          variant: "destructive",
        });
        return;
      }

      const visibleKPIs = kpis.filter(k => k.visible).map(k => k.name);
      const kpiOrder = kpis.map(k => k.name);

      console.log('[testing] Applying KPI settings:', { visibleKPIs, kpiOrder });

      // Update the default view with KPI settings
      const { error } = await supabase
        .from("report_views")
        .update({
          visible_kpis: visibleKPIs,
          kpi_order: visibleKPIs,
          name: "Default View", // Add required name field
        })
        .eq("report_id", reportId)
        .eq("user_id", user.id)
        .eq("is_default", true);

      if (error) throw error;

      // Update initial state to match current state
      setInitialKpis([...kpis]);

      toast({
        title: "Success",
        description: "KPI settings applied successfully",
      });

      console.log('[testing] KPI settings applied successfully');
      onSettingsChange?.();
    } catch (error) {
      console.error("Error saving KPI settings:", error);
      toast({
        title: "Error",
        description: "Failed to save KPI settings. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const cancelSettings = () => {
    setKpis([...initialKpis]);
    console.log('[testing] Cancelled KPI settings changes');
  };

  const hasUnsavedChanges = () => {
    if (kpis.length !== initialKpis.length) return true;
    
    return kpis.some((kpi, index) => {
      const initial = initialKpis[index];
      return !initial || kpi.visible !== initial.visible || kpi.order !== initial.order;
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>KPI Settings</SheetTitle>
          <SheetDescription>
            Choose which KPIs to display and drag to reorder them.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-2">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading KPI settings...
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={kpis.map(k => k.name)}
                strategy={verticalListSortingStrategy}
              >
                {kpis.map((kpi) => (
                  <SortableKPIItem
                    key={kpi.name}
                    kpi={kpi}
                    onToggle={handleToggle}
                  />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* Apply/Cancel buttons */}
        {hasUnsavedChanges() && (
          <div className="border-t pt-4 mt-6 space-y-3">
            <div className="flex gap-2">
              <Button 
                onClick={applySettings} 
                disabled={isSaving}
                className="flex-1 gap-2"
                variant="default"
              >
                <Save className="h-4 w-4" />
                {isSaving ? "Applying..." : "Apply Settings"}
              </Button>
              <Button 
                onClick={cancelSettings} 
                disabled={isSaving}
                variant="outline"
                className="gap-2"
              >
                <X className="h-4 w-4" />
                Cancel
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}