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
import { loadDimensionsForUser } from "@/lib/dimensionLoader";

interface KPISettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: string | null;
  onSettingsChange?: () => void;
  visibilityRefreshTrigger?: number;
  isEditMode?: boolean;
}

interface KPIConfig {
  name: string;
  visible: boolean;
  order: number;
}

function SortableKPIItem({ 
  kpi, 
  onToggle, 
  isEditMode = true
}: { 
  kpi: KPIConfig; 
  onToggle: (name: string) => void;
  isEditMode?: boolean;
}) {
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
      className={`flex items-center gap-3 p-3 bg-white border rounded-md hover:bg-accent/50 ${
        !isEditMode ? 'opacity-60' : ''
      }`}
    >
      <div
        {...(isEditMode ? attributes : {})}
        {...(isEditMode ? listeners : {})}
        className={isEditMode ? "cursor-grab active:cursor-grabbing" : "cursor-not-allowed"}
      >
        <GripVertical className={`h-4 w-4 ${isEditMode ? 'text-gray-400' : 'text-gray-300'}`} />
      </div>
      <Checkbox
        id={`kpi-${kpi.name}`}
        checked={kpi.visible}
        onCheckedChange={() => onToggle(kpi.name)}
        disabled={!isEditMode}
      />
      <Label
        htmlFor={`kpi-${kpi.name}`}
        className={`flex-1 ${isEditMode ? 'cursor-pointer' : 'cursor-default'}`}
      >
        {kpi.name}
      </Label>
    </div>
  );
}

export function KPISettingsModal({ 
  open, 
  onOpenChange, 
  reportId, 
  onSettingsChange,
  visibilityRefreshTrigger,
  isEditMode = false
}: KPISettingsModalProps) {
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
      console.log('[KPI-SETTINGS] Refreshing KPI settings due to dimension visibility change');
      loadKPISettings();
    }
  }, [visibilityRefreshTrigger, open, reportId]);

  const loadKPISettings = async () => {
    if (!reportId) return;

    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('[KPI-SETTINGS] No authenticated user found');
        return;
      }

      console.log('[KPI-SETTINGS] Loading KPI settings for report:', reportId);

      // Load KPI settings from the default report view for THIS specific report
      const { data: viewData, error } = await supabase
        .from("report_views")
        .select("visible_kpis, kpi_order")
        .eq("report_id", reportId)
        .eq("user_id", user.id)
        .eq("is_default", true)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('[KPI-SETTINGS] Error loading KPI settings:', error);
        throw error;
      }

      console.log('[KPI-SETTINGS] Loaded view data:', viewData);

      // NEW: Use centralized dimension loader instead of direct query
      const allDimensions = await loadDimensionsForUser(user.id, reportId);
      console.log('[KPI-SETTINGS] Loaded all dimensions:', allDimensions.length);

      // Filter to only KPI-type dimensions (number, currency, percentage)
      const kpiDimensions = allDimensions.filter(d => 
        d.type === "number" || d.type === "currency" || d.type === "percentage"
      );

      console.log('[KPI-SETTINGS] Filtered KPI dimensions:', kpiDimensions.map(d => `${d.name} (${d.type})`));

      const availableKPIs = sortKPIsByDefaultOrder(kpiDimensions.map(d => d.name));
      console.log('[KPI-SETTINGS] Available KPIs for report', reportId, ':', availableKPIs);

      // If no KPI dimensions found, show default KPIs
      if (availableKPIs.length === 0) {
        console.warn('[KPI-SETTINGS] No KPI dimensions found, using default KPIs');
        const defaultKPIs = ['Impressions', 'Clicks', 'CTR', 'Conversions', 'Conversion rate', 'CPC', 'Cost', 'Revenue', 'ROAS', 'Cost of sale'];
        const defaultItems: KPIConfig[] = defaultKPIs.map((kpi, index) => ({
          name: kpi,
          visible: true,
          order: index
        }));
        setKpis(defaultItems);
        setInitialKpis([...defaultItems]);
        return;
      }

      const visibleKPIs = (viewData?.visible_kpis as string[]) || availableKPIs;
      const kpiOrder = (viewData?.kpi_order as string[]) || availableKPIs;

      console.log('[KPI-SETTINGS] Current visible KPIs:', visibleKPIs);
      console.log('[KPI-SETTINGS] Current KPI order:', kpiOrder);

      // Create KPI items based on order, with visibility info
      const orderedItems: KPIConfig[] = [];
      
      // First, add items in the saved order
      kpiOrder.forEach(kpi => {
        if (availableKPIs.includes(kpi) && !orderedItems.find(item => item.name === kpi)) {
          orderedItems.push({
            name: kpi,
            visible: visibleKPIs.includes(kpi),
            order: orderedItems.length
          });
        }
      });
      
      // Then add any remaining available KPIs that weren't in the order
      availableKPIs.forEach(kpi => {
        if (!orderedItems.find(item => item.name === kpi)) {
          orderedItems.push({
            name: kpi,
            visible: visibleKPIs.includes(kpi),
            order: orderedItems.length
          });
        }
      });

      console.log('[KPI-SETTINGS] Final ordered KPI items:', orderedItems);
      setKpis(orderedItems);
      setInitialKpis([...orderedItems]); // Store initial state for comparison
    } catch (error) {
      console.error('[KPI-SETTINGS] Error loading KPI settings:', error);
      toast({
        title: "Error",
        description: `Failed to load KPI settings: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = (name: string) => {
    if (!isEditMode) {
      toast({
        title: "Edit Mode Required",
        description: "Switch to Edit Mode to modify KPI settings.",
        variant: "destructive",
      });
      return;
    }
    
    console.log('[KPI-SETTINGS] Toggling KPI:', name);
    setKpis(prev => 
      prev.map(kpi => 
        kpi.name === name ? { ...kpi, visible: !kpi.visible } : kpi
      )
    );
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (!isEditMode) {
      toast({
        title: "Edit Mode Required",
        description: "Switch to Edit Mode to reorder KPIs.",
        variant: "destructive",
      });
      return;
    }
    
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
    if (!isEditMode) {
      toast({
        title: "Edit Mode Required",
        description: "Switch to Edit Mode to save KPI settings.",
        variant: "destructive",
      });
      return;
    }
    
    if (!reportId) return;
    
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const visibleKPIs = kpis.filter(item => item.visible).map(item => item.name);
      const kpiOrder = kpis.map(item => item.name);

      console.log('[KPI-SETTINGS] Saving KPI settings for report:', reportId, {
        visibleKPIs,
        kpiOrder
      });

      // Update the default report view for THIS specific report
      const { error } = await supabase
        .from("report_views")
        .update({
          visible_kpis: visibleKPIs,
          kpi_order: kpiOrder,
          updated_at: new Date().toISOString()
        })
        .eq("report_id", reportId)
        .eq("user_id", user.id)
        .eq("is_default", true);

      if (error) {
        console.error('[KPI-SETTINGS] Error saving KPI settings:', error);
        throw error;
      }

      console.log('[KPI-SETTINGS] KPI settings saved successfully for report:', reportId);
      
      // Update initial state to match current state
      setInitialKpis([...kpis]);

      toast({
        title: "Success",
        description: "KPI settings saved for this report.",
      });

      onSettingsChange?.();
      onOpenChange(false);
    } catch (error) {
      console.error('[KPI-SETTINGS] Error saving KPI settings:', error);
      toast({
        title: "Error",
        description: "Failed to save KPI settings.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const cancelSettings = () => {
    setKpis([...initialKpis]);
    console.log('[KPI-SETTINGS] Cancelled KPI settings changes');
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
            Configure which KPIs to show and their order for this report only.
            {!isEditMode && (
              <span className="block mt-2 text-amber-600 font-medium">
                Switch to Edit Mode to modify settings.
              </span>
            )}
          </SheetDescription>
        </SheetHeader>
        
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden flex flex-col mt-6">
            <div className="mb-4">
              <Label className="text-sm font-medium">
                Drag to reorder, click checkbox to show/hide
              </Label>
              {kpis.length === 0 && (
                <p className="text-sm text-muted-foreground mt-2">
                  No KPI dimensions found. Make sure your report has dimensions with number, currency, or percentage types.
                </p>
              )}
            </div>
            
            <div className="flex-1 overflow-y-auto">
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
                      isEditMode={isEditMode}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          </div>
        )}
        
        {/* Apply/Cancel buttons - only show if in Edit Mode and has changes */}
        {isEditMode && hasUnsavedChanges() && (
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
        
        {/* Show read-only message in View Mode */}
        {!isEditMode && (
          <div className="border-t pt-4 mt-6">
            <p className="text-sm text-muted-foreground text-center">
              Settings are read-only in View Mode. Switch to Edit Mode to make changes.
            </p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}