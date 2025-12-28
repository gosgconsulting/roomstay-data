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
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://zcxxwpwheevwavdcgfht.supabase.co';
// Use service role key for server-side access (bypasses RLS)
// Fallback to anon key if service role key is not available (for development)
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseServiceKey) {
  console.error('WARNING: SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY environment variable is not set');
  console.error('API endpoints may not work correctly without proper authentication');
  console.error('Continuing anyway for development purposes...');
}

let supabase;
if (supabaseServiceKey) {
  supabase = createClient(supabaseUrl, supabaseServiceKey);
  console.log('[SERVER] Supabase client initialized with URL:', supabaseUrl);
} else {
  // Create a dummy client that will fail gracefully
  supabase = null;
  console.log('[SERVER] Supabase client not initialized - missing credentials');
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
 */
app.get('/api/reports/:reportId', async (req, res) => {
  try {
    const { reportId } = req.params;

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

    console.log(`[API] Fetching data for report: ${reportId}`);

    // Fetch API data from report_api_data table
    const { data: apiData, error: fetchError } = await supabase
      .from('report_api_data')
      .select('period_type, date_from, date_to, data')
      .eq('report_id', reportId)
      .in('period_type', ['current', 'comparison']);

    if (fetchError) {
      console.error('[API] Error fetching data:', fetchError);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch data',
        details: fetchError.message,
        count: 0,
        data: []
      });
    }

    if (!apiData || apiData.length === 0) {
      console.log(`[API] No data found for report: ${reportId}`);
      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
        message: 'No data found for this report. Data may not have been synced yet.'
      });
    }

    // Separate current and comparison data
    const currentPeriodData = apiData.find(d => d.period_type === 'current');
    const comparisonPeriodData = apiData.find(d => d.period_type === 'comparison');

    // Format response similar to the example
    // Combine current and comparison data into a single array
    const allData = [];
    
    if (currentPeriodData && currentPeriodData.data) {
      currentPeriodData.data.forEach((row, index) => {
        allData.push({
          id: `${reportId}_current_${index}`,
          period: 'current',
          date_from: currentPeriodData.date_from,
          date_to: currentPeriodData.date_to,
          ...row.dimension_values,
          row_number: row.row_number || index + 1
        });
      });
    }

    if (comparisonPeriodData && comparisonPeriodData.data) {
      comparisonPeriodData.data.forEach((row, index) => {
        allData.push({
          id: `${reportId}_comparison_${index}`,
          period: 'comparison',
          date_from: comparisonPeriodData.date_from,
          date_to: comparisonPeriodData.date_to,
          ...row.dimension_values,
          row_number: row.row_number || index + 1
        });
      });
    }

    console.log(`[API] Returning ${allData.length} rows for report: ${reportId}`);

    // Format response like the example
    return res.status(200).json({
      success: true,
      count: allData.length,
      data: allData,
      periods: {
        current: currentPeriodData ? {
          date_from: currentPeriodData.date_from,
          date_to: currentPeriodData.date_to,
          count: currentPeriodData.data?.length || 0
        } : null,
        comparison: comparisonPeriodData ? {
          date_from: comparisonPeriodData.date_from,
          date_to: comparisonPeriodData.date_to,
          count: comparisonPeriodData.data?.length || 0
        } : null
      }
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
