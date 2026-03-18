import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SLIDE_REPORT_CACHE_ENABLED = Deno.env.get('SLIDE_REPORT_CACHE_ENABLED') === 'true';

// Channel to Report ID mapping for Brady Hotels
const CHANNEL_REPORT_IDS: Record<string, string> = {
  metasearch: '2eff17d0-38de-4d5d-a15b-69ad13788c92',
  sem: '3b2a0e45-33be-4eec-911e-b955b951c84e',
  social: '8c2f7db9-acbd-4c59-9593-74e8953e7787',
};

// Dimension IDs for each report (report-specific)
const DIMENSION_IDS = {
  metasearch: {
    date: 'a4cb2da4-d281-4c77-969a-7b048aa91287',
    hotel: '093ac487-dd90-4466-9972-ac51d110e91e',
    impressions: '89c229d9-8a6e-4d94-a0d2-a4b43b6f3fe1',
    clicks: '1caad3eb-3d5e-405c-9df7-1c96971171c5',
    cost: 'fb281b3f-c800-48f4-b34b-02d4f0244b07',
    revenue: '7f4cb2e9-52a3-4110-803a-58d2e7afacb5',
    bookings: '79aeb7f7-a9c6-43cd-bd05-ff7df81babf1',
  },
  sem: {
    date: '425eddda-29ff-468d-a107-08b0f3d6efb9', // Uses global Date dimension ID
    impressions: '33366963-8c93-48ea-b015-6e96228485af',
    clicks: '649a4929-32e3-4a95-a9e4-a1dbcdf70c68',
    cost: '8444ab3b-8ded-4290-9b50-7ddfee892290',
    revenue: '38544dae-6043-484a-8156-93675c9d60b6',
    bookings: '9376e877-5f79-473d-b90d-eb76ad6f4c35',
  },
  social: {
    date: '425eddda-29ff-468d-a107-08b0f3d6efb9', // Uses global Date dimension ID
    impressions: '33366963-8c93-48ea-b015-6e96228485af',
    clicks: '649a4929-32e3-4a95-a9e4-a1dbcdf70c68',
    cost: '8444ab3b-8ded-4290-9b50-7ddfee892290',
    revenue: '38544dae-6043-484a-8156-93675c9d60b6',
    bookings: '9376e877-5f79-473d-b90d-eb76ad6f4c35',
  },
};

interface MonthlyData {
  year: number;
  month: string;
  metasearch: number;
  sem: number;
  social: number;
}

interface ChannelMetrics {
  impressions: number;
  clicks: number;
  cost: number;
  revenue: number;
  bookings: number;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!SLIDE_REPORT_CACHE_ENABLED) {
    return new Response(JSON.stringify({
      error: 'get-slide-report-data is deprecated and disabled (set SLIDE_REPORT_CACHE_ENABLED=true to allow).',
    }), { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { accountId, years = [2024, 2025, 2026], hotelFilter } = await req.json();

    console.log('Fetching slide report data for account:', accountId, 'years:', years);

    const results: {
      monthlyRevenue: MonthlyData[];
      monthlyBudget: any[];
      channelTotals: Record<string, ChannelMetrics>;
      yearlyTotals: Record<number, Record<string, ChannelMetrics>>;
    } = {
      monthlyRevenue: [],
      monthlyBudget: [],
      channelTotals: {},
      yearlyTotals: {},
    };

    // Initialize monthly data structure for all years
    const monthlyMap: Record<string, MonthlyData> = {};
    for (const year of years) {
      for (let month = 0; month < 12; month++) {
        const key = `${year}-${String(month + 1).padStart(2, '0')}`;
        monthlyMap[key] = {
          year,
          month: MONTH_NAMES[month],
          metasearch: 0,
          sem: 0,
          social: 0,
        };
      }
    }

    // Fetch data for each channel
    for (const [channel, reportId] of Object.entries(CHANNEL_REPORT_IDS)) {
      const dimIds = DIMENSION_IDS[channel as keyof typeof DIMENSION_IDS];
      
      console.log(`Fetching ${channel} data from report ${reportId}...`);
      
      // Fetch dimension_data for this report
      const { data: rows, error } = await supabase
        .from('dimension_data')
        .select('dimension_values')
        .eq('report_id', reportId);

      if (error) {
        console.error(`Error fetching ${channel} data:`, error);
        continue;
      }

      console.log(`Got ${rows?.length || 0} rows for ${channel}`);

      // Process each row
      let channelTotal: ChannelMetrics = {
        impressions: 0,
        clicks: 0,
        cost: 0,
        revenue: 0,
        bookings: 0,
      };

      for (const row of rows || []) {
        const dv = row.dimension_values as Record<string, any>;
        const dateStr = dv[dimIds.date];
        
        if (!dateStr) continue;

        // Parse date and check if it's in the requested years
        const date = new Date(dateStr);
        const year = date.getFullYear();
        const month = date.getMonth();

        if (!years.includes(year)) continue;

        // For metasearch, optionally filter by hotel (Brady hotels only)
        if (channel === 'metasearch' && hotelFilter) {
          const hotel = dv[dimIds.hotel];
          if (hotel && !hotel.startsWith('Brady')) continue;
        }

        // Parse numeric values
        const impressions = parseFloat(dv[dimIds.impressions]) || 0;
        const clicks = parseFloat(dv[dimIds.clicks]) || 0;
        const cost = parseFloat(dv[dimIds.cost]) || 0;
        const revenue = parseFloat(dv[dimIds.revenue]) || 0;
        const bookings = parseFloat(dv[dimIds.bookings]) || 0;

        // Add to monthly totals
        const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
        if (monthlyMap[monthKey]) {
          monthlyMap[monthKey][channel as 'metasearch' | 'sem' | 'social'] += revenue;
        }

        // Add to channel totals
        channelTotal.impressions += impressions;
        channelTotal.clicks += clicks;
        channelTotal.cost += cost;
        channelTotal.revenue += revenue;
        channelTotal.bookings += bookings;

        // Add to yearly totals
        if (!results.yearlyTotals[year]) {
          results.yearlyTotals[year] = {};
        }
        if (!results.yearlyTotals[year][channel]) {
          results.yearlyTotals[year][channel] = {
            impressions: 0,
            clicks: 0,
            cost: 0,
            revenue: 0,
            bookings: 0,
          };
        }
        results.yearlyTotals[year][channel].impressions += impressions;
        results.yearlyTotals[year][channel].clicks += clicks;
        results.yearlyTotals[year][channel].cost += cost;
        results.yearlyTotals[year][channel].revenue += revenue;
        results.yearlyTotals[year][channel].bookings += bookings;
      }

      results.channelTotals[channel] = channelTotal;
      console.log(`${channel} totals:`, channelTotal);
    }

    // Convert monthly map to array sorted by date
    results.monthlyRevenue = Object.values(monthlyMap).sort((a, b) => {
      const aDate = new Date(`${a.year}-${MONTH_NAMES.indexOf(a.month) + 1}-01`);
      const bDate = new Date(`${b.year}-${MONTH_NAMES.indexOf(b.month) + 1}-01`);
      return aDate.getTime() - bDate.getTime();
    });

    // Generate budget data (placeholder - actual budget would come from a different source)
    results.monthlyBudget = results.monthlyRevenue.map(m => ({
      year: m.year,
      month: m.month,
      metasearchBudget: 0,
      semBudget: 0,
      socialBudget: 0,
      metasearchActual: 0, // Will be populated with actual cost data
      semActual: 0,
      socialActual: 0,
    }));

    console.log('Monthly revenue data count:', results.monthlyRevenue.length);
    console.log('Sample months:', results.monthlyRevenue.slice(0, 3));

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in get-slide-report-data:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});