import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
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

// Initialize Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || 'https://zcxxwpwheevwavdcgfht.supabase.co';
// Use service role key for server-side access (bypasses RLS)
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  console.error('This key is needed for server-side database access');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);
console.log('[SERVER] Supabase client initialized with URL:', supabaseUrl);

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
      currentPeriodData.data.forEach((row: any, index: number) => {
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
      comparisonPeriodData.data.forEach((row: any, index: number) => {
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
  app.use(express.static(distPath));
  
  // Handle React Router - serve index.html for all non-API routes
  app.get('*', (req, res) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(join(distPath, 'index.html'));
  });
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API endpoint: http://localhost:${PORT}/api/reports/:reportId`);
  if (process.env.NODE_ENV === 'production') {
    console.log(`Serving static files from: ${join(__dirname, 'dist')}`);
  }
});
