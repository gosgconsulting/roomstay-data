import { useState, useEffect } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, ArrowUpDown, CheckCircle2 } from "lucide-react";
import { CombinedMetrics } from "@/lib/combined-analytics";
import { CombinedColumnsConfigModal } from "@/components/CombinedColumnsConfigModal";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";

interface CombinedPerformanceTableProps {
  data: Array<{
    date?: string;
    metrics: CombinedMetrics;
    reportSources: string[];
    dimensionValues?: Record<string, string>;
    groupKey?: string;
  }>;
  isLoading?: boolean;
  visibleColumns?: string[];
  onVisibleColumnsChange?: (columns: string[]) => void;
  groupByDimensions?: string[];
  breakdownDimensions?: string[];
  thenByDimensions?: string[];
  allDimensions?: Array<{ id: string; name: string }>;
  activeDateTab?: 'day' | 'week' | 'month' | 'year';
  onDateTabChange?: (tab: 'day' | 'week' | 'month' | 'year') => void;
  dateOrder?: 'asc' | 'desc';
  onDateOrderChange?: (order: 'asc' | 'desc') => void;
  accountId?: string;
  reportIds?: string[];
  onGroupingChange?: (groupBy: string[], breakdown: string[], thenBy: string[]) => void;
}

export const CombinedPerformanceTable = ({ 
  data, 
  isLoading = false,
  visibleColumns = ["date", "impressions", "clicks", "ctr", "conversions", "conversionRate", "cost", "revenue", "roas"],
  onVisibleColumnsChange,
  groupByDimensions = [],
  breakdownDimensions = [],
  thenByDimensions = [],
  allDimensions = [],
  activeDateTab = 'day',
  onDateTabChange,
  dateOrder = 'desc',
  onDateOrderChange,
  accountId,
  reportIds = [],
  onGroupingChange
}: CombinedPerformanceTableProps) => {
  const [showColumnsConfig, setShowColumnsConfig] = useState(false);
  const [availableDimensions, setAvailableDimensions] = useState<Array<{ id: string; name: string }>>([]);
  const [openPopover, setOpenPopover] = useState<'groupBy' | 'breakdown' | 'thenBy' | null>(null);
  
  // Load dimensions for grouping
  useEffect(() => {
    if (reportIds.length > 0) {
      loadDimensions();
    }
  }, [reportIds.length, accountId]);

  const loadDimensions = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let query = supabase
        .from('dimensions')
        .select('id, name, type, scope')
        .eq('type', 'text');

      if (accountId) {
        query = query.or(`account_id.eq.${accountId},scope.eq.global,report_id.in.(${reportIds.join(',')})`);
      } else if (reportIds.length > 0) {
        query = query.or(`scope.eq.global,report_id.in.(${reportIds.join(',')})`);
      }

      const { data, error } = await query.order('name');

      if (error) {
        console.error('Error loading dimensions:', error);
        return;
      }

      const dimensionMap = new Map<string, { id: string; name: string }>();
      (data || []).forEach(dim => {
        if (!dim || !dim.id || !dim.name) return;
        const existing = dimensionMap.get(dim.name);
        if (!existing || 
            (dim.scope === 'account' && existing.id !== dim.id)) {
          dimensionMap.set(dim.name, { id: dim.id, name: dim.name });
        }
      });

      const uniqueDimensions = Array.from(dimensionMap.values())
        .filter(d => !['Impressions', 'Clicks', 'Conversions', 'Cost', 'Revenue', 'CTR', 'Conversion rate', 'CPC', 'ROAS', 'Cost of sale'].includes(d.name))
        .sort((a, b) => a.name.localeCompare(b.name));

      // Add "Data Source" as a virtual dimension
      setAvailableDimensions([
        { id: '__data_source__', name: 'Data Source' },
        ...uniqueDimensions
      ]);
    } catch (error) {
      console.error('Error in loadDimensions:', error);
    }
  };

  const getDimensionName = (dimId: string) => {
    if (dimId === '__data_source__') return 'Data Source';
    return availableDimensions.find(d => d.id === dimId)?.name || allDimensions.find(d => d.id === dimId)?.name || dimId;
  };
  
  const allGroupingDims = [...groupByDimensions, ...breakdownDimensions, ...thenByDimensions];
  const hasGrouping = allGroupingDims.length > 0;
  
  const handleDimensionToggle = (type: 'groupBy' | 'breakdown' | 'thenBy', dimensionId: string) => {
    let newGroupBy = [...groupByDimensions];
    let newBreakdown = [...breakdownDimensions];
    let newThenBy = [...thenByDimensions];

    if (type === 'groupBy') {
      if (newGroupBy.includes(dimensionId)) {
        newGroupBy = newGroupBy.filter(id => id !== dimensionId);
      } else {
        newGroupBy.push(dimensionId);
      }
    } else if (type === 'breakdown') {
      if (newBreakdown.includes(dimensionId)) {
        newBreakdown = newBreakdown.filter(id => id !== dimensionId);
      } else {
        newBreakdown.push(dimensionId);
      }
    } else if (type === 'thenBy') {
      if (newThenBy.includes(dimensionId)) {
        newThenBy = newThenBy.filter(id => id !== dimensionId);
      } else {
        newThenBy.push(dimensionId);
      }
    }

    onGroupingChange?.(newGroupBy, newBreakdown, newThenBy);
    setOpenPopover(null);
  };
  const formatNumber = (num: number): string => {
    return num.toLocaleString('en-US', { maximumFractionDigits: 0 });
  };

  const formatCurrency = (num: number): string => {
    return `$${num.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  };

  const formatPercentage = (num: number): string => {
    return `${num.toFixed(2)}%`;
  };

  const formatDecimal = (num: number): string => {
    return num.toFixed(2);
  };

  const getTableTitle = () => {
    const tabLabel = activeDateTab.charAt(0).toUpperCase() + activeDateTab.slice(1);
    return `Combined Performance by ${tabLabel}`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{getTableTitle()}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse h-12 bg-muted rounded"></div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{getTableTitle()}</CardTitle>
      </CardHeader>
      <CardContent>
        {/* Date Tabs */}
        <div className="mb-4">
          <Tabs value={activeDateTab} onValueChange={(value) => onDateTabChange?.(value as 'day' | 'week' | 'month' | 'year')}>
            <TabsList>
              <TabsTrigger value="day">Day</TabsTrigger>
              <TabsTrigger value="week">Week</TabsTrigger>
              <TabsTrigger value="month">Month</TabsTrigger>
              <TabsTrigger value="year">Year</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Grouping Controls */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Group By */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Group by:</span>
              <Popover open={openPopover === 'groupBy'} onOpenChange={(open) => setOpenPopover(open ? 'groupBy' : null)}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 border-dashed">
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {groupByDimensions.length > 0 
                      ? groupByDimensions.map(id => getDimensionName(id)).join(', ')
                      : 'Select dimensions'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search dimensions..." />
                    <CommandEmpty>No dimensions found.</CommandEmpty>
                    <CommandGroup>
                      {availableDimensions.map((dim) => (
                        <CommandItem
                          key={dim.id}
                          onSelect={() => handleDimensionToggle('groupBy', dim.id)}
                        >
                          <div className="flex items-center gap-2 w-full">
                            <CheckCircle2 className={`h-4 w-4 ${groupByDimensions.includes(dim.id) ? 'opacity-100' : 'opacity-0'}`} />
                            {dim.name}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Breakdown By */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Breakdown by:</span>
              <Popover open={openPopover === 'breakdown'} onOpenChange={(open) => setOpenPopover(open ? 'breakdown' : null)}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 border-dashed">
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {breakdownDimensions.length > 0 
                      ? breakdownDimensions.map(id => getDimensionName(id)).join(', ')
                      : 'Select dimensions'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search dimensions..." />
                    <CommandEmpty>No dimensions found.</CommandEmpty>
                    <CommandGroup>
                      {availableDimensions.map((dim) => (
                        <CommandItem
                          key={dim.id}
                          onSelect={() => handleDimensionToggle('breakdown', dim.id)}
                        >
                          <div className="flex items-center gap-2 w-full">
                            <CheckCircle2 className={`h-4 w-4 ${breakdownDimensions.includes(dim.id) ? 'opacity-100' : 'opacity-0'}`} />
                            {dim.name}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Then By */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Then by:</span>
              <Popover open={openPopover === 'thenBy'} onOpenChange={(open) => setOpenPopover(open ? 'thenBy' : null)}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 border-dashed">
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                    {thenByDimensions.length > 0 
                      ? thenByDimensions.map(id => getDimensionName(id)).join(', ')
                      : 'Select dimensions'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Search dimensions..." />
                    <CommandEmpty>No dimensions found.</CommandEmpty>
                    <CommandGroup>
                      {availableDimensions.map((dim) => (
                        <CommandItem
                          key={dim.id}
                          onSelect={() => handleDimensionToggle('thenBy', dim.id)}
                        >
                          <div className="flex items-center gap-2 w-full">
                            <CheckCircle2 className={`h-4 w-4 ${thenByDimensions.includes(dim.id) ? 'opacity-100' : 'opacity-0'}`} />
                            {dim.name}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Right Side Controls */}
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDateOrderChange?.(dateOrder === 'asc' ? 'desc' : 'asc')}
              className="h-8 px-3 text-xs"
            >
              <ArrowUpDown className="h-4 w-4 mr-1" />
              {dateOrder === 'asc' ? 'Ascending' : 'Descending'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowColumnsConfig(true)}
              className="h-8 px-3 text-xs"
            >
              <Settings className="h-4 w-4 mr-1" />
              Edit Columns
            </Button>
          </div>
        </div>
        <div className="rounded-md border overflow-auto max-h-[600px]">
          <Table>
            <TableHeader className="sticky top-0 bg-background z-10">
              <TableRow>
                {/* Show grouping dimension columns */}
                {hasGrouping && allGroupingDims.map(dimId => (
                  <TableHead key={dimId} className="font-semibold">{getDimensionName(dimId)}</TableHead>
                ))}
                {/* Show date if no grouping or if visible */}
                {(!hasGrouping || visibleColumns.includes("date")) && <TableHead className="font-semibold">Date</TableHead>}
                {visibleColumns.includes("impressions") && <TableHead className="font-semibold text-right">Impressions</TableHead>}
                {visibleColumns.includes("clicks") && <TableHead className="font-semibold text-right">Clicks</TableHead>}
                {visibleColumns.includes("ctr") && <TableHead className="font-semibold text-right">CTR</TableHead>}
                {visibleColumns.includes("conversions") && <TableHead className="font-semibold text-right">Conversions</TableHead>}
                {visibleColumns.includes("conversionRate") && <TableHead className="font-semibold text-right">Conv. Rate</TableHead>}
                {visibleColumns.includes("cpc") && <TableHead className="font-semibold text-right">CPC</TableHead>}
                {visibleColumns.includes("cost") && <TableHead className="font-semibold text-right">Cost</TableHead>}
                {visibleColumns.includes("revenue") && <TableHead className="font-semibold text-right">Revenue</TableHead>}
                {visibleColumns.includes("roas") && <TableHead className="font-semibold text-right">ROAS</TableHead>}
                {visibleColumns.includes("costOfSale") && <TableHead className="font-semibold text-right">Cost of Sale</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleColumns.length + allGroupingDims.length - (visibleColumns.includes("sources") ? 1 : 0)} className="text-center text-muted-foreground py-8">
                  No data available for the selected filters
                </TableCell>
              </TableRow>
              ) : (
                data.map((row, index) => (
                  <TableRow key={index} className="hover:bg-muted/50">
                    {/* Show grouping dimension values */}
                    {hasGrouping && allGroupingDims.map(dimId => (
                      <TableCell key={dimId} className="font-medium">
                        {row.dimensionValues?.[dimId] || 'Unknown'}
                      </TableCell>
                    ))}
                    {/* Show date */}
                    {(!hasGrouping || visibleColumns.includes("date")) && <TableCell className="font-medium">{row.date || 'N/A'}</TableCell>}
                    {visibleColumns.includes("impressions") && <TableCell className="text-right">{formatNumber(row.metrics.impressions)}</TableCell>}
                    {visibleColumns.includes("clicks") && <TableCell className="text-right">{formatNumber(row.metrics.clicks)}</TableCell>}
                    {visibleColumns.includes("ctr") && <TableCell className="text-right">{formatPercentage(row.metrics.ctr)}</TableCell>}
                    {visibleColumns.includes("conversions") && <TableCell className="text-right">{formatNumber(row.metrics.conversions)}</TableCell>}
                    {visibleColumns.includes("conversionRate") && <TableCell className="text-right">{formatPercentage(row.metrics.conversionRate)}</TableCell>}
                    {visibleColumns.includes("cpc") && <TableCell className="text-right">{formatCurrency(row.metrics.cpc)}</TableCell>}
                    {visibleColumns.includes("cost") && <TableCell className="text-right">{formatCurrency(row.metrics.cost)}</TableCell>}
                    {visibleColumns.includes("revenue") && <TableCell className="text-right">{formatCurrency(row.metrics.revenue)}</TableCell>}
                    {visibleColumns.includes("roas") && <TableCell className="text-right">{formatDecimal(row.metrics.roas)}</TableCell>}
                    {visibleColumns.includes("costOfSale") && <TableCell className="text-right">{formatPercentage(row.metrics.costOfSale)}</TableCell>}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
      
      <CombinedColumnsConfigModal
        open={showColumnsConfig}
        onOpenChange={setShowColumnsConfig}
        visibleColumns={visibleColumns}
        onSave={(columns) => onVisibleColumnsChange?.(columns)}
      />
    </Card>
  );
};
