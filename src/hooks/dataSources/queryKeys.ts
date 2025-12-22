// Stable query key factory for data sources
export const dataSourceQueryKeys = {
  all: ['data-sources'] as const,
  lists: () => [...dataSourceQueryKeys.all, 'list'] as const,
  list: (reportId: string) => [...dataSourceQueryKeys.lists(), reportId] as const,
  details: () => [...dataSourceQueryKeys.all, 'detail'] as const,
  detail: (id: string) => [...dataSourceQueryKeys.details(), id] as const,
  headers: (id: string) => [...dataSourceQueryKeys.detail(id), 'headers'] as const,
  sourceData: (id: string, filters?: Record<string, any>) => [
    ...dataSourceQueryKeys.detail(id), 
    'source-data', 
    filters ? JSON.stringify(filters) : null
  ] as const,
} as const;

// Backward compatibility alias
export const dataSourceKeys = {
  all: ['data-sources'] as const,
  sourceData: (dataSourceId: string, reportId: string, updatedAt?: string) => [
    'data-sources',
    'source-data',
    dataSourceId,
    reportId,
    updatedAt || 'latest'
  ] as const,
} as const;

// Performance table query keys
export const performanceTableQueryKeys = {
  all: ['performance-table'] as const,
  data: (params: {
    reportId: string;
    groupBy?: string[];
    breakdownBy?: string[];
    thenBy?: string[];
    filters?: Record<string, any>;
    dateRange?: { from?: string; to?: string };
    visibleDimensions?: string[];
    limit?: number;
    offset?: number;
  }) => [
    ...performanceTableQueryKeys.all,
    'data',
    params.reportId,
    JSON.stringify({
      groupBy: params.groupBy?.sort(),
      breakdownBy: params.breakdownBy?.sort(),
      thenBy: params.thenBy?.sort(),
      filters: params.filters,
      dateRange: params.dateRange,
      visibleDimensions: params.visibleDimensions?.sort(),
      limit: params.limit,
      offset: params.offset,
    })
  ] as const,
} as const;

// Dimension query keys
export const dimensionQueryKeys = {
  all: ['dimensions'] as const,
  lists: () => [...dimensionQueryKeys.all, 'list'] as const,
  list: (reportId?: string, scope?: string) => [
    ...dimensionQueryKeys.lists(), 
    reportId || 'all',
    scope || 'all'
  ] as const,
  values: (dimensionId: string, reportId?: string) => [
    ...dimensionQueryKeys.all,
    'values',
    dimensionId,
    reportId || 'all'
  ] as const,
} as const;