/**
 * React Query key factory for data sources
 */

export const dataSourceKeys = {
  all: ["data-sources"] as const,
  lists: () => [...dataSourceKeys.all, "list"] as const,
  list: (filters: string) => [...dataSourceKeys.lists(), { filters }] as const,
  details: () => [...dataSourceKeys.all, "detail"] as const,
  detail: (id: string) => [...dataSourceKeys.details(), id] as const,
  sourceData: (dataSourceId: string, reportId: string, lastModified?: string) => 
    [...dataSourceKeys.all, "source-data", dataSourceId, reportId, lastModified || "default"] as const,
  headers: (dataSourceId: string) => 
    [...dataSourceKeys.all, "headers", dataSourceId] as const,
};
