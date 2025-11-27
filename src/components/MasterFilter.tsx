import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronDown, Settings, X, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useUser } from "@/lib/auth";

interface Dimension {
  id: string;
  name: string;
  type: string;
  scope: string;
}

interface MasterFilterProps {
  accountId?: string;
  onFilterChange: (dimension: string | null, values: string[]) => void;
  selectedDimension: string | null;
  selectedValues: string[];
}

export const MasterFilter = ({ 
  accountId, 
  onFilterChange, 
  selectedDimension, 
  selectedValues 
}: MasterFilterProps) => {
  const { data: userData } = useUser();
  const user = userData?.user || null;
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [dimensionValues, setDimensionValues] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [showDimensionSelector, setShowDimensionSelector] = useState(false);
  const [showValueSelector, setShowValueSelector] = useState(false);
  const [isConfiguring, setIsConfiguring] = useState(false);

  useEffect(() => {
    loadDimensions();
  }, [accountId]);

  useEffect(() => {
    if (selectedDimension) {
      loadDimensionValues(selectedDimension);
    }
  }, [selectedDimension]);

  const loadDimensions = async () => {
    try {
      setIsLoading(true);
      console.log('[MASTER-FILTER] Loading dimensions for account:', accountId);

      if (!user) return;

      // Load dimensions that can be used as master filters (text type only)
      let query = supabase
        .from('dimensions')
        .select('id, name, type, scope')
        .eq('type', 'text') // Only text dimensions can be used as master filters
        .in('scope', ['global', 'account']);

      if (accountId) {
        query = query.or(`account_id.eq.${accountId},scope.eq.global`);
      } else {
        query = query.eq('scope', 'global');
      }

      const { data, error } = await query.order('name');

      if (error) {
        console.error('[MASTER-FILTER] Error loading dimensions:', error);
        return;
      }

      console.log('[MASTER-FILTER] Loaded dimensions:', data?.length || 0);
      setDimensions(data || []);
    } catch (error) {
      console.error('[MASTER-FILTER] Error in loadDimensions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDimensionValues = async (dimensionId: string) => {
    try {
      console.log('[MASTER-FILTER] Loading values for dimension:', dimensionId);

      if (!user) return;

      // Get unique values for this dimension across all reports
      let query = supabase
        .from('dimension_data')
        .select('dimension_values')
        .not('dimension_values', 'is', null);

      if (accountId) {
        // Filter by account if specified
        const { data: reports } = await supabase
          .from('reports')
          .select('id')
          .eq('account_id', accountId);
        
        if (reports && reports.length > 0) {
          const reportIds = reports.map(r => r.id);
          query = query.in('report_id', reportIds);
        }
      }

      const { data, error } = await query.limit(10000);

      if (error) {
        console.error('[MASTER-FILTER] Error loading dimension values:', error);
        return;
      }

      // Extract unique values for the selected dimension
      const uniqueValues = new Set<string>();
      data?.forEach(row => {
        const value = row.dimension_values[dimensionId];
        if (value && typeof value === 'string') {
          uniqueValues.add(value);
        }
      });

      const sortedValues = Array.from(uniqueValues).sort();
      console.log('[MASTER-FILTER] Loaded values:', sortedValues.length);
      
      setDimensionValues(prev => ({
        ...prev,
        [dimensionId]: sortedValues
      }));
    } catch (error) {
      console.error('[MASTER-FILTER] Error in loadDimensionValues:', error);
    }
  };

  const handleDimensionSelect = (dimensionId: string) => {
    console.log('[MASTER-FILTER] Selected dimension:', dimensionId);
    onFilterChange(dimensionId, []);
    setShowDimensionSelector(false);
    setIsConfiguring(false);
  };

  const handleValueToggle = (value: string) => {
    const newValues = selectedValues.includes(value)
      ? selectedValues.filter(v => v !== value)
      : [...selectedValues, value];
    
    console.log('[MASTER-FILTER] Updated values:', newValues);
    onFilterChange(selectedDimension, newValues);
  };

  const handleClearFilter = () => {
    onFilterChange(null, []);
    setIsConfiguring(false);
  };

  const selectedDimensionObj = dimensions.find(d => d.id === selectedDimension);
  const availableValues = selectedDimension ? dimensionValues[selectedDimension] || [] : [];

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Master Filter
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <div className="animate-pulse h-4 bg-muted rounded w-32"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Master Filter
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsConfiguring(!isConfiguring)}
            className="h-8 w-8 p-0"
          >
            <Settings className="h-4 w-4" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!selectedDimension || isConfiguring ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Select a dimension to filter all reports by:
            </p>
            <Popover open={showDimensionSelector} onOpenChange={setShowDimensionSelector}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={showDimensionSelector}
                  className="w-full justify-between"
                >
                  {selectedDimensionObj ? selectedDimensionObj.name : "Select dimension..."}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput placeholder="Search dimensions..." />
                  <CommandList>
                    <CommandEmpty>No dimensions found.</CommandEmpty>
                    <CommandGroup>
                      {dimensions.map((dimension) => (
                        <CommandItem
                          key={dimension.id}
                          value={dimension.name}
                          onSelect={() => handleDimensionSelect(dimension.id)}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedDimension === dimension.id ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {dimension.name}
                          <Badge variant="secondary" className="ml-auto">
                            {dimension.scope}
                          </Badge>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {selectedDimension && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsConfiguring(false)}
                >
                  Done
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearFilter}
                >
                  Clear Filter
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                Filtering by: {selectedDimensionObj?.name}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearFilter}
                className="h-6 w-6 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <Popover open={showValueSelector} onOpenChange={setShowValueSelector}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full justify-between"
                >
                  {selectedValues.length > 0 
                    ? `${selectedValues.length} selected`
                    : "Select values..."}
                  <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-full p-0">
                <Command>
                  <CommandInput placeholder="Search values..." />
                  <CommandList>
                    <CommandEmpty>No values found.</CommandEmpty>
                    <CommandGroup>
                      {availableValues.map((value) => (
                        <CommandItem
                          key={value}
                          value={value}
                          onSelect={() => handleValueToggle(value)}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              selectedValues.includes(value) ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {value}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {selectedValues.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {selectedValues.map((value) => (
                  <Badge key={value} variant="secondary" className="text-xs">
                    {value}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleValueToggle(value)}
                      className="h-4 w-4 p-0 ml-1 hover:bg-transparent"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
