/**
 * Forecast utility functions for predicting future metrics based on historical data
 */

import { addMonths, format, isAfter, isSameMonth, parseISO, startOfMonth } from 'date-fns';

/**
 * Interface for metric data with date information
 */
export interface DateMetricData {
  date: Date;
  metrics: Record<string, number>;
}

/**
 * Forecast methods available
 */
export type ForecastMethod = 'simple' | 'moving_average' | 'weighted_average' | 'seasonal';

/**
 * Configuration for the forecast algorithm
 */
export interface ForecastConfig {
  method: ForecastMethod;
  historyMonths?: number; // Number of months to use for historical data
  seasonalPeriod?: number; // Number of months in a seasonal cycle (e.g., 12 for annual seasonality)
  weights?: number[]; // Weights for weighted average (most recent first)
}

/**
 * Default forecast configuration
 */
const DEFAULT_CONFIG: ForecastConfig = {
  method: 'weighted_average',
  historyMonths: 3,
  seasonalPeriod: 12,
  weights: [0.5, 0.3, 0.2], // 50% weight on most recent month, 30% on second, 20% on third
};

/**
 * Metrics that should not be forecasted using multiplication
 * These are typically ratios or percentages that should be calculated after forecasting the raw metrics
 */
export const RATIO_METRICS = ['CTR', 'ROAS', 'Cost of sale', 'Conversion rate'];

/**
 * Forecast future metrics based on historical data
 * 
 * @param historicalData Array of historical data points with date and metrics
 * @param targetDate Date to forecast for
 * @param config Forecast configuration
 * @returns Forecasted metrics for the target date
 */
export function forecastMetrics(
  historicalData: DateMetricData[],
  targetDate: Date,
  config: Partial<ForecastConfig> = {}
): Record<string, number> {
  // Merge provided config with defaults
  const fullConfig: ForecastConfig = { ...DEFAULT_CONFIG, ...config };
  
  // Sort historical data by date (oldest first)
  const sortedData = [...historicalData].sort((a, b) => a.date.getTime() - b.date.getTime());
  
  // If we're forecasting for a date that's in the historical data, return the actual data
  const existingData = sortedData.find(d => isSameMonth(d.date, targetDate));
  if (existingData) {
    return existingData.metrics;
  }
  
  // If we have no historical data, we can't forecast
  if (sortedData.length === 0) {
    return {};
  }
  
  // Make sure the target date is after the last historical data point
  const lastHistoricalDate = sortedData[sortedData.length - 1].date;
  if (!isAfter(targetDate, lastHistoricalDate)) {
    console.warn('Target date is not after the last historical data point');
    return {};
  }
  
  // Choose the appropriate forecasting method
  switch (fullConfig.method) {
    case 'simple':
      return simpleExtrapolation(sortedData, targetDate);
    
    case 'moving_average':
      return movingAverageForecasting(sortedData, targetDate, fullConfig.historyMonths || 3);
    
    case 'weighted_average':
      return weightedAverageForecasting(
        sortedData, 
        targetDate, 
        fullConfig.historyMonths || 3, 
        fullConfig.weights || [0.5, 0.3, 0.2]
      );
    
    case 'seasonal':
      return seasonalForecasting(
        sortedData, 
        targetDate, 
        fullConfig.seasonalPeriod || 12
      );
    
    default:
      return simpleExtrapolation(sortedData, targetDate);
  }
}

/**
 * Simple extrapolation based on the most recent data point
 */
function simpleExtrapolation(
  historicalData: DateMetricData[],
  targetDate: Date
): Record<string, number> {
  // Get the most recent data point
  const latestData = historicalData[historicalData.length - 1];
  
  // For simple extrapolation, we just return the latest metrics
  return { ...latestData.metrics };
}

/**
 * Moving average forecasting based on the last N months
 */
function movingAverageForecasting(
  historicalData: DateMetricData[],
  targetDate: Date,
  months: number
): Record<string, number> {
  // Get the last N months of data
  const recentData = historicalData.slice(-months);
  
  if (recentData.length === 0) {
    return {};
  }
  
  // Calculate the average for each metric
  const result: Record<string, number> = {};
  
  // Get all unique metric keys
  const metricKeys = new Set<string>();
  recentData.forEach(data => {
    Object.keys(data.metrics).forEach(key => metricKeys.add(key));
  });
  
  // Calculate average for each metric
  metricKeys.forEach(key => {
    let sum = 0;
    let count = 0;
    
    recentData.forEach(data => {
      if (data.metrics[key] !== undefined) {
        sum += data.metrics[key];
        count++;
      }
    });
    
    if (count > 0) {
      result[key] = sum / count;
    }
  });
  
  return result;
}

/**
 * Weighted average forecasting, giving more weight to recent months
 */
function weightedAverageForecasting(
  historicalData: DateMetricData[],
  targetDate: Date,
  months: number,
  weights: number[]
): Record<string, number> {
  // Get the last N months of data
  const recentData = historicalData.slice(-months);
  
  if (recentData.length === 0) {
    return {};
  }
  
  // Ensure we have enough weights
  const normalizedWeights = [...weights];
  while (normalizedWeights.length < recentData.length) {
    normalizedWeights.push(0.1); // Default weight for additional months
  }
  
  // Normalize weights to sum to 1
  const weightSum = normalizedWeights.slice(0, recentData.length).reduce((sum, w) => sum + w, 0);
  const finalWeights = normalizedWeights.map(w => w / weightSum);
  
  // Calculate the weighted average for each metric
  const result: Record<string, number> = {};
  
  // Get all unique metric keys
  const metricKeys = new Set<string>();
  recentData.forEach(data => {
    Object.keys(data.metrics).forEach(key => metricKeys.add(key));
  });
  
  // Calculate weighted average for each metric
  metricKeys.forEach(key => {
    let weightedSum = 0;
    let weightUsed = 0;
    
    recentData.forEach((data, index) => {
      if (data.metrics[key] !== undefined) {
        weightedSum += data.metrics[key] * finalWeights[index];
        weightUsed += finalWeights[index];
      }
    });
    
    if (weightUsed > 0) {
      // Normalize by the weights actually used
      result[key] = weightedSum / weightUsed;
    }
  });
  
  return result;
}

/**
 * Seasonal forecasting, taking into account seasonal patterns
 */
function seasonalForecasting(
  historicalData: DateMetricData[],
  targetDate: Date,
  seasonalPeriod: number
): Record<string, number> {
  // Find data from the same month in previous years
  const targetMonth = targetDate.getMonth();
  const targetYear = targetDate.getFullYear();
  
  // Get data points from the same month in previous years
  const seasonalData = historicalData.filter(data => 
    data.date.getMonth() === targetMonth && data.date.getFullYear() < targetYear
  );
  
  if (seasonalData.length === 0) {
    // Fall back to weighted average if no seasonal data
    return weightedAverageForecasting(
      historicalData,
      targetDate,
      3,
      [0.5, 0.3, 0.2]
    );
  }
  
  // Calculate the average of seasonal data points
  const result: Record<string, number> = {};
  
  // Get all unique metric keys
  const metricKeys = new Set<string>();
  seasonalData.forEach(data => {
    Object.keys(data.metrics).forEach(key => metricKeys.add(key));
  });
  
  // Calculate average for each metric
  metricKeys.forEach(key => {
    let sum = 0;
    let count = 0;
    
    seasonalData.forEach(data => {
      if (data.metrics[key] !== undefined) {
        sum += data.metrics[key];
        count++;
      }
    });
    
    if (count > 0) {
      result[key] = sum / count;
    }
  });
  
  // Apply trend adjustment based on recent months
  const recentMonths = 3;
  const recentData = historicalData.slice(-recentMonths);
  
  if (recentData.length > 0) {
    // Calculate average growth rate from recent months
    const growthRates: Record<string, number[]> = {};
    
    for (let i = 1; i < recentData.length; i++) {
      const current = recentData[i];
      const previous = recentData[i - 1];
      
      metricKeys.forEach(key => {
        if (current.metrics[key] !== undefined && previous.metrics[key] !== undefined && previous.metrics[key] !== 0) {
          const growthRate = current.metrics[key] / previous.metrics[key];
          if (!growthRates[key]) {
            growthRates[key] = [];
          }
          growthRates[key].push(growthRate);
        }
      });
    }
    
    // Apply average growth rate to the seasonal average
    Object.keys(growthRates).forEach(key => {
      if (growthRates[key].length > 0 && result[key] !== undefined) {
        const avgGrowthRate = growthRates[key].reduce((sum, rate) => sum + rate, 0) / growthRates[key].length;
        // Apply growth rate based on how many months we're forecasting ahead
        const monthsAhead = (targetYear - new Date().getFullYear()) * 12 + (targetMonth - new Date().getMonth());
        result[key] *= Math.pow(avgGrowthRate, monthsAhead);
      }
    });
  }
  
  return result;
}

/**
 * Convert raw data from the API to DateMetricData format
 * 
 * @param rows Array of performance data rows
 * @returns Array of DateMetricData objects
 */
export function convertToDateMetricData(rows: any[]): DateMetricData[] {
  return rows
    .map(row => {
      // Try to extract date from row name (assuming format like "2023-01" or similar)
      let date: Date | null = null;
      if (row.name && typeof row.name === 'string') {
        try {
          // Try parsing as ISO date first
          date = parseISO(row.name);
        } catch (e) {
          // If that fails, try parsing as YYYY-MM format
          const match = row.name.match(/^(\d{4})-(\d{2})$/);
          if (match) {
            const [_, year, month] = match;
            date = new Date(parseInt(year), parseInt(month) - 1, 1);
          }
        }
      }
      
      // Skip rows where we couldn't extract a date
      if (!date) return null;
      
      // Extract metrics
      const metrics: Record<string, number> = {};
      if (row.data && typeof row.data === 'object') {
        Object.entries(row.data).forEach(([key, value]) => {
          if (typeof value === 'number') {
            metrics[key] = value;
          } else if (typeof value === 'string' && !isNaN(parseFloat(value))) {
            metrics[key] = parseFloat(value);
          }
        });
      }
      
      return { date, metrics };
    })
    .filter((item): item is DateMetricData => item !== null);
}

/**
 * Generate forecasted data for future months
 * 
 * @param historicalRows Array of performance data rows
 * @param numMonths Number of months to forecast
 * @param config Forecast configuration
 * @returns Array of forecasted rows
 */
export function generateForecastRows(
  historicalRows: any[],
  numMonths: number = 3,
  config: Partial<ForecastConfig> = {}
): any[] {
  // Convert historical rows to DateMetricData format
  const historicalData = convertToDateMetricData(historicalRows);
  
  if (historicalData.length === 0) {
    return [];
  }
  
  // Sort by date
  historicalData.sort((a, b) => a.date.getTime() - b.date.getTime());
  
  // Get the last date in the historical data
  const lastDate = historicalData[historicalData.length - 1].date;
  const startMonth = startOfMonth(lastDate);
  
  // Generate forecasted rows
  const forecastedRows: any[] = [];
  
  for (let i = 1; i <= numMonths; i++) {
    const forecastDate = addMonths(startMonth, i);
    const forecastedMetrics = forecastMetrics(historicalData, forecastDate, config);
    
    // Format the date as YYYY-MM
    const formattedDate = format(forecastDate, 'yyyy-MM');
    
    // Create a new row with forecasted data
    forecastedRows.push({
      id: `forecast-${formattedDate}`,
      name: formattedDate,
      level: 0,
      data: forecastedMetrics,
      isForecast: true, // Flag to identify forecasted rows
    });
  }
  
  return forecastedRows;
}
