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
      const normalizedName = dimensionName.toLowerCase();
      const newDimensionId = dimensionNameToIdMap.get(normalizedName);

      if (newDimensionId && newDimensionId !== oldId) {
        // Use new dimension ID
        newDimensionValues[newDimensionId] = value;
        hasChanges = true;
      } else if (dimensionNameToIdMap.has(normalizedName)) {
        // ID is already correct
        newDimensionValues[oldId] = value;
      } else {
        // Dimension not found in account-scoped dimensions, keep old ID
        console.warn(
          `[RESYNC-DATA] Dimension "${dimensionName}" not found in account-scoped dimensions, keeping old ID: ${oldId}`
        );
        newDimensionValues[oldId] = value;
      }
    } else {
      // Old dimension ID not found, keep as is
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

