/**
 * Extract unique dimension values directly from source data (transformedRows)
 * 
 * This replaces the database-based approach since we now always fetch from source.
 */


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

