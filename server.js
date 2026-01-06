import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';
import { createHash, randomBytes } from 'crypto';
import cors from 'cors';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// CORS configuration - allow all origins for public API
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON bodies
app.use(express.json());

/**
 * API Key Authentication Middleware
 * Validates API key from Authorization header or x-api-key header
 */
async function validateApiKey(req, res, next) {
  // Allow health check and root endpoints without auth
  if (req.path === '/health' || req.path === '/') {
    return next();
  }

  // Get API key from header
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '') || req.query.apiKey;

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key required',
      message: 'Please provide an API key in the x-api-key header, Authorization header, or apiKey query parameter'
    });
  }

  if (!supabase) {
    return res.status(500).json({
      success: false,
      error: 'Server configuration error: Supabase client not initialized'
    });
  }

  try {
    // Hash the provided API key to compare with stored hash
    const keyHash = createHash('sha256').update(apiKey).digest('hex');

    // Look up the API key in the database
    const { data: apiKeyRecord, error: lookupError } = await supabase
      .from('api_keys')
      .select('id, report_id, name, is_active, expires_at, last_used_at')
      .eq('key_hash', keyHash)
      .eq('is_active', true)
      .maybeSingle();

    if (lookupError) {
      console.error('[API-KEY] Error looking up API key:', lookupError);
      return res.status(500).json({
        success: false,
        error: 'Error validating API key'
      });
    }

    if (!apiKeyRecord) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key',
        message: 'The provided API key is invalid or has been revoked'
      });
    }

    // Check if key has expired
    if (apiKeyRecord.expires_at && new Date(apiKeyRecord.expires_at) < new Date()) {
      return res.status(401).json({
        success: false,
        error: 'API key expired',
        message: 'This API key has expired'
      });
    }

    // Update last_used_at
    await supabase
      .from('api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', apiKeyRecord.id);

    // Attach API key info to request for use in route handlers
    req.apiKey = apiKeyRecord;
    req.reportId = apiKeyRecord.report_id;

    next();
  } catch (error) {
    console.error('[API-KEY] Error in API key validation:', error);
    return res.status(500).json({
      success: false,
      error: 'Error validating API key'
    });
  }
}

// Initialize Supabase client
// Hardcoded credentials matching the frontend client (from src/integrations/supabase/client.ts)
// For production, use environment variables instead: SUPABASE_SERVICE_ROLE_KEY
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://zcxxwpwheevwavdcgfht.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpjeHh3cHdoZWV2d2F2ZGNnZmh0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE4Mzg1MjAsImV4cCI6MjA3NzQxNDUyMH0.zKmexYsPTkNWa65kjH5H6_aMosY9rHHj0lqg8j4T3Lc';
// Use service role key for server-side access (bypasses RLS)
// Fallback to anon key if service role key is not available (for development)
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || supabaseAnonKey;

let supabase;
const isServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY && supabaseServiceKey === process.env.SUPABASE_SERVICE_ROLE_KEY;
const isUsingAnonKey = supabaseServiceKey === supabaseAnonKey;

if (supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey);
  console.log('[SERVER] Supabase client initialized with URL:', supabaseUrl);
  if (isServiceRoleKey) {
    console.log('[SERVER] ✓ Using service role key (bypasses RLS)');
  } else if (isUsingAnonKey) {
    console.warn('[SERVER] ⚠ Using anon key (development mode) - RLS policies will apply');
    console.warn('[SERVER] ⚠ API endpoints may fail due to RLS restrictions. Set SUPABASE_SERVICE_ROLE_KEY for production.');
  } else {
    console.log('[SERVER] Using environment anon key');
  }
} else {
  // This should never happen now since we have a fallback
  supabase = null;
  console.error('[SERVER] Supabase client not initialized - missing credentials');
}

/**
 * Generate API Key endpoint
 * POST /api/keys/generate
 * Body: { reportId, name, description, expiresAt (optional) }
 */
app.post('/api/keys/generate', async (req, res) => {
  try {
    const { reportId, name, description, expiresAt } = req.body;

    if (!reportId) {
      return res.status(400).json({
        success: false,
        error: 'reportId is required'
      });
    }

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'name is required'
      });
    }

    if (!supabase) {
      return res.status(500).json({
        success: false,
        error: 'Server configuration error: Supabase client not initialized'
      });
    }

    // Generate a secure random API key
    const apiKey = `rs_${randomBytes(32).toString('hex')}`;
    const keyHash = createHash('sha256').update(apiKey).digest('hex');
    const keyPrefix = apiKey.substring(0, 8);

    // Store the API key in the database
    const { data: apiKeyRecord, error: insertError } = await supabase
      .from('api_keys')
      .insert({
        report_id: reportId,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        name,
        description: description || null,
        expires_at: expiresAt || null,
        is_active: true
      })
      .select()
      .single();

    if (insertError) {
      console.error('[API-KEY] Error creating API key:', insertError);
      return res.status(500).json({
        success: false,
        error: 'Failed to create API key',
        details: insertError.message
      });
    }

    console.log(`[API-KEY] Created API key for report: ${reportId}`);

    // Return the API key (only shown once!)
    return res.status(201).json({
      success: true,
      message: 'API key created successfully',
      apiKey: apiKey, // Only returned once - store this securely!
      keyPrefix: keyPrefix,
      id: apiKeyRecord.id,
      reportId: reportId,
      name: name,
      expiresAt: expiresAt || null,
      warning: 'Store this API key securely. It will not be shown again.'
    });

  } catch (error) {
    console.error('[API-KEY] Fatal error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get last 7 days of data for a report
 * Format: /api/make/reports/:reportId/last-7-days
 * Requires API key authentication
 * Optimized for Make.com workflows
 */
app.get('/api/make/reports/:reportId/last-7-days', validateApiKey, async (req, res) => {
  try {
    const { reportId } = req.params;

    // Verify the API key is for this report
    if (req.reportId !== reportId) {
      return res.status(403).json({
        success: false,
        error: 'API key not authorized for this report',
        count: 0,
        data: []
      });
    }

    if (!supabase) {
      return res.status(500).json({
        success: false,
        error: 'Server configuration error: Supabase client not initialized',
        count: 0,
        data: []
      });
    }

    console.log(`[MAKE-API] Fetching last 7 days data for report: ${reportId}`);

    // Calculate last 7 days date range
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
    
    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const dateFrom = formatDate(sevenDaysAgo);
    const dateTo = formatDate(now);

    // Get date dimension for this report
    const { data: dateDimensions, error: dimError } = await supabase
      .from('dimensions')
      .select('id, name')
      .eq('report_id', reportId)
      .eq('type', 'date')
      .limit(1);

    if (dimError || !dateDimensions || dateDimensions.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No date dimension found for this report',
        count: 0,
        data: []
      });
    }

    const dateDimensionId = dateDimensions[0].id;

    // Fetch data from dimension_data for last 7 days
    const { data: dimensionData, error: dataError } = await supabase
      .from('dimension_data')
      .select('dimension_values, row_number, data_source_id')
      .eq('report_id', reportId)
      .gte(`dimension_values->>${dateDimensionId}`, dateFrom)
      .lte(`dimension_values->>${dateDimensionId}`, dateTo);

    if (dataError) {
      console.error('[MAKE-API] Error fetching data:', dataError);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch data',
        details: dataError.message,
        count: 0,
        data: []
      });
    }

    // Format the data
    const formattedData = (dimensionData || []).map((row, index) => ({
      id: `${reportId}_${index}`,
      report_id: reportId,
      row_number: row.row_number || index + 1,
      data_source_id: row.data_source_id,
      ...row.dimension_values
    }));

    console.log(`[MAKE-API] Returning ${formattedData.length} rows for last 7 days (${dateFrom} to ${dateTo})`);

    return res.status(200).json({
      success: true,
      count: formattedData.length,
      dateRange: {
        from: dateFrom,
        to: dateTo,
        days: 7
      },
      data: formattedData,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[MAKE-API] Fatal error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({
      success: false,
      error: errorMessage,
      count: 0,
      data: []
    });
  }
});

/**
 * Make.com compatible API endpoint for report data
 * Format: /api/make/reports/:reportId
 * Requires API key authentication
 * Supports query parameters for filtering and pagination
 * Example: /api/make/reports/4b41d292-13f7-4695-81f9-0b4ee1761c9f?period=current&limit=100
 */
app.get('/api/make/reports/:reportId', validateApiKey, async (req, res) => {
  try {
    const { reportId } = req.params;
    const { period, limit, offset, sortBy, sortOrder } = req.query;

    // Verify the API key is for this report
    if (req.reportId !== reportId) {
      return res.status(403).json({
        success: false,
        error: 'API key not authorized for this report',
        count: 0,
        data: []
      });
    }

    if (!supabase) {
      return res.status(500).json({
        success: false,
        error: 'Server configuration error: Supabase client not initialized',
        count: 0,
        data: []
      });
    }

    console.log(`[MAKE-API] Fetching data for report: ${reportId}`, { period, limit, offset });

    // Determine which period to fetch
    const periodTypes = period === 'comparison' 
      ? ['comparison'] 
      : period === 'both'
      ? ['current', 'comparison']
      : ['current']; // default to current

    // Fetch API data from report_api_data table
    const { data: apiData, error: fetchError } = await supabase
      .from('report_api_data')
      .select('period_type, date_from, date_to, data')
      .eq('report_id', reportId)
      .in('period_type', periodTypes);

    if (fetchError) {
      console.error('[MAKE-API] Error fetching data:', fetchError);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch data',
        details: fetchError.message,
        count: 0,
        data: []
      });
    }

    if (!apiData || apiData.length === 0) {
      console.log(`[MAKE-API] No data found for report: ${reportId}`);
      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
        message: 'No data found for this report. Data may not have been synced yet.'
      });
    }

    // Combine data from all requested periods
    const allData = [];
    
    apiData.forEach((periodData) => {
      if (periodData.data && Array.isArray(periodData.data)) {
        periodData.data.forEach((row, index) => {
          allData.push({
            id: `${reportId}_${periodData.period_type}_${index}`,
            report_id: reportId,
            period: periodData.period_type,
            date_from: periodData.date_from,
            date_to: periodData.date_to,
            row_number: row.row_number || index + 1,
            ...row.dimension_values
          });
        });
      }
    });

    // Apply sorting if requested
    if (sortBy) {
      allData.sort((a, b) => {
        const aVal = a[sortBy];
        const bVal = b[sortBy];
        const order = sortOrder === 'desc' ? -1 : 1;
        
        if (aVal === bVal) return 0;
        if (aVal < bVal) return -1 * order;
        return 1 * order;
      });
    }

    // Apply pagination
    const limitNum = limit ? parseInt(limit, 10) : allData.length;
    const offsetNum = offset ? parseInt(offset, 10) : 0;
    const paginatedData = allData.slice(offsetNum, offsetNum + limitNum);

    console.log(`[MAKE-API] Returning ${paginatedData.length} of ${allData.length} rows for report: ${reportId}`);

    // Format response optimized for Make.com
    return res.status(200).json({
      success: true,
      count: paginatedData.length,
      total: allData.length,
      data: paginatedData,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        hasMore: offsetNum + limitNum < allData.length
      },
      periods: apiData.map(p => ({
        period: p.period_type,
        date_from: p.date_from,
        date_to: p.date_to,
        count: p.data?.length || 0
      }))
    });

  } catch (error) {
    console.error('[MAKE-API] Fatal error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({
      success: false,
      error: errorMessage,
      count: 0,
      data: []
    });
  }
});

/**
 * Public API endpoint for report data
 * Format: /api/reports/:reportId
 * Example: /api/reports/2eff17d0-38de-4d5d-a15b-69ad13788c92
 * 
 * Query Parameters:
 * - limit: Number of results to return (default: 100, max: 10000)
 * - offset: Number of results to skip (default: 0)
 * - date_from or date_start: Start date filter (YYYY-MM-DD)
 * - date_to or date_end: End date filter (YYYY-MM-DD)
 * - period: 'current' or 'comparison' or 'both' (default: 'current')
 * - Any dimension name: Filter by dimension value (e.g., ?Property=Hotel%20Name)
 * 
 * This endpoint fetches data directly from dimension_data table,
 * matching the frontend's data fetching approach.
 */
// Helper function to convert dimension name to snake_case (e.g., "Hotel Name" -> "hotel_name")
function toSnakeCase(str) {
  if (!str) return '';
  return str
    .trim()
    .replace(/([a-z])([A-Z])/g, '$1_$2')  // camelCase to snake_case
    .replace(/[\s\-\/]+/g, '_')            // spaces, hyphens, slashes to underscore
    .replace(/[^\w]+/g, '')                // remove special chars
    .toLowerCase();
}

// Helper function to calculate conversion rate: (conversions / clicks) * 100
function calculateConversionRate(conversions, clicks) {
  if (!clicks || clicks === 0) return 0;
  return parseFloat(((conversions / clicks) * 100).toFixed(2));
}

// Define which fields should be summed during aggregation (NOT conversion_rate - it will be calculated)
const summableFields = [
  'clicks', 'impressions', 'bookings', 'conversions',
  'revenue', 'cost', 'cpc', 'ctr',
  'roas', 'cost_of_sale', 'impression_share'
];

// Helper function to convert YYYY-MM to date range (handles leap years)
function getDateRangeForMonth(yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  
  if (!year || !month || month < 1 || month > 12) {
    return null;
  }
  
  // First day of the month
  const startDate = new Date(year, month - 1, 1);
  
  // Last day of the month
  const endDate = new Date(year, month, 0); // Day 0 of next month = last day of current month
  
  const formatDate = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };
  
  return {
    date_from: formatDate(startDate),
    date_to: formatDate(endDate)
  };
}

/**
 * Helper function to format month name (e.g., "January 2025")
 */
function formatMonthName(year, month) {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return `${monthNames[month]} ${year}`;
}

/**
 * Helper function to get month key from date (e.g., "2025-01")
 */
function getMonthKey(date) {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Helper function to group data by month
 */
function groupDataByMonth(data, dateDimensionId, dimensionIdToSnakeName) {
  const grouped = {};
  
  data.forEach(row => {
    const dimensionValues = row.dimension_values || {};
    let dateValue = null;
    
    // First try to find date by dimension ID in dimension_values
    if (dateDimensionId && dimensionValues[dateDimensionId]) {
      dateValue = dimensionValues[dateDimensionId];
    }
    
    // Try to find date by snake_case name in transformed row
    if (!dateValue && dateDimensionId) {
      const dateSnakeName = dimensionIdToSnakeName[dateDimensionId];
      if (dateSnakeName && row[dateSnakeName]) {
        dateValue = row[dateSnakeName];
      }
    }
    
    // Try common date field names
    if (!dateValue) {
      const commonDateFields = ['date', 'Date', 'day', 'Day', 'date_value', 'date_value'];
      for (const field of commonDateFields) {
        if (row[field] && typeof row[field] === 'string' && row[field].match(/^\d{4}-\d{2}-\d{2}/)) {
          dateValue = row[field];
          break;
        }
        if (dimensionValues[field] && typeof dimensionValues[field] === 'string' && dimensionValues[field].match(/^\d{4}-\d{2}-\d{2}/)) {
          dateValue = dimensionValues[field];
          break;
        }
      }
    }
    
    // Try to find any date-like field in dimension_values
    if (!dateValue) {
      for (const [key, value] of Object.entries(dimensionValues)) {
        if (typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
          dateValue = value;
          break;
        }
      }
    }
    
    // Try to find any date-like field in row directly
    if (!dateValue) {
      for (const [key, value] of Object.entries(row)) {
        if (key !== 'dimension_values' && typeof value === 'string' && value.match(/^\d{4}-\d{2}-\d{2}/)) {
          dateValue = value;
          break;
        }
      }
    }
    
    if (dateValue) {
      try {
        const monthKey = getMonthKey(dateValue);
        const d = new Date(dateValue);
        if (!isNaN(d.getTime())) {
          const monthName = formatMonthName(d.getFullYear(), d.getMonth());
          
          if (!grouped[monthKey]) {
            grouped[monthKey] = {
              month: monthName,
              month_key: monthKey,
              data: []
            };
          }
          
          // Remove dimension_values from transformed row for cleaner output
          const cleanRow = { ...row };
          delete cleanRow.dimension_values;
          
          grouped[monthKey].data.push(cleanRow);
        }
      } catch (e) {
        console.warn(`[API-MULTI] Error parsing date value: ${dateValue}`, e);
      }
    } else {
      // If no date found, put in "Uncategorized" month
      const uncategorizedKey = 'uncategorized';
      if (!grouped[uncategorizedKey]) {
        grouped[uncategorizedKey] = {
          month: 'Uncategorized',
          month_key: uncategorizedKey,
          data: []
        };
      }
      const cleanRow = { ...row };
      delete cleanRow.dimension_values;
      grouped[uncategorizedKey].data.push(cleanRow);
    }
  });
  
  return grouped;
}

/**
 * Combine multiple rows with different channels into a single row
 * with comma-separated values for channels and metrics
 */
function combineChannelsInMonth(monthsData, channelDimensionName = 'channel') {
  return monthsData.map(monthData => {
    if (!monthData.data || monthData.data.length === 0) {
      return monthData;
    }

    // Check if channel dimension exists in any row
    const hasChannel = monthData.data.some(row => 
      row[channelDimensionName] !== undefined && row[channelDimensionName] !== null
    );

    if (!hasChannel) {
      return monthData;
    }

    // Collect all unique channel values
    const channelValues = [];
    monthData.data.forEach(row => {
      const channelValue = row[channelDimensionName];
      if (channelValue !== undefined && channelValue !== null) {
        const channelStr = String(channelValue);
        if (!channelValues.includes(channelStr)) {
          channelValues.push(channelStr);
        }
      }
    });

    // If only one channel or no channels, return as-is
    if (channelValues.length <= 1) {
      return monthData;
    }

    // Identify metric fields (numeric fields excluding metadata)
    const metadataFields = new Set(['report_id', 'row_number', 'data_source_id', channelDimensionName]);
    const metricFields = new Set();
    
    monthData.data.forEach(row => {
      Object.keys(row).forEach(key => {
        if (!metadataFields.has(key) && typeof row[key] === 'number') {
          metricFields.add(key);
        }
      });
    });

    // Group rows by all fields except channel and metrics
    // Create a key from all non-channel, non-metric fields
    const groupedRows = new Map();
    
    monthData.data.forEach(row => {
      // Create grouping key from all fields except channel and metrics
      const groupKeyParts = [];
      Object.keys(row).forEach(key => {
        if (key !== channelDimensionName && !metricFields.has(key)) {
          groupKeyParts.push(`${key}:${String(row[key] || '')}`);
        }
      });
      const groupKey = groupKeyParts.sort().join('|');
      
      if (!groupedRows.has(groupKey)) {
        groupedRows.set(groupKey, {
          baseRow: {},
          channels: [],
          metrics: {}
        });
      }
      
      const group = groupedRows.get(groupKey);
      const channelValue = String(row[channelDimensionName] || '');
      
      // Store base row data (first occurrence)
      if (group.channels.length === 0) {
        Object.keys(row).forEach(key => {
          if (key !== channelDimensionName && !metricFields.has(key)) {
            group.baseRow[key] = row[key];
          }
        });
      }
      
      // Collect channel and metric values
      let channelIndex = group.channels.indexOf(channelValue);
      if (channelIndex === -1) {
        // New channel, add it
        channelIndex = group.channels.length;
        group.channels.push(channelValue);
      }
      
      // Initialize metric arrays if needed
      Array.from(metricFields).forEach(metric => {
        if (!group.metrics[metric]) {
          group.metrics[metric] = [];
        }
        // Ensure array is long enough
        while (group.metrics[metric].length <= channelIndex) {
          group.metrics[metric].push(0);
        }
      });
      
      // Add metric values for this channel (sum if channel already exists)
      Array.from(metricFields).forEach(metric => {
        const value = row[metric];
        if (value !== undefined && value !== null) {
          const numValue = typeof value === 'number' ? value : parseFloat(value);
          if (!isNaN(numValue)) {
            // Sum if channel already exists, otherwise set
            group.metrics[metric][channelIndex] = (group.metrics[metric][channelIndex] || 0) + numValue;
          }
        }
      });
    });

    // Create combined rows
    const combinedData = [];
    groupedRows.forEach((group, groupKey) => {
      const combinedRow = { ...group.baseRow };
      
      // Set combined channel value
      combinedRow[channelDimensionName] = group.channels.join(', ');
      
      // Set combined metric values as comma-separated strings
      Object.keys(group.metrics).forEach(metric => {
        combinedRow[metric] = group.metrics[metric].join(', ');
      });
      
      combinedData.push(combinedRow);
    });

    return {
      ...monthData,
      data: combinedData
    };
  });
}

/**
 * Public API endpoint for multiple reports data
 * Format: /api/reports?reports=id1,id2,id3&since=2024-01-01
 * Example: /api/reports?reports=2eff17d0-38de-4d5d-a15b-69ad13788c92&since=2024-01-01&metrics=Impressions,Clicks
 * 
 * Query Parameters:
 * - reports: Comma-separated list of report IDs (required)
 * - since: Start date (YYYY-MM-DD) - data from this date to today (required)
 * - metrics: Comma-separated list of metric names to include
 * - filter[reportId][dimensionId]: Comma-separated dimension values to filter
 * - breakdown[reportId]: Comma-separated breakdown dimension IDs
 */
app.get('/api/reports', async (req, res) => {
  try {
    // Support both old format (reportIds) and new format (reports)
    const reportIdsParam = req.query.reports || req.query.reportIds;
    
    if (!reportIdsParam) {
      return res.status(400).json({
        success: false,
        error: 'reports query parameter is required',
        count: 0,
        data: []
      });
    }

    // Parse reportIds (comma-separated string)
    const reportIds = typeof reportIdsParam === 'string' 
      ? reportIdsParam.split(',').map(id => id.trim()).filter(id => id.length > 0)
      : Array.isArray(reportIdsParam)
      ? reportIdsParam.map(id => String(id).trim()).filter(id => id.length > 0)
      : [];

    if (reportIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one valid report ID is required',
        count: 0,
        data: []
      });
    }

    if (!supabase) {
      return res.status(500).json({
        success: false,
        error: 'Server configuration error: Supabase client not initialized',
        count: 0,
        data: []
      });
    }

    // Extract query parameters (new cleaner format)
    const { 
      since,
      metrics: metricsParam,
      ...restParams 
    } = req.query;

    // Support legacy date_from/date_to for backward compatibility
    const date_from = since || req.query.date_from || req.query.date_start;
    const date_to = req.query.date_to || req.query.date_end;

    if (!date_from) {
      return res.status(400).json({
        success: false,
        error: 'since (or date_from) query parameter is required',
        count: 0,
        data: []
      });
    }

    // Parse metrics (comma-separated or array)
    const metrics = metricsParam 
      ? (typeof metricsParam === 'string' 
          ? metricsParam.split(',').map(m => m.trim()).filter(m => m.length > 0)
          : Array.isArray(metricsParam) 
          ? metricsParam.map(m => String(m).trim()).filter(m => m.length > 0)
          : [])
      : [];

    // Parse dimension filters per report: filter[reportId][dimensionId]=value1,value2
    const dimensionFiltersByReport = {};
    // Parse breakdown dimensions per report: breakdown[reportId]=dimId1,dimId2
    const breakdownByReport = {};

    // Extract dimension filters and breakdown from query params
    Object.keys(restParams).forEach(key => {
      // Match filter[reportId][dimensionId] (new format)
      const filterMatch = key.match(/^filter\[([^\]]+)\]\[([^\]]+)\]$/);
      if (filterMatch) {
        const [, reportId, dimensionId] = filterMatch;
        if (!dimensionFiltersByReport[reportId]) {
          dimensionFiltersByReport[reportId] = {};
        }
        const value = restParams[key];
        if (typeof value === 'string') {
          dimensionFiltersByReport[reportId][dimensionId] = value.split(',').map(v => v.trim()).filter(v => v.length > 0);
        } else if (Array.isArray(value)) {
          dimensionFiltersByReport[reportId][dimensionId] = value.map(v => String(v).trim()).filter(v => v.length > 0);
        }
      }

      // Match breakdown[reportId] (new format)
      const breakdownMatch = key.match(/^breakdown\[([^\]]+)\]$/);
      if (breakdownMatch) {
        const [, reportId] = breakdownMatch;
        const value = restParams[key];
        if (typeof value === 'string') {
          breakdownByReport[reportId] = value.split(',').map(v => v.trim()).filter(v => v.length > 0);
        } else if (Array.isArray(value)) {
          breakdownByReport[reportId] = value.map(v => String(v).trim()).filter(v => v.length > 0);
        }
      }

      // Legacy format support: dimensions[reportId][dimensionId][]
      const dimMatch = key.match(/^dimensions\[([^\]]+)\]\[([^\]]+)\]\[\]$/);
      if (dimMatch) {
        const [, reportId, dimensionId] = dimMatch;
        if (!dimensionFiltersByReport[reportId]) {
          dimensionFiltersByReport[reportId] = {};
        }
        if (!dimensionFiltersByReport[reportId][dimensionId]) {
          dimensionFiltersByReport[reportId][dimensionId] = [];
        }
        const value = restParams[key];
        if (Array.isArray(value)) {
          dimensionFiltersByReport[reportId][dimensionId].push(...value);
        } else {
          dimensionFiltersByReport[reportId][dimensionId].push(value);
        }
      }

      // Legacy format support: breakdown[reportId][]
      const legacyBreakdownMatch = key.match(/^breakdown\[([^\]]+)\]\[\]$/);
      if (legacyBreakdownMatch) {
        const [, reportId] = legacyBreakdownMatch;
        if (!breakdownByReport[reportId]) {
          breakdownByReport[reportId] = [];
        }
        const value = restParams[key];
        if (Array.isArray(value)) {
          breakdownByReport[reportId].push(...value);
        } else {
          breakdownByReport[reportId].push(value);
        }
      }
    });

    // Calculate date range: from since date to today
    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const sinceDate = date_from;
    const toDate = date_to || formatDate(new Date());

    // Process each report and combine data
    const allTransformedData = [];
    const allDimensionsMetadata = [];
    const reportMetadata = [];
    let globalDateDimensionId = null;

    for (const reportId of reportIds) {
      try {
        // Fetch dimensions for this report
        const { data: dimensions, error: dimError } = await supabase
          .from('dimensions')
          .select('id, name, type')
          .eq('report_id', reportId)
          .order('name', { ascending: true });

        if (dimError) {
          console.warn(`[API-MULTI] Error fetching dimensions for report ${reportId}:`, dimError);
        }

        // Create dimension mappings
        const dimensionIdToName = {};
        const dimensionIdToSnakeName = {};
        const dimensionNameToId = {};
        const dimensionSnakeNameToId = {};
        let dateDimensionId = null;

        if (dimensions && dimensions.length > 0) {
          dimensions.forEach(dim => {
            const snakeName = toSnakeCase(dim.name);
            dimensionIdToName[dim.id] = dim.name;
            dimensionIdToSnakeName[dim.id] = snakeName;
            dimensionNameToId[dim.name] = dim.id;
            dimensionSnakeNameToId[snakeName] = dim.id;
            
            if (dim.type === 'date' && !dateDimensionId) {
              dateDimensionId = dim.id;
              if (!globalDateDimensionId) {
                globalDateDimensionId = dim.id;
              }
            }
          });
        }

        // Fetch data for this report
        const fetchDataForPeriod = async (dateFrom, dateTo) => {
          if (!dateDimensionId) {
            const { data: dimensionData, error: dataError } = await supabase
              .from('dimension_data')
              .select('dimension_values, row_number, data_source_id')
              .eq('report_id', reportId)
              .order('row_number', { ascending: true });

            if (dataError) throw dataError;
            return dimensionData || [];
          }

          const toDateObj = new Date(dateTo);
          const adjustedToDate = new Date(toDateObj.getFullYear(), toDateObj.getMonth(), toDateObj.getDate() + 1);
          const adjustedToDateStr = adjustedToDate.toISOString().split('T')[0];
          
          const { data: dimensionData, error: dataError } = await supabase
            .from('dimension_data')
            .select('dimension_values, row_number, data_source_id')
            .eq('report_id', reportId)
            .gte(`dimension_values->>${dateDimensionId}`, dateFrom)
            .lt(`dimension_values->>${dateDimensionId}`, adjustedToDateStr)
            .order('row_number', { ascending: true });

          if (dataError) throw dataError;
          return dimensionData || [];
        };

        // Fetch data from since date to end date
        const allData = await fetchDataForPeriod(sinceDate, toDate);

        // Apply dimension filters for this report
        let filteredData = allData;
        const reportDimFilters = dimensionFiltersByReport[reportId] || {};
        
        if (Object.keys(reportDimFilters).length > 0) {
          filteredData = allData.filter(row => {
            for (const [dimensionId, filterValues] of Object.entries(reportDimFilters)) {
              const rowValue = row.dimension_values[dimensionId];
              const rowValueStr = String(rowValue || '').toLowerCase();
              
              // Check if any filter value matches
              const matches = filterValues.some(filterValue => {
                const filterValueStr = String(filterValue).toLowerCase();
                return rowValueStr.includes(filterValueStr) || filterValueStr.includes(rowValueStr);
              });
              
              if (!matches) {
                return false;
              }
            }
            return true;
          });
        }

        // Apply metrics filter if specified
        if (metrics.length > 0) {
          // Filter to only include rows that have at least one of the requested metrics
          // This assumes metrics are stored as dimensions
          filteredData = filteredData.filter(row => {
            // Check if any metric dimension exists in the row
            return metrics.some(metric => {
              // Try to find metric by name or snake_case name
              const metricDimId = dimensionNameToId[metric] || 
                                 Object.entries(dimensionIdToName).find(([id, name]) => 
                                   name.toLowerCase() === metric.toLowerCase()
                                 )?.[0];
              if (metricDimId) {
                const value = row.dimension_values[metricDimId];
                return value !== undefined && value !== null && value !== '';
              }
              return false;
            });
          });
        }

        // Transform data: Replace dimension IDs with snake_case names and add report_id
        const transformedData = filteredData.map((row) => {
          const transformed = {
            report_id: reportId,
            row_number: row.row_number,
            data_source_id: row.data_source_id,
            dimension_values: row.dimension_values // Keep original for month grouping
          };

          // Replace dimension IDs with snake_case dimension names
          for (const [dimId, value] of Object.entries(row.dimension_values || {})) {
            const snakeName = dimensionIdToSnakeName[dimId] || toSnakeCase(dimensionIdToName[dimId]) || dimId;
            transformed[snakeName] = value;
          }

          return transformed;
        });

        allTransformedData.push(...transformedData);

        // Collect dimension metadata
        if (dimensions && dimensions.length > 0) {
          dimensions.forEach(dim => {
            // Avoid duplicates by checking if dimension already exists
            const existing = allDimensionsMetadata.find(d => d.id === dim.id);
            if (!existing) {
              allDimensionsMetadata.push({
                id: dim.id,
                name: dim.name,
                snake_name: toSnakeCase(dim.name),
                type: dim.type
              });
            }
          });
        }

        // Store report metadata
        reportMetadata.push({
          report_id: reportId,
          count: transformedData.length
        });

      } catch (error) {
        console.error(`[API-MULTI] Error processing report ${reportId}:`, error);
        // Continue with other reports even if one fails
        reportMetadata.push({
          report_id: reportId,
          error: error instanceof Error ? error.message : 'Unknown error',
          count: 0
        });
      }
    }

    // Group data by month
    const totalCount = allTransformedData.length;
    
    // Find date dimension ID from first report's dimensions
    let dateDimId = globalDateDimensionId;
    if (!dateDimId && allDimensionsMetadata.length > 0) {
      const dateDim = allDimensionsMetadata.find(d => d.type === 'date');
      if (dateDim) {
        dateDimId = dateDim.id;
      }
    }

    // Build dimension ID to snake name mapping for all reports
    const allDimensionIdToSnakeName = {};
    allDimensionsMetadata.forEach(dim => {
      allDimensionIdToSnakeName[dim.id] = dim.snake_name;
    });

    // Group data by month
    const groupedByMonth = groupDataByMonth(allTransformedData, dateDimId, allDimensionIdToSnakeName);

    // Convert grouped object to array and sort by month key
    let monthsData = Object.values(groupedByMonth).sort((a, b) => {
      return a.month_key.localeCompare(b.month_key);
    });

    // Combine multiple channels into single rows with comma-separated values
    // Find channel dimension name from metadata
    const channelDimension = allDimensionsMetadata.find(d => 
      d.name.toLowerCase() === 'channel' || 
      d.snake_name === 'channel'
    );
    const channelDimName = channelDimension?.snake_name || 'channel';
    
    monthsData = combineChannelsInMonth(monthsData, channelDimName);

    console.log(`[API-MULTI] Returning ${totalCount} rows grouped into ${monthsData.length} months from ${reportIds.length} reports`);

    // Format JSON response (no pagination)
    return res.status(200).json({
      success: true,
      count: totalCount,
      since: sinceDate,
      to: toDate,
      data: monthsData,
      reports: reportMetadata,
      dimensions: allDimensionsMetadata
    });

  } catch (error) {
    console.error('[API-MULTI] Fatal error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({
      success: false,
      error: errorMessage,
      count: 0,
      data: []
    });
  }
});

/**
 * API endpoint for AI Summary card-based reports
 * Format: /api/reports/card/:cardId
 * Example: /api/reports/card/550e8400-e29b-41d4-a716-446655440000
 * 
 * This endpoint automatically applies all settings from the AI Summary card:
 * - report_ids, since_date, selected_metrics, report_configs (filters & breakdowns)
 */
app.get('/api/reports/card/:cardId', async (req, res) => {
  try {
    const { cardId } = req.params;
    
    // Validate card ID format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(cardId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid card ID format. Expected UUID.',
        count: 0,
        data: []
      });
    }

    if (!supabase) {
      return res.status(500).json({
        success: false,
        error: 'Server configuration error: Supabase client not initialized',
        count: 0,
        data: []
      });
    }

    // Fetch AI Summary card configuration including cached data
    // Use maybeSingle() instead of single() to handle 0 rows gracefully
    const { data: card, error: cardError } = await supabase
      .from('ai_summary_cards')
      .select('id, report_ids, report_configs, selected_metrics, since_date, user_id, cached_pivot_data, pivot_data_refreshed_at')
      .eq('id', cardId)
      .maybeSingle();

    if (cardError) {
      console.error('[API-CARD] Error fetching card:', cardError);
      // Check if error is due to RLS (PGRST116 = no rows, often due to RLS)
      const isRLSError = cardError.code === 'PGRST116' || cardError.message?.includes('0 rows');
      const errorMessage = isRLSError 
        ? 'Card not found or access denied. Ensure SUPABASE_SERVICE_ROLE_KEY is set for server-side access.'
        : cardError.message || 'Error fetching card configuration';
      
      return res.status(isRLSError ? 404 : 500).json({
        success: false,
        error: errorMessage,
        details: cardError,
        count: 0,
        data: []
      });
    }

    if (!card) {
      // Check if we're using anon key (which would cause RLS issues)
      const isUsingAnonKey = supabaseServiceKey === supabaseAnonKey;
      const errorMessage = isUsingAnonKey
        ? 'Card not found. This may be due to RLS restrictions. Set SUPABASE_SERVICE_ROLE_KEY environment variable for server-side access.'
        : 'Card not found';
      
      console.warn(`[API-CARD] Card ${cardId} not found. Using anon key: ${isUsingAnonKey}`);
      return res.status(404).json({
        success: false,
        error: errorMessage,
        count: 0,
        data: []
      });
    }

    // Extract configuration from card
    const reportIds = card.report_ids || [];
    if (reportIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Card has no reports configured',
        count: 0,
        data: []
      });
    }

    const sinceDate = card.since_date;
    if (!sinceDate) {
      return res.status(400).json({
        success: false,
        error: 'Card has no since_date configured',
        count: 0,
        data: []
      });
    }

    // Check if cached_pivot_data exists and return it directly
    if (card.cached_pivot_data && Object.keys(card.cached_pivot_data).length > 0) {
      console.log(`[API-CARD] Returning cached_pivot_data for card ${cardId}, refreshed at ${card.pivot_data_refreshed_at}`);
      
      // Calculate date range for response
      const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      const toDate = formatDate(new Date());
      
      // Count total data rows from cached data
      let totalCount = 0;
      const cachedData = card.cached_pivot_data;
      
      // Extract monthly_data if present
      const monthlyData = cachedData.monthly_data || cachedData;
      if (typeof monthlyData === 'object') {
        Object.values(monthlyData).forEach((reportData) => {
          if (typeof reportData === 'object') {
            Object.values(reportData).forEach((monthData) => {
              if (Array.isArray(monthData)) {
                totalCount += monthData.length;
              } else if (typeof monthData === 'object' && monthData.metrics) {
                totalCount += 1;
              }
            });
          }
        });
      }
      
      // Build reports metadata
      const reportMetadata = reportIds.map(reportId => {
        const reportData = cachedData.actual_data_ranges?.[reportId] || {};
        return {
          report_id: reportId,
          report_name: reportData.reportName || 'Unknown',
          count: 0 // Not tracking per-report count in cached data
        };
      });
      
      return res.status(200).json({
        success: true,
        count: totalCount,
        since: sinceDate,
        to: toDate,
        cached: true,
        cached_at: card.pivot_data_refreshed_at,
        data: cachedData,
        reports: reportMetadata,
        dimensions: []
      });
    }

    console.log(`[API-CARD] No cached data, fetching live data for card ${cardId}`);

    const selectedMetrics = card.selected_metrics || [];
    const reportConfigs = card.report_configs || {};

    // Parse dimension filters and breakdowns from report_configs
    const dimensionFiltersByReport = {};
    const breakdownByReport = {};

    // Extract filters: report_configs[reportId].dimensionId and selectedValues
    Object.entries(reportConfigs).forEach(([reportId, config]) => {
      if (config?.dimensionId && config?.selectedValues && Array.isArray(config.selectedValues) && config.selectedValues.length > 0) {
        if (!dimensionFiltersByReport[reportId]) {
          dimensionFiltersByReport[reportId] = {};
        }
        dimensionFiltersByReport[reportId][config.dimensionId] = config.selectedValues;
      }
    });

    // Extract breakdowns: report_configs.breakdown_configs[reportId].breakdownDimensionIds
    const breakdownConfigs = reportConfigs?.breakdown_configs || {};
    Object.entries(breakdownConfigs).forEach(([reportId, config]) => {
      if (config?.breakdownDimensionIds && Array.isArray(config.breakdownDimensionIds) && config.breakdownDimensionIds.length > 0) {
        breakdownByReport[reportId] = config.breakdownDimensionIds;
      }
    });

    // Calculate date range: from since date to today
    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const toDate = formatDate(new Date());

    // Process each report and combine data (reuse logic from /api/reports endpoint)
    const allTransformedData = [];
    const allDimensionsMetadata = [];
    const reportMetadata = [];
    let globalDateDimensionId = null;

    for (const reportId of reportIds) {
      try {
        // Fetch dimensions for this report (including global dimensions with report_id IS NULL)
        const { data: dimensions, error: dimError } = await supabase
          .from('dimensions')
          .select('id, name, type')
          .or(`report_id.eq.${reportId},report_id.is.null,scope.eq.global`)
          .order('name', { ascending: true });

        if (dimError) {
          console.warn(`[API-CARD] Error fetching dimensions for report ${reportId}:`, dimError);
        }

        // Create dimension mappings
        const dimensionIdToName = {};
        const dimensionIdToSnakeName = {};
        const dimensionNameToId = {};
        const dimensionSnakeNameToId = {};
        let dateDimensionId = null;

        if (dimensions && dimensions.length > 0) {
          dimensions.forEach(dim => {
            const snakeName = toSnakeCase(dim.name);
            dimensionIdToName[dim.id] = dim.name;
            dimensionIdToSnakeName[dim.id] = snakeName;
            dimensionNameToId[dim.name] = dim.id;
            dimensionSnakeNameToId[snakeName] = dim.id;
            
            if (dim.type === 'date' && !dateDimensionId) {
              dateDimensionId = dim.id;
              if (!globalDateDimensionId) {
                globalDateDimensionId = dim.id;
              }
            }
          });
        }

        // Fetch data for this report
        const fetchDataForPeriod = async (dateFrom, dateTo) => {
          if (!dateDimensionId) {
            const { data: dimensionData, error: dataError } = await supabase
              .from('dimension_data')
              .select('dimension_values, row_number, data_source_id')
              .eq('report_id', reportId)
              .order('row_number', { ascending: true });

            if (dataError) throw dataError;
            return dimensionData || [];
          }

          const toDateObj = new Date(dateTo);
          const adjustedToDate = new Date(toDateObj.getFullYear(), toDateObj.getMonth(), toDateObj.getDate() + 1);
          const adjustedToDateStr = adjustedToDate.toISOString().split('T')[0];
          
          const { data: dimensionData, error: dataError } = await supabase
            .from('dimension_data')
            .select('dimension_values, row_number, data_source_id')
            .eq('report_id', reportId)
            .gte(`dimension_values->>${dateDimensionId}`, dateFrom)
            .lt(`dimension_values->>${dateDimensionId}`, adjustedToDateStr)
            .order('row_number', { ascending: true });

          if (dataError) throw dataError;
          return dimensionData || [];
        };

        // Fetch data from since date to end date
        const allData = await fetchDataForPeriod(sinceDate, toDate);

        // Apply dimension filters for this report
        let filteredData = allData;
        const reportDimFilters = dimensionFiltersByReport[reportId] || {};
        
        if (Object.keys(reportDimFilters).length > 0) {
          filteredData = allData.filter(row => {
            for (const [dimensionId, filterValues] of Object.entries(reportDimFilters)) {
              const rowValue = row.dimension_values[dimensionId];
              const rowValueStr = String(rowValue || '').toLowerCase();
              
              // Check if any filter value matches
              const matches = filterValues.some(filterValue => {
                const filterValueStr = String(filterValue).toLowerCase();
                return rowValueStr.includes(filterValueStr) || filterValueStr.includes(filterValueStr);
              });
              
              if (!matches) {
                return false;
              }
            }
            return true;
          });
        }

        // Apply metrics filter if specified
        if (selectedMetrics.length > 0) {
          filteredData = filteredData.filter(row => {
            return selectedMetrics.some(metric => {
              const metricDimId = dimensionNameToId[metric] || 
                                 Object.entries(dimensionIdToName).find(([id, name]) => 
                                   name.toLowerCase() === metric.toLowerCase()
                                 )?.[0];
              if (metricDimId) {
                const value = row.dimension_values[metricDimId];
                return value !== undefined && value !== null && value !== '';
              }
              return false;
            });
          });
        }

        // Transform data: Replace dimension IDs with snake_case names and add report_id
        const transformedData = filteredData.map((row) => {
          const transformed = {
            report_id: reportId,
            row_number: row.row_number,
            data_source_id: row.data_source_id,
            dimension_values: row.dimension_values // Keep original for month grouping
          };

          // Replace dimension IDs with snake_case dimension names
          for (const [dimId, value] of Object.entries(row.dimension_values || {})) {
            const snakeName = dimensionIdToSnakeName[dimId] || toSnakeCase(dimensionIdToName[dimId]) || dimId;
            transformed[snakeName] = value;
          }

          return transformed;
        });

        allTransformedData.push(...transformedData);

        // Collect dimension metadata
        if (dimensions && dimensions.length > 0) {
          dimensions.forEach(dim => {
            const existing = allDimensionsMetadata.find(d => d.id === dim.id);
            if (!existing) {
              allDimensionsMetadata.push({
                id: dim.id,
                name: dim.name,
                snake_name: toSnakeCase(dim.name),
                type: dim.type
              });
            }
          });
        }

        // Store report metadata
        reportMetadata.push({
          report_id: reportId,
          count: transformedData.length
        });

      } catch (error) {
        console.error(`[API-CARD] Error processing report ${reportId}:`, error);
        reportMetadata.push({
          report_id: reportId,
          error: error instanceof Error ? error.message : 'Unknown error',
          count: 0
        });
      }
    }

    // Group data by month
    const totalCount = allTransformedData.length;
    
    // Find date dimension ID from first report's dimensions
    let dateDimId = globalDateDimensionId;
    if (!dateDimId && allDimensionsMetadata.length > 0) {
      const dateDim = allDimensionsMetadata.find(d => d.type === 'date');
      if (dateDim) {
        dateDimId = dateDim.id;
      }
    }

    // Build dimension ID to snake name mapping for all reports
    const allDimensionIdToSnakeName = {};
    allDimensionsMetadata.forEach(dim => {
      allDimensionIdToSnakeName[dim.id] = dim.snake_name;
    });

    // Group data by month
    const groupedByMonth = groupDataByMonth(allTransformedData, dateDimId, allDimensionIdToSnakeName);

    // Convert grouped object to array and sort by month key
    let monthsData = Object.values(groupedByMonth).sort((a, b) => {
      return a.month_key.localeCompare(b.month_key);
    });

    // Combine multiple channels into single rows with comma-separated values
    const channelDimension = allDimensionsMetadata.find(d => 
      d.name.toLowerCase() === 'channel' || 
      d.snake_name === 'channel'
    );
    const channelDimName = channelDimension?.snake_name || 'channel';
    
    monthsData = combineChannelsInMonth(monthsData, channelDimName);

    console.log(`[API-CARD] Returning ${totalCount} rows grouped into ${monthsData.length} months from ${reportIds.length} reports for card ${cardId}`);

    // Format JSON response (no pagination)
    return res.status(200).json({
      success: true,
      count: totalCount,
      since: sinceDate,
      to: toDate,
      data: monthsData,
      reports: reportMetadata,
      dimensions: allDimensionsMetadata
    });

  } catch (error) {
    console.error('[API-CARD] Fatal error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({
      success: false,
      error: errorMessage,
      count: 0,
      data: []
    });
  }
});

app.get('/api/reports/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;
    
    // Extract months[] or months parameter (Express may parse it as either)
    let monthsParam = req.query['months[]'] || req.query['months'];
    if (monthsParam && !Array.isArray(monthsParam)) {
      monthsParam = [monthsParam];
    }
    
    // Then extract other parameters, excluding months variations from dimensionFilters
    const { 
      limit = 100, 
      offset = 0, 
      page,
      date_from, 
      date_start,
      date_to, 
      date_end,
      period = 'current',
      groupby,                       // NEW: Primary grouping dimension
      breakdownby: breakdownByParam,  // NEW: Multiple breakdown dimensions (Express parses breakdownby[] as breakdownby)
      'months[]': _unused1, // Exclude from spreading
      'months': _unused2,   // Exclude from spreading
      ...dimensionFilters 
    } = req.query;
    
    // Normalize breakdownby to array
    const breakdownby = breakdownByParam 
      ? (Array.isArray(breakdownByParam) ? breakdownByParam : [breakdownByParam])
      : [];

    if (!reportId) {
      return res.status(400).json({
        success: false,
        error: 'reportId is required',
        count: 0,
        data: []
      });
    }

    if (!supabase) {
      return res.status(500).json({
        success: false,
        error: 'Server configuration error: Supabase client not initialized',
        count: 0,
        data: []
      });
    }

    // Parse pagination params
    const limitNum = Math.min(parseInt(limit, 10) || 100, 5000); // Max 5k rows
    let offsetNum = parseInt(offset, 10) || 0;
    
    // If page parameter is provided, convert it to offset
    if (page) {
      const pageNum = parseInt(page, 10);
      if (pageNum > 0) {
        offsetNum = (pageNum - 1) * limitNum;
      }
    }

    // Log API request
    if (monthsParam) {
      console.log(`[API] Fetching report ${reportId} with months[] parameter:`, monthsParam);
    }

    // Fetch ALL dimensions for this report to get dimension names
    const { data: dimensions, error: dimError } = await supabase
      .from('dimensions')
      .select('id, name, type')
      .eq('report_id', reportId)
      .order('name', { ascending: true });

    if (dimError) {
      console.warn('[API] Error fetching dimensions (continuing without dimension names):', dimError);
    }

    // Create mappings: ID -> Name, ID -> SnakeName, Name -> ID, and SnakeName -> ID
    const dimensionIdToName = {};
    const dimensionIdToSnakeName = {};
    const dimensionNameToId = {};
    const dimensionSnakeNameToId = {};  // NEW: For groupby/breakdownby parameter lookups
    const dimensionsMetadata = [];
    let dateDimensionId = null;

    // If dimensions are available, create mappings
    if (dimensions && dimensions.length > 0) {
      dimensions.forEach(dim => {
        const snakeName = toSnakeCase(dim.name);
        dimensionIdToName[dim.id] = dim.name;
        dimensionIdToSnakeName[dim.id] = snakeName;
        dimensionNameToId[dim.name] = dim.id;
        dimensionSnakeNameToId[snakeName] = dim.id;  // NEW
        dimensionsMetadata.push({
          id: dim.id,
          name: dim.name,
          snakeName: snakeName,
          type: dim.type
        });
        if (dim.type === 'date' && !dateDimensionId) {
          dateDimensionId = dim.id;
        }
      });
      console.log(`[API] Found ${dimensions.length} dimensions, date dimension: ${dateDimensionId}`);
    } else {
      console.log(`[API] No dimensions metadata found - attempting fallback to column_mappings`);
      
      // Fallback: Try to get dimension names from data_sources column_mappings
      const { data: dataSources, error: dsError } = await supabase
        .from('data_sources')
        .select('id, column_mappings')
        .eq('report_id', reportId);
      
      if (!dsError && dataSources && dataSources.length > 0) {
        // Extract dimension names from column mappings
        const mappingsFound = new Set();
        
        dataSources.forEach(ds => {
          const mappings = ds.column_mappings || [];
          mappings.forEach(mapping => {
            // Get dimension name from mapping (either dimensionName or newDimensionName)
            const dimName = mapping.dimensionName || mapping.newDimensionName;
            const dimId = mapping.dimensionId;
            const dimType = mapping.dimensionType || mapping.newDimensionType || 'text';
            
            if (dimId && dimName && dimId !== 'none' && dimId !== 'create_new' && !mappingsFound.has(dimId)) {
              mappingsFound.add(dimId);
              const snakeName = toSnakeCase(dimName);
              dimensionIdToName[dimId] = dimName;
              dimensionIdToSnakeName[dimId] = snakeName;
              dimensionNameToId[dimName] = dimId;
              dimensionSnakeNameToId[snakeName] = dimId;  // NEW
              dimensionsMetadata.push({
                id: dimId,
                name: dimName,
                snakeName: snakeName,
                type: dimType
              });
              
              // Auto-detect date dimension
              if (dimType === 'date' && !dateDimensionId) {
                dateDimensionId = dimId;
              }
            }
          });
        });
        
        console.log(`[API] Found ${mappingsFound.size} dimensions from column_mappings`);
        
        // Add name-based date dimension detection
        if (!dateDimensionId) {
          for (const [dimId, dimName] of Object.entries(dimensionIdToName)) {
            if (/date/i.test(dimName)) {
              dateDimensionId = dimId;
              console.log(`[API] Date dimension detected by name: ${dimName} (${dimId})`);
              break;
            }
          }
        }
        
        // If still no date dimension, sample data to detect it
        if (!dateDimensionId && Object.keys(dimensionIdToName).length > 0) {
          console.log('[API] Attempting date dimension detection from data samples...');
          
          const { data: sampleRows, error: sampleError } = await supabase
            .from('dimension_data')
            .select('dimension_values')
            .eq('report_id', reportId)
            .limit(10);
          
          if (!sampleError && sampleRows && sampleRows.length > 0) {
            for (const [dimId, dimName] of Object.entries(dimensionIdToName)) {
              let dateValueCount = 0;
              
              for (const row of sampleRows) {
                const value = row.dimension_values?.[dimId];
                if (value && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
                  dateValueCount++;
                }
              }
              
              // If 80%+ values are dates, this is the date dimension
              if (dateValueCount >= 8) {
                dateDimensionId = dimId;
                console.log(`[API] Date dimension auto-detected from data: ${dimName} (${dimId}) - ${dateValueCount}/10 values match date format`);
                break;
              }
            }
          }
        }
      }
      
      // If still no dimensions found, try to detect from data
      if (Object.keys(dimensionIdToName).length === 0) {
        console.log(`[API] No column_mappings found - will attempt to auto-detect date dimension from data`);
        
        // Auto-detect date dimension by sampling data
        const { data: sampleRows, error: sampleError } = await supabase
          .from('dimension_data')
          .select('dimension_values')
          .eq('report_id', reportId)
          .limit(10);
        
        if (!sampleError && sampleRows && sampleRows.length > 0) {
          // Get all dimension IDs from the first row
          const dimensionIds = Object.keys(sampleRows[0].dimension_values || {});
          
          // Check each dimension to see if it contains date-like values
          for (const dimId of dimensionIds) {
            let dateValueCount = 0;
            let totalValues = 0;
            
            for (const row of sampleRows) {
              const value = row.dimension_values[dimId];
              if (value) {
                totalValues++;
                // Check if value looks like a date (YYYY-MM-DD format)
                if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
                  dateValueCount++;
                }
              }
            }
            
            // If >80% of values look like dates, assume this is the date dimension
            if (totalValues > 0 && (dateValueCount / totalValues) > 0.8) {
              dateDimensionId = dimId;
              
              // If we don't have metadata for this dimension yet, add it
              if (!dimensionIdToName[dimId]) {
                const snakeName = toSnakeCase('Date');
                dimensionIdToName[dimId] = 'Date';
                dimensionIdToSnakeName[dimId] = snakeName;
                dimensionNameToId['Date'] = dimId;
                dimensionsMetadata.push({
                  id: dimId,
                  name: 'Date',
                  snakeName: snakeName,
                  type: 'date'
                });
              }
              
              console.log(`[API] Auto-detected date dimension: ${dimId} (${dateValueCount}/${totalValues} values are dates)`);
              break;
            }
          }
          
          if (!dateDimensionId) {
            console.log(`[API] Could not auto-detect date dimension from ${dimensionIds.length} dimensions`);
          }
        }
      }
    }

    // Process months[] parameter if provided (ALTERNATIVE to date_start/date_end)
    let multipleRanges = [];
    let useMonthsParam = false;
    
    if (monthsParam && Array.isArray(monthsParam) && monthsParam.length > 0) {
      useMonthsParam = true;
      // Validate and convert each month to a date range
      for (const month of monthsParam) {
        const range = getDateRangeForMonth(month);
        if (!range) {
          return res.status(400).json({
        success: false,
            error: `Invalid month format: ${month}. Expected format: YYYY-MM (e.g., 2024-01)`,
        count: 0,
        data: []
      });
    }
        multipleRanges.push(range);
      }
      console.log(`[API] Using months[] parameter with ${multipleRanges.length} date ranges:`, multipleRanges);
    }

    // Calculate date ranges (legacy date_start/date_end logic)
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-11
    const currentDate = now.getDate();

    // Calculate first day of last month
    const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    
    // Format as YYYY-MM-DD
    const formatDate = (date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // Use query params or defaults (only if not using months[] parameter)
    const currentFromDate = date_from || date_start || formatDate(new Date(lastMonthYear, lastMonth, 1));
    const currentToDate = date_to || date_end || formatDate(new Date(currentYear, currentMonth, currentDate));
    
    // Comparison period: Same range shifted back 1 year
    const comparisonFromDate = new Date(currentFromDate);
    comparisonFromDate.setFullYear(comparisonFromDate.getFullYear() - 1);
    const comparisonToDate = new Date(currentToDate);
    comparisonToDate.setFullYear(comparisonToDate.getFullYear() - 1);

    const dateRanges = {
      current: {
        date_from: currentFromDate,
        date_to: currentToDate,
      },
      comparison: {
        date_from: formatDate(comparisonFromDate),
        date_to: formatDate(comparisonToDate),
      },
    };

    console.log(`[API] Date ranges (legacy):`, dateRanges);

    // Function to fetch data for a specific period (single range)
    const fetchDataForPeriod = async (dateFrom, dateTo) => {
      if (!dateDimensionId) {
        // No date dimension, fetch all data
        const { data: dimensionData, error: dataError } = await supabase
          .from('dimension_data')
          .select('dimension_values, row_number, data_source_id')
          .eq('report_id', reportId)
          .order('row_number', { ascending: true });

        if (dataError) {
          throw dataError;
        }
        return dimensionData || [];
      }

      // Make dateTo inclusive by adding one day
      const toDate = new Date(dateTo);
      const adjustedToDate = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1);
      const adjustedToDateStr = adjustedToDate.toISOString().split('T')[0];
      
      const { data: dimensionData, error: dataError } = await supabase
        .from('dimension_data')
        .select('dimension_values, row_number, data_source_id')
        .eq('report_id', reportId)
        .gte(`dimension_values->>${dateDimensionId}`, dateFrom)
        .lt(`dimension_values->>${dateDimensionId}`, adjustedToDateStr)
        .order('row_number', { ascending: true });

      if (dataError) {
        throw dataError;
      }

      return dimensionData || [];
    };

    // Function to fetch data for multiple date ranges with OR logic
    const fetchDataForMultipleRanges = async (ranges) => {
      if (!dateDimensionId) {
        // No date dimension, fetch all data
        const { data: dimensionData, error: dataError } = await supabase
          .from('dimension_data')
          .select('dimension_values, row_number, data_source_id')
          .eq('report_id', reportId)
          .order('row_number', { ascending: true });

        if (dataError) {
          throw dataError;
        }
        return dimensionData || [];
      }

      // Fetch data for each range and combine (union)
      const allResults = [];
      const seenRowIds = new Set();

      for (const range of ranges) {
        const toDate = new Date(range.date_to);
        const adjustedToDate = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() + 1);
        const adjustedToDateStr = adjustedToDate.toISOString().split('T')[0];
        
        const { data: dimensionData, error: dataError } = await supabase
          .from('dimension_data')
          .select('dimension_values, row_number, data_source_id')
          .eq('report_id', reportId)
          .gte(`dimension_values->>${dateDimensionId}`, range.date_from)
          .lt(`dimension_values->>${dateDimensionId}`, adjustedToDateStr)
          .order('row_number', { ascending: true });

        if (dataError) {
          throw dataError;
        }

        // Add to results, avoiding duplicates based on row_number + data_source_id
        if (dimensionData) {
          dimensionData.forEach(row => {
            const rowId = `${row.row_number}_${row.data_source_id}`;
            if (!seenRowIds.has(rowId)) {
              seenRowIds.add(rowId);
              allResults.push(row);
            }
          });
        }
      }

      return allResults;
    };

    // Fetch data based on parameter type (months[] vs date_start/date_end)
    let currentData = [];
    let comparisonData = [];

    if (useMonthsParam) {
      // Use new months[] parameter - fetch data for multiple date ranges
      currentData = await fetchDataForMultipleRanges(multipleRanges);
      console.log(`[API] Fetched ${currentData.length} rows for ${multipleRanges.length} month ranges using months[] parameter`);
    } else {
      // Use legacy date_start/date_end parameter logic
      if (period === 'comparison') {
        comparisonData = await fetchDataForPeriod(dateRanges.comparison.date_from, dateRanges.comparison.date_to);
        console.log(`[API] Fetched ${comparisonData.length} rows for comparison period`);
      } else if (period === 'both' && dateDimensionId) {
        [currentData, comparisonData] = await Promise.all([
          fetchDataForPeriod(dateRanges.current.date_from, dateRanges.current.date_to),
          fetchDataForPeriod(dateRanges.comparison.date_from, dateRanges.comparison.date_to)
        ]);
        console.log(`[API] Fetched ${currentData.length} rows for current period, ${comparisonData.length} rows for comparison period`);
      } else {
        // Default: current period only
        currentData = await fetchDataForPeriod(dateRanges.current.date_from, dateRanges.current.date_to);
        console.log(`[API] Fetched ${currentData.length} rows for current period`);
      }
    }

    // Combine data from all periods
    const allData = [];
    
    // Add current period data
    currentData.forEach((row) => {
        allData.push({
          period: 'current',
        date_from: dateRanges.current.date_from,
        date_to: dateRanges.current.date_to,
        row_number: row.row_number,
        data_source_id: row.data_source_id,
        dimension_values: row.dimension_values
        });
      });

    // Add comparison period data
    comparisonData.forEach((row) => {
        allData.push({
          period: 'comparison',
        date_from: dateRanges.comparison.date_from,
        date_to: dateRanges.comparison.date_to,
        row_number: row.row_number,
        data_source_id: row.data_source_id,
        dimension_values: row.dimension_values
        });
      });

    // Apply dimension filters (filter by dimension name, not ID)
    let filteredData = allData;
    if (Object.keys(dimensionFilters).length > 0) {
      filteredData = allData.filter(row => {
        // Check each filter
        for (const [filterName, filterValue] of Object.entries(dimensionFilters)) {
          // Skip pagination, date params, and months[] param
          if (['limit', 'offset', 'page', 'date_from', 'date_start', 'date_to', 'date_end', 'period', 'months[]'].includes(filterName)) {
            continue;
          }

          // Get dimension ID from name
          const dimensionId = dimensionNameToId[filterName];
          if (!dimensionId) {
            continue; // Unknown dimension name, skip
          }

          // Get value from row
          const rowValue = row.dimension_values[dimensionId];
          
          // Check if value matches filter (case-insensitive)
          const rowValueStr = String(rowValue || '').toLowerCase();
          const filterValueStr = String(filterValue).toLowerCase();
          
          if (!rowValueStr.includes(filterValueStr)) {
            return false; // Filter doesn't match
          }
        }
        return true; // All filters match
      });

      console.log(`[API] Filtered from ${allData.length} to ${filteredData.length} rows`);
    }

    // Aggregation logic: Group data if groupby is specified
    let totalCount = filteredData.length;
    
    if (groupby) {
      console.log(`[API] Aggregating data by ${groupby}${breakdownby.length ? ` with breakdowns: ${breakdownby.join(', ')}` : ''}`);
      
      // Convert groupby to dimension ID (using snake_case lookup)
      const groupByDimId = dimensionSnakeNameToId[groupby] || 
                           dimensionNameToId[groupby] || 
                           Object.entries(dimensionIdToSnakeName)
                             .find(([id, name]) => name === groupby)?.[0];
      
      if (!groupByDimId) {
        return res.status(400).json({
          success: false,
          error: `Invalid groupby dimension: ${groupby}. Available dimensions: ${Object.keys(dimensionSnakeNameToId).join(', ')}`,
          count: 0,
          data: []
        });
      }
      
      // Convert breakdown dimensions to IDs (using snake_case lookup)
      const breakdownDimIds = breakdownby.map(bd => {
        return dimensionSnakeNameToId[bd] || 
               dimensionNameToId[bd] || 
               Object.entries(dimensionIdToSnakeName)
                 .find(([id, name]) => name === bd)?.[0];
      }).filter(Boolean);
      
      // Validate all breakdown dimensions
      if (breakdownby.length !== breakdownDimIds.length) {
        return res.status(400).json({
          success: false,
          error: 'One or more invalid breakdownby dimensions',
          count: 0,
          data: []
        });
      }
      
      // Group and aggregate data
      const grouped = {};
      
      filteredData.forEach(row => {
        const groupValue = row.dimension_values[groupByDimId] || 'Unknown';
        const groupKey = String(groupValue);
        
        if (!grouped[groupKey]) {
          // Initialize group
          grouped[groupKey] = {
            [groupby]: groupValue,
            count: 0,
            _clicks: 0,      // Track for CR calculation
            _conversions: 0  // Track for CR calculation
          };
          
          // Initialize all summable fields to 0
          summableFields.forEach(field => {
            const fieldSnakeName = field.toLowerCase().replace(/\s+/g, '_');
            grouped[groupKey][fieldSnakeName] = 0;
          });
          
          // Initialize breakdown structure if dimensions specified
          if (breakdownDimIds.length > 0) {
            grouped[groupKey].breakdown = {};
          }
        }
        
        grouped[groupKey].count++;
        
        // Sum numeric fields at group level
        for (const [dimId, value] of Object.entries(row.dimension_values || {})) {
          const snakeName = dimensionIdToSnakeName[dimId];
          if (snakeName && summableFields.some(f => f.toLowerCase().replace(/\s+/g, '_') === snakeName)) {
            const numValue = parseFloat(value) || 0;
            grouped[groupKey][snakeName] = (grouped[groupKey][snakeName] || 0) + numValue;
            
            // Track clicks/conversions for CR calculation
            if (snakeName === 'clicks') grouped[groupKey]._clicks += numValue;
            if (snakeName === 'conversions') grouped[groupKey]._conversions += numValue;
          }
        }
        
        // Handle multi-level breakdown
        if (breakdownDimIds.length > 0) {
          // Build composite key from all breakdown dimensions
          const breakdownValues = breakdownDimIds.map(bdId => 
            row.dimension_values[bdId] || 'Unknown'
          );
          const breakdownKey = breakdownValues.join('|');
          
          if (!grouped[groupKey].breakdown[breakdownKey]) {
            grouped[groupKey].breakdown[breakdownKey] = {
              count: 0,
              _clicks: 0,
              _conversions: 0
            };
            
            // Add breakdown dimension values
            breakdownby.forEach((bdName, idx) => {
              grouped[groupKey].breakdown[breakdownKey][bdName] = breakdownValues[idx];
            });
            
            // Initialize summable fields
            summableFields.forEach(field => {
              const fieldSnakeName = field.toLowerCase().replace(/\s+/g, '_');
              grouped[groupKey].breakdown[breakdownKey][fieldSnakeName] = 0;
            });
          }
          
          grouped[groupKey].breakdown[breakdownKey].count++;
          
          // Sum numeric fields at breakdown level
          for (const [dimId, value] of Object.entries(row.dimension_values || {})) {
            const snakeName = dimensionIdToSnakeName[dimId];
            if (snakeName && summableFields.some(f => f.toLowerCase().replace(/\s+/g, '_') === snakeName)) {
              const numValue = parseFloat(value) || 0;
              grouped[groupKey].breakdown[breakdownKey][snakeName] = 
                (grouped[groupKey].breakdown[breakdownKey][snakeName] || 0) + numValue;
              
              // Track clicks/conversions for CR calculation
              if (snakeName === 'clicks') grouped[groupKey].breakdown[breakdownKey]._clicks += numValue;
              if (snakeName === 'conversions') grouped[groupKey].breakdown[breakdownKey]._conversions += numValue;
            }
          }
        }
      });
      
      // Convert grouped object to array and calculate conversion_rate
      filteredData = Object.values(grouped).map(item => {
        // Calculate CR at group level
        item.conversion_rate = calculateConversionRate(item._conversions, item._clicks);
        delete item._clicks;
        delete item._conversions;
        
        // Convert breakdown to array and calculate CR at breakdown level
        if (item.breakdown) {
          item.breakdown = Object.values(item.breakdown).map(bd => {
            bd.conversion_rate = calculateConversionRate(bd._conversions, bd._clicks);
            delete bd._clicks;
            delete bd._conversions;
            return bd;
          });
        }
        
        return item;
      });
      
      // Update total count after aggregation
      totalCount = filteredData.length;
      console.log(`[API] Aggregated to ${totalCount} groups`);
    }

    // Apply pagination AFTER aggregation
    const paginatedData = filteredData.slice(offsetNum, offsetNum + limitNum);

    // Transform data: Replace dimension IDs with snake_case names
    // Skip transformation if data is already aggregated
    const transformedData = groupby ? paginatedData : paginatedData.map((row, index) => {
      const transformed = {
        id: `${reportId}_${row.period}_${row.row_number || offsetNum + index + 1}`,
        row_number: row.row_number || offsetNum + index + 1,
        data_source_id: row.data_source_id,
        period: row.period,
        date_from: row.date_from,
        date_to: row.date_to
      };

      // Replace dimension IDs with snake_case dimension names
      for (const [dimId, value] of Object.entries(row.dimension_values || {})) {
        // Use snake_case name if available, otherwise fall back to original name or ID
        const snakeName = dimensionIdToSnakeName[dimId] || toSnakeCase(dimensionIdToName[dimId]) || dimId;
        transformed[snakeName] = value;
      }

      return transformed;
    });

    console.log(`[API] Returning ${transformedData.length} of ${totalCount} rows for report: ${reportId}`);

    // Calculate pagination metadata
    const currentPage = page ? parseInt(page, 10) : Math.floor(offsetNum / limitNum) + 1;
    const totalPages = Math.ceil(totalCount / limitNum);
    const hasMore = offsetNum + limitNum < totalCount;
    const hasPrevious = offsetNum > 0;

    // Format JSON response
    return res.status(200).json({
      success: true,
      count: transformedData.length,
      total: totalCount,
      data: transformedData,
      pagination: {
        page: currentPage,
        limit: limitNum,
        offset: offsetNum,
        total: totalCount,
        totalPages: totalPages,
        hasMore: hasMore,
        hasPrevious: hasPrevious
      },
      periods: useMonthsParam ? {
        months: multipleRanges.map(r => ({ date_from: r.date_from, date_to: r.date_to })),
        count: currentData.length
      } : {
        current: currentData.length > 0 ? {
          date_from: dateRanges.current.date_from,
          date_to: dateRanges.current.date_to,
          count: currentData.length
        } : null,
        comparison: comparisonData.length > 0 ? {
          date_from: dateRanges.comparison.date_from,
          date_to: dateRanges.comparison.date_to,
          count: comparisonData.length
        } : null
      },
      dimensions: dimensionsMetadata.map(d => ({
        id: d.id,
        name: d.name,           // Original name: "Hotel Name"
        snake_name: d.snakeName, // API name: "hotel_name"
        type: d.type
      }))
    });

  } catch (error) {
    console.error('[API] Fatal error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({
      success: false,
      error: errorMessage,
      count: 0,
      data: []
    });
  }
});

/**
 * API endpoint for pre-aggregated master report data
 * Format: /api/reports/:reportId/aggregates
 * 
 * Returns pre-aggregated data from master_report_daily_aggregates and
 * master_report_monthly_aggregates tables for fast loading.
 * 
 * Query parameters:
 * - dateTab: 'this_month' | 'last_month' | 'ytd' (default: 'this_month')
 * - groupByDimensionId: UUID of the dimension to group by (required)
 * - selectedValues: Comma-separated list of group values to filter (optional)
 * - selectedMetrics: Comma-separated list of metrics to return (optional)
 */
app.get('/api/reports/:reportId/aggregates', async (req, res) => {
  try {
    const { reportId } = req.params;
    const { dateTab = 'this_month', groupByDimensionId, selectedValues, selectedMetrics } = req.query;
    
    if (!reportId) {
      return res.status(400).json({
        success: false,
        error: 'reportId is required',
        data: []
      });
    }
    
    if (!groupByDimensionId) {
      return res.status(400).json({
        success: false,
        error: 'groupByDimensionId is required',
        data: []
      });
    }
    
    if (!supabase) {
      return res.status(500).json({
        success: false,
        error: 'Server configuration error: Supabase client not initialized',
        data: []
      });
    }
    
    // Parse date range based on dateTab
    const now = new Date();
    let startDate, endDate, useMonthly = false;
    
    switch (dateTab) {
      case 'this_month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = now;
        useMonthly = false;
        break;
      case 'last_month':
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        startDate = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
        endDate = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);
        useMonthly = true;
        break;
      case 'ytd':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = now;
        useMonthly = true;
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'Invalid dateTab. Must be one of: this_month, last_month, ytd',
          data: []
        });
    }
    
    // Build query
    let query;
    if (useMonthly) {
      const startYearMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
      const endYearMonth = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}`;
      
      query = supabase
        .from('master_report_monthly_aggregates')
        .select('*')
        .eq('report_id', reportId)
        .eq('group_by_dimension_id', groupByDimensionId)
        .gte('year_month', startYearMonth)
        .lte('year_month', endYearMonth);
    } else {
      const startDateStr = startDate.toISOString().split('T')[0];
      const endDateStr = endDate.toISOString().split('T')[0];
      
      query = supabase
        .from('master_report_daily_aggregates')
        .select('*')
        .eq('report_id', reportId)
        .eq('group_by_dimension_id', groupByDimensionId)
        .gte('date', startDateStr)
        .lte('date', endDateStr);
    }
    
    // Filter by selected values if provided
    if (selectedValues && typeof selectedValues === 'string') {
      const values = selectedValues.split(',').map(v => v.trim());
      query = query.in('group_by_value', values);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('[API-AGGREGATES] Error fetching aggregates:', error);
      return res.status(500).json({
        success: false,
        error: error.message,
        data: []
      });
    }
    
    // Group by group_by_value and sum metrics
    const grouped: Record<string, {
      cost: number;
      revenue: number;
      clicks: number;
      impressions: number;
      conversions: number;
      bookings: number;
    }> = {};
    
    for (const row of data || []) {
      const groupValue = row.group_by_value;
      if (!grouped[groupValue]) {
        grouped[groupValue] = {
          cost: 0,
          revenue: 0,
          clicks: 0,
          impressions: 0,
          conversions: 0,
          bookings: 0,
        };
      }
      
      grouped[groupValue].cost += parseFloat(row.cost || '0') || 0;
      grouped[groupValue].revenue += parseFloat(row.revenue || '0') || 0;
      grouped[groupValue].clicks += parseFloat(row.clicks || '0') || 0;
      grouped[groupValue].impressions += parseFloat(row.impressions || '0') || 0;
      grouped[groupValue].conversions += parseFloat(row.conversions || '0') || 0;
      grouped[groupValue].bookings += parseFloat(row.bookings || '0') || 0;
    }
    
    // Parse selected metrics
    const metrics = selectedMetrics && typeof selectedMetrics === 'string'
      ? selectedMetrics.split(',').map(m => m.trim())
      : ['Cost', 'Revenue', 'ROAS', 'Conversions'];
    
    // Convert to response format
    const result = Object.entries(grouped).map(([groupValue, base]) => {
      const rowData: Record<string, any> = {
        groupValue,
      };
      
      // Add base metrics
      if (metrics.includes('Cost')) rowData.Cost = base.cost;
      if (metrics.includes('Revenue')) rowData.Revenue = base.revenue;
      if (metrics.includes('Clicks')) rowData.Clicks = base.clicks;
      if (metrics.includes('Impressions')) rowData.Impressions = base.impressions;
      if (metrics.includes('Conversions')) rowData.Conversions = base.conversions;
      
      // Calculate derived metrics
      if (metrics.includes('ROAS')) {
        rowData.ROAS = base.cost > 0 ? base.revenue / base.cost : 0;
      }
      if (metrics.includes('CPC')) {
        rowData.CPC = base.clicks > 0 ? base.cost / base.clicks : 0;
      }
      if (metrics.includes('CTR')) {
        rowData.CTR = base.impressions > 0 ? (base.clicks / base.impressions) * 100 : 0;
      }
      if (metrics.includes('Conversion Rate')) {
        rowData['Conversion Rate'] = base.clicks > 0 ? (base.conversions / base.clicks) * 100 : 0;
      }
      
      return rowData;
    });
    
    // Sort by first metric descending
    if (result.length > 0 && metrics.length > 0) {
      const firstMetric = metrics[0];
      result.sort((a, b) => (b[firstMetric] || 0) - (a[firstMetric] || 0));
    }
    
    return res.status(200).json({
      success: true,
      count: result.length,
      dateTab,
      data: result
    });
    
  } catch (error) {
    console.error('[API-AGGREGATES] Fatal error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return res.status(500).json({
      success: false,
      error: errorMessage,
      data: []
    });
  }
});

// Serve static files from dist directory (for production)
if (process.env.NODE_ENV === 'production') {
  const distPath = join(__dirname, 'dist');
  
  // Check if dist directory exists
  if (existsSync(distPath)) {
    app.use(express.static(distPath));
    console.log('[SERVER] Serving static files from:', distPath);
    
    // Handle React Router - serve index.html for all non-API routes
    app.get('*', (req, res) => {
      // Don't serve index.html for API routes
      if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
      }
      const indexPath = join(distPath, 'index.html');
      res.sendFile(indexPath, (err) => {
        if (err) {
          console.error('[SERVER] Error serving index.html:', err);
          res.status(500).send('Error loading application');
        }
      });
    });
  } else {
    console.warn('[SERVER] dist directory not found, static file serving disabled');
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    supabaseConfigured: !!supabase
  });
});

/**
 * Webhook endpoint for Make.com to trigger workflows
 * This endpoint can be called by Make.com webhook module
 * Format: POST /api/webhooks/make
 */
app.post('/api/webhooks/make', async (req, res) => {
  try {
    const { event, reportId, data } = req.body;

    console.log('[WEBHOOK] Received Make.com webhook:', { event, reportId });

    // Validate webhook secret if configured
    const webhookSecret = process.env.MAKE_WEBHOOK_SECRET;
    const providedSecret = req.headers['x-webhook-secret'];
    
    if (webhookSecret && providedSecret !== webhookSecret) {
      return res.status(401).json({
        success: false,
        error: 'Invalid webhook secret'
      });
    }

    // Process webhook based on event type
    if (event === 'data_synced' && reportId) {
      // Trigger API data sync for the report
      // This could trigger a Make workflow or update data
      console.log(`[WEBHOOK] Data synced for report: ${reportId}`);
      
      return res.status(200).json({
        success: true,
        message: 'Webhook received',
        event,
        reportId,
        timestamp: new Date().toISOString()
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Webhook received',
      event,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[WEBHOOK] Error processing webhook:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get Make.com scenario blueprint template
 * This can be used to get a blueprint from an existing scenario and modify it
 * Format: GET /api/make/get-blueprint/:scenarioId
 */
app.get('/api/make/get-blueprint/:scenarioId', async (req, res) => {
  try {
    const { scenarioId } = req.params;
    const { makeApiToken, makeRegion = 'us1' } = req.query;

    if (!makeApiToken) {
      return res.status(400).json({
        success: false,
        error: 'makeApiToken query parameter is required'
      });
    }

    const makeApiUrl = `https://${makeRegion}.make.com/api/v2/scenarios/${scenarioId}/blueprint`;
    
    const response = await fetch(makeApiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Token ${makeApiToken}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        success: false,
        error: 'Failed to get blueprint',
        details: errorText
      });
    }

    const blueprint = await response.json();

    return res.status(200).json({
      success: true,
      blueprint
    });

  } catch (error) {
    console.error('[MAKE-API] Error getting blueprint:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Create a Make.com scenario for report analysis
 * Format: POST /api/make/create-scenario
 * Body: { reportId, reportName, makeApiToken, teamId, slackChannel, claudeApiKey }
 */
app.post('/api/make/create-scenario', async (req, res) => {
  try {
    const { 
      reportId, 
      reportName, 
      makeApiToken, 
      teamId, 
      slackChannel,
      slackWebhookUrl,
      claudeApiKey,
      makeRegion = 'us1' // 'us1' or 'eu1'
    } = req.body;

    if (!reportId || !reportName || !makeApiToken || !teamId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        required: ['reportId', 'reportName', 'makeApiToken', 'teamId']
      });
    }

    console.log(`[MAKE-API] Creating scenario for report: ${reportId}`);

    // Generate scenario blueprint
    const blueprint = generateMakeScenarioBlueprint({
      reportId,
      reportName,
      slackChannel: slackChannel || '#data-reports',
      slackWebhookUrl,
      claudeApiKey
    });

    // Note: This endpoint now uses Make MCP instead of direct API
    // The actual MCP call should be made from the client or via MCP server
    // For now, return the blueprint structure for manual creation or MCP usage
    
    console.log(`[MAKE-API] Generated blueprint for report: ${reportId}`);

    return res.status(200).json({
      success: true,
      message: 'Blueprint generated. Use Make MCP to create the scenario.',
      blueprint: blueprint,
      instructions: {
        teamId: parseInt(teamId),
        scheduling: {
          enabled: false
        },
        note: 'Use mcp_make_scenarios_create with this blueprint'
      }
    });

  } catch (error) {
    console.error('[MAKE-API] Error creating scenario:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Generate Make.com scenario blueprint for report analysis workflow
 * Note: Make.com blueprint format is complex. This creates a basic structure.
 * You may need to adjust based on Make.com's actual API response format.
 */
function generateMakeScenarioBlueprint({ reportId, reportName, slackChannel, slackWebhookUrl, claudeApiKey }) {
  const baseUrl = process.env.VITE_API_BASE_URL || process.env.API_BASE_URL || 'https://yourdomain.com';
  
  // Make.com blueprint structure (simplified - actual format may vary)
  return {
    version: 1,
    name: `Data Studio Report Analysis - ${reportName}`,
    flow: [
      {
        id: 1,
        type: 'webhooks',
        name: 'Custom webhook',
        position: [250, 300],
        parameters: {
          hook: 'custom',
          path: `report-analysis-${reportId.substring(0, 8)}`
        },
        metadata: {
          label: 'Webhook Trigger'
        }
      },
      {
        id: 2,
        type: 'http',
        name: 'Get Last 7 Days Data',
        position: [450, 300],
        parameters: {
          method: 'GET',
          url: `${baseUrl}/api/make/reports/${reportId}/last-7-days`,
          headers: [
            {
              key: 'x-api-key',
              value: '{{apiKey}}' // Will need to be set in Make.com
            }
          ]
        },
        metadata: {
          label: 'Fetch Report Data'
        },
        connections: {
          outgoing: [
            {
              moduleId: 3
            }
          ]
        }
      },
      {
        id: 3,
        type: 'anthropic',
        name: 'Claude AI Analysis',
        position: [650, 300],
        parameters: {
          model: 'claude-3-5-sonnet-20241022',
          system: 'You are a data analyst specializing in marketing performance data. Analyze the provided data and create a concise, actionable summary focusing on key insights, trends, and recommendations.',
          messages: [
            {
              role: 'user',
              content: `Analyze the following marketing performance data from the last 7 days:

Report: ${reportName}
Date Range: {{2.dateRange.from}} to {{2.dateRange.to}}
Total Records: {{2.count}}

Data:
{{2.data}}

Please provide:
1. Key performance metrics summary
2. Notable trends or changes
3. Top performing channels/campaigns
4. Areas of concern or opportunities
5. Actionable recommendations

Format the response in a clear, structured way suitable for a Slack message.`
            }
          ]
        },
        metadata: {
          label: 'AI Analysis'
        },
        connections: {
          outgoing: [
            {
              moduleId: 4
            }
          ]
        }
      },
      {
        id: 4,
        type: slackWebhookUrl ? 'http' : 'slack',
        name: slackWebhookUrl ? 'Send to Slack (Webhook)' : 'Send to Slack',
        position: [850, 300],
        parameters: slackWebhookUrl ? {
          method: 'POST',
          url: slackWebhookUrl,
          body: JSON.stringify({
            text: `📊 *Data Studio Report Analysis - Last 7 Days*\n\n*Report:* ${reportName}\n*Date Range:* {{2.dateRange.from}} to {{2.dateRange.to}}\n*Records Analyzed:* {{2.count}}\n\n---\n\n{{3.content[0].text}}\n\n---\n\n*Generated:* {{now}}`
          }),
          headers: [
            {
              key: 'Content-Type',
              value: 'application/json'
            }
          ]
        } : {
          channel: slackChannel || '#data-reports',
          text: `📊 *Data Studio Report Analysis - Last 7 Days*\n\n*Report:* ${reportName}\n*Date Range:* {{2.dateRange.from}} to {{2.dateRange.to}}\n*Records Analyzed:* {{2.count}}\n\n---\n\n{{3.content[0].text}}\n\n---\n\n*Generated:* {{now}}`
        },
        metadata: {
          label: 'Slack Notification'
        }
      }
    ]
  };
}

/**
 * Webhook endpoint that Make.com can call to trigger report analysis
 * This is the entry point for the Make.com workflow
 * Format: POST /api/webhooks/report-analysis/:reportId
 */
app.post('/api/webhooks/report-analysis/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;
    const { trigger, metadata } = req.body;

    console.log(`[WEBHOOK] Report analysis webhook triggered for report: ${reportId}`);

    // Validate webhook secret if configured
    const webhookSecret = process.env.MAKE_WEBHOOK_SECRET;
    const providedSecret = req.headers['x-webhook-secret'];
    
    if (webhookSecret && providedSecret !== webhookSecret) {
      return res.status(401).json({
        success: false,
        error: 'Invalid webhook secret'
      });
    }

    // Return success immediately (webhook should respond quickly)
    // The actual processing happens in Make.com
    return res.status(200).json({
      success: true,
      message: 'Webhook received, processing in Make.com',
      reportId,
      trigger: trigger || 'manual',
      timestamp: new Date().toISOString(),
      metadata: metadata || {}
    });

  } catch (error) {
    console.error('[WEBHOOK] Error processing report analysis webhook:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Root endpoint - redirect to health or show info
app.get('/', (req, res) => {
  // In production, this will be handled by static file serving
  // But if static files aren't available, show API info
  res.json({
    message: 'API Server is running',
    endpoints: {
      health: '/health',
      api: '/api/reports/:reportId',
      makeApi: '/api/make/reports/:reportId',
      webhook: '/api/webhooks/make'
    },
    timestamp: new Date().toISOString()
  });
});

// Global error handler for unhandled errors
process.on('uncaughtException', (err) => {
  console.error('[SERVER] ✗ Uncaught Exception:', err);
  // Don't exit - let the server continue running
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[SERVER] ✗ Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit - let the server continue running
});

// Start the server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[SERVER] ✓ Server running on port ${PORT}`);
  console.log(`[SERVER] ✓ API endpoint: http://localhost:${PORT}/api/reports/:reportId`);
  console.log(`[SERVER] ✓ Health check: http://localhost:${PORT}/health`);
  if (process.env.NODE_ENV === 'production') {
    console.log(`[SERVER] ✓ Production mode - serving static files`);
  } else {
    console.log(`[SERVER] ✓ Development mode`);
  }
});

server.on('error', (err) => {
  console.error('[SERVER] ✗ Failed to start server:', err);
  if (err.code === 'EADDRINUSE') {
    console.error(`[SERVER] Port ${PORT} is already in use. Try a different port.`);
  }
  process.exit(1);
});
