/**
 * Query keys for react-query cache management
 */

export const resyncQueryKeys = {
  all: ['resync'] as const,
  
  dimensions: {
    all: ['resync', 'dimensions'] as const,
    account: (accountId: string) => ['resync', 'dimensions', 'account', accountId] as const,
    report: (reportId: string) => ['resync', 'dimensions', 'report', reportId] as const,
    oldDimensions: (dimensionIds: string[]) => ['resync', 'dimensions', 'old', dimensionIds.sort().join(',')] as const,
  },
  
  dimensionData: {
    all: ['resync', 'dimension-data'] as const,
    report: (reportId: string) => ['resync', 'dimension-data', 'report', reportId] as const,
    batch: (reportId: string, offset: number) => ['resync', 'dimension-data', 'report', reportId, 'batch', offset] as const,
  },
} as const;

