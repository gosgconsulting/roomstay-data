import { useState, useEffect } from "react";
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
  visibilityRefreshTrigger?: number; // Trigger to refresh when dimension visibility changes
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

      // Load dimensions with proper scope filtering (same logic as DimensionsListModal)
      console.log('[testing] KPISettings - Loading dimensions for user:', user.id);

      // Load global dimensions
      const { data: globalData, error: globalError } = await supabase
        .from("dimensions")
        .select("*")
        .eq("scope", "global")
        .in("type", ["number", "currency", "percentage"])
        .order("created_at", { ascending: false });

      if (globalError) throw globalError;

      // Load account-specific dimensions if accountId is available (we don't have it in this modal)
      // For now, we'll skip account dimensions in KPI Settings
      
      // Load user's custom dimensions
      const { data: customData, error: customError } = await supabase
        .from("dimensions")
        .select("*")
        .eq("scope", "custom")
        .eq("user_id", user.id)
        .in("type", ["number", "currency", "percentage"])
        .order("created_at", { ascending: false });

      if (customError) throw customError;

      // Combine dimensions with proper precedence (custom > global)
      const allDimensions = [
        ...(customData || []),    // Custom dimensions take precedence
        ...(globalData || [])     // Then global dimensions
      ];

      // Remove duplicates by name, keeping first occurrence (most specific scope)
      const uniqueDimensions = allDimensions.filter((dim, index, arr) => 
        arr.findIndex(d => d.name === dim.name) === index
      );

      console.log('[testing] KPISettings - Loaded dimensions:', {
        global: globalData?.length || 0,
        custom: customData?.length || 0,
        total: uniqueDimensions.length
      });

      // Get all available KPI names from dimensions
      const availableKPIs = uniqueDimensions?.map(d => d.name) || [];
      
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
        const allKPIsOrdered = [...savedOrder, ...newKPIs];
        
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
          kpi_order: kpiOrder,
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
