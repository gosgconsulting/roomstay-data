import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronDown, X, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Dimension {
  id: string;
  name: string;
  type: string;
  scope: string;
}

interface CombinedGroupingControlsProps {
  accountId?: string;
  reportIds: string[];
  onGroupingChange: (
    groupBy: string[],
    breakdown: string[],
    thenBy: string[]
  ) => void;
  groupByDimensions?: string[];
  breakdownDimensions?: string[];
  thenByDimensions?: string[];
}

export const CombinedGroupingControls = ({
  accountId,
  reportIds,
  onGroupingChange,
  groupByDimensions = [],
  breakdownDimensions = [],
  thenByDimensions = []
}: CombinedGroupingControlsProps) => {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showGroupBySelector, setShowGroupBySelector] = useState(false);
  const [showBreakdownSelector, setShowBreakdownSelector] = useState(false);
  const [showThenBySelector, setShowThenBySelector] = useState(false);

  useEffect(() => {
    loadDimensions();
  }, [accountId, reportIds]);

  const loadDimensions = async () => {
    try {
      setIsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from('dimensions')
        .select('id, name, type, scope')
        .eq('type', 'text');

      // Load dimensions for the account or reports
      if (accountId) {
        query = query.or(`account_id.eq.${accountId},scope.eq.global,report_id.in.(${reportIds.join(',')})`);
      } else if (reportIds.length > 0) {
        query = query.or(`scope.eq.global,report_id.in.(${reportIds.join(',')})`);
      } else {
        query = query.eq('scope', 'global');
      }

      const { data, error } = await query.order('name');

      if (error) {
        console.error('[COMBINED-GROUPING] Error loading dimensions:', error);
        return;
      }

      // Deduplicate dimensions by name, prioritizing account > report > global
      const dimensionMap = new Map<string, Dimension>();
      (data || []).forEach(dim => {
        if (!dim || !dim.id || !dim.name || !dim.type || !dim.scope) return;
        const existing = dimensionMap.get(dim.name);
        if (!existing || 
            (dim.scope === 'account' && existing.scope === 'global') ||
            (dim.scope === 'custom' && (existing.scope === 'global' || existing.scope === 'account'))) {
          dimensionMap.set(dim.name, dim);
        }
      });

      const uniqueDimensions = Array.from(dimensionMap.values())
        .filter(d => !['Impressions', 'Clicks', 'Conversions', 'Cost', 'Revenue', 'CTR', 'Conversion rate', 'CPC', 'ROAS', 'Cost of sale'].includes(d.name))
        .sort((a, b) => a.name.localeCompare(b.name));
      
      console.log('[COMBINED-GROUPING] Loaded dimensions:', uniqueDimensions.length);
      setDimensions(uniqueDimensions);
    } catch (error) {
      console.error('[COMBINED-GROUPING] Error in loadDimensions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGroupByToggle = (dimensionId: string) => {
    const newGroupBy = groupByDimensions.includes(dimensionId)
      ? groupByDimensions.filter(id => id !== dimensionId)
      : [...groupByDimensions, dimensionId];
    
    onGroupingChange(newGroupBy, breakdownDimensions, thenByDimensions);
  };

  const handleBreakdownToggle = (dimensionId: string) => {
    const newBreakdown = breakdownDimensions.includes(dimensionId)
      ? breakdownDimensions.filter(id => id !== dimensionId)
      : [...breakdownDimensions, dimensionId];
    
    onGroupingChange(groupByDimensions, newBreakdown, thenByDimensions);
  };

  const handleThenByToggle = (dimensionId: string) => {
    const newThenBy = thenByDimensions.includes(dimensionId)
      ? thenByDimensions.filter(id => id !== dimensionId)
      : [...thenByDimensions, dimensionId];
    
    onGroupingChange(groupByDimensions, breakdownDimensions, newThenBy);
  };

  const handleClearAll = () => {
    onGroupingChange([], [], []);
  };

  const getDimensionName = (id: string) => {
    return dimensions.find(d => d.id === id)?.name || id;
  };

  const hasAnyGrouping = groupByDimensions.length > 0 || breakdownDimensions.length > 0 || thenByDimensions.length > 0;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="animate-pulse h-10 bg-muted rounded"></div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Layers className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Group & Breakdown</span>
          </div>
          {hasAnyGrouping && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              className="h-7 px-2 text-xs"
            >
              Clear All
            </Button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Group By */}
          <Popover open={showGroupBySelector} onOpenChange={setShowGroupBySelector}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 bg-background"
              >
                <span className="text-xs font-medium mr-2">Group By</span>
                {groupByDimensions.length > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-xs mr-1">
                    {groupByDimensions.length}
                  </Badge>
                )}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0 bg-background z-50" align="start">
              <Command>
                <CommandInput placeholder="Search dimensions..." className="h-9" />
                <CommandEmpty>No dimensions found.</CommandEmpty>
                <CommandList>
                  <CommandGroup>
                    <ScrollArea className="h-[200px]">
                      {dimensions.map((dimension) => (
                        <CommandItem
                          key={dimension.id}
                          onSelect={() => handleGroupByToggle(dimension.id)}
                          className="cursor-pointer"
                        >
                          <div className={cn(
                            "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                            groupByDimensions.includes(dimension.id)
                              ? "bg-primary text-primary-foreground"
                              : "opacity-50"
                          )}>
                            {groupByDimensions.includes(dimension.id) && <Check className="h-3 w-3" />}
                          </div>
                          <span className="text-sm">{dimension.name}</span>
                        </CommandItem>
                      ))}
                    </ScrollArea>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Breakdown By */}
          <Popover open={showBreakdownSelector} onOpenChange={setShowBreakdownSelector}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 bg-background"
              >
                <span className="text-xs font-medium mr-2">Breakdown</span>
                {breakdownDimensions.length > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-xs mr-1">
                    {breakdownDimensions.length}
                  </Badge>
                )}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0 bg-background z-50" align="start">
              <Command>
                <CommandInput placeholder="Search dimensions..." className="h-9" />
                <CommandEmpty>No dimensions found.</CommandEmpty>
                <CommandList>
                  <CommandGroup>
                    <ScrollArea className="h-[200px]">
                      {dimensions.map((dimension) => (
                        <CommandItem
                          key={dimension.id}
                          onSelect={() => handleBreakdownToggle(dimension.id)}
                          className="cursor-pointer"
                        >
                          <div className={cn(
                            "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                            breakdownDimensions.includes(dimension.id)
                              ? "bg-primary text-primary-foreground"
                              : "opacity-50"
                          )}>
                            {breakdownDimensions.includes(dimension.id) && <Check className="h-3 w-3" />}
                          </div>
                          <span className="text-sm">{dimension.name}</span>
                        </CommandItem>
                      ))}
                    </ScrollArea>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Then By */}
          <Popover open={showThenBySelector} onOpenChange={setShowThenBySelector}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 bg-background"
              >
                <span className="text-xs font-medium mr-2">Then By</span>
                {thenByDimensions.length > 0 && (
                  <Badge variant="secondary" className="h-5 px-1.5 text-xs mr-1">
                    {thenByDimensions.length}
                  </Badge>
                )}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0 bg-background z-50" align="start">
              <Command>
                <CommandInput placeholder="Search dimensions..." className="h-9" />
                <CommandEmpty>No dimensions found.</CommandEmpty>
                <CommandList>
                  <CommandGroup>
                    <ScrollArea className="h-[200px]">
                      {dimensions.map((dimension) => (
                        <CommandItem
                          key={dimension.id}
                          onSelect={() => handleThenByToggle(dimension.id)}
                          className="cursor-pointer"
                        >
                          <div className={cn(
                            "mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary",
                            thenByDimensions.includes(dimension.id)
                              ? "bg-primary text-primary-foreground"
                              : "opacity-50"
                          )}>
                            {thenByDimensions.includes(dimension.id) && <Check className="h-3 w-3" />}
                          </div>
                          <span className="text-sm">{dimension.name}</span>
                        </CommandItem>
                      ))}
                    </ScrollArea>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Selected dimension badges */}
          <div className="flex flex-wrap items-center gap-1">
            {groupByDimensions.map((id) => (
              <Badge key={id} variant="default" className="h-6 px-2 text-xs">
                Group: {getDimensionName(id)}
                <button
                  onClick={() => handleGroupByToggle(id)}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {breakdownDimensions.map((id) => (
              <Badge key={id} variant="secondary" className="h-6 px-2 text-xs">
                Breakdown: {getDimensionName(id)}
                <button
                  onClick={() => handleBreakdownToggle(id)}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {thenByDimensions.map((id) => (
              <Badge key={id} variant="outline" className="h-6 px-2 text-xs">
                Then: {getDimensionName(id)}
                <button
                  onClick={() => handleThenByToggle(id)}
                  className="ml-1 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
