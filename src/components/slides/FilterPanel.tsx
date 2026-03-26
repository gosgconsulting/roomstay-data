/**
 * FilterPanel — Data Studio filter settings modal.
 *
 * Purpose: configure WHICH dimensions appear as filter dropdowns next to the
 * date range in FiltersRow. Checking a dimension here adds it to filterConfigs
 * (persisted to slide_reports), which causes the corresponding inline dropdown
 * to appear in the top bar.
 *
 * Value selection (filtering rows) happens inline in FiltersRow, not here.
 */

import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DimensionNameMap, FilterConfigs } from '@/hooks/useDataStudioFilters';

type Channel = 'metasearch' | 'sem' | 'social';

const CHANNEL_LABELS: Record<Channel, string> = {
  metasearch: 'Metasearch',
  sem: 'SEM',
  social: 'Social',
};

export interface AvailableDimension {
  id: string;
  name: string;
  type: string;
}

// ─── Channel panel — checkbox list of available dimensions ────────────────────

interface ChannelPanelProps {
  channel: Channel;
  availableDims: AvailableDimension[];
  filterConfigs: FilterConfigs;
  dimensionNames: DimensionNameMap;
  onToggleDimension: (channel: Channel, dimId: string) => void;
  isReadOnly: boolean;
}

function ChannelPanel({
  channel,
  availableDims,
  filterConfigs,
  dimensionNames,
  onToggleDimension,
  isReadOnly,
}: ChannelPanelProps) {
  const enabledIds = new Set(filterConfigs[channel]?.filterDimensionIds ?? []);

  // Build candidate list, deduplicating by name.
  // Enabled IDs may use global UUIDs while availableDims use report-specific IDs.
  // Prefer the enabled ID when both share the same name so toggling off works correctly.
  const candidateDims: AvailableDimension[] = useMemo(() => {
    const seenNames = new Map<string, AvailableDimension>();

    // First pass: add enabled dimensions (so their IDs take priority)
    for (const id of enabledIds) {
      const name = (availableDims.find(d => d.id === id)?.name) || dimensionNames[id] || id;
      const lowerName = name.toLowerCase();
      if (!seenNames.has(lowerName)) {
        seenNames.set(lowerName, { id, name, type: 'text' });
      }
    }

    // Second pass: add available dims not yet seen by name
    for (const dim of availableDims) {
      const lowerName = dim.name.toLowerCase();
      if (!seenNames.has(lowerName)) {
        seenNames.set(lowerName, dim);
      }
    }

    // Sort: enabled first, then alphabetically
    return [...seenNames.values()].sort((a, b) => {
      const aEnabled = enabledIds.has(a.id) ? 0 : 1;
      const bEnabled = enabledIds.has(b.id) ? 0 : 1;
      if (aEnabled !== bEnabled) return aEnabled - bEnabled;
      return a.name.localeCompare(b.name);
    });
  }, [availableDims, enabledIds, dimensionNames]);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        Filter dimensions
      </p>
      {candidateDims.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">
          No text dimensions found for this channel. Map columns in Data Sources first.
        </p>
      ) : (
        <div className="space-y-1">
          {candidateDims.map((dim) => {
            const isEnabled = enabledIds.has(dim.id);
            return (
              <button
                key={dim.id}
                type="button"
                disabled={isReadOnly}
                onClick={() => !isReadOnly && onToggleDimension(channel, dim.id)}
                className={cn(
                  'w-full flex items-center gap-3 rounded-md px-3 py-2 text-left transition-colors',
                  isEnabled
                    ? 'bg-primary/8 hover:bg-primary/12'
                    : 'hover:bg-accent',
                  isReadOnly && 'cursor-default opacity-60'
                )}
              >
                <Checkbox
                  checked={isEnabled}
                  onCheckedChange={() => {}}
                  className="shrink-0 pointer-events-none"
                />
                <span className={cn('text-sm flex-1 truncate', isEnabled && 'font-medium')}>
                  {dim.name}
                </span>
                {isEnabled && (
                  <Badge variant="secondary" className="h-4 px-1.5 text-[10px] shrink-0 bg-primary/10 text-primary">
                    active
                  </Badge>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main FilterPanel ─────────────────────────────────────────────────────────

export interface FilterPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTab: string;
  filterConfigs: FilterConfigs;
  dimensionNames: DimensionNameMap;
  activeFilterCount: number;
  /** Available text dimensions per channel (candidates to enable as filters). */
  availableDimensions?: Record<string, AvailableDimension[]>;
  /** Toggle a dimension in/out of filterConfigs for a channel. */
  onToggleDimension?: (channel: Channel, dimId: string) => void;
  isReadOnly?: boolean;
}

export function FilterPanel({
  open,
  onOpenChange,
  selectedTab,
  filterConfigs,
  dimensionNames,
  activeFilterCount,
  availableDimensions = {},
  onToggleDimension,
  isReadOnly = false,
}: FilterPanelProps) {
  const CHANNELS: Channel[] = ['metasearch', 'sem', 'social'];

  const defaultChannel: Channel = useMemo(() => {
    if (selectedTab === 'metasearch' || selectedTab === 'sem' || selectedTab === 'social') {
      return selectedTab as Channel;
    }
    return 'metasearch';
  }, [selectedTab]);

  const [activeChannel, setActiveChannel] = useState<Channel>(defaultChannel);

  React.useEffect(() => {
    if (open) setActiveChannel(defaultChannel);
  }, [open, defaultChannel]);

  const availDims = (availableDimensions[activeChannel] ?? []).filter(
    (d) => d.type === 'text'
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[580px] w-full p-0 gap-0 flex flex-col overflow-hidden max-h-[70vh]">
        {/* Header */}
        <DialogHeader className="px-5 py-4 border-b shrink-0">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
            <DialogTitle className="text-sm font-semibold">
              Filter settings
            </DialogTitle>
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs font-medium">
                {activeFilterCount} active
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Check dimensions to add their filter dropdown to the top bar, next to the date range.
          </p>
        </DialogHeader>

        {/* Body: left channel tabs + right checkbox list */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: channel tabs */}
          <div className="w-[130px] shrink-0 border-r bg-muted/30 flex flex-col pt-2">
            {CHANNELS.map((ch) => {
              const enabled = filterConfigs[ch]?.filterDimensionIds?.length ?? 0;
              const isActive = activeChannel === ch;
              return (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setActiveChannel(ch)}
                  className={cn(
                    'w-full flex flex-col items-start px-3 py-3 text-left transition-colors border-r-2 -mr-px',
                    isActive
                      ? 'border-r-primary bg-background font-medium text-foreground'
                      : 'border-r-transparent hover:bg-accent text-muted-foreground'
                  )}
                >
                  <span className="text-sm truncate">{CHANNEL_LABELS[ch]}</span>
                  {enabled > 0 && (
                    <span className={cn(
                      'text-[10px] px-1 rounded-sm font-medium mt-0.5',
                      isActive ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                    )}>
                      {enabled} on
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Right: dimension checkbox list */}
          <ScrollArea className="flex-1">
            <div className="p-4">
              <ChannelPanel
                key={activeChannel}
                channel={activeChannel}
                availableDims={availDims}
                filterConfigs={filterConfigs}
                dimensionNames={dimensionNames}
                onToggleDimension={onToggleDimension ?? (() => {})}
                isReadOnly={isReadOnly}
              />
            </div>
          </ScrollArea>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t shrink-0 bg-background">
          <Button className="w-full" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
