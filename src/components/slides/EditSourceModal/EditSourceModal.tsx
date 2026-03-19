import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, X, ChevronLeft, ChevronRight, Loader2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChannelTabsList, DimensionValuesList } from "./index";
import { ModalStep } from "@/hooks/useEditSourceModal";

interface Dimension {
  id: string;
  name: string;
  type: string;
}

interface ChannelConfig {
  dimensionId: string | null;
  selectedValues: string[];
}

interface BreakdownConfig {
  breakdownDimensionIds: string[];
}

interface FilterConfig {
  filterDimensionIds: string[];
}

interface EditSourceModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  modalStep: ModalStep;
  selectedDimensions: {
    metasearch: boolean;
    sem: boolean;
    social: boolean;
  };
  handleDimensionToggle: (dimension: 'metasearch' | 'sem' | 'social') => void;
  selectedChannels: ('metasearch' | 'sem' | 'social')[];
  selectedValueDimensionIds: string[];
  handleValueDimensionToggle: (dimensionId: string) => void;
  handleSelectAllDimensions: () => void;
  handleDeselectAllDimensions: () => void;
  availableDimensions: Record<string, Dimension[]>;
  loadingAvailableDimensions: boolean;
  activeChannelTab: 'metasearch' | 'sem' | 'social' | null;
  setActiveChannelTab: (channel: 'metasearch' | 'sem' | 'social' | null) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  channelConfigs: Record<string, ChannelConfig>;
  dimensions: Record<string, Dimension[]>;
  dimensionValues: Record<string, string[]>;
  loadingDimensions: Record<string, boolean>;
  loadingValues: Record<string, boolean>;
  handleDimensionChange: (channel: 'metasearch' | 'sem' | 'social', dimensionId: string) => void;
  handleValueToggle: (channel: 'metasearch' | 'sem' | 'social', value: string) => void;
  handleSelectAllValues: (channel: 'metasearch' | 'sem' | 'social') => void;
  handleDeselectAllValues: (channel: 'metasearch' | 'sem' | 'social') => void;
  breakdownDimensions: Record<string, Dimension[]>;
  breakdownConfigs: Record<string, BreakdownConfig>;
  loadingBreakdownDimensions: Record<string, boolean>;
  handleBreakdownToggle: (channel: 'metasearch' | 'sem' | 'social', dimensionId: string) => void;
  filterConfigs: Record<string, FilterConfig>;
  handleFilterDimensionToggle: (channel: 'metasearch' | 'sem' | 'social', dimensionId: string) => void;
  handleNext: () => void;
  handleBack: () => void;
  handleModalClose: (open: boolean) => void;
  availableChannels?: ('metasearch' | 'sem' | 'social')[];
}

export function EditSourceModal({
  isOpen,
  onOpenChange,
  modalStep,
  selectedDimensions,
  handleDimensionToggle,
  selectedChannels,
  selectedValueDimensionIds,
  handleValueDimensionToggle,
  handleSelectAllDimensions,
  handleDeselectAllDimensions,
  availableDimensions,
  loadingAvailableDimensions,
  activeChannelTab,
  setActiveChannelTab,
  searchQuery,
  setSearchQuery,
  channelConfigs,
  dimensions,
  dimensionValues,
  loadingDimensions,
  loadingValues,
  handleDimensionChange,
  handleValueToggle,
  handleSelectAllValues,
  handleDeselectAllValues,
  breakdownDimensions,
  breakdownConfigs,
  loadingBreakdownDimensions,
  handleBreakdownToggle,
  filterConfigs,
  handleFilterDimensionToggle,
  handleNext,
  handleBack,
  handleModalClose,
  availableChannels = ['metasearch', 'sem', 'social'], // Default to all channels if not provided
}: EditSourceModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[85vh] max-h-[700px] flex flex-col overflow-hidden">
        <DialogHeader className="flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <DialogTitle>
                {modalStep === 1 && "Select Channels"}
                {modalStep === 2 && "Value Dimensions"}
                {modalStep === 3 && "Data Source"}
              </DialogTitle>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => handleModalClose(false)}
              className="h-6 w-6"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Step {Math.min(modalStep, 3)} of 3 — Configure channels, metrics, and data source.
          </p>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          {/* Step 1: Channel Selection */}
          {modalStep === 1 && (
            <div className="space-y-4">
              {/* Always show all 3 channels. When availableChannels is empty (still loading),
                  show all as selectable. Channels not yet matched to a report are shown
                  with a note but remain clickable — validation happens at save time. */}
              <div className="space-y-3">
                {(['metasearch', 'sem', 'social'] as const).map((ch) => {
                  const labels: Record<string, string> = { metasearch: 'Metasearch', sem: 'SEM', social: 'Social' };
                  const isAvailable = availableChannels.length === 0 || availableChannels.includes(ch);
                  const isChecked = selectedDimensions[ch];
                  return (
                    <div
                      key={ch}
                      className={cn(
                        "flex items-center gap-3 p-4 rounded-lg border-2 cursor-pointer transition-colors",
                        isChecked ? 'border-primary bg-primary/5' : 'border-border',
                        !isAvailable && availableChannels.length > 0 ? 'opacity-40 cursor-not-allowed' : ''
                      )}
                      onClick={() => {
                        if (!isAvailable && availableChannels.length > 0) return;
                        handleDimensionToggle(ch);
                      }}
                    >
                      <Checkbox
                        checked={isChecked}
                        disabled={!isAvailable && availableChannels.length > 0}
                        onCheckedChange={() => {
                          if (!isAvailable && availableChannels.length > 0) return;
                          handleDimensionToggle(ch);
                        }}
                        className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                      />
                      <div className="flex-1">
                        <span className="font-medium">{labels[ch]}</span>
                        {!isAvailable && availableChannels.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-0.5">No report found — create a &quot;{labels[ch]}&quot; report first</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2: Value Dimensions - Applies to all selected channels */}
          {modalStep === 2 && (
            <div className="flex flex-col gap-4 pb-4">
              {loadingAvailableDimensions ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <span>Loading dimensions...</span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="bg-muted/30 rounded-lg p-4">
                    <p className="text-sm text-muted-foreground">
                      Select which <span className="font-medium">value dimensions</span> (metrics) to include in this slide for <span className="font-medium">all selected channels</span>. These are the numeric metrics used for calculations and aggregations.
                    </p>
                  </div>
                  
                  <div className="flex-1 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">
                        Available Value Dimensions (Metrics)
                      </Label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleSelectAllDimensions}
                        >
                          Select All
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleDeselectAllDimensions}
                        >
                          Deselect All
                        </Button>
                      </div>
                    </div>
                    <div className="border rounded-md overflow-y-auto max-h-[280px]">
                      <div className="p-2 space-y-1">
                        {availableDimensions.metasearch?.length > 0 ? (
                          availableDimensions.metasearch.map(dim => {
                            const isSelected = selectedValueDimensionIds.includes(dim.id);
                            return (
                              <div
                                key={dim.id}
                                className={cn(
                                  "flex items-center gap-3 p-2 rounded cursor-pointer transition-colors",
                                  isSelected
                                    ? "bg-primary/10"
                                    : "hover:bg-muted/50"
                                )}
                                onClick={() => handleValueDimensionToggle(dim.id)}
                              >
                                <Checkbox
                                  checked={isSelected}
                                  onCheckedChange={() => handleValueDimensionToggle(dim.id)}
                                />
                                <div className="flex-1">
                                  <span className="text-sm">{dim.name}</span>
                                  <span className="ml-2 text-xs text-muted-foreground">({dim.type})</span>
                                </div>
                              </div>
                            );
                          })
                        ) : (
                          <p className="text-center text-muted-foreground py-4">
                            No value dimensions available
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 3: Dimension & Value Selection (Data Source) */}
          {modalStep === 3 && (
            <div className="flex gap-4 min-h-[350px] max-h-[400px] pb-4">
              {/* Left: Channel tabs */}
              <ChannelTabsList
                selectedChannels={selectedChannels}
                activeChannelTab={activeChannelTab}
                setActiveChannelTab={(channel) => {
                  setActiveChannelTab(channel);
                  setSearchQuery("");
                }}
                getChannelBadgeCount={(channel) => channelConfigs[channel]?.selectedValues?.length || 0}
              />

              {/* Right: Dimension selector */}
              <div className="flex-1 flex flex-col gap-4">
                {activeChannelTab && (
                  <>
                    {loadingDimensions[activeChannelTab] ? (
                      <div className="flex-1 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-8 w-8 animate-spin" />
                          <span>Loading dimensions...</span>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div>
                          <Label className="text-sm font-medium mb-2 block">
                            Dimension
                          </Label>
                          <Select
                            value={channelConfigs[activeChannelTab]?.dimensionId || ""}
                            onValueChange={value => handleDimensionChange(activeChannelTab, value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Choose a dimension..." />
                            </SelectTrigger>
                            <SelectContent>
                              {dimensions[activeChannelTab]?.map(dim => (
                                <SelectItem key={dim.id} value={dim.id}>
                                  {dim.name}
                                </SelectItem>
                              ))}
                              {(!dimensions[activeChannelTab] || dimensions[activeChannelTab].length === 0) && (
                                <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                                  No dimensions available
                                </div>
                              )}
                            </SelectContent>
                          </Select>
                        </div>

                        {channelConfigs[activeChannelTab]?.dimensionId && (
                          <DimensionValuesList
                            values={dimensionValues[activeChannelTab] || []}
                            selectedValues={channelConfigs[activeChannelTab]?.selectedValues || []}
                            loading={loadingValues[activeChannelTab] || false}
                            onValueToggle={(value) => handleValueToggle(activeChannelTab, value)}
                            onSelectAll={() => handleSelectAllValues(activeChannelTab)}
                            onDeselectAll={() => handleDeselectAllValues(activeChannelTab)}
                          />
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

        </ScrollArea>

        {/* Footer Navigation */}
        <div className="flex-shrink-0 border-t pt-4 space-y-3">
          {modalStep === 3 && (
            <div className="flex items-start gap-2 px-1 py-2 rounded-md bg-muted/40 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>
                <strong>Breakdowns</strong> can be configured in Data Sources → Column Mappings where available. Report <strong>filters</strong> are managed in Data Studio.
              </span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              onClick={modalStep === 1 ? () => handleModalClose(false) : handleBack}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              {modalStep === 1 ? "Cancel" : "Back"}
            </Button>
            <Button
              onClick={handleNext}
              disabled={modalStep === 1 && selectedChannels.length === 0 && !selectedDimensions.metasearch && !selectedDimensions.sem && !selectedDimensions.social}
            >
              {modalStep === 3 ? "Save" : "Next"}
              {modalStep !== 3 && <ChevronRight className="h-4 w-4 ml-1" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
