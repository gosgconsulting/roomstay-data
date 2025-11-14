export interface Dimension {
  id: string;
  name: string;
  type: string;
  formula: string | null;
}

export interface TableRow {
  id: string;
  name: string;
  level: number;
  parentId?: string;
  data: Record<string, any>;
  children?: TableRow[];
  compareData?: Record<string, any>;
  changeData?: Record<string, number>;
}

/**
 * Calculate totals from filtered table data
 */
export function calculateTotals(
  filteredTableData: TableRow[],
  dimensions: Dimension[],
  totalData: Record<string, any>
): Record<string, any> {
  if (filteredTableData.length === 0) return totalData;
  
  // Recalculate totals from filtered data
  // Only sum leaf nodes (rows without children) to avoid double-counting
  const filteredTotals: Record<string, any> = {};
  for (const dim of dimensions) {
    if (dim.formula) continue;
    if (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage') {
      let sum = 0;
      const calculateRowTotal = (rows: TableRow[]) => {
        rows.forEach(row => {
          // Skip if row or row.data is undefined/null
          if (!row || !row.data) return;
          
          // Only sum values from leaf nodes (rows without children)
          const hasChildren = row.children && row.children.length > 0;
          if (!hasChildren) {
            const value = row.data[dim.name];
            if (value !== undefined && value !== null) {
              sum += parseFloat(value) || 0;
            }
          }
          // Recursively process children
          if (row.children) {
            calculateRowTotal(row.children);
          }
        });
      };
      calculateRowTotal(filteredTableData);
      filteredTotals[dim.name] = sum;
    }
  }
  
  // Calculate formula totals
  for (const dim of dimensions) {
    if (dim.formula) {
      try {
        let expression = dim.formula;
        
        // Convert percentage notation (e.g., "15%" to "0.15")
        expression = expression.replace(/(\d+(?:\.\d+)?)%/g, (match, num) => {
          return String(parseFloat(num) / 100);
        });
        
        const dimensionNames = dimensions.map(d => d.name).sort((a, b) => b.length - a.length);
        for (const dimName of dimensionNames) {
          const value = filteredTotals[dimName];
          // Only proceed if value exists and is not undefined/null
          if (value === undefined || value === null) {
            console.warn(`[CALC] Missing value for dimension ${dimName} in formula ${dim.formula}`);
            continue;
          }
          const escapedName = dimName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`\\b${escapedName}\\b`, 'g');
          expression = expression.replace(regex, `(${value})`);
        }
        const result = eval(expression);
        filteredTotals[dim.name] = typeof result === 'number' && !isNaN(result) && isFinite(result) ? result : 0;
      } catch (error) {
        console.error('Formula evaluation error:', error, 'for dimension:', dim.name, 'formula:', dim.formula);
        filteredTotals[dim.name] = 0;
      }
    }
  }
  
  return filteredTotals;
}

/**
 * Calculate comparison totals and change percentages from filtered data
 */
export function calculateComparisonTotalsAndChanges(
  filteredTableData: TableRow[],
  dimensions: Dimension[],
  totals: Record<string, any>,
  compareEnabled: boolean
): { compareTotals: Record<string, any>; changeData: Record<string, number> } {
  if (!compareEnabled || filteredTableData.length === 0) {
    return { compareTotals: {}, changeData: {} };
  }

  // Calculate comparison totals from filtered data
  const filteredCompareTotals: Record<string, any> = {};
  for (const dim of dimensions) {
    if (dim.formula) continue;
    if (dim.type === 'number' || dim.type === 'currency' || dim.type === 'percentage') {
      let sum = 0;
      const calculateRowTotal = (rows: TableRow[]) => {
        rows.forEach(row => {
          // Skip if row is undefined/null
          if (!row) return;
          
          const hasChildren = row.children && row.children.length > 0;
          if (!hasChildren && row.compareData) {
            const value = row.compareData[dim.name];
            if (value !== undefined && value !== null) {
              sum += parseFloat(value) || 0;
            }
          }
          if (row.children) {
            calculateRowTotal(row.children);
          }
        });
      };
      calculateRowTotal(filteredTableData);
      filteredCompareTotals[dim.name] = sum;
    }
  }

  // Calculate formula comparison totals
  for (const dim of dimensions) {
    if (dim.formula) {
      try {
        let expression = dim.formula;
        
        // Convert percentage notation (e.g., "15%" to "0.15")
        expression = expression.replace(/(\d+(?:\.\d+)?)%/g, (match, num) => {
          return String(parseFloat(num) / 100);
        });
        
        const dimensionNames = dimensions.map(d => d.name).sort((a, b) => b.length - a.length);
        for (const dimName of dimensionNames) {
          const value = filteredCompareTotals[dimName] || 0;
          const escapedName = dimName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const regex = new RegExp(`\\b${escapedName}\\b`, 'g');
          expression = expression.replace(regex, `(${value})`);
        }
        const result = eval(expression);
        filteredCompareTotals[dim.name] = typeof result === 'number' && !isNaN(result) && isFinite(result) ? result : 0;
      } catch (error) {
        console.error('Formula comparison evaluation error:', error, 'for dimension:', dim.name);
        filteredCompareTotals[dim.name] = 0;
      }
    }
  }

  // Calculate change percentages
  const calculatedChangeData: Record<string, number> = {};
  const allDimNames = new Set<string>();
  Object.keys(totals).forEach(k => allDimNames.add(k));
  Object.keys(filteredCompareTotals).forEach(k => allDimNames.add(k));
  
  allDimNames.forEach((dimName: string) => {
    const current = totals[dimName] || 0;
    const previous = filteredCompareTotals[dimName] || 0;
    if (previous !== 0) {
      calculatedChangeData[dimName] = ((current - previous) / previous) * 100;
    } else if (current !== 0) {
      calculatedChangeData[dimName] = current > 0 ? 100 : -100;
    } else {
      calculatedChangeData[dimName] = 0;
    }
  });

  return { compareTotals: filteredCompareTotals, changeData: calculatedChangeData };
}

