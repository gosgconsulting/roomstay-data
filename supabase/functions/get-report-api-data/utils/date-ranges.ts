/**
 * Utility functions for calculating API date ranges
 */

export interface DateRange {
  date_from: string; // YYYY-MM-DD format
  date_to: string;   // YYYY-MM-DD format
}

export interface ApiDateRanges {
  current: DateRange;
  comparison: DateRange;
}

/**
 * Calculate API date ranges:
 * - Current: First day of last month to today
 * - Comparison: Same date range shifted back 1 year
 * 
 * Example: If today is Dec 29, 2025
 * - Current: Nov 1, 2025 - Dec 29, 2025
 * - Comparison: Nov 1, 2024 - Dec 29, 2024
 */
export function calculateApiDateRanges(): ApiDateRanges {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-11
  const currentDate = now.getDate();

  // Calculate first day of last month
  const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
  
  // Current period: First day of last month to today
  const currentFrom = new Date(lastMonthYear, lastMonth, 1);
  const currentTo = new Date(currentYear, currentMonth, currentDate);

  // Comparison period: Same date range shifted back 1 year
  const comparisonFrom = new Date(lastMonthYear - 1, lastMonth, 1);
  const comparisonTo = new Date(currentYear - 1, currentMonth, currentDate);

  // Format as YYYY-MM-DD
  const formatDate = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  return {
    current: {
      date_from: formatDate(currentFrom),
      date_to: formatDate(currentTo),
    },
    comparison: {
      date_from: formatDate(comparisonFrom),
      date_to: formatDate(comparisonTo),
    },
  };
}
