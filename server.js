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
if (supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey);
  console.log('[SERVER] Supabase client initialized with URL:', supabaseUrl);
  if (supabaseServiceKey === supabaseAnonKey) {
    console.log('[SERVER] Using anon key (development mode)');
} else {
    console.log('[SERVER] Using service role key or environment anon key');
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
