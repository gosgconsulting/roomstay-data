/**
 * Utility functions for data parsing and URL extraction
 * 
 * @module utils
 */

/**
 * Extracts the spreadsheet ID from a Google Sheets URL
 * 
 * @param {string} url - Full Google Sheets URL (e.g., "https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit")
 * @returns {string | null} The extracted spreadsheet ID or null if not found
 * 
 * @example
 * extractSpreadsheetId('https://docs.google.com/spreadsheets/d/abc123/edit')
 * // Returns: 'abc123'
 */
export const extractSpreadsheetId = (url: string): string | null => {
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
};

/**
 * Enhanced date parsing utility with auto-detection
 * 
 * Parses various date formats including:
 * - YYYY-MM-DD (ISO format)
 * - MM/DD/YYYY
 * - DD/MM/YYYY
 * - Excel serial dates
 * - Year-only values
 * 
 * @param {any} value - The value to parse (string, number, or Date)
 * @param {string} [dateFormat='auto-detect'] - Date format: 'auto-detect' | 'yyyy-mm-dd' | 'mm-dd-yyyy' | 'dd-mm-yyyy'
 * @returns {Date | null} Parsed Date object or null if parsing fails
 * 
 * @example
 * parseDate('2023-12-25') // Returns Date object
 * parseDate('12/25/2023', 'mm-dd-yyyy') // Returns Date object
 * parseDate('invalid') // Returns null
 */
export const parseDate = (value: any, dateFormat: string = 'auto-detect'): Date | null => {
  if (value === null || value === undefined || value === '') return null;
  
  const stringValue = String(value).trim();
  if (!stringValue) return null;
  
  try {
    // If already a Date object, return it
    if (value instanceof Date) return value;
    
    // Auto-detect common date formats if no specific format provided
    if (dateFormat === 'auto-detect') {
      // Try YYYY-MM-DD format first (ISO format, most common in exports)
      if (stringValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
        const parts = stringValue.split('-');
        if (parts.length === 3) {
          const [year, month, day] = parts;
          // Use UTC to avoid timezone issues
          const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
          if (!isNaN(date.getTime())) {
            console.log(`[RESYNC] Auto-detected YYYY-MM-DD format: ${stringValue} -> ${date.toISOString().split('T')[0]}`);
            return date;
          }
        }
      }
      
      // Try MM/DD/YYYY format
      if (stringValue.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
        const parts = stringValue.split('/');
        if (parts.length === 3) {
          const [month, day, year] = parts;
          // Use UTC to avoid timezone issues
          const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
          if (!isNaN(date.getTime())) {
            console.log(`[RESYNC] Auto-detected MM/DD/YYYY format: ${stringValue} -> ${date.toISOString().split('T')[0]}`);
            return date;
          }
        }
      }
      
      // Try DD/MM/YYYY format
      if (stringValue.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/)) {
        const parts = stringValue.split('/');
        if (parts.length === 3) {
          const [day, month, year] = parts;
          // Only try this if day > 12 (to distinguish from MM/DD/YYYY)
          if (parseInt(day) > 12) {
            // Use UTC to avoid timezone issues
            const date = new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
            if (!isNaN(date.getTime())) {
              console.log(`[RESYNC] Auto-detected DD/MM/YYYY format: ${stringValue} -> ${date.toISOString().split('T')[0]}`);
              return date;
            }
          }
        }
      }
    }
    
    // Handle ISO string with time
    if (stringValue.includes('T') || stringValue.match(/^\d{4}-\d{2}-\d{2}$/)) {
      const parsed = new Date(stringValue);
      if (!isNaN(parsed.getTime())) return parsed;
    }
    
    // Handle Excel serial dates (numbers like 44927 for 2023-01-01)
    const numValue = parseFloat(stringValue);
    if (!isNaN(numValue) && numValue >= 30000 && numValue < 100000) {
      // Excel serial date (days since 1900-01-01, but Excel treats 1900 as leap year)
      const excelEpoch = new Date(1899, 11, 30); // December 30, 1899
      const date = new Date(excelEpoch.getTime() + numValue * 24 * 60 * 60 * 1000);
      if (!isNaN(date.getTime())) {
        console.log(`[RESYNC] Parsed Excel serial date ${numValue} as ${date.toISOString().split('T')[0]}`);
        return date;
      }
    }
    
    // Handle year-only values (like "2023") - treat as January 1st of that year
    if (/^\d{4}$/.test(stringValue)) {
      const year = parseInt(stringValue);
      if (year >= 1900 && year <= 2100) {
        console.log(`[RESYNC] Converting year-only value ${year} to ${year}-01-01`);
        // Use UTC to avoid timezone issues
        return new Date(Date.UTC(year, 0, 1)); // January 1st of that year
      }
    }
    
    // Parse based on specific format if provided
    if (dateFormat !== 'auto-detect') {
      let parts: string[] = [];
      if (dateFormat === 'yyyy-mm-dd') {
        // Try YYYY-MM-DD or YYYY/MM/DD
        parts = stringValue.split(/[-/]/);
        if (parts.length === 3 && parts[0].length === 4) {
          const [year, month, day] = parts;
          // Use UTC to avoid timezone issues
          return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
        }
      } else if (dateFormat === 'dd-mm-yyyy') {
        // Try DD-MM-YYYY or DD/MM/YYYY
        parts = stringValue.split(/[-/]/);
        if (parts.length === 3 && parts[2].length === 4) {
          const [day, month, year] = parts;
          // Use UTC to avoid timezone issues
          return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
        }
      } else if (dateFormat === 'mm-dd-yyyy') {
        // Try MM-DD-YYYY or MM/DD/YYYY
        parts = stringValue.split(/[-/]/);
        if (parts.length === 3 && parts[2].length === 4) {
          const [month, day, year] = parts;
          // Use UTC to avoid timezone issues
          return new Date(Date.UTC(parseInt(year), parseInt(month) - 1, parseInt(day)));
        }
      }
    }
    
    // Fallback: try standard Date parsing
    const parsed = new Date(stringValue);
    if (!isNaN(parsed.getTime())) return parsed;
    
    return null;
  } catch (e) {
    console.warn(`Failed to parse date: ${stringValue} with format ${dateFormat}`, e);
    return null;
  }
};

/**
 * Enhanced value parsing utility with better format detection
 * 
 * Parses values based on dimension type:
 * - date: Parses dates with format detection
 * - currency: Removes currency symbols and parses numbers
 * - percentage: Converts percentages to decimals (1.76% -> 0.0176)
 * - number: Parses numeric values with comma handling
 * - text: Returns as-is
 * 
 * @param {any} value - The raw value to parse
 * @param {string} dimensionType - Type of dimension: 'date' | 'currency' | 'percentage' | 'number' | 'text'
 * @param {string} [dateFormat] - Date format if dimensionType is 'date'
 * @returns {any} Parsed value or null if parsing fails
 * 
 * @example
 * parseValue('$1,234.56', 'currency') // Returns: 1234.56
 * parseValue('1.76%', 'percentage') // Returns: 0.0176
 * parseValue('2023-12-25', 'date') // Returns: '2023-12-25'
 */
export const parseValue = (value: any, dimensionType: string, dateFormat?: string): any => {
  if (value === null || value === undefined || value === '') return null;
  
  const stringValue = String(value).trim();
  if (!stringValue) return null;
  
  // For date types, parse with enhanced detection
  if (dimensionType === 'date') {
    const parsedDate = parseDate(value, dateFormat || 'auto-detect');
    if (parsedDate) {
      // Return as ISO string for storage
      return parsedDate.toISOString().split('T')[0]; // YYYY-MM-DD format
    }
    return null;
  }
  
  // For numeric types, enhanced cleaning and parsing
  if (dimensionType === 'number' || dimensionType === 'currency' || dimensionType === 'percentage') {
    // Handle percentage values (like "1.76%" or "1.76214537%")
    if (stringValue.includes('%')) {
      const percentValue = stringValue.replace(/[%,\s]/g, '');
      const numValue = parseFloat(percentValue);
      if (!isNaN(numValue)) {
        // Store percentage as decimal (1.76% -> 0.0176)
        return dimensionType === 'percentage' ? numValue / 100 : numValue;
      }
    }
    
    // Handle currency values (like "$1.64", "$16.47", "$33.10", "€123.45")
    const currencySymbolsRegex = /[$€£¥₹₽¢₩₦₨₫₪₭₮₯₰₱₲₳₴₵₶₷₸₹₺₻₼₽₾₿]/g;
    const hasCurrencySymbol = currencySymbolsRegex.test(stringValue) || stringValue.includes('$');
    
    if (hasCurrencySymbol) {
      // Remove all currency symbols, commas, spaces, and other non-numeric characters except decimal point and minus sign
      const cleanedValue = stringValue
        .replace(currencySymbolsRegex, '') // Remove currency symbols
        .replace(/[,\s]/g, '') // Remove commas and spaces
        .replace(/[^\d.-]/g, ''); // Remove any other non-numeric characters except digits, dots, and minus
      
      const numValue = parseFloat(cleanedValue);
      if (!isNaN(numValue) && isFinite(numValue)) {
        console.log(`[RESYNC] Parsed currency value: "${stringValue}" -> ${numValue}`);
        return numValue;
      }
    }
    
    // Handle regular numbers with commas (like "1,234.56")
    const cleanedValue = stringValue.replace(/[,\s]/g, '');
    const numValue = parseFloat(cleanedValue);
    if (!isNaN(numValue)) {
      return numValue;
    }
    
    return null;
  }
  
  // For other types, return as-is
  return value;
};

