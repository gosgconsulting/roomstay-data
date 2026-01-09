/**
 * Helper functions for refreshing pivot data
 * Extracted from handleRefreshPivotData to improve modularity, testability, and performance
 */

import { format, subMonths, subYears } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { fetchSourceData, type SourceDataResult } from "@/hooks/dataSources/useSourceData";
import { 
  getDateRange, 
  getComparisonDateRange, 
  getDateGroupKey, 
  parseDate,
  aggregateMetrics,
  type CachedPivotData,
  type DateBreakdownRow,
} from "@/components/AISummaryPivotTable";
import type { QueryClient } from "@tanstack/react-query";
import { aiSummaryKeys } from "@/hooks/useAISummaryData";

// Type definitions
export interface Report {
  id: string;
  name: string;
}

export interface DataSource {
  id: string;
  report_id: string;
  name: string;
  source_type: "google_sheets" | "csv_url";
  spreadsheet_id: string | null;
  google_sheets_url: string | null;
  csv_url: string | null;
  tab_name: string | null;
  header_row: number;
  column_mappings: any[] | null;
}

export interface ReportsAndSourcesMap extends Map<string, { report: Report; dataSource: DataSource }> {}

export interface MetricMappings {
  metricNameToIdMap: Record<string, string>;
  dimIdToColumnHeader: Record<string, string>;
}

export interface DimensionFilter {
  dimensionId: string;
  dimensionName?: string;
  values: string[];
}

export interface ReportPivotResult {
  reportId: string;
  reportName: string;
  mtd: Array<{ reportId: string; reportName: string; metrics: Record<string, number> }>;
  ytd: Array<{ reportId: string; reportName: string; metrics: Record<string, number> }>;
  monthly_data: Record<string, Array<{ reportId: string; reportName: string; metrics: Record<string, number> }>>;
  breakdown_data: Record<string, Record<string, Array<{ groupValue: string; metrics: Record<string, number> }>>>;
  breakdown_dimension_names: Record<string, string>;
  combined_date_breakdown_rows: any[];
  metricNameToIdMap: Record<string, string>;
  actualDataRange: { reportName: string; firstDate: Date | null; lastDate: Date | null };
  comparison_previous_period: {
    mtd: Array<{ reportId: string; reportName: string; metrics: Record<string, number> }>;
    ytd: Array<{ reportId: string; reportName: string; metrics: Record<string, number> }>;
    monthly_data: Record<string, Array<{ reportId: string; reportName: string; metrics: Record<string, number> }>>;
    breakdown_data?: Record<string, Record<string, Array<{ groupValue: string; metrics: Record<string, number> }>>>;
  };
  comparison_previous_year: {
    mtd: Array<{ reportId: string; reportName: string; metrics: Record<string, number> }>;
    ytd: Array<{ reportId: string; reportName: string; metrics: Record<string, number> }>;
    monthly_data: Record<string, Array<{ reportId: string; reportName: string; metrics: Record<string, number> }>>;
    breakdown_data?: Record<string, Record<string, Array<{ groupValue: string; metrics: Record<string, number> }>>>;
  };
}

export interface ReportBudgetResult {
  reportId: string;
  monthlyMetrics: Record<string, { cost: number; revenue: number }>;
}

export interface ReportResult {
  reportId: string;
  success: boolean;
  error?: string;
  pivot?: ReportPivotResult;
  budget?: ReportBudgetResult;
  actualDataRange?: { reportName: string; firstDate: Date | null; lastDate: Date | null };
}

/**
 * Batch fetch all reports and data sources in parallel
 */
export async function fetchReportsAndDataSources(
  reportIds: string[]
): Promise<ReportsAndSourcesMap> {
  if (reportIds.length === 0) {
    return new Map();
  }

  // Batch fetch all reports
  const { data: reports, error: reportsError } = await supabase
    .from("reports")
    .select("id, name")
    .in("id", reportIds);

  if (reportsError) {
    console.error("Error fetching reports:", reportsError);
    return new Map();
  }

  if (!reports || reports.length === 0) {
    return new Map();
  }

  // Batch fetch all data sources
  const { data: dataSources, error: dataSourcesError } = await supabase
    .from("data_sources")
    .select("*")
    .in("report_id", reportIds);

  if (dataSourcesError) {
    console.error("Error fetching data sources:", dataSourcesError);
    return new Map();
  }

  // Create a map for quick lookup
  const result = new Map<string, { report: Report; dataSource: DataSource }>();
  const dataSourceMap = new Map(dataSources?.map(ds => [ds.report_id, ds as DataSource]) || []);

  reports.forEach(report => {
    const dataSource = dataSourceMap.get(report.id);
    if (dataSource) {
      result.set(report.id, { report: report as Report, dataSource });
    }
  });

  return result;
}

/**
 * Build metric name to ID and dimension ID to column header mappings
 */
export function buildMetricMappings(columnMappings: any[]): MetricMappings {
  const metricNameToIdMap: Record<string, string> = {};
  const dimIdToColumnHeader: Record<string, string> = {};

  columnMappings.forEach((m: any) => {
    if (m.dimensionName && m.dimensionId && m.dimensionId !== 'none') {
      metricNameToIdMap[m.dimensionName] = m.dimensionId;
    }
    if (m.dimensionId && m.dimensionId !== 'none' && m.columnHeader) {
      dimIdToColumnHeader[m.dimensionId] = m.columnHeader;
    }
  });

  return { metricNameToIdMap, dimIdToColumnHeader };
}

/**
 * Generate month keys array from sinceDate to endDate
 */
export function generateMonthKeys(sinceDate: Date, endDate: Date): string[] {
  const monthKeys: string[] = [];
  let currentIterDate = new Date(sinceDate.getFullYear(), sinceDate.getMonth(), 1);
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), 1);
  
  while (currentIterDate <= end) {
    monthKeys.push(format(currentIterDate, "yyyy-MM"));
    currentIterDate = new Date(currentIterDate.getFullYear(), currentIterDate.getMonth() + 1, 1);
  }
  
  return monthKeys;
}

/**
 * Build date range map for all tabs (mtd, ytd, and each month)
 */
export function buildDateRanges(dateTabs: string[]): Record<string, { start: Date; end: Date }> {
  const dateRanges: Record<string, { start: Date; end: Date }> = {};
  dateTabs.forEach(tab => {
    dateRanges[tab] = getDateRange(tab as any);
  });
  return dateRanges;
}

/**
 * Extract date from row data (handles both flat and nested dimension_values)
 */
export function getRowDateHelper(row: any): Date | null {
  const rowData = row.dimension_values || row;
  let dateValue = rowData.Date || rowData.date || rowData.Day || rowData.day;
  
  if (!dateValue) {
    for (const [key, val] of Object.entries(rowData)) {
      if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) {
        dateValue = val as string;
        break;
      }
    }
  }
  
  return parseDate(dateValue);
}

/**
 * Calculate dynamic comparison range based on actual data dates
 */
export function getDynamicComparisonRange(
  rows: any[],
  periodRange: { start: Date; end: Date },
  comparisonType: "previous_period" | "previous_year"
): { start: Date; end: Date } | null {
  // Find actual data dates within the period
  const datesInPeriod = rows
    .map((row: any) => getRowDateHelper(row))
    .filter((d: Date | null): d is Date => d !== null && d >= periodRange.start && d <= periodRange.end)
    .sort((a: Date, b: Date) => a.getTime() - b.getTime());
  
  if (datesInPeriod.length === 0) {
    // Fallback to theoretical range
    const tab: string = periodRange.start.toISOString().substring(0, 7) === format(new Date(), "yyyy-MM") ? "mtd" : periodRange.start.toISOString().substring(0, 7);
    return getComparisonDateRange(
      tab as any,
      comparisonType
    );
  }
  
  const actualStart = datesInPeriod[0];
  const actualEnd = datesInPeriod[datesInPeriod.length - 1];
  
  if (comparisonType === "previous_period") {
    // Same-day matching for previous period (month before)
    return {
      start: subMonths(actualStart, 1),
      end: subMonths(actualEnd, 1),
    };
  } else {
    // Same-day matching for previous year
    return {
      start: subYears(actualStart, 1),
      end: subYears(actualEnd, 1),
    };
  }
}

/**
 * Get breakdown value from row data
 */
export function getBreakdownValue(
  rowData: any,
  dimId: string,
  dimName: string,
  dimIdToColumnHeader: Record<string, string>
): string | undefined {
  // Try dimension ID first
  if (rowData[dimId] !== undefined && rowData[dimId] !== null && rowData[dimId] !== '') {
    return String(rowData[dimId]);
  }
  // Try dimension name
  if (dimName && rowData[dimName] !== undefined && rowData[dimName] !== null && rowData[dimName] !== '') {
    return String(rowData[dimName]);
  }
  // Try column header from mappings
  const columnHeader = dimIdToColumnHeader[dimId];
  if (columnHeader && rowData[columnHeader] !== undefined && rowData[columnHeader] !== null && rowData[columnHeader] !== '') {
    return String(rowData[columnHeader]);
  }
  return undefined;
}

/**
 * Fetch dimension filter for a report
 */
export async function fetchDimensionFilter(
  filterConfig: any
): Promise<DimensionFilter | undefined> {
  if (!filterConfig?.dimensionId || !filterConfig.selectedValues?.length) {
    return undefined;
  }

  const { data: dimData } = await supabase
    .from("dimensions")
    .select("name")
    .eq("id", filterConfig.dimensionId)
    .single();

  return {
    dimensionId: filterConfig.dimensionId,
    dimensionName: dimData?.name,
    values: filterConfig.selectedValues,
  };
}

/**
 * Process pivot data for a single report
 */
export async function processReportPivotData(
  reportId: string,
  report: Report,
  dataSource: DataSource,
  sourceData: SourceDataResult,
  card: {
    selected_metrics: string[];
    report_configs: Record<string, any>;
  },
  dateRanges: Record<string, { start: Date; end: Date }>,
  allDateTabs: string[],
  monthKeys: string[],
  user: { id: string },
  accountId?: string
): Promise<ReportPivotResult> {
  const { breakdown_configs, ...filterConfigs } = card.report_configs as any;
  const filterConfig = filterConfigs[reportId];

  // Build metric mappings
  const columnMappings = Array.isArray(dataSource.column_mappings) ? dataSource.column_mappings : [];
  const { metricNameToIdMap, dimIdToColumnHeader } = buildMetricMappings(columnMappings);

  // Track actual date range for this report
  const allDates = sourceData.transformedRows
    .map((row: any) => getRowDateHelper(row))
    .filter((d: Date | null): d is Date => d !== null)
    .sort((a: Date, b: Date) => a.getTime() - b.getTime());

  const actualDataRange = {
    reportName: report.name,
    firstDate: allDates.length > 0 ? allDates[0] : null,
    lastDate: allDates.length > 0 ? allDates[allDates.length - 1] : null,
  };

  // Get dimension filter
  const dimensionFilter = await fetchDimensionFilter(filterConfig);

  // Initialize result structures
  const mtd: Array<{ reportId: string; reportName: string; metrics: Record<string, number> }> = [];
  const ytd: Array<{ reportId: string; reportName: string; metrics: Record<string, number> }> = [];
  const monthly_data: Record<string, Array<{ reportId: string; reportName: string; metrics: Record<string, number> }>> = {};
  const breakdownData: Record<string, Record<string, Array<{ groupValue: string; metrics: Record<string, number> }>>> = {};
  const breakdownDimensionNames: Record<string, string> = {};
  const comparisonPreviousPeriod = {
    mtd: [] as Array<{ reportId: string; reportName: string; metrics: Record<string, number> }>,
    ytd: [] as Array<{ reportId: string; reportName: string; metrics: Record<string, number> }>,
    monthly_data: {} as Record<string, Array<{ reportId: string; reportName: string; metrics: Record<string, number> }>>,
    breakdown_data: {} as Record<string, Record<string, Array<{ groupValue: string; metrics: Record<string, number> }>>>,
  };
  const comparisonPreviousYear = {
    mtd: [] as Array<{ reportId: string; reportName: string; metrics: Record<string, number> }>,
    ytd: [] as Array<{ reportId: string; reportName: string; metrics: Record<string, number> }>,
    monthly_data: {} as Record<string, Array<{ reportId: string; reportName: string; metrics: Record<string, number> }>>,
    breakdown_data: {} as Record<string, Record<string, Array<{ groupValue: string; metrics: Record<string, number> }>>>,
  };

  // Initialize monthly data
  monthKeys.forEach(monthKey => {
    monthly_data[monthKey] = [];
    comparisonPreviousPeriod.monthly_data[monthKey] = [];
    comparisonPreviousYear.monthly_data[monthKey] = [];
  });

  // Aggregate metrics for each date range (mtd, ytd, and each month)
  allDateTabs.forEach((tab) => {
    const metrics = aggregateMetrics(
      sourceData.transformedRows,
      card.selected_metrics,
      dateRanges[tab],
      dimensionFilter,
      metricNameToIdMap
    );

    const reportEntry = {
      reportId: report.id,
      reportName: report.name,
      metrics,
    };

    // Store in appropriate location
    if (tab === "mtd") {
      mtd.push(reportEntry);
    } else if (tab === "ytd") {
      ytd.push(reportEntry);
    } else {
      monthly_data[tab].push(reportEntry);
    }
    
    // Compute comparison data - Previous Period
    const prevPeriodRange = getDynamicComparisonRange(
      sourceData.transformedRows,
      dateRanges[tab],
      "previous_period"
    );
    if (prevPeriodRange) {
      const prevPeriodMetrics = aggregateMetrics(
        sourceData.transformedRows,
        card.selected_metrics,
        prevPeriodRange,
        dimensionFilter,
        metricNameToIdMap
      );
      const compEntry = {
        reportId: report.id,
        reportName: report.name,
        metrics: prevPeriodMetrics,
      };
      if (tab === "mtd") {
        comparisonPreviousPeriod.mtd.push(compEntry);
      } else if (tab === "ytd") {
        comparisonPreviousPeriod.ytd.push(compEntry);
      } else {
        comparisonPreviousPeriod.monthly_data[tab].push(compEntry);
      }
    }
    
    // Compute comparison data - Previous Year
    const prevYearRange = getDynamicComparisonRange(
      sourceData.transformedRows,
      dateRanges[tab],
      "previous_year"
    );
    if (prevYearRange) {
      const prevYearMetrics = aggregateMetrics(
        sourceData.transformedRows,
        card.selected_metrics,
        prevYearRange,
        dimensionFilter,
        metricNameToIdMap
      );
      const compEntry = {
        reportId: report.id,
        reportName: report.name,
        metrics: prevYearMetrics,
      };
      if (tab === "mtd") {
        comparisonPreviousYear.mtd.push(compEntry);
      } else if (tab === "ytd") {
        comparisonPreviousYear.ytd.push(compEntry);
      } else {
        comparisonPreviousYear.monthly_data[tab].push(compEntry);
      }
    }
  });

  // Build breakdown data if configured
  const breakdownConfig = breakdown_configs?.[reportId];
  const breakdownDimensionIds = breakdownConfig?.breakdownDimensionIds || 
    (breakdownConfig?.breakdownDimensionId ? [breakdownConfig.breakdownDimensionId] : []);

  // Filter rows by dimension filter for breakdown processing
  const filteredByDimension = sourceData.transformedRows.filter((row: any) => {
    if (!dimensionFilter || dimensionFilter.values.length === 0) return true;
    const rowData = row.dimension_values || row;
    const dimVal = rowData[dimensionFilter.dimensionId] || 
                   (dimensionFilter.dimensionName ? rowData[dimensionFilter.dimensionName] : undefined);
    return dimVal !== undefined && dimensionFilter.values.includes(String(dimVal));
  });

  for (const breakdownDimId of breakdownDimensionIds) {
    const { data: breakdownDimData } = await supabase
      .from("dimensions")
      .select("name")
      .eq("id", breakdownDimId)
      .single();
    
    const breakdownDimName = breakdownDimData?.name || 'Group';
    const breakdownKey = `${reportId}_${breakdownDimId}`;
    breakdownDimensionNames[breakdownKey] = breakdownDimName;

    // Get unique values for this breakdown dimension
    const uniqueValues = new Set<string>();
    let hasUncategorized = false;
    
    filteredByDimension.forEach((row: any) => {
      const rowData = row.dimension_values || row;
      const val = getBreakdownValue(rowData, breakdownDimId, breakdownDimName, dimIdToColumnHeader);
      if (val !== undefined) {
        uniqueValues.add(val);
      } else {
        hasUncategorized = true;
      }
    });

    // Initialize breakdown data for all date tabs
    breakdownData[breakdownKey] = {};
    allDateTabs.forEach(tab => {
      breakdownData[breakdownKey][tab] = [];
      if (!comparisonPreviousPeriod.breakdown_data[breakdownKey]) {
        comparisonPreviousPeriod.breakdown_data[breakdownKey] = {};
      }
      if (!comparisonPreviousYear.breakdown_data[breakdownKey]) {
        comparisonPreviousYear.breakdown_data[breakdownKey] = {};
      }
      comparisonPreviousPeriod.breakdown_data[breakdownKey][tab] = [];
      comparisonPreviousYear.breakdown_data[breakdownKey][tab] = [];
    });
    
    allDateTabs.forEach((tab) => {
      // Process each named group
      uniqueValues.forEach((groupValue) => {
        const groupRows = filteredByDimension.filter((row: any) => {
          const rowData = row.dimension_values || row;
          const groupVal = getBreakdownValue(rowData, breakdownDimId, breakdownDimName, dimIdToColumnHeader);
          return groupVal === groupValue;
        });
        
        // Main metrics
        const metrics = aggregateMetrics(
          groupRows,
          card.selected_metrics,
          dateRanges[tab],
          undefined,
          metricNameToIdMap
        );

        breakdownData[breakdownKey][tab].push({
          groupValue,
          metrics,
        });
        
        // Comparison - Previous Period
        const breakdownPrevPeriodRange = getDynamicComparisonRange(
          groupRows,
          dateRanges[tab],
          "previous_period"
        );
        if (breakdownPrevPeriodRange) {
          const prevPeriodMetrics = aggregateMetrics(
            groupRows,
            card.selected_metrics,
            breakdownPrevPeriodRange,
            undefined,
            metricNameToIdMap
          );
          comparisonPreviousPeriod.breakdown_data![breakdownKey][tab].push({
            groupValue,
            metrics: prevPeriodMetrics,
          });
        }
        
        // Comparison - Previous Year
        const breakdownPrevYearRange = getDynamicComparisonRange(
          groupRows,
          dateRanges[tab],
          "previous_year"
        );
        if (breakdownPrevYearRange) {
          const prevYearMetrics = aggregateMetrics(
            groupRows,
            card.selected_metrics,
            breakdownPrevYearRange,
            undefined,
            metricNameToIdMap
          );
          comparisonPreviousYear.breakdown_data![breakdownKey][tab].push({
            groupValue,
            metrics: prevYearMetrics,
          });
        }
      });
      
      // Add Uncategorized group
      if (hasUncategorized) {
        const uncategorizedRows = filteredByDimension.filter((row: any) => {
          const rowData = row.dimension_values || row;
          const val = getBreakdownValue(rowData, breakdownDimId, breakdownDimName, dimIdToColumnHeader);
          return val === undefined;
        });
        
        const metrics = aggregateMetrics(
          uncategorizedRows,
          card.selected_metrics,
          dateRanges[tab],
          undefined,
          metricNameToIdMap
        );

        breakdownData[breakdownKey][tab].push({
          groupValue: 'Uncategorized',
          metrics,
        });
        
        // Comparison for Uncategorized - Previous Period
        const uncatPrevPeriodRange = getDynamicComparisonRange(
          uncategorizedRows,
          dateRanges[tab],
          "previous_period"
        );
        if (uncatPrevPeriodRange) {
          const prevPeriodMetrics = aggregateMetrics(
            uncategorizedRows,
            card.selected_metrics,
            uncatPrevPeriodRange,
            undefined,
            metricNameToIdMap
          );
          comparisonPreviousPeriod.breakdown_data![breakdownKey][tab].push({
            groupValue: 'Uncategorized',
            metrics: prevPeriodMetrics,
          });
        }
        
        // Comparison for Uncategorized - Previous Year
        const uncatPrevYearRange = getDynamicComparisonRange(
          uncategorizedRows,
          dateRanges[tab],
          "previous_year"
        );
        if (uncatPrevYearRange) {
          const prevYearMetrics = aggregateMetrics(
            uncategorizedRows,
            card.selected_metrics,
            uncatPrevYearRange,
            undefined,
            metricNameToIdMap
          );
          comparisonPreviousYear.breakdown_data![breakdownKey][tab].push({
            groupValue: 'Uncategorized',
            metrics: prevYearMetrics,
          });
        }
      }
    });
  }

  // Collect rows for combined date breakdown
  const baseRows = sourceData.transformedRows.filter((row: any) => {
    if (!dimensionFilter || dimensionFilter.values.length === 0) return true;
    const rowData = row.dimension_values || row;
    const dimVal = rowData[dimensionFilter.dimensionId] || 
                   (dimensionFilter.dimensionName ? rowData[dimensionFilter.dimensionName] : undefined);
    return dimVal !== undefined && dimensionFilter.values.includes(String(dimVal));
  });

  return {
    reportId: report.id,
    reportName: report.name,
    mtd,
    ytd,
    monthly_data: monthly_data,
    breakdown_data: breakdownData,
    breakdown_dimension_names: breakdownDimensionNames,
    combined_date_breakdown_rows: baseRows,
    metricNameToIdMap,
    actualDataRange,
    comparison_previous_period: comparisonPreviousPeriod,
    comparison_previous_year: comparisonPreviousYear,
  };
}

/**
 * Process budget data for a single report (reuses source data)
 * Processes ALL years found in the data, not just the current year
 */
export async function processReportBudgetData(
  reportId: string,
  dataSource: DataSource,
  sourceData: SourceDataResult,
  filterConfig: any
): Promise<ReportBudgetResult> {
  const monthlyMetrics: Record<string, { cost: number; revenue: number }> = {};

  // Build metric mappings
  const columnMappings = Array.isArray(dataSource.column_mappings) ? dataSource.column_mappings : [];
  const { metricNameToIdMap, dimIdToColumnHeader } = buildMetricMappings(columnMappings);

  // Get dimension filter
  const dimensionFilter = await fetchDimensionFilter(filterConfig);

  // Helper to get dimension value
  const getDimensionValue = (rowData: any, dimId: string, dimName?: string): string | undefined => {
    if (rowData[dimId] !== undefined && rowData[dimId] !== null && rowData[dimId] !== '') {
      return String(rowData[dimId]);
    }
    if (dimName && rowData[dimName] !== undefined && rowData[dimName] !== null && rowData[dimName] !== '') {
      return String(rowData[dimName]);
    }
    const columnHeader = dimIdToColumnHeader[dimId];
    if (columnHeader && rowData[columnHeader] !== undefined && rowData[columnHeader] !== null && rowData[columnHeader] !== '') {
      return String(rowData[columnHeader]);
    }
    return undefined;
  };

  sourceData.transformedRows.forEach((row: any) => {
    const rowData = row.dimension_values || row;

    // Apply dimension filter
    if (dimensionFilter) {
      const filterValue = getDimensionValue(rowData, dimensionFilter.dimensionId, dimensionFilter.dimensionName);
      if (!filterValue || !dimensionFilter.values.includes(filterValue)) {
        return;
      }
    }

    // Find date value
    let dateValue = rowData.Date || rowData.date || rowData.Day || rowData.day;
    if (!dateValue) {
      for (const [key, val] of Object.entries(rowData)) {
        if (typeof val === "string" && val.match(/^\d{4}-\d{2}-\d{2}/)) {
          dateValue = val as string;
          break;
        }
      }
    }

    if (!dateValue) return;

    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return;
    
    // Use the actual year from the date, not a filtered year
    // This allows caching data for all years (2025, 2026, etc.)
    const year = date.getFullYear();
    const monthKey = `${year}-${String(date.getMonth() + 1).padStart(2, "0")}`;

    if (!monthlyMetrics[monthKey]) {
      monthlyMetrics[monthKey] = { cost: 0, revenue: 0 };
    }

    // Get Cost
    const costId = metricNameToIdMap["Cost"];
    const costValue = parseFloat(
      rowData[costId] || 
      rowData["Cost"] || 
      rowData["cost"] || 
      rowData["Spend"] || 
      rowData["spend"] ||
      rowData["Amount spent"] ||
      rowData["Amount Spent"] ||
      0
    );
    if (!isNaN(costValue)) {
      monthlyMetrics[monthKey].cost += costValue;
    }

    // Get Revenue
    const revenueId = metricNameToIdMap["Revenue"];
    const revenueValue = parseFloat(
      rowData[revenueId] || 
      rowData["Revenue"] || 
      rowData["revenue"] ||
      rowData["Conversion value"] ||
      rowData["Purchase value"] ||
      0
    );
    if (!isNaN(revenueValue)) {
      monthlyMetrics[monthKey].revenue += revenueValue;
    }
  });

  return {
    reportId,
    monthlyMetrics,
  };
}

/**
 * Aggregate pivot results from all reports
 */
export function aggregatePivotResults(
  results: ReportPivotResult[],
  monthKeys: string[],
  selectedMetrics: string[]
): CachedPivotData {
  const pivotData: CachedPivotData = {
    mtd: [],
    ytd: [],
    monthly_data: {},
  };

  // Initialize monthly_data
  monthKeys.forEach(monthKey => {
    pivotData.monthly_data![monthKey] = [];
  });

  const breakdownData: Record<string, Record<string, Array<{ groupValue: string; metrics: Record<string, number> }>>> = {};
  const breakdownDimensionNames: Record<string, string> = {};
  const combinedDateBreakdown: Record<string, DateBreakdownRow[]> = {
    mtd: [],
    ytd: []
  };
  const comparisonPreviousPeriod: any = {
    mtd: [],
    ytd: [],
    monthly_data: {},
    breakdown_data: {}
  };
  const comparisonPreviousYear: any = {
    mtd: [],
    ytd: [],
    monthly_data: {},
    breakdown_data: {}
  };
  const actualDataRanges: Record<string, { reportName: string; firstDate: string | null; lastDate: string | null }> = {};

  // Initialize comparison monthly data
  monthKeys.forEach(monthKey => {
    combinedDateBreakdown[monthKey] = [];
    comparisonPreviousPeriod.monthly_data[monthKey] = [];
    comparisonPreviousYear.monthly_data[monthKey] = [];
  });

  // Merge all rows for combined date breakdown
  const allRowsForDateBreakdown: any[] = [];
  const allMetricNameToIdMaps: Record<string, string>[] = [];

  results.forEach(result => {
    // Aggregate main metrics
    pivotData.mtd.push(...result.mtd);
    pivotData.ytd.push(...result.ytd);
    monthKeys.forEach(monthKey => {
      if (result.monthly_data[monthKey]) {
        pivotData.monthly_data![monthKey].push(...result.monthly_data[monthKey]);
      }
    });

    // Aggregate breakdown data
    Object.assign(breakdownData, result.breakdown_data);
    Object.assign(breakdownDimensionNames, result.breakdown_dimension_names);

    // Aggregate comparison data
    comparisonPreviousPeriod.mtd.push(...result.comparison_previous_period.mtd);
    comparisonPreviousPeriod.ytd.push(...result.comparison_previous_period.ytd);
    monthKeys.forEach(monthKey => {
      if (result.comparison_previous_period.monthly_data[monthKey]) {
        comparisonPreviousPeriod.monthly_data[monthKey].push(...result.comparison_previous_period.monthly_data[monthKey]);
      }
    });
    if (result.comparison_previous_period.breakdown_data) {
      Object.assign(comparisonPreviousPeriod.breakdown_data, result.comparison_previous_period.breakdown_data);
    }

    comparisonPreviousYear.mtd.push(...result.comparison_previous_year.mtd);
    comparisonPreviousYear.ytd.push(...result.comparison_previous_year.ytd);
    monthKeys.forEach(monthKey => {
      if (result.comparison_previous_year.monthly_data[monthKey]) {
        comparisonPreviousYear.monthly_data[monthKey].push(...result.comparison_previous_year.monthly_data[monthKey]);
      }
    });
    if (result.comparison_previous_year.breakdown_data) {
      Object.assign(comparisonPreviousYear.breakdown_data, result.comparison_previous_year.breakdown_data);
    }

    // Collect rows and metric maps for combined date breakdown
    allRowsForDateBreakdown.push(...result.combined_date_breakdown_rows);
    allMetricNameToIdMaps.push(result.metricNameToIdMap);

    // Store actual data ranges
    actualDataRanges[result.reportId] = {
      reportName: result.actualDataRange.reportName,
      firstDate: result.actualDataRange.firstDate?.toISOString() || null,
      lastDate: result.actualDataRange.lastDate?.toISOString() || null,
    };
  });

  // Build combined date breakdown
  const mergedMetricMap: Record<string, string> = {};
  allMetricNameToIdMaps.forEach(map => Object.assign(mergedMetricMap, map));
  const dateDimId = mergedMetricMap['Date'] || mergedMetricMap['date'] || mergedMetricMap['Day'];
  const allDateTabs = ["mtd", "ytd", ...monthKeys];
  const dateRanges = buildDateRanges(allDateTabs);

  allDateTabs.forEach((tab) => {
    const dateRange = dateRanges[tab];
    const dateGroups: Record<string, { rows: any[], minDate: Date | null, maxDate: Date | null }> = {};
    
    allRowsForDateBreakdown.forEach((row: any) => {
      const rowData = row.dimension_values || row;
      let dateValue: any = rowData.Date || rowData.date || rowData.Day || rowData.day;
      if (!dateValue && dateDimId) {
        dateValue = rowData[dateDimId];
      }
      if (!dateValue) {
        for (const [key, val] of Object.entries(rowData)) {
          if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}/)) {
            dateValue = val;
            break;
          }
        }
      }
      
      const rowDate = parseDate(dateValue);
      if (!rowDate) return;
      if (rowDate < dateRange.start || rowDate > dateRange.end) return;
      
      const groupKey = getDateGroupKey(rowDate, tab as any);
      if (!dateGroups[groupKey]) {
        dateGroups[groupKey] = { rows: [], minDate: null, maxDate: null };
      }
      dateGroups[groupKey].rows.push(row);
      
      if (!dateGroups[groupKey].minDate || rowDate < dateGroups[groupKey].minDate) {
        dateGroups[groupKey].minDate = rowDate;
      }
      if (!dateGroups[groupKey].maxDate || rowDate > dateGroups[groupKey].maxDate) {
        dateGroups[groupKey].maxDate = rowDate;
      }
    });
    
    Object.entries(dateGroups).forEach(([dateGroup, groupData]) => {
      const metrics = aggregateMetrics(
        groupData.rows,
        selectedMetrics,
        dateRange,
        undefined,
        mergedMetricMap
      );
      
      combinedDateBreakdown[tab].push({
        dateGroup,
        dateRangeStart: groupData.minDate?.toISOString(),
        dateRangeEnd: groupData.maxDate?.toISOString(),
        metrics,
      });
    });
    
    combinedDateBreakdown[tab].sort((a, b) => 
      a.dateGroup.localeCompare(b.dateGroup)
    );
  });

  return {
    ...pivotData,
    breakdown_data: breakdownData,
    breakdown_dimension_names: breakdownDimensionNames,
    combined_date_breakdown: combinedDateBreakdown,
    comparison_previous_period: comparisonPreviousPeriod,
    comparison_previous_year: comparisonPreviousYear,
    actual_data_ranges: actualDataRanges,
  };
}

/**
 * Aggregate budget results from all reports
 */
export function aggregateBudgetResults(
  results: ReportBudgetResult[]
): Record<string, Record<string, { cost: number; revenue: number }>> {
  const cachedBudgetData: Record<string, Record<string, { cost: number; revenue: number }>> = {};
  
  results.forEach(result => {
    cachedBudgetData[result.reportId] = result.monthlyMetrics;
  });

  return cachedBudgetData;
}

/**
 * Centralize cache invalidation
 */
export function invalidateCaches(cardId: string, queryClient: QueryClient): void {
  // Raw source data (weekly/breakdown compute)
  queryClient.invalidateQueries({ queryKey: aiSummaryKeys.rawData(cardId) });
  // Budget metrics fallback
  queryClient.invalidateQueries({ queryKey: aiSummaryKeys.budgetMetrics(cardId) });
  // Budgets list for this card (partial match)
  queryClient.invalidateQueries({
    predicate: (q) => {
      const k = q.queryKey as unknown as any[];
      return Array.isArray(k) && k[0] === "ai-summary" && k[1] === "budgets" && k[2] === cardId;
    },
  });
  // Computed pivot data cache
  queryClient.invalidateQueries({
    predicate: (q) => {
      const k = q.queryKey as unknown as any[];
      return Array.isArray(k) && k[0] === "computed-pivot-data";
    },
  });
}

/**
 * Retry utility with exponential backoff
 */
export async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  delay = 1000
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt - 1)));
    }
  }
  throw new Error('Max retries exceeded');
}

