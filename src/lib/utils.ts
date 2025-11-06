import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Sorts KPIs with a better default grouping:
 * - First: Impressions, Clicks, Conversions, Conversion Rate
 * - Last: ROAS, Cost of sale
 * - Everything else in between
 */
export function sortKPIsByDefaultOrder(kpiNames: string[]): string[] {
  // Define priority order
  const priorityFirst = ['Impressions', 'Clicks', 'Conversions', 'Conversion Rate'];
  const priorityLast = ['ROAS', 'Cost of sale'];
  
  // Separate KPIs into priority groups
  const firstGroup: string[] = [];
  const middleGroup: string[] = [];
  const lastGroup: string[] = [];
  
  kpiNames.forEach(kpi => {
    const normalizedKpi = kpi.trim();
    if (priorityFirst.some(p => p.toLowerCase() === normalizedKpi.toLowerCase())) {
      firstGroup.push(kpi);
    } else if (priorityLast.some(p => p.toLowerCase() === normalizedKpi.toLowerCase())) {
      lastGroup.push(kpi);
    } else {
      middleGroup.push(kpi);
    }
  });
  
  // Sort each group by priority order, then alphabetically for middle group
  const sortByPriority = (items: string[], priority: string[]) => {
    return items.sort((a, b) => {
      const aIndex = priority.findIndex(p => p.toLowerCase() === a.toLowerCase());
      const bIndex = priority.findIndex(p => p.toLowerCase() === b.toLowerCase());
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return 0;
    });
  };
  
  const sortedFirst = sortByPriority(firstGroup, priorityFirst);
  const sortedLast = sortByPriority(lastGroup, priorityLast);
  const sortedMiddle = middleGroup.sort((a, b) => a.localeCompare(b));
  
  return [...sortedFirst, ...sortedMiddle, ...sortedLast];
}

/**
 * Returns account-specific default KPI visibility and order
 * For Roomstay account: specific order of KPIs
 * For other accounts: uses sortKPIsByDefaultOrder
 */
export function getAccountDefaultKPIs(accountName: string | undefined, availableKPIs: string[]): string[] {
  // Roomstay account specific order
  if (accountName?.toLowerCase() === 'roomstay') {
    const roomstayOrder = [
      'Impressions',
      'Clicks',
      'CTR',
      'Bookings',
      'Conversions',
      'Conversion Rate',
      'CPC',
      'Cost',
      'Revenue',
      'ROAS',
      'Cost of sale'
    ];
    
    // Return only KPIs that exist in availableKPIs, in the specified order
    return roomstayOrder.filter(kpi => 
      availableKPIs.some(available => available.toLowerCase() === kpi.toLowerCase())
    );
  }
  
  // Default ordering for other accounts
  return sortKPIsByDefaultOrder(availableKPIs);
}
