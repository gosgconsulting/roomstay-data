import { format, getWeek } from "date-fns";

export interface Dimension {
  id: string;
  name: string;
  type: string;
  formula: string | null;
}

/**
 * Format date based on granularity
 */
export function formatDate(
  dateValue: string | number | Date,
  granularity: 'day' | 'week' | 'month' | 'year'
): string {
  if (!dateValue) return "-";
  
  try {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return "-";
    
    switch (granularity) {
      case 'day':
        return format(date, 'MMMM d, yyyy'); // October 31, 2025
      case 'week': {
        const weekNumber = getWeek(date);
        const year = date.getFullYear();
        return `Week ${weekNumber}, ${year}`; // Week 45, 2025
      }
      case 'month':
        return format(date, 'MMMM yyyy'); // October 2025
      case 'year':
        return format(date, 'yyyy'); // 2025
      default:
        return "-";
    }
  } catch (error) {
    console.error('Error formatting date:', error);
    return "-";
  }
}

/**
 * Format row name - check if it's a date and format accordingly
 */
export function formatRowName(
  name: string,
  level: number,
  groupByDimensions: string[],
  breakdownByDimensions: string[],
  thenByDimensions: string[],
  dimensions: Dimension[],
  activeDateTab: 'day' | 'week' | 'month' | 'year'
): string {
  // Get the dimension for this level
  let dimId: string | undefined;
  if (level === 0) {
    dimId = groupByDimensions[0];
  } else if (level === 1) {
    dimId = breakdownByDimensions[0];
  } else if (level === 2) {
    dimId = thenByDimensions[0];
  }
  
  if (!dimId) return name;
  
  const dimension = dimensions.find(d => d.id === dimId);
  
  // If it's a date dimension, format it according to the active tab
  if (dimension?.type === 'date') {
    try {
      // Try to parse the date value
      const date = new Date(name);
      if (!isNaN(date.getTime())) {
        // Use the formatDate helper with current granularity
        return formatDate(date, activeDateTab);
      }
    } catch (error) {
      console.error('Error formatting date name:', error);
    }
  }
  
  // Also check if the name looks like a date (fallback for any date strings)
  if (typeof name === 'string' && name.match(/^\d{4}-\d{2}-\d{2}/)) {
    try {
      const date = new Date(name);
      if (!isNaN(date.getTime())) {
        return formatDate(date, activeDateTab);
      }
    } catch (error) {
      console.error('Error formatting date-like name:', error);
    }
  }
  
  return name;
}

/**
 * Format values based on dimension type
 */
export function formatValue(value: string | number | null | undefined, dimension: Dimension): string {
  if (value === null || value === undefined || value === "") return "-";
  
  const numValue = typeof value === 'number' ? value : parseFloat(String(value));
  if (isNaN(numValue)) return String(value);
  
  // Format based on dimension name and type
  const dimName = dimension.name.toLowerCase();
  
  // CPC: 2 decimals with $ prefix
  if (dimName === 'cpc') {
    return `$${numValue.toFixed(2)}`;
  }
  
  // Cost and Revenue: 0 decimals with $ prefix and comma separators
  if (dimName === 'cost' || dimName === 'revenue') {
    return `$${Math.round(numValue).toLocaleString('en-US')}`;
  }
  
  // Currency type: 2 decimals with $ prefix
  if (dimension.type === 'currency') {
    return `$${numValue.toFixed(2)}`;
  }
  
  // Percentage type: show as percentage
  if (dimension.type === 'percentage') {
    return `${numValue.toFixed(2)}%`;
  }
  
  // Regular numbers: add comma separators
  if (dimension.type === 'number' || dimension.formula) {
    // If it's a whole number, show as integer with commas
    if (Number.isInteger(numValue)) {
      return numValue.toLocaleString('en-US');
    }
    // If it has decimals, show 2 decimal places with commas
    return numValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  
  return value;
}

