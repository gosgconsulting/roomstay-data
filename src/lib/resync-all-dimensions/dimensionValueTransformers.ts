/**
 * Transforms dimension values from old IDs to new IDs based on dimension name mapping
 */
export function transformDimensionValues(
  oldDimensionValues: Record<string, any>,
  oldIdToNameMap: Map<string, string>,
  dimensionNameToIdMap: Map<string, string>
): { newValues: Record<string, any>; hasChanges: boolean } {
  const newDimensionValues: Record<string, any> = {};
  let hasChanges = false;

  for (const [oldId, value] of Object.entries(oldDimensionValues)) {
    const dimensionName = oldIdToNameMap.get(oldId);

    if (dimensionName) {
      const lower = (dimensionName || "").trim().toLowerCase();
      const compact = lower.replace(/\s+/g, "");

      const newDimensionId =
        dimensionNameToIdMap.get(lower) ||
        dimensionNameToIdMap.get(compact);

      if (newDimensionId && newDimensionId !== oldId) {
        // Remapped to new ID
        newDimensionValues[newDimensionId] = value;
        hasChanges = true;
      } else if (dimensionNameToIdMap.has(lower) || dimensionNameToIdMap.has(compact)) {
        // ID already correct
        newDimensionValues[oldId] = value;
      } else {
        // No match found in target maps, keep old ID
        console.warn(
          `[RESYNC-DATA] Dimension "${dimensionName}" not found in target maps, keeping old ID: ${oldId}`
        );
        newDimensionValues[oldId] = value;
      }
    } else {
      // Old ID not found in name map, keep as-is
      newDimensionValues[oldId] = value;
    }
  }

  return { newValues: newDimensionValues, hasChanges };
}

/**
 * Collects all unique dimension IDs from dimension_data rows
 */
export function collectAllDimensionIds(
  dimensionDataRows: Array<{ dimension_values: Record<string, any> }>
): string[] {
  const allDimensionIds = new Set<string>();

  for (const row of dimensionDataRows) {
    const dimensionValues = row.dimension_values as Record<string, any>;
    if (dimensionValues) {
      Object.keys(dimensionValues).forEach(id => allDimensionIds.add(id));
    }
  }

  return Array.from(allDimensionIds);
}