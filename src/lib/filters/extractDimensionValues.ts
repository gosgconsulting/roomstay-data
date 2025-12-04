/**
 * Extract unique dimension values directly from source data (transformedRows)
 * 
 * This replaces the database-based approach since we now always fetch from source.
 */

export interface ExtractOptions {
  dimensionId: string;
  limit?: number;
}

/**
 * Extract unique values for a specific dimension from transformed rows
 */
export function extractUniqueDimensionValues(
  transformedRows: any[],
  options: ExtractOptions
): string[] {
  const { dimensionId, limit = 10000 } = options;
  
  if (!transformedRows || transformedRows.length === 0) {
    return [];
  }

  const uniqueValues = new Set<string>();

  for (const row of transformedRows) {
    const dimensionValues = row.dimension_values;
    if (!dimensionValues) continue;

    const value = dimensionValues[dimensionId];
    if (value !== null && value !== undefined && value !== '') {
      uniqueValues.add(String(value).trim());
    }

    // Early exit if we've reached the limit
    if (uniqueValues.size >= limit) break;
  }

  return Array.from(uniqueValues).sort();
}

/**
 * Extract unique values for multiple dimensions at once (more efficient)
 */
export function extractMultipleDimensionValues(
  transformedRows: any[],
  dimensionIds: string[],
  limit: number = 10000
): Record<string, string[]> {
  const result: Record<string, Set<string>> = {};
  
  // Initialize sets for each dimension
  dimensionIds.forEach(id => {
    result[id] = new Set<string>();
  });

  if (!transformedRows || transformedRows.length === 0) {
    return Object.fromEntries(
      Object.entries(result).map(([id, set]) => [id, Array.from(set)])
    );
  }

  for (const row of transformedRows) {
    const dimensionValues = row.dimension_values;
    if (!dimensionValues) continue;

    for (const dimId of dimensionIds) {
      const value = dimensionValues[dimId];
      if (value !== null && value !== undefined && value !== '') {
        const set = result[dimId];
        if (set.size < limit) {
          set.add(String(value).trim());
        }
      }
    }
  }

  // Convert sets to sorted arrays
  return Object.fromEntries(
    Object.entries(result).map(([id, set]) => [id, Array.from(set).sort()])
  );
}

/**
 * Get dimension IDs that actually have data in the transformed rows
 */
export function getDimensionsWithDataFromSource(
  transformedRows: any[],
  dimensionIdsToCheck?: string[]
): Set<string> {
  const dimensionsWithData = new Set<string>();

  if (!transformedRows || transformedRows.length === 0) {
    return dimensionsWithData;
  }

  // Sample first 100 rows for efficiency
  const sampleRows = transformedRows.slice(0, 100);

  for (const row of sampleRows) {
    const dimensionValues = row.dimension_values;
    if (!dimensionValues) continue;

    Object.entries(dimensionValues).forEach(([dimId, value]) => {
      // Only check specified dimensions, or all if not specified
      if (dimensionIdsToCheck && !dimensionIdsToCheck.includes(dimId)) {
        return;
      }

      if (value !== null && value !== undefined && value !== '') {
        dimensionsWithData.add(dimId);
      }
    });
  }

  return dimensionsWithData;
}
