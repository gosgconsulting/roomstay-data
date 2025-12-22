import React, { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Settings, Download, Eye, EyeOff, RotateCcw } from 'lucide-react';
import { usePerformanceTableData } from '@/hooks/performanceTable/usePerformanceTableData';
import { usePerformanceTableDimensions } from '@/hooks/performanceTable/usePerformanceTableDimensions';
import { usePerformanceTableViews } from '@/hooks/performanceTable/usePerformanceTableViews';
import { usePerformanceTableFilters } from '@/hooks/performanceTable/usePerformanceTableFilters';
import { TableHeader } from './PerformanceTable/TableHeader';
import { TableBody } from './PerformanceTable/TableBody';
import { TableSkeleton } from './PerformanceTable/TableSkeleton';
import { ColumnVisibilitySheet } from './PerformanceTable/ColumnVisibilitySheet';
import { PerformanceSettingsModal } from './PerformanceSettingsModal';
import { toast } from 'sonner';
import type { FilterState } from './FiltersBar';

interface PerformanceTableProps {
  reportId: string;
  className?: string;
  // Optional props that may be passed but aren't used in this simplified version
  filters?: FilterState;
  isSharedView?: boolean;
  accountId?: string;
  visibilityRefreshTrigger?: number;
  isEditMode?: boolean;
  onLoadingComplete?: () => void;
  // For consolidated views
  reportIds?: string[];
  onFiltersChange?: (filters: any) => void;
}

export const PerformanceTable: React.FC<PerformanceTableProps> = ({ 
  reportId, 
  className = '',
  // Accept but ignore these props for now to maintain compatibility
  filters,
  isSharedView = false,
  accountId,
  visibilityRefreshTrigger,
  isEditMode = false,
  onLoadingComplete,
  reportIds,
  onFiltersChange,
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [showColumnVisibility, setShowColumnVisibility] = useState(false);

  // Use stable filters to prevent unnecessary refetches
  const filtersData = usePerformanceTableFilters(reportId);
  
  // Create mock view data for now
  const mockCurrentView = {
    group_by_dimensions: [],
    breakdown_by_dimensions: [],
    then_by_dimensions: [],
    visible_dimensions: [],
  };

  // Create mock dimensions data
  const mockDimensions: any[] = [];

  // Memoize query parameters to prevent unnecessary refetches
  const queryParams = useMemo(() => ({
    reportId,
    groupByDimensions: mockCurrentView?.group_by_dimensions || [],
    breakdownByDimensions: mockCurrentView?.breakdown_by_dimensions || [],
    thenByDimensions: mockCurrentView?.then_by_dimensions || [],
    dimensionFilters: filtersData.filters,
    dateFrom: filtersData.dateRange?.from,
    dateTo: filtersData.dateRange?.to,
    visibleDimensionIds: mockCurrentView?.visible_dimensions || [],
    limit: 1000,
    offset: 0,
  }), [
    reportId,
    mockCurrentView?.group_by_dimensions,
    mockCurrentView?.breakdown_by_dimensions,
    mockCurrentView?.then_by_dimensions,
    filtersData.filters,
    filtersData.dateRange?.from,
    filtersData.dateRange?.to,
    mockCurrentView?.visible_dimensions,
  ]);

  const { 
    data: performanceData, 
    isLoading, 
    error,
    refetch,
    isFetching
  } = usePerformanceTableData(queryParams);

  // Call onLoadingComplete when loading finishes
  React.useEffect(() => {
    if (!isLoading && onLoadingComplete) {
      onLoadingComplete();
    }
  }, [isLoading, onLoadingComplete]);

  // Memoize handlers to prevent unnecessary re-renders
  const handleRefresh = useCallback(async () => {
    try {
      await refetch();
      toast.success('Data refreshed successfully');
    } catch (error) {
      console.error('Error refreshing data:', error);
      toast.error('Failed to refresh data');
    }
  }, [refetch]);

  const handleExport = useCallback(() => {
    if (!performanceData || performanceData.length === 0) {
      toast.error('No data to export');
      return;
    }

    try {
      const csvContent = [
        // Headers
        ['Group Key', 'Dimension Values', 'Row Count'].join(','),
        // Data rows
        ...performanceData.map(row => [
          `"${row.group_key || ''}"`,
          `"${JSON.stringify(row.dimension_values || {})}"`,
          row.row_count || 0
        ].join(','))
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `performance-data-${reportId}-${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('Data exported successfully');
    } catch (error) {
      console.error('Error exporting data:', error);
      toast.error('Failed to export data');
    }
  }, [performanceData, reportId]);

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="text-center text-red-600">
            <p>Error loading performance data: {error.message}</p>
            <Button onClick={handleRefresh} className="mt-4">
              <RotateCcw className="w-4 h-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={className}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="text-lg font-semibold">Performance Data</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isFetching}
            >
              <RotateCcw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowColumnVisibility(true)}
            >
              <Eye className="w-4 h-4 mr-2" />
              Columns
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleExport}
              disabled={!performanceData || performanceData.length === 0}
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowSettings(true)}
            >
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <TableSkeleton />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <TableHeader 
                  dimensions={mockDimensions}
                />
                <TableBody 
                  rows={performanceData || []}
                  dimensions={mockDimensions}
                />
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <PerformanceSettingsModal
        open={showSettings}
        onOpenChange={setShowSettings}
        dimensions={mockDimensions}
        groupBy={[]}
        breakdownBy={[]}
        thenBy={[]}
        selectedDimensionIds={[]}
        isEditMode={isEditMode}
        onSave={() => {}}
      />

      <ColumnVisibilitySheet
        open={showColumnVisibility}
        onOpenChange={setShowColumnVisibility}
        dimensions={mockDimensions}
        visibleColumns={new Set()}
        onVisibilityChange={() => {}}
      />
    </>
  );
};