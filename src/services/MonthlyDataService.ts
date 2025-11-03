import { supabase } from "@/integrations/supabase/client";

export interface MonthlyDataSummary {
  year: number;
  month: number;
  rowCount: number;
  dateRangeStart: string;
  dateRangeEnd: string;
  dimensionValues: Record<string, string[]>;
  aggregatedMetrics: Record<string, number>;
  lastUpdated: string;
}

export interface MonthlyDataRequest {
  reportId: string;
  year: number;
  month: number;
  limit?: number;
  offset?: number;
}

export class MonthlyDataService {
  /**
   * Get available months for a report
   */
  static async getAvailableMonths(reportId: string): Promise<MonthlyDataSummary[]> {
    try {
      const { data, error } = await supabase
        .from('monthly_dimension_data')
        .select('*')
        .eq('report_id', reportId)
        .order('year', { ascending: false })
        .order('month', { ascending: false });

      if (error) throw error;

      return (data || []).map(row => ({
        year: row.year,
        month: row.month,
        rowCount: row.row_count,
        dateRangeStart: row.date_range_start,
        dateRangeEnd: row.date_range_end,
        dimensionValues: row.dimension_values || {},
        aggregatedMetrics: row.aggregated_metrics || {},
        lastUpdated: row.updated_at
      }));
    } catch (error) {
      console.error('Error getting available months:', error);
      return [];
    }
  }

  /**
   * Get raw data for a specific month
   */
  static async getMonthlyData(request: MonthlyDataRequest): Promise<any[]> {
    try {
      const { reportId, year, month, limit = 5000, offset = 0 } = request;

      // First, try to get from monthly_dimension_data if available
      const { data: monthlyData, error: monthlyError } = await supabase
        .from('monthly_dimension_data')
        .select('dimension_values')
        .eq('report_id', reportId)
        .eq('year', year)
        .eq('month', month)
        .maybeSingle();

      if (monthlyError && monthlyError.code !== 'PGRST116') {
        throw monthlyError;
      }

      // If monthly data exists, we could use it for aggregated views
      // For now, fall back to raw dimension_data with date filtering
      
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);

      console.log(`[MonthlyDataService] Loading data for ${year}-${String(month).padStart(2, '0')} (${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]})`);

      // Load raw data and filter by date
      const { data: rawData, error: rawError } = await supabase
        .from('dimension_data')
        .select('*')
        .eq('report_id', reportId)
        .order('row_number', { ascending: true })
        .range(offset, offset + limit - 1);

      if (rawError) throw rawError;

      // Filter by month client-side (temporary solution)
      const filteredData = (rawData || []).filter(row => {
        const values = row.dimension_values as Record<string, any>;
        const dateValue = Object.values(values).find(value => 
          value && typeof value === 'string' && !isNaN(Date.parse(value))
        );
        
        if (dateValue) {
          try {
            const date = new Date(dateValue);
            return date.getFullYear() === year && date.getMonth() === month - 1;
          } catch (e) {
            return false;
          }
        }
        return false;
      });

      return filteredData;
    } catch (error) {
      console.error('Error getting monthly data:', error);
      return [];
    }
  }

  /**
   * Trigger monthly aggregation for a report
   */
  static async aggregateMonthlyData(reportId: string, dataSourceId?: string, forceRefresh = false): Promise<boolean> {
    try {
      console.log(`[MonthlyDataService] Triggering aggregation for report: ${reportId}`);

      const { data, error } = await supabase.functions.invoke('aggregate-monthly-data', {
        body: {
          reportId,
          dataSourceId,
          forceRefresh
        }
      });

      if (error) {
        console.error('[MonthlyDataService] Aggregation error:', error);
        return false;
      }

      console.log('[MonthlyDataService] Aggregation completed:', data);
      return true;
    } catch (error) {
      console.error('[MonthlyDataService] Error triggering aggregation:', error);
      return false;
    }
  }

  /**
   * Get monthly data statistics for overview
   */
  static async getDataOverview(reportId: string): Promise<{
    totalRows: number;
    monthCount: number;
    dateRange: { start: string; end: string } | null;
    lastSync: string | null;
  }> {
    try {
      // Get total rows from dimension_data
      const { count: totalRows, error: countError } = await supabase
        .from('dimension_data')
        .select('id', { count: 'exact', head: true })
        .eq('report_id', reportId);

      if (countError) throw countError;

      // Get monthly summaries
      const monthlyData = await this.getAvailableMonths(reportId);
      
      let dateRange = null;
      let lastSync = null;

      if (monthlyData.length > 0) {
        const sortedMonths = monthlyData.sort((a, b) => {
          const dateA = new Date(a.year, a.month - 1);
          const dateB = new Date(b.year, b.month - 1);
          return dateA.getTime() - dateB.getTime();
        });

        dateRange = {
          start: sortedMonths[0].dateRangeStart,
          end: sortedMonths[sortedMonths.length - 1].dateRangeEnd
        };

        lastSync = sortedMonths.reduce((latest, month) => {
          return !latest || month.lastUpdated > latest ? month.lastUpdated : latest;
        }, null as string | null);
      }

      return {
        totalRows: totalRows || 0,
        monthCount: monthlyData.length,
        dateRange,
        lastSync
      };
    } catch (error) {
      console.error('Error getting data overview:', error);
      return {
        totalRows: 0,
        monthCount: 0,
        dateRange: null,
        lastSync: null
      };
    }
  }

  /**
   * Export monthly data as CSV
   */
  static async exportMonthlyData(
    reportId: string, 
    year: number, 
    month: number, 
    dimensions: any[],
    filename?: string
  ): Promise<boolean> {
    try {
      const data = await this.getMonthlyData({ reportId, year, month, limit: 10000 });
      
      if (data.length === 0) {
        console.warn('[MonthlyDataService] No data to export');
        return false;
      }

      // Create CSV content
      const headers = ['Row Number', 'Date', ...dimensions.map(d => d.name)];
      const csvContent = [
        headers.join(','),
        ...data.map(row => {
          const values = row.dimension_values as Record<string, any>;
          const rowData = [
            row.row_number,
            // Find date value
            Object.values(values).find(value => 
              value && typeof value === 'string' && !isNaN(Date.parse(value))
            ) || '',
            // Map dimension values
            ...dimensions.map(dim => {
              const value = values[dim.id] || '';
              // Escape commas and quotes for CSV
              return typeof value === 'string' && value.includes(',') 
                ? `"${value.replace(/"/g, '""')}"` 
                : value;
            })
          ];
          return rowData.join(',');
        })
      ].join('\n');

      // Download CSV
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `data-${year}-${String(month).padStart(2, '0')}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      return true;
    } catch (error) {
      console.error('Error exporting monthly data:', error);
      return false;
    }
  }

  /**
   * Check if monthly aggregation is needed
   */
  static async needsAggregation(reportId: string): Promise<boolean> {
    try {
      // Check if we have recent monthly data
      const { data: monthlyData, error } = await supabase
        .from('monthly_dimension_data')
        .select('updated_at')
        .eq('report_id', reportId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      // Check last sync of raw data
      const { data: syncData, error: syncError } = await supabase
        .from('data_sources')
        .select('updated_at')
        .eq('report_id', reportId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (syncError) throw syncError;

      // Need aggregation if:
      // 1. No monthly data exists, OR
      // 2. Raw data is newer than monthly data
      if (!monthlyData) return true;
      if (!syncData) return false;

      const monthlyDate = new Date(monthlyData.updated_at);
      const syncDate = new Date(syncData.updated_at);

      return syncDate > monthlyDate;
    } catch (error) {
      console.error('Error checking aggregation needs:', error);
      return true; // Default to needing aggregation
    }
  }
}
