import { supabase } from "@/integrations/supabase/client";
import { addDays, subDays, startOfMonth, endOfMonth, format } from "date-fns";

export interface DataDateRange {
  start: Date;
  end: Date;
  totalRows: number;
  hasRecentData: boolean;
  recommendedPreset: string;
}

export interface SmartDatePreset {
  key: string;
  label: string;
  dateRange: { from: Date; to: Date };
  description: string;
  priority: number;
}

export class SmartDateService {
  /**
   * Analyze actual data date range and recommend optimal default filter
   */
  static async analyzeDataDateRange(reportId: string): Promise<DataDateRange | null> {
    try {
      console.log('[SmartDate] Analyzing data date range for report:', reportId);

      // Get sample of dimension_data to find date dimension and range
      const { data: sampleData, error } = await supabase
        .from('dimension_data')
        .select('dimension_values')
        .eq('report_id', reportId)
        .order('row_number', { ascending: true })
        .limit(1000); // Sample to analyze date range

      if (error) throw error;
      if (!sampleData || sampleData.length === 0) {
        console.warn('[SmartDate] No data found for report');
        return null;
      }

      // Find the date dimension by looking for date-like values
      const sampleRow = sampleData[0].dimension_values as Record<string, any>;
      const dateKeys = Object.keys(sampleRow).filter(key => {
        const value = sampleRow[key];
        return value && typeof value === 'string' && !isNaN(Date.parse(value));
      });

      if (dateKeys.length === 0) {
        console.warn('[SmartDate] No date dimension found in data');
        return null;
      }

      const dateDimensionKey = dateKeys[0];
      console.log('[SmartDate] Found date dimension key:', dateDimensionKey);

      // Extract all dates to find actual range
      const dates = sampleData
        .map(row => {
          const values = row.dimension_values as Record<string, any>;
          return values[dateDimensionKey];
        })
        .filter(date => date && !isNaN(Date.parse(date)))
        .map(date => new Date(date))
        .sort((a, b) => a.getTime() - b.getTime());

      if (dates.length === 0) {
        console.warn('[SmartDate] No valid dates found in sample data');
        return null;
      }

      const startDate = dates[0];
      const endDate = dates[dates.length - 1];
      const now = new Date();

      // Check if we have recent data (within last 30 days)
      const hasRecentData = endDate >= subDays(now, 30);

      // Determine recommended preset based on data characteristics
      let recommendedPreset = 'last_7_days';
      
      if (!hasRecentData) {
        // Data is older, use the most recent 7 days of available data
        recommendedPreset = 'data_last_7_days';
      } else if (endDate < subDays(now, 7)) {
        // Data exists but not in last 7 days, use last available period
        recommendedPreset = 'data_recent';
      }

      console.log('[SmartDate] Data analysis complete:', {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        hasRecentData,
        recommendedPreset
      });

      return {
        start: startDate,
        end: endDate,
        totalRows: sampleData.length,
        hasRecentData,
        recommendedPreset
      };

    } catch (error) {
      console.error('[SmartDate] Error analyzing data date range:', error);
      return null;
    }
  }

  /**
   * Get smart date presets based on actual data availability
   */
  static async getSmartPresets(reportId: string): Promise<SmartDatePreset[]> {
    const dataRange = await this.analyzeDataDateRange(reportId);
    
    if (!dataRange) {
      // Fallback to standard presets if no data analysis available
      return this.getStandardPresets();
    }

    const { start, end, hasRecentData } = dataRange;
    const presets: SmartDatePreset[] = [];

    if (hasRecentData) {
      // Standard recent presets
      presets.push(
        {
          key: 'last_7_days',
          label: 'Last 7 days',
          dateRange: { from: subDays(new Date(), 7), to: new Date() },
          description: 'Most recent 7 days',
          priority: 1
        },
        {
          key: 'last_30_days', 
          label: 'Last 30 days',
          dateRange: { from: subDays(new Date(), 30), to: new Date() },
          description: 'Most recent 30 days',
          priority: 2
        }
      );
    }

    // Data-based presets
    const dataEndDate = end;
    const dataStartDate = start;
    
    presets.push(
      {
        key: 'data_last_7_days',
        label: 'Latest 7 days (data)',
        dateRange: { from: subDays(dataEndDate, 6), to: dataEndDate },
        description: `${format(subDays(dataEndDate, 6), 'MMM d')} - ${format(dataEndDate, 'MMM d, yyyy')}`,
        priority: hasRecentData ? 3 : 1
      },
      {
        key: 'data_last_30_days',
        label: 'Latest 30 days (data)', 
        dateRange: { from: subDays(dataEndDate, 29), to: dataEndDate },
        description: `${format(subDays(dataEndDate, 29), 'MMM d')} - ${format(dataEndDate, 'MMM d, yyyy')}`,
        priority: hasRecentData ? 4 : 2
      },
      {
        key: 'all_data',
        label: 'All available data',
        dateRange: { from: dataStartDate, to: dataEndDate },
        description: `${format(dataStartDate, 'MMM d')} - ${format(dataEndDate, 'MMM d, yyyy')}`,
        priority: 5
      }
    );

    return presets.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Get the optimal default date range for a report
   */
  static async getOptimalDateRange(reportId: string): Promise<{ from: Date; to: Date } | null> {
    try {
      const dataRange = await this.analyzeDataDateRange(reportId);
      
      if (!dataRange) {
        console.warn('[SmartDate] No data range found, using fallback');
        return null;
      }

      const { start, end, hasRecentData } = dataRange;

      if (hasRecentData) {
        // Use last 7 days if data is recent
        return { from: subDays(new Date(), 7), to: new Date() };
      } else {
        // Use the most recent 7 days of available data
        const optimalStart = subDays(end, 6);
        const optimalEnd = end;
        
        console.log('[SmartDate] Using data-based date range:', {
          from: optimalStart.toISOString().split('T')[0],
          to: optimalEnd.toISOString().split('T')[0]
        });

        return { from: optimalStart, to: optimalEnd };
      }
    } catch (error) {
      console.error('[SmartDate] Error getting optimal date range:', error);
      return null;
    }
  }

  /**
   * Standard fallback presets
   */
  private static getStandardPresets(): SmartDatePreset[] {
    const now = new Date();
    return [
      {
        key: 'last_7_days',
        label: 'Last 7 days',
        dateRange: { from: subDays(now, 7), to: now },
        description: 'Most recent 7 days',
        priority: 1
      },
      {
        key: 'last_30_days',
        label: 'Last 30 days', 
        dateRange: { from: subDays(now, 30), to: now },
        description: 'Most recent 30 days',
        priority: 2
      },
      {
        key: 'this_month',
        label: 'This month',
        dateRange: { from: startOfMonth(now), to: endOfMonth(now) },
        description: 'Current month',
        priority: 3
      }
    ];
  }

  /**
   * Check if current date range has data
   */
  static async hasDataInRange(reportId: string, from: Date, to: Date): Promise<boolean> {
    try {
      // Get date dimension ID
      const { data: dimensions, error: dimError } = await supabase
        .from('dimensions')
        .select('id, name, type')
        .eq('type', 'date')
        .limit(1)
        .maybeSingle();

      if (dimError || !dimensions) {
        console.warn('[SmartDate] No date dimension found');
        return false;
      }

      // Check if any data exists in the date range
      const fromStr = from.toISOString().split('T')[0];
      const toStr = to.toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('dimension_data')
        .select('id')
        .eq('report_id', reportId)
        .gte(`dimension_values->>${dimensions.id}`, fromStr)
        .lte(`dimension_values->>${dimensions.id}`, toStr)
        .limit(1);

      if (error) {
        console.warn('[SmartDate] Error checking data in range:', error);
        return false;
      }

      const hasData = data && data.length > 0;
      console.log(`[SmartDate] Data exists in range ${fromStr} to ${toStr}:`, hasData);
      
      return hasData;
    } catch (error) {
      console.error('[SmartDate] Error checking data in range:', error);
      return false;
    }
  }

  /**
   * Get the most recent date with data
   */
  static async getMostRecentDataDate(reportId: string): Promise<Date | null> {
    try {
      // Get date dimension
      const { data: dimensions, error: dimError } = await supabase
        .from('dimensions')
        .select('id, name, type')
        .eq('type', 'date')
        .limit(1)
        .maybeSingle();

      if (dimError || !dimensions) {
        console.warn('[SmartDate] No date dimension found');
        return null;
      }

      // Get the most recent date value
      const { data, error } = await supabase
        .from('dimension_data')
        .select(`dimension_values->>${dimensions.id} as date_value`)
        .eq('report_id', reportId)
        .not(`dimension_values->>${dimensions.id}`, 'is', null)
        .order(`dimension_values->>${dimensions.id}`, { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        console.warn('[SmartDate] No recent date found');
        return null;
      }

      const mostRecentDate = new Date(data.date_value);
      console.log('[SmartDate] Most recent data date:', mostRecentDate.toISOString().split('T')[0]);
      
      return mostRecentDate;
    } catch (error) {
      console.error('[SmartDate] Error getting most recent data date:', error);
      return null;
    }
  }
}
