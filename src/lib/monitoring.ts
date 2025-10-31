/**
 * Simple monitoring utility for tracking performance and errors
 */

interface PerformanceMetric {
  component: string;
  action: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  error?: any;
}

const metrics: PerformanceMetric[] = [];

/**
 * Start tracking a performance metric
 * @param component The component name
 * @param action The action being performed
 * @returns A unique identifier for the metric
 */
export const startMetric = (component: string, action: string): number => {
  const metric: PerformanceMetric = {
    component,
    action,
    startTime: performance.now(),
    success: false,
  };
  
  metrics.push(metric);
  return metrics.length - 1;
};

/**
 * Complete a performance metric with success
 * @param id The metric identifier returned from startMetric
 */
export const completeMetric = (id: number): void => {
  if (id >= 0 && id < metrics.length) {
    const metric = metrics[id];
    metric.endTime = performance.now();
    metric.duration = metric.endTime - metric.startTime;
    metric.success = true;
    
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[PERF] ${metric.component}.${metric.action}: ${metric.duration.toFixed(2)}ms`);
    }
  }
};

/**
 * Complete a performance metric with an error
 * @param id The metric identifier returned from startMetric
 * @param error The error that occurred
 */
export const failMetric = (id: number, error: any): void => {
  if (id >= 0 && id < metrics.length) {
    const metric = metrics[id];
    metric.endTime = performance.now();
    metric.duration = metric.endTime - metric.startTime;
    metric.success = false;
    metric.error = error;
    
    if (process.env.NODE_ENV !== 'production') {
      console.error(`[PERF:ERROR] ${metric.component}.${metric.action}: ${metric.duration.toFixed(2)}ms`, error);
    }
  }
};

/**
 * Get all recorded metrics
 * @returns Array of all recorded metrics
 */
export const getMetrics = (): PerformanceMetric[] => {
  return [...metrics];
};

/**
 * Clear all recorded metrics
 */
export const clearMetrics = (): void => {
  metrics.length = 0;
};

/**
 * Track a function execution with performance metrics
 * @param component The component name
 * @param action The action being performed
 * @param fn The function to track
 * @returns The result of the function
 */
export const trackPerformance = async <T>(
  component: string, 
  action: string, 
  fn: () => Promise<T>
): Promise<T> => {
  const metricId = startMetric(component, action);
  
  try {
    const result = await fn();
    completeMetric(metricId);
    return result;
  } catch (error) {
    failMetric(metricId, error);
    throw error;
  }
};
