/**
 * Debug utility functions for troubleshooting data issues
 */

/**
 * Logs data with a prefix for easier filtering in console
 * @param prefix The prefix to add to the log
 * @param data The data to log
 */
export const debugLog = (prefix: string, data: any) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[DEBUG:${prefix}]`, data);
  }
};

/**
 * Inspects an object structure and logs its keys and types
 * @param prefix The prefix to add to the log
 * @param obj The object to inspect
 * @param depth Maximum depth to inspect (default: 2)
 */
export const inspectObject = (prefix: string, obj: any, depth = 2) => {
  if (process.env.NODE_ENV !== 'production') {
    const inspect = (o: any, currentDepth = 0): any => {
      if (currentDepth >= depth) return '...';
      if (o === null) return 'null';
      if (o === undefined) return 'undefined';
      
      const type = typeof o;
      
      if (type !== 'object') return type;
      if (Array.isArray(o)) {
        return o.length === 0 
          ? 'empty array' 
          : `array[${o.length}] of ${typeof o[0]}`;
      }
      
      const entries = Object.entries(o);
      if (entries.length === 0) return 'empty object';
      
      return entries.reduce((acc, [key, value]) => {
        acc[key] = inspect(value, currentDepth + 1);
        return acc;
      }, {} as Record<string, any>);
    };
    
    console.log(`[INSPECT:${prefix}]`, inspect(obj));
  }
};

/**
 * Validates chart data and logs any issues found
 * @param chartData The chart data array to validate
 * @returns True if data is valid, false otherwise
 */
export const validateChartData = (chartData: any[]) => {
  if (!Array.isArray(chartData)) {
    console.error('[VALIDATE:CHART] Data is not an array', chartData);
    return false;
  }
  
  if (chartData.length === 0) {
    console.warn('[VALIDATE:CHART] Chart data array is empty');
    return false;
  }
  
  // Check if all items have required properties
  const invalidItems = chartData.filter(
    item => !item || typeof item !== 'object' || !('date' in item) || !('value' in item)
  );
  
  if (invalidItems.length > 0) {
    console.error('[VALIDATE:CHART] Some chart data items are invalid', invalidItems);
    return false;
  }
  
  return true;
};
