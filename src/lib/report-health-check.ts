import { supabase } from "@/integrations/supabase/client";

export interface ReportHealthStatus {
  reportId: string;
  reportName: string;
  status: 'healthy' | 'warning' | 'error';
  issues: string[];
  recommendations: string[];
  metrics: {
    dimensionCount: number;
    dataRowCount: number;
    dataSourceCount: number;
    lastSyncDate: string | null;
  };
}

export interface SystemHealthReport {
  overallStatus: 'healthy' | 'warning' | 'error';
  reportStatuses: ReportHealthStatus[];
  systemIssues: string[];
  timestamp: string;
}

/**
 * Comprehensive health check for a single report
 */
export async function checkReportHealth(reportId: string): Promise<ReportHealthStatus> {
  const healthStatus: ReportHealthStatus = {
    reportId,
    reportName: 'Unknown',
    status: 'healthy',
    issues: [],
    recommendations: [],
    metrics: {
      dimensionCount: 0,
      dataRowCount: 0,
      dataSourceCount: 0,
      lastSyncDate: null,
    },
  };

  try {
    // 1. Check if report exists and get basic info
    const { data: reportData, error: reportError } = await supabase
      .from('reports')
      .select('id, name, account_id, user_id, created_at')
      .eq('id', reportId)
      .single();

    if (reportError || !reportData) {
      healthStatus.status = 'error';
      healthStatus.issues.push('Report not found or inaccessible');
      return healthStatus;
    }

    healthStatus.reportName = reportData.name;

    // 2. Check dimensions
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const dimensionQueries = [
          // Account dimensions
          reportData.account_id ? supabase
            .from('dimensions')
            .select('id, name, type, scope')
            .eq('scope', 'account')
            .eq('account_id', reportData.account_id) : null,
          
          // Global dimensions
          supabase
            .from('dimensions')
            .select('id, name, type, scope')
            .eq('scope', 'global'),
          
          // Custom dimensions
          supabase
            .from('dimensions')
            .select('id, name, type, scope')
            .eq('user_id', user.id)
            .eq('scope', 'custom')
            .eq('report_id', reportId)
        ];

        const dimensionResults = await Promise.allSettled(
          dimensionQueries.filter(q => q !== null).map(q => q!)
        );

        let allDimensions: any[] = [];
        dimensionResults.forEach((result) => {
          if (result.status === 'fulfilled' && result.value.data) {
            allDimensions.push(...result.value.data);
          }
        });

        // Deduplicate by name
        const uniqueDimensions = allDimensions.filter((dim, index, arr) => 
          arr.findIndex(d => d.name.toLowerCase() === dim.name.toLowerCase()) === index
        );

        healthStatus.metrics.dimensionCount = uniqueDimensions.length;

        if (uniqueDimensions.length === 0) {
          healthStatus.status = 'error';
          healthStatus.issues.push('No dimensions found');
          healthStatus.recommendations.push('Create dimensions for this report');
        } else if (uniqueDimensions.length < 3) {
          healthStatus.status = 'warning';
          healthStatus.issues.push('Very few dimensions available');
          healthStatus.recommendations.push('Consider adding more dimensions for better analysis');
        }

        // Check for essential dimension types
        const hasDateDimension = uniqueDimensions.some(d => d.type === 'date');
        const hasNumericDimensions = uniqueDimensions.some(d => 
          d.type === 'number' || d.type === 'currency' || d.type === 'percentage'
        );

        if (!hasDateDimension) {
          healthStatus.status = 'warning';
          healthStatus.issues.push('No date dimension found');
          healthStatus.recommendations.push('Add a date dimension for time-based analysis');
        }

        if (!hasNumericDimensions) {
          healthStatus.status = 'warning';
          healthStatus.issues.push('No numeric dimensions found');
          healthStatus.recommendations.push('Add numeric dimensions (impressions, clicks, cost, etc.)');
        }
      }
    } catch (dimensionError) {
      healthStatus.issues.push(`Dimension check failed: ${dimensionError}`);
      if (healthStatus.status === 'healthy') healthStatus.status = 'warning';
    }

    // 3. Check data sources
    try {
      const { data: dataSources, error: dsError } = await supabase
        .from('data_sources')
        .select('id, name, source_type, last_synced_at, sync_frequency')
        .eq('report_id', reportId);

      if (dsError) {
        healthStatus.issues.push(`Data source check failed: ${dsError.message}`);
        if (healthStatus.status === 'healthy') healthStatus.status = 'warning';
      } else {
        healthStatus.metrics.dataSourceCount = dataSources?.length || 0;

        if (!dataSources || dataSources.length === 0) {
          healthStatus.status = 'error';
          healthStatus.issues.push('No data sources configured');
          healthStatus.recommendations.push('Add at least one data source');
        } else {
          // Check sync status
          const lastSyncDates = dataSources
            .map(ds => ds.last_synced_at)
            .filter(date => date)
            .sort()
            .reverse();

          if (lastSyncDates.length > 0) {
            healthStatus.metrics.lastSyncDate = lastSyncDates[0];
            
            const lastSync = new Date(lastSyncDates[0]);
            const daysSinceSync = (Date.now() - lastSync.getTime()) / (1000 * 60 * 60 * 24);
            
            if (daysSinceSync > 7) {
              healthStatus.status = 'warning';
              healthStatus.issues.push(`Data not synced for ${Math.floor(daysSinceSync)} days`);
              healthStatus.recommendations.push('Sync your data sources to get fresh data');
            }
          } else {
            healthStatus.status = 'warning';
            healthStatus.issues.push('Data sources have never been synced');
            healthStatus.recommendations.push('Sync your data sources to load data');
          }
        }
      }
    } catch (dataSourceError) {
      healthStatus.issues.push(`Data source check failed: ${dataSourceError}`);
      if (healthStatus.status === 'healthy') healthStatus.status = 'warning';
    }

    // 4. Check data rows
    try {
      const { count, error: countError } = await supabase
        .from('dimension_data')
        .select('*', { count: 'exact', head: true })
        .eq('report_id', reportId);

      if (countError) {
        healthStatus.issues.push(`Data count check failed: ${countError.message}`);
        if (healthStatus.status === 'healthy') healthStatus.status = 'warning';
      } else {
        healthStatus.metrics.dataRowCount = count || 0;

        if (count === 0) {
          healthStatus.status = 'error';
          healthStatus.issues.push('No data rows found');
          healthStatus.recommendations.push('Sync your data sources to load data');
        } else if (count < 10) {
          healthStatus.status = 'warning';
          healthStatus.issues.push('Very little data available');
          healthStatus.recommendations.push('Check if data sources are configured correctly');
        }
      }
    } catch (dataRowError) {
      healthStatus.issues.push(`Data row check failed: ${dataRowError}`);
      if (healthStatus.status === 'healthy') healthStatus.status = 'warning';
    }

    // 5. Check for common issues
    if (healthStatus.metrics.dimensionCount > 0 && healthStatus.metrics.dataRowCount > 0) {
      // Sample some data to check for dimension ID mismatches
      try {
        const { data: sampleData } = await supabase
          .from('dimension_data')
          .select('dimension_values')
          .eq('report_id', reportId)
          .limit(5);

        if (sampleData && sampleData.length > 0) {
          const dataUsedDimIds = new Set<string>();
          sampleData.forEach(row => {
            if (row.dimension_values) {
              Object.keys(row.dimension_values).forEach(dimId => {
                dataUsedDimIds.add(dimId);
              });
            }
          });

          if (dataUsedDimIds.size === 0) {
            healthStatus.status = 'error';
            healthStatus.issues.push('Data exists but no dimension values found');
            healthStatus.recommendations.push('Check data source configuration and re-sync');
          }
        }
      } catch (sampleError) {
        // Non-critical error, just log it
        console.warn('[HEALTH-CHECK] Sample data check failed:', sampleError);
      }
    }

  } catch (error) {
    healthStatus.status = 'error';
    healthStatus.issues.push(`Health check failed: ${error}`);
  }

  return healthStatus;
}

/**
 * Run health checks on all accessible reports
 */
export async function runSystemHealthCheck(): Promise<SystemHealthReport> {
  const healthReport: SystemHealthReport = {
    overallStatus: 'healthy',
    reportStatuses: [],
    systemIssues: [],
    timestamp: new Date().toISOString(),
  };

  try {
    // Get all accessible reports
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      healthReport.overallStatus = 'error';
      healthReport.systemIssues.push('User not authenticated');
      return healthReport;
    }

    const { data: reports, error: reportsError } = await supabase
      .from('reports')
      .select('id, name')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (reportsError) {
      healthReport.overallStatus = 'error';
      healthReport.systemIssues.push(`Failed to load reports: ${reportsError.message}`);
      return healthReport;
    }

    if (!reports || reports.length === 0) {
      healthReport.overallStatus = 'warning';
      healthReport.systemIssues.push('No reports found');
      return healthReport;
    }

    // Check health of each report
    const healthChecks = await Promise.allSettled(
      reports.map(report => checkReportHealth(report.id))
    );

    healthChecks.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        healthReport.reportStatuses.push(result.value);
        
        // Update overall status based on individual report status
        if (result.value.status === 'error' && healthReport.overallStatus !== 'error') {
          healthReport.overallStatus = 'error';
        } else if (result.value.status === 'warning' && healthReport.overallStatus === 'healthy') {
          healthReport.overallStatus = 'warning';
        }
      } else {
        healthReport.systemIssues.push(`Failed to check report ${reports[index].name}: ${result.reason}`);
        if (healthReport.overallStatus !== 'error') {
          healthReport.overallStatus = 'error';
        }
      }
    });

  } catch (error) {
    healthReport.overallStatus = 'error';
    healthReport.systemIssues.push(`System health check failed: ${error}`);
  }

  return healthReport;
}

/**
 * Log comprehensive health report to console
 */
export async function logSystemHealthReport(): Promise<void> {
  const healthReport = await runSystemHealthCheck();
  
  console.group(`🏥 SYSTEM HEALTH REPORT - ${healthReport.overallStatus.toUpperCase()}`);
  console.log('📊 Overall Status:', healthReport.overallStatus);
  console.log('📅 Timestamp:', healthReport.timestamp);
  
  if (healthReport.systemIssues.length > 0) {
    console.group('🚨 System Issues');
    healthReport.systemIssues.forEach(issue => console.error('❌', issue));
    console.groupEnd();
  }
  
  console.group(`📋 Report Status (${healthReport.reportStatuses.length} reports)`);
  healthReport.reportStatuses.forEach(report => {
    const statusIcon = report.status === 'healthy' ? '✅' : report.status === 'warning' ? '⚠️' : '❌';
    console.group(`${statusIcon} ${report.reportName} (${report.status})`);
    console.log('📏 Dimensions:', report.metrics.dimensionCount);
    console.log('📊 Data Rows:', report.metrics.dataRowCount);
    console.log('🔗 Data Sources:', report.metrics.dataSourceCount);
    console.log('🔄 Last Sync:', report.metrics.lastSyncDate || 'Never');
    
    if (report.issues.length > 0) {
      console.group('Issues');
      report.issues.forEach(issue => console.warn('⚠️', issue));
      console.groupEnd();
    }
    
    if (report.recommendations.length > 0) {
      console.group('Recommendations');
      report.recommendations.forEach(rec => console.info('💡', rec));
      console.groupEnd();
    }
    
    console.groupEnd();
  });
  console.groupEnd();
  
  console.groupEnd();
}