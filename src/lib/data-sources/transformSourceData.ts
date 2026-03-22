/**
 * Functions for transforming source data to table format
 */

import { supabase } from "@/integrations/supabase/client";
import { parseNumericValueOrNull } from "@/lib/parseNumericValue";
import type { ColumnMapping, Dimension, DimensionMappingResult } from "./types";
import { autoDetectColumnType, resolveDimensionNameToId, createOrGetDimension } from "./dimensionMapping";

/**
 * Parse date value with auto-detection
 */
const parseDate = (value: any, dateFormat: string = 'auto-detect'): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  
  const stringValue = String(value).trim();
  if (!stringValue) return null;
  
  try {
    if (value instanceof Date) return value;
    
    if (dateFormat === 'auto-detect') {
      if (stringValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const parts = stringValue.split('-');
        if (parts.length === 3) {
          const [year, month, day] = parts;
          const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
          if (!isNaN(date.getTime())) {
            return date;
          }
        }
      }
      
      if (stringValue.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
        const parts = stringValue.split('/');
        if (parts.length === 3) {
          const [month, day, year] = parts;
          const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
          if (!isNaN(date.getTime())) {
            return date;
          }
        }
      }
      
      if (stringValue.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
        const parts = stringValue.split('/');
        if (parts.length === 3) {
          const [day, month, year] = parts;
          if (parseInt(day) > 12) {
            const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
            if (!isNaN(date.getTime())) {
              return date;
            }
          }
        }
      }
    }
    
    if (stringValue.includes('T') || stringValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const parsed = new Date(stringValue);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    
    const numValue = parseFloat(stringValue);
    if (!isNaN(numValue) && numValue >= 30000 && numValue < 100000) {
      const excelEpoch = new Date(1899, 11, 30);
      const date = new Date(excelEpoch.getTime() + numValue * 24 * 60 * 60 * 1000);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
    
    if (/^\d{4}$/.test(stringValue)) {
      const year = parseInt(stringValue);
      if (year >= 1900 && year <= 2100) {
        return new Date(Date.UTC(year, 0, 1));
      }
    }
    
    if (dateFormat !== 'auto-detect') {
      let parts: string[] = [];
      if (dateFormat === 'yyyy-mm-dd') {
        parts = stringValue.split(/[-/]/);
        if (parts.length === 3 && parts[0].length === 4) {
          const [year, month, day] = parts;
          return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
        }
      } else if (dateFormat === 'dd-mm-yyyy') {
        parts = stringValue.split(/[-/]/);
        if (parts.length === 3 && parts[2].length === 4) {
          const [day, month, year] = parts;
          return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
        }
      } else if (dateFormat === 'mm-dd-yyyy') {
        parts = stringValue.split(/[-/]/);
        if (parts.length === 3 && parts[2].length === 4) {
          const [month, day, year] = parts;
          return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
        }
      }
    }
    
    const parsed = new Date(stringValue);
    if (!isNaN(parsed.getTime())) return parsed;
    
    return null;
  } catch (e) {
    console.warn(`Failed to parse date: ${stringValue} with format ${dateFormat}`, e);
    return null;
  }
};

/**
 * Parse value based on dimension type
 */
export const parseValue = (value: any, dimensionType: string, dateFormat?: string): any => {
  if (value === null || value === undefined || value === '') return null;
  
  const stringValue = String(value).trim();
  if (!stringValue) return null;
  
  if (dimensionType === 'date') {
    const parsedDate = parseDate(value, dateFormat || 'auto-detect');
    if (parsedDate) {
      return parsedDate.toISOString().split('T')[0];
    }
    return null;
  }
  
  if (dimensionType === 'number' || dimensionType === 'currency' || dimensionType === 'percentage') {
    if (stringValue.includes('%')) {
      const raw = parseNumericValueOrNull(stringValue);
      if (raw !== null) {
        return dimensionType === 'percentage' ? raw / 100 : raw;
      }
    }
    const numValue = parseNumericValueOrNull(stringValue);
    if (numValue !== null) {
      return numValue;
    }
    return null;
  }
  
  return value;
};
